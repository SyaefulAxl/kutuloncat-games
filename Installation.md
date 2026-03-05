# KutuLoncat Games — Installation Guide

**Version:** 4.0.0
**Date:** June 2025

---

## Prerequisites

Ensure the following are installed on your system:

| Software | Minimum Version | Check Command |
| -------- | --------------- | ------------- |
| Node.js  | 18.x (LTS)      | `node -v`     |
| npm      | 9.x             | `npm -v`      |
| Git      | 2.x             | `git -v`      |

### Optional

- **PM2** (for production process management): `npm install -g pm2`
- **Nginx** (reverse proxy, production)

---

## 1. Clone Repository

```bash
git clone https://github.com/SyaefulAxl/kutuloncat-games.git
cd kutuloncat-games
```

---

## 2. Install Dependencies

```bash
npm install
```

This installs both production and development dependencies including:

- **Frontend:** React 19, Vite 6, Phaser 3.87, Tailwind CSS v4, shadcn/ui
- **Backend:** Fastify 5, DuckDB 1.4, node-fetch, uuid
- **Dev:** TypeScript 5.7, ESLint, PostCSS

---

## 3. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env   # If .env.example exists
# OR create manually:
```

Required environment variables:

```env
# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Session
COOKIE_SECRET=your-random-secret-here-min-32-chars

# WAHA WhatsApp Gateway
WAHA_URL=https://your-waha-instance.example.com
WAHA_SESSION=YourSession
WAHA_API_KEY=your-waha-api-key

# OpenAI (for phrase generation)
OPENAI_API_KEY=sk-your-openai-key

# Admin
ADMIN_PHONE=628xxxxxxxxxx

# Application
BASE_URL=http://localhost:5173
```

### Environment Variables Reference

| Variable         | Required | Description                           |
| ---------------- | -------- | ------------------------------------- |
| `PORT`           | Yes      | Backend server port (default: 3001)   |
| `HOST`           | No       | Bind address (default: 0.0.0.0)       |
| `NODE_ENV`       | No       | `development` or `production`         |
| `COOKIE_SECRET`  | Yes      | Session encryption key (min 32 chars) |
| `WAHA_URL`       | Yes      | WAHA WhatsApp gateway base URL        |
| `WAHA_SESSION`   | Yes      | WAHA session name                     |
| `WAHA_API_KEY`   | Yes      | WAHA API authentication key           |
| `OPENAI_API_KEY` | Yes      | OpenAI API key for phrase generation  |
| `ADMIN_PHONE`    | Yes      | Admin phone number (62xxx format)     |
| `BASE_URL`       | No       | Frontend URL for referral links       |

---

## 4. Initialize Data Directory

The application auto-creates the `data/` directory on first start with default JSON files and DuckDB database. No manual initialization needed.

If you want to pre-create:

```bash
mkdir -p data
```

---

## 5. Development Mode

Start both frontend and backend in development mode:

```bash
npm run dev
```

This starts:

- **Vite dev server** on `http://localhost:5173` (frontend with HMR)
- **Fastify server** on `http://localhost:3001` (API backend)

The Vite config proxies `/api/*` requests to the Fastify backend automatically.

---

## 6. Production Build

### Build the frontend:

```bash
npm run build
```

This creates optimized assets in `dist/client/`.

### Start production server:

```bash
npm start
# OR with PM2:
pm2 start server.js --name kutuloncat
```

The production server serves both the API and static frontend files from `dist/client/`.

---

## 7. Directory Structure

After installation and first run:

```
kutuloncat-games/
├── data/                    # Auto-created runtime data
│   ├── kutuloncat.duckdb    # DuckDB database
│   ├── users.json           # User records
│   ├── sessions.json        # Active sessions
│   ├── scores.json          # Game scores
│   ├── achievements.json    # Player achievements
│   ├── phrases.json         # Hangman phrases
│   ├── otp.json             # Pending OTPs
│   ├── settings.json        # App settings
│   └── referrals.json       # Referral tracking
├── dist/                    # Build output
│   ├── client/              # Frontend bundle
│   └── server/              # Compiled server
├── public/                  # Legacy static pages
├── scripts/                 # Utility scripts
├── server/                  # Backend source
│   ├── index.ts             # Fastify entry
│   ├── lib/                 # Shared libs (db, storage, auth)
│   └── routes/              # API route modules
├── src/                     # Frontend source
│   ├── components/          # React components
│   ├── games/               # Phaser game scenes
│   ├── lib/                 # API client, auth context
│   └── pages/               # Page components
├── .env                     # Environment config (gitignored)
├── package.json
├── server.js                # Production entry point
├── tsconfig.json
└── vite.config.ts
```

---

## 8. Troubleshooting

### Common Issues

| Problem                       | Solution                                                       |
| ----------------------------- | -------------------------------------------------------------- |
| `npm install` fails on DuckDB | Ensure Node.js 18+ and compatible OS (Linux/macOS/Windows x64) |
| WAHA connection refused       | Verify WAHA_URL is accessible and session is active            |
| OTP not received              | Check WAHA session status, verify phone number format (62xxx)  |
| Build fails TypeScript errors | Run `npx tsc --noEmit` to see detailed errors                  |
| Port 3001 already in use      | Change PORT in .env or kill existing process                   |
| DuckDB lock error             | Ensure only one server instance is running                     |

### Reset Data

To start fresh, delete the `data/` directory:

```bash
rm -rf data/
npm start  # Auto-recreates with defaults
```

---

## 9. Verify Installation

After starting:

1. Open `http://localhost:5173` in browser
2. Click "Daftar" (Register)
3. Enter name, phone, and email
4. Receive OTP via WhatsApp
5. Enter OTP code
6. You should see the Dashboard with 4 games

If all steps succeed, installation is complete! 🎉
