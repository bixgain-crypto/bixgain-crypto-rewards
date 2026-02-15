import { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, TrendingUp, Sparkles, Zap, Users, Dices } from 'lucide-react';
import { toast } from 'sonner';

export default function GamesPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [betAmount, setBetAmount] = useState(50);
  const [isSpinning, setIsSpinning] = useState(false);
  const navigate = useNavigate();

  const handlePlayRoulette = async () => {
    if (!user || (profile?.balance || 0) < betAmount) {
      toast.error('Insufficient BIX balance!');
      return;
    }

    setIsSpinning(true);
    
    // Add visual delay for spinning effect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const result = await rewardEngine.gameResult('roulette', betAmount, 'spin');
      if (result.multiplier > 0) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Game error occurred.');
    } finally {
      setIsSpinning(false);
    }
  };

  return (
    <DashboardLayout activePath="/games">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">BixGain Arena</h1>
            <p className="text-muted-foreground">Wager your tokens in mini-games to win massive rewards.</p>
          </div>
          <div className="flex items-center gap-4 bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20 gold-glow">
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Available for Play</p>
              <p className="text-xl font-bold font-display text-primary">{profile?.balance?.toLocaleString() || 0} BIX</p>
            </div>
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="glass-card relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-32 -mt-32 transition-all group-hover:bg-primary/20" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge className="gold-gradient border-none">POPULAR</Badge>
                <Dices className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl mt-4">BixGain Roulette</CardTitle>
              <CardDescription>Win up to 5x your tokens. Pure luck, pure rewards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="aspect-video rounded-2xl bg-muted/30 border border-white/5 relative flex items-center justify-center">
                <div className={`w-48 h-48 rounded-full border-8 border-primary/20 flex items-center justify-center relative ${isSpinning ? 'animate-spin' : ''}`}>
                  <div className="w-4 h-4 rounded-full bg-primary gold-glow absolute -top-2" />
                  <div className="text-center">
                    <p className="text-4xl font-display font-bold text-primary">BIX</p>
                    <p className="text-xs text-muted-foreground">SPIN</p>
                  </div>
                </div>
                {isSpinning && (
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
                    <div className="text-center animate-bounce">
                      <Sparkles className="h-8 w-8 text-primary mx-auto mb-2" />
                      <p className="font-bold text-lg">Spinning Fortune...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Select Bet Amount</span>
                  <span className="font-bold">{betAmount} BIX</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[50, 100, 250, 500].map((amount) => (
                    <Button 
                      key={amount} 
                      variant={betAmount === amount ? 'default' : 'outline'}
                      className={betAmount === amount ? 'gold-gradient border-none' : 'border-white/10'}
                      onClick={() => setBetAmount(amount)}
                      disabled={isSpinning}
                    >
                      {amount}
                    </Button>
                  ))}
                </div>
                <Button 
                  className="w-full h-14 text-lg font-bold gold-gradient gold-glow hover:scale-[1.01] transition-all disabled:opacity-50"
                  onClick={handlePlayRoulette}
                  disabled={isSpinning}
                >
                  {isSpinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                  <p className="font-bold">40%</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1">Players</p>
                  <p className="font-bold">1.2K</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-xs text-muted-foreground mb-1">Max Win</p>
                  <p className="font-bold text-primary">5X</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="glass-card opacity-80 cursor-not-allowed">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="p-3 rounded-xl bg-muted/50">
                  <TrendingUp className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>BixGain Crash</CardTitle>
                    <Badge variant="secondary" className="text-[10px] h-4">COMING SOON</Badge>
                  </div>
                  <CardDescription>Watch the multiplier rise and cash out before it crashes.</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card className="glass-card hover:border-primary/20 transition-all cursor-pointer" onClick={() => navigate('/coinflip')}>
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Flip the Coin</CardTitle>
                    <Badge className="gold-gradient border-none text-[10px] h-4">LIVE</Badge>
                  </div>
                  <CardDescription>Double your bet with a 50/50 chance.</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card className="glass-card opacity-80 cursor-not-allowed">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="p-3 rounded-xl bg-muted/50">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Community Lottery</CardTitle>
                    <Badge variant="secondary" className="text-[10px] h-4">COMING SOON</Badge>
                  </div>
                  <CardDescription>Participate in the weekly lottery with a massive BIX jackpot.</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
