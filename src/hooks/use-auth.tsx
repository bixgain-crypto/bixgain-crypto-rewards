import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
  user: SupabaseUser | null;
  profile: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
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
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, capture referral code from URL
  useEffect(() => {
    const refCode = getReferralCodeFromURL();
    if (refCode) {
      setPendingReferral(refCode);
    }
  }, []);

  const fetchProfile = async (supabaseUser: SupabaseUser) => {
    try {
      const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', supabaseUser.id);
      
      if (error) throw error;
      const existingProfile = profiles && profiles.length > 0 ? profiles[0] : null;

      if (existingProfile) {
        setProfile(existingProfile);

        // Ensure bixgain@gmail.com is admin
        if (supabaseUser.email === 'bixgain@gmail.com' && existingProfile.role !== 'admin') {
          const { data: updatedProfile, error: updateError } = await supabase
            .from('user_profiles')
            .update({ role: 'admin' })
            .eq('user_id', supabaseUser.id)
            .select()
            .single();
          
          if (!updateError && updatedProfile) {
            setProfile(updatedProfile);
          }
        }
      } else {
        // Create profile for new user
        const referralCode = `BIX-${supabaseUser.id.slice(-6).toUpperCase()}`;
        const isAdmin = supabaseUser.email === 'bixgain@gmail.com';
        
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: supabaseUser.id,
            display_name: supabaseUser.user_metadata?.display_name || 'Miner',
            referral_code: referralCode,
            balance: 100, // Welcome bonus
            total_earned: 100,
            xp: 0,
            role: isAdmin ? 'admin' : 'user',
          })
          .select()
          .single();

        if (createError) throw createError;

        await supabase.from('transactions').insert({
          user_id: supabaseUser.id,
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
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user);
      }
      setIsLoading(false);
    });

    // Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async () => {
    // For simplicity, using Google login
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) console.error('Login error:', error.message);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id);
      
      if (profiles && profiles.length > 0) {
        setProfile(profiles[0]);
      }
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