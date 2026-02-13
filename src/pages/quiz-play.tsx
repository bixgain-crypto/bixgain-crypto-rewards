import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/use-auth';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight, Coins, Trophy, RotateCcw, Timer, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface QuizQuestion {
  id: string;
  question: string;
  options: string;
  rewardAmount: number;
  difficulty: string;
}

type GameState = 'setup' | 'playing' | 'finished';

export default function QuizPlayPage() {
  const { refreshProfile } = useAuth();

  // Setup state
  const [gameState, setGameState] = useState<GameState>('setup');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('easy');
  const [startingQuiz, setStartingQuiz] = useState(false);

  // Playing state
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerStartRef = useRef<number>(Date.now());

  // Finish state
  const [finishResult, setFinishResult] = useState<any>(null);
  const [finishing, setFinishing] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (gameState !== 'playing' || answered) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-submit wrong answer on timeout
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentIndex, answered]);

  const handleTimeout = useCallback(async () => {
    if (answered || !questions[currentIndex]) return;
    // Submit with -1 option (wrong)
    setAnswered(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const timeTaken = (Date.now() - answerStartRef.current) / 1000;
      const result = await rewardEngine.quizAnswer(sessionId, questions[currentIndex].id, -1, timeTaken);
      setCorrectOption(result.correctOption);
      setIsCorrect(false);
    } catch {
      // Continue anyway
    }
  }, [answered, currentIndex, questions, sessionId]);

  const handleStartQuiz = async () => {
    setStartingQuiz(true);
    try {
      const result = await rewardEngine.startQuiz(questionCount, difficulty);
      setSessionId(result.sessionId);
      setQuestions(result.questions);
      setCurrentIndex(0);
      setScore(0);
      setTotalEarned(0);
      setAnswered(false);
      setSelected(null);
      setTimeLeft(difficulty === 'hard' ? 20 : difficulty === 'medium' ? 25 : 30);
      answerStartRef.current = Date.now();
      setGameState('playing');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start quiz');
    } finally {
      setStartingQuiz(false);
    }
  };

  const handleAnswer = async (optionIndex: number) => {
    if (answered || submitting || !questions[currentIndex]) return;
    setSelected(optionIndex);
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const timeTaken = (Date.now() - answerStartRef.current) / 1000;

    try {
      const result = await rewardEngine.quizAnswer(
        sessionId,
        questions[currentIndex].id,
        optionIndex,
        timeTaken
      );
      setAnswered(true);
      setIsCorrect(result.isCorrect);
      setCorrectOption(result.correctOption);
      if (result.isCorrect) {
        setScore(result.sessionScore);
        setTotalEarned(result.sessionEarned);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      handleFinishQuiz();
    } else {
      setCurrentIndex(i => i + 1);
      setSelected(null);
      setAnswered(false);
      setIsCorrect(false);
      setCorrectOption(null);
      setTimeLeft(difficulty === 'hard' ? 20 : difficulty === 'medium' ? 25 : 30);
      answerStartRef.current = Date.now();
    }
  };

  const handleFinishQuiz = async () => {
    setFinishing(true);
    try {
      const result = await rewardEngine.finishQuiz(sessionId);
      setFinishResult(result);
      setGameState('finished');
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to finish quiz');
    } finally {
      setFinishing(false);
    }
  };

  const handleRestart = () => {
    setGameState('setup');
    setSessionId('');
    setQuestions([]);
    setFinishResult(null);
  };

  const currentQuiz = questions[currentIndex];
  const parsedOptions: string[] = currentQuiz
    ? (() => { try { return JSON.parse(currentQuiz.options); } catch { return []; } })()
    : [];

  // =============== SETUP SCREEN ===============
  if (gameState === 'setup') {
    return (
      <DashboardLayout activePath="/earn">
        <div className="max-w-2xl mx-auto space-y-8 py-8">
          <div className="text-center">
            <BrainCircuit className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-4xl font-display font-bold mb-2">Crypto Knowledge Quiz</h1>
            <p className="text-muted-foreground">Test your blockchain knowledge and earn BIX tokens!</p>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Configure Your Quiz</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-semibold text-muted-foreground mb-3 block">Number of Questions</label>
                <div className="grid grid-cols-4 gap-3">
                  {[5, 10, 20, 50].map(count => (
                    <Button
                      key={count}
                      variant={questionCount === count ? 'default' : 'outline'}
                      className={questionCount === count ? 'gold-gradient border-none' : 'border-white/10'}
                      onClick={() => setQuestionCount(count)}
                    >
                      {count}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground mb-3 block">Difficulty Level</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'easy', label: 'Easy', reward: '5 BIX', time: '30s' },
                    { value: 'medium', label: 'Medium', reward: '8 BIX', time: '25s' },
                    { value: 'hard', label: 'Hard', reward: '10 BIX', time: '20s' },
                  ].map(d => (
                    <Button
                      key={d.value}
                      variant={difficulty === d.value ? 'default' : 'outline'}
                      className={`flex flex-col h-auto py-4 ${difficulty === d.value ? 'gold-gradient border-none' : 'border-white/10'}`}
                      onClick={() => setDifficulty(d.value)}
                    >
                      <span className="font-bold">{d.label}</span>
                      <span className="text-[10px] opacity-80">{d.reward}/q · {d.time} timer</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Potential Earnings</span>
                  <span className="text-primary font-bold font-display">
                    {questionCount * (difficulty === 'hard' ? 10 : difficulty === 'medium' ? 8 : 5)} BIX
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  + 50% bonus for perfect score! Timer: {difficulty === 'hard' ? '20' : difficulty === 'medium' ? '25' : '30'}s per question.
                </p>
              </div>

              <Button
                className="w-full h-14 text-lg font-bold gold-gradient gold-glow"
                onClick={handleStartQuiz}
                disabled={startingQuiz}
              >
                {startingQuiz ? 'Loading Quiz...' : 'Start Quiz'}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // =============== FINISHED SCREEN ===============
  if (gameState === 'finished' && finishResult) {
    return (
      <DashboardLayout activePath="/earn">
        <div className="max-w-xl mx-auto space-y-8 py-12">
          <Card className="glass-card text-center overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 gold-gradient" />
            <CardContent className="p-10 space-y-6">
              <Trophy className={`h-16 w-16 mx-auto ${finishResult.isPerfect ? 'text-primary animate-bounce' : 'text-primary'}`} />
              <h1 className="text-4xl font-display font-bold">
                {finishResult.isPerfect ? 'PERFECT SCORE!' : 'Quiz Complete!'}
              </h1>
              <p className="text-muted-foreground">
                You answered {finishResult.score} out of {finishResult.totalQuestions} correctly
              </p>
              {finishResult.isPerfect && (
                <Badge className="gold-gradient border-none text-sm px-4 py-1">+50% Perfect Bonus!</Badge>
              )}
              <div className="flex items-center justify-center gap-2 text-3xl font-display font-bold text-primary">
                <Coins className="h-8 w-8" /> +{finishResult.totalReward} BIX
              </div>
              {finishResult.bonusReward > 0 && (
                <p className="text-sm text-green-400">Includes +{finishResult.bonusReward} BIX perfect bonus!</p>
              )}
              <p className="text-sm text-muted-foreground">+{finishResult.xp} XP earned</p>
              <div className="flex gap-4 justify-center pt-4">
                <Button onClick={handleRestart} variant="outline" className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
                  <RotateCcw className="h-4 w-4" /> Play Again
                </Button>
                <Button onClick={() => (window.location.href = '/earn')} className="gold-gradient font-bold">
                  Back to Quests
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // =============== PLAYING SCREEN ===============
  if (!currentQuiz) {
    return (
      <DashboardLayout activePath="/earn">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activePath="/earn">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-display font-bold">Knowledge Quiz</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-primary/30 text-primary font-mono">
              {currentIndex + 1} / {questions.length}
            </Badge>
            <Badge className={`font-mono gap-1 ${timeLeft <= 5 ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' : 'gold-gradient border-none'}`}>
              <Timer className="h-3 w-3" /> {timeLeft}s
            </Badge>
          </div>
        </div>

        <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-2" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Score: <span className="text-primary font-bold">{score}</span></span>
          <span className="text-muted-foreground">Earned: <span className="text-primary font-bold">{totalEarned} BIX</span></span>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <Badge className="gold-gradient border-none">+{currentQuiz.rewardAmount} BIX</Badge>
              <Badge variant="outline" className="capitalize text-xs">{currentQuiz.difficulty || difficulty}</Badge>
            </div>
            <CardTitle className="text-xl leading-relaxed">{currentQuiz.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsedOptions.map((option, idx) => {
              const correct = correctOption !== null && idx === Number(correctOption);
              const isSelected = idx === selected;
              let extraClass = 'border-border/50 hover:border-primary/40 hover:bg-primary/5 text-left justify-start h-auto py-4 px-5';

              if (answered) {
                if (correct) {
                  extraClass = 'border-green-500/50 bg-green-500/10 text-left justify-start h-auto py-4 px-5';
                } else if (isSelected && !correct) {
                  extraClass = 'border-red-500/50 bg-red-500/10 text-left justify-start h-auto py-4 px-5';
                } else {
                  extraClass = 'border-border/30 opacity-50 text-left justify-start h-auto py-4 px-5';
                }
              }

              return (
                <Button
                  key={idx}
                  variant="outline"
                  className={`w-full ${extraClass} transition-all`}
                  onClick={() => handleAnswer(idx)}
                  disabled={answered || submitting}
                >
                  <span className="flex items-center gap-3 w-full">
                    <span className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-sm font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {answered && correct && <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />}
                    {answered && isSelected && !correct && <XCircle className="h-5 w-5 text-red-400 shrink-0" />}
                  </span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {answered && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isCorrect ? (
                <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Correct! +{currentQuiz.rewardAmount} BIX
                </Badge>
              ) : (
                <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 gap-1">
                  <XCircle className="h-3 w-3" /> Wrong answer
                </Badge>
              )}
            </div>
            <Button onClick={handleNext} className="gold-gradient font-bold gap-2 px-8 h-12" disabled={finishing}>
              {finishing ? 'Finishing...' : currentIndex + 1 >= questions.length ? 'View Results' : 'Next Question'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
