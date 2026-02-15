import { createClient as createBlinkClient } from "npm:@blinkdotnew/sdk";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-device-hash",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ===================== RATE LIMITING (In-Memory per instance) =====================
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

function trackFailedAttempt(key: string): number {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: now + 3600000 }); // 1 hour window
    return 1;
  }
  entry.count++;
  return entry.count;
}

function isLockedOut(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return entry.count >= 10;
}

// Hash IP for privacy
function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `ip_${Math.abs(hash).toString(36)}`;
}

// Crypto-secure random code generator
function generateSecureCode(length = 8): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // No ambiguous chars
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

// ===================== ABUSE DETECTION =====================
async function checkAbuseThrottling(supabase: any, userId: string, ipHash: string): Promise<{ allowed: boolean; multiplier: number; reason?: string }> {
  // Check if user is flagged
  const { data: flags, error: flagsError } = await supabase.from("abuse_flags").select("*").eq("user_id", userId).eq("resolved", 0).limit(10);

  if (flagsError) {
    console.error("Error fetching abuse flags:", flagsError);
    return { allowed: true, multiplier: 1.0 }; // Fallback
  }

  const highSeverityFlags = flags.filter((f: any) => f.severity === "high" || f.severity === "critical");
  if (highSeverityFlags.length > 0) {
    return { allowed: false, multiplier: 0, reason: "Account flagged for review" };
  }

  // Behavior-based multiplier: reduce rewards for suspicious patterns
  let multiplier = 1.0;

  // Check redemption velocity - last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentRedemptions, error: redemptionError } = await supabase.from("redemptions").select("*").eq("user_id", userId).order("redeemed_at", { ascending: false }).limit(20);

  if (!redemptionError && recentRedemptions) {
    const recentCount = recentRedemptions.filter((r: any) => r.redeemed_at > tenMinAgo).length;
    if (recentCount >= 5) {
      multiplier *= 0.5; // Half rewards if redeeming too fast
    }
  }

  // Check multi-account from same IP (last 24h)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: ipRedemptions, error: ipError } = await supabase.from("redemptions").select("*").eq("ip_hash", ipHash).order("redeemed_at", { ascending: false }).limit(50);

  if (!ipError && ipRedemptions) {
    const uniqueUsersFromIP = new Set(
      ipRedemptions.filter((r: any) => r.redeemed_at > dayAgo).map((r: any) => r.user_id)
    );

    if (uniqueUsersFromIP.size > 3) {
      // Flag suspicious cluster
      await supabase.from("abuse_flags").insert({
        id: `af_${Date.now()}_${userId.slice(-4)}`,
        user_id: userId,
        flag_type: "multi_account_ip",
        severity: "medium",
        details: JSON.stringify({ ipHash, accountCount: uniqueUsersFromIP.size }),
      });
      multiplier *= 0.25;
    }
  }

  // Low-severity flags reduce multiplier slightly
  if (flags.length > 0 && flags.length < 3) {
    multiplier *= 0.75;
  }

  return { allowed: true, multiplier: Math.max(multiplier, 0.1) };
}

// ===================== METRICS TRACKING =====================
async function trackMetric(supabase: any, rewardType: string, amount: number) {
  const today = new Date().toISOString().split("T")[0];
  const metricId = `pm_${today}`;

  try {
    const { data: existing, error: fetchError } = await supabase.from("platform_metrics").select("*").eq("metric_date", today).limit(1);

    if (fetchError) throw fetchError;

    const fieldMap: Record<string, string> = {
      task: "task_rewards_issued",
      referral: "referral_rewards_issued",
      quiz: "quiz_rewards_issued",
      game: "game_rewards_issued",
      code: "code_rewards_issued",
      daily: "task_rewards_issued",
    };

    const field = fieldMap[rewardType] || "task_rewards_issued";

    if (existing && existing.length > 0) {
      const m = existing[0];
      await supabase.from("platform_metrics").update({
        total_rewards_issued: (m.total_rewards_issued || 0) + amount,
        total_daily_rewards: (m.total_daily_rewards || 0) + amount,
        [field]: (m[field] || 0) + amount,
      }).eq("id", m.id);
    } else {
      await supabase.from("platform_metrics").insert({
        id: metricId,
        metric_date: today,
        total_rewards_issued: amount,
        total_daily_rewards: amount,
        [field]: amount,
      });
    }
  } catch (err) {
    console.error("Metric tracking error:", err);
  }
}

// ===================== MAIN HANDLER =====================
async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const projectId = Deno.env.get("BLINK_PROJECT_ID");
    const secretKey = Deno.env.get("BLINK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectId || !secretKey || !supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Missing server config", 500);
    }

    const blink = createBlinkClient({ projectId, secretKey });
    const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const auth = await blink.auth.verifyToken(req.headers.get("Authorization"));
    if (!auth.valid || !auth.userId) {
      return errorResponse("Unauthorized", 401);
    }

    const userId = auth.userId;
    const body = await req.json();
    const { action } = body;

    // Extract IP and device info
    const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const ipHash = hashIP(clientIP);
    const deviceHash = req.headers.get("x-device-hash") || "";
    const userAgent = req.headers.get("user-agent") || "";

    // Global rate limiting: 5 code attempts per minute per IP
    if (action === "redeem_task_code") {
      if (!checkRateLimit(`code_ip:${ipHash}`, 5)) {
        return errorResponse("Too many code attempts. Wait a minute.", 429);
      }
      if (isLockedOut(`lockout:${userId}`)) {
        return errorResponse("Account temporarily locked due to too many failed attempts.", 429);
      }
    }

    // General rate limiting per user per action
    if (!checkRateLimit(`${userId}:${action}`, action === "quiz_answer" ? 30 : 10)) {
      return errorResponse("Rate limited. Try again later.", 429);
    }

    // Auto-process pending rewards
    await autoProcessPending(supabase, userId);

    switch (action) {
      case "process_referral":
        return await processReferral(supabase, userId, body, ipHash);
      case "complete_task":
        return await completeTask(supabase, userId, body);
      case "daily_checkin":
        return await dailyCheckin(supabase, userId);
      case "start_quiz":
        return await startQuiz(supabase, userId, body);
      case "quiz_answer":
        return await quizAnswer(supabase, userId, body);
      case "finish_quiz":
        return await finishQuiz(supabase, userId, body);
      case "game_result":
        return await gameResult(supabase, userId, body);
      // New secure task code system
      case "redeem_task_code":
        return await redeemTaskCode(supabase, userId, body, ipHash, deviceHash, userAgent);
      case "admin_generate_code_window":
        return await adminGenerateCodeWindow(supabase, userId, body);
      case "admin_list_code_windows":
        return await adminListCodeWindows(supabase, userId, body);
      case "admin_disable_code_window":
        return await adminDisableCodeWindow(supabase, userId, body);
      case "admin_get_metrics":
        return await adminGetMetrics(supabase, userId);
      case "admin_get_abuse_flags":
        return await adminGetAbuseFlags(supabase, userId);
      case "admin_resolve_flag":
        return await adminResolveFlag(supabase, userId, body);
      case "get_pending_rewards":
        return await getPendingRewards(supabase, userId);
      // Legacy compat
      case "verify_reward_code":
        return await redeemTaskCode(supabase, userId, body, ipHash, deviceHash, userAgent);
      case "admin_generate_code":
        return await adminGenerateCodeWindow(supabase, userId, body);
      default:
        return errorResponse("Invalid action");
    }
  } catch (error) {
    console.error("Reward engine error:", error);
    return errorResponse("Internal server error", 500);
  }
}

// ===================== ADMIN CHECK =====================
async function verifyAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data: profile, error } = await supabase.from("user_profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) return false;
  return profile?.role === "admin";
}

// ===================== TASK CODE WINDOW SYSTEM =====================

async function adminGenerateCodeWindow(supabase: any, userId: string, body: any) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { taskId, validHours = 3, maxRedemptions } = body;

  // Validate task exists
  if (taskId) {
    const { data: tasks, error } = await supabase.from("tasks").select("id").eq("id", taskId).limit(1);
    if (error || !tasks || tasks.length === 0) return errorResponse("Task not found");
  }

  // Check max 4 active windows per task per day
  const today = new Date().toISOString().split("T")[0];
  const { data: existingWindows, error: windowsError } = await supabase.from("task_code_windows").select("*").eq("is_active", 1).limit(50);

  if (windowsError) return errorResponse("Failed to check existing windows");

  const todayWindows = existingWindows.filter(
    (w: any) => w.created_at && w.created_at.startsWith(today) && (!taskId || w.task_id === taskId)
  );

  if (taskId && todayWindows.length >= 4) {
    return errorResponse("Maximum 4 code windows per task per day");
  }

  const code = generateSecureCode(8);
  const now = new Date();
  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + validHours * 60 * 60 * 1000).toISOString();
  const windowId = `cw_${Date.now()}_${code.slice(0, 4)}`;

  const { error: insertError } = await supabase.from("task_code_windows").insert({
    id: windowId,
    task_id: taskId || "general",
    code,
    valid_from: validFrom,
    valid_until: validUntil,
    max_redemptions: maxRedemptions || null,
    current_redemptions: 0,
    is_active: 1,
    created_by_admin: userId,
  });

  if (insertError) {
    console.error("Error generating code window:", insertError);
    return errorResponse("Failed to generate code window");
  }

  return jsonResponse({
    success: true,
    windowId,
    code,
    validFrom,
    validUntil,
    maxRedemptions: maxRedemptions || "unlimited",
    message: `Code ${code} generated. Valid for ${validHours} hours.`,
  });
}

async function adminListCodeWindows(supabase: any, userId: string, body: any) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { activeOnly = true } = body;
  let query = supabase.from("task_code_windows").select("*").order("created_at", { ascending: false }).limit(50);
  
  if (activeOnly) {
    query = query.eq("is_active", 1);
  }

  const { data: windows, error } = await query;

  if (error) return errorResponse("Failed to list windows");

  // Add remaining time info
  const now = Date.now();
  const enriched = windows.map((w: any) => {
    const validUntil = new Date(w.valid_until).getTime();
    const remainingMs = Math.max(0, validUntil - now);
    const expired = remainingMs === 0;
    return {
      ...w,
      remainingMinutes: Math.round(remainingMs / 60000),
      expired,
      utilizationPercent: w.max_redemptions
        ? Math.round(((w.current_redemptions || 0) / w.max_redemptions) * 100)
        : null,
    };
  });

  return jsonResponse({ success: true, windows: enriched });
}

async function adminDisableCodeWindow(supabase: any, userId: string, body: any) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { windowId } = body;
  if (!windowId) return errorResponse("Missing windowId");

  const { error } = await supabase.from("task_code_windows").update({ is_active: 0 }).eq("id", windowId);

  if (error) return errorResponse("Failed to disable window");

  return jsonResponse({ success: true, message: "Code window disabled" });
}

// ===================== SECURE CODE REDEMPTION =====================

async function redeemTaskCode(
  supabase: any,
  userId: string,
  body: any,
  ipHash: string,
  deviceHash: string,
  userAgent: string
) {
  const { code } = body;
  if (!code || typeof code !== "string" || code.trim().length < 6) {
    trackFailedAttempt(`lockout:${userId}`);
    return errorResponse("Invalid code format");
  }

  const cleanCode = code.trim().toUpperCase();

  // 1. Find active code window
  const { data: windows, error } = await supabase.from("task_code_windows").select("*").eq("code", cleanCode).eq("is_active", 1).limit(1);

  if (error || !windows || windows.length === 0) {
    const failCount = trackFailedAttempt(`lockout:${userId}`);
    if (failCount >= 8) {
      await supabase.from("abuse_flags").insert({
        id: `af_${Date.now()}_${userId.slice(-4)}`,
        user_id: userId,
        flag_type: "brute_force_codes",
        severity: "medium",
        details: JSON.stringify({ failed_attempts: failCount, ip_hash: ipHash }),
      });
    }
    return errorResponse("Invalid or expired code");
  }

  const window = windows[0];
  const now = new Date();

  // 2. Check time validity
  if (now < new Date(window.valid_from) || now > new Date(window.valid_until)) {
    trackFailedAttempt(`lockout:${userId}`);
    return errorResponse("Code has expired or not yet active");
  }

  // 3. Check max redemptions
  if (window.max_redemptions && (window.current_redemptions || 0) >= window.max_redemptions) {
    return errorResponse("Code has reached maximum redemptions");
  }

  // 4. Check duplicate redemption
  const { data: existingRedemption, error: redemptionError } = await supabase.from("redemptions").select("id").eq("user_id", userId).eq("window_id", window.id).limit(1);

  if (redemptionError || (existingRedemption && existingRedemption.length > 0)) {
    return errorResponse("You already redeemed this code");
  }

  // 5. Abuse throttling check
  const abuseCheck = await checkAbuseThrottling(supabase, userId, ipHash);
  if (!abuseCheck.allowed) {
    return errorResponse(abuseCheck.reason || "Account under review");
  }

  // 6. Get task reward amount
  let rewardAmount = 100; // Default if general code
  if (window.task_id && window.task_id !== "general") {
    const { data: tasks, error: taskError } = await supabase.from("tasks").select("reward_amount").eq("id", window.task_id).limit(1);
    if (!taskError && tasks && tasks.length > 0) {
      rewardAmount = tasks[0].reward_amount || 100;
    }
  }

  // Apply abuse multiplier
  rewardAmount = Math.round(rewardAmount * abuseCheck.multiplier);

  // 7. Get user profile
  const { data: profile, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (profileError || !profile) return errorResponse("Profile not found");

  // 8. Execute atomically
  try {
    // Record redemption
    const { error: createRedemptionError } = await supabase.from("redemptions").insert({
      id: `rd_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      task_id: window.task_id || "general",
      window_id: window.id,
      redeemed_at: now.toISOString(),
      ip_hash: ipHash,
      device_hash: deviceHash,
      user_agent: userAgent.slice(0, 200),
    });

    if (createRedemptionError) throw createRedemptionError;

    // Increment window redemption count
    const { error: updateWindowError } = await supabase.from("task_code_windows").update({
      current_redemptions: (window.current_redemptions || 0) + 1,
    }).eq("id", window.id);

    if (updateWindowError) throw updateWindowError;

    // Update user balance
    const { error: updateProfileError } = await supabase.from("user_profiles").update({
      balance: (profile.balance || 0) + rewardAmount,
      total_earned: (profile.total_earned || 0) + rewardAmount,
      xp: (profile.xp || 0) + 10,
    }).eq("user_id", userId);

    if (updateProfileError) throw updateProfileError;

    // Log transaction
    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      amount: rewardAmount,
      type: "code_redemption",
      description: `Redeemed code: ${cleanCode.slice(0, 3)}***`,
    });

    // Audit log
    await supabase.from("reward_logs").insert({
      id: `log_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      reward_type: "code_redemption",
      reward_amount: rewardAmount,
      source_id: window.id,
      source_type: "task_code_window",
      ip_hash: ipHash,
    });

    // Track metrics
    await trackMetric(supabase, "code", rewardAmount);

    // Process referral commission (10% of earned reward to referrer)
    await processReferralCommission(supabase, userId, rewardAmount, window.id);

    return jsonResponse({
      success: true,
      reward: rewardAmount,
      multiplier: abuseCheck.multiplier,
      newBalance: (profile.balance || 0) + rewardAmount,
      message: `+${rewardAmount} BIX earned!`,
    });
  } catch (err) {
    console.error("Redemption error:", err);
    return errorResponse("Failed to process redemption", 500);
  }
}

// ===================== REFERRAL COMMISSION SYSTEM =====================

async function processReferralCommission(supabase: any, userId: string, earnedAmount: number, sourceId: string) {
  try {
    const { data: profile, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (profileError || !profile || !profile.referred_by) return; // No referrer

    const referrerId = profile.referred_by;

    // Check referral qualification: referred user must have completed 2+ tasks
    const { data: completedTasks, error: tasksError } = await supabase.from("user_tasks").select("id").eq("user_id", userId).eq("status", "completed").limit(5);

    // Also count redemptions
    const { data: redemptions, error: redemptionsError } = await supabase.from("redemptions").select("id").eq("user_id", userId).limit(5);

    const totalActivity = (completedTasks?.length || 0) + (redemptions?.length || 0);
    if (totalActivity < 2) return; // Not enough activity to qualify

    // Check IP match between referrer and referred (anti-fraud)
    const { data: referrerRedemptions, error: refRedemptionsError } = await supabase.from("redemptions").select("ip_hash").eq("user_id", referrerId).order("redeemed_at", { ascending: false }).limit(5);
    const { data: referredRedemptions, error: referredRedemptionsError } = await supabase.from("redemptions").select("ip_hash").eq("user_id", userId).order("redeemed_at", { ascending: false }).limit(5);

    const referrerIPs = new Set(referrerRedemptions.map((r: any) => r.ip_hash).filter(Boolean));
    const referredIPs = new Set(referredRedemptions.map((r: any) => r.ip_hash).filter(Boolean));
    const ipOverlap = [...referrerIPs].some((ip) => referredIPs.has(ip));

    if (ipOverlap) {
      // Flag but don't block — reduce commission
      await supabase.from("abuse_flags").insert({
        id: `af_${Date.now()}_refip`,
        user_id: userId,
        flag_type: "referral_ip_match",
        severity: "low",
        details: JSON.stringify({ referrerId }),
      });
      return; // Skip commission for IP match
    }

    // Calculate commission: 10% of earned reward
    const commissionRate = 0.10;
    const commissionAmount = Math.round(earnedAmount * commissionRate);
    if (commissionAmount < 1) return;

    // Delay commission by 24 hours
    const eligibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("referral_commissions").insert({
      id: `rc_${Date.now()}_${referrerId.slice(-4)}`,
      referrer_id: referrerId,
      referred_id: userId,
      source_reward_id: sourceId,
      commission_amount: commissionAmount,
      status: "pending",
      eligible_at: eligibleAt,
    });
  } catch (err) {
    console.error("Referral commission error:", err);
  }
}

// ===================== AUTO-PROCESS PENDING =====================

async function autoProcessPending(supabase: any, userId: string) {
  try {
    const now = new Date().toISOString();

    // Process pending rewards
    const { data: pending, error: pendingError } = await supabase.from("pending_rewards").select("*").eq("user_id", userId).eq("status", "pending").limit(20);
    if (pendingError) throw pendingError;

    for (const item of pending) {
      if (item.process_at && item.process_at <= now) {
        await processReward(supabase, item);
      }
    }

    // Process eligible referral commissions for the referrer
    const { data: pendingCommissions, error: commissionsError } = await supabase.from("referral_commissions").select("*").eq("referrer_id", userId).eq("status", "pending").limit(20);
    if (commissionsError) throw commissionsError;

    for (const comm of pendingCommissions) {
      if (comm.eligible_at && comm.eligible_at <= now) {
        await processCommission(supabase, comm);
      }
    }
  } catch (err) {
    console.error("Auto-process error:", err);
  }
}

async function processReward(supabase: any, item: any) {
  try {
    const { data: profile, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", item.user_id).maybeSingle();
    if (profileError || !profile) return;

    await supabase.from("user_profiles").update({
      balance: (profile.balance || 0) + item.reward_amount,
      total_earned: (profile.total_earned || 0) + item.reward_amount,
      xp: (profile.xp || 0) + 10,
    }).eq("user_id", item.user_id);

    await supabase.from("pending_rewards").update({ status: "processed" }).eq("id", item.id);

    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${item.user_id.slice(-4)}`,
      user_id: item.user_id,
      amount: item.reward_amount,
      type: item.reward_type || "verification",
      description: `Delayed reward processed`,
    });

    await supabase.from("reward_logs").insert({
      id: `log_${Date.now()}_${item.user_id.slice(-4)}`,
      user_id: item.user_id,
      reward_type: item.reward_type || "verification",
      reward_amount: item.reward_amount,
      source_id: item.source_id,
      source_type: item.source_type || "pending_reward",
    });
  } catch (err) {
    console.error(`Failed to process reward ${item.id}:`, err);
  }
}

async function processCommission(supabase: any, comm: any) {
  try {
    const { data: referrerProfile, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", comm.referrer_id).maybeSingle();
    if (profileError || !referrerProfile) return;

    await supabase.from("user_profiles").update({
      balance: (referrerProfile.balance || 0) + comm.commission_amount,
      total_earned: (referrerProfile.total_earned || 0) + comm.commission_amount,
      xp: (referrerProfile.xp || 0) + 5,
    }).eq("user_id", comm.referrer_id);

    await supabase.from("referral_commissions").update({
      status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", comm.id);

    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${comm.referrer_id.slice(-4)}`,
      user_id: comm.referrer_id,
      amount: comm.commission_amount,
      type: "referral_commission",
      description: `Referral commission from user activity`,
    });

    await trackMetric(supabase, "referral", comm.commission_amount);
  } catch (err) {
    console.error(`Failed to process commission ${comm.id}:`, err);
  }
}

// ===================== REFERRAL SYSTEM =====================

async function processReferral(supabase: any, newUserId: string, body: any, ipHash: string) {
  const { referralCode } = body;
  if (!referralCode || typeof referralCode !== "string") {
    return errorResponse("Invalid referral code");
  }

  const { data: referrers, error: referrersError } = await supabase.from("user_profiles").select("*").eq("referral_code", referralCode).limit(1);
  if (referrersError || !referrers || referrers.length === 0) {
    return errorResponse("Invalid referral code - referrer not found");
  }

  const referrer = referrers[0];

  if (referrer.user_id === newUserId) {
    return errorResponse("Cannot refer yourself");
  }

  // Check if user was already referred
  const { data: newUserProfiles, error: newUserError } = await supabase.from("user_profiles").select("*").eq("user_id", newUserId).limit(1);
  if (newUserError || (newUserProfiles && newUserProfiles.length > 0 && newUserProfiles[0].referred_by)) {
    return errorResponse("User already has a referrer");
  }

  // Check duplicate
  const { data: existingReferral, error: existingReferralError } = await supabase.from("referral_history").select("id").eq("referred_id", newUserId).limit(1);
  if (existingReferralError || (existingReferral && existingReferral.length > 0)) {
    return errorResponse("Referral already processed");
  }

  // Anti-fraud: IP match check
  const { data: referrerRedemptions, error: refRedemptionsError } = await supabase.from("redemptions").select("ip_hash").eq("user_id", referrer.user_id).limit(5);
  const referrerIPs = new Set(referrerRedemptions.map((r: any) => r.ip_hash).filter(Boolean));

  if (referrerIPs.has(ipHash)) {
    await supabase.from("abuse_flags").insert({
      id: `af_${Date.now()}_selfref`,
      user_id: newUserId,
      flag_type: "referral_same_ip",
      severity: "high",
      details: JSON.stringify({ referrerId: referrer.user_id, ipHash }),
    });
    return errorResponse("Referral rejected: suspicious activity detected");
  }

  // Anti-fraud: cap referrals per day
  const today = new Date().toISOString().split("T")[0];
  const { data: recentReferrals, error: recentReferralsError } = await supabase.from("referral_history").select("*").eq("referrer_id", referrer.user_id).limit(50);
  
  const todayReferrals = recentReferrals.filter(
    (r: any) => r.created_at && r.created_at.startsWith(today)
  );
  if (todayReferrals.length >= 10) {
    return errorResponse("Referrer daily limit reached");
  }

  // Referral reward is delayed: mark referredBy but don't grant referrer reward yet
  // Referrer earns only after referred user completes 2-3 tasks
  const NEW_USER_REWARD = 50;

  try {
    // 1. Create referral history (pending status)
    await supabase.from("referral_history").insert({
      id: `rh_${Date.now()}_${newUserId.slice(-4)}`,
      referrer_id: referrer.user_id,
      referred_id: newUserId,
      reward_amount: 0, // Will be set when qualified
    });

    // 2. Update new user: mark referred_by + grant signup bonus
    if (newUserProfiles && newUserProfiles.length > 0) {
      const newProfile = newUserProfiles[0];
      await supabase.from("user_profiles").update({
        referred_by: referrer.user_id,
        balance: (newProfile.balance || 0) + NEW_USER_REWARD,
        total_earned: (newProfile.total_earned || 0) + NEW_USER_REWARD,
        xp: (newProfile.xp || 0) + 25,
      }).eq("user_id", newUserId);
    }

    // 3. Log new user transaction
    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${newUserId.slice(-4)}`,
      user_id: newUserId,
      amount: NEW_USER_REWARD,
      type: "referral",
      description: `Referral bonus: joined via ${referralCode}`,
    });

    // 4. Schedule referrer reward with 24h delay
    const eligibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("referral_commissions").insert({
      id: `rc_signup_${Date.now()}_${referrer.user_id.slice(-4)}`,
      referrer_id: referrer.user_id,
      referred_id: newUserId,
      source_reward_id: "signup_referral",
      commission_amount: 100, // Referrer reward
      status: "pending",
      eligible_at: eligibleAt,
    });

    await trackMetric(supabase, "referral", NEW_USER_REWARD);

    return jsonResponse({
      success: true,
      newUserReward: NEW_USER_REWARD,
      message: `Referral successful! You earned ${NEW_USER_REWARD} BIX. Your referrer will be rewarded after verification.`,
    });
  } catch (err) {
    console.error("Referral processing error:", err);
    return errorResponse("Failed to process referral", 500);
  }
}

// ===================== TASK SYSTEM =====================

async function completeTask(supabase: any, userId: string, body: any) {
  const { taskId } = body;
  if (!taskId) return errorResponse("Missing taskId");

  const { data: tasks, error: tasksError } = await supabase.from("tasks").select("*").eq("id", taskId).limit(1);
  if (tasksError || !tasks || tasks.length === 0) return errorResponse("Task not found");

  const task = tasks[0];
  if (!task.is_active) return errorResponse("Task is no longer active");

  const { data: profiles, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", userId).limit(1);
  if (profileError || !profiles || profiles.length === 0) return errorResponse("Profile not found");
  const profile = profiles[0];

  const userLevel = Math.floor((profile.total_earned || 0) / 500) + 1;
  if (task.required_level && userLevel < task.required_level) {
    return errorResponse(`Requires Level ${task.required_level}`);
  }

  const { data: existingCompletions, error: completionsError } = await supabase.from("user_tasks").select("*").eq("user_id", userId).eq("task_id", taskId).limit(10);

  if (task.task_type === "one_time" && existingCompletions && existingCompletions.length > 0) {
    return errorResponse("Task already completed");
  }

  if (task.task_type === "daily") {
    const today = new Date().toISOString().split("T")[0];
    const completedToday = existingCompletions.some(
      (c: any) => c.completed_at && c.completed_at.startsWith(today)
    );
    if (completedToday) return errorResponse("Daily task already completed today");
  }

  if (task.category === "referral") {
    const { count: referralCount, error: referralCountError } = await supabase.from("referral_history").count({ exact: true }).eq("referrer_id", userId);
    const requiredCount = taskId === "task_refer_1" ? 1 : taskId === "task_refer_5" ? 5 : 25;
    if (referralCount < requiredCount) {
      return errorResponse(`Need ${requiredCount} referrals to claim`);
    }
  }

  if (task.category === "milestone") {
    if (taskId === "task_earn_1000" && (profile.total_earned || 0) < 1000)
      return errorResponse("Need 1,000 BIX total earnings");
    if (taskId === "task_earn_10000" && (profile.total_earned || 0) < 10000)
      return errorResponse("Need 10,000 BIX total earnings");
    if (taskId === "task_streak_7" && (profile.daily_streak || 0) < 7)
      return errorResponse("Need 7-day login streak");
  }

  const reward = task.reward_amount || 0;
  const xpReward = task.xp_reward || 0;

  try {
    await supabase.from("user_tasks").insert({
      id: `ut_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      task_id: taskId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    await supabase.from("user_profiles").update({
      balance: (profile.balance || 0) + reward,
      total_earned: (profile.total_earned || 0) + reward,
      xp: (profile.xp || 0) + xpReward,
    }).eq("user_id", userId);

    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      amount: reward,
      type: "task",
      description: `Completed: ${task.title}`,
    });

    await supabase.from("reward_logs").insert({
      id: `log_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      reward_type: "task",
      reward_amount: reward,
      source_id: taskId,
      source_type: task.category,
    });

    await trackMetric(supabase, "task", reward);
    await processReferralCommission(supabase, userId, reward, taskId);

    return jsonResponse({
      success: true,
      reward,
      xp: xpReward,
      newBalance: (profile.balance || 0) + reward,
      message: `+${reward} BIX earned!`,
    });
  } catch (err) {
    console.error("Task completion error:", err);
    return errorResponse("Failed to complete task", 500);
  }
}

// ===================== DAILY CHECK-IN =====================

async function dailyCheckin(supabase: any, userId: string) {
  const { data: profiles, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).limit(1);
  if (error || !profiles || profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  const today = new Date().toISOString().split("T")[0];

  if (profile.last_login === today) {
    return errorResponse("Already checked in today");
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (profile.last_login === yesterdayStr) {
    newStreak = (profile.daily_streak || 0) + 1;
  }

  const multiplier = Math.min(1 + (newStreak - 1) * 0.5, 5);
  const baseReward = 10;
  const reward = Math.round(baseReward * multiplier);
  const xpReward = 5 + newStreak;

  try {
    await supabase.from("user_profiles").update({
      balance: (profile.balance || 0) + reward,
      total_earned: (profile.total_earned || 0) + reward,
      last_login: today,
      daily_streak: newStreak,
      xp: (profile.xp || 0) + xpReward,
    }).eq("user_id", userId);

    await supabase.from("transactions").insert({
      id: `tx_${Date.now()}_${userId.slice(-4)}`,
      user_id: userId,
      amount: reward,
      type: "daily",
      description: `Daily check-in (${newStreak}-day streak, ${multiplier}x multiplier)`,
    });

    // Track active user
    const metricDate = today;
    const { data: existingMetrics, error: metricsError } = await supabase.from("platform_metrics").select("*").eq("metric_date", metricDate).limit(1);
    if (metricsError) throw metricsError;

    if (existingMetrics && existingMetrics.length > 0) {
      await supabase.from("platform_metrics").update({
        active_users_today: (existingMetrics[0].active_users_today || 0) + 1,
      }).eq("id", existingMetrics[0].id);
    }

    await trackMetric(supabase, "daily", reward);

    return jsonResponse({
      success: true,
      reward,
      streak: newStreak,
      multiplier,
      xp: xpReward,
      message: `+${reward} BIX! ${newStreak}-day streak (${multiplier}x)`,
    });
  } catch (err) {
    console.error("Daily checkin error:", err);
    return errorResponse("Failed to process check-in", 500);
  }
}

// ===================== QUIZ SYSTEM =====================

async function startQuiz(supabase: any, userId: string, body: any) {
  const { questionCount = 10, difficulty = "easy" } = body;
  const validCounts = [5, 10, 20, 50];
  if (!validCounts.includes(questionCount)) {
    return errorResponse("Invalid question count. Choose 5, 10, 20, or 50");
  }

  const { data: activeSessions, error: sessionError } = await supabase.from("quiz_sessions").select("*").eq("user_id", userId).eq("status", "active").limit(1);
  if (sessionError) throw sessionError;

  if (activeSessions && activeSessions.length > 0) {
    const session = activeSessions[0];
    const startedAt = new Date(session.started_at).getTime();
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      await supabase.from("quiz_sessions").update({ status: "expired" }).eq("id", session.id);
    } else {
      return errorResponse("You already have an active quiz session");
    }
  }

  const { data: allQuestions, error: questionsError } = await supabase.from("quizzes").select("*").eq("difficulty", difficulty).limit(200);
  if (questionsError) throw questionsError;

  let questions = allQuestions;
  let actualDifficulty = difficulty;
  if (allQuestions.length < questionCount) {
    const { data: mixedQuestions, error: mixedError } = await supabase.from("quizzes").select("*").limit(200);
    if (mixedError) throw mixedError;
    questions = mixedQuestions;
    actualDifficulty = "mixed";
    if (questions.length < questionCount) {
      return errorResponse("Not enough questions available");
    }
  }

  const shuffled = questions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, questionCount);
  const questionIds = selected.map((q: any) => q.id);

  const sessionId = `qs_${userId.slice(-6)}_${Date.now()}`;
  await supabase.from("quiz_sessions").insert({
    id: sessionId,
    user_id: userId,
    question_count: questionCount,
    difficulty: actualDifficulty,
    question_ids: JSON.stringify(questionIds),
    answered_ids: "[]",
    status: "active",
  });

  return jsonResponse({
    success: true,
    sessionId,
    questions: selected.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      reward_amount: q.reward_amount,
      difficulty: q.difficulty,
    })),
    totalQuestions: questionCount,
  });
}

async function quizAnswer(supabase: any, userId: string, body: any) {
  const { sessionId, questionId, selectedOption, timeTaken } = body;
  if (!sessionId || !questionId || selectedOption === undefined) {
    return errorResponse("Missing required fields");
  }
  if (timeTaken !== undefined && timeTaken < 1) {
    return errorResponse("Answer too fast - suspicious activity");
  }

  const { data: sessions, error: sessionError } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).eq("user_id", userId).eq("status", "active").limit(1);
  if (sessionError || !sessions || sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.question_ids);
  const answeredIds = JSON.parse(session.answered_ids || "[]");

  if (!questionIds.includes(questionId)) return errorResponse("Question not in this session");
  if (answeredIds.includes(questionId)) return errorResponse("Question already answered");

  const { data: questions, error: questionError } = await supabase.from("quizzes").select("*").eq("id", questionId).limit(1);
  if (questionError || !questions || questions.length === 0) return errorResponse("Question not found");

  const question = questions[0];
  const isCorrect = Number(selectedOption) === Number(question.correct_option);

  answeredIds.push(questionId);
  const newScore = (session.score || 0) + (isCorrect ? 1 : 0);
  const earnedForThis = isCorrect ? question.reward_amount : 0;
  const newTotalEarned = (session.total_earned || 0) + earnedForThis;

  await supabase.from("quiz_sessions").update({
    answered_ids: JSON.stringify(answeredIds),
    score: newScore,
    total_earned: newTotalEarned,
  }).eq("id", sessionId);

  return jsonResponse({
    success: true,
    isCorrect,
    correctOption: question.correct_option,
    earned: earnedForThis,
    sessionScore: newScore,
    sessionEarned: newTotalEarned,
    answeredCount: answeredIds.length,
    totalQuestions: questionIds.length,
  });
}

async function finishQuiz(supabase: any, userId: string, body: any) {
  const { sessionId } = body;
  if (!sessionId) return errorResponse("Missing sessionId");

  const { data: sessions, error: sessionError } = await supabase.from("quiz_sessions").select("*").eq("id", sessionId).eq("user_id", userId).eq("status", "active").limit(1);
  if (sessionError || !sessions || sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.question_ids);
  const answeredIds = JSON.parse(session.answered_ids || "[]");

  if (answeredIds.length < questionIds.length) {
    return errorResponse(`Answer all questions first (${answeredIds.length}/${questionIds.length})`);
  }

  let totalReward = session.total_earned || 0;
  let bonusReward = 0;
  const score = session.score || 0;

  if (score === questionIds.length) {
    bonusReward = Math.round(totalReward * 0.5);
    totalReward += bonusReward;
  }

  const xpReward = score * 5 + (bonusReward > 0 ? 50 : 0);

  await supabase.from("quiz_sessions").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    total_earned: totalReward,
  }).eq("id", sessionId);

  const { data: profiles, error: profileError } = await supabase.from("user_profiles").select("*").eq("user_id", userId).limit(1);
  if (!profileError && profiles && profiles.length > 0) {
    const profile = profiles[0];
    await supabase.from("user_profiles").update({
      balance: (profile.balance || 0) + totalReward,
      total_earned: (profile.total_earned || 0) + totalReward,
      xp: (profile.xp || 0) + xpReward,
    }).eq("user_id", userId);
  }

  await supabase.from("transactions").insert({
    id: `tx_${Date.now()}_${userId.slice(-4)}`,
    user_id: userId,
    amount: totalReward,
    type: "quiz",
    description: `Quiz completed: ${score}/${questionIds.length} correct${bonusReward > 0 ? " (PERFECT!)" : ""}`,
  });

  await supabase.from("reward_logs").insert({
    id: `log_${Date.now()}_${userId.slice(-4)}`,
    user_id: userId,
    reward_type: "quiz",
    reward_amount: totalReward,
    source_id: sessionId,
    source_type: "quiz_session",
  });

  await trackMetric(supabase, "quiz", totalReward);
  await processReferralCommission(supabase, userId, totalReward, sessionId);

  return jsonResponse({
    success: true,
    score,
    totalQuestions: questionIds.length,
    totalReward,
    bonusReward,
    xp: xpReward,
    isPerfect: score === questionIds.length,
    message: `Quiz complete! ${score}/${questionIds.length} correct. +${totalReward} BIX!`,
  });
}

// ===================== GAME RESULT =====================

async function gameResult(supabase: any, userId: string, body: any) {
  const { gameType, betAmount } = body;
  if (!gameType || !betAmount) return errorResponse("Missing game parameters");
  if (betAmount < 10 || betAmount > 1000) return errorResponse("Bet must be between 10-1000 BIX");

  const { data: profiles, error } = await supabase.from("user_profiles").select("*").eq("user_id", userId).limit(1);
  if (error || !profiles || profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  if ((profile.balance || 0) < betAmount) return errorResponse("Insufficient balance");

  let multiplier = 0;
  let resultMsg = "Better luck next time!";

  if (gameType === "roulette") {
    const roll = Math.random();
    if (roll > 0.9) { multiplier = 5; resultMsg = "JACKPOT! 5x!"; }
    else if (roll > 0.6) { multiplier = 2; resultMsg = "Nice! 2x win!"; }
  } else if (gameType === "coinflip") {
    const flip = Math.random() > 0.5;
    if (flip) { multiplier = 2; resultMsg = "You won!"; }
  }

  const netChange = (betAmount * multiplier) - betAmount;

  await supabase.from("user_profiles").update({
    balance: (profile.balance || 0) + netChange,
  }).eq("user_id", userId);

  await supabase.from("transactions").insert({
    id: `tx_${Date.now()}_${userId.slice(-4)}`,
    user_id: userId,
    amount: netChange,
    type: "game",
    description: `${gameType} ${multiplier > 0 ? "WIN" : "LOSS"} (${multiplier}x)`,
  });

  await trackMetric(supabase, "game", netChange > 0 ? netChange : 0);

  return jsonResponse({
    success: true,
    multiplier,
    netChange,
    newBalance: (profile.balance || 0) + netChange,
    message: resultMsg,
  });
}

// ===================== PENDING REWARDS =====================

async function getPendingRewards(supabase: any, userId: string) {
  const { data: pending, error } = await supabase.from("pending_rewards").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;

  return jsonResponse({ success: true, pending });
}

// ===================== ADMIN METRICS =====================

async function adminGetMetrics(supabase: any, userId: string) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { data: metrics, error: metricsError } = await supabase.from("platform_metrics").select("*").order("metric_date", { ascending: false }).limit(30);
  if (metricsError) throw metricsError;

  // Get total users count
  const { count: totalUsers, error: totalUsersError } = await supabase.from("user_profiles").count({ exact: true });
  if (totalUsersError) throw totalUsersError;

  const { count: flaggedCount, error: flaggedCountError } = await supabase.from("abuse_flags").count({ exact: true }).eq("resolved", 0);
  if (flaggedCountError) throw flaggedCountError;

  return jsonResponse({
    success: true,
    metrics,
    totalUsers,
    flaggedAccounts: flaggedCount,
  });
}

async function adminGetAbuseFlags(supabase: any, userId: string) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { data: flags, error } = await supabase.from("abuse_flags").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;

  return jsonResponse({ success: true, flags });
}

async function adminResolveFlag(supabase: any, userId: string, body: any) {
  if (!(await verifyAdmin(supabase, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { flagId } = body;
  if (!flagId) return errorResponse("Missing flagId");

  const { error } = await supabase.from("abuse_flags").update({
    resolved: 1,
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
  }).eq("id", flagId);

  if (error) return errorResponse("Failed to resolve flag");

  return jsonResponse({ success: true, message: "Flag resolved" });
}

Deno.serve(handler);
