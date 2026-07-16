import { useEffect, useRef, useState } from 'react';

/**
 * AnalogStick — floating virtual joystick for arcade games.
 *
 * Behaviour:
 *   • Drag the knob in any direction; past a small deadzone, the dominant
 *     axis dispatches ArrowUp/Down/Left/Right keydown to window.
 *   • On release (or when the knob returns to centre), the matching
 *     keyup fires.
 *   • Diagonals snap to the dominant axis (|dx| vs |dy|) so sloppy
 *     drags never accidentally grab the wrong lane. Same rule the
 *     Space Panic joystick uses.
 *   • Hidden by default on the title screen; appears the moment the
 *     player makes any input (keyboard arrow, mouse click, or first
 *     touch on the stick). This keeps the title clean and avoids
 *     "obscuring the screen" complaints.
 *   • Small footprint (96×96 base, 40×40 knob) and low idle opacity
 *     (0.18) so the gameplay area stays readable.
 *   • On press, opacity bumps to 0.85 so the player gets clear
 *     visual feedback.
 */

type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | null;

function fireKey(key: Exclude<Arrow, null>, type: 'keydown' | 'keyup') {
  window.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function AnalogStick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pidRef = useRef<number | null>(null);
  const activeRef = useRef<Exclude<Arrow, null>>(null);

  // `revealed` flips to true the first time the player tries to interact
  // with the stick (or any arrow key). After that it stays visible for
  // the rest of the session.
  const [revealed, setRevealed] = useState(false);
  // `pressed` is purely for the visual highlight.
  const [pressed, setPressed] = useState(false);

  // Auto-reveal on first keyboard arrow press so the stick pops in if
  // the user starts moving with the keyboard instead of the touch knob.
  useEffect(() => {
    if (revealed) return;
    const onFirstInput = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        setRevealed(true);
      }
    };
    window.addEventListener('keydown', onFirstInput);
    return () => window.removeEventListener('keydown', onFirstInput);
  }, [revealed]);

  const setKnob = (x: number, y: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
  };

  const setActive = (next: Exclude<Arrow, null> | null) => {
    if (next === activeRef.current) return;
    if (activeRef.current) fireKey(activeRef.current, 'keyup');
    if (next) fireKey(next, 'keydown');
    activeRef.current = next;
  };

  const release = () => {
    if (pidRef.current === null) return;
    pidRef.current = null;
    setKnob(0, 0);
    setPressed(false);
    setActive(null);
  };

  const track = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el || pidRef.current === null) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 8; // knob radius; keeps the knob inside the ring
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob(dx, dy);
    const dead = 8; // ~8% of base radius; small enough to feel responsive
    if (len < dead) {
      setActive(null);
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      setActive(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    } else {
      setActive(dy < 0 ? 'ArrowUp' : 'ArrowDown');
    }
  };

  if (!revealed) {
    // Render an invisible probe in the centre of the analog row so
    // the very first touch reveals the stick immediately. The probe is
    // the same size as the visible stick so a first tap anywhere on
    // the stick area triggers reveal — no surprises.
    return (
      <div
        aria-label="Reveal analog stick"
        onPointerDown={() => setRevealed(true)}
        className="pointer-events-auto h-32 w-32 rounded-full bg-transparent"
      />
    );
  }

  return (
    <div className="pointer-events-none relative select-none">
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          e.preventDefault();
          baseRef.current?.setPointerCapture(e.pointerId);
          pidRef.current = e.pointerId;
          setPressed(true);
          track(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pidRef.current === e.pointerId) track(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Analog stick — drag in any direction to move the character"
        // 128×128 base — big enough for a comfortable thumb drag on
        // phone screens, sits in its own 140px row between canvas and
        // hint text. Solid (no transparency): the user should always
        // see the control clearly.
        className={
          'pointer-events-auto h-32 w-32 rounded-full ' +
          'border-2 border-cyan-300/70 opacity-100 ' +
          'will-change-transform touch-manipization ' +
          (pressed
            ? 'bg-cyan-400/20 shadow-[inset_0_0_22px_rgba(124,227,255,0.30),0_0_18px_rgba(34,211,238,0.45)]'
            : 'bg-cyan-400/10 shadow-[inset_0_0_22px_rgba(124,227,255,0.18),0_0_14px_rgba(0,0,0,0.4)]')
        }
      >
        <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 text-[14px] text-cyan-200/80 select-none font-bold">
          ▲
        </span>
        <span className="pointer-events-none absolute left-1/2 bottom-1.5 -translate-x-1/2 text-[14px] text-cyan-200/80 select-none font-bold">
          ▼
        </span>
        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[14px] text-cyan-200/80 select-none font-bold">
          ◀
        </span>
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-cyan-200/80 select-none font-bold">
          ▶
        </span>
        <div
          ref={knobRef}
          className={
            'pointer-events-none absolute left-1/2 top-1/2 -ml-6 -mt-6 h-12 w-12 rounded-full border-2 will-change-transform ' +
            (pressed
              ? 'border-cyan-100 bg-gradient-to-br from-cyan-400/70 to-cyan-600/60 shadow-[0_0_18px_rgba(124,227,255,0.70),inset_0_0_8px_rgba(255,255,255,0.4)]'
              : 'border-cyan-200/80 bg-gradient-to-br from-cyan-400/55 to-cyan-600/40 shadow-[0_0_14px_rgba(124,227,255,0.55),inset_0_0_6px_rgba(255,255,255,0.25)]')
          }
        />
      </div>
    </div>
  );
}