import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Shield,
  Settings,
  Zap,
  MessageSquare,
  ListChecks,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Activity,
  Send,
  Cherry,
  HelpCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X,
  Trophy,
  Archive,
  RotateCcw,
  Users,
  KeyRound,
  Award,
  Download,
  Upload,
  BarChart3,
} from 'lucide-react';

/* ── Fruit Ninja setting definitions with descriptions ── */
interface FNSettingDef {
  key: string;
  label: string;
  desc: string;
  type: 'number' | 'array-number';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const FN_SETTINGS: FNSettingDef[] = [
  {
    key: 'lives',
    label: 'Nyawa Awal',
    desc: 'Jumlah nyawa pemain di awal game. Nyawa berkurang saat buah missed atau bom tersentuh.',
    type: 'number',
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'fruitSize',
    label: 'Ukuran Buah (px)',
    desc: 'Ukuran emoji buah dalam pixel. Makin besar = lebih gampang di-tap di HP. Default 52px cukup untuk jari tangan.',
    type: 'number',
    min: 24,
    max: 100,
    step: 2,
    unit: 'px',
  },
  {
    key: 'fruitHitRadius',
    label: 'Radius Hit Detection (px)',
    desc: 'Radius area sentuh di sekitar buah yang masih dihitung sebagai "kena". Makin besar = makin toleran untuk jari besar.',
    type: 'number',
    min: 16,
    max: 80,
    step: 2,
    unit: 'px',
  },
  {
    key: 'gravityBase',
    label: 'Gravitasi Dasar',
    desc: 'Kecepatan buah jatuh ke bawah. Makin kecil = buah melayang lebih lama, player punya waktu lebih lama untuk mengiris.',
    type: 'number',
    min: 100,
    max: 500,
    step: 10,
  },
  {
    key: 'launchSpeedMin',
    label: 'Kecepatan Lempar Minimum',
    desc: 'Kecepatan lempar terendah (ke atas). Makin kecil = buah ngga terlalu tinggi, mudah dijangkau di HP kecil.',
    type: 'number',
    min: 150,
    max: 500,
    step: 10,
  },
  {
    key: 'launchSpeedMax',
    label: 'Kecepatan Lempar Maksimum',
    desc: 'Kecepatan lempar tertinggi (ke atas). Makin besar = buah bisa terbang sangat tinggi, mungkin keluar layar.',
    type: 'number',
    min: 200,
    max: 700,
    step: 10,
  },
  {
    key: 'safeBombDistance',
    label: 'Jarak Aman Bom (px)',
    desc: 'Jarak minimum antara bom dan buah saat spawn. Supaya fair — bom tidak muncul terlalu dekat buah sehingga sulit dihindari.',
    type: 'number',
    min: 30,
    max: 200,
    step: 5,
    unit: 'px',
  },
  {
    key: 'stageSeconds',
    label: 'Batas Waktu Stage (detik)',
    desc: 'Waktu perpindahan stage dalam detik. Contoh: [60, 150, 240] artinya Stage 2 mulai di 60s, Stage 3 di 150s, Stage 4 di 240s. Makin banyak stage = game makin sulit seiring waktu.',
    type: 'array-number',
  },
  {
    key: 'maxByStage',
    label: 'Max Objek Aktif per Stage',
    desc: 'Jumlah maksimum buah + bom yang bisa ada di layar bersamaan, per stage. Contoh: [5, 7, 9, 11]. Makin banyak = layar makin ramai, lebih sulit fokus.',
    type: 'array-number',
  },
  {
    key: 'gapByStage',
    label: 'Jeda Spawn per Stage (ms)',
    desc: 'Jeda waktu antar burst spawn dalam milidetik, per stage. Contoh: [1000, 850, 700, 580]. Makin kecil = buah muncul makin sering, lebih cepat & sulit.',
    type: 'array-number',
  },
  {
    key: 'burstMin',
    label: 'Burst Minimum per Stage',
    desc: 'Jumlah minimum buah yang dilempar dalam satu burst (satu gelombang spawn). Per stage. Contoh: [1, 1, 1, 1].',
    type: 'array-number',
  },
  {
    key: 'burstMax',
    label: 'Burst Maksimum per Stage',
    desc: 'Jumlah maksimum buah yang dilempar dalam satu burst. Contoh: [2, 2, 3, 4]. Stage akhir bisa 4 buah sekaligus = lebih hectic.',
    type: 'array-number',
  },
  {
    key: 'weirdChance',
    label: 'Peluang Sayuran Aneh per Stage',
    desc: 'Probabilitas (0-1) munculnya sayuran "aneh" (bawang, brokoli, dll) alih-alih buah biasa. Contoh: [0.06, 0.1, 0.14, 0.18]. Sayuran aneh lebih susah dikenali tapi tetap dihitung skor.',
    type: 'array-number',
  },
  {
    key: 'bombBase',
    label: 'Peluang Bom per Stage',
    desc: 'Probabilitas (0-1) munculnya bom tiap kali spawn. Contoh: [0.08, 0.1, 0.12, 0.15]. Makin tinggi = makin banyak bom = game lebih sulit karena harus menghindari.',
    type: 'array-number',
  },
];

/* ── Presets for Fruit Ninja ── */
interface FNPreset {
  name: string;
  desc: string;
  cfg: Record<string, unknown>;
}

const FN_PRESETS: FNPreset[] = [
  {
    name: '🧒 Anak-anak / Pemula',
    desc: 'Buah besar, lambat, sedikit bom. Sangat mudah untuk anak-anak & pemula.',
    cfg: {
      lives: 5,
      fruitSize: 64,
      fruitHitRadius: 48,
      gravityBase: 170,
      launchSpeedMin: 220,
      launchSpeedMax: 340,
      safeBombDistance: 120,
      stageSeconds: [90, 200, 300],
      maxByStage: [4, 5, 6, 7],
      gapByStage: [1200, 1050, 900, 780],
      burstMin: [1, 1, 1, 1],
      burstMax: [1, 2, 2, 3],
      weirdChance: [0.03, 0.05, 0.08, 0.1],
      bombBase: [0.05, 0.06, 0.08, 0.1],
    },
  },
  {
    name: '📱 Mobile Friendly (Default)',
    desc: 'Balanced untuk main di HP. Buah cukup besar, kecepatan sedang, bom wajar.',
    cfg: {
      lives: 3,
      fruitSize: 52,
      fruitHitRadius: 38,
      gravityBase: 220,
      launchSpeedMin: 280,
      launchSpeedMax: 420,
      safeBombDistance: 90,
      stageSeconds: [60, 120, 180, 240, 330, 420],
      maxByStage: [5, 6, 8, 10, 12, 14, 16],
      gapByStage: [1000, 880, 750, 620, 500, 400, 320],
      burstMin: [1, 1, 1, 1, 2, 2, 2],
      burstMax: [2, 2, 3, 4, 5, 6, 7],
      weirdChance: [0.06, 0.08, 0.12, 0.15, 0.18, 0.22, 0.25],
      bombBase: [0.06, 0.08, 0.1, 0.13, 0.16, 0.2, 0.24],
    },
  },
  {
    name: '🎮 Normal / Desktop',
    desc: 'Pengalaman standar untuk laptop/desktop. Buah lebih kecil, agak cepat.',
    cfg: {
      lives: 3,
      fruitSize: 44,
      fruitHitRadius: 30,
      gravityBase: 260,
      launchSpeedMin: 320,
      launchSpeedMax: 470,
      safeBombDistance: 70,
      stageSeconds: [50, 120, 200],
      maxByStage: [6, 8, 10, 13],
      gapByStage: [850, 720, 600, 480],
      burstMin: [1, 1, 1, 1],
      burstMax: [2, 3, 4, 5],
      weirdChance: [0.06, 0.1, 0.14, 0.18],
      bombBase: [0.1, 0.12, 0.14, 0.17],
    },
  },
  {
    name: '🔥 Hard / Kompetitif',
    desc: 'Untuk pro player. Buah kecil, cepat, banyak bom, jeda pendek.',
    cfg: {
      lives: 2,
      fruitSize: 38,
      fruitHitRadius: 26,
      gravityBase: 310,
      launchSpeedMin: 370,
      launchSpeedMax: 540,
      safeBombDistance: 50,
      stageSeconds: [40, 90, 160],
      maxByStage: [7, 10, 13, 16],
      gapByStage: [700, 560, 440, 350],
      burstMin: [1, 2, 2, 2],
      burstMax: [3, 4, 5, 7],
      weirdChance: [0.08, 0.14, 0.2, 0.25],
      bombBase: [0.12, 0.16, 0.2, 0.24],
    },
  },
  {
    name: '😈 Impossible',
    desc: 'Hanya untuk yang berani! 1 nyawa, buah kecil & cepat, bom dimana-mana.',
    cfg: {
      lives: 1,
      fruitSize: 34,
      fruitHitRadius: 22,
      gravityBase: 360,
      launchSpeedMin: 420,
      launchSpeedMax: 600,
      safeBombDistance: 35,
      stageSeconds: [30, 70, 120],
      maxByStage: [8, 12, 16, 20],
      gapByStage: [550, 420, 330, 260],
      burstMin: [2, 2, 3, 3],
      burstMax: [4, 5, 7, 9],
      weirdChance: [0.1, 0.18, 0.25, 0.3],
      bombBase: [0.18, 0.22, 0.28, 0.35],
    },
  },
];

/* ── Default FN config ("Mobile Friendly" preset) ── */
const DEFAULT_FN_CONFIG: Record<string, any> = {
  lives: 3,
  fruitSize: 56,
  fruitHitRadius: 44,
  gravityBase: 220,
  launchSpeedMin: 280,
  launchSpeedMax: 420,
  safeBombDistance: 90,
  stageSeconds: [60, 120, 180, 240, 330, 420],
  maxByStage: [5, 6, 8, 10, 12, 14, 16],
  gapByStage: [1000, 880, 750, 620, 500, 400, 320],
  burstMin: [1, 1, 1, 1, 2, 2, 2],
  burstMax: [2, 2, 3, 4, 5, 6, 7],
  weirdChance: [0.06, 0.08, 0.12, 0.15, 0.18, 0.22, 0.25],
  bombBase: [0.06, 0.08, 0.1, 0.13, 0.16, 0.2, 0.24],
};

/* ── Snake difficulty settings ── */
const SNAKE_DIFFICULTIES = [
  'gampang',
  'sedang',
  'susah',
  'gak-ngotak',
] as const;

interface SnakeDiffSetting {
  key: string;
  label: string;
  desc: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const SNAKE_DIFF_SETTINGS: SnakeDiffSetting[] = [
  {
    key: 'speed',
    label: 'Kecepatan (ms/tick)',
    desc: 'Milidetik per langkah ular. Makin kecil = makin cepat.',
    type: 'number',
    min: 30,
    max: 300,
    step: 5,
    unit: 'ms',
  },
  {
    key: 'walls',
    label: 'Dinding',
    desc: 'Jika aktif, ular mati saat tabrak dinding. Jika mati, ular tembus ke sisi sebaliknya.',
    type: 'boolean',
  },
  {
    key: 'obstacles',
    label: 'Jumlah Rintangan',
    desc: 'Jumlah blok rintangan di arena. 0 = tidak ada rintangan.',
    type: 'number',
    min: 0,
    max: 40,
    step: 1,
  },
  {
    key: 'scoreMin',
    label: 'Skor Min (per makanan)',
    desc: 'Skor minimum random per makanan dimakan.',
    type: 'number',
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: 'scoreMax',
    label: 'Skor Max (per makanan)',
    desc: 'Skor maksimum random per makanan dimakan.',
    type: 'number',
    min: 1,
    max: 200,
    step: 1,
  },
  {
    key: 'comboWindowMs',
    label: 'Combo Window (ms)',
    desc: 'Waktu jeda sebelum combo reset. Makin besar = lebih mudah jaga combo.',
    type: 'number',
    min: 500,
    max: 10000,
    step: 100,
    unit: 'ms',
  },
  {
    key: 'foodTimerMs',
    label: 'Food Timer (ms)',
    desc: 'Waktu sebelum makanan spesial hilang. 0 = tidak hilang.',
    type: 'number',
    min: 0,
    max: 30000,
    step: 500,
    unit: 'ms',
  },
];

const DEFAULT_SNAKE_DIFFICULTY: Record<string, any> = {
  gampang: {
    speed: 160,
    walls: false,
    obstacles: 0,
    scoreMin: 3,
    scoreMax: 8,
    comboWindowMs: 3500,
    foodTimerMs: 0,
  },
  sedang: {
    speed: 120,
    walls: true,
    obstacles: 4,
    scoreMin: 7,
    scoreMax: 15,
    comboWindowMs: 3000,
    foodTimerMs: 8000,
  },
  susah: {
    speed: 85,
    walls: true,
    obstacles: 10,
    scoreMin: 15,
    scoreMax: 30,
    comboWindowMs: 2500,
    foodTimerMs: 6000,
  },
  'gak-ngotak': {
    speed: 55,
    walls: true,
    obstacles: 20,
    scoreMin: 30,
    scoreMax: 70,
    comboWindowMs: 2000,
    foodTimerMs: 4000,
  },
};

/* ── Collapsible Section (extracted to avoid remount on parent re-render → fixes scroll-to-top bug) ── */
function Section({
  icon: Icon,
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        className='cursor-pointer select-none'
        onClick={onToggle}
      >
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <Icon className='h-5 w-5' />
            {title}
            {badge && (
              <Badge
                variant='secondary'
                className='ml-2'
              >
                {badge}
              </Badge>
            )}
          </CardTitle>
          {open ? (
            <ChevronUp className='h-5 w-5' />
          ) : (
            <ChevronDown className='h-5 w-5' />
          )}
        </div>
      </CardHeader>
      {open && <CardContent className='space-y-4'>{children}</CardContent>}
    </Card>
  );
}

/* ── Password field with eye toggle ── */
function PasswordInput({
  value,
  onChange,
  placeholder,
  show,
  onToggle,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  show: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <div className='relative'>
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`pr-10 ${className || ''}`}
      />
      <button
        type='button'
        onClick={onToggle}
        className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors'
        tabIndex={-1}
      >
        {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
      </button>
    </div>
  );
}

/* ── Component ── */
export function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [required, setRequired] = useState(false);
  const [password, setPassword] = useState(
    () => sessionStorage.getItem('__adminPw') || '',
  );
  const [loading, setLoading] = useState(true);

  // AI settings
  const [aiModel, setAiModel] = useState('o4-mini');
  const [aiKey, setAiKey] = useState('');
  const [hasAiKey, setHasAiKey] = useState(false);

  // WAHA settings
  const [wahaUrl, setWahaUrl] = useState('https://waha.syaefulaz.online/');
  const [wahaKey, setWahaKey] = useState('c024b28d55034cb9b674ef62fadfe641');
  const [wahaSession, setWahaSession] = useState('KutuLoncat');
  const [hasWahaKey, setHasWahaKey] = useState(false);
  const [hasWahaUrl, setHasWahaUrl] = useState(false);
  const [wahaDiag, setWahaDiag] = useState<any>(null);
  const [wahaDiagLoading, setWahaDiagLoading] = useState(false);
  const [wahaTestPhone, setWahaTestPhone] = useState('+6283131372021');
  const [wahaTestMsg, setWahaTestMsg] = useState(
    'Test pesan dari Admin KutuLoncat 🎮',
  );
  const [wahaTestResult, setWahaTestResult] = useState<{
    status: number;
    body: any;
  } | null>(null);
  const [wahaTestLoading, setWahaTestLoading] = useState(false);

  // Show/hide toggles for sensitive fields
  const [showWahaUrl, setShowWahaUrl] = useState(false);
  const [showWahaKey, setShowWahaKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);

  // Phrase management
  const [phrases, setPhrases] = useState<any[]>([]);
  const [phrasesLoading, setPhrasesLoading] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [newHint, setNewHint] = useState('roast');
  const [phraseSearch, setPhraseSearch] = useState('');

  // Phrase generation
  const [genCount, setGenCount] = useState(100);
  const [genPrompt, setGenPrompt] = useState(
    'roast user, galau, dark joke, romantis receh',
  );
  const [generating, setGenerating] = useState(false);
  const [stagedPhrases, setStagedPhrases] = useState<any[]>([]);

  // Fruit Ninja config
  const [fnConfig, setFnConfig] = useState<Record<string, any>>({});
  const [fnSaving, setFnSaving] = useState(false);

  // Snake config (per-difficulty)
  const [snakeConfig, setSnakeConfig] = useState<Record<string, any>>({
    difficulties: JSON.parse(JSON.stringify(DEFAULT_SNAKE_DIFFICULTY)),
  });
  const [snakeSaving, setSnakeSaving] = useState(false);

  // Score seasons
  const [seasons, setSeasons] = useState<any[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonDetail, setSeasonDetail] = useState<any>(null);
  const [seasonDetailLoading, setSeasonDetailLoading] = useState(false);

  // Reset confirmation
  const [clearAch, setClearAch] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    'clear' | 'save-reset' | null
  >(null);
  const [confirmInput, setConfirmInput] = useState('');

  // Achievement management
  const [achData, setAchData] = useState<{
    total: number;
    users: number;
    achievements: any[];
  }>({ total: 0, users: 0, achievements: [] });
  const [achLoading, setAchLoading] = useState(false);

  // ── User Management state ──
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // ── Referral state ──
  const [referralData, setReferralData] = useState<any>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // ── Statistics state ──
  const [adminStats, setAdminStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    stats: true,
    phrases: false,
    fruitNinja: false,
    snake: false,
    scores: false,
    users: false,
    referrals: false,
    ai: false,
    waha: false,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const headers = useCallback(
    (): Record<string, string> =>
      password ? { 'X-Admin-Password': password } : {},
    [password],
  );

  useEffect(() => {
    api
      .get<{ ok: boolean; required: boolean }>('/api/admin/auth-required')
      .then(async (r) => {
        setRequired(r.required);
        if (!r.required) {
          setAuthed(true);
          loadAll();
        } else if (password) {
          // Auto-auth with persisted password from sessionStorage
          try {
            const res = await fetch('/api/admin/ai-settings', {
              headers: { 'X-Admin-Password': password },
            });
            if (res.ok) {
              setAuthed(true);
              loadAll();
            }
          } catch {
            /* ignore */
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Auth ── */
  async function tryAuth() {
    try {
      const r = await fetch('/api/admin/ai-settings', { headers: headers() });
      if (r.ok) {
        sessionStorage.setItem('__adminPw', password);
        setAuthed(true);
        loadAll();
        toast.success('Admin authenticated');
      } else {
        sessionStorage.removeItem('__adminPw');
        toast.error('Password salah');
      }
    } catch {
      toast.error('Gagal koneksi');
    }
  }

  function loadAll() {
    loadSettings();
    loadPhrases();
    loadSeasons();
    loadUsers();
    loadReferrals();
    loadStats();
  }

  /* ── Settings ── */
  async function loadSettings() {
    try {
      const r = await fetch('/api/admin/settings', { headers: headers() });
      const j = await r.json();
      if (j.ok) {
        const s = j.settings || {};
        setAiModel(s.ai?.openaiModel || 'o4-mini');
        setHasAiKey(!!s.ai?.openaiApiKey && s.ai.openaiApiKey !== '');
        setWahaUrl(s.waha?.baseUrl || 'https://waha.syaefulaz.online/');
        setHasWahaUrl(!!s.waha?.baseUrl && s.waha.baseUrl !== '');
        setHasWahaKey(!!s.waha?.apiKey && s.waha.apiKey !== '');
        setWahaSession(s.waha?.session || 'KutuLoncat');
        setFnConfig({ ...DEFAULT_FN_CONFIG, ...(s.fruitNinja || {}) });
        // Snake config
        const snk = s.snake || {};
        if (snk.difficulties && typeof snk.difficulties === 'object') {
          const merged: Record<string, any> = {};
          for (const d of SNAKE_DIFFICULTIES) {
            merged[d] = {
              ...DEFAULT_SNAKE_DIFFICULTY[d],
              ...(snk.difficulties[d] || {}),
            };
          }
          setSnakeConfig({ difficulties: merged });
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const r2 = await fetch('/api/admin/ai-settings', { headers: headers() });
      const j2 = await r2.json();
      if (j2.ok) {
        setAiModel(j2.openaiModel || 'o4-mini');
        setHasAiKey(j2.hasKey);
      }
    } catch {
      /* ignore */
    }
  }

  /* ── Statistics ── */
  async function loadStats() {
    setStatsLoading(true);
    try {
      const r = await fetch('/api/admin/stats', { headers: headers() });
      const j = await r.json();
      if (j.ok) setAdminStats(j.stats);
    } catch {
      /* ignore */
    }
    setStatsLoading(false);
  }

  /* ── Phrase management ── */
  async function loadPhrases() {
    setPhrasesLoading(true);
    try {
      const r = await fetch('/api/admin/phrases', { headers: headers() });
      const j = await r.json();
      if (j.ok) setPhrases(j.phrases || []);
    } catch {
      /* ignore */
    }
    setPhrasesLoading(false);
  }

  async function savePhrases(updated: any[]) {
    try {
      await fetch('/api/admin/phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ phrases: updated }),
      });
      setPhrases(updated);
      toast.success(`${updated.length} frase tersimpan`);
    } catch {
      toast.error('Gagal simpan frase');
    }
  }

  function addPhrase() {
    const p = newPhrase
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (wc < 3 || wc > 8) return toast.error('Frase harus 3-8 kata');
    const updated = [
      ...phrases,
      { id: `manual-${Date.now()}`, phrase: p, hint: newHint, source: 'admin' },
    ];
    savePhrases(updated);
    setNewPhrase('');
  }

  function deletePhrase(id: string) {
    savePhrases(phrases.filter((p) => p.id !== id));
  }

  // Editing state for phrases
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhrase, setEditPhrase] = useState('');
  const [editHint, setEditHint] = useState('');

  function startEdit(p: any) {
    setEditingId(p.id);
    setEditPhrase(p.phrase);
    setEditHint(p.hint || 'roast');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditPhrase('');
    setEditHint('');
  }

  function saveEdit(id: string) {
    const p = editPhrase
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (wc < 3 || wc > 8) return toast.error('Frase harus 3-8 kata');
    const updated = phrases.map((ph) =>
      ph.id === id ? { ...ph, phrase: p, hint: editHint } : ph,
    );
    savePhrases(updated);
    cancelEdit();
  }

  /* ── AI Save ── */
  async function saveAI() {
    try {
      const body: Record<string, string> = { openaiModel: aiModel };
      if (aiKey) body.openaiApiKey = aiKey;
      await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(body),
      });
      setAiKey('');
      toast.success('AI settings saved');
      loadSettings();
    } catch {
      toast.error('Gagal simpan');
    }
  }

  /* ── WAHA ── */
  async function saveWaha() {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({
          waha: {
            baseUrl: wahaUrl,
            session: wahaSession,
            apiKey: wahaKey || '***set***',
          },
        }),
      });
      // Update indicators immediately after successful save
      setHasWahaUrl(!!wahaUrl.trim());
      if (wahaKey && wahaKey !== '***set***') setHasWahaKey(true);
      setWahaKey('');
      toast.success('WAHA settings saved');
    } catch {
      toast.error('Gagal simpan');
    }
  }

  async function runWahaDiag() {
    setWahaDiagLoading(true);
    try {
      const r = await fetch('/api/admin/waha/diagnostics', {
        headers: headers(),
      });
      const j = await r.json();
      setWahaDiag(j);
      // Update green indicators from diagnostic result
      if (j.baseUrl) setHasWahaUrl(true);
      if (j.hasApiKey) setHasWahaKey(true);
    } catch {
      toast.error('Gagal diagnosa');
    }
    setWahaDiagLoading(false);
  }

  async function testWahaSend() {
    if (!wahaTestPhone.trim()) return toast.error('Masukkan nomor HP');
    setWahaTestLoading(true);
    setWahaTestResult(null);
    try {
      const r = await fetch('/api/admin/waha/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ phone: wahaTestPhone, text: wahaTestMsg }),
      });
      const j = await r.json();
      setWahaTestResult({ status: r.status, body: j });
      if (j.ok) {
        toast.success(`Pesan terkirim via ${j.via}`);
      } else {
        toast.error(`Gagal kirim: ${j.error || 'unknown'}`);
      }
    } catch (err: any) {
      setWahaTestResult({
        status: 0,
        body: { error: err.message || 'Network error' },
      });
      toast.error('Error mengirim');
    }
    setWahaTestLoading(false);
  }

  /* ── Generate phrases (to staging, NOT auto-add) ── */
  async function generatePhrases() {
    setGenerating(true);
    try {
      const r = await fetch('/api/admin/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ count: genCount, prompt: genPrompt }),
      });
      const j = await r.json();
      if (j.ok && j.phrases) {
        setStagedPhrases(j.phrases);
        toast.success(
          `${j.count} frase di-generate (${j.provider}). Review lalu klik Tambahkan.`,
        );
      } else {
        toast.error('Gagal generate');
      }
    } catch {
      toast.error('Error');
    }
    setGenerating(false);
  }

  function removeStagedPhrase(id: string) {
    setStagedPhrases((prev) => prev.filter((p) => p.id !== id));
  }

  async function addStagedPhrases() {
    if (stagedPhrases.length === 0)
      return toast.error('Tidak ada frase staged');
    const merged = [...phrases, ...stagedPhrases];
    await savePhrases(merged);
    toast.success(
      `${stagedPhrases.length} frase ditambahkan, total: ${merged.length}`,
    );
    setStagedPhrases([]);
  }

  /* ── Fruit Ninja settings ── */
  function updateFnSetting(key: string, value: any) {
    setFnConfig((prev) => ({ ...prev, [key]: value }));
  }

  /* ── Score Season Management ── */
  async function loadSeasons() {
    try {
      const r = await fetch('/api/admin/seasons', { headers: headers() });
      const j = await r.json();
      if (j.ok) setSeasons(j.seasons || []);
    } catch {
      /* ignore */
    }
  }

  async function clearScores() {
    setSeasonLoading(true);
    try {
      const r = await fetch('/api/admin/scores/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ clearAchievements: clearAch }),
      });
      const j = await r.json();
      if (j.ok) {
        const msg = clearAch
          ? 'Semua skor & achievement berhasil dihapus'
          : 'Semua skor berhasil dihapus (achievement tetap aman)';
        toast.success(msg);
        loadStats();
      } else {
        toast.error(j.error || 'Gagal hapus');
      }
    } catch {
      toast.error('Error');
    }
    setSeasonLoading(false);
    setConfirmAction(null);
    setConfirmInput('');
    setClearAch(false);
  }

  async function saveSeasonAndClear() {
    const name = seasonName.trim() || `Season ${(seasons.length || 0) + 1}`;
    setSeasonLoading(true);
    try {
      const r = await fetch('/api/admin/scores/save-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ name, clearAchievements: clearAch }),
      });
      const j = await r.json();
      if (j.ok) {
        const achMsg = clearAch ? ' + achievement di-reset' : '';
        toast.success(
          `${j.savedScores} skor disimpan sebagai "${name}"${achMsg}`,
        );
        setSeasonName('');
        loadSeasons();
        loadStats();
      } else {
        toast.error(j.error || 'Gagal simpan season');
      }
    } catch {
      toast.error('Error');
    }
    setSeasonLoading(false);
    setConfirmAction(null);
    setConfirmInput('');
    setClearAch(false);
  }

  async function deleteSeason(id: number, name: string) {
    if (
      !confirm(
        `Hapus season "${name}" secara permanen? Data tidak bisa dikembalikan.`,
      )
    )
      return;
    setSeasonLoading(true);
    try {
      const r = await fetch(`/api/admin/seasons/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(`Season "${name}" berhasil dihapus`);
        if (seasonDetail?.id === id) setSeasonDetail(null);
        loadSeasons();
      } else {
        toast.error(j.error || 'Gagal hapus season');
      }
    } catch {
      toast.error('Error menghapus season');
    }
    setSeasonLoading(false);
  }

  async function viewSeasonDetail(id: number) {
    if (seasonDetail?.id === id) {
      setSeasonDetail(null);
      return;
    }
    setSeasonDetailLoading(true);
    try {
      const r = await fetch(`/api/admin/seasons/${id}`, { headers: headers() });
      const j = await r.json();
      if (j.ok) {
        setSeasonDetail({ id, ...j });
      } else {
        toast.error(j.error || 'Gagal load detail');
      }
    } catch {
      toast.error('Error loading season detail');
    }
    setSeasonDetailLoading(false);
  }

  /* ── Achievement Management functions ── */
  async function loadAchievements() {
    setAchLoading(true);
    try {
      const r = await fetch('/api/admin/achievements', { headers: headers() });
      const j = await r.json();
      if (j.ok)
        setAchData({
          total: j.total,
          users: j.users,
          achievements: j.achievements || [],
        });
    } catch {
      /* ignore */
    }
    setAchLoading(false);
  }

  async function backupAchievements() {
    try {
      const r = await fetch('/api/admin/achievements/backup', {
        headers: headers(),
      });
      const j = await r.json();
      if (j.ok) {
        const blob = new Blob([JSON.stringify(j, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `achievements-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Backup ${j.count} achievements berhasil didownload`);
      }
    } catch {
      toast.error('Gagal backup achievements');
    }
  }

  async function restoreAchievements() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const achievements = data.achievements || [];
        if (achievements.length === 0) {
          toast.error('File tidak berisi achievements');
          return;
        }
        const r = await fetch('/api/admin/achievements/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers() },
          body: JSON.stringify({ achievements }),
        });
        const j = await r.json();
        if (j.ok) {
          toast.success(j.message);
          loadAchievements();
        } else {
          toast.error(j.error || 'Gagal restore');
        }
      } catch {
        toast.error('File JSON tidak valid');
      }
    };
    input.click();
  }

  /* ── User Management functions ── */
  async function loadUsers() {
    setUsersLoading(true);
    try {
      const r = await fetch('/api/admin/users', { headers: headers() });
      const j = await r.json();
      if (j.ok) setUsers(j.users || []);
    } catch {
      /* ignore */
    }
    setUsersLoading(false);
  }

  /* ── Referral Management functions ── */
  async function loadReferrals() {
    setReferralLoading(true);
    try {
      const r = await fetch('/api/admin/referrals', { headers: headers() });
      const j = await r.json();
      if (j.ok) setReferralData(j);
    } catch {
      /* ignore */
    }
    setReferralLoading(false);
  }

  function startEditUser(user: any) {
    setEditingUser(user.id);
    setEditForm({
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      language: user.language || 'ID',
      status: user.status || 'active',
    });
  }

  function cancelEditUser() {
    setEditingUser(null);
    setEditForm({});
  }

  async function saveUserEdit(userId: number) {
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify(editForm),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success('User berhasil diupdate');
        cancelEditUser();
        loadUsers();
      } else {
        toast.error(j.error || 'Gagal update user');
      }
    } catch {
      toast.error('Error');
    }
  }

  async function deleteUserById(id: number, name: string) {
    if (!confirm(`Hapus user "${name}"? Data tidak bisa dikembalikan.`)) return;
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(`User "${name}" berhasil dihapus`);
        loadUsers();
      } else {
        toast.error(j.error || 'Gagal hapus user');
      }
    } catch {
      toast.error('Error');
    }
  }

  async function resendOtp(id: number, name: string) {
    if (!confirm(`Kirim ulang OTP ke "${name}"?`)) return;
    try {
      const r = await fetch(`/api/admin/users/${id}/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(j.message || 'OTP berhasil dikirim');
      } else {
        toast.error(j.error || 'Gagal kirim OTP');
      }
    } catch {
      toast.error('Error kirim OTP');
    }
  }

  function applyPreset(preset: FNPreset) {
    setFnConfig(preset.cfg);
    toast.success(
      `Preset "${preset.name}" diterapkan. Klik "Simpan" untuk menyimpan.`,
    );
  }

  async function saveFnConfig() {
    setFnSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ fruitNinja: fnConfig }),
      });
      toast.success('Potong Bhuahyaya settings saved');
    } catch {
      toast.error('Gagal simpan');
    }
    setFnSaving(false);
  }

  /* ── Snake settings ── */
  function updateSnakeDiff(diff: string, key: string, value: any) {
    setSnakeConfig((prev) => ({
      ...prev,
      difficulties: {
        ...prev.difficulties,
        [diff]: {
          ...prev.difficulties?.[diff],
          [key]: value,
        },
      },
    }));
  }

  function resetSnakeDefaults() {
    setSnakeConfig({
      difficulties: JSON.parse(JSON.stringify(DEFAULT_SNAKE_DIFFICULTY)),
    });
    toast.success('Anomali Ulariyan settings di-reset ke default');
  }

  async function saveSnakeConfig() {
    setSnakeSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ snake: snakeConfig }),
      });
      toast.success('Anomali Ulariyan settings saved');
    } catch {
      toast.error('Gagal simpan');
    }
    setSnakeSaving(false);
  }

  /* ── Filtered phrases ── */
  const filteredPhrases = phraseSearch
    ? phrases.filter(
        (p) =>
          p.phrase?.toLowerCase().includes(phraseSearch.toLowerCase()) ||
          p.hint?.toLowerCase().includes(phraseSearch.toLowerCase()),
      )
    : phrases;

  /* ── Loading / Auth screens ── */
  if (loading) {
    return (
      <div className='min-h-svh pb-20 md:pb-4'>
        <Navbar />
        <div className='flex justify-center py-20 text-muted-foreground animate-pulse'>
          Loading...
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className='min-h-svh pb-20 md:pb-4'>
        <Navbar />
        <main className='mx-auto max-w-sm px-4 py-20'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Shield className='h-5 w-5' /> Admin Login
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <Input
                type='password'
                placeholder='Admin password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tryAuth()}
              />
              <Button
                className='w-full'
                onClick={tryAuth}
              >
                Login
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  /* ── Main admin panel ── */
  return (
    <div className='min-h-svh pb-20 md:pb-4'>
      <Navbar />
      <main className='mx-auto max-w-3xl px-2 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6'>
        <h1 className='text-xl sm:text-2xl font-bold'>⚙️ Admin Panel</h1>

        {/* ══════════════════════════════════════
            0. STATISTICS DASHBOARD
           ══════════════════════════════════════ */}
        <Section
          icon={BarChart3}
          title='Statistik'
          open={!!openSections.stats}
          onToggle={() => toggleSection('stats')}
        >
          {statsLoading && !adminStats ? (
            <p className='text-sm text-muted-foreground'>Loading...</p>
          ) : adminStats ? (
            <div className='space-y-4'>
              {/* Summary cards */}
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
                <div className='rounded-lg border border-border bg-card p-3 text-center'>
                  <p className='text-2xl font-bold'>{adminStats.users.total}</p>
                  <p className='text-xs text-muted-foreground'>Total User</p>
                </div>
                <div className='rounded-lg border border-border bg-card p-3 text-center'>
                  <p className='text-2xl font-bold'>{adminStats.games.total}</p>
                  <p className='text-xs text-muted-foreground'>Total Game</p>
                </div>
                <div className='rounded-lg border border-border bg-card p-3 text-center'>
                  <p className='text-2xl font-bold'>
                    {adminStats.achievements.total}
                  </p>
                  <p className='text-xs text-muted-foreground'>Achievement</p>
                </div>
                <div className='rounded-lg border border-border bg-card p-3 text-center'>
                  <p className='text-2xl font-bold'>{adminStats.phrases}</p>
                  <p className='text-xs text-muted-foreground'>Frase</p>
                </div>
              </div>

              {/* User breakdown */}
              <div className='rounded-lg border border-border p-3 space-y-1'>
                <h4 className='text-sm font-medium'>👥 User</h4>
                <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm'>
                  <span>
                    ✅ Aktif: <b>{adminStats.users.active}</b>
                  </span>
                  <span>
                    🚫 Blokir: <b>{adminStats.users.blocked}</b>
                  </span>
                  <span>
                    🆕 Hari ini: <b>{adminStats.users.newToday}</b>
                  </span>
                  <span>
                    📅 7 hari: <b>{adminStats.users.new7d}</b>
                  </span>
                </div>
              </div>

              {/* Games today */}
              <div className='rounded-lg border border-border p-3 space-y-1'>
                <h4 className='text-sm font-medium'>
                  🎮 Game Hari Ini: {adminStats.games.today} | 7 Hari:{' '}
                  {adminStats.games.last7d}
                </h4>
                <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm'>
                  {Object.entries(adminStats.perGame).map(
                    ([g, v]: [string, any]) => (
                      <div
                        key={g}
                        className='rounded border border-border/50 p-2'
                      >
                        <p className='font-medium text-xs'>
                          {g === 'hangman'
                            ? '🔤'
                            : g === 'fruit-ninja'
                              ? '🍉'
                              : g === 'flappy-bird'
                                ? '🐥'
                                : '🐍'}{' '}
                          {g}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          Total: {v.total} | Hari ini: {v.today}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          Avg skor: {v.avg}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>

              {/* Daily activity mini-chart */}
              <div className='rounded-lg border border-border p-3 space-y-2'>
                <h4 className='text-sm font-medium'>
                  📊 Aktivitas 7 Hari Terakhir
                </h4>
                <div className='flex items-end gap-1 h-20'>
                  {adminStats.dailyActivity.map((d: any) => {
                    const max = Math.max(
                      ...adminStats.dailyActivity.map((x: any) => x.games),
                      1,
                    );
                    const h = Math.max(4, (d.games / max) * 100);
                    return (
                      <div
                        key={d.date}
                        className='flex-1 flex flex-col items-center gap-0.5'
                      >
                        <span className='text-[9px] text-muted-foreground'>
                          {d.games}
                        </span>
                        <div
                          className='w-full rounded-t bg-primary/70 transition-all'
                          style={{ height: `${h}%` }}
                        />
                        <span className='text-[8px] text-muted-foreground'>
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top players */}
              {adminStats.topPlayers.length > 0 && (
                <div className='rounded-lg border border-border p-3 space-y-1'>
                  <h4 className='text-sm font-medium'>🏆 Top 10 Pemain</h4>
                  <div className='space-y-0.5'>
                    {adminStats.topPlayers.map((p: any, i: number) => (
                      <div
                        key={i}
                        className='flex justify-between text-sm'
                      >
                        <span>
                          {i + 1}. {p.name}
                        </span>
                        <span className='text-muted-foreground'>
                          {p.total} pts ({p.games} games)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant='outline'
                size='sm'
                onClick={loadStats}
                disabled={statsLoading}
              >
                <RefreshCw
                  className={`h-3 w-3 mr-1 ${statsLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>
          ) : (
            <Button
              variant='outline'
              size='sm'
              onClick={loadStats}
            >
              Load Statistik
            </Button>
          )}
        </Section>

        {/* ══════════════════════════════════════
            1. PHRASE MANAGEMENT
           ══════════════════════════════════════ */}
        <Section
          icon={ListChecks}
          title='Daftar Kata / Kalimat'
          badge={`${phrases.length}`}
          open={!!openSections.phrases}
          onToggle={() => toggleSection('phrases')}
        >
          <CardDescription className='text-xs sm:text-sm'>
            Kelola frase untuk game Tebak Cellimat Pashang. Setiap frase harus 3-8 kata,
            huruf besar.
          </CardDescription>

          {/* Add new phrase */}
          <div className='flex flex-col sm:flex-row gap-2'>
            <Input
              placeholder='Ketik frase baru (3-8 kata)...'
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              className='flex-1'
              onKeyDown={(e) => e.key === 'Enter' && addPhrase()}
            />
            <select
              className='rounded-md border border-border bg-background px-3 py-2 text-sm'
              value={newHint}
              onChange={(e) => setNewHint(e.target.value)}
            >
              <option value='roast'>roast</option>
              <option value='galau'>galau</option>
              <option value='dark'>dark</option>
              <option value='humor'>humor</option>
              <option value='romantis'>romantis</option>
              <option value='umum'>umum</option>
            </select>
            <Button
              size='sm'
              onClick={addPhrase}
            >
              <Plus className='h-4 w-4 mr-1' /> Tambah
            </Button>
          </div>

          {/* Search / filter */}
          <Input
            placeholder='Cari frase...'
            value={phraseSearch}
            onChange={(e) => setPhraseSearch(e.target.value)}
            className='max-w-xs'
          />

          {/* Phrase list */}
          {phrasesLoading ? (
            <p className='text-sm text-muted-foreground animate-pulse'>
              Memuat frase...
            </p>
          ) : (
            <div className='max-h-80 overflow-y-auto space-y-1 rounded-lg border border-border p-2'>
              {filteredPhrases.length === 0 && (
                <p className='text-sm text-muted-foreground py-4 text-center'>
                  Belum ada frase
                </p>
              )}
              {filteredPhrases.map((p) => (
                <div
                  key={p.id}
                  className='flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 text-sm group'
                >
                  {editingId === p.id ? (
                    <>
                      <Input
                        value={editPhrase}
                        onChange={(e) => setEditPhrase(e.target.value)}
                        className='flex-1 h-7 text-xs font-mono'
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(p.id)}
                      />
                      <select
                        className='h-7 rounded border border-border bg-background px-1 text-[10px]'
                        value={editHint}
                        onChange={(e) => setEditHint(e.target.value)}
                      >
                        <option value='roast'>roast</option>
                        <option value='galau'>galau</option>
                        <option value='dark'>dark</option>
                        <option value='humor'>humor</option>
                        <option value='romantis'>romantis</option>
                        <option value='umum'>umum</option>
                      </select>
                      <button
                        onClick={() => saveEdit(p.id)}
                        className='shrink-0 text-green-600 hover:text-green-500'
                        title='Simpan'
                      >
                        <Check className='h-3.5 w-3.5' />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className='shrink-0 text-muted-foreground hover:text-foreground'
                        title='Batal'
                      >
                        <X className='h-3.5 w-3.5' />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className='flex-1 font-mono text-xs sm:text-sm wrap-break-word min-w-0'>
                        {p.phrase}
                      </span>
                      <Badge
                        variant='outline'
                        className='text-[10px] shrink-0'
                      >
                        {p.hint}
                      </Badge>
                      <button
                        onClick={() => startEdit(p)}
                        className='shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground'
                        title='Edit'
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </button>
                      <button
                        onClick={() => deletePhrase(p.id)}
                        className='shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80'
                        title='Hapus'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Generate section */}
          <div className='border-t border-border pt-4 space-y-3'>
            <h3 className='font-medium text-sm flex items-center gap-2'>
              <Zap className='h-4 w-4' /> Generate Frase via AI
            </h3>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <label className='text-xs text-muted-foreground'>Jumlah</label>
                <Input
                  type='number'
                  value={genCount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/^0+(?=\d)/, '');
                    const n = Math.max(
                      1,
                      Math.min(300, parseInt(raw, 10) || 1),
                    );
                    setGenCount(n);
                  }}
                  min={1}
                  max={300}
                />
              </div>
              <div className='space-y-1'>
                <label className='text-xs text-muted-foreground'>
                  Prompt gaya
                </label>
                <Input
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                />
              </div>
            </div>
            <Button
              onClick={generatePhrases}
              disabled={generating}
              size='sm'
            >
              {generating ? 'Generating...' : '⚡ Generate'}
            </Button>

            {/* Staged phrases preview */}
            {stagedPhrases.length > 0 && (
              <div className='space-y-2 rounded-lg border border-amber-500/30 bg-amber-100 dark:bg-amber-950/10 p-3'>
                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                  <p className='text-sm font-medium text-amber-700 dark:text-amber-300'>
                    📋 {stagedPhrases.length} frase siap ditambahkan
                  </p>
                  <div className='flex gap-2 shrink-0'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setStagedPhrases([])}
                    >
                      Buang Semua
                    </Button>
                    <Button
                      size='sm'
                      onClick={addStagedPhrases}
                    >
                      ✅ Tambahkan Semua
                    </Button>
                  </div>
                </div>
                <div className='max-h-60 overflow-y-auto space-y-1'>
                  {stagedPhrases.map((p) => (
                    <div
                      key={p.id}
                      className='flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 text-sm group'
                    >
                      <span className='flex-1 font-mono text-xs sm:text-sm wrap-break-word min-w-0'>
                        {p.phrase}
                      </span>
                      <Badge
                        variant='outline'
                        className='text-[10px] shrink-0'
                      >
                        {p.hint}
                      </Badge>
                      <button
                        onClick={() => removeStagedPhrase(p.id)}
                        className='opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80'
                        title='Hapus dari staging'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ══════════════════════════════════════
            2. Potong Bhuahyaya SETTINGS
           ══════════════════════════════════════ */}
        <Section
          icon={Cherry}
          title='Potong Bhuahyaya Settings'
          open={!!openSections.fruitNinja}
          onToggle={() => toggleSection('fruitNinja')}
        >
          <CardDescription className='text-xs sm:text-sm'>
            Tuning gameplay Potong Bhuahyaya tanpa edit kode. Gunakan preset
            atau atur manual.
          </CardDescription>

          {/* Presets dropdown */}
          <div className='space-y-2'>
            <label className='text-sm font-medium flex items-center gap-1'>
              <HelpCircle className='h-3.5 w-3.5 text-muted-foreground' />{' '}
              Preset Cepat
            </label>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
              {FN_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className='text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors'
                >
                  <div className='font-medium text-sm'>{preset.name}</div>
                  <div className='text-xs text-muted-foreground mt-0.5'>
                    {preset.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Individual settings */}
          <div className='space-y-4 border-t border-border pt-4'>
            <h3 className='font-medium text-sm'>Settings Detail</h3>
            {FN_SETTINGS.map((def) => (
              <div
                key={def.key}
                className='space-y-1.5 rounded-lg border border-border/50 p-3'
              >
                <div className='flex items-start justify-between gap-2'>
                  <label className='text-sm font-medium'>{def.label}</label>
                  {def.unit && (
                    <Badge
                      variant='outline'
                      className='text-[10px] shrink-0'
                    >
                      {def.unit}
                    </Badge>
                  )}
                </div>
                <p className='text-xs text-muted-foreground leading-relaxed'>
                  {def.desc}
                </p>

                {def.type === 'number' ? (
                  <Input
                    type='number'
                    value={
                      fnConfig[def.key] ?? DEFAULT_FN_CONFIG[def.key] ?? ''
                    }
                    onChange={(e) =>
                      updateFnSetting(def.key, Number(e.target.value))
                    }
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    className='max-w-32'
                  />
                ) : (
                  <Input
                    value={
                      Array.isArray(fnConfig[def.key])
                        ? fnConfig[def.key].join(', ')
                        : Array.isArray(DEFAULT_FN_CONFIG[def.key])
                          ? DEFAULT_FN_CONFIG[def.key].join(', ')
                          : (fnConfig[def.key] ?? '')
                    }
                    onChange={(e) => {
                      const parts = e.target.value
                        .split(',')
                        .map((v) => Number(v.trim()))
                        .filter((n) => !isNaN(n));
                      updateFnSetting(def.key, parts);
                    }}
                    placeholder='Contoh: 60, 150, 240'
                    className='font-mono text-xs sm:text-sm'
                  />
                )}
              </div>
            ))}
          </div>

          <Button
            onClick={saveFnConfig}
            disabled={fnSaving}
          >
            {fnSaving ? 'Menyimpan...' : 'Simpan Potong Bhuahyaya Settings'}
          </Button>
        </Section>

        {/* ══════════════════════════════════════
            2b. Anomali Ulariyan SETTINGS
           ══════════════════════════════════════ */}
        <Section
          icon={Settings}
          title='Anomali Ulariyan Settings'
          open={!!openSections.snake}
          onToggle={() => toggleSection('snake')}
        >
          <CardDescription className='text-xs sm:text-sm mb-3'>
            Tuning gameplay Anomali Ulariyan per tingkat kesulitan. Ubah kecepatan,
            dinding, rintangan, skor, dan combo window.
          </CardDescription>

          {SNAKE_DIFFICULTIES.map((diff) => {
            const label =
              diff === 'gak-ngotak'
                ? '💀 Gak Ngotak'
                : diff === 'susah'
                  ? '🔴 Susah'
                  : diff === 'sedang'
                    ? '🟡 Sedang'
                    : '🟢 Gampang';
            const vals =
              snakeConfig.difficulties?.[diff] ||
              DEFAULT_SNAKE_DIFFICULTY[diff];
            return (
              <div
                key={diff}
                className='border rounded-lg p-3 space-y-3'
              >
                <h4 className='font-semibold text-sm'>{label}</h4>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  {SNAKE_DIFF_SETTINGS.map((s) => (
                    <div
                      key={s.key}
                      className='space-y-1'
                    >
                      <label className='text-xs font-medium flex items-center gap-1'>
                        {s.label}
                        {s.unit && (
                          <span className='text-muted-foreground'>
                            ({s.unit})
                          </span>
                        )}
                      </label>
                      <p className='text-[10px] text-muted-foreground'>
                        {s.desc}
                      </p>
                      {s.type === 'boolean' ? (
                        <button
                          onClick={() =>
                            updateSnakeDiff(diff, s.key, !vals[s.key])
                          }
                          className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                            vals[s.key]
                              ? 'bg-green-500/20 border-green-500/50 text-green-400'
                              : 'bg-red-500/20 border-red-500/50 text-red-400'
                          }`}
                        >
                          {vals[s.key] ? '✅ Aktif' : '❌ Mati'}
                        </button>
                      ) : (
                        <Input
                          type='number'
                          className='h-8 text-xs'
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          value={vals[s.key] ?? ''}
                          onChange={(e) =>
                            updateSnakeDiff(diff, s.key, Number(e.target.value))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className='flex gap-2'>
            <Button
              onClick={saveSnakeConfig}
              disabled={snakeSaving}
            >
              {snakeSaving ? 'Menyimpan...' : '🐍 Simpan Anomali Ulariyan Settings'}
            </Button>
            <Button
              variant='outline'
              onClick={resetSnakeDefaults}
            >
              Reset Default
            </Button>
          </div>
        </Section>

        {/* ══════════════════════════════════════
            3. SCORE SEASON MANAGEMENT
           ══════════════════════════════════════ */}
        <Section
          icon={Trophy}
          title='Score & Season Management'
          open={!!openSections.scores}
          onToggle={() => toggleSection('scores')}
        >
          <CardDescription className='text-xs sm:text-sm'>
            Reset skor atau simpan sebagai season history. Data season tersimpan
            permanen di DuckDB.
          </CardDescription>

          {/* Actions */}
          <div className='space-y-3'>
            {/* Option: also clear achievements */}
            <label className='flex items-center gap-2 text-sm cursor-pointer select-none'>
              <input
                type='checkbox'
                checked={clearAch}
                onChange={(e) => setClearAch(e.target.checked)}
                className='h-4 w-4 rounded accent-destructive'
              />
              <span>
                Hapus achievement juga{' '}
                <span className='text-muted-foreground text-xs'>
                  (biasanya hanya skor yang di-reset)
                </span>
              </span>
            </label>

            <div className='flex flex-col sm:flex-row gap-2'>
              <Input
                placeholder={`Nama season (default: Season ${(seasons.length || 0) + 1})`}
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                className='flex-1'
              />
              <Button
                onClick={() => {
                  setConfirmAction('save-reset');
                  setConfirmInput('');
                }}
                disabled={seasonLoading || confirmAction !== null}
                size='sm'
                className='gap-1.5 shrink-0'
              >
                <Archive className='h-4 w-4' />
                Simpan & Reset
              </Button>
            </div>
            <Button
              onClick={() => {
                setConfirmAction('clear');
                setConfirmInput('');
              }}
              disabled={seasonLoading || confirmAction !== null}
              size='sm'
              variant='destructive'
              className='gap-1.5'
            >
              <RotateCcw className='h-4 w-4' />
              Reset Skor Saja (tanpa simpan)
            </Button>

            {/* RESET double confirmation */}
            {confirmAction && (
              <div className='rounded-lg border-2 border-destructive/50 bg-destructive/5 p-4 space-y-3 animate-in fade-in slide-in-from-top-2'>
                <p className='text-sm font-medium text-destructive'>
                  ⚠️{' '}
                  {confirmAction === 'clear'
                    ? 'Kamu akan menghapus semua skor saat ini.'
                    : `Simpan season & reset skor saat ini.`}
                  {clearAch && (
                    <span className='block mt-1 font-bold'>
                      🔴 Achievement juga akan dihapus!
                    </span>
                  )}
                </p>
                <p className='text-xs text-muted-foreground'>
                  Ketik <strong>RESET</strong> untuk konfirmasi:
                </p>
                <div className='flex gap-2'>
                  <Input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder='Ketik RESET'
                    className='max-w-45 font-mono uppercase'
                    autoFocus
                  />
                  <Button
                    size='sm'
                    variant='destructive'
                    disabled={
                      confirmInput.toUpperCase() !== 'RESET' || seasonLoading
                    }
                    onClick={() => {
                      if (confirmAction === 'clear') clearScores();
                      else saveSeasonAndClear();
                    }}
                  >
                    {seasonLoading ? 'Memproses...' : '✓ Konfirmasi'}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setConfirmAction(null);
                      setConfirmInput('');
                    }}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Season history */}
          {seasons.length > 0 && (
            <div className='border-t border-border pt-4 space-y-2'>
              <h3 className='font-medium text-sm flex items-center gap-2'>
                <Archive className='h-4 w-4' /> Season History ({seasons.length}
                )
              </h3>
              <div className='space-y-1 rounded-lg border border-border p-2 max-h-125 overflow-y-auto'>
                {seasons.map((s) => (
                  <div key={s.id}>
                    <div
                      className='flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 text-sm cursor-pointer transition-colors'
                      onClick={() => viewSeasonDetail(s.id)}
                    >
                      <div className='flex items-center gap-2 min-w-0'>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${seasonDetail?.id === s.id ? 'rotate-180' : ''}`}
                        />
                        <div className='min-w-0'>
                          <span className='font-medium'>{s.name}</span>
                          <span className='text-muted-foreground text-xs ml-2'>
                            {new Date(s.created_at).toLocaleDateString(
                              'id-ID',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )}
                          </span>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <Badge
                          variant='outline'
                          className='text-[10px]'
                        >
                          {s.scoreCount ?? '?'} skor
                        </Badge>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10'
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSeason(s.id, s.name);
                          }}
                          disabled={seasonLoading}
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </div>

                    {/* Season detail expanded */}
                    {seasonDetail?.id === s.id && (
                      <div className='mx-3 mb-2 p-3 rounded-lg border border-border/50 bg-muted/30 space-y-3 text-xs animate-in slide-in-from-top-2 duration-200'>
                        {seasonDetailLoading ? (
                          <p className='text-muted-foreground animate-pulse'>
                            Memuat detail...
                          </p>
                        ) : (
                          <>
                            <div className='flex items-center gap-4 text-muted-foreground'>
                              <span>
                                📅{' '}
                                {new Date(
                                  seasonDetail.created_at || s.created_at,
                                ).toLocaleString('id-ID')}
                              </span>
                              <span>
                                🏆 {seasonDetail.scores?.length || 0} skor
                              </span>
                              <span>
                                🎖️ {seasonDetail.achievements?.length || 0}{' '}
                                achievement
                              </span>
                            </div>

                            {/* Scores table */}
                            {seasonDetail.scores?.length > 0 && (
                              <div>
                                <h4 className='font-medium text-sm mb-1.5'>
                                  Skor
                                </h4>
                                <div className='max-h-48 overflow-y-auto rounded border border-border/50'>
                                  <table className='w-full text-xs'>
                                    <thead className='bg-muted/50 sticky top-0'>
                                      <tr>
                                        <th className='text-left px-2 py-1.5 font-medium'>
                                          #
                                        </th>
                                        <th className='text-left px-2 py-1.5 font-medium'>
                                          Pemain
                                        </th>
                                        <th className='text-left px-2 py-1.5 font-medium'>
                                          Game
                                        </th>
                                        <th className='text-right px-2 py-1.5 font-medium'>
                                          Skor
                                        </th>
                                        <th className='text-right px-2 py-1.5 font-medium'>
                                          Tanggal
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {seasonDetail.scores
                                        .slice(0, 100)
                                        .map((sc: any, i: number) => (
                                          <tr
                                            key={sc.id || i}
                                            className='border-t border-border/30 hover:bg-muted/20'
                                          >
                                            <td className='px-2 py-1 text-muted-foreground'>
                                              {i + 1}
                                            </td>
                                            <td className='px-2 py-1 font-medium'>
                                              {sc.playerName || 'Anonim'}
                                            </td>
                                            <td className='px-2 py-1'>
                                              <Badge
                                                variant='outline'
                                                className='text-[9px]'
                                              >
                                                {sc.game}
                                              </Badge>
                                            </td>
                                            <td className='px-2 py-1 text-right tabular-nums font-semibold'>
                                              {sc.score}
                                            </td>
                                            <td className='px-2 py-1 text-right text-muted-foreground'>
                                              {sc.createdAt
                                                ? new Date(
                                                    sc.createdAt,
                                                  ).toLocaleDateString(
                                                    'id-ID',
                                                    {
                                                      day: '2-digit',
                                                      month: 'short',
                                                    },
                                                  )
                                                : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                  {seasonDetail.scores.length > 100 && (
                                    <p className='text-center text-muted-foreground py-1.5'>
                                      ...dan {seasonDetail.scores.length - 100}{' '}
                                      lainnya
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Achievements */}
                            {seasonDetail.achievements?.length > 0 && (
                              <div>
                                <h4 className='font-medium text-sm mb-1.5'>
                                  Achievements
                                </h4>
                                <div className='flex flex-wrap gap-1.5'>
                                  {seasonDetail.achievements.map(
                                    (a: any, i: number) => (
                                      <Badge
                                        key={a.id || i}
                                        variant='secondary'
                                        className='text-[10px] gap-1'
                                      >
                                        {a.title || a.code} —{' '}
                                        {a.playerName || 'Anonim'}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ══════════════════════════════════════
            3.5. ACHIEVEMENT MANAGEMENT (PERMANENT)
           ══════════════════════════════════════ */}
        <Section
          icon={Award}
          title='Achievement Management'
          badge={
            achData.total > 0 ? `${achData.total} achievements` : undefined
          }
          open={!!openSections.achievements}
          onToggle={() => toggleSection('achievements')}
        >
          <CardDescription className='text-xs sm:text-sm mb-3'>
            Achievement bersifat <strong>permanen</strong> — tidak terhapus saat
            reset skor atau ganti season. Backup untuk keamanan data.
          </CardDescription>

          <div className='flex flex-wrap gap-2 mb-4'>
            <Button
              onClick={() => {
                loadAchievements();
              }}
              size='sm'
              variant='outline'
              disabled={achLoading}
              className='gap-1.5'
            >
              <RefreshCw
                className={`h-4 w-4 ${achLoading ? 'animate-spin' : ''}`}
              />
              {achLoading ? 'Loading...' : 'Load Data'}
            </Button>
            <Button
              onClick={backupAchievements}
              size='sm'
              variant='outline'
              className='gap-1.5'
            >
              <Download className='h-4 w-4' />
              Backup (Download)
            </Button>
            <Button
              onClick={restoreAchievements}
              size='sm'
              variant='outline'
              className='gap-1.5'
            >
              <Upload className='h-4 w-4' />
              Restore (Upload)
            </Button>
          </div>

          {achData.total > 0 && (
            <div className='space-y-3'>
              <div className='flex gap-4 text-sm text-muted-foreground'>
                <span>
                  🏆 Total:{' '}
                  <strong className='text-foreground'>{achData.total}</strong>
                </span>
                <span>
                  👥 Users:{' '}
                  <strong className='text-foreground'>{achData.users}</strong>
                </span>
              </div>
              <div className='max-h-60 overflow-y-auto border rounded-lg divide-y divide-border'>
                {achData.achievements.map((a: any, i: number) => (
                  <div
                    key={a.id || i}
                    className='flex items-center gap-2 px-3 py-1.5 text-xs'
                  >
                    <Badge
                      variant='outline'
                      className='text-[10px] shrink-0'
                    >
                      {a.rarity || 'common'}
                    </Badge>
                    <span className='font-medium truncate'>
                      {a.title || a.code}
                    </span>
                    <span className='text-muted-foreground ml-auto shrink-0'>
                      {a.playerName || 'Anonim'} • {a.game}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ══════════════════════════════════════
            4. USER MANAGEMENT
           ══════════════════════════════════════ */}
        <Section
          icon={Users}
          title='User Management'
          badge={users.length > 0 ? `${users.length} users` : undefined}
          open={!!openSections.users}
          onToggle={() => toggleSection('users')}
        >
          <CardDescription className='text-xs sm:text-sm mb-3'>
            Kelola daftar user, edit profil, hapus, atau kirim ulang OTP.
          </CardDescription>

          {usersLoading ? (
            <p className='text-muted-foreground text-sm'>Loading users...</p>
          ) : users.length === 0 ? (
            <p className='text-muted-foreground text-sm'>Belum ada user.</p>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full text-xs sm:text-sm'>
                <thead>
                  <tr className='border-b text-left'>
                    <th className='p-2'>ID</th>
                    <th className='p-2'>Name</th>
                    <th className='p-2'>Phone</th>
                    <th className='p-2 hidden sm:table-cell'>Email</th>
                    <th className='p-2 hidden sm:table-cell'>Lang</th>
                    <th className='p-2'>Status</th>
                    <th className='p-2 hidden md:table-cell'>Joined</th>
                    <th className='p-2'>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr
                      key={u.id}
                      className='border-b hover:bg-muted/50'
                    >
                      {editingUser === u.id ? (
                        /* ── Editing row ── */
                        <>
                          <td className='p-2 font-mono'>{u.id}</td>
                          <td className='p-2'>
                            <Input
                              className='h-7 text-xs'
                              value={editForm.name || ''}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  name: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className='p-2'>
                            <Input
                              className='h-7 text-xs'
                              value={editForm.phone || ''}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  phone: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className='p-2 hidden sm:table-cell'>
                            <Input
                              className='h-7 text-xs'
                              value={editForm.email || ''}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  email: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className='p-2 hidden sm:table-cell'>
                            <select
                              className='h-7 text-xs rounded border px-1 bg-background'
                              value={editForm.language || 'ID'}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  language: e.target.value,
                                })
                              }
                            >
                              <option value='ID'>ID</option>
                              <option value='EN'>EN</option>
                            </select>
                          </td>
                          <td className='p-2'>
                            <select
                              className='h-7 text-xs rounded border px-1 bg-background'
                              value={editForm.status || 'active'}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  status: e.target.value,
                                })
                              }
                            >
                              <option value='active'>Active</option>
                              <option value='inactive'>Inactive</option>
                              <option value='banned'>Banned</option>
                            </select>
                          </td>
                          <td className='p-2 hidden md:table-cell text-muted-foreground'>
                            {u.joined_at
                              ? new Date(u.joined_at).toLocaleDateString()
                              : '-'}
                          </td>
                          <td className='p-2'>
                            <div className='flex gap-1'>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                onClick={() => saveUserEdit(u.id)}
                              >
                                <Check className='h-3 w-3 text-green-500' />
                              </Button>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                onClick={cancelEditUser}
                              >
                                <X className='h-3 w-3 text-red-500' />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        /* ── Display row ── */
                        <>
                          <td className='p-2 font-mono'>{u.id}</td>
                          <td className='p-2 font-medium'>{u.name}</td>
                          <td className='p-2 font-mono text-xs'>{u.phone}</td>
                          <td className='p-2 hidden sm:table-cell text-muted-foreground'>
                            {u.email || '-'}
                          </td>
                          <td className='p-2 hidden sm:table-cell'>
                            <Badge
                              variant='outline'
                              className='text-[10px]'
                            >
                              {u.language || 'ID'}
                            </Badge>
                          </td>
                          <td className='p-2'>
                            <Badge
                              variant={
                                u.status === 'active'
                                  ? 'default'
                                  : 'destructive'
                              }
                              className='text-[10px]'
                            >
                              {u.status || 'active'}
                            </Badge>
                          </td>
                          <td className='p-2 hidden md:table-cell text-muted-foreground'>
                            {u.joined_at
                              ? new Date(u.joined_at).toLocaleDateString()
                              : '-'}
                          </td>
                          <td className='p-2'>
                            <div className='flex gap-1'>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                title='Edit'
                                onClick={() => startEditUser(u)}
                              >
                                <Pencil className='h-3 w-3' />
                              </Button>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                title='Resend OTP'
                                onClick={() => resendOtp(u.id, u.name)}
                              >
                                <KeyRound className='h-3 w-3' />
                              </Button>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6'
                                title='Delete'
                                onClick={() => deleteUserById(u.id, u.name)}
                              >
                                <Trash2 className='h-3 w-3 text-red-500' />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className='flex justify-end mt-3'>
            <Button
              size='sm'
              variant='outline'
              onClick={loadUsers}
            >
              <RefreshCw className='h-3 w-3 mr-1' /> Refresh Users
            </Button>
          </div>
        </Section>

        {/* ══════════════════════════════════════
            4b. REFERRAL MANAGEMENT
           ══════════════════════════════════════ */}
        <Section
          icon={Award}
          title='Referral Management'
          badge={
            referralData
              ? `${referralData.totalReferrals || 0} referrals`
              : undefined
          }
          open={!!openSections.referrals}
          onToggle={() => toggleSection('referrals')}
        >
          <CardDescription className='text-xs sm:text-sm mb-3'>
            Lihat semua data referral, siapa yang mengajak siapa, dan status
            aktivasinya.
          </CardDescription>

          {referralLoading ? (
            <p className='text-muted-foreground text-sm'>
              Loading referrals...
            </p>
          ) : !referralData ? (
            <p className='text-muted-foreground text-sm'>
              Belum ada data referral.
            </p>
          ) : (
            <>
              {/* Summary cards */}
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4'>
                <div className='rounded-lg border p-3 text-center'>
                  <div className='text-2xl font-bold'>
                    {referralData.totalReferrals}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    Total Referral
                  </div>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <div className='text-2xl font-bold text-green-500'>
                    {referralData.totalActive}
                  </div>
                  <div className='text-xs text-muted-foreground'>Aktif</div>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <div className='text-2xl font-bold text-orange-500'>
                    {referralData.totalInactive}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    Belum Aktif
                  </div>
                </div>
                <div className='rounded-lg border p-3 text-center'>
                  <div className='text-2xl font-bold text-emerald-500'>
                    Rp
                    {(referralData.totalEarnings || 0).toLocaleString('id-ID')}
                  </div>
                  <div className='text-xs text-muted-foreground'>
                    Total Bonus
                  </div>
                </div>
              </div>

              <p className='text-xs text-muted-foreground mb-3'>
                Nilai per referral aktif:{' '}
                <strong>
                  Rp
                  {(referralData.valuePerReferral || 0).toLocaleString('id-ID')}
                </strong>
              </p>

              {/* Per-referrer breakdown */}
              {(referralData.summary || []).length === 0 ? (
                <p className='text-muted-foreground text-sm py-4 text-center'>
                  Belum ada referrer.
                </p>
              ) : (
                <div className='space-y-3'>
                  {(referralData.summary || []).map((s: any) => (
                    <div
                      key={s.referrerId}
                      className='rounded-lg border p-3'
                    >
                      <div className='flex items-center justify-between mb-2'>
                        <div>
                          <span className='font-medium text-sm'>
                            {s.referrerName}
                          </span>
                          <Badge
                            variant='outline'
                            className='ml-2 text-[10px]'
                          >
                            {s.referralCode}
                          </Badge>
                        </div>
                        <div className='text-sm font-bold text-emerald-500'>
                          Rp{(s.totalEarnings || 0).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div className='flex gap-3 text-xs text-muted-foreground mb-2'>
                        <span>Total: {s.totalReferrals}</span>
                        <span className='text-green-500'>
                          Aktif: {s.activeCount}
                        </span>
                        <span className='text-orange-500'>
                          Belum: {s.inactiveCount}
                        </span>
                      </div>
                      {s.referrals && s.referrals.length > 0 && (
                        <div className='space-y-1'>
                          {s.referrals.map((ref: any) => (
                            <div
                              key={ref.id}
                              className='flex items-center justify-between text-xs border-t pt-1'
                            >
                              <div>
                                <span className='font-medium'>
                                  {ref.referredName}
                                </span>
                                {ref.referredPhone && (
                                  <span className='text-muted-foreground ml-2'>
                                    {ref.referredPhone}
                                  </span>
                                )}
                              </div>
                              <Badge
                                variant={
                                  ref.status === 'active'
                                    ? 'default'
                                    : 'secondary'
                                }
                                className='text-[10px]'
                              >
                                {ref.status === 'active'
                                  ? '✅ Aktif'
                                  : '⏳ Belum'}
                                {ref.activatedAt &&
                                  ` (${new Date(ref.activatedAt).toLocaleDateString('id-ID')})`}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className='flex justify-end mt-3'>
            <Button
              size='sm'
              variant='outline'
              onClick={loadReferrals}
            >
              <RefreshCw className='h-3 w-3 mr-1' /> Refresh Referrals
            </Button>
          </div>
        </Section>

        {/* ══════════════════════════════════════
            5. WAHA WHATSAPP
           ══════════════════════════════════════ */}
        <Section
          icon={MessageSquare}
          title='WAHA WhatsApp'
          open={!!openSections.waha}
          onToggle={() => toggleSection('waha')}
        >
          <CardDescription className='text-xs sm:text-sm'>
            Pengaturan gateway WhatsApp untuk OTP via WAHA.
          </CardDescription>

          {/* WAHA settings */}
          <div className='grid grid-cols-1 gap-3'>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>
                Base URL{' '}
                {hasWahaUrl && <span className='text-green-500'>(set)</span>}
              </label>
              <PasswordInput
                placeholder='https://waha.syaefulaz.online'
                value={wahaUrl}
                onChange={(e) => setWahaUrl(e.target.value)}
                show={showWahaUrl}
                onToggle={() => setShowWahaUrl((v) => !v)}
              />
              <p className='text-xs text-muted-foreground'>
                URL instance WAHA tanpa trailing slash
              </p>
            </div>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>
                API Key{' '}
                {hasWahaKey && <span className='text-green-500'>(set)</span>}
              </label>
              <PasswordInput
                placeholder={
                  hasWahaKey
                    ? '***set*** (kosongkan untuk keep)'
                    : 'API key WAHA'
                }
                value={wahaKey}
                onChange={(e) => setWahaKey(e.target.value)}
                show={showWahaKey}
                onToggle={() => setShowWahaKey((v) => !v)}
              />
            </div>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>Session Name</label>
              <Input
                value={wahaSession}
                onChange={(e) => setWahaSession(e.target.value)}
              />
              <p className='text-xs text-muted-foreground'>
                Nama session WAHA yang sudah di-scan QR. Default: KutuLoncat
              </p>
            </div>
            <Button
              onClick={saveWaha}
              size='sm'
            >
              Save WAHA Settings
            </Button>
          </div>

          {/* Diagnostics */}
          <div className='border-t border-border pt-4 space-y-3'>
            <h3 className='font-medium text-sm flex items-center gap-2'>
              <Activity className='h-4 w-4' /> WAHA Diagnostic
            </h3>
            <Button
              onClick={runWahaDiag}
              disabled={wahaDiagLoading}
              variant='outline'
              size='sm'
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${wahaDiagLoading ? 'animate-spin' : ''}`}
              />
              {wahaDiagLoading ? 'Checking...' : 'Run Diagnostic'}
            </Button>

            {wahaDiag && (
              <div className='space-y-2 rounded-lg border border-border p-3 text-xs sm:text-sm'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>Base URL:</span>
                  <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>
                    {wahaDiag.baseUrl || '(not set)'}
                  </code>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>API Key:</span>
                  <Badge
                    variant={wahaDiag.hasApiKey ? 'default' : 'destructive'}
                  >
                    {wahaDiag.hasApiKey ? '✅ Set' : '❌ Not Set'}
                  </Badge>
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-medium'>Session:</span>
                  <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>
                    {wahaDiag.session}
                  </code>
                </div>
                {wahaDiag.checks?.map((c: any, i: number) => (
                  <div
                    key={i}
                    className='flex items-start gap-2 border-t border-border/50 pt-2'
                  >
                    <Badge
                      variant={c.ok ? 'default' : 'destructive'}
                      className='text-[10px] shrink-0'
                    >
                      {c.ok ? '✅' : '❌'} {c.status}
                    </Badge>
                    <div>
                      <div className='font-medium'>{c.name}</div>
                      <code className='text-[11px] text-muted-foreground break-all'>
                        {c.sample?.slice(0, 200)}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Send */}
          <div className='border-t border-border pt-4 space-y-3'>
            <h3 className='font-medium text-sm flex items-center gap-2'>
              <Send className='h-4 w-4' /> Test Kirim Pesan
            </h3>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
              <Input
                placeholder='08xx atau +62xxx'
                value={wahaTestPhone}
                onChange={(e) => setWahaTestPhone(e.target.value)}
              />
              <Input
                placeholder='Pesan test'
                value={wahaTestMsg}
                onChange={(e) => setWahaTestMsg(e.target.value)}
              />
            </div>
            <Button
              onClick={testWahaSend}
              size='sm'
              variant='outline'
              disabled={wahaTestLoading}
            >
              <Send
                className={`h-4 w-4 mr-1 ${wahaTestLoading ? 'animate-spin' : ''}`}
              />{' '}
              {wahaTestLoading ? 'Mengirim...' : 'Kirim Test'}
            </Button>

            {/* JSON Response Output */}
            {wahaTestResult && (
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <span className='text-xs font-medium'>Response:</span>
                  <Badge
                    variant={
                      wahaTestResult.status >= 200 &&
                      wahaTestResult.status < 300
                        ? 'default'
                        : 'destructive'
                    }
                    className='text-[10px]'
                  >
                    {wahaTestResult.status === 0
                      ? 'Network Error'
                      : `HTTP ${wahaTestResult.status}`}
                  </Badge>
                </div>
                <pre className='rounded-lg border border-border bg-muted p-3 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-all'>
                  {JSON.stringify(wahaTestResult.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Section>

        {/* ══════════════════════════════════════
            4. AI SETTINGS
           ══════════════════════════════════════ */}
        <Section
          icon={Settings}
          title='OpenAI Settings'
          open={!!openSections.ai}
          onToggle={() => toggleSection('ai')}
        >
          <div className='space-y-3'>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>Model</label>
              <select
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className='flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground [&_optgroup]:bg-background [&_optgroup]:text-foreground'
              >
                <optgroup label='GPT-5 Series'>
                  <option value='gpt-5.2'>
                    gpt-5.2 — Best for coding &amp; agentic
                  </option>
                  <option value='gpt-5.2-pro'>
                    gpt-5.2-pro — Smarter &amp; more precise
                  </option>
                  <option value='gpt-5'>gpt-5 — Intelligent reasoning</option>
                  <option value='gpt-5-mini'>
                    gpt-5-mini — Cost-efficient GPT-5
                  </option>
                  <option value='gpt-5-nano'>gpt-5-nano — Fastest GPT-5</option>
                </optgroup>
                <optgroup label='GPT-4 Series'>
                  <option value='gpt-4.1'>
                    gpt-4.1 — Smartest non-reasoning
                  </option>
                  <option value='gpt-4.1-mini'>
                    gpt-4.1-mini — Faster 4.1
                  </option>
                  <option value='gpt-4.1-nano'>
                    gpt-4.1-nano — Most cost-efficient 4.1
                  </option>
                  <option value='gpt-4o'>
                    gpt-4o — Fast, intelligent, flexible
                  </option>
                  <option value='gpt-4o-mini'>
                    gpt-4o-mini — Fast &amp; affordable
                  </option>
                  <option value='gpt-4-turbo'>gpt-4-turbo</option>
                  <option value='gpt-4'>gpt-4</option>
                </optgroup>
                <optgroup label='O-Series (Reasoning)'>
                  <option value='o4-mini'>o4-mini</option>
                  <option value='o3'>o3</option>
                  <option value='o3-mini'>o3-mini</option>
                  <option value='o1'>o1</option>
                  <option value='o1-mini'>o1-mini</option>
                </optgroup>
                <optgroup label='Legacy / Open'>
                  <option value='gpt-3.5-turbo'>
                    gpt-3.5-turbo — Legacy, cheaper
                  </option>
                  <option value='gpt-oss-120b'>
                    gpt-oss-120b — Open-weight 120B
                  </option>
                  <option value='gpt-oss-20b'>
                    gpt-oss-20b — Open-weight 20B
                  </option>
                </optgroup>
              </select>
              <p className='text-xs text-muted-foreground'>
                Model OpenAI untuk generate frase. Default: o4-mini
              </p>
            </div>
            <div className='space-y-1'>
              <label className='text-sm font-medium'>
                API Key{' '}
                {hasAiKey && <span className='text-green-500'>(set)</span>}
              </label>
              <PasswordInput
                placeholder={
                  hasAiKey ? '***set*** (kosongkan untuk keep)' : 'sk-...'
                }
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                show={showAiKey}
                onToggle={() => setShowAiKey((v) => !v)}
              />
            </div>
            <Button
              onClick={saveAI}
              size='sm'
            >
              Save AI Settings
            </Button>
          </div>
        </Section>
      </main>
    </div>
  );
}
