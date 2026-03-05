import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import {
  FlappyBirdScene,
  type FBGameState,
} from '@/games/flappy-bird/FlappyBirdScene';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, Moon, Sun } from 'lucide-react';

const EMPTY_STATE: FBGameState = {
  score: 0,
  highScore: 0,
  gameOver: false,
  started: false,
  elapsed: 0,
  pipesPassed: 0,
};

export function FlappyBirdPage() {
  const [dark, setDark] = useState(false);
  const [gs, setGs] = useState<FBGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ── Scene ready listener ── */
  useEffect(() => {
    const onReady = () => {
      requestAnimationFrame(() => setSceneReady(true));
    };
    window.addEventListener('fb-scene-ready', onReady);
    return () => window.removeEventListener('fb-scene-ready', onReady);
  }, []);

  /* ── Theme ── */
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'light';
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

  /* ── Game state polling ── */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__fbState as FBGameState | undefined;
      if (!s) return;
      const key = `${s.score}-${s.highScore}-${s.gameOver}-${s.started}-${s.pipesPassed}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  /* ── Restart handler ── */
  const handleRestart = useCallback(() => {
    window.dispatchEvent(new Event('fb-restart'));
  }, []);

  /* ── Phaser config ── */
  const { config, canvasW, canvasH } = useMemo(() => {
    const mob = window.innerWidth < 768;
    const reservedH = 140;
    const availH = window.innerHeight - reservedH;
    const availW = window.innerWidth - (mob ? 16 : 24);

    let cw: number;
    let ch: number;

    if (mob) {
      cw = Math.min(availW, 400);
      ch = Math.min(availH, Math.round(cw * 1.6));
      ch = Math.max(ch, 500);
      cw = Math.max(cw, 280);
    } else {
      cw = Math.min(480, availW);
      ch = Math.min(700, availH);
    }

    return {
      canvasW: cw,
      canvasH: ch,
      config: {
        type: Phaser.AUTO,
        width: cw,
        height: ch,
        backgroundColor: '#87ceeb',
        scene: FlappyBirdScene,
        pixelArt: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        input: {
          mouse: { preventDefaultWheel: false },
          touch: { capture: true },
        },
      } satisfies Phaser.Types.Core.GameConfig,
    };
  }, []);

  return (
    <div className='min-h-svh flex flex-col'>
      {/* ── Header ── */}
      <header className='flex items-center justify-between px-3 py-2 border-b border-border/50'>
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
            <Sun className='h-5 w-5 text-amber-600' />
          )}
        </button>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm font-bold tabular-nums'>
          🐥 Skor: {gs.score}
        </div>
      </header>

      {/* ── HUD ── */}
      <div className='flex items-center justify-between px-3 py-1.5'>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums'>
          🏆 Best: {gs.highScore}
        </div>
        <div className='text-xs text-muted-foreground tabular-nums'>
          {gs.started ? `${gs.elapsed}s` : 'Tap to start'}
        </div>
        <div
          className={cn(
            'rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums',
            gs.pipesPassed >= 10 &&
              'border-amber-500/50 text-amber-700 dark:text-amber-300 font-bold',
          )}
        >
          🚀 Pipes: {gs.pipesPassed}
        </div>
      </div>

      {/* ── Game Canvas ── */}
      <div className='flex-1 mx-auto my-1 relative'>
        <div
          className='rounded-xl border border-border overflow-hidden shadow-lg relative'
          style={{ aspectRatio: `${canvasW} / ${canvasH}`, maxWidth: canvasW }}
        >
          {/* Loading overlay */}
          <div
            ref={overlayRef}
            className={`absolute inset-0 z-20 bg-[#87ceeb] flex flex-col items-center justify-center rounded-xl transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <div className='text-4xl animate-bounce mb-3'>🐥</div>
            <p className='text-white/80 text-sm animate-pulse'>
              Memuat game...
            </p>
          </div>
          <PhaserGame
            config={config}
            className='w-full'
          />
        </div>

        {/* Game-over overlay */}
        {gs.gameOver && (
          <div className='absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm rounded-xl animate-pop-in'>
            <h2 className='text-3xl sm:text-4xl font-bold text-red-400 mb-4 sm:mb-6'>
              💥 Game Over
            </h2>
            <div className='text-center space-y-1.5 mb-6 sm:mb-8'>
              <p className='text-2xl sm:text-3xl font-bold text-white tabular-nums'>
                Skor: {gs.score}
              </p>
              <p className='text-gray-300'>🏆 Best: {gs.highScore}</p>
              <p className='text-gray-300'>
                🚀 Pipes: {gs.pipesPassed} &nbsp;•&nbsp; ⏱️ {gs.elapsed}s
              </p>
            </div>
            <Button
              onClick={handleRestart}
              size='lg'
              className='text-base px-8'
            >
              🔁 Main Lagi
            </Button>
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className='flex items-center gap-3 px-3 py-2 border-t border-border/30'>
        <Button
          variant='outline'
          size='sm'
          onClick={handleRestart}
        >
          Mulai Ulang
        </Button>
        <span className='text-xs text-muted-foreground'>
          Tap layar atau tekan Space untuk terbang
        </span>
      </div>
    </div>
  );
}
