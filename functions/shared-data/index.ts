import { createClient } from "npm:@blinkdotnew/sdk";

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

    if (!projectId || !secretKey) {
      return new Response(
        JSON.stringify({ error: "Missing config" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const blink = createClient({ projectId, secretKey });

    const url = new URL(req.url);
    const table = url.searchParams.get("table");
    const limitParam = url.searchParams.get("limit");

    if (!table || !["tasks", "quizzes", "store_items", "user_profiles", "referral_history", "platform_metrics"].includes(table)) {
      return new Response(
        JSON.stringify({ error: "Invalid table" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const options: Record<string, unknown> = {};
    if (limitParam) options.limit = parseInt(limitParam, 10);

    // For user_profiles, sort by balance descending for leaderboard
    if (table === "user_profiles") {
      options.orderBy = { balance: "desc" };
      if (!limitParam) options.limit = 50;
    }
    // For referral_history, sort by createdAt descending
    if (table === "referral_history") {
      options.orderBy = { createdAt: "desc" };
      if (!limitParam) options.limit = 20;
    }
    // Only show active tasks
    if (table === "tasks") {
      options.where = { isActive: 1 };
    }
    // Platform metrics sorted by date desc
    if (table === "platform_metrics") {
      options.orderBy = { metricDate: "desc" };
      if (!limitParam) options.limit = 30;
    }

    const data = await blink.db.table(table).list(options);

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
