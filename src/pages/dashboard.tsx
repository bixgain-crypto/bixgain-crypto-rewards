import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Coins, Zap, Trophy, TrendingUp, ArrowRight, CheckCircle2, Clock, Gamepad2, Gift } from 'lucide-react';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const allTasks = await fetchSharedData('tasks', 5);
        setTasks(allTasks);
      } catch (err) {
        console.error('Error fetching tasks:', err);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, []);

  const [checkinLoading, setCheckinLoading] = useState(false);

  const handleDailyCheckin = async () => {
    if (!user || checkinLoading) return;
    setCheckinLoading(true);
    try {
      const result = await rewardEngine.dailyCheckin();
      toast.success(result.message);
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to check in.');
    } finally {
      setCheckinLoading(false);
    }
  };

  return (
    <DashboardLayout activePath="/">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card gold-glow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary font-display">{profile?.balance?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">BIX Tokens</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Daily Streak</CardTitle>
            <Zap className="h-4 w-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{profile?.dailyStreak || 0} Days</div>
            <Progress value={((profile?.dailyStreak || 0) % 7) * 14.2} className="h-2 mt-3" />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Miner Level</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">Lvl {Math.floor((profile?.totalEarned || 0) / 500) + 1}</div>
            <p className="text-xs text-muted-foreground mt-1">{profile?.xp || 0} XP earned</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{profile?.totalEarned?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Lifetime Earnings</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-display font-bold">Recommended Quests</h2>
            <Button variant="link" className="text-primary hover:text-primary/80">View all <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>

          <div className="grid gap-4">
            {loadingTasks ? (
              <p className="text-muted-foreground">Loading tasks...</p>
            ) : tasks.map((task) => (
              <Card key={task.id} className="bg-card/30 border-white/5 hover:border-primary/20 transition-all group">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      {task.category === 'social' ? <TrendingUp className="h-6 w-6" /> : <Gift className="h-6 w-6" />}
                    </div>
                    <div>
                      <h3 className="font-bold">{task.title}</h3>
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold text-primary">+{task.rewardAmount} BIX</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Clock className="h-3 w-3" /> 2m</p>
                    </div>
                    <Button 
                      size="sm" 
                      className="gold-gradient hover:opacity-90"
                      onClick={() => window.location.href = '/earn'}
                    >
                      Start
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-display font-bold">Daily Multiplier</h2>
          <Card className="gold-gradient border-none overflow-hidden relative group">
            <CardContent className="p-6">
              <div className="relative z-10 text-background">
                <h3 className="text-xl font-bold mb-2">Claim Today's Bonus</h3>
                <p className="text-sm mb-6 opacity-90">Log in every day to increase your earning multiplier up to 5x!</p>
                <Button 
                  className="w-full bg-background text-primary hover:bg-background/90 font-bold"
                  onClick={handleDailyCheckin}
                  disabled={checkinLoading}
                >
                  {checkinLoading ? 'Claiming...' : `Claim ${profile?.dailyStreak ? Math.round(10 * Math.min(1 + ((profile.dailyStreak || 0)) * 0.5, 5)) : 10} BIX`}
                </Button>
              </div>
              <Coins className="absolute -bottom-4 -right-4 h-32 w-32 text-white/10 rotate-12 group-hover:rotate-45 transition-transform duration-700" />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Featured Mini-Game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 relative flex items-center justify-center overflow-hidden">
                <Gamepad2 className="h-12 w-12 text-white/50" />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white">
                  <div>
                    <p className="font-bold">BixGain Roulette</p>
                    <p className="text-xs opacity-80">Win up to 10x your bet</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="bg-white/20 hover:bg-white/30 backdrop-blur-md border-none text-white"
                    onClick={() => window.location.href = '/games'}
                  >
                    Play
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Jackpot: 5,000 BIX</span>
                </div>
                <span className="text-muted-foreground">24 players live</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
