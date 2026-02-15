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
import { Routes, Route, Navigate } from 'react-router-dom';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/games" element={<GamesPage />} />
      <Route path="/store" element={<StorePage />} />
      <Route path="/referrals" element={<ReferralsPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/earn" element={<QuestsPage />} />
      <Route path="/quiz" element={<QuizPlayPage />} />
      <Route path="/coinflip" element={<CoinFlipPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
