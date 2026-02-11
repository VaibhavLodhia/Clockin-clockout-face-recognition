// Supabase Edge Function: Delete User (Admin only)
// Deploy this to Supabase Edge Functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.94.1";

serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: adminError } = await authClient.rpc(
      "is_admin",
      { user_id: user.id }
    );

    if (adminError || isAdmin !== true) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let payload: { targetUserId?: string } = {};
    try {
      payload = await req.json();
    } catch (_error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { targetUserId } = payload;
    if (!targetUserId || typeof targetUserId !== "string") {
      return new Response(
        JSON.stringify({ error: "targetUserId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (targetUserId === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: targetUser, error: targetError } = await serviceClient
      .from("users")
      .select("id, role")
      .eq("id", targetUserId)
      .single();

    if (targetError || !targetUser) {
      console.error("Target lookup error:", targetError);
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetUser.role !== "employee") {
      return new Response(
        JSON.stringify({ error: "Only employees can be deleted" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clean up dependent records to avoid FK constraint failures
    const { error: adminCodesError } = await serviceClient
      .from("admin_codes")
      .delete()
      .eq("user_id", targetUserId);
    if (adminCodesError) {
      console.error("Admin codes delete error:", adminCodesError);
    }

    const { error: faceEmbeddingsError } = await serviceClient
      .from("face_embeddings")
      .delete()
      .eq("user_id", targetUserId);
    if (faceEmbeddingsError) {
      console.error("Face embeddings delete error:", faceEmbeddingsError);
    }

    const { error: timeLogsError } = await serviceClient
      .from("time_logs")
      .delete()
      .or(
        `user_id.eq.${targetUserId},matched_employee_id.eq.${targetUserId}`
      );
    if (timeLogsError) {
      console.error("Time logs delete error:", timeLogsError);
    }

    const { error: auditLogsError } = await serviceClient
      .from("audit_logs")
      .delete()
      .or(
        `target_user.eq.${targetUserId},performed_by.eq.${targetUserId}`
      );
    if (auditLogsError) {
      console.error("Audit logs delete error:", auditLogsError);
    }

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(
      targetUserId
    );

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return new Response(
        JSON.stringify({ error: `Delete failed: ${deleteError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: auditError } = await serviceClient.rpc("log_audit_event", {
      p_action: "delete_user",
      p_performed_by: user.id,
      p_target_user: targetUserId,
      p_metadata: { reason: "admin_delete" },
    });
    if (auditError) {
      console.error("Audit log error:", auditError);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

