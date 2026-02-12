import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { blink } from '../lib/blink';
import type { BlinkUser } from '@blinkdotnew/sdk';

interface AuthContextType {
  user: BlinkUser | null;
  profile: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (redirectUrl?: string) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BlinkUser | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      // user_profiles PK is user_id, so we use list + where instead of get
      const profiles = await blink.db.userProfiles.list({ where: { userId }, limit: 1 });
      const existingProfile = profiles.length > 0 ? profiles[0] : null;
      if (existingProfile) {
        setProfile(existingProfile);
      } else {
        // Create profile for new user — set id = userId so SDK .get/.update work
        const newProfile = await blink.db.userProfiles.create({
          id: userId,
          userId,
          displayName: user?.displayName || 'User',
          referralCode: `BIX-${userId.slice(-6).toUpperCase()}`,
          balance: 100, // Welcome bonus
          totalEarned: 100,
        });
        
        // Log transaction for signup bonus
        await blink.db.transactions.create({
          userId,
          amount: 100,
          type: 'signup',
          description: 'Welcome Bonus',
        });
        
        setProfile(newProfile);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged(async (state) => {
      setUser(state.user);
      if (state.user) {
        await fetchProfile(state.user.id);
      } else {
        setProfile(null);
      }
      setIsLoading(state.isLoading);
    });
    return unsubscribe;
  }, []);

  const login = (redirectUrl?: string) => {
    blink.auth.login(redirectUrl || window.location.href);
  };

  const logout = async () => {
    await blink.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, profile, isAuthenticated: !!user, isLoading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
