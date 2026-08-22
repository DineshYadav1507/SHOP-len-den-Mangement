import fs from 'node:fs';

const file = '/app/server.js';
let source = fs.readFileSync(file, 'utf8');

// Repair the shop-profile migration quoting before Node loads server.js.
const brokenMigration = "'ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT ''',";
const fixedMigration = '"ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT \'\'",';
if (source.includes(brokenMigration)) source = source.replace(brokenMigration, fixedMigration);

// Ensure the WhatsApp session state exists.
if (!source.includes('const waSessions=new Map();')) {
  const anchor = "const log=pino({level:process.env.LOG_LEVEL||'warn'});";
  if (!source.includes(anchor)) throw new Error('Logger anchor not found; refusing unsafe WhatsApp patch');
  source = source.replace(anchor, `${anchor}\nconst waSessions=new Map();const wa=s=>{if(!waSessions.has(s))waSessions.set(s,{sock:null,qr:null,connected:false,connecting:false,phone:null,error:null});return waSessions.get(s)};`);
}

// Always inject a final runtime connector immediately before the application
// routes/startup. Function declarations are hoisted, and the unique marker
// prevents repeated Docker builds from growing server.js indefinitely.
if (!source.includes('SHOPLENDEN_RUNTIME_WA_CONNECTOR_V2')) {
  const marker = "app.use((q,r)=>r.sendFile(path.join(process.cwd(),'public','index.html')))";
  if (!source.includes(marker)) throw new Error('Express startup anchor not found');
  const connector = `/* SHOPLENDEN_RUNTIME_WA_CONNECTOR_V2 */\nasync function connectWA(s){\n  const w=wa(s);\n  if(w.connected||w.connecting)return w;\n  w.connecting=true;\n  const dir=path.join(waDir,\`shop-${s}\`);\n  fs.mkdirSync(dir,{recursive:true});\n  try{\n    const {state,saveCreds}=await useMultiFileAuthState(dir);\n    const sock=makeWASocket({auth:state,browser:Browsers.ubuntu('Shop Khata'),logger:log});\n    w.sock=sock;\n    sock.ev.on('creds.update',saveCreds);\n    sock.ev.on('connection.update',async x=>{\n      if(x.qr)w.qr=await QRCode.toDataURL(x.qr,{width:320,margin:2});\n      if(x.connection==='open'){w.connected=true;w.connecting=false;w.qr=null;w.error=null;w.phone=sock.user?.id?.split(':')[0]?.split('@')[0]||null;log.info({shopId:s},'WhatsApp connected');}\n      if(x.connection==='close'){w.connected=false;w.connecting=false;if(x.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut)setTimeout(()=>connectWA(s),4000);else w.error='WhatsApp logged out; scan QR again';}\n    });\n  }catch(e){w.connecting=false;w.error=e?.message||String(e);log.error({err:e,shopId:s},'WhatsApp connection failed');}\n  return w;\n}\n`;
  source = source.replace(marker, connector + marker);
}

async function resolveWAJid(sock, rawNumber){
  const n=phone(rawNumber);
  if(n.length<10) throw Error('Invalid mobile number');
  try{const results=await sock.onWhatsApp(n);const match=Array.isArray(results)?results.find(x=>x?.exists&&x?.jid):null;if(match?.jid)return match.jid;}catch(e){log.warn({err:e?.message,number:n},'onWhatsApp lookup failed; using normalized JID');}
  return n+'@s.whatsapp.net';
}

const oldSend="async function sendWA(s,to,text){const w=wa(s);if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');const n=phone(to);if(n.length<10)throw Error('Invalid mobile number');return w.sock.sendMessage(`${n}@s.whatsapp.net`,{text})}";
const newSend=`async function sendWA(s,to,text){const w=wa(s);if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');const jid=await resolveWAJid(w.sock,to);return w.sock.sendMessage(jid,{text})}`;
if(source.includes(oldSend))source=source.replace(oldSend,newSend);

fs.writeFileSync(file,source);
console.log('WhatsApp Baileys patch applied successfully');
