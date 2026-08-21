# Shop Khata — Production Len-Den Management

Mobile-first Hindi/English shop ledger for **Debit / Lena**, **Credit / Jama**, customer statements, reports, PDF statements, WhatsApp messaging and reminders.

## Production features

- Owner login/signup with bcrypt hashing
- Shop-level tenant isolation
- HttpOnly JWT session cookie
- Helmet security headers + auth rate limiting
- Customer CRUD, archive, opening balance and search
- Debit/Lena and Credit/Jama ledger with running balance
- Read-only customer Khata link
- Daily/date-range/customer reports
- PDF customer statements
- WhatsApp transaction confirmations and payment reminders
- Hindi/Hinglish and English message templates
- WhatsApp message audit history
- Reminder records with frequency/next-run fields
- SQLite WAL database for a single VPS instance
- Safe SQLite backup command and 14-day local backup rotation
- PM2/Nginx deployment configuration
- GitHub Actions Node 20 CI

## Important WhatsApp note

The project uses `@whiskeysockets/baileys` for a WhatsApp Web-style connection. Baileys is an unofficial community library and is not affiliated with WhatsApp. Use it only for legitimate, consent-based customer communication. WhatsApp may change its protocols or restrict accounts. For a business-critical deployment, keep the messaging layer replaceable so an official WhatsApp Business Platform connector can be introduced later.

## Local setup

```bash
npm install
cp .env.example .env
# set JWT_SECRET and PUBLIC_URL
npm start
```

Open `http://localhost:3000` and create a shop account.

## Hostinger VPS production deployment

1. Install Node.js 20+, Nginx and PM2.
2. Clone the repository and enter the project directory.
3. Run `npm install` (commit a lockfile after the first verified install if your deployment process requires `npm ci`).
4. Copy `.env.example` to `.env` and set a long random `JWT_SECRET` plus the real HTTPS `PUBLIC_URL`.
5. Keep `data/` on persistent storage. It contains the SQLite database and WhatsApp authentication state.
6. Configure `deploy/nginx.conf.example` for your domain and enable HTTPS with Let's Encrypt/ACME.
7. Start with:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

8. Verify:

```bash
curl https://your-domain.com/api/health
```

## Database backup and restore

Create a consistent SQLite backup without stopping the app:

```bash
npm run backup
```

Or schedule the included script daily:

```cron
15 2 * * * /var/www/shop-khata/deploy/backup-cron.sh >> /var/log/shop-khata-backup.log 2>&1
```

The script keeps 14 days of local backups. For real production accounting data, copy backups to separate storage as well. A restore should be tested on a separate instance before replacing the live `data/khata.db`.

**Never commit `.env`, SQLite databases, backups or WhatsApp session files.**

## Architecture

```text
Browser
  │ HTTPS
  ▼
Nginx
  │
  ▼
Express API ─── SQLite WAL
  │
  ├── Auth / Tenant isolation
  ├── Customer + Ledger APIs
  ├── Reports + PDF statements
  ├── Templates + Reminders
  └── Per-shop WhatsApp session
          │
          └── QR → Shop owner's WhatsApp
```

## Ledger semantics

- **Debit / Lena:** credit sale/goods given → customer balance increases.
- **Credit / Jama:** customer payment/return → customer balance decreases.
- Positive balance = customer owes the shop.
- Negative balance = customer has an advance.

## Pre-launch checklist

- [ ] HTTPS enabled and port 3000 not publicly exposed
- [ ] Strong `JWT_SECRET` configured
- [ ] `PUBLIC_URL` set to the real HTTPS domain
- [ ] `npm install` completes successfully on the VPS
- [ ] `/api/health` returns `{ ok: true }`
- [ ] Login/signup smoke-tested
- [ ] Customer + debit/credit smoke-tested
- [ ] PDF statement downloaded and opened
- [ ] WhatsApp QR connection/reconnect tested
- [ ] Backup created and restore tested on a separate copy
- [ ] Daily backup cron configured
- [ ] Customer messaging is consent-based
