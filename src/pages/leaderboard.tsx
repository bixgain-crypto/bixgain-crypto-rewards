import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { fetchSharedData } from '../lib/shared-data';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Trophy, Medal, Search, TrendingUp, Sparkles, Coins } from 'lucide-react';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const profiles = await fetchSharedData('user_profiles', 50);
        const ranked = profiles
          .sort((a: any, b: any) => (b.balance || 0) - (a.balance || 0))
          .map((p: any, i: number) => ({
            userId: p.userId || p.id,
            displayName: p.displayName || 'Anon Miner',
            balance: p.balance || 0,
            level: Math.floor((p.totalEarned || 0) / 500) + 1,
            rank: i + 1,
          }));
        setLeaderboard(ranked);
      } catch {
        console.error('Failed to fetch leaderboard');
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <DashboardLayout activePath="/leaderboard">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">BixGain Elite</h1>
            <p className="text-muted-foreground">The top performing miners in our ecosystem. Compete for the crown!</p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-10 bg-muted/50 border-none" placeholder="Search miners..." />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {leaderboard.slice(0, 3).map((leader, i) => (
            <Card key={leader.userId} className={`glass-card relative overflow-hidden group ${i === 0 ? 'border-primary/50 gold-glow -translate-y-2' : ''}`}>
              {i === 0 && <div className="absolute top-0 right-0 p-4"><Sparkles className="h-6 w-6 text-primary animate-pulse" /></div>}
              <CardContent className="p-8 text-center flex flex-col items-center">
                <div className="relative mb-6">
                  <div className={`absolute -top-4 -right-4 w-10 h-10 rounded-full flex items-center justify-center font-bold text-background ${i === 0 ? 'bg-primary gold-glow' : i === 1 ? 'bg-slate-300' : 'bg-orange-400'}`}>
                    {leader.rank}
                  </div>
                  <Avatar className={`h-24 w-24 border-4 ${i === 0 ? 'border-primary' : i === 1 ? 'border-slate-300' : 'border-orange-400'}`}>
                    <AvatarFallback className="text-2xl font-bold bg-muted">{leader.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                </div>
                <h3 className="text-xl font-bold mb-1">{leader.displayName}</h3>
                <Badge variant="secondary" className="mb-4">Level {leader.level} Miner</Badge>
                <div className="flex items-center gap-2 text-primary">
                  <TrendingUp className="h-5 w-5" />
                  <span className="text-2xl font-display font-bold">{leader.balance.toLocaleString()} BIX</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Global Rankings</CardTitle>
              <CardDescription>All-time top earners of the BixGain platform</CardDescription>
            </div>
            <Medal className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Rank</TableHead>
                  <TableHead>Miner</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((leader) => (
                  <TableRow key={leader.userId} className={leader.userId === profile?.userId ? 'bg-primary/10' : ''}>
                    <TableCell>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${leader.rank <= 3 ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>
                        #{leader.rank}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px]">{leader.displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{leader.displayName}</span>
                        {leader.userId === profile?.userId && <Badge className="text-[10px] h-4 gold-gradient border-none">YOU</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">Lvl {leader.level}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 font-bold text-primary">
                        <Coins className="h-3 w-3" />
                        {leader.balance.toLocaleString()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* User Current Standing - show only if not already in leaderboard */}
                {!leaderboard.find(l => l.userId === profile?.userId) && profile && (
                  <TableRow className="bg-primary/5 border-t-2 border-primary/20">
                    <TableCell>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-primary text-background gold-glow">
                        #{leaderboard.length + 1}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[10px]">{profile?.displayName?.charAt(0) || 'U'}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{profile?.displayName || 'You'}</span>
                        <Badge className="text-[10px] h-4 gold-gradient border-none">YOU</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">Lvl {Math.floor((profile?.totalEarned || 0) / 500) + 1}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 font-bold text-primary">
                        <Coins className="h-3 w-3" />
                        {profile?.balance?.toLocaleString() || 0}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col items-center justify-center py-12 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold mb-4">Earn to Rise the Ranks</h2>
          <p className="text-muted-foreground mb-8 italic">
            "The top 10 miners at the end of every month receive exclusive BixGain NFT badges and real crypto airdrops. Keep mining!"
          </p>
          <div className="flex gap-4">
            <Button className="gold-gradient px-8 font-bold">Earn More BIX</Button>
            <Button variant="outline" className="border-white/10 hover:bg-white/5">Season Schedule</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
