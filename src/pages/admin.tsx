import { useEffect, useState } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Settings, Users, Database, ShieldAlert, Plus, CheckCircle, XCircle, Key, BarChart3, AlertTriangle, Clock, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import AdminCodeManager from '../components/admin-code-manager';
import AdminMetrics from '../components/admin-metrics';
import AdminAbuseFlags from '../components/admin-abuse-flags';

export default function AdminPanel() {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin' || user?.email === 'bixgain@gmail.com';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userList, taskList] = await Promise.all([
          blink.db.userProfiles.list({ limit: 50, orderBy: { balance: 'desc' } }),
          fetchSharedData('tasks'),
        ]);
        setUsers(userList);
        setTasks(taskList);
      } catch (err) {
        console.error('Error fetching admin data:', err);
      } finally {
        setLoading(false);
      }
    };
    if (isAdmin) fetchData();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <DashboardLayout activePath="/admin">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
          <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You do not have administrative privileges.</p>
          <Button className="mt-6" onClick={() => window.location.href = '/'}>Return Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activePath="/admin">
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold mb-2">System Administration</h1>
          <p className="text-muted-foreground">Manage codes, users, metrics, and anti-abuse systems.</p>
        </div>

        <Tabs defaultValue="codes" className="w-full">
          <TabsList className="bg-card border border-border flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="codes" className="gap-2"><Key className="h-4 w-4" /> Code Windows</TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2"><BarChart3 className="h-4 w-4" /> Metrics</TabsTrigger>
            <TabsTrigger value="abuse" className="gap-2"><AlertTriangle className="h-4 w-4" /> Abuse Flags</TabsTrigger>
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2"><Database className="h-4 w-4" /> Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="codes" className="mt-6">
            <AdminCodeManager tasks={tasks} />
          </TabsContent>

          <TabsContent value="metrics" className="mt-6">
            <AdminMetrics />
          </TabsContent>

          <TabsContent value="abuse" className="mt-6">
            <AdminAbuseFlags />
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View all registered miners ({users.length} loaded)</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Total Earned</TableHead>
                      <TableHead>Streak</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.userId || u.id}>
                        <TableCell className="font-mono text-xs">{(u.userId || u.id || '').slice(-8)}</TableCell>
                        <TableCell>{u.displayName || 'Miner'}</TableCell>
                        <TableCell className="font-bold text-primary">{Math.round(u.balance || 0)} BIX</TableCell>
                        <TableCell>{Math.round(u.totalEarned || 0)} BIX</TableCell>
                        <TableCell>{u.dailyStreak || 0} days</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] uppercase">
                            {u.role || 'user'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-6">
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Reward Tasks</CardTitle>
                  <CardDescription>Configure quests and earning opportunities</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground">{t.id}</TableCell>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="font-bold text-primary">{t.rewardAmount} BIX</TableCell>
                        <TableCell className="capitalize">{t.category}</TableCell>
                        <TableCell>
                          {Number(t.isActive) > 0 ? (
                            <span className="flex items-center gap-1 text-green-400 text-xs font-medium"><CheckCircle className="h-3 w-3" /> Active</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><XCircle className="h-3 w-3" /> Inactive</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
