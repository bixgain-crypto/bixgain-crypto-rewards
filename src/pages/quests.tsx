import { useEffect, useState } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Zap, Share2, BrainCircuit, CheckCircle2, Lock, ArrowRight, Gift, Trophy, Sparkles, Globe, Eye } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_ICONS: Record<string, any> = {
  social: Share2,
  daily: Zap,
  watch: Eye,
  quiz: BrainCircuit,
  referral: Gift,
  milestone: Trophy,
  sponsored: Sparkles,
};

export default function QuestsPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [verifyingTaskIds, setVerifyingTaskIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [claimingTask, setClaimingTask] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bix_verifying_tasks');
    if (stored) {
      try {
        setVerifyingTaskIds(new Set(JSON.parse(stored)));
      } catch (e) {
        console.error('Failed to parse verifying tasks');
      }
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [taskList, userTasks] = await Promise.all([
          fetchSharedData('tasks'),
          user ? blink.db.table('user_tasks').list({ where: { userId: user.id, status: 'completed' } }) : Promise.resolve([]),
        ]);
        setTasks(taskList);
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
    if (!user || claimingTask) return;
    if (completedTaskIds.has(task.id)) {
      toast.info('Quest already completed!');
      return;
    }

    const isVerifying = verifyingTaskIds.has(task.id);

    if (!isVerifying && task.link) {
      // Step 1: Redirect to task
      window.open(task.link, '_blank');
      const newVerifying = new Set([...verifyingTaskIds, task.id]);
      setVerifyingTaskIds(newVerifying);
      localStorage.setItem('bix_verifying_tasks', JSON.stringify([...newVerifying]));
      toast.info('Finish the action and click Verify to claim rewards.');
      return;
    }

    // Step 2: Verify and Claim
    setClaimingTask(task.id);
    try {
      // Simulate authentic verification
      if (isVerifying) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }

      const result = await rewardEngine.completeTask(task.id);
      
      // Cleanup verification state if it was there
      if (isVerifying) {
        const newVerifying = new Set([...verifyingTaskIds]);
        newVerifying.delete(task.id);
        setVerifyingTaskIds(newVerifying);
        localStorage.setItem('bix_verifying_tasks', JSON.stringify([...newVerifying]));
      }

      setCompletedTaskIds(prev => new Set([...prev, task.id]));
      toast.success(`${result.message} (+${result.xp} XP)`);
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete task.');
    } finally {
      setClaimingTask(null);
    }
  };

  const userLevel = Math.floor((profile?.totalEarned || 0) / 500) + 1;

  const socialTasks = tasks.filter(t => ['social', 'watch', 'sponsored'].includes(t.category));
  const milestoneTasks = tasks.filter(t => ['milestone', 'referral'].includes(t.category));
  const dailyTasks = tasks.filter(t => t.taskType === 'daily' || t.category === 'daily');

  const renderTask = (task: any) => {
    const isCompleted = completedTaskIds.has(task.id);
    const isVerifying = verifyingTaskIds.has(task.id);
    const isClaiming = claimingTask === task.id;
    const isLocked = task.requiredLevel && userLevel < task.requiredLevel;
    const IconComponent = CATEGORY_ICONS[task.category] || Zap;

    return (
      <Card key={task.id} className={`bg-card/30 border-white/5 transition-all ${isLocked ? 'opacity-50' : 'hover:border-primary/20'}`}>
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${isCompleted ? 'bg-green-500/10 border-green-500/20' : 'bg-primary/10 border-primary/20'}`}>
              {isCompleted ? (
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              ) : isLocked ? (
                <Lock className="h-7 w-7 text-muted-foreground" />
              ) : (
                <IconComponent className="h-7 w-7 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold">{task.title}</h3>
                <Badge variant="secondary" className="capitalize text-[10px]">{task.category}</Badge>
                {task.taskType === 'daily' && <Badge className="gold-gradient border-none text-[10px]">DAILY</Badge>}
              </div>
              <p className="text-muted-foreground max-w-lg">{task.description}</p>
              {isLocked && (
                <p className="text-xs text-orange-400 mt-1">Requires Level {task.requiredLevel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6 w-full md:w-auto shrink-0">
            <div className="text-right">
              <p className="text-2xl font-display font-bold text-primary">+{task.rewardAmount} BIX</p>
              <p className="text-xs text-muted-foreground">{task.xpReward ? `+${task.xpReward} XP` : 'Instant Reward'}</p>
            </div>
            {isCompleted ? (
              <Button disabled className="bg-green-500/20 text-green-400 border border-green-500/30 font-bold gap-2">
                <CheckCircle2 className="h-4 w-4" /> DONE
              </Button>
            ) : isLocked ? (
              <Button disabled className="font-bold gap-2">
                <Lock className="h-4 w-4" /> LOCKED
              </Button>
            ) : (
              <Button
                className={`${isVerifying ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30' : 'gold-gradient gold-glow'} font-bold px-8 h-12 transition-all min-w-[140px]`}
                onClick={() => handleCompleteTask(task)}
                disabled={isClaiming}
              >
                {isClaiming ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Checking...
                  </span>
                ) : isVerifying ? (
                  'Verify'
                ) : task.link ? (
                  'Go'
                ) : (
                  'Claim'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout activePath="/earn">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">Earning Center</h1>
            <p className="text-muted-foreground">Complete quests to fill your wallet with BIX tokens.</p>
          </div>
          <div className="flex items-center gap-4 bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20">
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Your Level</p>
              <p className="text-xl font-bold font-display text-primary">Level {userLevel}</p>
            </div>
            <Trophy className="h-8 w-8 text-primary" />
          </div>
        </div>

        <Tabs defaultValue="tasks" className="w-full">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="tasks" className="gap-2"><Zap className="h-4 w-4" /> Active Quests</TabsTrigger>
            <TabsTrigger value="daily" className="gap-2"><Sparkles className="h-4 w-4" /> Daily Tasks</TabsTrigger>
            <TabsTrigger value="milestones" className="gap-2"><Trophy className="h-4 w-4" /> Milestones</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              </div>
            ) : socialTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No active quests right now. Check back later!</p>
              </div>
            ) : (
              socialTasks.map(renderTask)
            )}

            {/* Quiz CTA */}
            <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 hover:border-primary/40 transition-all cursor-pointer" onClick={() => (window.location.href = '/quiz')}>
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
                    <BrainCircuit className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Take a Crypto Quiz</h3>
                    <p className="text-muted-foreground">Test your knowledge and earn BIX. Choose difficulty and question count!</p>
                  </div>
                </div>
                <Button className="gold-gradient font-bold gap-2 px-8 h-12">
                  Start Quiz <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily" className="mt-6 space-y-4">
            {dailyTasks.map(renderTask)}
            {dailyTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No daily tasks available. Come back tomorrow!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="milestones" className="mt-6 space-y-4">
            {milestoneTasks.map(renderTask)}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
