import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { PhaserGame } from '@/components/PhaserGame';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CalendarDays, Volume2, VolumeX } from 'lucide-react';
import { isArcadeMuted, setDailyMode, toggleArcadeMute } from '@/games/arcade/kit';
import { DPad } from '@/components/arcade/DPad';

// CenteredDPadGutter — places the DPad in the LOWER part of the gutter
// between the bottom of the Phaser canvas and the hint row, slightly
// closer to the hint row than to the canvas. On mobile viewports the
// 8:7 aspect canvas leaves a tall dead zone underneath; the dpad used
// to sit at the vertical centre of that gutter which pushed it half a
// screen above the bottom — too high, blocked the playfield. Now we
// anchor the dpad so its bottom edge sits ~12px above the hint row
// (using bottom positioning relative to the canvas-region flex area,
// which collapses to ~0 on desktop and grows tall on mobile portrait).
// On wider viewports where the canvas fills the flex-1 area the dpad
// overlays the bottom of the playfield (the mobile-Frogger layout the
// rest of the game is tuned around).
function CenteredDPadGutter() {
  const [bottom, setBottom] = useState(12);

  useEffect(() => {
    const measure = () => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      // Re-measure on any layout change so the dpad stays glued to the
      // bottom of the play area no matter the viewport. We anchor the
      // dpad to the canvas-region flex container's bottom edge, which
      // sits ~12px above the hint row (the canvas region has pb-2 and
      // the hint row is in a sibling flex row below). This puts the
      // dpad in the LOWER part of the gutter, instead of dead-centre.
      // On wider viewports where the canvas fills the flex-1 area, the
      // dpad overlays the bottom of the playfield (the mobile-Frogger
      // layout the rest of the game is tuned around).
      setBottom(12);
    };
    measure();
    const t = window.setTimeout(measure, 50);
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-end justify-center"
      style={{ bottom: `${bottom}px` }}
    >
      <DPad />
    </div>
  );
}

// Shared page chrome for the Season 2 arcade games: header (back + mute),
// the 8:7 sharp-canvas box, and a hints row. All controls are in-canvas
// (drag / tap / swipe handled by the scene), so pages stay thin.
//
// Pages can pass `info` as a render-prop: info={({ onClose }) => <X onClose={onClose} />}
// When provided, a "?" button appears in the header and clicking it opens
// the rendered modal. The page owns its modal's content + close behavior.
//
// `showControls` (default true) puts a floating 4-button D-pad overlay on
// top of the canvas for touch devices / mobile. Phaser picks up the arrow
// key events because we dispatch real KeyboardEvent('keydown'/'keyup') on
// `window`, which is what kit.ts listens for.
export function ArcadeShell({
  title,
  scene,
  hints,
  info,
  showControls = true,
}: {
  title: string;
  scene: typeof Phaser.Scene;
  hints: ReactNode;
  info?: (props: { onClose: () => void }) => ReactNode;
  showControls?: boolean;
}) {
  const navigate = useNavigate();
  const [muted, setMuted] = useState(() => isArcadeMuted());
  const [daily, setDaily] = useState(false);
  const [showPause, setShowPause] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // kit.ts's daily flag is a module-level singleton — reset it on mount so
  // switching between arcade games never leaks "daily" from a previous visit.
  useEffect(() => {
    setDailyMode(false);
    return () => setDailyMode(false);
  }, []);

  useEffect(() => {
    const h = () => setMuted(isArcadeMuted()); // M key inside the game (kit.ts ArcadeScene)
    window.addEventListener('arcade-mute', h);
    return () => window.removeEventListener('arcade-mute', h);
  }, []);

  // Listen for pause events from the game scene
  useEffect(() => {
    const handler = () => setShowPause(true);
    window.addEventListener('arcade-pause', handler);
    return () => window.removeEventListener('arcade-pause', handler);
  }, []);

  // 1024×896 backing store = 512×448 design space at 2× (see kit.ts RES)
  const config = useMemo(
    () =>
      ({
        type: Phaser.AUTO,
        width: 1024,
        height: 896,
        backgroundColor: '#000000',
        scene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { mouse: { preventDefaultWheel: false }, touch: { capture: true } },
      }) satisfies Phaser.Types.Core.GameConfig,
    [scene],
  );

  return (
    <div
      className="min-h-svh flex flex-col text-white font-mono relative select-none overflow-hidden"
      style={{
        backgroundColor: '#0a0915',
        // Star field — many tiny radial gradients at scattered positions
        // across the whole page. Uses three radial-gradient layers (small
        // / medium / large) at different x/y positions and sizes so the
        // stars feel organic and not gridded. Opacity controlled at
        // layer-level. Same visual language as Space Panic's starfield.
        backgroundImage: [
          // tiny stars
          'radial-gradient(1px 1px at 12% 14%, rgba(255,255,255,0.85) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 37% 9%, rgba(167,243,252,0.7) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 68% 22%, rgba(255,255,255,0.9) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 82% 6%, rgba(196,181,253,0.7) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 22% 31%, rgba(255,255,255,0.7) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 51% 41%, rgba(165,243,252,0.85) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 90% 38%, rgba(255,255,255,0.8) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 5% 48%, rgba(196,181,253,0.6) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 44% 56%, rgba(255,255,255,0.75) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 76% 64%, rgba(165,243,252,0.7) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 15% 71%, rgba(255,255,255,0.7) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 60% 79%, rgba(196,181,253,0.85) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 33% 86%, rgba(255,255,255,0.75) 0%, transparent 100%)',
          'radial-gradient(1px 1px at 88% 92%, rgba(165,243,252,0.7) 0%, transparent 100%)',
          // medium stars
          'radial-gradient(1.6px 1.6px at 28% 19%, rgba(255,255,255,0.9) 0%, transparent 100%)',
          'radial-gradient(1.6px 1.6px at 73% 47%, rgba(165,243,252,0.9) 0%, transparent 100%)',
          'radial-gradient(1.6px 1.6px at 18% 62%, rgba(196,181,253,0.85) 0%, transparent 100%)',
          'radial-gradient(1.6px 1.6px at 54% 11%, rgba(255,255,255,0.95) 0%, transparent 100%)',
          'radial-gradient(1.6px 1.6px at 9% 88%, rgba(255,255,255,0.8) 0%, transparent 100%)',
          // ambient glow — adds the same purple/deep-space tint Space Panic uses
          'radial-gradient(circle at 80% 100%, rgba(76,29,149,0.18) 0%, transparent 60%)',
          'radial-gradient(circle at 20% 0%, rgba(15,82,186,0.10) 0%, transparent 60%)',
        ].join(', '),
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'scroll',
        backgroundSize: '100% 100%',
      }}
    >
      <header className="relative z-10 flex items-center justify-between px-3 py-1.5 border-b border-cyan-400/20 bg-gradient-to-r from-black/70 via-[#0c0a26]/70 to-black/70 backdrop-blur-sm">
        <Button
          onClick={() => {
            // Fire pause event to game scene - it should handle showing pause menu
            window.dispatchEvent(new CustomEvent('arcade-pause-trigger'));
            setShowPause(true);
          }}
          variant="outline"
          size="sm"
          className="gap-1.5 bg-black/40 border-cyan-400/25 text-cyan-200/70 hover:bg-cyan-400/10 hover:text-cyan-100 text-[10px] h-7"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Button>
        <h1 className="text-[10px] tracking-[0.3em] uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-amber-300 font-bold">
          {title}
        </h1>
        <div className="flex justify-end gap-1.5">
          {info && (
            <button
              onClick={() => setShowInfo(true)}
              aria-label="Buka glossary / cara main"
              title="Cara main & glossary"
              className="flex items-center justify-center h-7 w-7 rounded-full border border-cyan-400/25 bg-black/40 text-cyan-200/60 hover:bg-cyan-400/10 hover:text-cyan-100 active:scale-95 transition-all text-xs font-bold"
            >
              ?
            </button>
          )}
          <button
            onClick={() => {
              const next = !daily;
              setDaily(next);
              setDailyMode(next);
            }}
            aria-label={daily ? 'Mode normal' : 'Mode harian'}
            aria-pressed={daily}
            title={daily ? 'Mode Harian aktif — tap layar untuk main' : 'Aktifkan Mode Harian'}
            className={`flex items-center gap-1 h-7 px-1.5 rounded border text-[9px] font-bold tracking-wide active:scale-95 transition-all ${
              daily
                ? 'border-amber-300/60 bg-amber-400/15 text-amber-200'
                : 'border-cyan-400/25 bg-black/40 text-cyan-200/60 hover:bg-cyan-400/10 hover:text-cyan-100'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">HARIAN</span>
          </button>
          <button
            onClick={() => setMuted(!toggleArcadeMute())}
            aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}
            className="flex items-center justify-center h-7 w-7 rounded border border-cyan-400/25 bg-black/40 text-cyan-200/60 hover:bg-cyan-400/10 hover:text-cyan-100 active:scale-95 transition-all"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      <div className="relative z-10 flex-1 flex items-center justify-center px-1 pt-16 pb-2 min-h-0">
        <div
          className="w-full max-w-[760px] aspect-[8/7] max-h-[78svh] min-h-0 relative overflow-hidden rounded-lg border border-cyan-400/20 shadow-[0_0_28px_rgba(34,211,238,0.10),inset_0_0_24px_rgba(0,0,0,0.45)]"
          onContextMenu={(e) => e.preventDefault()}
        >
          <PhaserGame config={config} className="w-full h-full" />
        </div>
        {/* DPad — centred in the black gutter between the canvas bottom
            and the hint row. We use the same JS-measured approach as
            before but for the DPad: measure canvas bottom + hint top
            at runtime, then anchor the dpad so its centre lands in
            the middle of the gutter. The wrapper below gives the dpad
            a positioning context that spans the canvas-region flex
            area; we use `bottom-0` plus a `style.top` so the dpad
            moves up into the gutter regardless of the canvas height
            (mobile portrait with a tall gutter, or laptop with no
            gutter at all). */}
        {showControls && <CenteredDPadGutter />}
      </div>

      {/* Pause Overlay - shows when back is clicked */}
      {showPause && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0c0a26] border-2 border-cyan-400/40 rounded-lg p-6 flex flex-col items-center gap-4">
            <h2 className="text-cyan-300 text-2xl font-bold tracking-wider">PAUSE</h2>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowPause(false)}
                className="bg-cyan-400/20 border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/30"
              >
                LANJUTKAN
              </Button>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="bg-black/40 border-cyan-400/25 text-cyan-200/70 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                KELUAR
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Info / Glossary Modal — toggled by the "?" header button.
          Page passes a render-prop: info={({ onClose }) => <X onClose={onClose} />} */}
      {showInfo && info && (
        <div className="absolute inset-0 z-30">
          {(info as (p: { onClose: () => void }) => ReactNode)({ onClose: () => setShowInfo(false) })}
        </div>
      )}

      <div className="relative z-10 px-3 py-2 border-t border-cyan-400/10 bg-gradient-to-b from-black/80 to-[#0c0a26]/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-4 text-[8px] text-cyan-200/25 tracking-wider flex-wrap">
          {hints}
        </div>
      </div>
    </div>
  );
}
