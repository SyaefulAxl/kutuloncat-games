# KutuLoncat Games 🎮

Platform mini-game berbasis web dengan **2 game**: Tebak Kata (Hangman) dan Fruit Ninja.

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

# Anti-cheat secret (auto-generated if not set)
ANTI_CHEAT_SECRET=
```

## Project Structure

```
├── src/                    # React frontend
│   ├── components/         #   UI components (shadcn/ui)
│   ├── games/              #   Phaser 3 game scenes
│   │   ├── hangman/        #     Tebak Kata game
│   │   └── fruit-ninja/    #     Fruit Ninja game
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

Tebak Cielimat 3-5 kata Indonesia. Frase di-generate otomatis via OpenAI atau menggunakan frase bawaan. Setiap hari 100 frase baru di-seed.

### Fruit Ninja

Potong buah yang bermunculan, hindari bom! 4 stage kesulitan bertahap dengan kecepatan dan jumlah buah meningkat.

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
| GET    | `/api/scores/all/top`          | Yes   | All leaderboards            |
| GET    | `/api/achievements/me`         | Yes   | My achievements             |
| GET    | `/api/achievements/catalog`    | Yes   | Achievement catalog         |
| GET    | `/api/hangman/phrase`          | Yes   | Random hangman phrase       |
| GET    | `/api/game/fruit-ninja/config` | No    | Game difficulty config      |
| GET    | `/api/admin/*`                 | Admin | Admin panel endpoints       |
