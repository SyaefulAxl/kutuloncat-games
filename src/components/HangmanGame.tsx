import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HangmanGameState } from '@/games/hangman/HangmanScene';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalize(p: string): string {
  return String(p || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── SVG Hangman ── */
function HangmanSVG({ wrong }: { wrong: number }) {
  return (
    <svg
      viewBox='0 0 160 200'
      className='w-20 h-20 sm:w-28 sm:h-28 text-muted-foreground shrink-0'
    >
      {/* Gallows */}
      <line
        x1='20'
        y1='190'
        x2='80'
        y2='190'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
      />
      <line
        x1='50'
        y1='190'
        x2='50'
        y2='20'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
      />
      <line
        x1='50'
        y1='20'
        x2='115'
        y2='20'
        stroke='currentColor'
        strokeWidth='3'
        strokeLinecap='round'
      />
      <line
        x1='115'
        y1='20'
        x2='115'
        y2='40'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
      />
      {/* Body parts */}
      {wrong >= 1 && (
        <circle
          cx='115'
          cy='55'
          r='15'
          stroke='#ef4444'
          strokeWidth='2.5'
          fill='none'
          className='animate-pop-in'
        />
      )}
      {wrong >= 2 && (
        <line
          x1='115'
          y1='70'
          x2='115'
          y2='120'
          stroke='#ef4444'
          strokeWidth='2.5'
          strokeLinecap='round'
          className='animate-pop-in'
        />
      )}
      {wrong >= 3 && (
        <line
          x1='115'
          y1='82'
          x2='90'
          y2='108'
          stroke='#ef4444'
          strokeWidth='2.5'
          strokeLinecap='round'
          className='animate-pop-in'
        />
      )}
      {wrong >= 4 && (
        <line
          x1='115'
          y1='82'
          x2='140'
          y2='108'
          stroke='#ef4444'
          strokeWidth='2.5'
          strokeLinecap='round'
          className='animate-pop-in'
        />
      )}
      {wrong >= 5 && (
        <line
          x1='115'
          y1='120'
          x2='90'
          y2='155'
          stroke='#ef4444'
          strokeWidth='2.5'
          strokeLinecap='round'
          className='animate-pop-in'
        />
      )}
      {wrong >= 6 && (
        <line
          x1='115'
          y1='120'
          x2='140'
          y2='155'
          stroke='#ef4444'
          strokeWidth='2.5'
          strokeLinecap='round'
          className='animate-pop-in'
        />
      )}
    </svg>
  );
}

type StatusType = 'info' | 'success' | 'error' | 'warn';

const STATUS_STYLE: Record<StatusType, string> = {
  info: 'border-muted-foreground/30 text-muted-foreground',
  success:
    'border-green-500/40 bg-green-100 dark:bg-green-950/20 text-green-700 dark:text-green-400',
  error:
    'border-red-500/40 bg-red-100 dark:bg-red-950/20 text-red-700 dark:text-red-400',
  warn: 'border-amber-500/40 bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
};

export function HangmanGame() {
  const [phrase, setPhrase] = useState('');
  const [hint, setHint] = useState('umum');
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(0);
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const [statusText, setStatusText] = useState('Memuat...');
  const [statusType, setStatusType] = useState<StatusType>('info');
  const [loading, setLoading] = useState(true);
  const [letters, setLetters] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const sessionRef = useRef<any>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const gameStartTime = useRef<number>(Date.now());

  /* ── Combo system ── */
  const COMBO_WINDOW_MS = 5000;
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboTimeLeft, setComboTimeLeft] = useState(0);
  const lastCorrectTimeRef = useRef(0);

  /* Emit state for HangmanPage combo display */
  const emitState = useCallback(
    (
      overrides?: Partial<{
        combo: number;
        maxCombo: number;
        comboTimeLeft: number;
        done: boolean;
        wrong: number;
        score: number;
      }>,
    ) => {
      const s: HangmanGameState = {
        combo: overrides?.combo ?? combo,
        maxCombo: overrides?.maxCombo ?? maxCombo,
        comboTimeLeft: overrides?.comboTimeLeft ?? comboTimeLeft,
        comboTimerMax: COMBO_WINDOW_MS,
        done: overrides?.done ?? done,
        wrong: overrides?.wrong ?? wrong,
        score: overrides?.score ?? 0,
      };
      (window as any).__hangmanState = s;
    },
    [combo, maxCombo, comboTimeLeft, done, wrong],
  );

  /* Combo timer decay */
  useEffect(() => {
    if (combo <= 0 || comboTimeLeft <= 0 || done) return;
    const id = setInterval(() => {
      setComboTimeLeft((prev) => {
        const next = Math.max(0, prev - 50);
        if (next <= 0) {
          setCombo(0);
        }
        return next;
      });
    }, 50);
    return () => clearInterval(id);
  }, [combo, comboTimeLeft, done]);

  /* Emit state whenever combo values change */
  useEffect(() => {
    emitState();
  }, [combo, maxCombo, comboTimeLeft, done, wrong, emitState]);

  /* ── Generate shuffled letter buttons ── */
  const generateLetters = useCallback((p: string) => {
    const uniq = [...new Set(p.toLowerCase().replace(/\s/g, '').split(''))];
    const decoy = [...ALPHA.toLowerCase()]
      .filter((c) => !uniq.includes(c))
      .sort(() => Math.random() - 0.5)
      .slice(0, 10);
    return [...new Set([...uniq, ...decoy])]
      .sort(() => Math.random() - 0.5)
      .map((c) => c.toUpperCase());
  }, []);

  /* ── Load new phrase from API ── */
  const loadPhrase = useCallback(async () => {
    setLoading(true);
    sessionRef.current = null;
    let p = 'KAMU JOMBLO YA';
    let h = 'romantis';
    try {
      const r = await fetch('/api/hangman/phrase');
      const j = await r.json();
      if (j?.ok && j?.row?.phrase) {
        p = normalize(j.row.phrase);
        h = String(j.row.hint || 'umum')
          .toLowerCase()
          .split(/\s+/)[0];
      }
    } catch {
      /* use fallback */
    }
    setPhrase(p);
    setHint(h);
    setLetters(generateLetters(p));
    setUsed(new Set());
    setWrong(0);
    setDone(false);
    setWon(false);
    setStatusText('Game dimulai. Tebak kalimat 3-5 kata ini!');
    setStatusType('success');
    setLoading(false);
    gameStartTime.current = Date.now();
    setCombo(0);
    setMaxCombo(0);
    setComboTimeLeft(0);
    lastCorrectTimeRef.current = 0;
  }, [generateLetters]);

  useEffect(() => {
    loadPhrase();
  }, [loadPhrase]);

  /* ── Keyboard support (desktop) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (done || loading) return;
      const ch = e.key.toUpperCase();
      if (ch.length === 1 && /[A-Z]/.test(ch) && letters.includes(ch)) {
        pressLetter(ch);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, loading, letters, used, phrase, wrong]);

  /* ── Unique phrase letters ── */
  const phraseLettersLC = [
    ...new Set(phrase.replace(/\s/g, '').toLowerCase().split('')),
  ];

  /* ── Press letter ── */
  function pressLetter(ch: string) {
    if (done || used.has(ch)) return;

    const newUsed = new Set(used);
    newUsed.add(ch);
    setUsed(newUsed);

    const inPhrase = phrase.toUpperCase().includes(ch.toUpperCase());

    if (!inPhrase) {
      const newWrong = wrong + 1;
      setWrong(newWrong);

      // Reset combo on wrong
      setCombo(0);
      setComboTimeLeft(0);

      // Shake effect
      clearTimeout(shakeTimerRef.current);
      setShaking(true);
      shakeTimerRef.current = setTimeout(() => setShaking(false), 450);

      if (newWrong >= 6) {
        setDone(true);
        setStatusText(`❌ Kalah! Jawabannya: "${phrase}"`);
        setStatusType('error');
        submitScore(false, newUsed, newWrong);
        return;
      }
      setStatusText(`❌ Huruf "${ch}" tidak ada!`);
      setStatusType('warn');
    } else {
      // Combo logic: if within window, increase combo
      const now = Date.now();
      let newCombo: number;
      if (
        lastCorrectTimeRef.current > 0 &&
        now - lastCorrectTimeRef.current <= COMBO_WINDOW_MS
      ) {
        newCombo = combo + 1;
      } else {
        newCombo = 1;
      }
      lastCorrectTimeRef.current = now;
      setCombo(newCombo);
      setComboTimeLeft(COMBO_WINDOW_MS);
      const newMax = Math.max(maxCombo, newCombo);
      setMaxCombo(newMax);
      emitState({
        combo: newCombo,
        maxCombo: newMax,
        comboTimeLeft: COMBO_WINDOW_MS,
      });

      // Check win
      const allFound = phraseLettersLC.every(
        (c) => newUsed.has(c.toUpperCase()) || newUsed.has(c),
      );
      if (allFound) {
        setDone(true);
        setWon(true);
        setStatusText('🎉 Selamat! Kamu berhasil menebak!');
        setStatusType('success');
        submitScore(true, newUsed, wrong, newMax);
        return;
      }
      const comboText = newCombo > 1 ? ` 🔥 Combo x${newCombo}!` : '';
      setStatusText(`👍 Bagus! Huruf "${ch}" ada!${comboText}`);
      setStatusType('success');
    }
  }

  /* ── Score ── */
  function calculateScore(
    win: boolean,
    usedSet: Set<string>,
    wrongCount: number,
    mc?: number,
  ): number {
    const benar = phraseLettersLC.filter(
      (c) => usedSet.has(c.toUpperCase()) || usedSet.has(c),
    ).length;
    const comboBonus = (mc ?? maxCombo) > 1 ? (mc ?? maxCombo) * 5 : 0;
    return Math.max(
      0,
      benar * 10 +
        (6 - wrongCount) * 15 -
        wrongCount * 5 +
        (win ? 40 : 0) +
        comboBonus,
    );
  }

  async function submitScore(
    win: boolean,
    usedSet: Set<string>,
    wrongCount: number,
    mc?: number,
  ) {
    try {
      if (!sessionRef.current) {
        const sr = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ game: 'hangman' }),
        });
        const sj = await sr.json();
        if (sj?.ok) sessionRef.current = sj;
      }
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          game: 'hangman',
          score: calculateScore(win, usedSet, wrongCount, mc),
          meta: {
            win,
            phrase,
            wrong: wrongCount,
            hint,
            wrongGuesses: wrongCount,
            maxCombo: mc ?? maxCombo,
            durationSec: Math.floor(
              (Date.now() - gameStartTime.current) / 1000,
            ),
          },
          sessionId: sessionRef.current?.sessionId,
          startedAt: sessionRef.current?.startedAt,
          token: sessionRef.current?.token,
        }),
      });
    } catch {
      /* best effort */
    }
  }

  /* ── Word display ── */
  function renderWord() {
    if (!phrase) return null;
    return (
      <div className='flex flex-wrap justify-center gap-x-5 gap-y-3 py-3 sm:py-5'>
        {phrase.split(' ').map((word, wi) => (
          <div
            key={wi}
            className='flex gap-1 sm:gap-1.5'
          >
            {word.split('').map((ch, ci) => {
              const revealed =
                used.has(ch) || used.has(ch.toLowerCase()) || done;
              return (
                <div
                  key={ci}
                  className={cn(
                    'w-7 h-9 sm:w-9 sm:h-11 flex items-center justify-center border-b-2 font-bold text-lg sm:text-xl transition-all duration-300',
                    revealed
                      ? won
                        ? 'border-green-400 text-green-700 dark:text-green-300'
                        : done
                          ? 'border-red-400 text-red-700 dark:text-red-300'
                          : 'border-primary text-foreground animate-pop-in'
                      : 'border-muted-foreground/50',
                  )}
                >
                  {revealed ? ch : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className={cn('space-y-3 sm:space-y-4', shaking && 'animate-shake')}>
      {/* Status */}
      <div
        className={cn(
          'rounded-xl border px-4 py-3 transition-all duration-300',
          STATUS_STYLE[statusType],
        )}
      >
        <p className='text-sm font-medium'>{statusText}</p>
      </div>

      {/* Hint badge - compact */}
      <div className='flex items-center gap-2'>
        <span className='text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted border border-border'>
          🏷️ {hint}
        </span>
      </div>

      {/* Hangman SVG + Word display */}
      {loading ? (
        <div className='text-center py-10 text-muted-foreground animate-pulse'>
          Memuat kata...
        </div>
      ) : (
        <div className='flex items-start gap-3'>
          <HangmanSVG wrong={wrong} />
          <div className='flex-1 min-w-0'>{renderWord()}</div>
        </div>
      )}

      {/* Letter buttons */}
      {!loading && (
        <div className='grid grid-cols-8 sm:grid-cols-9 gap-1.5 sm:gap-2'>
          {letters.map((ch) => {
            const isUsed = used.has(ch);
            const correct = isUsed && phrase.toUpperCase().includes(ch);
            return (
              <button
                key={ch}
                onClick={() => pressLetter(ch)}
                disabled={isUsed || done}
                className={cn(
                  'aspect-square rounded-lg font-bold text-base sm:text-lg transition-all duration-150',
                  'flex items-center justify-center select-none',
                  isUsed
                    ? correct
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400/70 border border-green-500/30 scale-90'
                      : 'bg-red-100 dark:bg-red-900/20 text-red-700/60 dark:text-red-400/40 border border-red-500/15 scale-90'
                    : 'bg-card border border-border text-foreground hover:bg-accent hover:scale-105 active:scale-95 cursor-pointer',
                )}
              >
                {ch}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div className='flex flex-wrap gap-2'>
        <div className='rounded-lg bg-card border border-border px-3 py-2 text-sm'>
          Kesalahan: <span className='font-bold'>{wrong}/6</span>
        </div>
        <div className='rounded-lg bg-card border border-border px-3 py-2 text-sm flex-1 min-w-0 truncate'>
          Huruf terpakai: {used.size ? [...used].join(', ') : '-'}
        </div>
      </div>

      {/* Restart */}
      <Button
        onClick={loadPhrase}
        disabled={loading}
        className='w-full sm:w-auto'
      >
        🔁 Kata Baru
      </Button>
    </div>
  );
}
