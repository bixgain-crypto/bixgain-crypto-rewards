import { Search, Bell, Coins } from 'lucide-react';
import { useAuth } from '../hooks/use-auth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

export function Header() {
  const { profile, user } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-md px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
      <div className="hidden md:flex items-center relative w-96">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10 bg-muted/50 border-none focus-visible:ring-primary/50"
          placeholder="Search quests, games..."
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full gold-glow">
          <Coins className="h-4 w-4 text-primary" />
          <span className="font-bold text-primary font-display">{profile?.balance?.toLocaleString() || 0} BIX</span>
        </div>

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-card"></span>
        </Button>

        <div className="flex items-center gap-3 ml-2 pl-4 border-l border-border">
          <div className="hidden lg:block text-right">
            <p className="text-sm font-medium">{profile?.display_name || 'User'}</p>
            <p className="text-xs text-muted-foreground">Level {Math.floor((profile?.total_earned || 0) / 500) + 1} Miner</p>
          </div>
          <Avatar className="h-9 w-9 border-2 border-primary/20">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback className="bg-primary/20 text-primary font-bold">
              {profile?.display_name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}