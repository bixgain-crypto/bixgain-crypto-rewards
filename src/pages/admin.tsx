import { useEffect, useState } from 'react';
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
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    category: 'social',
    task_type: 'one-time',
    reward_amount: 100,
    xp_reward: 50,
    required_level: 0,
    link: '',
  });

  const isAdmin = profile?.role === 'admin' || user?.email === 'bixgain@gmail.com';

  const fetchData = async () => {
    try {
      const [userList, taskList] = await Promise.all([
        fetchSharedData('user_profiles', 50),
        fetchSharedData('tasks'),
      ]);
      setUsers(userList || []);
      setTasks(taskList || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin]);

  const handleCreateTask = async () => {
    if (!newTask.title) {
      toast.error('Title is required');
      return;
    }

    setCreatingTask(true);
    try {
      await rewardEngine.adminCreateTask({
        id: `task_${Math.random().toString(36).slice(2, 8)}`,
        ...newTask
      });
      toast.success('Task created successfully');
      setIsCreateDialogOpen(false);
      setNewTask({
        title: '',
        description: '',
        category: 'social',
        task_type: 'one-time',
        reward_amount: 100,
        xp_reward: 50,
        required_level: 0,
        link: '',
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: number) => {
    try {
      await rewardEngine.adminToggleTask(taskId, currentStatus > 0 ? 0 : 1);
      toast.success('Task status updated');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await rewardEngine.adminDeleteTask(taskId);
      toast.success('Task deleted');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete task');
    }
  };

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
                      <TableRow key={u.user_id || u.id}>
                        <TableCell className="font-mono text-xs">{(u.user_id || u.id || '').slice(-8)}</TableCell>
                        <TableCell>{u.display_name || 'Miner'}</TableCell>
                        <TableCell className="font-bold text-primary">{Math.round(u.balance || 0)} BIX</TableCell>
                        <TableCell>{Math.round(u.total_earned || 0)} BIX</TableCell>
                        <TableCell>{u.daily_streak || 0} days</TableCell>
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
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="gold-gradient gold-glow gap-2">
                      <Plus className="h-4 w-4" /> New Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px] glass-card border-white/10 text-foreground">
                    <DialogHeader>
                      <DialogTitle>Create New Quest</DialogTitle>
                      <DialogDescription>Fill in the details for the new earning opportunity.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="title">Task Title</Label>
                        <Input
                          id="title"
                          placeholder="e.g. Follow us on Twitter"
                          value={newTask.title}
                          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          placeholder="What should the user do?"
                          value={newTask.description}
                          onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Category</Label>
                          <Select
                            value={newTask.category}
                            onValueChange={(val) => setNewTask({ ...newTask, category: val })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="social">Social</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="watch">Watch</SelectItem>
                              <SelectItem value="quiz">Quiz</SelectItem>
                              <SelectItem value="referral">Referral</SelectItem>
                              <SelectItem value="milestone">Milestone</SelectItem>
                              <SelectItem value="sponsored">Sponsored</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Type</Label>
                          <Select
                            value={newTask.taskType}
                            onValueChange={(val) => setNewTask({ ...newTask, taskType: val })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="one-time">One-time</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="recursive">Recursive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="reward">Reward (BIX)</Label>
                          <Input
                            id="reward"
                            type="number"
                            value={newTask.rewardAmount}
                            onChange={(e) => setNewTask({ ...newTask, rewardAmount: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="xp">XP</Label>
                          <Input
                            id="xp"
                            type="number"
                            value={newTask.xpReward}
                            onChange={(e) => setNewTask({ ...newTask, xpReward: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="level">Min Level</Label>
                          <Input
                            id="level"
                            type="number"
                            value={newTask.requiredLevel}
                            onChange={(e) => setNewTask({ ...newTask, requiredLevel: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="link">Link (Optional)</Label>
                        <Input
                          id="link"
                          placeholder="https://..."
                          value={newTask.link}
                          onChange={(e) => setNewTask({ ...newTask, link: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateTask} disabled={creatingTask} className="gold-gradient">
                        {creatingTask ? 'Creating...' : 'Create Task'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground">{(t.id || '').slice(-6)}</TableCell>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="font-bold text-primary">{t.reward_amount} BIX</TableCell>
                        <TableCell className="capitalize text-xs">{t.category}</TableCell>
                        <TableCell>
                          {Number(t.is_active) > 0 ? (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleToggleTaskStatus(t.id, Number(t.is_active))}
                              title={Number(t.is_active) > 0 ? "Deactivate" : "Activate"}
                            >
                              {Number(t.is_active) > 0 ? <XCircle className="h-4 w-4 text-orange-400" /> : <CheckCircle className="h-4 w-4 text-green-400" />}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                              onClick={() => handleDeleteTask(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
