import { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { rewardEngine } from '../lib/reward-engine';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Coins, Zap, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type CoinSide = 'heads' | 'tails';

export default function CoinFlipPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [betAmount, setBetAmount] = useState(50);
  const [choice, setChoice] = useState<CoinSide>('heads');
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<CoinSide | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const handleFlip = async () => {
    if (!user || !profile || profile.balance < betAmount) {
      toast.error('Insufficient BIX balance!');
      return;
    }

    setIsFlipping(true);
    setResult(null);
    setWon(null);

    // Visual delay for flip animation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const gameResult = await rewardEngine.gameResult('coinflip', betAmount, choice);
      const isWin = gameResult.isWin;
      const flipResult: CoinSide = isWin ? choice : (choice === 'heads' ? 'tails' : 'heads');

      setResult(flipResult);
      setWon(isWin);

      if (isWin) {
        toast.success(`You won ${betAmount} BIX! The coin landed on ${flipResult}!`);
      } else {
        toast.error(`You lost ${betAmount} BIX. The coin landed on ${flipResult}.`);
      }

      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Game error occurred.');
    } finally {
      setIsFlipping(false);
    }
  };

  return (
    <DashboardLayout activePath="/games">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/games')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-display font-bold">Flip the Coin</h1>
            <p className="text-muted-foreground text-sm">Double or nothing. Pick a side and flip!</p>
          </div>
        </div>

        <Card className="glass-card relative overflow-hidden">
          <div className="absolute top-0 left-0 w-48 h-48 bg-primary/10 rounded-full blur-[80px] -ml-24 -mt-24" />
          <CardContent className="p-8 space-y-8 relative z-10">
            {/* Coin Display */}
            <div className="flex justify-center">
              <div
                className={`w-40 h-40 rounded-full flex items-center justify-center text-5xl font-display font-bold transition-all duration-500 ${
                  isFlipping
                    ? 'animate-spin border-8 border-primary/40 bg-primary/10 text-primary'
                    : result
                    ? won
                      ? 'border-8 border-green-500/50 bg-green-500/10 text-green-400 scale-110'
                      : 'border-8 border-red-500/50 bg-red-500/10 text-red-400 scale-110'
                    : 'border-8 border-primary/20 bg-muted/30 text-muted-foreground'
                }`}
              >
                {isFlipping ? (
                  <Coins className="h-12 w-12" />
                ) : result ? (
                  result === 'heads' ? 'H' : 'T'
                ) : (
                  '?'
                )}
              </div>
            </div>

            {/* Result Text */}
            {result && !isFlipping && (
              <div className="text-center">
                <p className={`text-xl font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>
                  {won ? `You won +${betAmount} BIX!` : `You lost -${betAmount} BIX`}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Coin landed on <span className="capitalize font-medium text-foreground">{result}</span>
                </p>
              </div>
            )}

            {/* Side Selection */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Pick your side</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={choice === 'heads' ? 'default' : 'outline'}
                  className={choice === 'heads' ? 'gold-gradient border-none h-14 text-lg font-bold' : 'border-border/50 h-14 text-lg'}
                  onClick={() => setChoice('heads')}
                  disabled={isFlipping}
                >
                  Heads
                </Button>
                <Button
                  variant={choice === 'tails' ? 'default' : 'outline'}
                  className={choice === 'tails' ? 'gold-gradient border-none h-14 text-lg font-bold' : 'border-border/50 h-14 text-lg'}
                  onClick={() => setChoice('tails')}
                  disabled={isFlipping}
                >
                  Tails
                </Button>
              </div>
            </div>

            {/* Bet Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Bet Amount</span>
                <span className="font-bold">{betAmount} BIX</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[25, 50, 100, 250].map((amount) => (
                  <Button
                    key={amount}
                    variant={betAmount === amount ? 'default' : 'outline'}
                    className={betAmount === amount ? 'gold-gradient border-none' : 'border-border/50'}
                    onClick={() => setBetAmount(amount)}
                    disabled={isFlipping}
                  >
                    {amount}
                  </Button>
                ))}
              </div>
            </div>

            {/* Flip Button */}
            <Button
              className="w-full h-14 text-lg font-bold gold-gradient gold-glow hover:scale-[1.01] transition-all disabled:opacity-50"
              onClick={handleFlip}
              disabled={isFlipping}
            >
              {isFlipping ? 'FLIPPING...' : 'FLIP THE COIN'}
            </Button>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                <p className="font-bold">50%</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Payout</p>
                <p className="font-bold text-primary">2X</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/20 border border-border/30">
                <p className="text-xs text-muted-foreground mb-1">Balance</p>
                <p className="font-bold">{(profile?.balance || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
