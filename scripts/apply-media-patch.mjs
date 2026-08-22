import fs from 'node:fs';

const file = 'server.js';
let s = fs.readFileSync(file, 'utf8');

if (!s.includes("from './scripts/ledger-media.js'")) {
  s = s.replace("import pino from 'pino';", "import pino from 'pino';\nimport { createTransactionCard, createStatementPdf } from './scripts/ledger-media.js';");
}

if (!s.includes('ALTER TABLE shops ADD COLUMN phone')) {
  const migration = `\n// Shop profile fields used on payment cards and branded statements.\nfor (const sql of [\n  'ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT \'\'',\n  'ALTER TABLE shops ADD COLUMN whatsapp TEXT DEFAULT \'\'',\n  'ALTER TABLE shops ADD COLUMN upi_id TEXT DEFAULT \'\'',\n  'ALTER TABLE shops ADD COLUMN address TEXT DEFAULT \'\'',\n  'ALTER TABLE shops ADD COLUMN email TEXT DEFAULT \'\'',\n  'ALTER TABLE shops ADD COLUMN theme_color TEXT DEFAULT \'#7c3aed\''\n]) { try { db.exec(sql); } catch {} }\n`;
  s = s.replace("app.disable('x-powered-by');", migration + "\napp.disable('x-powered-by');");
}

if (!s.includes('async function sendWAMedia')) {
  const mediaFn = `\nasync function sendWAMedia(s,to,content){\n  const w=wa(s);\n  if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');\n  const n=phone(to);\n  if(n.length<10)throw Error('Invalid mobile number');\n  let jid=\`${'${n}'}@s.whatsapp.net\`;\n  try{const found=await w.sock.onWhatsApp(n);if(found?.[0]?.jid)jid=found[0].jid}catch{}\n  return w.sock.sendMessage(jid,content);\n}\n`;
  s = s.replace("const link=c=>", mediaFn + "\nconst link=c=>");
}

if (!s.includes("app.get('/api/shop/profile'")) {
  const routes = `\napp.get('/api/shop/profile',auth,(q,r)=>{const shop=db.prepare('SELECT id,name,owner_name,phone,whatsapp,upi_id,address,email,theme_color FROM shops WHERE id=?').get(q.shopId);r.json({shop})});\napp.patch('/api/shop/profile',auth,(q,r)=>{const b=q.body||{};const name=String(b.name||'').trim();if(!name)return r.status(400).json({error:'Shop name is required'});db.prepare('UPDATE shops SET name=?,phone=?,whatsapp=?,upi_id=?,address=?,email=?,theme_color=? WHERE id=?').run(name,String(b.phone||'').trim(),String(b.whatsapp||'').trim(),String(b.upi_id||'').trim(),String(b.address||'').trim(),String(b.email||'').trim(),/^#[0-9a-fA-F]{6}$/.test(String(b.theme_color||''))?String(b.theme_color):'#7c3aed',q.shopId);r.json({shop:db.prepare('SELECT id,name,owner_name,phone,whatsapp,upi_id,address,email,theme_color FROM shops WHERE id=?').get(q.shopId)})});\n`;
  s = s.replace("app.get('/api/health'", routes + "\napp.get('/api/health'");
}

if (!s.includes("app.get('/api/customers/:id/statement.pdf'")) {
  const route = `\napp.get('/api/customers/:id/statement.pdf',auth,async(q,r)=>{const c=customer(q.shopId,q.params.id);if(!c)return r.status(404).json({error:'Customer not found'});const shop=db.prepare('SELECT id,name,owner_name,phone,whatsapp,upi_id,address,email,theme_color FROM shops WHERE id=?').get(q.shopId);const txs=db.prepare('SELECT * FROM transactions WHERE shop_id=? AND customer_id=? ORDER BY id ASC').all(q.shopId,c.id);const pdf=await createStatementPdf({shop,customer:c,transactions:txs,balance:balance(q.shopId,c.id)});r.set('Content-Type','application/pdf');r.set('Content-Disposition',\`inline; filename="${'${encodeURIComponent(c.name)}'}-Khata.pdf"\`);r.send(pdf)});\n`;
  s = s.replace("app.delete('/api/transactions/:id'", route + "\napp.delete('/api/transactions/:id'");
}

if (!s.includes('MEDIA_BUNDLE_V1')) {
  const marker = "if(q.body?.sendWhatsApp!==false){const text=txMessage(c,t,b);try{await sendWA(q.shopId,c.phone,text);sent=true;db.prepare('INSERT INTO whatsapp_messages(shop_id,customer_id,message,status) VALUES(?,?,?,?)').run(q.shopId,c.id,text,'sent')}catch(e){error=e.message;db.prepare('INSERT INTO whatsapp_messages(shop_id,customer_id,message,status,error) VALUES(?,?,?,?,?)').run(q.shopId,c.id,text,'failed',error)}}";
  const replacement = `/* MEDIA_BUNDLE_V1 */if(q.body?.sendWhatsApp!==false){const text=txMessage(c,t,b);try{await sendWA(q.shopId,c.phone,text);const shop=db.prepare('SELECT id,name,owner_name,phone,whatsapp,upi_id,address,email,theme_color FROM shops WHERE id=?').get(q.shopId);const txs=db.prepare('SELECT * FROM transactions WHERE shop_id=? AND customer_id=? ORDER BY id ASC').all(q.shopId,c.id);const card=await createTransactionCard({shop,customer:c,transaction:t,balance:b});await sendWAMedia(q.shopId,c.phone,{image:card,mimetype:'image/jpeg',caption:text});const pdf=await createStatementPdf({shop,customer:c,transactions:txs,balance:b});await sendWAMedia(q.shopId,c.phone,{document:pdf,mimetype:'application/pdf',fileName:\`${'${c.name}'}-Khata.pdf\`,caption:\`Full Khata Statement - ${'${shop.name}'}\`});sent=true;db.prepare('INSERT INTO whatsapp_messages(shop_id,customer_id,message,status) VALUES(?,?,?,?)').run(q.shopId,c.id,text,'sent')}catch(e){error=e.message;db.prepare('INSERT INTO whatsapp_messages(shop_id,customer_id,message,status,error) VALUES(?,?,?,?,?)').run(q.shopId,c.id,text,'failed',error)}}`;
  if (!s.includes(marker)) throw new Error('Transaction WhatsApp block not found; aborting patch');
  s = s.replace(marker, replacement);
}

fs.writeFileSync(file, s);
console.log('ShopLenden media integration applied');
