import { useEffect, useState } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Zap, Share2, BrainCircuit, CheckCircle2, Lock, ArrowRight, Gift, Trophy } from 'lucide-react';
import { toast } from 'sonner';

export default function QuestsPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [taskList, quizList, userTasks] = await Promise.all([
          fetchSharedData('tasks'),
          fetchSharedData('quizzes'),
          user ? blink.db.userTasks.list({ where: { userId: user.id, status: 'completed' } }) : Promise.resolve([]),
        ]);
        setTasks(taskList);
        setQuizzes(quizList);
        setCompletedTaskIds(new Set(userTasks.map((ut: any) => ut.taskId)));
      } catch (err) {
        console.error('Error fetching quests:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const handleCompleteTask = async (task: any) => {
    if (!user) return;
    if (completedTaskIds.has(task.id)) {
      toast.info('Quest already completed!');
      return;
    }

    try {
      // Simulate task verification (e.g. social link click)
      if (task.link) window.open(task.link, '_blank');
      
      const promise = new Promise((resolve) => setTimeout(resolve, 2000));
      toast.promise(promise, {
        loading: 'Verifying completion...',
        success: async () => {
          await blink.db.userTasks.create({
            id: `ut_${user.id}_${task.id}`,
            userId: user.id,
            taskId: task.id,
            status: 'completed',
            completedAt: new Date().toISOString(),
          });

          await blink.db.userProfiles.update(user.id, {
            balance: profile.balance + task.rewardAmount,
            totalEarned: profile.totalEarned + task.rewardAmount,
          });

          await blink.db.transactions.create({
            userId: user.id,
            amount: task.rewardAmount,
            type: 'earn',
            description: `Completed Quest: ${task.title}`,
          });

          setCompletedTaskIds(prev => new Set([...prev, task.id]));
          refreshProfile();
          return `Quest completed! +${task.rewardAmount} BIX earned.`;
        },
        error: 'Verification failed.',
      });
    } catch (err) {
      toast.error('Error completing task.');
    }
  };

  return (
    <DashboardLayout activePath="/earn">
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold mb-2">Earning Center</h1>
          <p className="text-muted-foreground">Complete quests and quizzes to fill your wallet with BIX tokens.</p>
        </div>

        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="tasks" className="gap-2"><Zap className="h-4 w-4" /> Active Quests</TabsTrigger>
            <TabsTrigger value="quizzes" className="gap-2"><BrainCircuit className="h-4 w-4" /> Knowledge Quizzes</TabsTrigger>
            <TabsTrigger value="milestones" className="gap-2"><Trophy className="h-4 w-4" /> Milestones</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-6 space-y-4">
            {tasks.map((task) => (
              <Card key={task.id} className="bg-card/30 border-white/5 hover:border-primary/20 transition-all">
                <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                      {task.category === 'social' ? <Share2 className="h-7 w-7" /> : <Zap className="h-7 w-7" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold">{task.title}</h3>
                        <Badge variant="secondary" className="capitalize text-[10px]">{task.category}</Badge>
                      </div>
                      <p className="text-muted-foreground max-w-lg">{task.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full md:w-auto shrink-0">
                    <div className="text-right">
                      <p className="text-2xl font-display font-bold text-primary">+{task.rewardAmount} BIX</p>
                      <p className="text-xs text-muted-foreground">Instant Reward</p>
                    </div>
                    {completedTaskIds.has(task.id) ? (
                      <Button disabled className="bg-green-500/20 text-green-400 border border-green-500/30 font-bold gap-2">
                        <CheckCircle2 className="h-4 w-4" /> COMPLETED
                      </Button>
                    ) : (
                      <Button 
                        className="gold-gradient gold-glow font-bold px-8 h-12"
                        onClick={() => handleCompleteTask(task)}
                      >
                        Claim Reward
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="quizzes" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map((quiz) => (
                <Card key={quiz.id} className="glass-card flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="border-primary/30 text-primary">NEW</Badge>
                      <BrainCircuit className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{quiz.question}</CardTitle>
                    <CardDescription>Reward: {quiz.rewardAmount} BIX</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <Button 
                      className="w-full border-primary/20 text-primary hover:bg-primary/10" 
                      variant="outline"
                      onClick={() => (window.location.href = '/quiz')}
                    >
                      Start Quiz <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
              <Card className="glass-card border-dashed flex flex-col items-center justify-center p-8 text-center bg-transparent">
                <Lock className="h-8 w-8 text-muted-foreground mb-4" />
                <h3 className="font-bold mb-1">Advanced Quiz</h3>
                <p className="text-xs text-muted-foreground">Reach Level 10 to unlock daily advanced knowledge tests.</p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" />
                    First 1,000 BIX
                  </CardTitle>
                  <CardDescription>Earn your first 1,000 BIX tokens</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                    <div 
                      className="h-full bg-primary gold-glow" 
                      style={{ width: `${Math.min(((profile?.totalEarned || 0) / 1000) * 100, 100)}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span>{profile?.totalEarned || 0} / 1000</span>
                    <span className="text-primary">+500 BIX BONUS</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-muted/30 border-white/5 opacity-60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-muted-foreground" />
                    Master Referrer
                  </CardTitle>
                  <CardDescription>Refer 100 active miners</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-muted-foreground" style={{ width: '12%' }} />
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span>12 / 100</span>
                    <span className="text-muted-foreground">+5,000 BIX BONUS</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
