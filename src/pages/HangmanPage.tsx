import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HangmanGame } from '@/components/HangmanGame';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';

export function HangmanPage() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    setDark(saved === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.body.classList.toggle('dark', next);
      return next;
    });
  }, []);

  return (
    <div className='min-h-svh'>
      {/* Compact game header */}
      <header className='flex items-center justify-between px-3 py-2.5 border-b border-border/50'>
        <Link to='/'>
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5'
          >
            <ArrowLeft className='h-4 w-4' />
            Dashboard
          </Button>
        </Link>
        <button
          onClick={toggleTheme}
          className='p-2 rounded-lg hover:bg-accent transition-colors'
        >
          {dark ? (
            <Moon className='h-5 w-5 text-amber-400' />
          ) : (
            <Sun className='h-5 w-5 text-amber-500' />
          )}
        </button>
      </header>

      <main className='mx-auto max-w-lg px-3 py-4 sm:py-6'>
        <h1 className='text-2xl sm:text-3xl font-bold mb-1'>🇮🇩 Tebak Kata</h1>
        <p className='text-sm text-muted-foreground mb-4 sm:mb-6'>
          Hint 1 kata. Tebak kalimat lucu.
        </p>

        <HangmanGame />
      </main>
    </div>
  );
}
