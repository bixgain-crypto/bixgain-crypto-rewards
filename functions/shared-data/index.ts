import { createClient as createBlinkClient } from "npm:@blinkdotnew/sdk";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID");
    const secretKey = Deno.env.get("BLINK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectId || !secretKey || !supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing config" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const table = url.searchParams.get("table");
    const limitParam = url.searchParams.get("limit");

    if (!table || !["tasks", "quizzes", "store_items", "user_profiles", "referral_history", "platform_metrics"].includes(table)) {
      return new Response(
        JSON.stringify({ error: "Invalid table" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const limit = limitParam ? parseInt(limitParam, 10) : null;

    let query = supabase.from(table).select("*");

    // For user_profiles, sort by balance descending for leaderboard
    if (table === "user_profiles") {
      query = query.order("balance", { ascending: false });
      if (!limit) query = query.limit(50);
    }
    // For referral_history, sort by created_at descending
    if (table === "referral_history") {
      query = query.order("created_at", { ascending: false });
      if (!limit) query = query.limit(20);
    }
    // Only show active tasks
    if (table === "tasks") {
      query = query.eq("is_active", 1);
    }
    // Platform metrics sorted by date desc
    if (table === "platform_metrics") {
      query = query.order("metric_date", { ascending: false });
      if (!limit) query = query.limit(30);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

Deno.serve(handler);