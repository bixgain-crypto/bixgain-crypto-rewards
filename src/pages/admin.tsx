import { useEffect, useState } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Settings, Users, Database, ShieldAlert, Plus, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPanel() {
  const { user, profile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Robust admin check
  const isAdmin = profile?.role === 'admin' || user?.email === 'bixgain@gmail.com';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userList, taskList] = await Promise.all([
          blink.db.userProfiles.list({ limit: 20 }),
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
          <p className="text-muted-foreground">You do not have administrative privileges to view this page.</p>
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
          <p className="text-muted-foreground">Manage users, tasks, rewards, and system configurations.</p>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" /> Users</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2"><Database className="h-4 w-4" /> Reward Tasks</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" /> System Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>View and manage all registered miners</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.userId}>
                        <TableCell className="font-mono text-xs">{u.userId}</TableCell>
                        <TableCell>{u.displayName}</TableCell>
                        <TableCell className="font-bold text-primary">{u.balance} BIX</TableCell>
                        <TableCell><span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary uppercase font-bold">{u.role}</span></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Edit</Button>
                          <Button variant="ghost" size="sm" className="text-red-400">Suspend</Button>
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
                <Button className="gold-gradient font-bold gap-2"><Plus className="h-4 w-4" /> Add Task</Button>
              </CardHeader>
              <CardContent>
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
                        <TableCell className="text-xs text-muted-foreground">{t.id}</TableCell>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="font-bold text-primary">{t.rewardAmount} BIX</TableCell>
                        <TableCell className="capitalize">{t.category}</TableCell>
                        <TableCell>
                          {t.isActive ? (
                            <span className="flex items-center gap-1 text-green-400 text-xs font-medium"><CheckCircle className="h-3 w-3" /> Active</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-xs font-medium"><XCircle className="h-3 w-3" /> Inactive</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">Modify</Button>
                          <Button variant="ghost" size="sm" className="text-red-400">Disable</Button>
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
