import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR = path.join(__dirname, 'data');
const SCORE_FILE = path.join(DATA_DIR, 'scores.json');
const PHRASE_FILE = path.join(DATA_DIR, 'phrases.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const OTP_FILE = path.join(DATA_DIR, 'otp.json');
const ACH_FILE = path.join(DATA_DIR, 'achievements.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
for (const [f, seed] of [
  [SCORE_FILE, { scores: [] }],
  [USERS_FILE, { users: [] }],
  [OTP_FILE, { otps: [] }],
  [ACH_FILE, { achievements: [] }],
  [SESSIONS_FILE, { sessions: [] }]
]) if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(seed, null, 2));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
  antiCheatSecret: crypto.randomBytes(24).toString('hex'),
  ai: { openaiApiKey: '', openaiModel: 'gpt-4o-mini' },
  waha: { baseUrl: 'https://waha.syaefulaz.online', apiKey: 'c024b28d55034cb9b674ef62fadfe641', session: 'KutuLoncat' },
  fruitNinja: {
    stageSeconds:[60,150,240], maxByStage:[6,8,10,13], gapByStage:[780,660,540,430],
    burstMin:[1,1,1,1], burstMax:[2,3,4,6], weirdChance:[0.06,0.10,0.14,0.18], bombBase:[0.10,0.12,0.14,0.17], safeBombDistance:70
  }
}, null, 2));

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function nowIso(){ return new Date().toISOString(); }

function normalizePhone(v='') {
  const d = String(v).replace(/\D/g,'');
  if (!d) return '';
  if (d.startsWith('62')) return `+${d}`;
  if (d.startsWith('0')) return `+62${d.slice(1)}`;
  if (d.startsWith('8')) return `+62${d}`;
  return `+${d}`;
}

function maskName(name='') {
  const n = String(name || '').trim();
  if (!n) return 'usr*';
  if (n.length <= 3) return n[0] + '*';
  return n.slice(0,3) + '*'.repeat(Math.max(1, n.length-3));
}



function isPublicTestHost(req){
  const host = String(req.headers.host || '').toLowerCase();
  return host.includes('test.kutuloncat.my.id');
}

function parseCookies(req){
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i>0) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}

function createSession(userId){
  const db = readJson(SESSIONS_FILE, { sessions: [] });
  const sid = crypto.randomBytes(18).toString('hex');
  const expiresAt = Date.now() + 365*24*60*60*1000;
  db.sessions.push({ sid, userId, expiresAt, createdAt: nowIso() });
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now()).slice(-5000);
  writeJson(SESSIONS_FILE, db);
  return { sid, expiresAt };
}

function getUserBySession(req){
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const sdb = readJson(SESSIONS_FILE, { sessions: [] });
  const row = sdb.sessions.find(x => x.sid === sid && x.expiresAt > Date.now());
  if (!row) return null;
  const udb = readJson(USERS_FILE, { users: [] });
  return udb.users.find(u => u.id === row.userId) || null;
}


function getEffectiveUser(req){
  const u = getUserBySession(req);
  if (u) return u;
  if (isPublicTestHost(req)) return { id:'guest-public', name:'Guest', phone:'', email:'', loginCount:0 };
  return null;
}

function requireAuth(req,res,next){
  const u = getEffectiveUser(req);
  if (!u) return res.redirect('/login');
  req.user = u;
  next();
}

// phrases seed
function ensurePhrasesSeed() {
  const today = new Date().toISOString().slice(0,10);
  const version = 'v3-roast-real';
  const data = readJson(PHRASE_FILE, { date: '', version: '', phrases: [] });
  if (data.date === today && data.version === version && Array.isArray(data.phrases) && data.phrases.length >= 100) return;
  const phrases = [
    'KAMU JOMBLO YA','KAPAN NIKAH NIH','JUDUL SKRIPSI AMAN','DIA SIBUK SAMA YANG LAIN','HIDUP LAGI UJI COBA','KAMU LAGI OVERTHINKING','CHATMU CUMA DIBACA','BALASANNYA BESOK KALI',
    'KAMU TERLALU BAIK KATANYA','HATI KAMU RETAK HALUS','MANTANMU SUDAH MOVE ON','KAMU MASIH NUNGGU DIA','PERASAANMU AUTO ZONK','SEMESTA LAGI BERCANDA','KAMU LELAH YA BOS','HARAPANMU KENA PHP',
    'SENYUMMU TAHAN SAKIT','MALAMMU PENUH DRAMA','PAGIMU KURANG TIDUR','HIDUPMU MODE HEMAT','DOMPETMU MENANGIS LAGI','SALDOMU TIPIS BANGET','KERJAMU BAGUS BONUSNYA MANA','DEADLINE KAMU DULUAN DATANG'
  ];
  const out=[];
  for (let i=0;i<100;i++) out.push({ id:`p-${today}-${i}`, phrase: phrases[i%phrases.length], hint: ['roast','galau','romantis','humor','dark'][i%5], source:'daily-generated' });
  writeJson(PHRASE_FILE, { date: today, version, phrases: out });
}
ensurePhrasesSeed();

app.use(express.json({ limit: '256kb' }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/health', (_req,res)=>{
  const s = readJson(SCORE_FILE, { scores: [] });
  const p = readJson(PHRASE_FILE, { phrases: [] });
  res.json({ ok:true, app:'kutuloncat-games-dashboard', storage:'json-file', scores:(s.scores||[]).length, phrases:(p.phrases||[]).length });
});

// ---- Auth phase 6 ----
app.post('/api/auth/request-otp', async (req,res)=>{
  const name = String(req.body?.name || '').trim();
  const phone = normalizePhone(req.body?.phone || '');
  const email = String(req.body?.email || '').trim();
  if (!name || !phone) return res.status(400).json({ ok:false, error:'name and phone required' });

  const udb = readJson(USERS_FILE, { users: [] });
  if (udb.users.some(u => u.phone === phone)) {
    return res.json({ ok:true, registered:true, message:'Nomor sudah terdaftar. Gunakan login nomor.' });
  }

  const code = String(Math.floor(100000 + Math.random()*900000));
  const odb = readJson(OTP_FILE, { otps: [] });
  odb.otps = odb.otps.filter(o => o.phone !== phone);
  // OTP valid for 1 hour
  odb.otps.push({ phone, name, email, code, expiresAt: Date.now()+60*60*1000, createdAt: nowIso() });
  writeJson(OTP_FILE, odb);

  // WAHA send best-effort
  const st = readJson(SETTINGS_FILE, {});
  const w = st.waha || {};
  const baseUrl = String(w.baseUrl || 'https://waha.syaefulaz.online').replace(/\/$/,'');
  const apiKey = w.apiKey || 'c024b28d55034cb9b674ef62fadfe641';
  const session = w.session || 'KutuLoncat';
  const payload = { session, chatId: `${phone.replace('+','')}@c.us`, text: `Kode OTP KutuLoncat: ${code} (berlaku 60 menit)` };
  const tries = [
    {url:`${baseUrl}/api/sendText`, h:{'X-Api-Key':apiKey}},
    {url:`${baseUrl}/api/messages/text`, h:{'X-Api-Key':apiKey}},
    {url:`${baseUrl}/sendText`, h:{'Authorization':`Bearer ${apiKey}`}},
  ];
  let sent = false;
  for (const t of tries) {
    try { const r = await fetch(t.url,{method:'POST',headers:{'Content-Type':'application/json',...(t.h||{})},body:JSON.stringify(payload)}); if (r.ok){sent=true; break;} } catch {}
  }
  res.json({ ok:true, sent, registered:false, phone, otpValidMinutes: 60 });
});

app.post('/api/auth/verify-otp', (req,res)=>{
  const phone = normalizePhone(req.body?.phone || '');
  const code = String(req.body?.code || '').trim();
  const odb = readJson(OTP_FILE, { otps: [] });
  const row = odb.otps.find(o => o.phone === phone && o.code === code);
  if (!row) return res.status(400).json({ ok:false, error:'invalid otp' });
  if (Date.now() > row.expiresAt) return res.status(400).json({ ok:false, error:'otp expired' });

  const udb = readJson(USERS_FILE, { users: [] });
  let user = udb.users.find(u=>u.phone===phone);
  if (!user) {
    user = { id:`u-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, name:row.name, phone, email:row.email||'', photoUrl:'', createdAt:nowIso(), loginCount:0, lastLoginAt:null };
    udb.users.push(user);
  }
  user.loginCount = Number(user.loginCount||0)+1;
  user.lastLoginAt = nowIso();
  writeJson(USERS_FILE, udb);

  odb.otps = odb.otps.filter(o => !(o.phone===phone && o.code===code));
  writeJson(OTP_FILE, odb);

  const { sid } = createSession(user.id);
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365*24*60*60}`);
  res.json({ ok:true, user });
});

app.post('/api/auth/login-number', (req,res)=>{
  const phone = normalizePhone(req.body?.phone || '');
  const udb = readJson(USERS_FILE, { users: [] });
  const user = udb.users.find(u => u.phone === phone);
  if (!user) return res.status(404).json({ ok:false, error:'nomor belum terdaftar' });
  user.loginCount = Number(user.loginCount||0)+1;
  user.lastLoginAt = nowIso();
  writeJson(USERS_FILE, udb);
  const { sid } = createSession(user.id);
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365*24*60*60}`);
  res.json({ ok:true, user });
});

app.post('/api/auth/logout', (req,res)=>{
  const sid = parseCookies(req).sid;
  const sdb = readJson(SESSIONS_FILE, { sessions: [] });
  sdb.sessions = sdb.sessions.filter(s => s.sid !== sid);
  writeJson(SESSIONS_FILE, sdb);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok:true });
});

app.get('/api/me', (req,res)=>{
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'unauthorized' });
  res.json({ ok:true, user });
});

app.post('/api/me', (req,res)=>{
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'unauthorized' });
  const { name, photoUrl } = req.body || {};
  const udb = readJson(USERS_FILE, { users: [] });
  const row = udb.users.find(u=>u.id===user.id);
  if (!row) return res.status(404).json({ ok:false });
  if (name) row.name = String(name).slice(0,40);
  if (photoUrl !== undefined) row.photoUrl = String(photoUrl).slice(0,500);
  writeJson(USERS_FILE, udb);
  res.json({ ok:true, user: row });
});

app.post('/api/me/photo', (req,res)=>{
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'unauthorized' });
  const dataUrl = String(req.body?.photoData || '');
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return res.status(400).json({ ok:false, error:'invalid image format' });
  const ext = m[1].toLowerCase()==='jpeg' ? 'jpg' : m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2*1024*1024) return res.status(400).json({ ok:false, error:'image too large (max 2MB)' });
  const filename = `u-${user.id}-${Date.now()}.${ext}`;
  const outPath = path.join(__dirname, 'public', 'uploads', filename);
  fs.writeFileSync(outPath, buf);

  const udb = readJson(USERS_FILE, { users: [] });
  const row = udb.users.find(u=>u.id===user.id);
  if (!row) return res.status(404).json({ ok:false });
  row.photoUrl = `/uploads/${filename}`;
  writeJson(USERS_FILE, udb);
  res.json({ ok:true, photoUrl: row.photoUrl });
});

// ---- Anti-cheat ----
function signSession(payload) {
  const st = readJson(SETTINGS_FILE, {});
  const secret = st.antiCheatSecret || 'fallback-secret';
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

app.post('/api/session/start', (req,res)=>{
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'unauthorized' });
  const game = String(req.body?.game || '');
  if (!['hangman','fruit-ninja'].includes(game)) return res.status(400).json({ok:false,error:'invalid game'});
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const startedAt = Date.now();
  const payload = { sessionId, userId:user.id, game, startedAt };
  const token = signSession(payload);
  res.json({ ok:true, sessionId, game, startedAt, token });
});

function validateAntiCheat(body, userId) {
  const { sessionId, game, startedAt, token, score, meta = {} } = body || {};
  if (!sessionId || !game || !startedAt || !token) {
    // fallback mode: allow but keep minimal validation to avoid dropped scores
    if (!game) return { ok:false, reason:'missing game' };
  } else {
    const expect = signSession({ sessionId, userId, game, startedAt });
    if (expect !== token) return { ok:false, reason:'invalid token' };
  }

  const durSec = startedAt ? Math.max(0, (Date.now() - Number(startedAt))/1000) : 999;
  if (durSec < 1) return { ok:false, reason:'too fast run' };

  if (game === 'hangman') {
    if (Number(meta.wrong) > 6) return { ok:false, reason:'invalid wrong count' };
    if (Number(score) > 400) return { ok:false, reason:'score too high hangman' };
    if (durSec < 6 && Number(score) > 180) return { ok:false, reason:'too quick high score hangman' };
  }

  if (game === 'fruit-ninja') {
    const slices = Number(meta.slices || 0);
    if (slices < 0) return { ok:false, reason:'invalid slices' };
    if (Number(score) > slices * 38 + 420) return { ok:false, reason:'score not plausible vs slices' };
    if (durSec < 15 && Number(score) > 320) return { ok:false, reason:'too fast high score fruit' };
    if (Number(meta.nyawa) > 3) return { ok:false, reason:'invalid nyawa' };
  }

  return { ok:true };
}

// ---- Scores/Leaderboard/Achievements (auth required) ----
app.post('/api/scores', (req,res)=>{
  const user = getEffectiveUser(req);
  if (!user) return res.status(401).json({ ok:false, error:'unauthorized' });

  const { game, score, meta={} } = req.body || {};
  const allowed = ['hangman','fruit-ninja'];
  if (!allowed.includes(game)) return res.status(400).json({ ok:false, error:'invalid game' });
  const nScore = Number(score);
  if (!Number.isFinite(nScore)) return res.status(400).json({ ok:false, error:'invalid score' });

  const check = validateAntiCheat(req.body, user.id);
  const db = readJson(SCORE_FILE, { scores: [] });
  const safeScore = Math.round(nScore);
  const row = {
    id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    game,
    playerName:user.name,
    userId:user.id,
    score:safeScore,
    meta:{ ...(meta||{}), suspicious: !check.ok, antiCheatReason: check.ok ? null : check.reason },
    createdAt:nowIso()
  };
  db.scores.push(row);
  if (db.scores.length > 10000) db.scores = db.scores.slice(-10000);
  writeJson(SCORE_FILE, db);

  const ach = readJson(ACH_FILE, { achievements: [] });
  const pushAch = (code,title,rarity='common') => {
    const exists = ach.achievements.find(a=>a.userId===user.id && a.code===code);
    if (!exists) ach.achievements.push({ id:`a-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, userId:user.id, playerName:user.name, game, code, title, rarity, createdAt:nowIso() });
  };
  if (game==='hangman' && meta?.win) pushAch('hangman-first-win','First Win','common');
  if (game==='hangman' && row.score>=160) pushAch('hangman-sharp','Sharp Guesser','rare');
  if (game==='fruit-ninja' && row.score>=200) pushAch('ninja-slicer','Ninja Slicer','uncommon');
  if (game==='fruit-ninja' && row.score>=400) pushAch('ninja-legend','Ninja Legend','epic');
  if (Number(user.loginCount||0) >= 7) pushAch('login-week','Mingguan Konsisten','uncommon');
  writeJson(ACH_FILE, ach);

  res.json({ ok:true, row, antiCheat: check });
});

app.get('/api/scores/:game/top', (req,res)=>{
  const me = getEffectiveUser(req);
  if (!me) return res.status(401).json({ ok:false, error:'unauthorized' });
  const game = String(req.params.game || '');
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
  const db = readJson(SCORE_FILE, { scores: [] });
  const rows = db.scores.filter(s=>s.game===game).sort((a,b)=>b.score-a.score).slice(0,limit).map(r=>({
    ...r,
    displayName: r.userId === me.id ? r.playerName : maskName(r.playerName)
  }));
  res.json({ ok:true, game, rows });
});

app.get('/api/scores/all/top', (req,res)=>{
  const me = getEffectiveUser(req);
  if (!me) return res.status(401).json({ ok:false, error:'unauthorized' });
  const db = readJson(SCORE_FILE, { scores: [] });
  const top = {};
  for (const g of ['hangman','fruit-ninja']) {
    top[g] = db.scores.filter(s=>s.game===g).sort((a,b)=>b.score-a.score).slice(0,5).map(r=>({ ...r, displayName: r.userId===me.id ? r.playerName : maskName(r.playerName) }));
  }
  res.json({ ok:true, top });
});

app.get('/api/achievements/me', (req,res)=>{
  const me = getEffectiveUser(req);
  if (!me) return res.status(401).json({ ok:false, error:'unauthorized' });
  const ach = readJson(ACH_FILE, { achievements: [] });
  const rows = ach.achievements.filter(a=>a.userId===me.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ ok:true, rows });
});

app.get('/api/achievements/catalog', (req,res)=>{
  const me = getEffectiveUser(req);
  if (!me) return res.status(401).json({ ok:false, error:'unauthorized' });
  const catalog = [
    { code:'first-play', title:'Mainkan game pertamamu', rarity:'common', points:10, game:'all' },
    { code:'hangman-100', title:'Raih skor 100+ di Tebak Kata', rarity:'uncommon', points:25, game:'hangman' },
    { code:'ninja-100', title:'Raih skor 100+ di Fruit Ninja', rarity:'uncommon', points:25, game:'fruit-ninja' },
    { code:'ninja-200', title:'Legenda Ninja 200+', rarity:'rare', points:60, game:'fruit-ninja' },
    { code:'all-games', title:'Mainkan semua game tersedia', rarity:'uncommon', points:30, game:'all' },
    { code:'login-week', title:'Login 7 hari', rarity:'rare', points:40, game:'all' },
    { code:'streak-5', title:'Menang 5 game berturut-turut', rarity:'epic', points:90, game:'all' },
    { code:'score-500', title:'Total skor 500+', rarity:'epic', points:100, game:'all' },
    { code:'veteran-50', title:'Mainkan total 50 game', rarity:'legendary', points:150, game:'all' }
  ];
  const ach = readJson(ACH_FILE, { achievements: [] }).achievements.filter(a=>a.userId===me.id);
  const scores = readJson(SCORE_FILE, { scores: [] }).scores.filter(s=>s.userId===me.id);
  const totalGames = scores.length;
  const totalScore = scores.reduce((a,b)=>a+Number(b.score||0),0);
  const playedGames = new Set(scores.map(s=>s.game));
  const unlocked = new Set(ach.map(a=>a.code));
  if (totalGames>0) unlocked.add('first-play');
  if (scores.some(s=>s.game==='hangman' && Number(s.score)>=100)) unlocked.add('hangman-100');
  if (scores.some(s=>s.game==='fruit-ninja' && Number(s.score)>=100)) unlocked.add('ninja-100');
  if (scores.some(s=>s.game==='fruit-ninja' && Number(s.score)>=200)) unlocked.add('ninja-200');
  if (playedGames.has('hangman') && playedGames.has('fruit-ninja')) unlocked.add('all-games');
  if (Number(me.loginCount||0)>=7) unlocked.add('login-week');
  if (totalScore>=500) unlocked.add('score-500');
  if (totalGames>=50) unlocked.add('veteran-50');

  const rows = catalog.map(c=>({ ...c, unlocked: unlocked.has(c.code) }));
  const stats = { unlocked: rows.filter(r=>r.unlocked).length, total: rows.length, totalPoints: rows.filter(r=>r.unlocked).reduce((a,b)=>a+b.points,0) };
  stats.progress = Math.round((stats.unlocked/stats.total)*100);
  res.json({ ok:true, rows, stats });
});

// ---- Admin endpoints ----
app.get('/api/admin/ai-settings', (_req,res)=>{
  const s = readJson(SETTINGS_FILE, {});
  const model = s?.ai?.openaiModel || 'gpt-4o-mini';
  const hasKey = !!(s?.ai?.openaiApiKey || process.env.OPENAI_API_KEY);
  res.json({ ok:true, hasKey, openaiModel:model });
});

app.post('/api/admin/ai-settings', (req,res)=>{
  const cur = readJson(SETTINGS_FILE, {});
  const ai = {
    openaiApiKey: String(req.body?.openaiApiKey || cur?.ai?.openaiApiKey || ''),
    openaiModel: String(req.body?.openaiModel || cur?.ai?.openaiModel || 'gpt-4o-mini')
  };
  writeJson(SETTINGS_FILE, { ...cur, ai });
  res.json({ ok:true, hasKey: !!ai.openaiApiKey, openaiModel: ai.openaiModel });
});

app.post('/api/admin/generate-phrases', async (req,res)=>{
  const count = Math.min(300, Math.max(1, Number(req.body?.count || 100)));
  const prompt = String(req.body?.prompt || 'roast user, galau, dark joke, romantis receh').trim();
  const settings = readJson(SETTINGS_FILE, {});
  const OPENAI_API_KEY = settings?.ai?.openaiApiKey || process.env.OPENAI_API_KEY || '';
  const OPENAI_MODEL = settings?.ai?.openaiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (OPENAI_API_KEY) {
    try {
      const sys = 'Kamu penulis frase game hangman Indonesia. Hasilkan frase natural, lucu, roasting, galau, dark joke ringan, romantis receh. Balas JSON valid.';
      const user = `Buat ${count} frase bahasa Indonesia untuk game hangman. Aturan: 3-8 kata, uppercase, tidak repetitif, hindari kata kasar ekstrem/SARA. Gaya: ${prompt}. Format: {"phrases":[{"phrase":"...","hint":"roast|galau|dark|humor|romantis"}]}`;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},
        body: JSON.stringify({ model: OPENAI_MODEL, temperature: 1, response_format: { type: 'json_object' }, messages:[{role:'system', content:sys},{role:'user', content:user}] })
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j?.choices?.[0]?.message?.content || '{}';
        let arr = [];
        try { const parsed = JSON.parse(txt); arr = Array.isArray(parsed) ? parsed : (parsed.phrases || parsed.items || []); } catch {}
        const cleaned = (arr || []).map((x,i)=>({
          id:'gen-'+Date.now()+'-'+i,
          phrase:String(x.phrase||'').toUpperCase().replace(/[^A-Z\s]/g,' ').replace(/\s+/g,' ').trim(),
          hint:HINTS.includes(String(x.hint||'').toLowerCase()) ? String(x.hint).toLowerCase() : 'roast',
          source:'openai'
        })).filter(x=>{ const wc=x.phrase.split(/\s+/).filter(Boolean).length; return wc>=3 && wc<=8; }).slice(0,count);
        if (cleaned.length >= Math.max(10, Math.floor(count*0.4))) return res.json({ok:true, provider:'openai', prompt, count:cleaned.length, phrases:cleaned});
      }
    } catch {}
  }

  const fallback = [];
  const pool = ['KAMU JOMBLO YA','SKRIPSIMU MASIH JUDUL DOANG','DIA ONLINE BUKAN BUATMU','HIDUPMU MODE UJI COBA','BESOK KITA KETAWA LAGI'];
  for (let i=0;i<count;i++) fallback.push({ id:'gen-'+Date.now()+'-'+i, phrase:pick(pool), hint:HINTS[i%HINTS.length], source:'fallback' });
  res.json({ ok:true, provider:'fallback', prompt, count:fallback.length, phrases:fallback });
});

app.get('/api/admin/phrases', (_req,res)=>{
  const p = readJson(PHRASE_FILE, { phrases: [] });
  res.json({ ok:true, date:p.date||'', version:p.version||'', phrases:p.phrases||[] });
});

app.post('/api/admin/phrases', (req,res)=>{
  const rows = Array.isArray(req.body?.phrases) ? req.body.phrases : [];
  const cleaned = rows.map((r,i)=>({
    id: String(r.id||`manual-${Date.now()}-${i}`),
    phrase: String(r.phrase||'').toUpperCase().replace(/[^A-Z\s]/g,' ').replace(/\s+/g,' ').trim(),
    hint: String(r.hint||'umum').toLowerCase().trim() || 'umum',
    source: String(r.source||'admin')
  })).filter(x=>{
    const wc=x.phrase.split(/\s+/).filter(Boolean).length;
    return wc>=3 && wc<=8;
  }).slice(0,300);
  const now = new Date().toISOString().slice(0,10);
  const prev = readJson(PHRASE_FILE, { version:'admin-custom' });
  writeJson(PHRASE_FILE, { date: now, version: prev.version || 'admin-custom', phrases: cleaned });
  res.json({ ok:true, count: cleaned.length });
});

app.get('/api/admin/settings', (_req,res)=>{
  const s = readJson(SETTINGS_FILE, {});
  const safe = JSON.parse(JSON.stringify(s || {}));
  if (safe?.ai?.openaiApiKey) safe.ai.openaiApiKey = '***set***';
  safe.waha = safe.waha || { baseUrl:'https://waha.syaefulaz.online', session:'KutuLoncat', apiKey:'***set***' };
  if (safe?.waha?.apiKey) safe.waha.apiKey = '***set***';
  res.json({ ok:true, settings:safe });
});

app.get('/api/admin/waha/diagnostics', async (_req,res)=>{
  const st = readJson(SETTINGS_FILE, {});
  const w = st.waha || {};
  const base = String(w.baseUrl || 'https://waha.syaefulaz.online').replace(/\/$/, '');
  const apiKey = w.apiKey || 'c024b28d55034cb9b674ef62fadfe641';
  const out = { ok:true, baseUrl: base, hasApiKey: !!apiKey, session: w.session || 'KutuLoncat', checks: [] };

  const checks = [
    { name:'sessions-list', url:`${base}/api/sessions/`, headers:{'X-Api-Key': apiKey} },
    { name:'session-detail', url:`${base}/api/sessions/${encodeURIComponent(w.session || 'KutuLoncat')}`, headers:{'X-Api-Key': apiKey} }
  ];

  for (const c of checks) {
    try {
      const r = await fetch(c.url, { headers: c.headers });
      const txt = await r.text();
      out.checks.push({ name:c.name, status:r.status, ok:r.ok, sample:txt.slice(0,180) });
    } catch (e) {
      out.checks.push({ name:c.name, status:0, ok:false, sample:String(e.message || e) });
    }
  }

  res.json(out);
});

app.post('/api/admin/waha/test-send', async (req,res)=>{
  const st = readJson(SETTINGS_FILE, {});
  const w = st.waha || {};
  const base = String(w.baseUrl || 'https://waha.syaefulaz.online').replace(/\/$/, '');
  const apiKey = w.apiKey || 'c024b28d55034cb9b674ef62fadfe641';
  const phone = normalizePhone(req.body?.phone || '');
  if (!phone) return res.status(400).json({ ok:false, error:'phone required' });

  const payload = { session: w.session || 'KutuLoncat', chatId: `${phone.replace('+','')}@c.us`, text: String(req.body?.text || 'Test WAHA dari Admin') };
  const tries = [
    { url:`${base}/api/sendText`, headers:{'X-Api-Key':apiKey} },
    { url:`${base}/api/messages/text`, headers:{'X-Api-Key':apiKey} },
    { url:`${base}/sendText`, headers:{'Authorization':`Bearer ${apiKey}`} }
  ];

  const results = [];
  for (const t of tries) {
    try {
      const r = await fetch(t.url, { method:'POST', headers:{'Content-Type':'application/json', ...(t.headers||{})}, body: JSON.stringify(payload) });
      const txt = await r.text();
      results.push({ url:t.url, status:r.status, ok:r.ok, sample:txt.slice(0,180) });
      if (r.ok) return res.json({ ok:true, via:t.url, results });
    } catch (e) {
      results.push({ url:t.url, status:0, ok:false, sample:String(e.message || e) });
    }
  }

  res.status(502).json({ ok:false, error:'all endpoints failed', results });
});

app.post('/api/admin/settings', (req,res)=>{
  const cur = readJson(SETTINGS_FILE, {});
  const next = { ...cur, ...(req.body||{}) };
  writeJson(SETTINGS_FILE, next);
  res.json({ ok:true });
});

// ---- pages / auth gate ----
app.get('/api/hangman/phrase', requireAuth, (_req,res)=>{
  ensurePhrasesSeed();
  const p = readJson(PHRASE_FILE, { phrases: [] });
  const row = (p.phrases && p.phrases.length) ? p.phrases[Math.floor(Math.random()*p.phrases.length)] : { phrase:'CIE YANG JOMBLO', hint:'roast' };
  res.json({ ok:true, row, antiCheat: check });
});

app.get('/login', (_req,res)=>res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/profile', requireAuth, (_req,res)=>res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/achievements', requireAuth, (_req,res)=>res.sendFile(path.join(__dirname, 'public', 'achievements.html')));
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/hangman', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'hangman.html')));
app.get('/fruit-ninja', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'fruit-ninja.html')));
app.get('/leaderboard', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (_req,res)=>res.redirect('/login'));

app.listen(PORT, '127.0.0.1', () => console.log(`Kutuloncat Games aktif di http://127.0.0.1:${PORT}`));
