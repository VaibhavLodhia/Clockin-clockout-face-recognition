// Supabase Edge Function: Auto clock-out for Hodge Hall

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.94.1";

export const config = {
  verify_jwt: false,
};

const DEFAULT_TIMEZONE = "America/New_York";

function getLocalTimeParts(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const partMap: Record<string, string> = {};
  parts.forEach((part) => {
    partMap[part.type] = part.value;
  });

  return {
    weekday: partMap.weekday,
    hour: partMap.hour,
    minute: partMap.minute,
  };
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

    const { weekday, hour, minute } = getLocalTimeParts(timeZone);
    const time = `${hour}:${minute}`;

    let shouldRun =
      (["Mon", "Tue", "Wed", "Thu"].includes(weekday) && time === "19:30") ||
      (weekday === "Fri" && time === "15:30");
    if (forceRun) shouldRun = true;

    if (!shouldRun) {
      return new Response("No action needed", { status: 200 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Get all open time logs (no join)
    const { data: openLogs, error: logsErr } = await serviceClient
      .from("time_logs")
      .select("id, user_id, work_location")
      .is("clock_out", null);

    if (logsErr || !openLogs || openLogs.length === 0) {
      return new Response(openLogs?.length === 0 ? "No open time logs" : "Failed to load time logs", { status: 200 });
    }

    const userIds = [...new Set(openLogs.map((r: { user_id: string }) => r.user_id))];

    // 2) Get cafe_location for those users (separate query)
    const { data: users, error: usersErr } = await serviceClient
      .from("users")
      .select("id, cafe_location")
      .in("id", userIds);

    if (usersErr || !users) {
      return new Response("Failed to load users", { status: 500 });
    }

    const cafeByUserId: Record<string, string | null> = {};
    users.forEach((u: { id: string; cafe_location: string | null }) => {
      cafeByUserId[u.id] = u.cafe_location || null;
    });

    // 3) Hodge: clock out if work_location = 'Hodge Hall' OR (work_location null and user cafe = 'Hodge Hall')
    const hodgeLogIds: string[] = [];
    openLogs.forEach((log: { id: string; user_id: string; work_location: string | null }) => {
      const wrk = log.work_location;
      const cafe = cafeByUserId[log.user_id];
      if (wrk === "Hodge Hall" || (wrk === null && cafe === "Hodge Hall")) {
        hodgeLogIds.push(log.id);
      }
    });

    if (hodgeLogIds.length === 0) {
      return new Response("No Hodge Hall time logs to clock out", { status: 200 });
    }

    const { error: updateError, data: updatedLogs } = await serviceClient
      .from("time_logs")
      .update({
        clock_out: new Date().toISOString(),
        verified_by: "auto",
      })
      .in("id", hodgeLogIds)
      .select("id");

    const employeeIds = [...new Set(openLogs.filter((l: { id: string }) => hodgeLogIds.includes(l.id)).map((l: { user_id: string }) => l.user_id))];

    if (updateError) {
      return new Response("Failed to update time logs", { status: 500 });
    }

    await serviceClient.rpc("log_audit_event", {
      p_action: "auto_clock_out",
      p_performed_by: employeeIds[0] || null,
      p_target_user: null,
      p_metadata: {
        cafe: "Hodge Hall",
        updated: updatedLogs?.length || 0,
        time_zone: timeZone,
        time,
        weekday,
      },
    });

    const msg = `Auto clock-out complete: ${updatedLogs?.length || 0}${forceRun ? " (force_run test)" : ""}`;
    return new Response(msg, { status: 200 });
  } catch (_error) {
    return new Response("Unhandled error", { status: 500 });
  }
});

