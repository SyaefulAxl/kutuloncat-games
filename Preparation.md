# KutuLoncat Games — Pre-Deployment Preparation Checklist

**Version:** 4.0.0
**Date:** June 2025

---

## Purpose

This document provides a comprehensive checklist for preparing the KutuLoncat Games platform for production deployment.

---

## 1. Infrastructure Requirements

### 1.1 Server

- [ ] VPS/Cloud instance provisioned (min 1 vCPU, 1GB RAM, 20GB SSD)
- [ ] Ubuntu 22.04 LTS or similar Linux distribution
- [ ] Public IP address assigned
- [ ] SSH access configured with key-based authentication
- [ ] Firewall configured (ports 80, 443, 22)

### 1.2 Domain

- [ ] Domain registered (kutuloncat.my.id)
- [ ] DNS A record pointing to server IP
- [ ] SSL certificate provisioned (Let's Encrypt / Certbot)

### 1.3 WAHA Gateway

- [ ] WAHA instance deployed and accessible
- [ ] WhatsApp session created and authenticated
- [ ] API key generated and tested
- [ ] Session auto-restart configured
- [ ] WAHA webhook endpoint verified

---

## 2. Software Prerequisites

### 2.1 Server Software

- [ ] Node.js 18+ installed (`nvm install 18`)
- [ ] npm 9+ available
- [ ] Git installed
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Nginx installed and configured

### 2.2 Nginx Configuration

```nginx
server {
    listen 80;
    server_name kutuloncat.my.id;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name kutuloncat.my.id;

    ssl_certificate /etc/letsencrypt/live/kutuloncat.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kutuloncat.my.id/privkey.pem;

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

---

## 3. Environment Configuration

### 3.1 Environment Variables

- [ ] `.env` file created with all required variables
- [ ] `COOKIE_SECRET` generated (min 32 random characters)
- [ ] `WAHA_URL` pointing to production WAHA instance
- [ ] `WAHA_SESSION` matches active WhatsApp session
- [ ] `WAHA_API_KEY` matches WAHA configuration
- [ ] `OPENAI_API_KEY` valid and has credits
- [ ] `ADMIN_PHONE` set to admin's WhatsApp number
- [ ] `NODE_ENV=production`
- [ ] `BASE_URL=https://kutuloncat.my.id`

### 3.2 Security Checks

- [ ] `.env` is in `.gitignore`
- [ ] No hardcoded secrets in source code
- [ ] Cookie settings use `secure: true` in production
- [ ] CORS configured for production domain only

---

## 4. Application Build

### 4.1 Build Steps

```bash
git clone https://github.com/SyaefulAxl/kutuloncat-games.git
cd kutuloncat-games
npm install
npm run build
```

### 4.2 Build Verification

- [ ] `npm run build` completes without errors
- [ ] `dist/client/` directory contains index.html and assets
- [ ] `dist/server/` directory contains compiled server files
- [ ] No TypeScript errors (`npx tsc --noEmit`)

---

## 5. Data Preparation

### 5.1 Initial Data

- [ ] `data/` directory is writable by Node.js process
- [ ] First server start creates all JSON files automatically
- [ ] DuckDB database file creates and initializes tables
- [ ] Verify `data/phrases.json` has initial Hangman phrases

### 5.2 Backup Strategy

- [ ] Daily backup script for `data/` directory
- [ ] Backup includes: `kutuloncat.duckdb`, all `.json` files
- [ ] Backup retention: minimum 7 days
- [ ] Tested restore procedure

Example backup cron:

```bash
# Daily at 2 AM
0 2 * * * tar -czf /backups/kutuloncat-$(date +\%Y\%m\%d).tar.gz /app/kutuloncat-games/data/
# Cleanup backups older than 7 days
0 3 * * * find /backups/ -name "kutuloncat-*.tar.gz" -mtime +7 -delete
```

---

## 6. Process Management

### 6.1 PM2 Setup

```bash
# Start application
pm2 start server.js --name kutuloncat --env production

# Enable auto-restart on crash
pm2 save

# Enable startup on boot
pm2 startup

# Monitor
pm2 monit
```

### 6.2 PM2 Configuration (ecosystem.config.js)

```javascript
module.exports = {
  apps: [
    {
      name: 'kutuloncat',
      script: 'server.js',
      instances: 1, // DuckDB requires single instance
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
```

---

## 7. Testing Before Go-Live

### 7.1 Functional Tests

- [ ] Registration flow works (OTP sent and received via WhatsApp)
- [ ] Login with OTP works
- [ ] Welcome message received on WhatsApp after registration
- [ ] Login notification received on WhatsApp
- [ ] All 4 games load and are playable
- [ ] Scores save correctly
- [ ] Achievements unlock properly
- [ ] Leaderboard displays correctly (including Overall tab)
- [ ] Referral code generation works
- [ ] Referral link sharing works
- [ ] Referral validation works
- [ ] Referral activation triggers at 2+ games played
- [ ] Profile view/edit works
- [ ] Admin dashboard accessible (admin phone only)
- [ ] Logout works

### 7.2 Performance Tests

- [ ] Page load time < 3 seconds
- [ ] Game canvas renders smoothly (60 FPS)
- [ ] API response time < 500ms
- [ ] No memory leaks after extended play sessions

### 7.3 Security Tests

- [ ] Non-authenticated users cannot access protected routes
- [ ] Admin routes blocked for non-admin users
- [ ] Score submission includes valid HMAC
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (HTML escaping)

---

## 8. Monitoring

### 8.1 Application Monitoring

- [ ] PM2 monitoring enabled
- [ ] Log rotation configured
- [ ] Error alerting set up (optional: webhook to WhatsApp)

### 8.2 Server Monitoring

- [ ] Disk space monitoring (DuckDB can grow)
- [ ] Memory usage monitoring
- [ ] CPU usage monitoring
- [ ] WAHA session health monitoring

---

## 9. Go-Live Procedure

1. ✅ Complete all checklist items above
2. Deploy application to production server
3. Start with PM2
4. Verify Nginx proxy is working
5. Test full user journey (register → play → check leaderboard)
6. Share referral links for initial user acquisition
7. Monitor logs for first 24 hours

---

## 10. Rollback Plan

If critical issues arise after deployment:

```bash
# Stop current version
pm2 stop kutuloncat

# Checkout previous version
git checkout v3.0.0
npm install
npm run build

# Restart
pm2 start kutuloncat

# Restore data backup if needed
tar -xzf /backups/kutuloncat-YYYYMMDD.tar.gz -C /
```

---

_Last updated: June 2025 — v4.0.0_
