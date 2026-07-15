import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HangmanGameState } from '@/games/hangman/HangmanScene';
import { sfx } from '@/games/arcade/kit';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/* ── Match structure: a match is ROUNDS_PER_MATCH phrases played back to
   back sharing lives/score. Later rounds tolerate fewer wrong guesses
   before the round is lost, and the category hint is hidden in the last
   two rounds — the escalation that makes a "match" harder than a single
   phrase used to be. ── */
const ROUNDS_PER_MATCH = 5;
const ROUND_MAX_WRONG = [6, 6, 5, 5, 4];
const HIDDEN_HINT_FROM_ROUND = 4;

function normalize(p: string): string {
  return String(p || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Confetti burst on win ── */
const CONFETTI_COLORS = ['#4ade80', '#facc15', '#60a5fa', '#f472b6', '#fb923c'];
function Confetti() {
  const pieces = useState(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left: 5 + Math.random() * 90,
      delay: Math.random() * 0.3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  )[0];
  return (
    <div className='pointer-events-none absolute inset-0 overflow-hidden z-20'>
      {pieces.map((p) => (
        <div
          key={p.id}
          className='animate-confetti absolute top-0 w-2 h-2 rounded-sm'
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── SVG Hangman — stages scale to the round's wrong-guess cap so the
   figure is always exactly complete right when a round is lost, even
   though later rounds allow fewer mistakes than 6 ── */
function HangmanSVG({ wrong, maxWrong }: { wrong: number; maxWrong: number }) {
  const stage = Math.min(6, Math.ceil((wrong / maxWrong) * 6));
  return (
    <svg
      viewBox='0 0 160 200'
      className='w-20 h-20 sm:w-28 sm:h-28 text-muted-foreground shrink-0'
    >
      {/* Gallows */}
      <line x1='20' y1='190' x2='80' y2='190' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
      <line x1='50' y1='190' x2='50' y2='20' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
      <line x1='50' y1='20' x2='115' y2='20' stroke='currentColor' strokeWidth='3' strokeLinecap='round' />
      <line x1='115' y1='20' x2='115' y2='40' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
      {/* Body parts */}
      {stage >= 1 && (
        <circle cx='115' cy='55' r='15' stroke='#ef4444' strokeWidth='2.5' fill='none' className='animate-pop-in' />
      )}
      {stage >= 2 && (
        <line x1='115' y1='70' x2='115' y2='120' stroke='#ef4444' strokeWidth='2.5' strokeLinecap='round' className='animate-pop-in' />
      )}
      {stage >= 3 && (
        <line x1='115' y1='82' x2='90' y2='108' stroke='#ef4444' strokeWidth='2.5' strokeLinecap='round' className='animate-pop-in' />
      )}
      {stage >= 4 && (
        <line x1='115' y1='82' x2='140' y2='108' stroke='#ef4444' strokeWidth='2.5' strokeLinecap='round' className='animate-pop-in' />
      )}
      {stage >= 5 && (
        <line x1='115' y1='120' x2='90' y2='155' stroke='#ef4444' strokeWidth='2.5' strokeLinecap='round' className='animate-pop-in' />
      )}
      {stage >= 6 && (
        <line x1='115' y1='120' x2='140' y2='155' stroke='#ef4444' strokeWidth='2.5' strokeLinecap='round' className='animate-pop-in' />
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
  /* ── Match-level state (persists across the 5 rounds) ── */
  const [roundIdx, setRoundIdx] = useState(1); // 1-based
  const [lives, setLives] = useState(3);
  const [matchScore, setMatchScore] = useState(0);
  const [roundResults, setRoundResults] = useState<('won' | 'lost' | 'pending')[]>(
    Array.from({ length: ROUNDS_PER_MATCH }, () => 'pending'),
  );
  const [hintUsedInMatch, setHintUsedInMatch] = useState(false);
  const [matchOver, setMatchOver] = useState(false);
  const [matchWon, setMatchWon] = useState(false);
  const [awaitingNext, setAwaitingNext] = useState(false); // round finished, waiting for "Lanjut"
  const matchStartTime = useRef<number>(Date.now());
  const sessionRef = useRef<any>(null);

  /* ── Per-round state ── */
  const [phrase, setPhrase] = useState('');
  const [hint, setHint] = useState('umum');
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState(0);
  const [roundDone, setRoundDone] = useState(false);
  const [won, setWon] = useState(false);
  const [statusText, setStatusText] = useState('Memuat...');
  const [statusType, setStatusType] = useState<StatusType>('info');
  const [loading, setLoading] = useState(true);
  const [letters, setLetters] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [hardShake, setHardShake] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintUsedThisRoundRef = useRef(false);

  const roundMaxWrong = ROUND_MAX_WRONG[Math.min(roundIdx, ROUNDS_PER_MATCH) - 1];
  const hintHiddenThisRound = roundIdx >= HIDDEN_HINT_FROM_ROUND;

  /* ── Background music (mirrors state into refs so the tick interval below
     never needs to be recreated) ── */
  const doneRef = useRef(false);
  const wrongRef = useRef(0);
  const loadingRef = useRef(true);
  useEffect(() => { doneRef.current = roundDone; }, [roundDone]);
  useEffect(() => { wrongRef.current = wrong; }, [wrong]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => {
    const id = setInterval(() => {
      sfx.musicTick(!doneRef.current && !loadingRef.current, wrongRef.current >= roundMaxWrong - 1 ? 1 : 0, 'hangman');
    }, 120);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundMaxWrong]);

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
        done: overrides?.done ?? roundDone,
        wrong: overrides?.wrong ?? wrong,
        score: overrides?.score ?? 0,
      };
      (window as any).__hangmanState = s;
    },
    [combo, maxCombo, comboTimeLeft, roundDone, wrong],
  );

  /* Combo timer decay */
  useEffect(() => {
    if (combo <= 0 || comboTimeLeft <= 0 || roundDone) return;
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
  }, [combo, comboTimeLeft, roundDone]);

  /* Emit state whenever combo values change */
  useEffect(() => {
    emitState();
  }, [combo, maxCombo, comboTimeLeft, roundDone, wrong, emitState]);

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

  /* ── Load a phrase for the current round (keeps match-level state intact) ── */
  const loadRoundPhrase = useCallback(async () => {
    setLoading(true);
    hintUsedThisRoundRef.current = false;
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
    setRoundDone(false);
    setWon(false);
    setAwaitingNext(false);
    setStatusText(`Ronde ${roundIdx}/${ROUNDS_PER_MATCH} — tebak cellimat pashang ini!`);
    setStatusType('success');
    setLoading(false);
    setCombo(0);
    setComboTimeLeft(0);
    lastCorrectTimeRef.current = 0;
    sfx.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateLetters, roundIdx]);

  /* ── Start a brand new 5-round match. Bumps matchGen (not just roundIdx,
     which may already be 1) so the phrase-loading effect below always
     fires exactly once, whether resuming from round 1 or round 4. ── */
  const [matchGen, setMatchGen] = useState(0);
  const startNewMatch = useCallback(() => {
    sessionRef.current = null;
    matchStartTime.current = Date.now();
    setRoundIdx(1);
    setLives(3);
    setMatchScore(0);
    setRoundResults(Array.from({ length: ROUNDS_PER_MATCH }, () => 'pending'));
    setHintUsedInMatch(false);
    setMatchOver(false);
    setMatchWon(false);
    setMaxCombo(0);
    setMatchGen((g) => g + 1);
  }, []);

  /* Single source of truth for "load a phrase": fires on mount, on every
     round advance, and on every new-match reset. */
  useEffect(() => {
    void loadRoundPhrase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, matchGen]);

  /* ── Keyboard support (desktop) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (roundDone || loading || awaitingNext) return;
      const ch = e.key.toUpperCase();
      if (ch.length === 1 && /[A-Z]/.test(ch) && letters.includes(ch)) {
        pressLetter(ch);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundDone, loading, awaitingNext, letters, used, phrase, wrong]);

  /* ── Unique phrase letters ── */
  const phraseLettersLC = [
    ...new Set(phrase.replace(/\s/g, '').toLowerCase().split('')),
  ];

  /* ── Round score (same shape as the old single-phrase formula, but scaled
     to this round's wrong-guess cap) ── */
  function calculateRoundScore(
    win: boolean,
    usedSet: Set<string>,
    wrongCount: number,
    mc: number,
    usedHintNow: boolean,
  ): number {
    const benar = phraseLettersLC.filter(
      (c) => usedSet.has(c.toUpperCase()) || usedSet.has(c),
    ).length;
    const comboBonus = mc > 1 ? mc * 5 : 0;
    return Math.max(
      0,
      benar * 10 +
        (roundMaxWrong - wrongCount) * 15 -
        wrongCount * 5 +
        (win ? 40 : 0) +
        comboBonus -
        (usedHintNow ? 30 : 0),
    );
  }

  /* ── Called once a round ends (win or the round's wrong-cap is hit).
     Advances match score/lives/roundResults and decides whether the
     match itself is over. ── */
  function finishRound(win: boolean, usedSet: Set<string>, wrongCount: number, mc: number) {
    const usedHintThisRound = hintUsedThisRoundRef.current;
    const roundScore = calculateRoundScore(win, usedSet, wrongCount, mc, usedHintThisRound);
    const newMatchScore = matchScore + roundScore;
    const newLives = win ? lives : lives - 1;
    const newResults = [...roundResults];
    newResults[roundIdx - 1] = win ? 'won' : 'lost';

    setMatchScore(newMatchScore);
    setLives(newLives);
    setRoundResults(newResults);
    setRoundDone(true);
    setWon(win);
    setAwaitingNext(true);

    const isLastRound = roundIdx >= ROUNDS_PER_MATCH;
    const matchEnds = isLastRound || newLives <= 0;

    if (win) {
      setStatusText(`🎉 Ronde ${roundIdx} berhasil! (+${roundScore} poin)`);
      setStatusType('success');
      sfx.clear();
    } else {
      setStatusText(`❌ Ronde ${roundIdx} gagal! Jawabannya: "${phrase}". Sisa nyawa: ${Math.max(0, newLives)}`);
      setStatusType('error');
      sfx.death();
    }

    if (matchEnds) {
      const roundsWon = newResults.filter((r) => r === 'won').length;
      const allWon = roundsWon === ROUNDS_PER_MATCH;
      const finisherBonus = roundsWon * 40 + (allWon ? 250 : 0);
      const finalScore = newMatchScore + finisherBonus;
      setMatchOver(true);
      setMatchWon(newLives > 0 && allWon);
      submitMatchScore(finalScore, newResults, newLives, hintUsedInMatch);
    }
  }

  /* ── Press letter ── */
  function pressLetter(ch: string) {
    if (roundDone || used.has(ch) || awaitingNext) return;

    const newUsed = new Set(used);
    newUsed.add(ch);
    setUsed(newUsed);

    const inPhrase = phrase.toUpperCase().includes(ch.toUpperCase());

    if (!inPhrase) {
      const newWrong = wrong + 1;
      setWrong(newWrong);
      sfx.hit();

      // Reset combo on wrong
      setCombo(0);
      setComboTimeLeft(0);

      // Shake effect
      clearTimeout(shakeTimerRef.current);
      setShaking(true);
      shakeTimerRef.current = setTimeout(() => setShaking(false), 450);

      if (newWrong >= roundMaxWrong) {
        setShaking(false);
        clearTimeout(shakeTimerRef.current);
        setHardShake(true);
        shakeTimerRef.current = setTimeout(() => setHardShake(false), 650);
        finishRound(false, newUsed, newWrong, maxCombo);
        return;
      }
      setStatusText(`❌ Huruf "${ch}" tidak ada! (${newWrong}/${roundMaxWrong})`);
      setStatusType('warn');
    } else {
      sfx.coin();
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
        finishRound(true, newUsed, wrong, newMax);
        return;
      }
      const comboText = newCombo > 1 ? ` 🔥 Combo x${newCombo}!` : '';
      setStatusText(`👍 Bagus! Huruf "${ch}" ada!${comboText}`);
      setStatusType('success');
    }
  }

  /* ── Lifeline: reveal one unguessed letter, once per MATCH (not per
     round) at a fixed point cost, subtracted from whichever round it's
     used in ── */
  function useHint() {
    if (hintUsedInMatch || roundDone || loading || awaitingNext) return;
    const remaining = phraseLettersLC.filter(
      (c) => !used.has(c) && !used.has(c.toUpperCase()),
    );
    if (!remaining.length) return;

    const letter = remaining[Math.floor(Math.random() * remaining.length)];
    const ch = letter.toUpperCase();
    hintUsedThisRoundRef.current = true;
    setHintUsedInMatch(true);
    const newUsed = new Set(used);
    newUsed.add(ch);
    setUsed(newUsed);
    setStatusText(`💡 Hint dipakai: huruf "${ch}" dibuka (-30 poin, hanya sekali per match)`);
    setStatusType('info');
    sfx.pop();

    const allFound = phraseLettersLC.every(
      (c) => newUsed.has(c.toUpperCase()) || newUsed.has(c),
    );
    if (allFound) {
      finishRound(true, newUsed, wrong, maxCombo);
    }
  }

  async function submitMatchScore(
    finalScore: number,
    results: ('won' | 'lost' | 'pending')[],
    livesLeft: number,
    hintUsed: boolean,
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
      const roundsWon = results.filter((r) => r === 'won').length;
      await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          game: 'hangman',
          score: finalScore,
          meta: {
            roundsWon,
            roundsPlayed: results.filter((r) => r !== 'pending').length,
            livesLeft: Math.max(0, livesLeft),
            hintUsed,
            durationSec: Math.floor((Date.now() - matchStartTime.current) / 1000),
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
          <div key={wi} className='flex gap-1 sm:gap-1.5'>
            {word.split('').map((ch, ci) => {
              const revealed =
                used.has(ch) || used.has(ch.toLowerCase()) || roundDone;
              return (
                <div
                  key={ci}
                  className={cn(
                    'w-7 h-9 sm:w-9 sm:h-11 flex items-center justify-center border-b-2 font-bold text-lg sm:text-xl transition-all duration-300',
                    revealed
                      ? won
                        ? 'border-green-400 text-green-700 dark:text-green-300'
                        : roundDone
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

  /* ── Round-result pips (5 dots showing won/lost/pending) ── */
  function renderRoundPips() {
    return (
      <div className='flex items-center gap-1.5'>
        {roundResults.map((r, i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center text-[9px] font-bold transition-colors',
              r === 'won' && 'bg-green-500 border-green-600 text-white',
              r === 'lost' && 'bg-red-500 border-red-600 text-white',
              r === 'pending' && i === roundIdx - 1 && !matchOver && 'border-primary text-primary animate-pulse',
              r === 'pending' && (i !== roundIdx - 1 || matchOver) && 'border-muted-foreground/30 text-muted-foreground/40',
            )}
          >
            {r === 'won' ? '✓' : r === 'lost' ? '✕' : i + 1}
          </div>
        ))}
      </div>
    );
  }

  /* ── Render ── */
  if (matchOver) {
    const roundsWon = roundResults.filter((r) => r === 'won').length;
    return (
      <div className='relative space-y-4 text-center py-6'>
        {matchWon && <Confetti />}
        <div className='text-4xl'>{matchWon ? '🏆' : lives <= 0 ? '💀' : '🏁'}</div>
        <h2 className='text-xl font-bold'>
          {matchWon ? 'Match Sempurna!' : lives <= 0 ? 'Nyawa Habis!' : 'Match Selesai'}
        </h2>
        <div className='flex justify-center'>{renderRoundPips()}</div>
        <p className='text-sm text-muted-foreground'>
          Ronde menang: <span className='font-bold text-foreground'>{roundsWon}/{ROUNDS_PER_MATCH}</span> · Sisa nyawa:{' '}
          <span className='font-bold text-foreground'>{Math.max(0, lives)}/3</span>
        </p>
        <div className='inline-block rounded-xl border border-border bg-card px-6 py-3'>
          <p className='text-xs text-muted-foreground'>Total Skor Match</p>
          <p className='text-2xl font-bold'>{matchScore + roundsWon * 40 + (matchWon ? 250 : 0)}</p>
        </div>
        <div>
          <Button onClick={startNewMatch} className='w-full sm:w-auto'>
            🔁 Main Match Baru
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative space-y-3 sm:space-y-4', shaking && 'animate-shake', hardShake && 'animate-shake-hard')}>
      {/* Match progress header */}
      <div className='flex items-center justify-between gap-2'>
        {renderRoundPips()}
        <div className='flex items-center gap-1'>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={cn('text-sm', i < lives ? 'opacity-100' : 'opacity-20')}>❤️</span>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className={cn('rounded-xl border px-4 py-3 transition-all duration-300', STATUS_STYLE[statusType])}>
        <p className='text-sm font-medium'>{statusText}</p>
      </div>

      {/* Hint badge - compact */}
      <div className='flex items-center gap-2'>
        <span className='text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted border border-border'>
          🏷️ {hintHiddenThisRound ? '??? (kategori tersembunyi)' : hint}
        </span>
        {!loading && (
          <button
            onClick={useHint}
            disabled={hintUsedInMatch || roundDone || awaitingNext}
            className={cn(
              'text-xs px-2 py-1 rounded-md border transition-colors',
              hintUsedInMatch || roundDone || awaitingNext
                ? 'bg-muted text-muted-foreground/50 border-border cursor-not-allowed'
                : 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-500/40 hover:bg-amber-200 dark:hover:bg-amber-900/40 cursor-pointer',
            )}
          >
            💡 Buka 1 Huruf (-30, 1x/match)
          </button>
        )}
      </div>

      {/* Hangman SVG + Word display */}
      {loading ? (
        <div className='text-center py-10 text-muted-foreground animate-pulse'>
          Memuat kata...
        </div>
      ) : (
        <div className='flex items-start gap-3'>
          <HangmanSVG wrong={wrong} maxWrong={roundMaxWrong} />
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
                disabled={isUsed || roundDone || awaitingNext}
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
          Kesalahan: <span className='font-bold'>{wrong}/{roundMaxWrong}</span>
        </div>
        <div className='rounded-lg bg-card border border-border px-3 py-2 text-sm'>
          Skor match: <span className='font-bold'>{matchScore}</span>
        </div>
        <div className='rounded-lg bg-card border border-border px-3 py-2 text-sm flex-1 min-w-0 truncate'>
          Huruf terpakai: {used.size ? [...used].join(', ') : '-'}
        </div>
      </div>

      {/* Next round / restart */}
      {awaitingNext ? (
        <Button
          onClick={() => setRoundIdx((r) => r + 1)}
          className='w-full sm:w-auto'
        >
          ➡️ Lanjut ke Ronde {roundIdx + 1}
        </Button>
      ) : (
        <Button
          onClick={startNewMatch}
          disabled={loading}
          className='w-full sm:w-auto'
          variant='outline'
        >
          🔁 Ulangi Match
        </Button>
      )}
    </div>
  );
}
