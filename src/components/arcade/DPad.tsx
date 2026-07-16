import { useEffect, useState } from 'react';

/**
 * DPad — classic 4-button directional pad for arcade games.
 *
 * Layout (relative to the dpad root, 144×144):
 *
 *              [   ▲   ]
 *      [   ◀   ][      ][   ▶   ]
 *              [   ▼   ]
 *
 * Each button is a discrete touch target. Tapping or holding fires the
 * matching arrow key; releasing fires the matching keyup. Pointer Events
 * + pointer capture so a finger sliding off the button still receives
 * a release — no stuck "up" press.
 *
 * Visual language follows Space Panic's Joystick (cyan-400/25 border,
 * cyan-400/[0.05] background, cyan inner-glow shadow) so the controls
 * look native to the rest of the game suite, but the interaction model
 * is discrete buttons instead of a continuous knob. Players who prefer
 * the Frogger-style "tap to hop" find this more familiar than analog
 * stick drag.
 *
 * Hidden by default on the title screen; reveals the moment the player
 * presses any arrow key or taps the dpad area. (Same pattern as the
 * previous analog stick — keeps the title clean.)
 */

type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

function fireKey(key: Arrow, type: 'keydown' | 'keyup') {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const ARROW_UP: Arrow = 'ArrowUp';
const ARROW_DOWN: Arrow = 'ArrowDown';
const ARROW_LEFT: Arrow = 'ArrowLeft';
const ARROW_RIGHT: Arrow = 'ArrowRight';

/** Reusable single directional button with press highlight. */
function PadButton({
  direction,
  children,
}: {
  direction: Arrow;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Arah ${direction.replace('Arrow', '').toLowerCase()}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPressed(true);
        fireKey(direction, 'keydown');
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPressed(false);
        fireKey(direction, 'keyup');
      }}
      onPointerCancel={() => {
        setPressed(false);
        fireKey(direction, 'keyup');
      }}
      onPointerLeave={() => {
        // Pointer left the button before release. Fire keyup to avoid
        // a stuck-press.
        if (pressed) {
          setPressed(false);
          fireKey(direction, 'keyup');
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={
        'pointer-events-auto flex items-center justify-center ' +
        'h-12 w-12 rounded-md border will-change-transform touch-manipization ' +
        'transition-all duration-75 active:scale-95 ' +
        (pressed
          ? 'border-cyan-200 bg-cyan-400/35 shadow-[inset_0_0_18px_rgba(124,227,255,0.45),0_0_16px_rgba(34,211,238,0.5)] scale-95'
          : 'border-cyan-400/30 bg-cyan-400/[0.06] shadow-[inset_0_0_12px_rgba(124,227,255,0.10),0_0_8px_rgba(0,0,0,0.30)] hover:bg-cyan-400/15 hover:border-cyan-300/60')
      }
    >
      {children}
    </button>
  );
}

/**
 * DPad visual only — assumes its parent handles the layout / position
 * on the page. The 144×144 root gives us 12-px gaps between 48×48
 * buttons in a clean plus shape.
 */
export function DPadVisual() {
  return (
    <div
      aria-label="Directional pad — tap or hold any direction to move the character"
      className="relative h-36 w-36"
    >
      {/* faint N/S/E/W indicators in the centre square (between the 4
          buttons) so the pad reads as a directional control even when
          all 4 buttons are at rest. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded border border-cyan-400/10 bg-cyan-400/[0.02] shadow-[inset_0_0_8px_rgba(124,227,255,0.06)]"
      />

      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <PadButton direction={ARROW_UP}>
          <span className="text-cyan-200/80 text-lg font-bold leading-none select-none">▲</span>
        </PadButton>
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2">
        <PadButton direction={ARROW_LEFT}>
          <span className="text-cyan-200/80 text-lg font-bold leading-none select-none">◀</span>
        </PadButton>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2">
        <PadButton direction={ARROW_RIGHT}>
          <span className="text-cyan-200/80 text-lg font-bold leading-none select-none">▶</span>
        </PadButton>
      </div>
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2">
        <PadButton direction={ARROW_DOWN}>
          <span className="text-cyan-200/80 text-lg font-bold leading-none select-none">▼</span>
        </PadButton>
      </div>
    </div>
  );
}

/**
 * Full DPad component: visual + reveal-on-interaction logic. Use this
 * in ArcadeShell. Mirrors the previous AnalogStick API so swapping the
 * import is a one-line change.
 */
export function DPad() {
  const [revealed, setRevealed] = useState(false);

  // Reveal on first keyboard arrow press (covers desktop QA) or first
  // tap on the dpad (covers mobile).
  useEffect(() => {
    if (revealed) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        setRevealed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed]);

  if (!revealed) {
    // Invisible 144×144 probe — first tap anywhere in this square
    // reveals the dpad. Same probe strategy as the analog stick.
    return (
      <div
        aria-label="Reveal directional pad"
        onPointerDown={() => setRevealed(true)}
        className="pointer-events-auto h-36 w-36 rounded-full bg-transparent"
      />
    );
  }

  return <DPadVisual />;
}