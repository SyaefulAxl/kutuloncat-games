import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import {
  FruitNinjaScene,
  type FNGameState,
} from '@/games/fruit-ninja/FruitNinjaScene';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArrowLeft, Moon, Sun } from 'lucide-react';

const EMPTY_STATE: FNGameState = {
  skor: 0,
  nyawa: 3,
  kombo: 0,
  maxKombo: 0,
  gameOver: false,
  stage: 1,
  elapsed: 0,
  slices: 0,
  missed: 0,
  lastEvent: '',
  lastEventTime: 0,
  lives: 3,
};

export function FruitNinjaPage() {
  const [dark, setDark] = useState(true);
  const [gs, setGs] = useState<FNGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ── Scene ready listener — hides loading overlay ── */
  useEffect(() => {
    const onReady = () => {
      // Small delay to let first frame paint
      requestAnimationFrame(() => {
        setSceneReady(true);
      });
    };
    window.addEventListener('fn-scene-ready', onReady);
    return () => window.removeEventListener('fn-scene-ready', onReady);
  }, []);

  /* ── Theme ── */
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

  /* ── Game state polling from Phaser ── */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__fnState as FNGameState | undefined;
      if (!s) return;
      const key = `${s.skor}-${s.nyawa}-${s.kombo}-${s.gameOver}-${s.lastEventTime}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  /* ── Restart handler ── */
  const handleRestart = useCallback(() => {
    window.dispatchEvent(new Event('fn-restart'));
  }, []);

  /* ── Status message ── */
  const now = Date.now();
  const statusAge = now - gs.lastEventTime;
  const statusMsg = gs.lastEvent && statusAge < 2500 ? gs.lastEvent : '';

  /* ── Phaser config — dynamic canvas sizing ── */
  const { config, canvasW, canvasH } = useMemo(() => {
    const mob = window.innerWidth < 768;
    // Reserve space for header (~44px), HUD (~36px), controls (~44px), borders (~16px)
    const reservedH = 140;
    const availH = window.innerHeight - reservedH;
    const availW = window.innerWidth - (mob ? 16 : 24);

    let cw: number;
    let ch: number;

    if (mob) {
      // Mobile: fill viewport width, height fits remaining space
      cw = Math.min(availW, 480);
      ch = Math.min(availH, Math.round(cw * 1.5));
      // Ensure minimum playable size
      ch = Math.max(ch, 400);
      cw = Math.max(cw, 300);
    } else {
      // Desktop: larger canvas with 4:3 aspect
      cw = Math.min(800, availW);
      ch = Math.min(600, availH);
    }

    return {
      canvasW: cw,
      canvasH: ch,
      config: {
        type: Phaser.AUTO,
        width: cw,
        height: ch,
        backgroundColor: '#0a0e1a',
        scene: FruitNinjaScene,
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
          🍬 Skor: {gs.skor}
        </div>
      </header>

      {/* ── HUD ── */}
      <div className='flex items-center justify-between px-3 py-1.5'>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums'>
          ❤️ Nyawa: {gs.nyawa}
        </div>
        <div className='text-xs text-muted-foreground tabular-nums'>
          Stage {gs.stage} • {gs.elapsed}s
        </div>
        <div
          className={cn(
            'rounded-lg bg-card border border-border px-3 py-1.5 text-sm tabular-nums transition-all duration-200',
            gs.kombo >= 3 &&
              'animate-pulse-glow border-amber-500/60 text-amber-700 dark:text-amber-300 font-bold',
            gs.kombo >= 2 && gs.kombo < 3 && 'border-amber-500/30',
          )}
        >
          🔥 Kombo: {gs.kombo}
        </div>
      </div>

      {/* ── Game Canvas ── */}
      <div className='flex-1 mx-2 sm:mx-3 my-1 relative'>
        <div
          className='rounded-xl border border-border overflow-hidden shadow-lg relative'
          style={{ aspectRatio: `${canvasW} / ${canvasH}`, maxWidth: canvasW }}
        >
          {/* Loading overlay — covers canvas until scene is ready */}
          <div
            ref={overlayRef}
            className={`absolute inset-0 z-20 bg-[#0a0e1a] flex flex-col items-center justify-center rounded-xl transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <div className='text-4xl animate-bounce mb-3'>🍉</div>
            <p className='text-white/60 text-sm animate-pulse'>
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
          <div className='absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-10 backdrop-blur-sm rounded-xl animate-pop-in'>
            <h2 className='text-3xl sm:text-4xl font-bold text-red-300 mb-4 sm:mb-6'>
              💥 Game Over
            </h2>
            <div className='text-center space-y-1.5 mb-6 sm:mb-8'>
              <p className='text-2xl sm:text-3xl font-bold text-foreground tabular-nums'>
                Skor: {gs.skor}
              </p>
              <p className='text-muted-foreground'>
                🍉 Buah: {gs.slices} &nbsp;|&nbsp; ❌ Missed: {gs.missed}
              </p>
              <p className='text-muted-foreground'>
                🔥 Max Kombo: {gs.maxKombo}
              </p>
              <p className='text-muted-foreground text-sm'>
                Stage {gs.stage} &nbsp;•&nbsp; {gs.elapsed}s
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
        <span
          className={cn(
            'text-sm transition-opacity duration-500',
            statusMsg ? 'opacity-100' : 'opacity-0',
          )}
        >
          {statusMsg || '\u00A0'}
        </span>
      </div>
    </div>
  );
}
