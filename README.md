# KutuLoncat Games 🎮

Platform mini-game berbasis web dengan **12 game**:

- **Season 1:** Tebak Cellimat Pashang (Hangman), Potong Bhuahaya (Fruit Ninja), Anomali Ulariyan (Snake), Piyik Mabur (Flappy Bird), Tehencis (Tetris), AI-m Targetnya (Archery), Space Panic (platformer arcade 1980 dengan combo meter).
- **Season 2 (arcade, code-drawn, no assets):** Pecah Bhata (brick-breaker), Serbu Balik Alien (Galaga-style shooter), Jaga Kotha (Missile Command), Lahap Labirin (Pac-Man style maze-chase), Kodok Nyabrang (Frogger-style road-hopper).

**Daily Challenge:** Space Panic dan seluruh 5 game Season 2 punya mode "Harian" (toggle di header game) — papan peringkat harian terpisah via `/api/scores/:game/daily`. Untuk game dengan tata letak awal yang di-generate (Space Panic, Kodok Nyabrang), seed tanggal (mulberry32 PRNG) membuat starting board identik untuk semua pemain hari itu.

## Tech Stack

| Layer           | Technology                                 |
| --------------- | ------------------------------------------ |
| **Frontend**    | React 19 + TypeScript + Vite 6             |
| **UI**          | Tailwind CSS 4 + shadcn/ui (New York)      |
| **Game Engine** | Phaser 3.87                                |
| **Backend**     | Node.js + Fastify 5                        |
| **Database**    | JSON file storage (DuckDB migration ready) |
| **Auth**        | Cookie session + WhatsApp OTP via WAHA     |

## Quick Start

### Prerequisites

- **Node.js** 18+ (tested on v24)
- **npm** 9+

### Install & Run

```bash
# Install dependencies
npm install

# Start development (Vite + Fastify concurrently)
npm run dev
```

The app will be available at:

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001

### Production Build

```bash
# Build frontend
npm run build

# Start production server (serves both API + built SPA)
npm start
```

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3001
NODE_ENV=development

# Admin panel password (leave empty for dev mode = no auth)
ADMIN_PASSWORD=

# OpenAI for phrase generation
OPENAI_API_KEY=
OPENAI_MODEL=o4-mini

# WAHA WhatsApp gateway
WAHA_BASE_URL=
WAHA_API_KEY=
WAHA_SESSION=KutuLoncat

# Dev only: master OTP diterima untuk semua verifikasi saat NODE_ENV != production
# (default 123456; tidak pernah aktif di production)
DEV_OTP=123456

# Anti-cheat secret (auto-generated if not set)
ANTI_CHEAT_SECRET=
```

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         #   UI components (shadcn/ui)
│   ├── games/              #   Phaser 3 game scenes
│   │   ├── hangman/        #     Tebak Kata game
│   │   ├── fruit-ninja/    #     Fruit Ninja game
│   │   ├── snake/          #     Snake game
│   │   ├── flappy-bird/    #     Flappy Bird game
│   │   ├── tetris/         #     Tetris (Tehencis) game
│   │   ├── archery/        #     Archery (AI-m Targetnya) game
│   │   ├── spacepanic/     #     Space Panic game
│   │   └── arcade/         #     Season 2: kit.ts (shared engine) +
│   │                       #     Brick/Raid/Sky/Maze/HopperScene
│   ├── hooks/              #   React hooks (auth)
│   ├── lib/                #   Utilities & API client
│   └── pages/              #   Page components
├── server/                 # Fastify backend
│   ├── lib/                #   Storage, auth, anti-cheat
│   └── routes/             #   API route handlers
├── data/                   # JSON data files (auto-created)
├── uploads/                # User avatar uploads
├── dist/                   # Production build output
└── vite.config.ts          # Vite + proxy configuration
```

## Available Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Start dev servers (Vite + Fastify) |
| `npm run dev:client` | Vite dev server only               |
| `npm run dev:server` | Fastify API server only            |
| `npm run build`      | Production build                   |
| `npm start`          | Start production server            |

## Games

### Tebak Kata (Hangman)

Tebak Cellimat Pashang 3-5 kata Indonesia. Frase di-generate otomatis via OpenAI atau menggunakan frase bawaan. Setiap hari 100 frase baru di-seed.

### Fruit Ninja

Potong buah yang bermunculan, hindari bom! 4 stage kesulitan bertahap dengan kecepatan dan jumlah buah meningkat.

### Snake

Klasik snake game — arahkan ular memakan makanan. Multiple difficulty levels termasuk "Gak Ngotak". Combo system untuk bonus poin.

### Flappy Bird

Navigasikan burung melewati pipa. Skor berdasarkan jumlah pipa yang berhasil dilewati.

### Tetris (Tehencis)

Klasik Tetris — susun blok, bersihkan baris. Kontrol swipe untuk mobile, ada hold piece dan next preview. Double-tap untuk hard drop.

### Archery (AI-m Targetnya)

Bidik target dengan panah! Animated background dengan siklus siang/malam. Berbagai tipe target: normal, kecil, bergerak, dan bonus.

### Space Panic

Platformer arcade 1980-style: gali lantai, jebak alien, kumpulkan combo. Mode Daily Challenge dengan seed tanggal (starting layout sama untuk semua pemain hari itu).

### Season 2 — Pecah Bhata (Brick Breaker)

Pantulkan bola, hancurkan bata. Combo tanpa menyentuh paddle = skor x5. Power-up wide/multi/slow, level tanpa akhir.

### Season 2 — Serbu Balik Alien (Space Raid)

Galaga-style: kapal menembak otomatis, kemudikan untuk menghindar. Rantai kill = skor x5. Gold Overlord boss tiap wave ke-5.

### Season 2 — Jaga Kotha (Sky Defense)

Missile Command-style: tap untuk meledakkan pencegat, lindungi 6 kota. Ledakan bisa berantai, rudal terbelah di wave lanjut.

### Season 2 — Lahap Labirin (Maze Chase)

Pac-Man style: makan semua titik, hindari 3 hantu AI. Pelet besar membalik keadaan, rantai makan hantu 200→1600.

### Season 2 — Kodok Nyabrang (Road Hopper)

Frogger-style: seberangi 5 jalur jalan raya + sungai berlog ke 5 sarang sebelum waktu habis. Bonus waktu tiap sarang terisi.

## API Endpoints

| Method | Path                           | Auth  | Description                 |
| ------ | ------------------------------ | ----- | --------------------------- |
| GET    | `/health`                      | No    | Health check                |
| POST   | `/api/auth/request-otp`        | No    | Request OTP via WhatsApp    |
| POST   | `/api/auth/verify-otp`         | No    | Verify OTP & create session |
| POST   | `/api/auth/login-number`       | No    | Login by phone number       |
| POST   | `/api/auth/logout`             | No    | Logout                      |
| GET    | `/api/me`                      | Yes   | Current user profile        |
| POST   | `/api/me`                      | Yes   | Update profile              |
| POST   | `/api/me/photo`                | Yes   | Upload avatar               |
| POST   | `/api/session/start`           | Yes   | Start game session          |
| POST   | `/api/scores`                  | Yes   | Submit score                |
| GET    | `/api/scores/:game/top`        | Yes   | Top scores                  |
| GET    | `/api/scores/:game/daily`      | Yes   | Daily Challenge leaderboard (best clean run submitted today) |
| GET    | `/api/scores/all/top`          | Yes   | All leaderboards            |
| GET    | `/api/scores/overall/top`      | Yes   | Overall composite leaderboard (Formula B) |
| GET    | `/api/achievements/me`         | Yes   | My achievements             |
| GET    | `/api/achievements/catalog`    | Yes   | Achievement catalog         |
| GET    | `/api/hangman/phrase`          | Yes   | Random hangman phrase       |
| GET    | `/api/game/fruit-ninja/config` | No    | Game difficulty config      |
| GET    | `/api/admin/*`                 | Admin | Admin panel endpoints       |
