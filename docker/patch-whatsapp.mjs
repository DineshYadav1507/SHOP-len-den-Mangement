import fs from 'node:fs';

const file = '/app/server.js';
let source = fs.readFileSync(file, 'utf8');

const brokenMigration = "'ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT ''',";
const fixedMigration = '"ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT \'\'",';
if (source.includes(brokenMigration)) source = source.replace(brokenMigration, fixedMigration);

if (!source.includes('const waSessions=new Map();')) {
  const anchor = "const log=pino({level:process.env.LOG_LEVEL||'warn'});";
  if (!source.includes(anchor)) throw new Error('Logger anchor not found; refusing unsafe WhatsApp patch');
  const waState = "const waSessions=new Map();const wa=s=>{if(!waSessions.has(s))waSessions.set(s,{sock:null,qr:null,connected:false,connecting:false,phone:null,error:null});return waSessions.get(s)};";
  source = source.replace(anchor, anchor + '\n' + waState);
}

if (!source.includes('SHOPLENDEN_RUNTIME_WA_CONNECTOR_V3')) {
  const marker = "app.use((q,r)=>r.sendFile(path.join(process.cwd(),'public','index.html')))";
  if (!source.includes(marker)) throw new Error('Express startup anchor not found');
  const connector = [
    '/* SHOPLENDEN_RUNTIME_WA_CONNECTOR_V3 */',
    'async function connectWA(s){',
    '  const w=wa(s);',
    '  if(w.connected||w.connecting)return w;',
    '  w.connecting=true;',
    '  const dir=path.join(waDir,"shop-"+s);',
    '  fs.mkdirSync(dir,{recursive:true});',
    '  try{',
    '    const {state,saveCreds}=await useMultiFileAuthState(dir);',
    "    const sock=makeWASocket({auth:state,browser:Browsers.ubuntu('Shop Khata'),logger:log});",
    '    w.sock=sock;',
    "    sock.ev.on('creds.update',saveCreds);",
    "    sock.ev.on('connection.update',async x=>{",
    '      if(x.qr)w.qr=await QRCode.toDataURL(x.qr,{width:320,margin:2});',
    "      if(x.connection==='open'){w.connected=true;w.connecting=false;w.qr=null;w.error=null;w.phone=sock.user?.id?.split(':')[0]?.split('@')[0]||null;log.info({shopId:s},'WhatsApp connected');}",
    "      if(x.connection==='close'){w.connected=false;w.connecting=false;if(x.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut)setTimeout(()=>connectWA(s),4000);else w.error='WhatsApp logged out; scan QR again';}",
    '    });',
    '  }catch(e){w.connecting=false;w.error=e?.message||String(e);log.error({err:e,shopId:s},\'WhatsApp connection failed\');}',
    '  return w;',
    '}',
    ''
  ].join('\n');
  source = source.replace(marker, connector + marker);
}

const oldSend = "async function sendWA(s,to,text){const w=wa(s);if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');const n=phone(to);if(n.length<10)throw Error('Invalid mobile number');return w.sock.sendMessage(`${n}@s.whatsapp.net`,{text})}";
if (source.includes(oldSend)) {
  const newSend = [
    'async function sendWA(s,to,text){',
    '  const w=wa(s);',
    "  if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');",
    '  const n=phone(to);',
    "  if(n.length<10)throw Error('Invalid mobile number');",
    '  let jid=n+\'@s.whatsapp.net\';',
    '  try{',
    '    const results=await w.sock.onWhatsApp(n);',
    '    const match=Array.isArray(results)?results.find(x=>x?.exists&&x?.jid):null;',
    '    if(match?.jid)jid=match.jid;',
    '  }catch{}',
    '  return w.sock.sendMessage(jid,{text});',
    '}'
  ].join('\n');
  source = source.replace(oldSend, newSend);
}

fs.writeFileSync(file, source);
console.log('WhatsApp Baileys patch applied successfully');
