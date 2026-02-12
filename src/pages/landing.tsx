import { useState } from 'react';
import { useAuth } from '../hooks/use-auth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Coins, ShieldCheck, ArrowRight, Zap, Trophy, Users } from 'lucide-react';

export function LandingPage() {
  const { login } = useAuth();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] -mr-48 -mt-48 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] -ml-24 -mb-24" />

      {/* Navbar */}
      <nav className="relative z-10 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary gold-glow flex items-center justify-center">
            <span className="font-bold text-background text-2xl">B</span>
          </div>
          <span className="text-2xl font-display font-bold text-primary tracking-tight">BixGain</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#rewards" className="hover:text-primary transition-colors">Rewards</a>
          <a href="#about" className="hover:text-primary transition-colors">About</a>
        </div>
        <Button 
          variant="outline" 
          className="border-primary/50 text-primary hover:bg-primary/10"
          onClick={() => login()}
        >
          Sign In
        </Button>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-primary mb-8 animate-bounce">
          <Zap className="h-3 w-3 fill-primary" />
          <span>JOIN THE BIXGAIN REVOLUTION</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold leading-tight mb-6 bg-gradient-to-br from-white via-white/90 to-primary bg-clip-text text-transparent">
          Mine Crypto Rewards <br /> <span className="text-primary italic">Every Single Day.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          The ultimate gamified reward platform. Complete tasks, play games, and refer friends to earn BIX tokens. Secure, transparent, and rewarding.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Button 
            size="lg" 
            className="h-14 px-10 text-lg gold-gradient hover:scale-105 transition-transform font-bold"
            onClick={() => login()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            Start Earning Now
            <ArrowRight className={`ml-2 h-5 w-5 transition-transform ${isHovered ? 'translate-x-1' : ''}`} />
          </Button>
          <Button size="lg" variant="outline" className="h-14 px-10 text-lg border-white/10 hover:bg-white/5">
            View Leaderboard
          </Button>
        </div>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16">
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold font-display text-primary">50K+</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Active Miners</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold font-display text-primary">2.5M+</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Tokens Paid</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold font-display text-primary">150+</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Daily Quests</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-3xl font-bold font-display text-primary">99.9%</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Secure Up-time</span>
          </div>
        </div>
      </main>

      {/* Feature Cards */}
      <section id="features" className="relative z-10 px-6 py-24 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-primary/10 hover:border-primary/30 transition-all">
          <CardHeader>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Multiple Earning Streams</CardTitle>
            <CardDescription>Earn from daily logins, social tasks, quizzes, and app activities.</CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-card border-primary/10 hover:border-primary/30 transition-all">
          <CardHeader>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Gamified Experience</CardTitle>
            <CardDescription>Level up your mining power, compete on leaderboards, and play mini-games.</CardDescription>
          </CardHeader>
        </Card>

        <Card className="glass-card border-primary/10 hover:border-primary/30 transition-all">
          <CardHeader>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Anti-Fraud Security</CardTitle>
            <CardDescription>Our advanced systems ensure fair distribution and prevent reward manipulation.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-10 px-6 border-t border-white/5 text-center text-sm text-muted-foreground">
        <p>&copy; 2026 BixGain Rewards. Built on Web3 Integrity.</p>
      </footer>
    </div>
  );
}
