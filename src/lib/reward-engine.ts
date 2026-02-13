import { blink } from './blink';

const REWARD_ENGINE_URL = 'https://x79bsxgw--bix-reward-engine.functions.blink.new';

async function callRewardEngine(action: string, data: Record<string, unknown> = {}) {
  const token = await blink.auth.getValidToken();
  
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15000);

  const res = await fetch(REWARD_ENGINE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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
  processReferral: (referralCode: string) =>
    callRewardEngine('process_referral', { referralCode }),

  completeTask: (taskId: string) =>
    callRewardEngine('complete_task', { taskId }),

  dailyCheckin: () =>
    callRewardEngine('daily_checkin'),

  startQuiz: (questionCount: number, difficulty: string) =>
    callRewardEngine('start_quiz', { questionCount, difficulty }),

  quizAnswer: (sessionId: string, questionId: string, selectedOption: number, timeTaken: number) =>
    callRewardEngine('quiz_answer', { sessionId, questionId, selectedOption, timeTaken }),

  finishQuiz: (sessionId: string) =>
    callRewardEngine('finish_quiz', { sessionId }),

  gameResult: (gameType: string, betAmount: number, outcome: string) =>
    callRewardEngine('game_result', { gameType, betAmount, outcome }),
};
