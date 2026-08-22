import fs from 'node:fs';

const file = '/app/server.js';
let source = fs.readFileSync(file, 'utf8');

// Repair the shop-profile migration quoting before Node loads server.js.
const brokenMigration = "'ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT ''',";
const fixedMigration = '"ALTER TABLE shops ADD COLUMN phone TEXT DEFAULT \'\'",';
if (source.includes(brokenMigration)) source = source.replace(brokenMigration, fixedMigration);

// Some generated server.js versions contain the WhatsApp session map but lost
// connectWA during earlier media patching. Restore the connector if necessary.
if (!source.includes('async function connectWA(')) {
  const anchor = "const waSessions=new Map();const wa=s=>{if(!waSessions.has(s))waSessions.set(s,{sock:null,qr:null,connected:false,connecting:false,phone:null,error:null});return waSessions.get(s)};";
  if (!source.includes(anchor)) throw new Error('WhatsApp session map not found; refusing unsafe patch');
  const connector = `\nasync function connectWA(s){
  const w=wa(s);
  if(w.connected||w.connecting) return;
  w.connecting=true;
  const dir=path.join(waDir,\`shop-${s}\`);
  fs.mkdirSync(dir,{recursive:true});
  try{
    const {state,saveCreds}=await useMultiFileAuthState(dir);
    const sock=makeWASocket({auth:state,browser:Browsers.ubuntu('Shop Khata'),logger:log});
    w.sock=sock;
    sock.ev.on('creds.update',saveCreds);
    sock.ev.on('messages.upsert',async({messages,type})=>{
      if(type!=='notify') return;
      for(const message of messages||[]){
        if(message?.key?.fromMe) continue;
        const jid=message?.key?.remoteJid||'';
        const text=message?.message?.conversation||message?.message?.extendedTextMessage?.text||message?.message?.imageMessage?.caption||message?.message?.videoMessage?.caption||'';
        if(text) log.info({shopId:s,jid,text:text.slice(0,500)},'WhatsApp incoming message');
      }
    });
    sock.ev.on('connection.update',async x=>{
      if(x.qr) w.qr=await QRCode.toDataURL(x.qr,{width:320,margin:2});
      if(x.connection==='open'){
        w.connected=true;w.connecting=false;w.qr=null;w.error=null;
        w.phone=sock.user?.id?.split(':')[0]?.split('@')[0]||null;
        log.info({shopId:s,phone:w.phone},'WhatsApp connection open');
      }
      if(x.connection==='close'){
        w.connected=false;w.connecting=false;
        if(x.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) setTimeout(()=>connectWA(s),4000);
        else w.error='WhatsApp logged out; scan QR again';
      }
    });
  }catch(e){w.connecting=false;w.error=e?.message||String(e);log.error({err:e,shopId:s},'WhatsApp connection failed');}
}
`;
  source = source.replace(anchor,anchor+connector);
}

async function resolveWAJid(sock, rawNumber){
  const n=phone(rawNumber);
  if(n.length<10) throw Error('Invalid mobile number');
  try{
    const results=await sock.onWhatsApp(n);
    const match=Array.isArray(results)?results.find(x=>x?.exists&&x?.jid):null;
    if(match?.jid) return match.jid;
  }catch(e){ log.warn({err:e?.message,number:n},'onWhatsApp lookup failed; using normalized JID'); }
  return n+'@s.whatsapp.net';
}

const oldSend = "async function sendWA(s,to,text){const w=wa(s);if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');const n=phone(to);if(n.length<10)throw Error('Invalid mobile number');return w.sock.sendMessage(`${n}@s.whatsapp.net`,{text})}";
const newSend = `async function sendWA(s,to,text){
  const w=wa(s);
  if(!w.connected||!w.sock) throw Error('WhatsApp is not connected');
  const jid=await resolveWAJid(w.sock,to);
  try{return await w.sock.sendMessage(jid,{text});}
  catch(e){w.error=e?.message||String(e);throw e;}
}`;
if(source.includes(oldSend)) source=source.replace(oldSend,newSend);

const marker="sock.ev.on('creds.update',saveCreds);";
if(!source.includes("sock.ev.on('messages.upsert'")){
  const replacement=`${marker}\nsock.ev.on('messages.upsert',async({messages,type})=>{\n  if(type!=='notify') return;\n  for(const message of messages||[]){\n    if(message?.key?.fromMe) continue;\n    const jid=message?.key?.remoteJid||'';\n    const text=message?.message?.conversation||message?.message?.extendedTextMessage?.text||message?.message?.imageMessage?.caption||message?.message?.videoMessage?.caption||'';\n    if(text) log.info({shopId:s,jid,text:text.slice(0,500)},'WhatsApp incoming message');\n  }\n});`;
  if(source.includes(marker)) source=source.replace(marker,replacement);
}

fs.writeFileSync(file,source);
console.log('WhatsApp Baileys patch applied successfully');
