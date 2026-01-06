// Supabase Edge Function: Validate Admin Code
// Deploy this to Supabase Edge Functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { code, action, userId } = await req.json();

    if (!code || !action) {
      return new Response(
        JSON.stringify({ error: "Code and action are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Hash the provided code
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // Find matching code
    const { data: codeData, error: codeError } = await supabaseClient
      .from("admin_codes")
      .select("*")
      .eq("code_hash", codeHash)
      .eq("action", action)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (codeError || !codeData) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if code is for specific user (if userId provided)
    if (codeData.user_id && codeData.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Code not valid for this user" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Mark code as used
    await supabaseClient
      .from("admin_codes")
      .update({
        used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", codeData.id);

    return new Response(
      JSON.stringify({ 
        valid: true,
        codeId: codeData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});










