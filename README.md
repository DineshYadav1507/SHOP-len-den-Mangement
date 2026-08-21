# Shop Khata — Production Len-Den Management

A mobile-first shop ledger for **Debit / Lena**, **Credit / Jama**, customer statements and owner-connected WhatsApp messaging in Hindi/Hinglish or English.

## Production features

- Owner login / signup with bcrypt password hashing
- Shop-level tenant isolation
- HttpOnly JWT session cookie
- Helmet security headers and authentication rate limiting
- Customer CRUD + archive
- Opening balance
- Debit / Lena and Credit / Jama ledger
- Running customer balance
- Transaction deletion with tenant checks
- Search and mobile-first dashboard
- Read-only customer khata link
- Copy/share khata link
- Hindi/Hinglish + English message templates
- Per-shop WhatsApp session directory
- QR-based WhatsApp connection
- WhatsApp transaction confirmation
- WhatsApp payment reminder
- WhatsApp message audit log
- SQLite WAL database for a single VPS instance
- PM2 and Nginx deployment examples

## Important WhatsApp note

The project uses `@whiskeysockets/baileys` for a WhatsApp Web-style connection. Baileys is an unofficial community library and is not affiliated with WhatsApp. Its maintainers explicitly discourage spam and bulk unsolicited messaging. Use this connector only for legitimate, consent-based customer communication and accept that WhatsApp can change its protocols or restrict accounts. For a business-critical deployment, the messaging layer should eventually be replaceable with the official WhatsApp Business Platform. See the Baileys documentation before production rollout.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and set JWT_SECRET + PUBLIC_URL
npm start
```

Open `http://localhost:3000` and create the shop account.

## Production on Hostinger VPS

1. Install Node.js 20+, Nginx and PM2.
2. Clone this repository.
3. Run `npm ci` (or `npm install` when no lockfile is available).
4. Copy `.env.example` to `.env` and set a strong random `JWT_SECRET` and your HTTPS `PUBLIC_URL`.
5. Keep `data/` on persistent disk and back it up. It contains the SQLite database and WhatsApp authentication state.
6. Configure `deploy/nginx.conf.example`, then issue an SSL certificate with your preferred ACME/Let's Encrypt tooling.
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

## Backup

Back up the entire `data/` directory while the app is stopped or using SQLite's backup tooling. **Never commit WhatsApp session files or `.env`.**

## Architecture

```text
Browser
  │ HTTPS
  ▼
Nginx
  │
  ▼
Express API ─── SQLite (WAL)
  │
  ├── Auth / Tenant isolation
  ├── Customer + Ledger APIs
  ├── Read-only Khata links
  └── Per-shop WhatsApp session
          │
          └── QR → Shop owner's WhatsApp
```

## Ledger semantics

- **Debit / Lena:** shop gives goods/money on credit → customer balance increases.
- **Credit / Jama:** customer pays/returns money → customer balance decreases.
- Positive balance = customer owes the shop.
- Negative balance = customer has an advance with the shop.

## Security checklist before public launch

- Use HTTPS only.
- Set a strong `JWT_SECRET` and keep `.env` private.
- Do not expose port 3000 directly; use Nginx.
- Keep `data/whatsapp/` private and persistent.
- Back up `data/khata.db` regularly.
- Use customer opt-in/legitimate messaging; do not use the WhatsApp connector for spam or bulk unsolicited messages.
- Test restore procedures before relying on the system for accounting data.
