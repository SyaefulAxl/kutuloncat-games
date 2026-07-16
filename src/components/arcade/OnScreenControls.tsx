import { useEffect, useState, ReactNode } from 'react';

/**
 * OnScreenControls — floating 4-button D-pad overlay for arcade games.
 *
 * Renders four circular arrow buttons (↑ ↓ ← →) at the corners of the
 * canvas region. Calls the provided `onMove(dx, dy)` callback when a
 * button is pressed. Auto-hides on non-touch devices so desktop users
 * who already use keyboard arrows aren't burdened with extra UI.
 *
 * Designed for mobile-first use but works fine with mouse on desktop
 * for QA.
 *
 * Uses pointerdown/pointerup events so:
 *   • Single tap → single hop
 *   • Held → repeat hops while held
 *   • Multi-touch → each button tracks its own pointer independently
 *
 * Layout (above canvas, never blocks the centre of the playfield):
 *                  ↑ up
 *
 *   ← left    [  gameplay  ]    right →
 *
 *                  ↓ down
 */
export function OnScreenControls({
  onMove,
  holdMs = 110,
}: {
  onMove: (dx: number, dy: number) => void;
  holdMs?: number;
}) {
  const [enabled, setEnabled] = useState(false);

  // Only show on touch devices or small screens; keep a manual toggle
  // for QA via the keyboard hotkey below.
  useEffect(() => {
    const detect = () => {
      const touch =
        typeof window !== 'undefined' &&
        ('ontouchstart' in window ||
          (navigator.maxTouchPoints ?? 0) > 0);
      const small = typeof window !== 'undefined' && window.innerWidth < 900;
      setEnabled(touch || small);
    };
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  // Allow desktop QA to toggle the pad with "D" key without touching
  // the keyboard arrows.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') setEnabled((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <PadButton
        position="up"
        dx={0}
        dy={-1}
        onMove={onMove}
        holdMs={holdMs}
        className="absolute left-1/2 top-2 -translate-x-1/2"
      />
      <PadButton
        position="down"
        dx={0}
        dy={1}
        onMove={onMove}
        holdMs={holdMs}
        className="absolute left-1/2 bottom-2 -translate-x-1/2"
      />
      <PadButton
        position="left"
        dx={-1}
        dy={0}
        onMove={onMove}
        holdMs={holdMs}
        className="absolute left-2 top-1/2 -translate-y-1/2"
      />
      <PadButton
        position="right"
        dx={1}
        dy={0}
        onMove={onMove}
        holdMs={holdMs}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}

/**
 * PadButton — single D-pad direction button with hold-to-repeat.
 * Fires once on press, then every `holdMs` ms while held.
 */
function PadButton({
  position,
  dx,
  dy,
  onMove,
  holdMs,
  className,
}: {
  position: 'up' | 'down' | 'left' | 'right';
  dx: number;
  dy: number;
  onMove: (dx: number, dy: number) => void;
  holdMs: number;
  className: string;
}) {
  const [pressed, setPressed] = useState(false);

  // Hold-to-repeat while pressed. The first onMove fires immediately from
  // onPointerDown so we don't double-fire on tap. The interval only runs
  // for the duration of the hold.
  useEffect(() => {
    if (!pressed) return;
    const id = window.setInterval(() => onMove(dx, dy), holdMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressed, dx, dy, holdMs]);

  const arrow: Record<typeof position, ReactNode> = {
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
  };

  return (
    <button
      type="button"
      aria-label={`Arah ${position}`}
      onPointerDown={(e) => {
        e.preventDefault();
        setPressed(true);
        onMove(dx, dy);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={
        'pointer-events-auto flex items-center justify-center ' +
        'h-14 w-14 rounded-full border-2 text-2xl font-bold ' +
        'transition-all duration-75 active:scale-95 ' +
        (pressed
          ? 'border-cyan-200 bg-cyan-400/40 text-white scale-95 shadow-[0_0_18px_rgba(34,211,238,0.5)]'
          : 'border-cyan-400/40 bg-black/55 text-cyan-200/90 hover:bg-cyan-400/20 hover:border-cyan-300 shadow-[0_2px_8px_rgba(0,0,0,0.4)]') +
        ' backdrop-blur-sm touch-manipulation ' +
        className
      }
    >
      {arrow[position]}
    </button>
  );
}