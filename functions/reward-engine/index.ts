import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
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

// Rate limiting map (in-memory per instance)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string, action: string, maxPerMinute = 10): boolean {
  const key = `${userId}:${action}`;
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

    // Rate limiting
    if (!checkRateLimit(userId, action, action === "quiz_answer" ? 30 : 10)) {
      return errorResponse("Rate limited. Try again later.", 429);
    }

    // Auto-process pending rewards for this user whenever they hit the engine
    await autoProcessPending(blink, userId);

    switch (action) {
      case "process_referral":
        return await processReferral(blink, userId, body);
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
      case "verify_reward_code":
        return await verifyRewardCode(blink, userId, body);
      case "admin_generate_code":
        return await adminGenerateCode(blink, userId, body);
      case "get_pending_rewards":
        return await getPendingRewards(blink, userId);
      default:
        return errorResponse("Invalid action");
    }
  } catch (error) {
    console.error("Reward engine error:", error);
    return errorResponse("Internal server error", 500);
  }
}

// ===================== REFERRAL SYSTEM =====================

async function processReferral(blink: any, newUserId: string, body: any) {
  const { referralCode } = body;
  if (!referralCode || typeof referralCode !== "string") {
    return errorResponse("Invalid referral code");
  }

  // Find referrer by referral code
  const referrers = await blink.db.table("user_profiles").list({
    where: { referralCode: referralCode },
    limit: 1,
  });

  if (referrers.length === 0) {
    return errorResponse("Invalid referral code - referrer not found");
  }

  const referrer = referrers[0];

  // Prevent self-referral
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

  // Check duplicate referral entry
  const existingReferral = await blink.db.table("referral_history").list({
    where: { referredId: newUserId },
    limit: 1,
  });
  if (existingReferral.length > 0) {
    return errorResponse("Referral already processed");
  }

  // Anti-fraud: cap referrals per hour for referrer
  const recentReferrals = await blink.db.table("referral_history").list({
    where: { referrerId: referrer.userId },
    limit: 50,
  });
  // Simple check: max 10 referrals per day
  const today = new Date().toISOString().split("T")[0];
  const todayReferrals = recentReferrals.filter(
    (r: any) => r.createdAt && r.createdAt.startsWith(today)
  );
  if (todayReferrals.length >= 10) {
    return errorResponse("Referrer daily limit reached");
  }

  const REFERRER_REWARD = 100;
  const NEW_USER_REWARD = 50;

  // Atomic-like: Execute all operations, rollback concept via try-catch
  try {
    // 1. Create referral history entry
    await blink.db.table("referral_history").create({
      referrerId: referrer.userId,
      referredId: newUserId,
      rewardAmount: REFERRER_REWARD,
    });

    // 2. Update referrer balance
    await blink.db.table("user_profiles").update(referrer.userId, {
      balance: (referrer.balance || 0) + REFERRER_REWARD,
      totalEarned: (referrer.totalEarned || 0) + REFERRER_REWARD,
      xp: (referrer.xp || 0) + 50,
    });

    // 3. Log referrer transaction
    await blink.db.table("transactions").create({
      userId: referrer.userId,
      amount: REFERRER_REWARD,
      type: "referral",
      description: `Referral bonus: new user joined`,
    });

    // 4. Update new user: mark referred_by + grant bonus
    if (newUserProfiles.length > 0) {
      const newProfile = newUserProfiles[0];
      await blink.db.table("user_profiles").update(newUserId, {
        referredBy: referrer.userId,
        balance: (newProfile.balance || 0) + NEW_USER_REWARD,
        totalEarned: (newProfile.totalEarned || 0) + NEW_USER_REWARD,
        xp: (newProfile.xp || 0) + 25,
      });
    }

    // 5. Log new user transaction
    await blink.db.table("transactions").create({
      userId: newUserId,
      amount: NEW_USER_REWARD,
      type: "referral",
      description: `Referral bonus: joined via ${referralCode}`,
    });

    // 6. Log to reward_logs for audit
    await blink.db.table("reward_logs").create({
      userId: newUserId,
      rewardType: "referral",
      rewardAmount: NEW_USER_REWARD,
      sourceId: referrer.userId,
      sourceType: "referral_signup",
    });

    return jsonResponse({
      success: true,
      referrerReward: REFERRER_REWARD,
      newUserReward: NEW_USER_REWARD,
      message: `Referral successful! You earned ${NEW_USER_REWARD} BIX.`,
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

  // Fetch task details
  const tasks = await blink.db.table("tasks").list({
    where: { id: taskId },
    limit: 1,
  });
  if (tasks.length === 0) return errorResponse("Task not found");

  const task = tasks[0];
  if (!task.isActive) return errorResponse("Task is no longer active");

  // Check user level requirement
  const profiles = await blink.db.table("user_profiles").list({
    where: { userId: userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");
  const profile = profiles[0];

  const userLevel = Math.floor((profile.totalEarned || 0) / 500) + 1;
  if (task.requiredLevel && userLevel < task.requiredLevel) {
    return errorResponse(`Requires Level ${task.requiredLevel}`);
  }

  // Check completion based on task_type
  const existingCompletions = await blink.db.table("user_tasks").list({
    where: { userId: userId, taskId: taskId },
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
    if (completedToday) {
      return errorResponse("Daily task already completed today");
    }
  }

  // Milestone tasks: validate eligibility
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
    if (taskId === "task_earn_1000" && (profile.totalEarned || 0) < 1000) {
      return errorResponse("Need 1,000 BIX total earnings");
    }
    if (taskId === "task_earn_10000" && (profile.totalEarned || 0) < 10000) {
      return errorResponse("Need 10,000 BIX total earnings");
    }
    if (taskId === "task_streak_7" && (profile.dailyStreak || 0) < 7) {
      return errorResponse("Need 7-day login streak");
    }
  }

  const reward = task.rewardAmount || 0;
  const xpReward = task.xpReward || 0;

  // Execute reward
  try {
    await blink.db.table("user_tasks").create({
      userId: userId,
      taskId: taskId,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + reward,
      totalEarned: (profile.totalEarned || 0) + reward,
      xp: (profile.xp || 0) + xpReward,
    });

    await blink.db.table("transactions").create({
      userId: userId,
      amount: reward,
      type: "task",
      description: `Completed: ${task.title}`,
    });

    await blink.db.table("reward_logs").create({
      userId: userId,
      rewardType: "task",
      rewardAmount: reward,
      sourceId: taskId,
      sourceType: task.category,
    });

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

async function dailyCheckin(blink: any, userId: string) {
  const profiles = await blink.db.table("user_profiles").list({
    where: { userId: userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  const today = new Date().toISOString().split("T")[0];

  if (profile.lastLogin === today) {
    return errorResponse("Already checked in today");
  }

  // Calculate streak: check if last_login was yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (profile.lastLogin === yesterdayStr) {
    newStreak = (profile.dailyStreak || 0) + 1;
  }

  // Streak multiplier: 1x base, +0.5x per streak day (capped at 5x)
  const multiplier = Math.min(1 + (newStreak - 1) * 0.5, 5);
  const baseReward = 10;
  const reward = Math.round(baseReward * multiplier);
  const xpReward = 5 + newStreak;

  try {
    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + reward,
      totalEarned: (profile.totalEarned || 0) + reward,
      lastLogin: today,
      dailyStreak: newStreak,
      xp: (profile.xp || 0) + xpReward,
    });

    await blink.db.table("transactions").create({
      userId: userId,
      amount: reward,
      type: "daily",
      description: `Daily check-in (${newStreak}-day streak, ${multiplier}x multiplier)`,
    });

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

async function startQuiz(blink: any, userId: string, body: any) {
  const { questionCount = 10, difficulty = "easy" } = body;

  // Validate question count
  const validCounts = [5, 10, 20, 50];
  if (!validCounts.includes(questionCount)) {
    return errorResponse("Invalid question count. Choose 5, 10, 20, or 50");
  }

  // Check for existing active session
  const activeSessions = await blink.db.table("quiz_sessions").list({
    where: { userId: userId, status: "active" },
    limit: 1,
  });
  if (activeSessions.length > 0) {
    // Expire stale sessions (older than 30 min)
    const session = activeSessions[0];
    const startedAt = new Date(session.startedAt).getTime();
    if (Date.now() - startedAt > 30 * 60 * 1000) {
      await blink.db.table("quiz_sessions").update(session.id, { status: "expired" });
    } else {
      return errorResponse("You already have an active quiz session");
    }
  }

  // Fetch questions for difficulty
  const allQuestions = await blink.db.table("quizzes").list({
    where: { difficulty },
    limit: 200,
  });

  if (allQuestions.length < questionCount) {
    // Fallback: include all difficulties
    const allQ = await blink.db.table("quizzes").list({ limit: 200 });
    if (allQ.length < questionCount) {
      return errorResponse("Not enough questions available");
    }
    // Shuffle and pick
    const shuffled = allQ.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, questionCount);
    const questionIds = selected.map((q: any) => q.id);

    const sessionId = `qs_${userId.slice(-6)}_${Date.now()}`;
    await blink.db.table("quiz_sessions").create({
      id: sessionId,
      userId: userId,
      questionCount: questionCount,
      difficulty: "mixed",
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

  // Shuffle and pick from same difficulty
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, questionCount);
  const questionIds = selected.map((q: any) => q.id);

  const sessionId = `qs_${userId.slice(-6)}_${Date.now()}`;
  await blink.db.table("quiz_sessions").create({
    id: sessionId,
    userId: userId,
    questionCount: questionCount,
    difficulty,
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

  // Anti-bot: minimum 1 second per answer
  if (timeTaken !== undefined && timeTaken < 1) {
    return errorResponse("Answer too fast - suspicious activity");
  }

  // Validate session
  const sessions = await blink.db.table("quiz_sessions").list({
    where: { id: sessionId, userId: userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.questionIds);
  const answeredIds = JSON.parse(session.answeredIds || "[]");

  // Check question belongs to session
  if (!questionIds.includes(questionId)) {
    return errorResponse("Question not in this session");
  }

  // Check not already answered
  if (answeredIds.includes(questionId)) {
    return errorResponse("Question already answered");
  }

  // Fetch question to check answer
  const questions = await blink.db.table("quizzes").list({
    where: { id: questionId },
    limit: 1,
  });
  if (questions.length === 0) return errorResponse("Question not found");

  const question = questions[0];
  const isCorrect = Number(selectedOption) === Number(question.correctOption);

  // Update session
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
    where: { id: sessionId, userId: userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.questionIds);
  const answeredIds = JSON.parse(session.answeredIds || "[]");

  // Must answer all questions
  if (answeredIds.length < questionIds.length) {
    return errorResponse(`Answer all questions first (${answeredIds.length}/${questionIds.length})`);
  }

  let totalReward = session.totalEarned || 0;
  let bonusReward = 0;
  const score = session.score || 0;

  // Perfect score bonus: +50% extra
  if (score === questionIds.length) {
    bonusReward = Math.round(totalReward * 0.5);
    totalReward += bonusReward;
  }

  const xpReward = score * 5 + (bonusReward > 0 ? 50 : 0);

  // Mark session complete
  await blink.db.table("quiz_sessions").update(sessionId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    totalEarned: totalReward,
  });

  // Grant rewards to user
  const profiles = await blink.db.table("user_profiles").list({
    where: { userId: userId },
    limit: 1,
  });

  if (profiles.length > 0) {
    const profile = profiles[0];
    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + totalReward,
      totalEarned: (profile.totalEarned || 0) + totalReward,
      xp: (profile.xp || 0) + xpReward,
    });
  }

  // Log transaction
  await blink.db.table("transactions").create({
    userId: userId,
    amount: totalReward,
    type: "quiz",
    description: `Quiz completed: ${score}/${questionIds.length} correct${bonusReward > 0 ? " (PERFECT!)" : ""}`,
  });

  // Log for audit
  await blink.db.table("reward_logs").create({
    userId: userId,
    rewardType: "quiz",
    rewardAmount: totalReward,
    sourceId: sessionId,
    sourceType: "quiz_session",
  });

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

async function gameResult(blink: any, userId: string, body: any) {
  const { gameType, betAmount, outcome } = body;

  if (!gameType || !betAmount || !outcome) {
    return errorResponse("Missing game parameters");
  }

  if (betAmount < 10 || betAmount > 1000) {
    return errorResponse("Bet must be between 10-1000 BIX");
  }

  const profiles = await blink.db.table("user_profiles").list({
    where: { userId: userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  if ((profile.balance || 0) < betAmount) {
    return errorResponse("Insufficient balance");
  }

  // Server-side outcome determination (don't trust client)
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

  await blink.db.table("user_profiles").update(userId, {
    balance: (profile.balance || 0) + netChange,
  });

  await blink.db.table("transactions").create({
    userId: userId,
    amount: netChange,
    type: "game",
    description: `${gameType} ${multiplier > 0 ? "WIN" : "LOSS"} (${multiplier}x)`,
  });

  return jsonResponse({
    success: true,
    multiplier,
    netChange,
    newBalance: (profile.balance || 0) + netChange,
    message: resultMsg,
  });
}

// ===================== VERIFICATION SYSTEM =====================

async function autoProcessPending(blink: any, userId: string) {
  try {
    const now = new Date().toISOString();
    const pending = await blink.db.table("pending_rewards").list({
      where: { 
        userId: userId, 
        status: "pending",
        process_at: { $lte: now } 
      }
    });

    for (const item of pending) {
      await processReward(blink, item);
    }
  } catch (err) {
    console.error("Auto-process error:", err);
  }
}

async function processReward(blink: any, item: any) {
  try {
    const profile = await blink.db.table("user_profiles").get(item.userId);
    if (!profile) return;

    // Grant reward
    await blink.db.table("user_profiles").update(item.userId, {
      balance: (profile.balance || 0) + item.rewardAmount,
      totalEarned: (profile.totalEarned || 0) + item.rewardAmount,
      xp: (profile.xp || 0) + 10,
    });

    // Update status
    await blink.db.table("pending_rewards").update(item.id, {
      status: "processed"
    });

    // Log transaction
    await blink.db.table("transactions").create({
      userId: item.userId,
      amount: item.rewardAmount,
      type: item.rewardType || "verification",
      description: `Verification reward: ${item.sourceId}`,
    });

    // Log for audit
    await blink.db.table("reward_logs").create({
      userId: item.userId,
      rewardType: item.rewardType || "verification",
      rewardAmount: item.rewardAmount,
      sourceId: item.sourceId,
      sourceType: item.sourceType || "verification_code",
    });
  } catch (err) {
    console.error(`Failed to process reward ${item.id}:`, err);
  }
}

async function verifyRewardCode(blink: any, userId: string, body: any) {
  const { code } = body;
  if (!code) return errorResponse("Code is required");

  // Check if code exists and is active
  const codes = await blink.db.table("verification_codes").list({
    where: { code: code.trim().toUpperCase(), isActive: 1 },
    limit: 1
  });

  if (codes.length === 0) {
    return errorResponse("Invalid or inactive code");
  }

  const vCode = codes[0];
  const now = new Date();
  
  if (vCode.expiresAt && new Date(vCode.expiresAt) < now) {
    return errorResponse("Code has expired");
  }

  // Check if user already verified this specific code
  const existing = await blink.db.table("pending_rewards").list({
    where: { userId: userId, sourceId: vCode.id },
    limit: 1
  });

  if (existing.length > 0) {
    return errorResponse("You have already used this code");
  }

  // Schedule reward for 30 minutes later
  const processAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const rewardAmount = 250; // Fixed reward for verification

  await blink.db.table("pending_rewards").create({
    id: `pr_${userId.slice(-6)}_${Date.now()}`,
    userId: userId,
    rewardType: "verification",
    rewardAmount: rewardAmount,
    sourceId: vCode.id,
    sourceType: "verification_code",
    processAt: processAt,
    status: "pending"
  });

  return jsonResponse({
    success: true,
    message: "Verification successful! Your reward will be granted in 30 minutes.",
    processAt: processAt
  });
}

async function getPendingRewards(blink: any, userId: string) {
  const pending = await blink.db.table("pending_rewards").list({
    where: { userId: userId },
    orderBy: { createdAt: "desc" },
    limit: 20
  });

  return jsonResponse({
    success: true,
    pending
  });
}

async function adminGenerateCode(blink: any, userId: string, body: any) {
  // Simple check for admin role (can be refined)
  const profile = await blink.db.table("user_profiles").get(userId);
  // Assume user_id 'jzDmHyIboBQJgqMp93GRykVSJi83' is admin as per context
  if (userId !== "jzDmHyIboBQJgqMp93GRykVSJi83") {
    return errorResponse("Only admins can generate codes", 403);
  }

  const { code, expiresHours = 24 } = body;
  if (!code) return errorResponse("Code is required");

  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();
  const id = `vc_${Date.now()}`;

  await blink.db.table("verification_codes").create({
    id,
    code: code.trim().toUpperCase(),
    isActive: 1,
    expiresAt
  });

  return jsonResponse({
    success: true,
    code: code.toUpperCase(),
    expiresAt
  });
}

Deno.serve(handler);
