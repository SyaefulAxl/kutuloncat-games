# 🚀 KutuLoncat Games — Panduan Deployment ke VPS

## Prasyarat Server

| Requirement | Minimum                    | Recommended      |
| ----------- | -------------------------- | ---------------- |
| OS          | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |
| RAM         | 1 GB                       | 2 GB             |
| Storage     | 5 GB                       | 10 GB            |
| Node.js     | v20.x                      | v22.x LTS        |
| npm         | v10.x                      | Latest           |

---

## Step 1: Setup Server

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 22 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi
node -v   # v22.x.x
npm -v    # 10.x.x

# Install build tools (diperlukan untuk native modules seperti DuckDB)
sudo apt install -y build-essential python3 g++ make

# Install PM2 (process manager)
sudo npm install -g pm2

# (Optional) Install nginx untuk reverse proxy
sudo apt install -y nginx
```

---

## Step 2: Clone & Setup Project

```bash
# Clone repository
cd /opt
git clone https://github.com/YOUR_USERNAME/kutuloncat-games.git
cd kutuloncat-games

# Install dependencies
npm install

# Buat file environment
cp .env.example .env   # atau buat manual:
nano .env
```

### Konfigurasi `.env` (WAJIB untuk Production)

```env
# ============================================
# KutuLoncat Games — Production Environment
# ============================================

# --- Server ---
PORT=3001
NODE_ENV=production

# --- Admin Panel Protection (WAJIB!) ---
ADMIN_PASSWORD=ganti_dengan_password_kuat_anda

# --- OpenAI (opsional, untuk generate frasa hangman via AI) ---
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini

# --- WAHA WhatsApp Gateway (untuk OTP registrasi) ---
WAHA_BASE_URL=https://your-waha-instance.com
WAHA_API_KEY=your-waha-api-key
WAHA_SESSION=KutuLoncat

# --- Anti-Cheat ---
# Biarkan kosong, akan auto-generate saat pertama kali jalan
ANTI_CHEAT_SECRET=
```

> ⚠️ **PENTING**: `ADMIN_PASSWORD` WAJIB diisi di production! Tanpa ini, siapapun bisa akses admin panel.

---

## Step 3: Build Frontend

```bash
# Build Vite SPA (output ke dist/)
npm run build
```

Pastikan output menunjukkan `✓ built in X.XXs` tanpa error.

---

## Step 4: Jalankan Server

### Option A: PM2 (Recommended)

```bash
# Jalankan dengan PM2
pm2 start npm --name "kutuloncat" -- run start

# Auto-start saat server reboot
pm2 startup
pm2 save

# Monitoring
pm2 status
pm2 logs kutuloncat
pm2 monit
```

### Option B: Langsung (untuk testing)

```bash
npm run start
# Server berjalan di http://0.0.0.0:3001
```

---

## Step 5: Setup Nginx Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/kutuloncat
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload size (untuk foto profil)
    client_max_body_size 5M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site & restart nginx
sudo ln -s /etc/nginx/sites-available/kutuloncat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 6: SSL (HTTPS) dengan Let's Encrypt

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew sudah otomatis via systemd timer
sudo certbot renew --dry-run
```

---

## Step 7: Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Struktur Data di Server

Folder `data/` akan auto-generate saat pertama kali jalan:

| File                | Isi                                             |
| ------------------- | ----------------------------------------------- |
| `users.json`        | Data user (auth)                                |
| `sessions.json`     | Session login                                   |
| `scores.json`       | Skor game                                       |
| `achievements.json` | Achievement permanen                            |
| `phrases.json`      | Frasa hangman                                   |
| `otp.json`          | OTP temporary                                   |
| `settings.json`     | Konfigurasi app                                 |
| `kutuloncat.duckdb` | Database DuckDB (phrases, seasons, admin users) |

> 💡 Folder `data/` dan `uploads/` ada di `.gitignore` — **wajib backup berkala!**

---

## Backup & Maintenance

### Backup

```bash
# Backup data folder (jalankan via cron daily)
tar -czf /backup/kutuloncat-data-$(date +%Y%m%d).tar.gz /opt/kutuloncat-games/data /opt/kutuloncat-games/uploads

# Crontab: backup setiap jam 2 pagi
crontab -e
# 0 2 * * * tar -czf /backup/kutuloncat-data-$(date +\%Y\%m\%d).tar.gz /opt/kutuloncat-games/data /opt/kutuloncat-games/uploads
```

### Update Deployment

```bash
cd /opt/kutuloncat-games
git pull origin main
npm install
npm run build
pm2 restart kutuloncat
```

---

## Troubleshooting

| Problem                    | Solution                                                  |
| -------------------------- | --------------------------------------------------------- |
| `EACCES` permission error  | `sudo chown -R $USER:$USER /opt/kutuloncat-games`         |
| DuckDB native module error | `npm rebuild duckdb` atau `npm install` ulang             |
| Port 3001 sudah dipakai    | Ubah `PORT` di `.env` atau kill proses lama               |
| Admin panel terbuka        | Pastikan `ADMIN_PASSWORD` di `.env` terisi                |
| Scores tidak tersimpan     | Cek folder `data/` ada & writable: `chmod 755 data/`      |
| WAHA OTP gagal             | Cek WAHA instance aktif, API key benar, session connected |

---

## Checklist Production ✅

- [ ] `NODE_ENV=production` di `.env`
- [ ] `ADMIN_PASSWORD` di `.env` diisi password kuat
- [ ] `npm run build` berhasil tanpa error
- [ ] Nginx reverse proxy aktif
- [ ] SSL/HTTPS aktif via Let's Encrypt
- [ ] Firewall (UFW) aktif
- [ ] PM2 auto-start aktif (`pm2 startup && pm2 save`)
- [ ] Backup data terjadwal (cron)
- [ ] WAHA WhatsApp gateway terhubung (test kirim OTP)
- [ ] Test login, main game, cek leaderboard dari browser
