import { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { supabase } from '../lib/supabase';
import { DashboardLayout } from '../components/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Progress } from '../components/ui/progress';
import { User, Shield, Coins, Trophy, Zap, Calendar, Edit2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');

  const level = profile?.level || Math.floor((profile?.xp || 0) / 1000000) + 1;
  const xpInLevel = (profile?.xp || 0) % 1000000;
  const xpToNext = 1000000;

  const handleSave = async () => {
    if (!user || !displayName.trim()) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: displayName.trim() })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast.success('Profile updated!');
      setEditing(false);
      refreshProfile();
    } catch {
      toast.error('Failed to update profile.');
    }
  };

  const stats = [
    { label: 'Total Earned', value: `${(profile?.total_earned || 0).toLocaleString()} BIX`, icon: Coins, color: 'text-primary' },
    { label: 'Daily Streak', value: `${profile?.daily_streak || 0} Days`, icon: Zap, color: 'text-orange-400' },
    { label: 'Miner Level', value: `Level ${level}`, icon: Trophy, color: 'text-yellow-400' },
    { label: 'Member Since', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A', icon: Calendar, color: 'text-sky-400' },
  ];

  return (
    <DashboardLayout activePath="/profile">
      <div className="space-y-8 max-w-4xl mx-auto">
        <Card className="glass-card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[100px] -mr-36 -mt-36" />
          <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8 relative z-10">
            <Avatar className="h-28 w-28 border-4 border-primary">
            <AvatarFallback className="text-4xl font-bold bg-primary/20 text-primary">
              {(profile?.display_name || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-10 w-56 bg-muted/50 border-primary/30"
                    placeholder="Enter display name"
                  />
                  <Button size="icon" variant="ghost" onClick={handleSave} className="text-green-400 hover:bg-green-400/10">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(false)} className="text-red-400 hover:bg-red-400/10">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-display font-bold">{profile?.display_name || 'User'}</h1>
                  <Button size="icon" variant="ghost" onClick={() => { setDisplayName(profile?.display_name || ''); setEditing(true); }} className="text-muted-foreground hover:text-primary">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
              <p className="text-sm text-muted-foreground mb-3">{user?.email}</p>
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <Badge className="gold-gradient border-none">Level {level} Miner</Badge>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  <Shield className="h-3 w-3 mr-1" /> {profile?.role === 'admin' ? 'Admin' : 'Verified'}
                </Badge>
              </div>
            </div>
            <div className="text-center p-6 rounded-2xl bg-primary/10 border border-primary/20 gold-glow">
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Balance</p>
              <p className="text-3xl font-display font-bold text-primary">{(profile?.balance || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">BIX Tokens</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /> Level Progress</CardTitle>
            <CardDescription>Earn more BIX to level up and unlock exclusive rewards</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">Level {level}</span>
              <span className="text-muted-foreground">{xpInLevel.toLocaleString()} / {xpToNext.toLocaleString()} XP</span>
              <span className="font-medium">Level {level + 1}</span>
            </div>
            <Progress value={(xpInLevel / xpToNext) * 100} className="h-3" />
            <p className="text-xs text-muted-foreground mt-3">Every 1,000,000 XP earned advances you one level. Higher levels unlock better rewards and multipliers.</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="glass-card">
              <CardContent className="p-5 text-center">
                <stat.icon className={`h-6 w-6 ${stat.color} mx-auto mb-3`} />
                <p className="text-xl font-bold font-display">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /> Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">User ID</p>
                <p className="text-sm font-mono truncate">{user?.id}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Referral Code</p>
                <p className="text-sm font-mono">{profile?.referral_code || 'N/A'}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Last Login</p>
                <p className="text-sm">{profile?.last_login || 'Never'}</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Account Role</p>
                <p className="text-sm capitalize">{profile?.role || 'user'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
