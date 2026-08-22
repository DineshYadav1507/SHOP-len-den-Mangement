import fs from 'node:fs';

const file = '/app/server.js';
let source = fs.readFileSync(file, 'utf8');

const oldSend = "async function sendWA(s,to,text){const w=wa(s);if(!w.connected||!w.sock)throw Error('WhatsApp is not connected');const n=phone(to);if(n.length<10)throw Error('Invalid mobile number');return w.sock.sendMessage(`${n}@s.whatsapp.net`,{text})}";

const newSend = `async function resolveWAJid(sock, rawNumber){
  const n=phone(rawNumber);
  if(n.length<10) throw Error('Invalid mobile number');
  try{
    const results=await sock.onWhatsApp(n);
    const match=Array.isArray(results)?results.find(x=>x?.exists&&x?.jid):null;
    if(match?.jid) return match.jid;
  }catch(e){ log.warn({err:e?.message,number:n},'onWhatsApp lookup failed; using normalized JID'); }
  return n+'@s.whatsapp.net';
}

async function sendWA(s,to,text){
  const w=wa(s);
  if(!w.connected||!w.sock) throw Error('WhatsApp is not connected');
  const jid=await resolveWAJid(w.sock,to);
  log.info({shopId:s,jid},'Sending WhatsApp message');
  try{
    const result=await w.sock.sendMessage(jid,{text});
    log.info({shopId:s,jid,messageId:result?.key?.id},'WhatsApp message accepted');
    return result;
  }catch(e){
    w.error=e?.message||String(e);
    log.error({err:e,shopId:s,jid},'WhatsApp send failed');
    throw e;
  }
}`;

if (!source.includes(oldSend)) {
  throw new Error('Expected sendWA implementation was not found; refusing unsafe patch');
}
source = source.replace(oldSend,newSend);

const marker = "sock.ev.on('creds.update',saveCreds);";
const replacement = `${marker}
sock.ev.on('messages.upsert',async({messages,type})=>{
  if(type!=='notify') return;
  for(const message of messages||[]){
    if(message?.key?.fromMe) continue;
    const jid=message?.key?.remoteJid||'';
    const text=message?.message?.conversation||message?.message?.extendedTextMessage?.text||message?.message?.imageMessage?.caption||message?.message?.videoMessage?.caption||'';
    if(!text) continue;
    log.info({shopId:s,jid,text:text.slice(0,500)},'WhatsApp incoming message');
  }
});
`;
if (!source.includes("sock.ev.on('messages.upsert'")) {
  if (!source.includes(marker)) throw new Error('Expected creds.update marker was not found; refusing unsafe patch');
  source = source.replace(marker,replacement);
}

const oldOpen = "if(x.connection==='open'){w.connected=true;w.connecting=false;w.qr=null;w.error=null;w.phone=sock.user?.id?.split(':')[0]?.split('@')[0]||null}";
const newOpen = "if(x.connection==='open'){w.connected=true;w.connecting=false;w.qr=null;w.error=null;w.phone=sock.user?.id?.split(':')[0]?.split('@')[0]||null;log.info({shopId:s,phone:w.phone},'WhatsApp connection open')}";
if(source.includes(oldOpen)) source=source.replace(oldOpen,newOpen);

fs.writeFileSync(file,source);
console.log('WhatsApp Baileys patch applied successfully');
