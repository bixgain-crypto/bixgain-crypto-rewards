import { useState, useEffect } from 'react';
import { blink } from '../lib/blink';
import { useAuth } from '../hooks/use-auth';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Users, Copy, Share2, TrendingUp, Gift, Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReferralsPage() {
  const { profile, user } = useAuth();
  const [isCopying, setIsCopying] = useState(false);
  const [referralHistory, setReferralHistory] = useState<any[]>([]);
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    const fetchReferrals = async () => {
      if (!user) return;
      try {
        // Use user's own referral history (RLS filters to their records)
        const history = await blink.db.table('referral_history').list({
          where: { referrerId: user.id },
          orderBy: { createdAt: 'desc' },
          limit: 20,
        });
        setReferralHistory(history);
        setReferralCount(history.length);
      } catch {
        // referral_history may be empty
      }
    };
    fetchReferrals();
  }, [user]);

  const referralCode = profile?.referralCode || 'BIX-XXXXXX';
  const referralLink = `${window.location.origin}?ref=${referralCode}`;

  const copyToClipboard = () => {
    setIsCopying(true);
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
    setTimeout(() => setIsCopying(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join BixGain - Earn Crypto Rewards',
          text: `Join BixGain using my referral link and get 50 BIX free!`,
          url: referralLink,
        });
      } catch {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const milestones = [
    { count: 1, reward: 100, label: 'First Referral' },
    { count: 5, reward: 500, label: '5 Referrals' },
    { count: 25, reward: 2500, label: '25 Referrals' },
    { count: 50, reward: 5000, label: 'Influencer' },
  ];

  return (
    <DashboardLayout activePath="/referrals">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-display font-bold mb-2">Referral Program</h1>
            <p className="text-muted-foreground">Invite your friends to BixGain and earn 100 BIX per referral.</p>
          </div>
          <div className="flex items-center gap-4 bg-primary/10 px-6 py-3 rounded-2xl border border-primary/20 gold-glow">
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase font-semibold">Total Referrals</p>
              <p className="text-xl font-bold font-display text-primary">{referralCount} Miners</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="glass-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] -ml-32 -mt-32" />
              <CardHeader>
                <CardTitle className="text-2xl">Your Referral Link</CardTitle>
                <CardDescription>Share this link with your friends to start earning bonuses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <Input 
                    readOnly 
                    value={referralLink} 
                    className="h-12 bg-muted/50 border-white/10 font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button 
                      className="h-12 px-8 gold-gradient font-bold gap-2"
                      onClick={copyToClipboard}
                    >
                      {isCopying ? <Zap className="h-4 w-4 animate-bounce" /> : <Copy className="h-4 w-4" />}
                      {isCopying ? 'COPIED!' : 'COPY'}
                    </Button>
                    <Button 
                      variant="outline"
                      className="h-12 px-6 border-primary/30 text-primary hover:bg-primary/10 gap-2"
                      onClick={shareLink}
                    >
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                    <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-1">Referrer Reward</p>
                    <p className="font-bold">100 BIX</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                    <Gift className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-1">New User Bonus</p>
                    <p className="font-bold">50 BIX</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                    <ShieldCheck className="h-6 w-6 text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-1">Anti-Fraud</p>
                    <p className="font-bold">Protected</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Recent Referrals</CardTitle>
                <CardDescription>Keep track of who joined using your code</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {referralHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No referrals yet. Share your link to start earning!</p>
                    </div>
                  ) : referralHistory.map((ref, i) => (
                    <div key={ref.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                          M{i + 1}
                        </div>
                        <div>
                          <p className="font-bold">Miner #{(ref.referredId || '').slice(-6)}</p>
                          <p className="text-xs text-muted-foreground">{ref.createdAt ? new Date(ref.createdAt).toLocaleDateString() : 'Recently'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-bold">+{ref.rewardAmount || 100} BIX</p>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Referral Bonus</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="gold-gradient border-none text-background relative overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Milestones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {milestones.map(m => {
                  const reached = referralCount >= m.count;
                  return (
                    <div key={m.count} className={`p-3 rounded-xl ${reached ? 'bg-white/30' : 'bg-white/10'} backdrop-blur-md`}>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                          {reached && <CheckCircle2 className="h-4 w-4" />}
                          {m.label}
                        </h4>
                        <span className="text-xs font-bold">+{m.reward} BIX</span>
                      </div>
                      <div className="w-full h-1.5 bg-background/20 rounded-full overflow-hidden">
                        <div className="h-full bg-background transition-all" style={{ width: `${Math.min((referralCount / m.count) * 100, 100)}%` }} />
                      </div>
                      <p className="text-[10px] mt-1 font-bold opacity-70">{Math.min(referralCount, m.count)} / {m.count}</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">How it works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">1</div>
                  <p>Copy and share your unique referral link.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">2</div>
                  <p>Your friend signs up via your link.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">3</div>
                  <p>You receive <span className="text-primary font-bold">100 BIX</span> and they get <span className="text-primary font-bold">50 BIX</span> instantly.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">4</div>
                  <p>All rewards processed via secure Reward Engine — no manipulation possible.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
