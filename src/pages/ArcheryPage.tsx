import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhaserGame } from '@/components/PhaserGame';
import {
  ArcheryScene,
  type ArcheryGameState,
  type ArcheryDifficulty,
} from '@/games/archery/ArcheryScene';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

/* Aggressive mobile anti-selection / anti-context-menu styles */
const MOBILE_GUARD_STYLE: React.CSSProperties = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
} as React.CSSProperties;

const EMPTY_STATE: ArcheryGameState = {
  score: 0,
  round: 1,
  totalRounds: 10,
  arrowsLeft: 0,
  wind: { direction: 'right', strength: 0 },
  lastHit: null,
  combo: 0,
  maxCombo: 0,
  gameOver: false,
  started: false,
  difficulty: 'sedang',
  power: 0,
  aiming: false,
  bullseyes: 0,
  totalHits: 0,
  misses: 0,
};

const DIFFICULTIES: {
  key: ArcheryDifficulty;
  label: string;
  emoji: string;
  desc: string;
  color: string;
}[] = [
  {
    key: 'gampang',
    label: 'Gampang',
    emoji: '🟢',
    desc: 'Target diam, tanpa warga sipil',
    color:
      'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30',
  },
  {
    key: 'sedang',
    label: 'Sedang',
    emoji: '🟡',
    desc: 'Bergerak pelan + sedikit warga',
    color:
      'bg-yellow-500/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30',
  },
  {
    key: 'susah',
    label: 'Susah',
    emoji: '🔴',
    desc: 'Bergerak + warga sipil',
    color: 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30',
  },
  {
    key: 'gak-ngotak',
    label: 'Gak Ngotak',
    emoji: '💀',
    desc: 'Cepat, banyak warga!',
    color:
      'bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30',
  },
];

export function ArcheryPage() {
  const [gs, setGs] = useState<ArcheryGameState>(EMPTY_STATE);
  const [sceneReady, setSceneReady] = useState(false);
  const [difficulty, setDifficulty] = useState<ArcheryDifficulty>(() => {
    return (
      ((window as any).__archeryDifficulty as ArcheryDifficulty) || 'sedang'
    );
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  /* Scene ready listener */
  useEffect(() => {
    const onReady = () => requestAnimationFrame(() => setSceneReady(true));
    window.addEventListener('archery-scene-ready', onReady);
    return () => window.removeEventListener('archery-scene-ready', onReady);
  }, []);

  /* Game state polling */
  useEffect(() => {
    let prev = '';
    const interval = setInterval(() => {
      const s = (window as any).__archeryState as ArcheryGameState | undefined;
      if (!s) return;
      const key = `${s.score}-${s.round}-${s.arrowsLeft}-${s.gameOver}-${s.started}-${s.combo}-${s.aiming}`;
      if (key !== prev) {
        prev = key;
        setGs({ ...s });
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  /* Set initial difficulty */
  useEffect(() => {
    (window as any).__archeryDifficulty = difficulty;
  }, []);

  /* Block contextmenu / selectstart globally while on this page */
  useEffect(() => {
    const noCtx = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', noCtx, { passive: false });
    document.addEventListener('selectstart', noCtx, { passive: false });
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.removeEventListener('selectstart', noCtx);
    };
  }, []);

  /* Restart handler */
  const handleRestart = useCallback(() => {
    window.dispatchEvent(new Event('archery-restart'));
  }, []);

  /* Change difficulty */
  const changeDifficulty = useCallback((d: ArcheryDifficulty) => {
    setDifficulty(d);
    (window as any).__archeryDifficulty = d;
    window.dispatchEvent(
      new CustomEvent('archery-set-difficulty', { detail: d }),
    );
  }, []);

  /* Phaser config */
  const { config, canvasW, canvasH } = useMemo(() => {
    const mob = window.innerWidth < 768;
    const reservedH = 120; /* header + HUD + small footer */
    const availH = window.innerHeight - reservedH;
    const availW = window.innerWidth - (mob ? 16 : 24);

    let w: number;
    let h: number;
    if (mob) {
      w = Math.min(availW, 480);
      h = Math.min(availH, Math.round(w * 1.5));
      h = Math.max(h, 400);
      w = Math.max(w, 300);
    } else {
      w = Math.min(700, availW);
      h = Math.min(700, availH);
    }

    return {
      canvasW: w,
      canvasH: h,
      config: {
        type: Phaser.AUTO,
        width: w,
        height: h,
        backgroundColor: '#1a1a2e',
        scene: ArcheryScene,
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

  const diffInfo =
    DIFFICULTIES.find((d) => d.key === gs.difficulty) || DIFFICULTIES[1];

  return (
    <div
      className='min-h-svh flex flex-col bg-background'
      style={MOBILE_GUARD_STYLE}
      onContextMenu={(e) => e.preventDefault()}
    >
      {' '}
      {/* Header */}
      <header className='flex items-center justify-between px-3 py-2 border-b border-border/30'>
        <Link
          to='/'
          draggable={false}
        >
          <Button
            variant='outline'
            size='sm'
            className='gap-1.5 touch-none select-none'
          >
            <ArrowLeft className='h-4 w-4' />
            Dashboard
          </Button>
        </Link>
        <div className='rounded-lg bg-card border border-border px-3 py-1.5 text-sm font-bold tabular-nums'>
          🔫 Skor: {gs.score}
        </div>
      </header>
      {/* HUD */}
      <div className='flex items-center justify-between px-3 py-1.5 text-xs sm:text-sm'>
        <div className='flex items-center gap-2'>
          <span className='tabular-nums'>
            🎯 Ronde {gs.round}/{gs.totalRounds}
          </span>
          <span className='tabular-nums text-muted-foreground'>
            🔫 {gs.arrowsLeft} peluru
          </span>
        </div>
        <div className='flex items-center gap-2'>
          {gs.combo >= 3 && (
            <Badge
              variant='default'
              className='text-xs animate-bounce bg-amber-500'
            >
              🔥 x{gs.combo}
            </Badge>
          )}
          {gs.lastHit && (
            <span
              className={cn(
                'font-medium',
                gs.lastHit.ring.includes('Headshot')
                  ? 'text-amber-400'
                  : gs.lastHit.ring === 'Miss'
                    ? 'text-red-400'
                    : gs.lastHit.ring.includes('Civilian')
                      ? 'text-red-500'
                      : 'text-muted-foreground',
              )}
            >
              {gs.lastHit.ring === 'Miss'
                ? '❌ Miss'
                : gs.lastHit.points < 0
                  ? `⚠️ ${gs.lastHit.ring} ${gs.lastHit.points}`
                  : `${gs.lastHit.ring} +${gs.lastHit.points}`}
            </span>
          )}
        </div>
      </div>
      {/* Game Canvas */}
      <div className='flex-1 mx-auto my-1 relative'>
        <div
          className='rounded-xl border border-border/30 overflow-hidden shadow-lg shadow-black/40 relative'
          style={{ maxWidth: canvasW, maxHeight: canvasH }}
        >
          {/* Loading overlay */}
          <div
            ref={overlayRef}
            className={`absolute inset-0 z-20 bg-background flex flex-col items-center justify-center rounded-xl transition-opacity duration-500 ${sceneReady ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <div className='text-4xl animate-bounce mb-3'>🔫</div>
            <p className='text-white/80 text-sm animate-pulse'>
              Memuat game...
            </p>
          </div>
          <PhaserGame
            config={config}
            className='w-full'
          />

          {/* Start overlay */}
          {!gs.started && !gs.gameOver && sceneReady && (
            <div className='absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none'>
              <div className='text-center animate-fade-in'>
                <p className='text-6xl mb-4'>🔫</p>
                <h2 className='text-2xl font-bold text-white mb-2 drop-shadow-lg'>
                  AI-m Targetnya
                </h2>
                <p className='text-white/70 text-sm mb-1 drop-shadow'>
                  {diffInfo.emoji} {diffInfo.label}
                </p>
                <p className='text-white/50 text-xs drop-shadow'>
                  {diffInfo.desc}
                </p>
                <p className='text-white/60 text-sm mt-4 animate-pulse drop-shadow'>
                  Tap untuk mulai · Tembak musuh, hindari warga!
                </p>
                <div className='mt-3 text-white/40 text-xs space-y-0.5 drop-shadow'>
                  <p>🔴 Merah = Musuh · 🟡 Emas = Bonus (skor 2x!)</p>
                  <p>
                    🔵 Biru = Warga (-poin) · ⬜ Abu = Lapis baja (2x tembak)
                  </p>
                  <p>🟢 Hijau = Kecil & cepat (skor tinggi)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Game-over overlay */}
        {gs.gameOver && (
          <div className='absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10 backdrop-blur-sm rounded-xl animate-pop-in'>
            <h2 className='text-3xl sm:text-4xl font-bold text-amber-400 mb-2'>
              🔫 Selesai!
            </h2>
            <p className='text-2xl font-bold text-white mb-1'>
              Skor: {gs.score}
            </p>
            <div className='text-sm text-white/60 mb-3 text-center space-y-0.5'>
              <p>
                🎯 Headshot: {gs.bullseyes} · Hit: {gs.totalHits} · Miss:{' '}
                {gs.misses}
              </p>
              <p>
                Akurasi:{' '}
                {gs.totalHits + gs.misses > 0
                  ? Math.round(
                      (gs.totalHits / (gs.totalHits + gs.misses)) * 100,
                    )
                  : 0}
                %
              </p>
              {gs.maxCombo > 1 && <p>Max Combo: {gs.maxCombo}</p>}
            </div>
            <Button
              onClick={handleRestart}
              className='gap-2'
            >
              🔄 Main Lagi
            </Button>
          </div>
        )}
      </div>
      {/* Difficulty selector */}
      {!gs.started && !gs.gameOver && (
        <div className='px-3 py-2 flex flex-wrap items-center justify-center gap-2'>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.key}
              onClick={() => changeDifficulty(d.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                d.color,
                difficulty === d.key && 'ring-2 ring-white/30 scale-105',
              )}
            >
              {d.emoji} {d.label}
            </button>
          ))}
        </div>
      )}
      {/* Simple footer */}
      <div className='px-3 py-2 border-t border-border/30'>
        <div className='flex items-center justify-center gap-2'>
          {gs.gameOver && (
            <Button
              onClick={handleRestart}
              size='sm'
              className='gap-1'
            >
              🔄 Main Lagi
            </Button>
          )}
        </div>
        {gs.started && !gs.gameOver && (
          <p className='text-center text-xs text-muted-foreground mt-1'>
            🔴 Musuh · 🟡 Bonus (2x) · 🟢 Kecil (3x) · 🔵 Warga (-poin)
          </p>
        )}
      </div>
    </div>
  );
}
