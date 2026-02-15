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

    // Create session
    const { data: session, error } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: user.id,
        question_count: questionCount,
        difficulty,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;
    return session;
  },

  quizAnswer: async (sessionId: string, questionId: string, selectedOption: number, timeTaken: number) => {
    // For direct frontend logic, we'll just track score in the session
    return { correct: true }; // Simplified for now
  },

  finishQuiz: async (sessionId: string) => {
    const amount = 20; // Dummy reward for now
    return { success: true, earned: amount };
  },

  // Games
  gameResult: async (gameType: string, betAmount: number, outcome: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const profit = outcome === 'win' ? betAmount : -betAmount;

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
      description: `${gameType} result: ${outcome}`
    });

    return { success: true, balance: (profile?.balance || 0) + profit };
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
    return { success: true, earned: 100 }; // Simplified
  },

  getPendingRewards: async () => {
    return [];
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

  adminListCodeWindows: async () => [],
};
