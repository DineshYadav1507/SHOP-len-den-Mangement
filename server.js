import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const dataDir = path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'khata.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL,language TEXT NOT NULL DEFAULT 'hi',share_token TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER NOT NULL,type TEXT NOT NULL CHECK(type IN ('DEBIT','CREDIT')),amount INTEGER NOT NULL CHECK(amount > 0),note TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS whatsapp_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER,direction TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

const wa = { sock: null, qr: null, connected: false, phone: null, connecting: false, error: null };
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
const authPath = path.join(dataDir, 'whatsapp-auth');
const normalizePhone = phone => String(phone || '').replace(/\D/g, '');
const balanceFor = customerId => db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='DEBIT' THEN amount ELSE -amount END),0) balance FROM transactions WHERE customer_id=?`).get(customerId).balance;
const customerView = row => ({ ...row, balance: balanceFor(row.id) });
const makeShareToken = () => crypto.randomBytes(18).toString('hex');

async function connectWhatsApp() {
  if (wa.connecting || wa.connected) return;
  wa.connecting = true; wa.error = null;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const sock = makeWASocket({ auth: state, browser: Browsers.ubuntu('Shop Khata'), logger });
    wa.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) wa.qr = await QRCode.toDataURL(qr, { margin: 2, width: 320 });
      if (connection === 'open') { wa.connected = true; wa.connecting = false; wa.qr = null; wa.error = null; wa.phone = sock.user?.id?.split(':')[0]?.split('@')[0] || null; }
      if (connection === 'close') { wa.connected = false; wa.connecting = false; const code = lastDisconnect?.error?.output?.statusCode; if (code !== DisconnectReason.loggedOut) setTimeout(connectWhatsApp, 3000); else wa.error = 'WhatsApp logged out. Reconnect by scanning a new QR.'; }
    });
  } catch (e) { wa.connecting = false; wa.error = e.message; }
}
async function sendWhatsApp(phone, text) { if (!wa.connected || !wa.sock) throw new Error('WhatsApp is not connected'); const number = normalizePhone(phone); if (!number) throw new Error('Invalid phone number'); return wa.sock.sendMessage(`${number}@s.whatsapp.net`, { text }); }
function transactionMessage(customer, tx, balance) {
  const hindi = customer.language !== 'en';
  const direction = tx.type === 'DEBIT' ? (hindi ? 'Aapke khate me udhaar diya / lena hai' : 'Amount added to your due balance') : (hindi ? 'Aapke khate me jama / dena hai' : 'Amount received / balance reduced');
  const balanceText = balance >= 0 ? (hindi ? `Aapko dena hai: ₹${balance}` : `You need to pay: ₹${balance}`) : (hindi ? `Hume dena hai: ₹${Math.abs(balance)}` : `We need to pay: ₹${Math.abs(balance)}`);
  const link = `${PUBLIC_URL}/khata/${customer.share_token}`;
  return hindi ? `Namaste ${customer.name} ji,\n\n₹${tx.amount} ka len-den add hua.\n${direction}\n${tx.note ? `Note: ${tx.note}\n` : ''}\nCurrent balance: ${balanceText}\n\nKhata dekhein: ${link}\n\nDhanyavaad 🙏` : `Hello ${customer.name},\n\nA transaction of ₹${tx.amount} was added.\n${direction}\n${tx.note ? `Note: ${tx.note}\n` : ''}\nCurrent balance: ${balanceText}\n\nView khata: ${link}\n\nThank you.`;
}

app.get('/api/dashboard', (_req,res)=>{ const customers=db.prepare('SELECT * FROM customers ORDER BY name COLLATE NOCASE').all().map(customerView); const totals=db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='DEBIT' THEN amount ELSE 0 END),0) given,COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount ELSE 0 END),0) received FROM transactions`).get(); res.json({customers,totals,whatsapp:{connected:wa.connected,connecting:wa.connecting,phone:wa.phone,hasQr:Boolean(wa.qr),error:wa.error}}); });
app.get('/api/customers/:id',(req,res)=>{ const customer=db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if(!customer)return res.status(404).json({error:'Customer not found'}); const transactions=db.prepare('SELECT * FROM transactions WHERE customer_id=? ORDER BY id DESC').all(customer.id); res.json({customer:customerView(customer),transactions}); });
app.post('/api/customers',(req,res)=>{ const name=String(req.body.name||'').trim(),phone=normalizePhone(req.body.phone),language=req.body.language==='en'?'en':'hi'; if(!name||phone.length<10)return res.status(400).json({error:'Name and valid mobile number are required'}); const result=db.prepare('INSERT INTO customers(name,phone,language,share_token) VALUES(?,?,?,?)').run(name,phone,language,makeShareToken()); res.json(customerView(db.prepare('SELECT * FROM customers WHERE id=?').get(result.lastInsertRowid))); });
app.patch('/api/customers/:id',(req,res)=>{ const existing=db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if(!existing)return res.status(404).json({error:'Customer not found'}); const name=String(req.body.name??existing.name).trim(),phone=normalizePhone(req.body.phone??existing.phone),language=req.body.language==='en'?'en':(req.body.language==='hi'?'hi':existing.language); db.prepare('UPDATE customers SET name=?,phone=?,language=? WHERE id=?').run(name,phone,language,existing.id); res.json(customerView(db.prepare('SELECT * FROM customers WHERE id=?').get(existing.id))); });
app.post('/api/customers/:id/transactions',async(req,res)=>{ const customer=db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if(!customer)return res.status(404).json({error:'Customer not found'}); const type=req.body.type==='CREDIT'?'CREDIT':'DEBIT',amount=Math.round(Number(req.body.amount)),note=String(req.body.note||'').trim().slice(0,300); if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:'Enter a valid amount'}); const tx=db.prepare('INSERT INTO transactions(customer_id,type,amount,note) VALUES(?,?,?,?)').run(customer.id,type,amount,note),transaction=db.prepare('SELECT * FROM transactions WHERE id=?').get(tx.lastInsertRowid),balance=balanceFor(customer.id); let whatsapp={sent:false}; if(req.body.sendWhatsApp!==false){ const text=transactionMessage(customer,transaction,balance); try{await sendWhatsApp(customer.phone,text);db.prepare('INSERT INTO whatsapp_messages(customer_id,direction,message,status) VALUES(?,?,?,?)').run(customer.id,'outbound',text,'sent');whatsapp={sent:true};}catch(e){db.prepare('INSERT INTO whatsapp_messages(customer_id,direction,message,status) VALUES(?,?,?,?)').run(customer.id,'outbound',text,'failed');whatsapp={sent:false,error:e.message};} } res.json({transaction,balance,whatsapp}); });
app.post('/api/customers/:id/send-reminder',async(req,res)=>{ const customer=db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id); if(!customer)return res.status(404).json({error:'Customer not found'}); const balance=balanceFor(customer.id); if(balance<=0)return res.status(400).json({error:'No amount is due from this customer'}); const hindi=customer.language!=='en',text=hindi?`Namaste ${customer.name} ji 🙏\nAapke khate me ₹${balance} baki hai.\nKripya suvidha anusar payment kar dein.\n\nKhata: ${PUBLIC_URL}/khata/${customer.share_token}`:`Hello ${customer.name},\nYour current due balance is ₹${balance}.\nPlease make the payment when convenient.\n\nKhata: ${PUBLIC_URL}/khata/${customer.share_token}`; try{await sendWhatsApp(customer.phone,text);db.prepare('INSERT INTO whatsapp_messages(customer_id,direction,message,status) VALUES(?,?,?,?)').run(customer.id,'outbound',text,'sent');res.json({sent:true});}catch(e){res.status(503).json({error:e.message});} });
app.get('/api/whatsapp/status',(_req,res)=>res.json({connected:wa.connected,connecting:wa.connecting,phone:wa.phone,qr:wa.qr,error:wa.error}));
app.post('/api/whatsapp/connect',(_req,res)=>{connectWhatsApp();res.json({ok:true});});
app.post('/api/whatsapp/logout',async(_req,res)=>{try{if(wa.sock)await wa.sock.logout();}catch{} wa.connected=false;wa.phone=null;wa.qr=null;wa.error=null;res.json({ok:true});});

app.get('/khata/:token',(req,res)=>{ const customer=db.prepare('SELECT * FROM customers WHERE share_token=?').get(req.params.token); if(!customer)return res.status(404).send('Khata not found'); const transactions=db.prepare('SELECT * FROM transactions WHERE customer_id=? ORDER BY id DESC').all(customer.id),balance=balanceFor(customer.id); const rows=transactions.map(t=>`<tr><td>${new Date(t.created_at).toLocaleDateString('en-IN')}</td><td>${t.type}</td><td>₹${t.amount.toLocaleString('en-IN')}</td><td>${String(t.note||'').replace(/[<>]/g,'')}</td></tr>`).join(''); res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${customer.name} - Khata</title><style>body{font-family:system-ui;margin:0;background:#f5f7fb;color:#172033}.card{max-width:760px;margin:30px auto;padding:24px;background:white;border-radius:20px;box-shadow:0 8px 30px #0001}h1{margin:0 0 6px}.bal{font-size:28px;font-weight:800;margin:20px 0}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #eee;text-align:left}@media(max-width:600px){.card{margin:0;border-radius:0;min-height:100vh}}</style></head><body><main class="card"><h1>${customer.name}</h1><div>Shop Khata</div><div class="bal">Balance: ₹${Math.abs(balance).toLocaleString('en-IN')} ${balance>=0?'Due / लेना है':'Advance / देना है'}</div><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`); });
app.use((_req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));
app.listen(PORT,()=>{console.log(`Shop Khata running on ${PORT}`);connectWhatsApp();});
