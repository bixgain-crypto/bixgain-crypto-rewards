import { createClient } from "npm:@blinkdotnew/sdk";

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

// ===================== XP AND LEVELING SYSTEM =====================
const XP_PER_LEVEL = 1000000;

function calculateLevel(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

// Helper to update user profile with XP and balance, handling level ups
async function updateUserBalanceAndXP(blink: any, userId: string, data: { balanceChange: number; earnedChange: number; xpChange: number }) {
  const profile = await blink.db.table("user_profiles").get(userId);
  if (!profile) return null;

  const newXP = (profile.xp || 0) + data.xpChange;
  const newLevel = calculateLevel(newXP);
  const leveledUp = newLevel > (profile.level || 1);

  const updateData: any = {
    balance: (profile.balance || 0) + data.balanceChange,
    totalEarned: (profile.totalEarned || 0) + data.earnedChange,
    xp: newXP,
    level: newLevel,
  };

  await blink.db.table("user_profiles").update(userId, updateData);
  
  return { ...profile, ...updateData, leveledUp };
}

// ===================== ABUSE DETECTION =====================
async function checkAbuseThrottling(blink: any, userId: string, ipHash: string): Promise<{ allowed: boolean; multiplier: number; reason?: string }> {
  // Check if user is flagged
  const flags = await blink.db.table("abuse_flags").list({
    where: { userId, resolved: 0 },
    limit: 10,
  });

  const highSeverityFlags = flags.filter((f: any) => f.severity === "high" || f.severity === "critical");
  if (highSeverityFlags.length > 0) {
    return { allowed: false, multiplier: 0, reason: "Account flagged for review" };
  }

  // Behavior-based multiplier: reduce rewards for suspicious patterns
  let multiplier = 1.0;

  // Check redemption velocity - last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recentRedemptions = await blink.db.table("redemptions").list({
    where: { userId },
    orderBy: { redeemedAt: "desc" },
    limit: 20,
  });
  const recentCount = recentRedemptions.filter((r: any) => r.redeemedAt > tenMinAgo).length;

  if (recentCount >= 5) {
    multiplier *= 0.5; // Half rewards if redeeming too fast
  }

  // Check multi-account from same IP (last 24h)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ipRedemptions = await blink.db.table("redemptions").list({
    where: { ipHash },
    orderBy: { redeemedAt: "desc" },
    limit: 50,
  });

  const uniqueUsersFromIP = new Set(
    ipRedemptions.filter((r: any) => r.redeemedAt > dayAgo).map((r: any) => r.userId)
  );

  if (uniqueUsersFromIP.size > 3) {
    // Flag suspicious cluster
    await blink.db.table("abuse_flags").create({
      id: `af_${Date.now()}_${userId.slice(-4)}`,
      userId,
      flagType: "multi_account_ip",
      severity: "medium",
      details: JSON.stringify({ ipHash, accountCount: uniqueUsersFromIP.size }),
    });
    multiplier *= 0.25;
  }

  // Low-severity flags reduce multiplier slightly
  if (flags.length > 0 && flags.length < 3) {
    multiplier *= 0.75;
  }

  return { allowed: true, multiplier: Math.max(multiplier, 0.1) };
}

// ===================== METRICS TRACKING =====================
async function trackMetric(blink: any, rewardType: string, amount: number) {
  const today = new Date().toISOString().split("T")[0];
  const metricId = `pm_${today}`;

  try {
    const existing = await blink.db.table("platform_metrics").list({
      where: { metricDate: today },
      limit: 1,
    });

    const fieldMap: Record<string, string> = {
      task: "taskRewardsIssued",
      referral: "referralRewardsIssued",
      quiz: "quizRewardsIssued",
      game: "gameRewardsIssued",
      code: "codeRewardsIssued",
      daily: "taskRewardsIssued",
    };

    const field = fieldMap[rewardType] || "taskRewardsIssued";

    if (existing.length > 0) {
      const m = existing[0];
      await blink.db.table("platform_metrics").update(m.id, {
        totalRewardsIssued: (m.totalRewardsIssued || 0) + amount,
        totalDailyRewards: (m.totalDailyRewards || 0) + amount,
        [field]: (m[field] || 0) + amount,
      });
    } else {
      await blink.db.table("platform_metrics").create({
        id: metricId,
        metricDate: today,
        totalRewardsIssued: amount,
        totalDailyRewards: amount,
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

    if (!projectId || !secretKey) {
      return errorResponse("Missing server config", 500);
    }

    const blink = createClient({ projectId, secretKey });

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
    await autoProcessPending(blink, userId);

    switch (action) {
      case "process_referral":
        return await processReferral(blink, userId, body, ipHash);
      case "complete_task":
        return await completeTask(blink, userId, body);
      case "daily_checkin":
        return await dailyCheckin(blink, userId);
      case "start_quiz":
        return await startQuiz(blink, userId, body);
      case "quiz_answer":
        return await quizAnswer(blink, userId, body);
      case "finish_quiz":
        return await finishQuiz(blink, userId, body);
      case "game_result":
        return await gameResult(blink, userId, body);
      // New secure task code system
      case "redeem_task_code":
        return await redeemTaskCode(blink, userId, body, ipHash, deviceHash, userAgent);
      case "admin_generate_code_window":
        return await adminGenerateCodeWindow(blink, userId, body);
      case "admin_list_code_windows":
        return await adminListCodeWindows(blink, userId, body);
      case "admin_disable_code_window":
        return await adminDisableCodeWindow(blink, userId, body);
      case "admin_get_metrics":
        return await adminGetMetrics(blink, userId);
      case "admin_get_abuse_flags":
        return await adminGetAbuseFlags(blink, userId);
      case "admin_resolve_flag":
        return await adminResolveFlag(blink, userId, body);
      case "get_pending_rewards":
        return await getPendingRewards(blink, userId);
      // Legacy compat
      case "verify_reward_code":
        return await redeemTaskCode(blink, userId, body, ipHash, deviceHash, userAgent);
      case "admin_generate_code":
        return await adminGenerateCodeWindow(blink, userId, body);
      default:
        return errorResponse("Invalid action");
    }
  } catch (error) {
    console.error("Reward engine error:", error);
    return errorResponse("Internal server error", 500);
  }
}

// ===================== ADMIN CHECK =====================
async function verifyAdmin(blink: any, userId: string): Promise<boolean> {
  const profile = await blink.db.table("user_profiles").get(userId);
  return profile?.role === "admin";
}

// ===================== TASK CODE WINDOW SYSTEM =====================

async function adminGenerateCodeWindow(blink: any, userId: string, body: any) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const {taskId, validHours = 3, maxRedemptions} = body;

  // Validate task exists
  if (taskId) {
    const tasks = await blink.db.table("tasks").list({ where: { id: taskId }, limit: 1 });
    if (tasks.length === 0) return errorResponse("Task not found");
  }

  // Check max 4 active windows per task per day
  const today = new Date().toISOString().split("T")[0];
  const existingWindows = await blink.db.table("task_code_windows").list({
    where: taskId ? { taskId, isActive: 1 } : { isActive: 1 },
    limit: 50,
  });

  const todayWindows = existingWindows.filter(
    (w: any) => w.createdAt && w.createdAt.startsWith(today) && (!taskId || w.taskId === taskId)
  );

  if (taskId && todayWindows.length >= 4) {
    return errorResponse("Maximum 4 code windows per task per day");
  }

  const code = generateSecureCode(8);
  const now = new Date();
  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + validHours * 60 * 60 * 1000).toISOString();
  const windowId = `cw_${Date.now()}_${code.slice(0, 4)}`;

  await blink.db.table("task_code_windows").create({
    id: windowId,
    taskId: taskId || "general",
    code,
    validFrom,
    validUntil,
    maxRedemptions: maxRedemptions || null,
    currentRedemptions: 0,
    isActive: 1,
    createdByAdmin: userId,
  });

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

async function adminListCodeWindows(blink: any, userId: string, body: any) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { activeOnly = true } = body;
  const where: Record<string, unknown> = {};
  if (activeOnly) where.isActive = 1;

  const windows = await blink.db.table("task_code_windows").list({
    where,
    orderBy: { createdAt: "desc" },
    limit: 50,
  });

  // Add remaining time info
  const now = Date.now();
  const enriched = windows.map((w: any) => {
    const validUntil = new Date(w.validUntil).getTime();
    const remainingMs = Math.max(0, validUntil - now);
    const expired = remainingMs === 0;
    return {
      ...w,
      remainingMinutes: Math.round(remainingMs / 60000),
      expired,
      utilizationPercent: w.maxRedemptions
        ? Math.round(((w.currentRedemptions || 0) / w.maxRedemptions) * 100)
        : null,
    };
  });

  return jsonResponse({ success: true, windows: enriched });
}

async function adminDisableCodeWindow(blink: any, userId: string, body: any) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { windowId } = body;
  if (!windowId) return errorResponse("Missing windowId");

  await blink.db.table("task_code_windows").update(windowId, { isActive: 0 });

  return jsonResponse({ success: true, message: "Code window disabled" });
}

// ===================== SECURE CODE REDEMPTION =====================

async function redeemTaskCode(
  blink: any,
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
  const windows = await blink.db.table("task_code_windows").list({
    where: { code: cleanCode, isActive: 1 },
    limit: 1,
  });

  if (windows.length === 0) {
    const failCount = trackFailedAttempt(`lockout:${userId}`);
    if (failCount >= 8) {
      await blink.db.table("abuse_flags").create({
        id: `af_${Date.now()}_${userId.slice(-4)}`,
        userId,
        flagType: "brute_force_codes",
        severity: "medium",
        details: JSON.stringify({ failedAttempts: failCount, ipHash }),
      });
    }
    return errorResponse("Invalid or expired code");
  }

  const window = windows[0];
  const now = new Date();

  // 2. Check time validity
  if (now < new Date(window.validFrom) || now > new Date(window.validUntil)) {
    trackFailedAttempt(`lockout:${userId}`);
    return errorResponse("Code has expired or not yet active");
  }

  // 3. Check max redemptions
  if (window.maxRedemptions && (window.currentRedemptions || 0) >= window.maxRedemptions) {
    return errorResponse("Code has reached maximum redemptions");
  }

  // 4. Check duplicate redemption
  const existingRedemption = await blink.db.table("redemptions").list({
    where: { userId, windowId: window.id },
    limit: 1,
  });

  if (existingRedemption.length > 0) {
    return errorResponse("You already redeemed this code");
  }

  // 5. Abuse throttling check
  const abuseCheck = await checkAbuseThrottling(blink, userId, ipHash);
  if (!abuseCheck.allowed) {
    return errorResponse(abuseCheck.reason || "Account under review");
  }

  // 6. Get task reward amount
  let rewardAmount = 100; // Default if general code
  if (window.taskId && window.taskId !== "general") {
    const tasks = await blink.db.table("tasks").list({
      where: { id: window.taskId },
      limit: 1,
    });
    if (tasks.length > 0) {
      rewardAmount = tasks[0].rewardAmount || 100;
    }
  }

  // Apply abuse multiplier
  rewardAmount = Math.round(rewardAmount * abuseCheck.multiplier);

  // 7. Get user profile
  const profiles = await blink.db.table("user_profiles").list({
    where: { userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");
  const profile = profiles[0];

  // 8. Execute atomically
  try {
    // Record redemption
    await blink.db.table("redemptions").create({
      id: `rd_${Date.now()}_${userId.slice(-4)}`,
      userId,
      taskId: window.taskId || "general",
      windowId: window.id,
      redeemedAt: now.toISOString(),
      ipHash,
      deviceHash,
      userAgent: userAgent.slice(0, 200),
    });

    // Increment window redemption count
    await blink.db.table("task_code_windows").update(window.id, {
      currentRedemptions: (window.currentRedemptions || 0) + 1,
    });

    // Update user balance and XP
    const updatedProfile = await updateUserBalanceAndXP(blink, userId, {
      balanceChange: rewardAmount,
      earnedChange: rewardAmount,
      xpChange: 100, // Significant XP for code redemption
    });

    // Log transaction
    await blink.db.table("transactions").create({
      userId,
      amount: rewardAmount,
      type: "code_redemption",
      description: `Redeemed code: ${cleanCode.slice(0, 3)}***`,
    });

    // Audit log
    await blink.db.table("reward_logs").create({
      userId,
      rewardType: "code_redemption",
      rewardAmount,
      sourceId: window.id,
      sourceType: "task_code_window",
      ipHash,
    });

    // Track metrics
    await trackMetric(blink, "code", rewardAmount);

    // Process referral commission (10% of earned reward to referrer)
    await processReferralCommission(blink, userId, rewardAmount, window.id);

    return jsonResponse({
      success: true,
      reward: rewardAmount,
      multiplier: abuseCheck.multiplier,
      newBalance: updatedProfile?.balance,
      newLevel: updatedProfile?.level,
      leveledUp: updatedProfile?.leveledUp,
      message: `+${rewardAmount} BIX earned!${updatedProfile?.leveledUp ? " LEVEL UP!" : ""}`,
    });
  } catch (err) {
    console.error("Redemption error:", err);
    return errorResponse("Failed to process redemption", 500);
  }
}

// ===================== REFERRAL COMMISSION SYSTEM =====================

async function processReferralCommission(blink: any, userId: string, earnedAmount: number, sourceId: string) {
  try {
    const profile = await blink.db.table("user_profiles").get(userId);
    if (!profile?.referredBy) return; // No referrer

    const referrerId = profile.referredBy;

    // Check referral qualification: referred user must have completed 2+ tasks
    const completedTasks = await blink.db.table("user_tasks").list({
      where: { userId, status: "completed" },
      limit: 5,
    });

    // Also count redemptions
    const redemptions = await blink.db.table("redemptions").list({
      where: { userId },
      limit: 5,
    });

    const totalActivity = completedTasks.length + redemptions.length;
    if (totalActivity < 2) return; // Not enough activity to qualify

    // Check IP match between referrer and referred (anti-fraud)
    const referrerRedemptions = await blink.db.table("redemptions").list({
      where: { userId: referrerId },
      orderBy: { redeemedAt: "desc" },
      limit: 5,
    });
    const referredRedemptions = await blink.db.table("redemptions").list({
      where: { userId },
      orderBy: { redeemedAt: "desc" },
      limit: 5,
    });

    const referrerIPs = new Set(referrerRedemptions.map((r: any) => r.ipHash).filter(Boolean));
    const referredIPs = new Set(referredRedemptions.map((r: any) => r.ipHash).filter(Boolean));
    const ipOverlap = [...referrerIPs].some((ip) => referredIPs.has(ip));

    if (ipOverlap) {
      // Flag but don't block — reduce commission
      await blink.db.table("abuse_flags").create({
        id: `af_${Date.now()}_refip`,
        userId,
        flagType: "referral_ip_match",
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

    await blink.db.table("referral_commissions").create({
      id: `rc_${Date.now()}_${referrerId.slice(-4)}`,
      referrerId,
      referredId: userId,
      sourceRewardId: sourceId,
      commissionAmount,
      status: "pending",
      eligibleAt,
      userId: "system",
    });
  } catch (err) {
    console.error("Referral commission error:", err);
  }
}

// ===================== AUTO-PROCESS PENDING =====================

async function autoProcessPending(blink: any, userId: string) {
  try {
    const now = new Date().toISOString();

    // Process pending rewards
    const pending = await blink.db.table("pending_rewards").list({
      where: { userId, status: "pending" },
      limit: 20,
    });

    for (const item of pending) {
      if (item.processAt && item.processAt <= now) {
        await processReward(blink, item);
      }
    }

    // Process eligible referral commissions for the referrer
    const pendingCommissions = await blink.db.table("referral_commissions").list({
      where: { referrerId: userId, status: "pending" },
      limit: 20,
    });

    for (const comm of pendingCommissions) {
      if (comm.eligibleAt && comm.eligibleAt <= now) {
        await processCommission(blink, comm);
      }
    }
  } catch (err) {
    console.error("Auto-process error:", err);
  }
}

async function processReward(blink: any, item: any) {
  try {
    const updatedProfile = await updateUserBalanceAndXP(blink, item.userId, {
      balanceChange: item.rewardAmount,
      earnedChange: item.rewardAmount,
      xpChange: 50,
    });

    await blink.db.table("pending_rewards").update(item.id, { status: "processed" });

    await blink.db.table("transactions").create({
      userId: item.userId,
      amount: item.rewardAmount,
      type: item.rewardType || "verification",
      description: `Delayed reward processed`,
    });

    await blink.db.table("reward_logs").create({
      userId: item.userId,
      rewardType: item.rewardType || "verification",
      rewardAmount: item.rewardAmount,
      sourceId: item.sourceId,
      sourceType: item.sourceType || "pending_reward",
    });
  } catch (err) {
    console.error(`Failed to process reward ${item.id}:`, err);
  }
}

async function processCommission(blink: any, comm: any) {
  try {
    const updatedProfile = await updateUserBalanceAndXP(blink, comm.referrerId, {
      balanceChange: comm.commissionAmount,
      earnedChange: comm.commissionAmount,
      xpChange: 25,
    });

    await blink.db.table("referral_commissions").update(comm.id, {
      status: "processed",
      processedAt: new Date().toISOString(),
    });

    await blink.db.table("transactions").create({
      userId: comm.referrerId,
      amount: comm.commissionAmount,
      type: "referral_commission",
      description: `Referral commission from user activity`,
    });

    await trackMetric(blink, "referral", comm.commissionAmount);
  } catch (err) {
    console.error(`Failed to process commission ${comm.id}:`, err);
  }
}

// ===================== REFERRAL SYSTEM =====================

async function processReferral(blink: any, newUserId: string, body: any, ipHash: string) {
  const { referralCode } = body;
  if (!referralCode || typeof referralCode !== "string") {
    return errorResponse("Invalid referral code");
  }

  const referrers = await blink.db.table("user_profiles").list({
    where: { referralCode },
    limit: 1,
  });

  if (referrers.length === 0) {
    return errorResponse("Invalid referral code - referrer not found");
  }

  const referrer = referrers[0];

  if (referrer.userId === newUserId) {
    return errorResponse("Cannot refer yourself");
  }

  // Check if user was already referred
  const newUserProfiles = await blink.db.table("user_profiles").list({
    where: { userId: newUserId },
    limit: 1,
  });
  if (newUserProfiles.length > 0 && newUserProfiles[0].referredBy) {
    return errorResponse("User already has a referrer");
  }

  // Check duplicate
  const existingReferral = await blink.db.table("referral_history").list({
    where: { referredId: newUserId },
    limit: 1,
  });
  if (existingReferral.length > 0) {
    return errorResponse("Referral already processed");
  }

  // Anti-fraud: IP match check
  const referrerRedemptions = await blink.db.table("redemptions").list({
    where: { userId: referrer.userId },
    limit: 5,
  });
  const referrerIPs = new Set(referrerRedemptions.map((r: any) => r.ipHash).filter(Boolean));

  if (referrerIPs.has(ipHash)) {
    await blink.db.table("abuse_flags").create({
      id: `af_${Date.now()}_selfref`,
      userId: newUserId,
      flagType: "referral_same_ip",
      severity: "high",
      details: JSON.stringify({ referrerId: referrer.userId, ipHash }),
    });
    return errorResponse("Referral rejected: suspicious activity detected");
  }

  // Anti-fraud: cap referrals per day
  const today = new Date().toISOString().split("T")[0];
  const recentReferrals = await blink.db.table("referral_history").list({
    where: { referrerId: referrer.userId },
    limit: 50,
  });
  const todayReferrals = recentReferrals.filter(
    (r: any) => r.createdAt && r.createdAt.startsWith(today)
  );
  if (todayReferrals.length >= 10) {
    return errorResponse("Referrer daily limit reached");
  }

  // Referral reward is delayed: mark referredBy but don't grant referrer reward yet
  // Referrer earns only after referred user completes 2-3 tasks
  const NEW_USER_REWARD = 50;

  try {
    // 1. Create referral history (pending status)
    await blink.db.table("referral_history").create({
      referrerId: referrer.userId,
      referredId: newUserId,
      rewardAmount: 0, // Will be set when qualified
      userId: "system", // System record for shared-data reads
    });

    // 2. Update new user: mark referred_by + grant signup bonus
    await blink.db.table("user_profiles").update(newUserId, {
      referredBy: referrer.userId,
    });

    const updatedProfile = await updateUserBalanceAndXP(blink, newUserId, {
      balanceChange: NEW_USER_REWARD,
      earnedChange: NEW_USER_REWARD,
      xpChange: 100,
    });

    // 3. Log new user transaction
    await blink.db.table("transactions").create({
      userId: newUserId,
      amount: NEW_USER_REWARD,
      type: "referral",
      description: `Referral bonus: joined via ${referralCode}`,
    });

    // 4. Schedule referrer reward with 24h delay
    const eligibleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await blink.db.table("referral_commissions").create({
      id: `rc_signup_${Date.now()}_${referrer.userId.slice(-4)}`,
      referrerId: referrer.userId,
      referredId: newUserId,
      sourceRewardId: "signup_referral",
      commissionAmount: 100, // Referrer reward
      status: "pending",
      eligibleAt,
      userId: "system",
    });

    await trackMetric(blink, "referral", NEW_USER_REWARD);

    return jsonResponse({
      success: true,
      newUserReward: NEW_USER_REWARD,
      newBalance: updatedProfile?.balance,
      newLevel: updatedProfile?.level,
      leveledUp: updatedProfile?.leveledUp,
      message: `Referral successful! You earned ${NEW_USER_REWARD} BIX. Your referrer will be rewarded after verification.`,
    });
  } catch (err) {
    console.error("Referral processing error:", err);
    return errorResponse("Failed to process referral", 500);
  }
}

// ===================== TASK SYSTEM =====================

async function completeTask(blink: any, userId: string, body: any) {
  const { taskId } = body;
  if (!taskId) return errorResponse("Missing taskId");

  const tasks = await blink.db.table("tasks").list({ where: { id: taskId }, limit: 1 });
  if (tasks.length === 0) return errorResponse("Task not found");

  const task = tasks[0];
  if (!task.isActive) return errorResponse("Task is no longer active");

  const profiles = await blink.db.table("user_profiles").list({ where: { userId }, limit: 1 });
  if (profiles.length === 0) return errorResponse("Profile not found");
  const profile = profiles[0];

  const userLevel = profile.level || Math.floor((profile.xp || 0) / 1000000) + 1;
  if (task.requiredLevel && userLevel < task.requiredLevel) {
    return errorResponse(`Requires Level ${task.requiredLevel}`);
  }

  const existingCompletions = await blink.db.table("user_tasks").list({
    where: { userId, taskId },
    limit: 10,
  });

  if (task.taskType === "one_time" && existingCompletions.length > 0) {
    return errorResponse("Task already completed");
  }

  if (task.taskType === "daily") {
    const today = new Date().toISOString().split("T")[0];
    const completedToday = existingCompletions.some(
      (c: any) => c.completedAt && c.completedAt.startsWith(today)
    );
    if (completedToday) return errorResponse("Daily task already completed today");
  }

  if (task.category === "referral") {
    const referralCount = await blink.db.table("referral_history").count({
      where: { referrerId: userId },
    });
    const requiredCount = taskId === "task_refer_1" ? 1 : taskId === "task_refer_5" ? 5 : 25;
    if (referralCount < requiredCount) {
      return errorResponse(`Need ${requiredCount} referrals to claim`);
    }
  }

  if (task.category === "milestone") {
    if (taskId === "task_earn_1000" && (profile.totalEarned || 0) < 1000)
      return errorResponse("Need 1,000 BIX total earnings");
    if (taskId === "task_earn_10000" && (profile.totalEarned || 0) < 10000)
      return errorResponse("Need 10,000 BIX total earnings");
    if (taskId === "task_streak_7" && (profile.dailyStreak || 0) < 7)
      return errorResponse("Need 7-day login streak");
  }

  const reward = task.rewardAmount || 0;
  const xpReward = task.xpReward || 100;

  try {
    await blink.db.table("user_tasks").create({
      userId,
      taskId,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    const updatedProfile = await updateUserBalanceAndXP(blink, userId, {
      balanceChange: reward,
      earnedChange: reward,
      xpChange: xpReward,
    });

    await blink.db.table("transactions").create({
      userId,
      amount: reward,
      type: "task",
      description: `Completed: ${task.title}`,
    });

    await blink.db.table("reward_logs").create({
      userId,
      rewardType: "task",
      rewardAmount: reward,
      sourceId: taskId,
      sourceType: task.category,
    });

    await trackMetric(blink, "task", reward);
    await processReferralCommission(blink, userId, reward, taskId);

    return jsonResponse({
      success: true,
      reward,
      xp: xpReward,
      newBalance: updatedProfile?.balance,
      newLevel: updatedProfile?.level,
      leveledUp: updatedProfile?.leveledUp,
      message: `+${reward} BIX earned!${updatedProfile?.leveledUp ? " LEVEL UP!" : ""}`,
    });
  } catch (err) {
    console.error("Task completion error:", err);
    return errorResponse("Failed to complete task", 500);
  }
}

// ===================== DAILY CHECK-IN =====================

async function dailyCheckin(blink: any, userId: string) {
  const profiles = await blink.db.table("user_profiles").list({ where: { userId }, limit: 1 });
  if (profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  const today = new Date().toISOString().split("T")[0];

  if (profile.lastLogin === today) {
    return errorResponse("Already checked in today");
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (profile.lastLogin === yesterdayStr) {
    newStreak = (profile.dailyStreak || 0) + 1;
  }

  const multiplier = Math.min(1 + (newStreak - 1) * 0.5, 5);
  const baseReward = 10;
  const reward = Math.round(baseReward * multiplier);
  const xpReward = 50 + (newStreak * 10);

  try {
    const updatedProfile = await updateUserBalanceAndXP(blink, userId, {
      balanceChange: reward,
      earnedChange: reward,
      xpChange: xpReward,
    });

    await blink.db.table("user_profiles").update(userId, {
      lastLogin: today,
      dailyStreak: newStreak,
    });

    await blink.db.table("transactions").create({
      userId,
      amount: reward,
      type: "daily",
      description: `Daily check-in (${newStreak}-day streak, ${multiplier}x multiplier)`,
    });

    // Track active user
    const metricDate = today;
    const existing = await blink.db.table("platform_metrics").list({
      where: { metricDate },
      limit: 1,
    });
    if (existing.length > 0) {
      await blink.db.table("platform_metrics").update(existing[0].id, {
        activeUsersToday: (existing[0].activeUsersToday || 0) + 1,
      });
    }

    await trackMetric(blink, "daily", reward);

    return jsonResponse({
      success: true,
      reward,
      streak: newStreak,
      multiplier,
      xp: xpReward,
      newBalance: updatedProfile?.balance,
      newLevel: updatedProfile?.level,
      leveledUp: updatedProfile?.leveledUp,
      message: `+${reward} BIX! ${newStreak}-day streak (${multiplier}x)`,
    });
  } catch (err) {
    console.error("Daily checkin error:", err);
    return errorResponse("Failed to process check-in", 500);
  }
}

// ===================== QUIZ SYSTEM =====================

async function startQuiz(blink: any, userId: string, body: any) {
  const { questionCount = 10, difficulty = "easy" } = body;
  const validCounts = [5, 10, 20, 50];
  if (!validCounts.includes(questionCount)) {
    return errorResponse("Invalid question count. Choose 5, 10, 20, or 50");
  }

  const activeSessions = await blink.db.table("quiz_sessions").list({
    where: { userId, status: "active" },
    limit: 1,
  });
  if (activeSessions.length > 0) {
    const session = activeSessions[0];
    const startedAt = new Date(session.startedAt).getTime();
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      await blink.db.table("quiz_sessions").update(session.id, { status: "expired" });
    } else {
      return errorResponse("You already have an active quiz session");
    }
  }

  const allQuestions = await blink.db.table("quizzes").list({
    where: { difficulty },
    limit: 200,
  });

  let questions = allQuestions;
  let actualDifficulty = difficulty;
  if (allQuestions.length < questionCount) {
    questions = await blink.db.table("quizzes").list({ limit: 200 });
    actualDifficulty = "mixed";
    if (questions.length < questionCount) {
      return errorResponse("Not enough questions available");
    }
  }

  const shuffled = questions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, questionCount);
  const questionIds = selected.map((q: any) => q.id);

  const sessionId = `qs_${userId.slice(-6)}_${Date.now()}`;
  await blink.db.table("quiz_sessions").create({
    id: sessionId,
    userId,
    questionCount,
    difficulty: actualDifficulty,
    questionIds: JSON.stringify(questionIds),
    answeredIds: "[]",
    status: "active",
  });

  return jsonResponse({
    success: true,
    sessionId,
    questions: selected.map((q: any) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      rewardAmount: q.rewardAmount,
      difficulty: q.difficulty,
    })),
    totalQuestions: questionCount,
  });
}

async function quizAnswer(blink: any, userId: string, body: any) {
  const { sessionId, questionId, selectedOption, timeTaken } = body;
  if (!sessionId || !questionId || selectedOption === undefined) {
    return errorResponse("Missing required fields");
  }
  if (timeTaken !== undefined && timeTaken < 1) {
    return errorResponse("Answer too fast - suspicious activity");
  }

  const sessions = await blink.db.table("quiz_sessions").list({
    where: { id: sessionId, userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.questionIds);
  const answeredIds = JSON.parse(session.answeredIds || "[]");

  if (!questionIds.includes(questionId)) return errorResponse("Question not in this session");
  if (answeredIds.includes(questionId)) return errorResponse("Question already answered");

  const questions = await blink.db.table("quizzes").list({ where: { id: questionId }, limit: 1 });
  if (questions.length === 0) return errorResponse("Question not found");

  const question = questions[0];
  const isCorrect = Number(selectedOption) === Number(question.correctOption);

  answeredIds.push(questionId);
  const newScore = (session.score || 0) + (isCorrect ? 1 : 0);
  const earnedForThis = isCorrect ? question.rewardAmount : 0;
  const newTotalEarned = (session.totalEarned || 0) + earnedForThis;

  await blink.db.table("quiz_sessions").update(sessionId, {
    answeredIds: JSON.stringify(answeredIds),
    score: newScore,
    totalEarned: newTotalEarned,
  });

  return jsonResponse({
    success: true,
    isCorrect,
    correctOption: question.correctOption,
    earned: earnedForThis,
    sessionScore: newScore,
    sessionEarned: newTotalEarned,
    answeredCount: answeredIds.length,
    totalQuestions: questionIds.length,
  });
}

async function finishQuiz(blink: any, userId: string, body: any) {
  const { sessionId } = body;
  if (!sessionId) return errorResponse("Missing sessionId");

  const sessions = await blink.db.table("quiz_sessions").list({
    where: { id: sessionId, userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.questionIds);
  const answeredIds = JSON.parse(session.answeredIds || "[]");

  if (answeredIds.length < questionIds.length) {
    return errorResponse(`Answer all questions first (${answeredIds.length}/${questionIds.length})`);
  }

  let totalReward = session.totalEarned || 0;
  let bonusReward = 0;
  const score = session.score || 0;

  if (score === questionIds.length) {
    bonusReward = Math.round(totalReward * 0.5);
    totalReward += bonusReward;
  }

  const xpReward = score * 10 + (bonusReward > 0 ? 500 : 0);

  await blink.db.table("quiz_sessions").update(sessionId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    totalEarned: totalReward,
  });

  const updatedProfile = await updateUserBalanceAndXP(blink, userId, {
    balanceChange: totalReward,
    earnedChange: totalReward,
    xpChange: xpReward,
  });

  await blink.db.table("transactions").create({
    userId,
    amount: totalReward,
    type: "quiz",
    description: `Quiz completed: ${score}/${questionIds.length} correct${bonusReward > 0 ? " (PERFECT!)" : ""}`,
  });

  await blink.db.table("reward_logs").create({
    userId,
    rewardType: "quiz",
    rewardAmount: totalReward,
    sourceId: sessionId,
    sourceType: "quiz_session",
  });

  await trackMetric(blink, "quiz", totalReward);
  await processReferralCommission(blink, userId, totalReward, sessionId);

  return jsonResponse({
    success: true,
    score,
    totalQuestions: questionIds.length,
    totalReward,
    bonusReward,
    xp: xpReward,
    newBalance: updatedProfile?.balance,
    newLevel: updatedProfile?.level,
    leveledUp: updatedProfile?.leveledUp,
    isPerfect: score === questionIds.length,
    message: `Quiz complete! ${score}/${questionIds.length} correct. +${totalReward} BIX!`,
  });
}

// ===================== GAME RESULT =====================

async function gameResult(blink: any, userId: string, body: any) {
  const { gameType, betAmount } = body;
  if (!gameType || !betAmount) return errorResponse("Missing game parameters");
  if (betAmount < 10 || betAmount > 1000) return errorResponse("Bet must be between 10-1000 BIX");

  const profiles = await blink.db.table("user_profiles").list({ where: { userId }, limit: 1 });
  if (profiles.length === 0) return errorResponse("Profile not found");

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

  // Add XP and track total earned only if they WON
  if (netChange > 0) {
    await updateUserBalanceAndXP(blink, userId, {
      balanceChange: netChange,
      earnedChange: netChange,
      xpChange: Math.round(netChange / 10), // 1 XP for every 10 BIX won
    });
  } else {
    // If they lost, only deduct balance
    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + netChange,
    });
  }

  await blink.db.table("transactions").create({
    userId,
    amount: netChange,
    type: "game",
    description: `${gameType} ${multiplier > 0 ? "WIN" : "LOSS"} (${multiplier}x)`,
  });

  await trackMetric(blink, "game", netChange > 0 ? netChange : 0);

  return jsonResponse({
    success: true,
    multiplier,
    netChange,
    newBalance: (profile.balance || 0) + netChange,
    message: resultMsg,
  });
}

// ===================== PENDING REWARDS =====================

async function getPendingRewards(blink: any, userId: string) {
  const pending = await blink.db.table("pending_rewards").list({
    where: { userId },
    orderBy: { createdAt: "desc" },
    limit: 20,
  });

  return jsonResponse({ success: true, pending });
}

// ===================== ADMIN METRICS =====================

async function adminGetMetrics(blink: any, userId: string) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const metrics = await blink.db.table("platform_metrics").list({
    orderBy: { metricDate: "desc" },
    limit: 30,
  });

  // Get total users count
  const totalUsers = await blink.db.table("user_profiles").count({});
  const flaggedCount = await blink.db.table("abuse_flags").count({ where: { resolved: 0 } });

  return jsonResponse({
    success: true,
    metrics,
    totalUsers,
    flaggedAccounts: flaggedCount,
  });
}

async function adminGetAbuseFlags(blink: any, userId: string) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const flags = await blink.db.table("abuse_flags").list({
    orderBy: { createdAt: "desc" },
    limit: 50,
  });

  return jsonResponse({ success: true, flags });
}

async function adminResolveFlag(blink: any, userId: string, body: any) {
  if (!(await verifyAdmin(blink, userId))) {
    return errorResponse("Admin access required", 403);
  }

  const { flagId } = body;
  if (!flagId) return errorResponse("Missing flagId");

  await blink.db.table("abuse_flags").update(flagId, {
    resolved: 1,
    resolvedBy: userId,
    resolvedAt: new Date().toISOString(),
  });

  return jsonResponse({ success: true, message: "Flag resolved" });
}

Deno.serve(handler);
