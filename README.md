# Shop Khata — Len-Den Management

A lightweight Hindi/English shop ledger with customer-wise debit/credit tracking and WhatsApp Web connection through Baileys.

## Features

- Customer / party management
- Debit = amount given / customer owes the shop
- Credit = amount received / balance reduced
- Running balance and transaction history
- Hindi/Hinglish and English WhatsApp templates
- QR-based WhatsApp Web connection
- Automatic WhatsApp transaction confirmation
- WhatsApp payment reminder
- Shareable read-only customer khata link
- SQLite database; suitable for a small shop deployment
- Responsive mobile-first UI

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For WhatsApp links to work after deployment, set:

```env
PORT=3000
PUBLIC_URL=https://your-domain.com
```

## WhatsApp

The project uses `@whiskeysockets/baileys`, an unofficial WhatsApp Web library. It connects the shop owner's WhatsApp account by QR code. Keep the WhatsApp session data on the server and do not commit `data/` to Git.

Use only for legitimate, consent-based customer communication; avoid spam or bulk unsolicited messaging. WhatsApp policies and the library's terms still apply.

## Production notes

- Put the app behind HTTPS and a reverse proxy such as Nginx.
- Keep `data/whatsapp-auth` persistent across restarts/deployments.
- Back up `data/khata.db` regularly.
- Add authentication before exposing the dashboard publicly.
- For multi-shop SaaS, add users/shops and isolate every shop's database rows before production.
