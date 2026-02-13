import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { blink } from '../lib/blink';
import { rewardEngine } from '../lib/reward-engine';
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

// Extract referral code from URL (supports both /join?ref= and ?ref=)
function getReferralCodeFromURL(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('ref') || null;
}

// Store/retrieve pending referral code in sessionStorage
function setPendingReferral(code: string) {
  sessionStorage.setItem('bixgain_referral', code);
}
function getPendingReferral(): string | null {
  return sessionStorage.getItem('bixgain_referral');
}
function clearPendingReferral() {
  sessionStorage.removeItem('bixgain_referral');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<BlinkUser | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, capture referral code from URL
  useEffect(() => {
    const refCode = getReferralCodeFromURL();
    if (refCode) {
      setPendingReferral(refCode);
    }
  }, []);

  const fetchProfile = async (blinkUser: BlinkUser) => {
    try {
      const profiles = await blink.db.userProfiles.list({ where: { userId: blinkUser.id }, limit: 1 });
      const existingProfile = profiles.length > 0 ? profiles[0] : null;

      if (existingProfile) {
        setProfile(existingProfile);

        // Process pending referral for existing users who haven't been referred yet
        if (!existingProfile.referredBy) {
          const pendingRef = getPendingReferral();
          if (pendingRef) {
            try {
              await rewardEngine.processReferral(pendingRef);
              clearPendingReferral();
              // Re-fetch profile to get updated balance
              const updated = await blink.db.userProfiles.list({ where: { userId: blinkUser.id }, limit: 1 });
              if (updated.length > 0) setProfile(updated[0]);
            } catch {
              // Referral may fail if invalid code, already referred, etc. — silently continue
              clearPendingReferral();
            }
          }
        }
      } else {
        // Create profile for new user
        const referralCode = `BIX-${blinkUser.id.slice(-6).toUpperCase()}`;
        const newProfile = await blink.db.userProfiles.create({
          id: blinkUser.id,
          userId: blinkUser.id,
          displayName: blinkUser.displayName || 'Miner',
          referralCode,
          balance: 100, // Welcome bonus
          totalEarned: 100,
          xp: 0,
        });

        await blink.db.transactions.create({
          userId: blinkUser.id,
          amount: 100,
          type: 'signup',
          description: 'Welcome Bonus',
        });

        setProfile(newProfile);

        // Process referral for brand new user
        const pendingRef = getPendingReferral();
        if (pendingRef) {
          try {
            await rewardEngine.processReferral(pendingRef);
            clearPendingReferral();
            // Re-fetch to get updated balance
            const updated = await blink.db.userProfiles.list({ where: { userId: blinkUser.id }, limit: 1 });
            if (updated.length > 0) setProfile(updated[0]);
          } catch {
            clearPendingReferral();
          }
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged(async (state) => {
      setUser(state.user);
      if (state.user) {
        await fetchProfile(state.user);
      } else {
        setProfile(null);
      }
      setIsLoading(state.isLoading);
    });
    return unsubscribe;
  }, []);

  const login = (redirectUrl?: string) => {
    // Preserve referral code through login redirect
    const currentRef = getPendingReferral() || getReferralCodeFromURL();
    let target = redirectUrl || window.location.href;
    if (currentRef && !target.includes('ref=')) {
      const url = new URL(target);
      url.searchParams.set('ref', currentRef);
      target = url.toString();
    }
    blink.auth.login(target);
  };

  const logout = async () => {
    await blink.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) {
      const profiles = await blink.db.userProfiles.list({ where: { userId: user.id }, limit: 1 });
      if (profiles.length > 0) setProfile(profiles[0]);
    }
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
