import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/use-auth';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Wallet, ArrowDownLeft, ArrowUpRight, History, Coins, CreditCard } from 'lucide-react';

export default function WalletPage() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (profile?.user_id) {
        const { data: history } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        setTransactions(history || []);
      }
    };
    fetchTransactions();
  }, [profile]);

  return (
    <DashboardLayout activePath="/wallet">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="gold-gradient border-none text-background p-8 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-sm opacity-80 mb-2 uppercase tracking-wider font-semibold">BixGain Integrated Wallet</p>
                <h2 className="text-4xl font-display font-bold mb-2">
                  {profile?.balance?.toLocaleString() || 0} <span className="text-2xl opacity-80 font-medium">BIX</span>
                </h2>
                <p className="text-xs opacity-70">≈ $0.00 USD (Mainnet integration coming soon)</p>
              </div>
              <div className="flex gap-2">
                <div className="p-3 bg-background/20 rounded-xl backdrop-blur-sm">
                  <Coins className="h-6 w-6" />
                </div>
                <div className="p-3 bg-background/20 rounded-xl backdrop-blur-sm">
                  <CreditCard className="h-6 w-6" />
                </div>
              </div>
            </div>
            <Coins className="absolute -bottom-12 -right-12 h-64 w-64 text-white/5 rotate-12" />
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Your latest earnings and spends</CardDescription>
              </div>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions yet.</TableCell>
                    </TableRow>
                  ) : transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 capitalize">
                          {tx.amount > 0 ? (
                            <ArrowDownLeft className="h-4 w-4 text-green-400" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-red-400" />
                          )}
                          {tx.type}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{tx.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount} BIX
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                Withdrawal Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-xl bg-muted/30 border border-white/5 text-center">
                <p className="text-sm text-muted-foreground mb-1">Minimum for Payout</p>
                <p className="text-xl font-bold font-display">10,000 BIX</p>
                <div className="w-full h-1.5 bg-muted mt-4 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary gold-glow" 
                    style={{ width: `${Math.min(((profile?.balance || 0) / 10000) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {Math.round(((profile?.balance || 0) / 10000) * 100)}% of goal reached
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Coming Soon</h4>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-muted/20">
                  <div className="w-8 h-8 rounded-full bg-[#F7931A]/20 flex items-center justify-center">
                    <span className="text-[#F7931A] font-bold text-xs">₿</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Bitcoin (BTC)</p>
                    <p className="text-xs text-muted-foreground">Network processing active</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-muted/20">
                  <div className="w-8 h-8 rounded-full bg-[#627EEA]/20 flex items-center justify-center">
                    <span className="text-[#627EEA] font-bold text-xs">Ξ</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ethereum (ETH)</p>
                    <p className="text-xs text-muted-foreground">Smart contract pending</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground leading-relaxed italic">
                *Withdrawals are processed manually by administrators within 24-48 hours to ensure security.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
