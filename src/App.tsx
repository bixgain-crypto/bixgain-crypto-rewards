import { useAuth } from './hooks/use-auth';
import { LandingPage } from './pages/landing';
import DashboardPage from './pages/dashboard';
import WalletPage from './pages/wallet';
import GamesPage from './pages/games';
import StorePage from './pages/store';
import ReferralsPage from './pages/referrals';
import LeaderboardPage from './pages/leaderboard';
import QuestsPage from './pages/quests';
import AdminPanel from './pages/admin';
import ProfilePage from './pages/profile';
import QuizPlayPage from './pages/quiz-play';
import CoinFlipPage from './pages/coinflip';
import { useState, useEffect } from 'react';

function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show landing page for unauthenticated users (referral params preserved via login())
    return <LandingPage />;
  }

  const renderPage = () => {
    switch (currentPath) {
      case '/': return <DashboardPage />;
      case '/wallet': return <WalletPage />;
      case '/games': return <GamesPage />;
      case '/store': return <StorePage />;
      case '/referrals': return <ReferralsPage />;
      case '/leaderboard': return <LeaderboardPage />;
      case '/earn': return <QuestsPage />;
      case '/quiz': return <QuizPlayPage />;
      case '/coinflip': return <CoinFlipPage />;
      case '/profile': return <ProfilePage />;
      case '/admin': return <AdminPanel />;
      default: return <DashboardPage />;
    }
  };

  return renderPage();
}

export default App;
