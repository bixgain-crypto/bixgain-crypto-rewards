import { supabase } from './supabase';

export const rewardEngine = {
  // Task system
  completeTask: async (taskId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Mark task as completed
    const { error: taskError } = await supabase
      .from('user_tasks')
      .insert({ user_id: user.id, task_id: taskId, status: 'completed' });
    
    if (taskError) throw taskError;

    // 2. Get task reward amount
    const { data: task } = await supabase
      .from('tasks')
      .select('reward_amount')
      .eq('id', taskId)
      .single();
    
    const amount = task?.reward_amount || 0;

    // 3. Update user balance
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('balance, total_earned')
      .eq('user_id', user.id)
      .single();
    
    await supabase
      .from('user_profiles')
      .update({
        balance: (profile?.balance || 0) + amount,
        total_earned: (profile?.total_earned || 0) + amount
      })
      .eq('user_id', user.id);

    // 4. Log transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount,
      type: 'task',
      description: `Task completed: ${taskId}`
    });

    return { success: true, earned: amount };
  },

  // Daily check-in
  dailyCheckin: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const amount = 50; // Daily check-in reward

    // Update profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('balance, total_earned')
      .eq('user_id', user.id)
      .single();

    await supabase
      .from('user_profiles')
      .update({
        balance: (profile?.balance || 0) + amount,
        total_earned: (profile?.total_earned || 0) + amount,
        last_login: new Date().toISOString()
      })
      .eq('user_id', user.id);

    // Log transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount,
      type: 'daily_checkin',
      description: 'Daily Check-in Reward'
    });

    return { success: true, earned: amount };
  },

  // Quiz system
  startQuiz: async (questionCount: number, difficulty: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Fetch questions
    const { data: questions, error: qError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('difficulty', difficulty)
      .limit(questionCount);
    
    if (qError || !questions || questions.length === 0) throw new Error('No questions found for this difficulty');

    // 2. Create session
    const { data: session, error: sError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        question_count: questions.length,
        difficulty,
        question_ids: JSON.stringify(questions.map(q => q.id)),
        status: 'active'
      })
      .select()
      .single();

    if (sError) throw sError;
    
    return {
      sessionId: session.id,
      questions
    };
  },

  quizAnswer: async (sessionId: string, questionId: string, selectedOption: number, timeTaken: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Get the question
    const { data: question, error: qError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', questionId)
      .single();
    
    if (qError || !question) throw new Error('Question not found');

    const isCorrect = question.correct_option === selectedOption;

    // 2. Update session
    const { data: session, error: sError } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sError || !session) throw new Error('Session not found');

    const answeredIds = JSON.parse(session.answered_ids || '[]');
    answeredIds.push(questionId);

    const newScore = isCorrect ? (session.score || 0) + 1 : (session.score || 0);
    const reward = isCorrect ? (question.reward_amount || 0) : 0;
    const newEarned = (session.earned || 0) + reward;

    await supabase
      .from('quiz_sessions')
      .update({
        answered_ids: JSON.stringify(answeredIds),
        score: newScore,
        earned: newEarned
      })
      .eq('id', sessionId);

    return {
      isCorrect,
      correctOption: question.correct_option,
      sessionScore: newScore,
      sessionEarned: newEarned
    };
  },

  finishQuiz: async (sessionId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: session, error: sError } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    
    if (sError || !session) throw new Error('Session not found');

    const isPerfect = session.score === session.question_count;
    const bonusReward = isPerfect ? Math.round(session.earned * 0.5) : 0;
    const totalReward = session.earned + bonusReward;
    const xp = session.score * 100;

    // Update session status
    await supabase
      .from('quiz_sessions')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Apply rewards to user
    if (totalReward > 0) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('balance, total_earned, xp')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('user_profiles')
        .update({
          balance: (profile?.balance || 0) + totalReward,
          total_earned: (profile?.total_earned || 0) + totalReward,
          xp: (profile?.xp || 0) + xp
        })
        .eq('user_id', user.id);

      // Log transaction
      await supabase.from('transactions').insert({
        user_id: user.id,
        amount: totalReward,
        type: 'quiz',
        description: `Quiz reward: ${session.score}/${session.question_count} correct`
      });
    }

    return {
      success: true,
      score: session.score,
      totalQuestions: session.question_count,
      earned: session.earned,
      bonusReward,
      totalReward,
      xp,
      isPerfect
    };
  },

  // Games
  gameResult: async (gameType: string, betAmount: number, outcome: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const isWin = Math.random() > 0.5; // Simulate game logic for now
    const profit = isWin ? betAmount : -betAmount;
    const multiplier = isWin ? 2 : 0;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    await supabase
      .from('user_profiles')
      .update({
        balance: (profile?.balance || 0) + profit
      })
      .eq('user_id', user.id);

    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: profit,
      type: 'game',
      description: `${gameType} result: ${isWin ? 'win' : 'loss'}`
    });

    return {
      success: true,
      isWin,
      multiplier,
      profit,
      newBalance: (profile?.balance || 0) + profit
    };
  },

  // Referrals
  processReferral: async (referralCode: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Find referrer
    const { data: referrer } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('referral_code', referralCode)
      .single();

    if (referrer) {
      await supabase
        .from('user_profiles')
        .update({ referred_by: referrer.user_id })
        .eq('user_id', user.id);
      
      // Reward referrer
      const bonus = 500;
      const { data: refProfile } = await supabase
        .from('user_profiles')
        .select('balance, total_earned')
        .eq('user_id', referrer.user_id)
        .single();
      
      await supabase
        .from('user_profiles')
        .update({
          balance: (refProfile?.balance || 0) + bonus,
          total_earned: (refProfile?.total_earned || 0) + bonus
        })
        .eq('user_id', referrer.user_id);

      await supabase.from('transactions').insert({
        user_id: referrer.user_id,
        amount: bonus,
        type: 'referral',
        description: `Referral bonus for user ${user.id}`
      });
    }

    return { success: true };
  },

  redeemTaskCode: async (code: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Find the code window
    const { data: window, error: windowError } = await supabase
      .from('task_code_windows')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', 1)
      .gt('valid_until', new Date().toISOString())
      .maybeSingle();

    if (windowError || !window) throw new Error('Invalid or expired code');

    // 2. Check max redemptions
    if (window.max_redemptions && window.current_redemptions >= window.max_redemptions) {
      throw new Error('Code has reached max redemptions');
    }

    // 3. Check if user already redeemed
    const { data: existing } = await supabase
      .from('redemptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('window_id', window.id)
      .maybeSingle();

    if (existing) throw new Error('You have already redeemed this code');

    // 4. Record redemption
    await supabase.from('redemptions').insert({
      user_id: user.id,
      window_id: window.id,
      task_id: window.task_id
    });

    // 5. Update window count
    await supabase
      .from('task_code_windows')
      .update({ current_redemptions: (window.current_redemptions || 0) + 1 })
      .eq('id', window.id);

    // 6. Reward user
    const amount = 100; // Default reward for codes
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('balance, total_earned')
      .eq('user_id', user.id)
      .single();

    await supabase
      .from('user_profiles')
      .update({
        balance: (profile?.balance || 0) + amount,
        total_earned: (profile?.total_earned || 0) + amount
      })
      .eq('user_id', user.id);

    // 7. Log transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount,
      type: 'code',
      description: `Redeemed code: ${code}`
    });

    return { success: true, earned: amount, message: `Successfully redeemed code! +${amount} BIX` };
  },

  getPendingRewards: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('pending_rewards')
      .select('*')
      .eq('user_id', user.id)
      .order('process_at', { ascending: true });
    
    return data || [];
  },

  // Admin methods
  adminGetMetrics: async () => {
    const { data } = await supabase.from('platform_metrics').select('*').order('metric_date', { ascending: false }).limit(30);
    return data || [];
  },

  adminGetAbuseFlags: async () => {
    const { data } = await supabase.from('abuse_flags').select('*, user_profiles(display_name)').eq('resolved', 0);
    return data || [];
  },

  adminResolveFlag: async (flagId: string) => {
    await supabase.from('abuse_flags').update({ resolved: 1 }).eq('id', flagId);
    return { success: true };
  },

  adminCreateTask: async (task: any) => {
    await supabase.from('tasks').insert(task);
    return { success: true };
  },

  adminToggleTask: async (taskId: string, isActive: number) => {
    await supabase.from('tasks').update({ is_active: isActive }).eq('id', taskId);
    return { success: true };
  },

  adminDeleteTask: async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId);
    return { success: true };
  },

  adminListCodeWindows: async () => {
    const { data } = await supabase.from('task_code_windows').select('*').order('created_at', { ascending: false });
    return data || [];
  },

  adminGenerateCodeWindow: async (taskId: string | null, validHours: number, maxRedemptions?: number) => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + validHours);

    const { data, error } = await supabase
      .from('task_code_windows')
      .insert({
        task_id: taskId || 'general',
        code,
        valid_from: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
        max_redemptions: maxRedemptions || null,
        is_active: 1
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  adminDisableCodeWindow: async (windowId: string) => {
    await supabase.from('task_code_windows').update({ is_active: 0 }).eq('id', windowId);
    return { success: true };
  },
};
