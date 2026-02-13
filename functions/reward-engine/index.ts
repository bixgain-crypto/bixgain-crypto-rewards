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
    where: { referral_code: referralCode },
    limit: 1,
  });

  if (referrers.length === 0) {
    return errorResponse("Invalid referral code - referrer not found");
  }

  const referrer = referrers[0];

  // Prevent self-referral
  if (referrer.user_id === newUserId) {
    return errorResponse("Cannot refer yourself");
  }

  // Check if user was already referred
  const newUserProfiles = await blink.db.table("user_profiles").list({
    where: { user_id: newUserId },
    limit: 1,
  });
  if (newUserProfiles.length > 0 && newUserProfiles[0].referred_by) {
    return errorResponse("User already has a referrer");
  }

  // Check duplicate referral entry
  const existingReferral = await blink.db.table("referral_history").list({
    where: { referred_id: newUserId },
    limit: 1,
  });
  if (existingReferral.length > 0) {
    return errorResponse("Referral already processed");
  }

  // Anti-fraud: cap referrals per hour for referrer
  const recentReferrals = await blink.db.table("referral_history").list({
    where: { referrer_id: referrer.user_id },
    limit: 50,
  });
  // Simple check: max 10 referrals per day
  const today = new Date().toISOString().split("T")[0];
  const todayReferrals = recentReferrals.filter(
    (r: any) => r.created_at && r.created_at.startsWith(today)
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
      referrer_id: referrer.user_id,
      referred_id: newUserId,
      reward_amount: REFERRER_REWARD,
    });

    // 2. Update referrer balance
    await blink.db.table("user_profiles").update(referrer.user_id, {
      balance: (referrer.balance || 0) + REFERRER_REWARD,
      total_earned: (referrer.total_earned || 0) + REFERRER_REWARD,
      xp: (referrer.xp || 0) + 50,
    });

    // 3. Log referrer transaction
    await blink.db.table("transactions").create({
      user_id: referrer.user_id,
      amount: REFERRER_REWARD,
      type: "referral",
      description: `Referral bonus: new user joined`,
    });

    // 4. Update new user: mark referred_by + grant bonus
    if (newUserProfiles.length > 0) {
      const newProfile = newUserProfiles[0];
      await blink.db.table("user_profiles").update(newUserId, {
        referred_by: referrer.user_id,
        balance: (newProfile.balance || 0) + NEW_USER_REWARD,
        total_earned: (newProfile.total_earned || 0) + NEW_USER_REWARD,
        xp: (newProfile.xp || 0) + 25,
      });
    }

    // 5. Log new user transaction
    await blink.db.table("transactions").create({
      user_id: newUserId,
      amount: NEW_USER_REWARD,
      type: "referral",
      description: `Referral bonus: joined via ${referralCode}`,
    });

    // 6. Log to reward_logs for audit
    await blink.db.table("reward_logs").create({
      user_id: newUserId,
      reward_type: "referral",
      reward_amount: NEW_USER_REWARD,
      source_id: referrer.user_id,
      source_type: "referral_signup",
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
  if (!task.is_active) return errorResponse("Task is no longer active");

  // Check user level requirement
  const profiles = await blink.db.table("user_profiles").list({
    where: { user_id: userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");
  const profile = profiles[0];

  const userLevel = Math.floor((profile.total_earned || 0) / 500) + 1;
  if (task.required_level && userLevel < task.required_level) {
    return errorResponse(`Requires Level ${task.required_level}`);
  }

  // Check completion based on task_type
  const existingCompletions = await blink.db.table("user_tasks").list({
    where: { user_id: userId, task_id: taskId },
    limit: 10,
  });

  if (task.task_type === "one_time" && existingCompletions.length > 0) {
    return errorResponse("Task already completed");
  }

  if (task.task_type === "daily") {
    const today = new Date().toISOString().split("T")[0];
    const completedToday = existingCompletions.some(
      (c: any) => c.completed_at && c.completed_at.startsWith(today)
    );
    if (completedToday) {
      return errorResponse("Daily task already completed today");
    }
  }

  // Milestone tasks: validate eligibility
  if (task.category === "referral") {
    const referralCount = await blink.db.table("referral_history").count({
      where: { referrer_id: userId },
    });
    const requiredCount = taskId === "task_refer_1" ? 1 : taskId === "task_refer_5" ? 5 : 25;
    if (referralCount < requiredCount) {
      return errorResponse(`Need ${requiredCount} referrals to claim`);
    }
  }

  if (task.category === "milestone") {
    if (taskId === "task_earn_1000" && (profile.total_earned || 0) < 1000) {
      return errorResponse("Need 1,000 BIX total earnings");
    }
    if (taskId === "task_earn_10000" && (profile.total_earned || 0) < 10000) {
      return errorResponse("Need 10,000 BIX total earnings");
    }
    if (taskId === "task_streak_7" && (profile.daily_streak || 0) < 7) {
      return errorResponse("Need 7-day login streak");
    }
  }

  const reward = task.reward_amount || 0;
  const xpReward = task.xp_reward || 0;

  // Execute reward
  try {
    await blink.db.table("user_tasks").create({
      user_id: userId,
      task_id: taskId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + reward,
      total_earned: (profile.total_earned || 0) + reward,
      xp: (profile.xp || 0) + xpReward,
    });

    await blink.db.table("transactions").create({
      user_id: userId,
      amount: reward,
      type: "task",
      description: `Completed: ${task.title}`,
    });

    await blink.db.table("reward_logs").create({
      user_id: userId,
      reward_type: "task",
      reward_amount: reward,
      source_id: taskId,
      source_type: task.category,
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
    where: { user_id: userId },
    limit: 1,
  });
  if (profiles.length === 0) return errorResponse("Profile not found");

  const profile = profiles[0];
  const today = new Date().toISOString().split("T")[0];

  if (profile.last_login === today) {
    return errorResponse("Already checked in today");
  }

  // Calculate streak: check if last_login was yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (profile.last_login === yesterdayStr) {
    newStreak = (profile.daily_streak || 0) + 1;
  }

  // Streak multiplier: 1x base, +0.5x per streak day (capped at 5x)
  const multiplier = Math.min(1 + (newStreak - 1) * 0.5, 5);
  const baseReward = 10;
  const reward = Math.round(baseReward * multiplier);
  const xpReward = 5 + newStreak;

  try {
    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + reward,
      total_earned: (profile.total_earned || 0) + reward,
      last_login: today,
      daily_streak: newStreak,
      xp: (profile.xp || 0) + xpReward,
    });

    await blink.db.table("transactions").create({
      user_id: userId,
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
    where: { user_id: userId, status: "active" },
    limit: 1,
  });
  if (activeSessions.length > 0) {
    // Expire stale sessions (older than 30 min)
    const session = activeSessions[0];
    const startedAt = new Date(session.started_at).getTime();
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
      user_id: userId,
      question_count: questionCount,
      difficulty: "mixed",
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
        rewardAmount: q.reward_amount,
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
    user_id: userId,
    question_count: questionCount,
    difficulty,
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
      rewardAmount: q.reward_amount,
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

  // Anti-bot: minimum 2 seconds per answer
  if (timeTaken !== undefined && timeTaken < 2) {
    return errorResponse("Answer too fast - suspicious activity");
  }

  // Validate session
  const sessions = await blink.db.table("quiz_sessions").list({
    where: { id: sessionId, user_id: userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.question_ids);
  const answeredIds = JSON.parse(session.answered_ids || "[]");

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
  const isCorrect = Number(selectedOption) === Number(question.correct_option);

  // Update session
  answeredIds.push(questionId);
  const newScore = (session.score || 0) + (isCorrect ? 1 : 0);
  const earnedForThis = isCorrect ? question.reward_amount : 0;
  const newTotalEarned = (session.total_earned || 0) + earnedForThis;

  await blink.db.table("quiz_sessions").update(sessionId, {
    answered_ids: JSON.stringify(answeredIds),
    score: newScore,
    total_earned: newTotalEarned,
  });

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

async function finishQuiz(blink: any, userId: string, body: any) {
  const { sessionId } = body;
  if (!sessionId) return errorResponse("Missing sessionId");

  const sessions = await blink.db.table("quiz_sessions").list({
    where: { id: sessionId, user_id: userId, status: "active" },
    limit: 1,
  });
  if (sessions.length === 0) return errorResponse("Invalid or expired session");

  const session = sessions[0];
  const questionIds = JSON.parse(session.question_ids);
  const answeredIds = JSON.parse(session.answered_ids || "[]");

  // Must answer all questions
  if (answeredIds.length < questionIds.length) {
    return errorResponse(`Answer all questions first (${answeredIds.length}/${questionIds.length})`);
  }

  let totalReward = session.total_earned || 0;
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
    completed_at: new Date().toISOString(),
    total_earned: totalReward,
  });

  // Grant rewards to user
  const profiles = await blink.db.table("user_profiles").list({
    where: { user_id: userId },
    limit: 1,
  });

  if (profiles.length > 0) {
    const profile = profiles[0];
    await blink.db.table("user_profiles").update(userId, {
      balance: (profile.balance || 0) + totalReward,
      total_earned: (profile.total_earned || 0) + totalReward,
      xp: (profile.xp || 0) + xpReward,
    });
  }

  // Log transaction
  await blink.db.table("transactions").create({
    user_id: userId,
    amount: totalReward,
    type: "quiz",
    description: `Quiz completed: ${score}/${questionIds.length} correct${bonusReward > 0 ? " (PERFECT!)" : ""}`,
  });

  // Log for audit
  await blink.db.table("reward_logs").create({
    user_id: userId,
    reward_type: "quiz",
    reward_amount: totalReward,
    source_id: sessionId,
    source_type: "quiz_session",
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
    where: { user_id: userId },
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
    user_id: userId,
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

Deno.serve(handler);
