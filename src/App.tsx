import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { InstallPrompt } from '@/components/InstallPrompt';

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
const TetrisPage = lazy(() =>
  import('@/pages/TetrisPage').then((m) => ({ default: m.TetrisPage })),
);
const ArcheryPage = lazy(() =>
  import('@/pages/ArcheryPage').then((m) => ({ default: m.ArcheryPage })),
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
  const { user, loading, blocked } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className='flex min-h-svh items-center justify-center bg-background'>
        <div className='animate-pulse text-lg text-muted-foreground'>
          Loading...
        </div>
      </div>
    );
  if (blocked) return <BlockedScreen blocked={blocked} />;
  if (!user) {
    // Preserve ?ref= query param when redirecting to login
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    const loginPath = ref ? `/login?ref=${encodeURIComponent(ref)}` : '/login';
    return (
      <Navigate
        to={loginPath}
        replace
      />
    );
  }
  return <>{children}</>;
}

function BlockedScreen({
  blocked,
}: {
  blocked: { message: string; whatsappLink: string };
}) {
  return (
    <div className='flex min-h-svh flex-col items-center justify-center bg-background p-4'>
      <div className='mx-auto w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 text-center shadow-lg'>
        <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100'>
          <svg
            className='h-8 w-8 text-red-600'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
            />
          </svg>
        </div>
        <h2 className='mb-2 text-xl font-bold text-red-600'>Akun Diblokir</h2>
        <p className='mb-6 text-sm text-gray-600'>{blocked.message}</p>
        <a
          href={blocked.whatsappLink}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700'
        >
          <svg
            className='h-5 w-5'
            fill='currentColor'
            viewBox='0 0 24 24'
          >
            <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' />
          </svg>
          Hubungi Admin via WhatsApp
        </a>
      </div>
    </div>
  );
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
              path='/tetris'
              element={
                <AuthGuard>
                  <TetrisPage />
                </AuthGuard>
              }
            />
            <Route
              path='/archery'
              element={
                <AuthGuard>
                  <ArcheryPage />
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
        <InstallPrompt />
      </AuthProvider>
    </BrowserRouter>
  );
}
