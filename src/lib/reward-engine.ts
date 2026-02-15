import { blink } from './blink';

const REWARD_ENGINE_URL = 'https://gh9qbc8y--reward-engine.functions.blink.new';

// Generate device fingerprint hash for anti-abuse
function getDeviceHash(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `dh_${Math.abs(hash).toString(36)}`;
}

async function callRewardEngine(action: string, data: Record<string, unknown> = {}) {
  const token = await blink.auth.getValidToken();
  
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15000);

  const res = await fetch(REWARD_ENGINE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-device-hash': getDeviceHash(),
    },
    body: JSON.stringify({ action, ...data }),
    signal: controller.signal,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Reward engine error');
  }
  return json;
}

export const rewardEngine = {
  // Task system
  completeTask: (taskId: string) =>
    callRewardEngine('complete_task', { taskId }),

  // Daily check-in
  dailyCheckin: () =>
    callRewardEngine('daily_checkin'),

  // Quiz system
  startQuiz: (questionCount: number, difficulty: string) =>
    callRewardEngine('start_quiz', { questionCount, difficulty }),

  quizAnswer: (sessionId: string, questionId: string, selectedOption: number, timeTaken: number) =>
    callRewardEngine('quiz_answer', { sessionId, questionId, selectedOption, timeTaken }),

  finishQuiz: (sessionId: string) =>
    callRewardEngine('finish_quiz', { sessionId }),

  // Games
  gameResult: (gameType: string, betAmount: number, outcome: string) =>
    callRewardEngine('game_result', { gameType, betAmount, outcome }),

  // Referrals
  processReferral: (referralCode: string) =>
    callRewardEngine('process_referral', { referralCode }),

  // ===== NEW: Secure Task Code System =====
  redeemTaskCode: (code: string) =>
    callRewardEngine('redeem_task_code', { code }),

  // Pending rewards
  getPendingRewards: () =>
    callRewardEngine('get_pending_rewards'),

  // ===== Admin: Code Window Management =====
  adminGenerateCodeWindow: (taskId: string | null, validHours: number = 3, maxRedemptions?: number) =>
    callRewardEngine('admin_generate_code_window', { taskId, validHours, maxRedemptions }),

  adminListCodeWindows: (activeOnly: boolean = true) =>
    callRewardEngine('admin_list_code_windows', { activeOnly }),

  adminDisableCodeWindow: (windowId: string) =>
    callRewardEngine('admin_disable_code_window', { windowId }),

  // ===== Admin: Metrics & Abuse =====
  adminGetMetrics: () =>
    callRewardEngine('admin_get_metrics'),

  adminGetAbuseFlags: () =>
    callRewardEngine('admin_get_abuse_flags'),

  adminResolveFlag: (flagId: string) =>
    callRewardEngine('admin_resolve_flag', { flagId }),

  // Admin task management
  adminCreateTask: (task: Record<string, unknown>) =>
    callRewardEngine('admin_create_task', { task }),

  adminToggleTask: (taskId: string, isActive: number) =>
    callRewardEngine('admin_toggle_task', { taskId, isActive }),

  adminDeleteTask: (taskId: string) =>
    callRewardEngine('admin_delete_task', { taskId }),

  // Legacy compat
  verifyRewardCode: (code: string) =>
    callRewardEngine('redeem_task_code', { code }),

  adminGenerateCode: (code: string, expiresHours: number = 24) =>
    callRewardEngine('admin_generate_code_window', { taskId: null, validHours: expiresHours }),
};