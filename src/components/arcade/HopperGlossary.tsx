import { ReactNode } from 'react';
import { HelpCircle, Heart, Snowflake, Star, Clock, Skull, Crown, Car, Waves, ShieldCheck, Zap } from 'lucide-react';

/**
 * HopperGlossary — in-game help / FAQ modal for "Waran Ingkang Kapundut".
 * Triggered from the ArcadeShell header (the ? button). Covers:
 *   • Karakter (pig, perempuan cantik, Yan, mobil, buaya)
 *   • Cara main (kontrol, goal)
 *   • Sistem skor (tiap aksi = berapa poin)
 *   • Power-up (4 jenis, durasi, efek)
 *   • Event Yan (apa, kapan, bonus)
 *   • Dialog rayuan (list)
 *   • TIPS pro
 *
 * Updated whenever the game's mechanics change — single source of truth for
 * the player-facing help text. (Last sync: 2026-07-16.)
 */

type Row = { icon: ReactNode; label: string; detail: ReactNode };

const KARAKTER: Row[] = [
  {
    icon: <span className="text-pink-300 text-base">🐷</span>,
    label: 'Babi (kamu)',
    detail: (
      <>
        Karakter utama. Lompat maju (tap / panah atas), mundur (panah bawah),
        dan ke samping (kiri / kanan). Misi: <b>rayu 5 perempuan cantik</b> di
        seberang sungai sebelum waktu habis.
      </>
    ),
  },
  {
    icon: <Crown className="h-4 w-4 text-amber-300" />,
    label: '5 Perempuan Cantik',
    detail: (
      <>
        Goal slot di baris paling atas. Capai salah satu dari 5 slot kosong
        untuk memenangkan hati. Bawa pulang kelimanya untuk naik level.
      </>
    ),
  },
  {
    icon: <span className="text-base">👹</span>,
    label: 'Yan (Event Spesial)',
    detail: (
      <>
        Karakter musuh yang muncul tiba-tiba di mana saja (acak, setiap 18–32
        detik). Dia selalu berteriak{' '}
        <span className="text-red-300">"War No No aaa No No War"</span>.
        Tangkap dia dalam waktu 7 detik → bonus{' '}
        <span className="text-amber-300 font-bold">500 × level</span> poin.
        Bisa sahuti dengan salah satu rayuan (lihat daftar di bawah).
      </>
    ),
  },
  {
    icon: <Car className="h-4 w-4 text-red-300" />,
    label: 'Mobil',
    detail: (
      <>
        Ada di 5 lajur jalan (row 6–10). Warna & kecepatan acak. Tabrak =
        mati (kecuali pakai Perisai Cinta). Hindari!
      </>
    ),
  },
  {
    icon: <Waves className="h-4 w-4 text-cyan-300" />,
    label: 'Sungai + Log / Buaya',
    detail: (
      <>
        Ada di 4 lajur sungai (row 2–5). Wajib naik log / buaya — kalau jatuh
        ke air, mati. Buaya bisa bergerak, lebih cepat, dan bisa menabrak
        kamu.
      </>
    ),
  },
];

const POWERUPS: Row[] = [
  {
    icon: <Heart className="h-4 w-4 text-pink-300" />,
    label: 'Perisai Cinta (shield)',
    detail: (
      <>
        Muncul di salah satu lajur tengah. Ambil dengan jalan ke lokasinya.
        Aktif <b>8 detik</b> — menabrak mobil tidak bikin mati, hanya bounce.
        Pesan: <span className="text-pink-300">"PERISAI CINTA!"</span>
      </>
    ),
  },
  {
    icon: <Snowflake className="h-4 w-4 text-cyan-300" />,
    label: 'Bekuin Mereka (freeze)',
    detail: (
      <>
        Aktif <b>8 detik</b> — semua mobil & buaya diam beku, sungai berhenti.
        Pakai ini untuk menyebrang dengan tenang. Pesan:{' '}
        <span className="text-cyan-300">"BEKUIN MEREKA!"</span>
      </>
    ),
  },
  {
    icon: <Star className="h-4 w-4 text-amber-300" />,
    label: 'x2 Double Score',
    detail: (
      <>
        Aktif <b>8 detik</b> — semua skor dikalikan 2 (kenaikan row = 20
        poin, catch goal dapat multiplier tambahan). Pesan:{' '}
        <span className="text-amber-300">"x2 DOUBLE SCORE!"</span>
      </>
    ),
  },
  {
    icon: <Clock className="h-4 w-4 text-emerald-300" />,
    label: '+10 Detik',
    detail: (
      <>
        Tidak aktif berkepanjangan — langsung menambah{' '}
        <span className="text-emerald-300 font-bold">+10 detik</span> ke
        timer (maks 40). Pesan:{' '}
        <span className="text-emerald-300">"+10 DETIK!"</span>
      </>
    ),
  },
];

const SCORING: Row[] = [
  {
    icon: <Zap className="h-4 w-4 text-amber-300" />,
    label: 'Naik 1 row (maju)',
    detail: <>+<b>10</b> poin (atau <b>20</b> kalau Double Score aktif).</>,
  },
  {
    icon: <Crown className="h-4 w-4 text-pink-300" />,
    label: 'Rayu 1 perempuan',
    detail: (
      <>
        Formula:{' '}
        <span className="font-mono text-amber-300">
          round(100 × level × combo_mult × (2 kalau Double)) + timeLeft × 5
        </span>
        . Combo naik tiap goal berurutan (max 4×). Time bonus = detik sisa × 5.
      </>
    ),
  },
  {
    icon: <span className="text-base">👹</span>,
    label: 'Tangkap Yan',
    detail: (
      <>
        Bonus flat: <b className="text-amber-300">500 × level</b> poin.
        Plus pig auto-blush + bubble{' '}
        <span className="text-pink-300">"Auuww Jleb Jleeb"</span>.
      </>
    ),
  },
  {
    icon: <ShieldCheck className="h-4 w-4 text-emerald-300" />,
    label: 'Selesaikan 1 level',
    detail: (
      <>
        Bonus: <b>1000 + (level × 200)</b> poin. Level naik 1, semua goal
        reset.
      </>
    ),
  },
  {
    icon: <Skull className="h-4 w-4 text-red-300" />,
    label: 'Mati',
    detail: (
      <>
        Nyawa –1. Mulai dari <b>3 nyawa</b> (ikon tengkorak). Nyawa 0 ={' '}
        <b>GAME OVER</b>. Skor terakhir masuk leaderboard (kalau login).
      </>
    ),
  },
];

const RAYUAN_LIST = [
  'HI CANTIK! AKU PUNYA KEBON CABE LO',
  'MINTA NOMOR WA-NYA DONG',
  'SENYUM DONG SAYANG, KAMU CANTIK BANGET',
  'BIDADARI DARI SURGA? AKU SUKA SAMA KAMU',
  'KAMU KAYAK TV, SINYALNYA SAMPE HATI',
  'APA KAMU KOPI? SOALNYA BIKIN GAK TIDUR',
  'KAMU MATAHARI? KALO GAK ADA KAMU GELAP GINI',
  'POSESIF BOLEH? SOALNYA AKU CEMAS KAMU DIREBUT',
  'AKU LELAH, SOALNYA BERJUTA JAUH DARI KAMU',
  'KAMU KUNCI? SOALNYA BIKIN HATI TERKUNCI',
  'KAMU BURUNG, PANTES SUARANYA MERDU DI TELINGA',
  'KAMU TUH BAHAYA, SOALNYA BIKIN KECANDUAN',
  'KAMU INTERNET? SOALNYA GAK BISA JAUH DARI KAMU',
  'KAMU TUH PAHIT, TAPI OBAT BUAT AKU',
];

const YAN_REPLY_LIST = [
  { line: 'Asu kau Yan', weight: '50%' },
  { line: '18 mm is the best', weight: '8%' },
  { line: 'KEBUN CABEKU LHO YAN', weight: '8%' },
  { line: 'MINTA NOMOR WA-NYA DONG YAN', weight: '7%' },
  { line: 'KIRIM WA KE AKU YAA YAN', weight: '6%' },
  { line: 'AKU SIH SUKA TANAM CABE RAWIT', weight: '6%' },
  { line: '18 CM? NGGAK, 18 MM ITU YANG PALING PAS', weight: '5%' },
  { line: 'CABE RAWIT KAYAK KAMU, PEDAS BANGET', weight: '4%' },
  { line: 'WHATSAPP AKU, NO COPAS', weight: '4%' },
  { line: '18 MM IMPERIAL, YANG LAIN BONCOS', weight: '4%' },
];

const TIPS: Row[] = [
  {
    icon: <span className="text-base">💡</span>,
    label: 'Prioritaskan Freeze dulu',
    detail: (
      <>
        Bekuin mobil & buaya = 8 detik bebas nyebrang. Ambil{' '}
        <Snowflake className="inline h-3 w-3 text-cyan-300" /> begitu
        terlihat.
      </>
    ),
  },
  {
    icon: <span className="text-base">💡</span>,
    label: 'Jangan mati saat ada Yan',
    detail: (
      <>
        Yan despawn otomatis setelah 7 detik. Kalau lagi banyak mobil di
        depan, fokus survive dulu — Yan akan datang lagi 18–32 detik
        kemudian.
      </>
    ),
  },
  {
    icon: <span className="text-base">💡</span>,
    label: 'Kombo ×4 + Double Score',
    detail: (
      <>
        Kalau punya Double Score + combo 4 = multiplier 8× per goal.
        Prioritaskan rayu 5 perempuan berturut-turut tanpa mati.
      </>
    ),
  },
  {
    icon: <span className="text-base">💡</span>,
    label: 'Bubble dialog adaptif',
    detail: (
      <>
        Bubble rayuan babi pindah posisi otomatis — di atas kalau babi di
        bawah, di bawah kalau babi di atas. Bubble Yan juga adaptif, supaya
        nggak nutupin layar.
      </>
    ),
  },
];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-cyan-300 text-xs font-bold uppercase tracking-[0.2em] border-b border-cyan-400/20 pb-1">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-snug">
            <span className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center">
              {r.icon}
            </span>
            <span>
              <span className="text-white font-semibold">{r.label}</span>{' '}
              <span className="text-cyan-200/70">— {r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HopperGlossary({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] bg-[#0c0a26] border-2 border-cyan-400/40 rounded-lg shadow-[0_0_40px_rgba(34,211,238,0.15)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-cyan-400/30 bg-gradient-to-r from-cyan-400/10 via-transparent to-amber-400/10">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-cyan-300" />
            <h2 className="text-cyan-200 text-sm font-bold tracking-wider uppercase">
              Waran Ingkang Kapundut — Glossary
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup glossary"
            className="h-7 w-7 rounded border border-cyan-400/30 bg-black/40 text-cyan-200/80 hover:bg-cyan-400/20 hover:text-cyan-100 text-sm font-bold active:scale-95 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-cyan-100">
          {/* Quick how-to */}
          <div className="text-[11px] leading-snug bg-cyan-400/5 border border-cyan-400/20 rounded px-2.5 py-2">
            <span className="text-cyan-300 font-bold">Cara main:</span>{' '}
            Lompat maju (tap / panah atas), mundur (panah bawah), ke samping
            (kiri / kanan). Seberangi 5 lajur mobil + 4 lajur sungai. Capai
            salah satu dari 5 slot goal di atas. Ada <b>40 detik</b> per level,
            <b> 3 nyawa</b>. Habiskan semua goal = naik level + bonus besar.
          </div>

          <Section title="Karakter" rows={KARAKTER} />

          <Section title="Sistem Skor" rows={SCORING} />

          <Section title="Power-Up" rows={POWERUPS} />

          {/* Event Yan */}
          <div className="space-y-1.5">
            <h3 className="text-cyan-300 text-xs font-bold uppercase tracking-[0.2em] border-b border-cyan-400/20 pb-1">
              Event Yan
            </h3>
            <p className="text-[11px] text-cyan-200/80 leading-snug">
              Yan muncul acak setiap <b>18–32 detik</b> di salah satu dari 12
              baris (bisa di jalan, sungai, atau bahkan baris goal). Dia
              selalu bilang{' '}
              <span className="text-red-300 font-bold">
                "War No No aaa No No War"
              </span>
              . Tangkap dalam <b>7 detik</b> → bonus <b>500 × level</b> poin.
              Babi akan auto-sahut dengan salah satu baris berikut (acak,
              weighted):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {YAN_REPLY_LIST.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 border border-pink-400/15 rounded px-2 py-1 bg-pink-400/5"
                >
                  <span className="text-pink-200 truncate">"{r.line}"</span>
                  <span className="text-amber-300 font-mono shrink-0">
                    {r.weight}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-cyan-200/60 italic">
              Bubble Yan ADAPTIF: kalau Yan di baris atas → bubble di bawah;
              kalau Yan di baris bawah → bubble di atas. Supaya nggak nutup
              layar.
            </p>
          </div>

          {/* Daftar rayuan */}
          <div className="space-y-1.5">
            <h3 className="text-cyan-300 text-xs font-bold uppercase tracking-[0.2em] border-b border-cyan-400/20 pb-1">
              Daftar Rayuan Babi ({RAYUAN_LIST.length} baris)
            </h3>
            <p className="text-[11px] text-cyan-200/70 mb-1.5">
              Tampil acak di bubble babi setiap beberapa detik saat main.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px]">
              {RAYUAN_LIST.map((r, i) => (
                <li
                  key={i}
                  className="border border-pink-400/15 rounded px-2 py-1 bg-pink-400/5 text-pink-200"
                >
                  {i + 1}. "{r}"
                </li>
              ))}
            </ul>
          </div>

          <Section title="Tips Pro" rows={TIPS} />

          <p className="text-[10px] text-cyan-200/40 italic text-center pt-2">
            Glossary ini selalu di-update kalau ada perubahan mekanik.
          </p>
        </div>
      </div>
    </div>
  );
}