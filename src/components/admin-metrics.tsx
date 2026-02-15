import { useEffect, useState } from 'react';
import { rewardEngine } from '../lib/reward-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { BarChart3, Users, Coins, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminMetrics() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [flaggedAccounts, setFlaggedAccounts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await rewardEngine.adminGetMetrics();
        setMetrics(res || []);
        setTotalUsers(0); // Placeholder
        setFlaggedAccounts(0); // Placeholder
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  const todayMetric = metrics[0] || {};
  const totalAllTime = metrics.reduce((sum: number, m: any) => sum + (m.total_rewards_issued || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/30 border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold font-display">{totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Coins className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Today BIX Issued</p>
                <p className="text-2xl font-bold font-display text-green-400">
                  {Math.round(todayMetric.total_daily_rewards || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">All-Time Issued</p>
                <p className="text-2xl font-bold font-display text-blue-400">{Math.round(totalAllTime)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/30 border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Flagged Accounts</p>
                <p className="text-2xl font-bold font-display text-red-400">{flaggedAccounts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today Breakdown */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Today&apos;s Reward Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Task Rewards', value: todayMetric.task_rewards_issued || 0, color: 'text-primary' },
              { label: 'Referral Rewards', value: todayMetric.referral_rewards_issued || 0, color: 'text-green-400' },
              { label: 'Quiz Rewards', value: todayMetric.quiz_rewards_issued || 0, color: 'text-blue-400' },
              { label: 'Game Rewards', value: todayMetric.game_rewards_issued || 0, color: 'text-purple-400' },
              { label: 'Code Rewards', value: todayMetric.code_rewards_issued || 0, color: 'text-orange-400' },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-xl bg-muted/20 border border-white/5 text-center">
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className={`text-xl font-bold font-display ${item.color}`}>{Math.round(item.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily History */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Daily Metrics History</CardTitle>
          <CardDescription>Last 30 days of reward distribution</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {metrics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No metrics data yet. Data will appear as rewards are distributed.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Issued</TableHead>
                  <TableHead>Active Users</TableHead>
                  <TableHead>Tasks</TableHead>
                  <TableHead>Referrals</TableHead>
                  <TableHead>Quizzes</TableHead>
                  <TableHead>Codes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m) => (
                  <TableRow key={m.id || m.metric_date}>
                    <TableCell className="font-medium">{m.metric_date}</TableCell>
                    <TableCell className="font-bold text-primary">{Math.round(m.total_daily_rewards || 0)}</TableCell>
                    <TableCell>{m.active_users_today || 0}</TableCell>
                    <TableCell>{Math.round(m.task_rewards_issued || 0)}</TableCell>
                    <TableCell>{Math.round(m.referral_rewards_issued || 0)}</TableCell>
                    <TableCell>{Math.round(m.quiz_rewards_issued || 0)}</TableCell>
                    <TableCell>{Math.round(m.code_rewards_issued || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
