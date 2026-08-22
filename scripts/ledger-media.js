import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { PassThrough } from 'node:stream';

const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&apos;' }[c]));
const money = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const colors = ['#7c3aed','#2563eb','#0891b2','#059669','#ea580c','#db2777'];

export async function createTransactionCard({ shop, customer, transaction, balance }) {
  const shopName = esc(shop.name || 'Shop Khata');
  const shopPhone = esc(shop.phone || shop.whatsapp || 'Contact not set');
  const upi = esc(shop.upi_id || 'UPI not set');
  const address = esc(shop.address || '');
  const type = transaction.type === 'DEBIT' ? 'DEBIT / LENA' : 'CREDIT / JAMA';
  const amount = money(transaction.amount);
  const current = balance >= 0 ? `Due / Lena: ${money(balance)}` : `Advance: ${money(Math.abs(balance))}`;
  const date = new Date(transaction.created_at).toLocaleString('en-IN');
  const qr = shop.upi_id ? await QRCode.toDataURL(`upi://pay?pa=${shop.upi_id}&pn=${shop.name || 'Shop'}`, { width: 180, margin: 1 }) : '';
  const qrHref = qr ? `href="${qr}"` : '';
  const gradient = colors.map((c,i)=>`<stop offset="${Math.round(i/(colors.length-1)*100)}%" stop-color="${c}"/>`).join('');
  const svg = `<svg width="1080" height="900" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" x2="1">${gradient}</linearGradient><filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".16"/></filter></defs>
    <rect width="1080" height="900" rx="42" fill="#f8fafc"/>
    <rect x="35" y="35" width="1010" height="830" rx="35" fill="white" filter="url(#shadow)"/>
    <rect x="35" y="35" width="1010" height="18" rx="9" fill="url(#g)"/>
    <text x="75" y="125" font-family="Arial,sans-serif" font-size="46" font-weight="800" fill="url(#g)">${shopName}</text>
    <text x="75" y="166" font-family="Arial,sans-serif" font-size="22" fill="#475569">${shopPhone}</text>
    <text x="75" y="202" font-family="Arial,sans-serif" font-size="21" fill="#64748b">UPI: ${upi}</text>
    ${address ? `<text x="75" y="238" font-family="Arial,sans-serif" font-size="19" fill="#64748b">${address}</text>` : ''}
    <rect x="70" y="270" width="940" height="250" rx="28" fill="url(#g)"/>
    <text x="105" y="330" font-family="Arial,sans-serif" font-size="23" font-weight="700" fill="white">TRANSACTION UPDATE</text>
    <text x="105" y="385" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="white">${esc(customer.name)}</text>
    <text x="105" y="425" font-family="Arial,sans-serif" font-size="21" fill="#eef2ff">${esc(customer.phone)} · ${esc(type)}</text>
    <text x="105" y="480" font-family="Arial,sans-serif" font-size="52" font-weight="800" fill="white">${amount}</text>
    ${qr ? `<image x="825" y="300" width="145" height="145" ${qrHref}/>` : ''}
    <text x="75" y="585" font-family="Arial,sans-serif" font-size="23" font-weight="700" fill="#0f172a">Current Account Balance</text>
    <text x="75" y="635" font-family="Arial,sans-serif" font-size="36" font-weight="800" fill="#0f766e">${esc(current)}</text>
    <text x="75" y="690" font-family="Arial,sans-serif" font-size="20" fill="#64748b">${esc(date)}</text>
    ${transaction.note ? `<text x="75" y="735" font-family="Arial,sans-serif" font-size="20" fill="#475569">Note: ${esc(transaction.note)}</text>` : ''}
    <text x="75" y="815" font-family="Arial,sans-serif" font-size="19" fill="#64748b">Khata: ${esc(customer.share_token ? `View online: /khata/${customer.share_token}` : 'Online statement available')}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

function colorfulShopName(doc, name, x, y) {
  let cursor = x;
  [...String(name || 'Shop Khata')].forEach((ch, i) => {
    doc.fillColor(colors[i % colors.length]).fontSize(24).font('Helvetica-Bold').text(ch, cursor, y, { continued: false });
    cursor += Math.max(9, doc.widthOfString(ch));
  });
}

export function createStatementPdf({ shop, customer, transactions, balance }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const out = new PassThrough(); const chunks = [];
    out.on('data', c => chunks.push(c)); out.on('end', () => resolve(Buffer.concat(chunks))); out.on('error', reject);
    doc.pipe(out);
    const watermark = () => {
      doc.save().rotate(-28, { origin: [300, 450] }).opacity(0.08).fillColor('#7c3aed').fontSize(62).font('Helvetica-Bold').text(String(shop.name || 'SHOP KHATA'), 70, 420, { width: 470, align: 'center' }).restore();
    };
    watermark();
    colorfulShopName(doc, shop.name, 42, 42);
    doc.fillColor('#475569').fontSize(10).font('Helvetica').text(shop.address || '', 42, 76);
    doc.text(`Contact: ${shop.phone || shop.whatsapp || '—'}    UPI: ${shop.upi_id || '—'}`, 42, 91);
    doc.moveTo(42, 112).lineTo(553, 112).strokeColor('#cbd5e1').stroke();
    doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text('Customer Statement', 42, 132);
    doc.fontSize(12).font('Helvetica').fillColor('#334155').text(`Customer: ${customer.name}`, 42, 162);
    doc.text(`Mobile: ${customer.phone}`, 42, 180);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 42, 198);
    const balText = balance >= 0 ? `Amount Due: ${money(balance)}` : `Advance: ${money(Math.abs(balance))}`;
    doc.roundedRect(350, 145, 203, 70, 12).fill('#eef2ff');
    doc.fillColor('#4338ca').fontSize(12).font('Helvetica-Bold').text('CURRENT BALANCE', 365, 158);
    doc.fontSize(18).text(balText, 365, 180);
    let y = 245;
    doc.fillColor('#ffffff').rect(42, y, 511, 27).fill('#4338ca');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('DATE', 50, y+9); doc.text('TYPE', 135, y+9); doc.text('NOTE', 225, y+9); doc.text('AMOUNT', 480, y+9, { width: 65, align: 'right' });
    y += 38;
    for (const t of transactions) {
      if (y > 750) { doc.addPage(); watermark(); y = 55; doc.fillColor('#ffffff').rect(42,y,511,27).fill('#4338ca'); doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text('DATE',50,y+9); doc.text('TYPE',135,y+9); doc.text('NOTE',225,y+9); doc.text('AMOUNT',480,y+9,{width:65,align:'right'}); y += 38; }
      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(new Date(t.created_at).toLocaleDateString('en-IN'),50,y);
      doc.text(t.type === 'DEBIT' ? 'Debit' : 'Credit',135,y);
      doc.text(String(t.note || '—').slice(0,38),225,y,{width:230,ellipsis:true});
      doc.font('Helvetica-Bold').text(`${t.type === 'DEBIT' ? '+' : '-'}${money(t.amount)}`,465,y,{width:88,align:'right'});
      y += 24; doc.moveTo(42,y-8).lineTo(553,y-8).strokeColor('#e2e8f0').stroke();
    }
    if (!transactions.length) doc.fillColor('#64748b').fontSize(11).text('No transactions recorded.', 42, y);
    doc.addPage(); watermark();
    colorfulShopName(doc, shop.name, 42, 55);
    doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text('Account Summary', 42, 105);
    doc.fontSize(13).font('Helvetica').fillColor('#334155').text(`Customer: ${customer.name}`, 42, 140);
    doc.text(`Total transactions: ${transactions.length}`, 42, 162);
    const debit = transactions.filter(t=>t.type==='DEBIT').reduce((a,t)=>a+Number(t.amount),0);
    const credit = transactions.filter(t=>t.type==='CREDIT').reduce((a,t)=>a+Number(t.amount),0);
    doc.text(`Total Debit / Lena: ${money(debit)}`, 42, 195); doc.text(`Total Credit / Jama: ${money(credit)}`, 42, 217); doc.text(balText, 42, 239);
    doc.fillColor('#64748b').fontSize(9).text('This statement is generated from the shop ledger. Please verify payment details with the shop.',42,760,{width:511,align:'center'});
    doc.end();
  });
}
