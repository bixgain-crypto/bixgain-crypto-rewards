import { useEffect, useState } from 'react';
import { rewardEngine } from '../lib/reward-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { AlertTriangle, CheckCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAbuseFlags() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchFlags = async () => {
    try {
      const res = await rewardEngine.adminGetAbuseFlags();
      setFlags(res.flags || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleResolve = async (flagId: string) => {
    setResolving(flagId);
    try {
      await rewardEngine.adminResolveFlag(flagId);
      toast.success('Flag resolved');
      fetchFlags();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResolving(null);
    }
  };

  const severityColor: Record<string, string> = {
    low: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    medium: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    critical: 'bg-red-600/30 text-red-300 border-red-500/50',
  };

  const flagTypeLabels: Record<string, string> = {
    multi_account_ip: 'Multi-Account (Same IP)',
    brute_force_codes: 'Brute Force Codes',
    referral_ip_match: 'Referral IP Match',
    referral_same_ip: 'Self-Referral (Same IP)',
    suspicious_activity: 'Suspicious Activity',
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const unresolvedFlags = flags.filter((f) => !Number(f.resolved));
  const resolvedFlags = flags.filter((f) => Number(f.resolved) > 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card/30 border-white/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Flags</p>
            <p className="text-2xl font-bold">{flags.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Unresolved</p>
            <p className="text-2xl font-bold text-red-400">{unresolvedFlags.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Resolved</p>
            <p className="text-2xl font-bold text-green-400">{resolvedFlags.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Unresolved Flags */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-400" />
              Abuse Flags
            </CardTitle>
            <CardDescription>Review and resolve suspicious activity flags</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchFlags} className="gap-2">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {flags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No abuse flags detected. System is clean.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((f) => {
                  const isResolved = Number(f.resolved) > 0;
                  let details = '';
                  try {
                    const parsed = JSON.parse(f.details || '{}');
                    details = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ');
                  } catch {
                    details = f.details || '';
                  }

                  return (
                    <TableRow key={f.id} className={isResolved ? 'opacity-50' : ''}>
                      <TableCell className="font-mono text-xs">{(f.user_id || '').slice(-8)}</TableCell>
                      <TableCell className="text-xs">{flagTypeLabels[f.flag_type] || f.flag_type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${severityColor[f.severity] || ''}`}>
                          {(f.severity || 'low').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{details}</TableCell>
                      <TableCell className="text-xs">
                        {f.created_at ? new Date(f.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {isResolved ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" /> RESOLVED
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">OPEN</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isResolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1"
                            onClick={() => handleResolve(f.id)}
                            disabled={resolving === f.id}
                          >
                            {resolving === f.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                            Resolve
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
