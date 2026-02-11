// Supabase Edge Function: Auto clock-out for Read Cafe
// 8:30 PM every day (Sunday–Saturday)

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

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const timeZone = Deno.env.get("AUTO_CLOCKOUT_TZ") ?? DEFAULT_TIMEZONE;

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing configuration", { status: 500 });
    }

    const { hour, minute } = getLocalTimeParts(timeZone);
    const time = `${hour}:${minute}`;

    // Read Cafe: 8:30 PM every day (Sun–Sat)
    const shouldRun = time === "20:30";

    if (!shouldRun) {
      return new Response("No action needed", { status: 200 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: employees, error: employeeError } = await serviceClient
      .from("users")
      .select("id")
      .eq("role", "employee")
      .eq("cafe_location", "Read Cafe");

    if (employeeError) {
      return new Response("Failed to load employees", { status: 500 });
    }

    const employeeIds = (employees || []).map((emp) => emp.id);
    if (employeeIds.length === 0) {
      return new Response("No employees found", { status: 200 });
    }

    const { error: updateError, data: updatedLogs } = await serviceClient
      .from("time_logs")
      .update({
        clock_out: new Date().toISOString(),
        verified_by: "auto",
      })
      .in("user_id", employeeIds)
      .is("clock_out", null)
      .select("id");

    if (updateError) {
      return new Response("Failed to update time logs", { status: 500 });
    }

    await serviceClient.rpc("log_audit_event", {
      p_action: "auto_clock_out",
      p_performed_by: employeeIds[0] || null,
      p_target_user: null,
      p_metadata: {
        cafe: "Read Cafe",
        updated: updatedLogs?.length || 0,
        time_zone: timeZone,
        time,
      },
    });

    return new Response(
      `Auto clock-out complete: ${updatedLogs?.length || 0}`,
      { status: 200 }
    );
  } catch (_error) {
    return new Response("Unhandled error", { status: 500 });
  }
});
