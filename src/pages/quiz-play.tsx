import { useState, useEffect } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { BrainCircuit, CheckCircle2, XCircle, ArrowRight, Coins, Trophy, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface Quiz {
  id: string;
  question: string;
  options: string;
  correctOption: number;
  rewardAmount: number;
}

export default function QuizPlayPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSharedData('quizzes')
      .then((data) => setQuizzes(data))
      .catch(() => toast.error('Failed to load quizzes'))
      .finally(() => setLoading(false));
  }, []);

  const currentQuiz = quizzes[currentIndex];
  const parsedOptions: string[] = currentQuiz
    ? (() => { try { return JSON.parse(currentQuiz.options); } catch { return []; } })()
    : [];

  const handleAnswer = async (optionIndex: number) => {
    if (answered || !currentQuiz || !user) return;
    setSelected(optionIndex);
    setAnswered(true);

    const isCorrect = optionIndex === Number(currentQuiz.correctOption);
    if (isCorrect) {
      setScore((s) => s + 1);
      setTotalEarned((e) => e + currentQuiz.rewardAmount);
      try {
        await blink.db.userProfiles.update(user.id, {
          balance: (profile?.balance || 0) + currentQuiz.rewardAmount,
          totalEarned: (profile?.totalEarned || 0) + currentQuiz.rewardAmount,
        });
        await blink.db.transactions.create({
          userId: user.id,
          amount: currentQuiz.rewardAmount,
          type: 'earn',
          description: `Quiz correct: ${currentQuiz.question.slice(0, 40)}...`,
        });
        refreshProfile();
      } catch {
        /* silently continue */
      }
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 >= quizzes.length) {
      setFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setAnswered(false);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelected(null);
    setAnswered(false);
    setScore(0);
    setTotalEarned(0);
    setFinished(false);
  };

  if (loading) {
    return (
      <DashboardLayout activePath="/earn">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (quizzes.length === 0) {
    return (
      <DashboardLayout activePath="/earn">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <BrainCircuit className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">No Quizzes Available</h2>
          <p className="text-muted-foreground mb-6">Check back later for new knowledge quizzes.</p>
          <Button onClick={() => (window.location.href = '/earn')}>Back to Quests</Button>
        </div>
      </DashboardLayout>
    );
  }

  if (finished) {
    return (
      <DashboardLayout activePath="/earn">
        <div className="max-w-xl mx-auto space-y-8 py-12">
          <Card className="glass-card text-center overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 gold-gradient" />
            <CardContent className="p-10 space-y-6">
              <Trophy className="h-16 w-16 text-primary mx-auto" />
              <h1 className="text-4xl font-display font-bold">Quiz Complete!</h1>
              <p className="text-muted-foreground">You answered {score} out of {quizzes.length} correctly</p>
              <div className="flex items-center justify-center gap-2 text-3xl font-display font-bold text-primary">
                <Coins className="h-8 w-8" /> +{totalEarned} BIX
              </div>
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

  return (
    <DashboardLayout activePath="/earn">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-display font-bold">Knowledge Quiz</h1>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary font-mono">
            {currentIndex + 1} / {quizzes.length}
          </Badge>
        </div>

        <Progress value={((currentIndex + 1) / quizzes.length) * 100} className="h-2" />

        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <Badge className="gold-gradient border-none">+{currentQuiz.rewardAmount} BIX</Badge>
              <span className="text-sm text-muted-foreground">Score: {score}</span>
            </div>
            <CardTitle className="text-xl leading-relaxed">{currentQuiz.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {parsedOptions.map((option, idx) => {
              const isCorrect = idx === Number(currentQuiz.correctOption);
              const isSelected = idx === selected;
              let variant = 'outline' as const;
              let extraClass = 'border-border/50 hover:border-primary/40 hover:bg-primary/5 text-left justify-start h-auto py-4 px-5';

              if (answered) {
                if (isCorrect) {
                  extraClass = 'border-green-500/50 bg-green-500/10 text-left justify-start h-auto py-4 px-5';
                } else if (isSelected && !isCorrect) {
                  extraClass = 'border-red-500/50 bg-red-500/10 text-left justify-start h-auto py-4 px-5';
                } else {
                  extraClass = 'border-border/30 opacity-50 text-left justify-start h-auto py-4 px-5';
                }
              }

              return (
                <Button
                  key={idx}
                  variant={variant}
                  className={`w-full ${extraClass} transition-all`}
                  onClick={() => handleAnswer(idx)}
                  disabled={answered}
                >
                  <span className="flex items-center gap-3 w-full">
                    <span className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-sm font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {answered && isCorrect && <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />}
                    {answered && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-red-400 shrink-0" />}
                  </span>
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {answered && (
          <div className="flex justify-end">
            <Button onClick={handleNext} className="gold-gradient font-bold gap-2 px-8 h-12">
              {currentIndex + 1 >= quizzes.length ? 'View Results' : 'Next Question'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
