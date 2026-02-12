import { LayoutDashboard, Wallet, Trophy, Users, ShoppingBag, Gamepad2, Settings, LogOut, ChevronRight, Menu, X, Zap, User } from 'lucide-react';
import { useAuth } from '../hooks/use-auth';
import { Button } from './ui/button';
import { useState } from 'react';
import { cn } from '../lib/utils';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Zap, label: 'Earn BIX', path: '/earn' },
  { icon: Wallet, label: 'Wallet', path: '/wallet' },
  { icon: Gamepad2, label: 'Mini Games', path: '/games' },
  { icon: Trophy, label: 'Leaderboard', path: '/leaderboard' },
  { icon: ShoppingBag, label: 'Store', path: '/store' },
  { icon: Users, label: 'Referrals', path: '/referrals' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export function AppSidebar({ activePath }: { activePath: string }) {
  const { logout, user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isAdmin = user?.id === 'admin_user_id'; // Placeholder for admin logic

  return (
    <>
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button variant="outline" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-2 mb-8 px-2">
            <div className="w-8 h-8 rounded-lg bg-primary gold-glow flex items-center justify-center">
              <span className="font-bold text-background text-lg">B</span>
            </div>
            <span className="text-xl font-display font-bold text-primary">BixGain</span>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg transition-colors group",
                  activePath === item.path 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
                <ChevronRight className={cn(
                  "h-4 w-4 opacity-0 transition-opacity",
                  activePath === item.path && "opacity-100"
                )} />
              </a>
            ))}

            {isAdmin && (
              <a
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                )}
              >
                <Settings className="h-4 w-4" />
                <span>Admin Panel</span>
              </a>
            )}
          </nav>

          <div className="pt-4 border-t border-border space-y-4">
            <div className="px-3 py-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">My Account</p>
              <p className="text-sm font-medium truncate">{user?.email}</p>
            </div>
            <Button 
              variant="ghost" 
              className="w-full justify-start gap-3 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
