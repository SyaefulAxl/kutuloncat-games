import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

/* Lazy-loaded pages for code-splitting */
const HangmanPage = lazy(() =>
  import('@/pages/HangmanPage').then((m) => ({ default: m.HangmanPage })),
);
const FruitNinjaPage = lazy(() =>
  import('@/pages/FruitNinjaPage').then((m) => ({ default: m.FruitNinjaPage })),
);
const FlappyBirdPage = lazy(() =>
  import('@/pages/FlappyBirdPage').then((m) => ({
    default: m.FlappyBirdPage,
  })),
);
const SnakePage = lazy(() =>
  import('@/pages/SnakePage').then((m) => ({ default: m.SnakePage })),
);
const LeaderboardPage = lazy(() =>
  import('@/pages/LeaderboardPage').then((m) => ({
    default: m.LeaderboardPage,
  })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const AchievementsPage = lazy(() =>
  import('@/pages/AchievementsPage').then((m) => ({
    default: m.AchievementsPage,
  })),
);
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const ReferralPage = lazy(() =>
  import('@/pages/ReferralPage').then((m) => ({ default: m.ReferralPage })),
);

function PageLoader() {
  return (
    <div className='flex min-h-svh items-center justify-center bg-background'>
      <div className='animate-pulse text-lg text-muted-foreground'>
        Loading...
      </div>
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className='flex min-h-svh items-center justify-center bg-background'>
        <div className='animate-pulse text-lg text-muted-foreground'>
          Loading...
        </div>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to='/login'
        replace
      />
    );
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path='/login'
              element={<LoginPage />}
            />
            <Route
              path='/'
              element={
                <AuthGuard>
                  <DashboardPage />
                </AuthGuard>
              }
            />
            <Route
              path='/hangman'
              element={
                <AuthGuard>
                  <HangmanPage />
                </AuthGuard>
              }
            />
            <Route
              path='/fruit-ninja'
              element={
                <AuthGuard>
                  <FruitNinjaPage />
                </AuthGuard>
              }
            />
            <Route
              path='/flappy-bird'
              element={
                <AuthGuard>
                  <FlappyBirdPage />
                </AuthGuard>
              }
            />
            <Route
              path='/snake'
              element={
                <AuthGuard>
                  <SnakePage />
                </AuthGuard>
              }
            />
            <Route
              path='/leaderboard'
              element={
                <AuthGuard>
                  <LeaderboardPage />
                </AuthGuard>
              }
            />
            <Route
              path='/profile'
              element={
                <AuthGuard>
                  <ProfilePage />
                </AuthGuard>
              }
            />
            <Route
              path='/achievements'
              element={
                <AuthGuard>
                  <AchievementsPage />
                </AuthGuard>
              }
            />
            <Route
              path='/referral'
              element={
                <AuthGuard>
                  <ReferralPage />
                </AuthGuard>
              }
            />
            <Route
              path='/admin'
              element={<AdminPage />}
            />
            <Route
              path='*'
              element={
                <Navigate
                  to='/login'
                  replace
                />
              }
            />
          </Routes>
        </Suspense>
        <Toaster
          position='top-center'
          richColors
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
