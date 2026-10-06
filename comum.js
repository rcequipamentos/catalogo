/* RC Equipamentos — funções compartilhadas entre a página de vendas e a de gestão */
const RC = (function () {
  const CATS = ['Força', 'Cardio', 'Acessórios'];
  const GORDER = {
    'Força': ['Pernas e glúteos', 'Peito e ombros', 'Costas', 'Braços', 'Abdômen e lombar', 'Multiestações e racks', 'Bancos', 'Suportes', 'Halteres, anilhas e barras'],
    'Cardio': ['Esteiras', 'Bicicletas', 'Elípticos', 'Escadas e simuladores', 'Remo, ski e escalada'],
    'Acessórios': ['Pegadores e puxadores', 'Barras de puxada', 'Barras olímpicas', 'Treino funcional', 'Suportes para acessórios']
  };
  const PREFIX = { 'Força': 'F', 'Cardio': 'C', 'Acessórios': 'A' };
  const UNIT = { kg: 'por kg', m: 'por metro' };
  const UQ = { kg: { step: 2.5, min: 2.5, u: 'kg' }, m: { step: 1, min: 5, u: 'm' } };
  const uq = it => UQ[it.unit] || { step: 1, min: 1, u: 'un.' };
  const fmt0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v, unit) => (unit ? fmt2 : fmt0).format(v);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nfmt = q => String(q).replace('.', ',');
  const lnum = l => parseInt(String(l).replace(/\D/g, '')) || 0;
  const COND = { novo: 'Novo', seminovo: 'Seminovo revisado' };
  const ORIG = { importado: 'Importado', nacional: 'Nacional' };

  function photoTag(it, cls) {
    if (it.img) return `<img class="one" src="${esc(it.img)}" loading="lazy" alt="${esc(it.name)}">`;
    if (it.sp) { const [s, c, r] = it.sp; return `<img src="fotos/f${String(s).padStart(2, '0')}.jpg" style="left:-${c * 100}%;top:-${r * 100}%" loading="lazy" alt="${esc(it.name)}">`; }
    return '';
  }
  function tags(it) {
    const t = [];
    if (it.cond === 'seminovo') t.push(`<span class="tag semi">SEMINOVO REVISADO</span>`);
    else t.push(`<span class="tag">NOVO</span>`);
    if (it.origem) t.push(`<span class="tag">${esc((ORIG[it.origem] || it.origem).toUpperCase())}</span>`);
    return `<div class="tags">${t.join('')}</div>`;
  }
  function datas() {
    const d = new Date(); const v = new Date(d.getTime() + 10 * 864e5); const f = x => x.toLocaleDateString('pt-BR');
    const p = n => String(n).padStart(2, '0');
    return { emi: f(d), val: f(v), num: 'RC' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) };
  }
  // ---------- fotos para o PDF ----------
  const imgCache = {};
  function loadImg(src) { if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; }); return imgCache[src]; }
  async function photoData(it) {
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 240; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 240, 240);
      if (it.img) { const im = await loadImg(it.img); const k = Math.min(240 / im.width, 240 / im.height); const w = im.width * k, h = im.height * k; x.drawImage(im, (240 - w) / 2, (240 - h) / 2, w, h); }
      else if (it.sp) { const [s, c, r] = it.sp; const im = await loadImg('fotos/f' + String(s).padStart(2, '0') + '.jpg'); x.drawImage(im, c * 300, r * 300, 300, 300, 0, 0, 240, 240); }
      else return null;
      return cv.toDataURL('image/jpeg', 0.82);
    } catch (e) { return null; }
  }
  const pdfTxt = s => String(s).replace(/[″”“]/g, '"').replace(/[’‘]/g, "'").replace(/−/g, '-').replace(/[^\x00-\xFF–—•…€]/g, '');
  async function buildPdf(rows, cli, contato) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = 210, M = 14; const dv = datas();
    const red = [228, 64, 43], ink = [17, 18, 20], gray = [85, 89, 94];
    function stripes(x, y, h, cols) { const w = h * 0.27, sk = h * 0.2; cols.forEach((c, i) => { const x0 = x + i * w * 1.2; doc.setFillColor(...c); doc.triangle(x0 + sk, y, x0 + sk + w * 0.6, y, x0, y + h, 'F'); doc.triangle(x0 + sk + w * 0.6, y, x0 + w * 0.6, y + h, x0, y + h, 'F'); }); }
    function header(first) {
      doc.setFillColor(...ink); doc.rect(0, 0, W, first ? 34 : 16, 'F');
      const hh = first ? 14 : 7, yy = first ? 10 : 4.5; stripes(M, yy, hh, [[107, 42, 35], [168, 56, 43], red]);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(first ? 30 : 15); doc.text('RC', M + hh * 1.15, yy + hh * 0.86);
      doc.setFontSize(first ? 12 : 7.5); doc.text('EQUIPAMENTOS', M + hh * 1.15 + (first ? 20 : 10), yy + hh * 0.45);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(first ? 6.5 : 4.5); doc.setTextColor(181, 185, 190); doc.text('NOVOS · SEMINOVOS · ACESSÓRIOS', M + hh * 1.15 + (first ? 20 : 10), yy + hh * 0.85);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(first ? 18 : 10); doc.text('ORÇAMENTO', W - M, yy + (first ? 7 : 5), { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(first ? 8.5 : 6.5); doc.setTextColor(201, 205, 210); doc.text('Nº ' + dv.num, W - M, yy + (first ? 12.5 : 8.5), { align: 'right' });
    }
    header(true); let y = 44;
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Emitido em: ' + dv.emi, M, y); doc.setTextColor(...red); doc.text('Válido até: ' + dv.val + ' (10 dias)', W - M, y, { align: 'right' }); y += 7;
    doc.setTextColor(...ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    if (cli.nome) { doc.text(pdfTxt('Cliente: ' + cli.nome), M, y); y += 5.5; }
    if (cli.cidade) { doc.text(pdfTxt('Cidade: ' + cli.cidade), M, y); y += 5.5; }
    if (cli.obs) { const t = doc.splitTextToSize(pdfTxt('Observações: ' + cli.obs), W - 2 * M); doc.text(t, M, y); y += 5 * t.length; }
    y += 3;
    const cols = { foto: M, prod: M + 28, qtd: 128, unit: 160, sub: W - M };
    function thead() {
      doc.setFillColor(244, 244, 242); doc.rect(M, y - 4.5, W - 2 * M, 7, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...gray);
      doc.text('FOTO', cols.foto + 2, y); doc.text('PRODUTO', cols.prod, y); doc.text('QTD.', cols.qtd, y, { align: 'right' }); doc.text('VALOR UNIT.', cols.unit + 8, y, { align: 'right' }); doc.text('SUBTOTAL', cols.sub, y, { align: 'right' }); y += 6;
    }
    thead(); let total = 0;
    for (const [it, q] of rows) {
      if (y + 26 > 282) { doc.addPage(); header(false); y = 26; thead(); }
      const pu = it.preco, sub = pu * q; total += sub; const img = await photoData(it);
      if (img) doc.addImage(img, 'JPEG', cols.foto, y, 24, 24); doc.setDrawColor(222, 220, 215); doc.rect(cols.foto, y, 24, 24);
      doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      const nm = doc.splitTextToSize(pdfTxt(it.name), cols.qtd - cols.prod - 18); doc.text(nm, cols.prod, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray);
      const cond = (COND[it.cond] || 'Novo') + (it.origem ? ' · ' + (ORIG[it.origem] || it.origem) : '');
      doc.text(pdfTxt(it.id + (it.linha ? ' · ' + it.linha : '') + ' · ' + it.grp), cols.prod, y + 5 + 4.6 * nm.length + 1);
      doc.text(pdfTxt(cond), cols.prod, y + 5 + 4.6 * nm.length + 5);
      if (it.spec) { const sp = doc.splitTextToSize(pdfTxt(it.spec), cols.qtd - cols.prod - 18).slice(0, 1); doc.text(sp, cols.prod, y + 5 + 4.6 * nm.length + 9); }
      doc.setTextColor(...ink); doc.setFontSize(10); const u = uq(it);
      doc.text(it.unit ? nfmt(q) + ' ' + u.u : String(q), cols.qtd, y + 8, { align: 'right' });
      doc.text(pdfTxt(money(pu, it.unit)), cols.unit + 8, y + 8, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.text(pdfTxt(fmt0.format(sub)), cols.sub, y + 8, { align: 'right' });
      y += 27; doc.setDrawColor(222, 220, 215); doc.line(M, y - 1.5, W - M, y - 1.5);
    }
    if (y + 40 > 285) { doc.addPage(); header(false); y = 28; }
    y += 4; doc.setFillColor(...ink); doc.rect(W - M - 80, y, 80, 13, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(11); doc.text('TOTAL', W - M - 76, y + 8.5);
    doc.setFontSize(15); doc.text(pdfTxt(fmt0.format(total)), W - M - 4, y + 9, { align: 'right' }); y += 22;
    doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    ['Orçamento válido por 10 dias, até ' + dv.val + '. Após essa data, valores sujeitos a alteração.', 'Frete, montagem e instalação são combinados à parte. Prazo de entrega a confirmar.', 'RC Equipamentos · WhatsApp ' + (contato || '(88) 99625-1812')].forEach(n => { doc.text(pdfTxt(n), M, y); y += 4.8; });
    const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(...gray); doc.text('Página ' + i + ' de ' + pages, W - M, 292, { align: 'right' }); doc.text('Orçamento Nº ' + dv.num, M, 292); }
    return { blob: doc.output('blob'), name: 'Orcamento_RC_Equipamentos_' + dv.emi.replace(/\//g, '-') + '.pdf' };
  }
  async function savePdf(blob, name) {
    const f = new File([blob], name, { type: 'application/pdf' });
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'Orçamento RC Equipamentos' }); return 'share'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return 'download';
  }
  return { CATS, GORDER, PREFIX, UNIT, uq, fmt0, fmt2, money, esc, nfmt, lnum, COND, ORIG, photoTag, tags, datas, buildPdf, savePdf };
})();
