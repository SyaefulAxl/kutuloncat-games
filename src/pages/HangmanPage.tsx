import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HangmanGame } from '@/components/HangmanGame';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { HangmanGameState } from '@/games/hangman/HangmanScene';

export function HangmanPage() {
  const [dark, setDark] = useState(true);
  const [gs, setGs] = useState<HangmanGameState | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    setDark(saved === 'dark');
  }, []);

  /* Listen for hangman state updates */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__hangmanState as HangmanGameState | undefined;
      if (!s) return;
      const key = `${s.combo}-${s.maxCombo}-${Math.floor(s.comboTimeLeft / 100)}-${s.done}-${s.wrong}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 80);
    return () => clearInterval(interval);
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

        {/* Combo display below game frame */}
        {gs && gs.combo > 0 && gs.comboTimeLeft > 0 && (
          <div className='mt-3 px-1'>
            <div className='flex items-center justify-between mb-1'>
              <Badge
                variant='default'
                className='text-xs animate-bounce bg-amber-500'
              >
                🔥 Combo x{gs.combo}
              </Badge>
              <span className='text-[10px] text-muted-foreground tabular-nums'>
                {(gs.comboTimeLeft / 1000).toFixed(1)}s
              </span>
            </div>
            <div className='h-1.5 rounded-full bg-slate-700 dark:bg-slate-700 overflow-hidden'>
              <div
                className='h-full rounded-full transition-all duration-100'
                style={{
                  width: `${Math.round((gs.comboTimeLeft / gs.comboTimerMax) * 100)}%`,
                  backgroundColor:
                    gs.comboTimeLeft / gs.comboTimerMax > 0.5
                      ? '#22c55e'
                      : gs.comboTimeLeft / gs.comboTimerMax > 0.25
                        ? '#eab308'
                        : '#ef4444',
                }}
              />
            </div>
          </div>
        )}
        {gs && gs.maxCombo > 1 && gs.done && (
          <div className='mt-2 text-center'>
            <Badge
              variant='secondary'
              className='text-xs'
            >
              🔥 Max Combo: x{gs.maxCombo} (+{gs.maxCombo * 5} bonus)
            </Badge>
          </div>
        )}
      </main>
    </div>
  );
}
