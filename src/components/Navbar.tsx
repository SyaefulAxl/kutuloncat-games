import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Home,
  Trophy,
  User,
  Award,
  Moon,
  Sun,
  LogOut,
  Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useState } from 'react';

export function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light';
    setDark(saved === 'dark');
    document.body.classList.toggle('dark', saved === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.body.classList.toggle('dark', next);
      return next;
    });
  }, []);

  const nav = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { to: '/achievements', icon: Award, label: 'Achievements' },
    { to: '/referral', icon: Gift, label: 'Referral' },
    { to: '/profile', icon: User, label: 'Profil' },
  ];

  return (
    <header className='sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md'>
      <div className='mx-auto flex h-14 max-w-5xl items-center justify-between px-4'>
        <Link
          to='/'
          className='flex items-center gap-2 font-bold text-lg text-foreground hover:text-primary transition-colors'
        >
          <img
            src='/favicon.png'
            alt='KutuLoncat'
            className='h-5 w-5'
          />
          <span>KutuLoncat</span>
        </Link>

        <nav className='hidden md:flex items-center gap-1'>
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
            >
              <Button
                variant={location.pathname === n.to ? 'secondary' : 'ghost'}
                size='sm'
                className='gap-1.5'
              >
                <n.icon className='h-4 w-4' />
                {n.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            size='icon'
            onClick={toggleTheme}
          >
            {dark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
          </Button>
          {user && (
            <Button
              variant='ghost'
              size='icon'
              onClick={logout}
            >
              <LogOut className='h-4 w-4' />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-border bg-background/95 backdrop-blur-md py-2',
        )}
      >
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className='flex flex-col items-center gap-0.5'
          >
            <n.icon
              className={cn(
                'h-5 w-5 transition-colors',
                location.pathname === n.to
                  ? 'text-primary'
                  : 'text-muted-foreground',
              )}
            />
            <span
              className={cn(
                'text-[10px]',
                location.pathname === n.to
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground',
              )}
            >
              {n.label}
            </span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
