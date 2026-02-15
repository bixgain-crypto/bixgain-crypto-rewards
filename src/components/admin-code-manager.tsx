import { useEffect, useState } from 'react';
import { rewardEngine } from '../lib/reward-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Key, Plus, Copy, Trash2, Clock, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  tasks: any[];
}

export default function AdminCodeManager({ tasks }: Props) {
  const [windows, setWindows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('general');
  const [validHours, setValidHours] = useState(3);
  const [maxRedemptions, setMaxRedemptions] = useState('');

  const fetchWindows = async () => {
    try {
      const res = await rewardEngine.adminListCodeWindows(false);
      setWindows(res.windows || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWindows();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const maxRed = maxRedemptions ? parseInt(maxRedemptions) : undefined;
      const res = await rewardEngine.adminGenerateCodeWindow(
        selectedTaskId === 'general' ? null : selectedTaskId,
        validHours,
        maxRed
      );
      toast.success(`Code generated: ${res.code}`);
      navigator.clipboard.writeText(res.code);
      fetchWindows();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDisable = async (windowId: string) => {
    try {
      await rewardEngine.adminDisableCodeWindow(windowId);
      toast.success('Code window disabled');
      fetchWindows();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied: ${code}`);
  };

  return (
    <div className="space-y-6">
      {/* Generate New Code */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Generate New Code Window
          </CardTitle>
          <CardDescription>
            Create a time-based verification code. Max 4 per task per day. Each code valid for the specified duration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Task (optional)</label>
              <select
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
              >
                <option value="general">General (no specific task)</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title} ({t.rewardAmount} BIX)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valid Hours</label>
              <Input
                type="number"
                min={1}
                max={24}
                value={validHours}
                onChange={(e) => setValidHours(parseInt(e.target.value) || 3)}
                className="bg-background/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max Redemptions (blank = unlimited)</label>
              <Input
                type="number"
                min={1}
                placeholder="Unlimited"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                className="bg-background/50"
              />
            </div>
            <div className="flex items-end">
              <Button
                className="gold-gradient font-bold gap-2 w-full h-10"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {generating ? 'Generating...' : 'Generate Code'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Code Windows */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Code Windows</CardTitle>
            <CardDescription>{windows.length} total windows</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchWindows} className="gap-2">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : windows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No code windows yet. Generate your first code above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Time Left</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {windows.map((w) => {
                  const isActive = Number(w.isActive) > 0 && !w.expired;
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-primary text-sm">{w.code}</code>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyCode(w.code)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{w.taskId === 'general' ? 'General' : w.taskId}</TableCell>
                      <TableCell>
                        <span className="font-bold">{w.currentRedemptions || 0}</span>
                        <span className="text-muted-foreground">/{w.maxRedemptions || 'unlimited'}</span>
                        {w.utilizationPercent !== null && (
                          <span className="text-xs text-muted-foreground ml-1">({w.utilizationPercent}%)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isActive ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3 text-green-400" />
                            <span className="text-green-400 font-medium">{w.remainingMinutes} min</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Expired</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isActive ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" /> ACTIVE
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">EXPIRED</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 gap-1"
                            onClick={() => handleDisable(w.id)}
                          >
                            <Trash2 className="h-3 w-3" /> Disable
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
