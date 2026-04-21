// Supabase Edge Function: Auto clock-out for Read Cafe
//
// Design:
// - Schedule this to run every 15 minutes (cron: "*/15 * * * *").
// - For each currently-open time_log belonging to Read Cafe, compute the
//   correct cutoff on that log's own clock_in NY date:
//       Every day -> 20:30 America/New_York
// - If NY wall-clock "now" is past that cutoff, close the log by writing
//   clock_out = cutoff (converted to UTC ISO), verified_by = "auto".
// - We never write new Date() as clock_out. A late run still produces a
//   correct historical cutoff, so clock_out can never land on a different
//   calendar day than clock_in.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.94.1";

export const config = {
  verify_jwt: false,
};

const DEFAULT_TIMEZONE = "America/New_York";

type NyParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayShort: string;
};

function getNyParts(date: Date, timeZone: string): NyParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    weekdayShort: map.weekday,
  };
}

function nyWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(
      Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0, 0),
    );
    const p = getNyParts(candidate, timeZone);
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    ) {
      return candidate;
    }
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0, 0));
}

function readCafeCutoffForClockIn(clockInIso: string, timeZone: string): Date {
  const ci = new Date(clockInIso);
  const p = getNyParts(ci, timeZone);
  // Read Cafe: every day at 20:30 NY
  return nyWallClockToUtc(p.year, p.month, p.day, 20, 30, timeZone);
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const timeZone = Deno.env.get("AUTO_CLOCKOUT_TZ") ?? DEFAULT_TIMEZONE;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing configuration", { status: 500 });
    }

    const url = new URL(req.url);
    const forceRun = url.searchParams.get("force_run") === "1";

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: openLogs, error: logsErr } = await serviceClient
      .from("time_logs")
      .select("id, user_id, work_location, clock_in")
      .is("clock_out", null);

    if (logsErr) {
      return new Response("Failed to load time logs", { status: 500 });
    }
    if (!openLogs || openLogs.length === 0) {
      return new Response("No open time logs", { status: 200 });
    }

    const userIds = [...new Set(openLogs.map((r) => r.user_id))];
    const { data: users, error: usersErr } = await serviceClient
      .from("users")
      .select("id, cafe_location")
      .in("id", userIds);

    if (usersErr || !users) {
      return new Response("Failed to load users", { status: 500 });
    }

    const cafeByUserId: Record<string, string | null> = {};
    for (const u of users as Array<{ id: string; cafe_location: string | null }>) {
      cafeByUserId[u.id] = u.cafe_location || null;
    }

    // Filter to Read Cafe logs:
    //   work_location = "Read Cafe"
    //   OR (work_location null AND user home cafe = "Read Cafe")  -- legacy safety net
    const readLogs = openLogs.filter((log) => {
      const wrk = log.work_location as string | null;
      const cafe = cafeByUserId[log.user_id];
      return wrk === "Read Cafe" || (wrk === null && cafe === "Read Cafe");
    });

    if (readLogs.length === 0) {
      return new Response("No Read Cafe open logs", { status: 200 });
    }

    const now = new Date();
    const toUpdate: Array<{ id: string; clock_out_iso: string }> = [];
    const notYetDue: string[] = [];

    for (const log of readLogs) {
      const cutoff = readCafeCutoffForClockIn(log.clock_in as string, timeZone);
      if (forceRun || now.getTime() >= cutoff.getTime()) {
        toUpdate.push({ id: log.id as string, clock_out_iso: cutoff.toISOString() });
      } else {
        notYetDue.push(log.id as string);
      }
    }

    if (toUpdate.length === 0) {
      return new Response(
        `No Read Cafe logs to close (not_yet_due=${notYetDue.length})`,
        { status: 200 },
      );
    }

    let updated = 0;
    const failures: Array<{ id: string; error: string }> = [];
    for (const row of toUpdate) {
      const { error: updErr } = await serviceClient
        .from("time_logs")
        .update({
          clock_out: row.clock_out_iso,
          verified_by: "auto",
        })
        .eq("id", row.id)
        .is("clock_out", null);
      if (updErr) {
        failures.push({ id: row.id, error: updErr.message });
      } else {
        updated++;
      }
    }

    await serviceClient.rpc("log_audit_event", {
      p_action: "auto_clock_out",
      p_performed_by: null,
      p_target_user: null,
      p_metadata: {
        cafe: "Read Cafe",
        updated,
        failures: failures.length,
        not_yet_due: notYetDue.length,
        time_zone: timeZone,
        force_run: forceRun,
      },
    });

    return new Response(
      JSON.stringify({
        updated,
        failures,
        not_yet_due: notYetDue.length,
        force_run: forceRun,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    return new Response(`Unhandled error: ${(error as Error).message}`, { status: 500 });
  }
});
