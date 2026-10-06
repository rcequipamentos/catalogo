/* RC Equipamentos — página de vendas (catálogo + orçamento do cliente) */
(function () {
  const { CATS, GORDER, UNIT, uq, fmt0, money, esc, nfmt, lnum } = RC;
  const $ = id => document.getElementById(id);
  let DATA = { itens: [], whatsapp: '5588996251812', contato: 'Consulte prazo de entrega' };
  let ITEMS = [], byId = {};
  let st = { cat: 'Força', grp: '', linha: '', q: '', modo: 'linha', cond: '' };
  try { const s = JSON.parse(localStorage.getItem('rc-cat-filtro') || 'null'); if (s && CATS.includes(s.cat)) st = Object.assign(st, s, { q: '' }); } catch (e) { }

  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 5200); }
  function remember() { try { localStorage.setItem('rc-cat-filtro', JSON.stringify({ cat: st.cat, grp: st.grp, linha: st.linha, modo: st.modo, cond: st.cond })); } catch (e) { } }
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const byLine = () => st.cat === 'Força' && st.modo === 'linha';
  const condOk = it => !st.cond || (it.cond || 'novo') === st.cond;

  function matches(it) {
    if (!condOk(it)) return false;
    if (st.q) { const h = norm(it.name + ' ' + it.id + ' ' + it.grp + ' ' + (it.spec || '') + ' ' + (it.linha || '')); return norm(st.q).split(/\s+/).every(w => h.includes(w)); }
    if (it.cat !== st.cat) return false;
    if (st.grp && it.grp !== st.grp) return false;
    if (st.linha && (byLine() ? (it.linha || '__' + it.grp) : it.linha) !== st.linha) return false;
    return true;
  }
  function renderCats() { $('cats').innerHTML = CATS.map(c => `<button type="button" data-c="${c}" aria-pressed="${!st.q && st.cat === c}">${c}</button>`).join(''); }
  function renderConds() { $('conds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === st.cond))); }
  function groupsOf(cat) { const known = GORDER[cat] || []; const extra = [...new Set(ITEMS.filter(i => i.cat === cat && !known.includes(i.grp)).map(i => i.grp))]; return known.concat(extra); }

  function renderGroups() {
    $('modo').hidden = st.cat !== 'Força' || !!st.q;
    $('modo').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === st.modo)));
    const base = ITEMS.filter(it => it.cat === st.cat && condOk(it));
    const ord = groupsOf(st.cat);
    if (byLine()) {
      const pool = base.filter(it => !st.grp || it.grp === st.grp);
      const n = {}; pool.forEach(it => { const k = it.linha || '__' + it.grp; n[k] = (n[k] || 0) + 1; });
      const ls = Object.keys(n).filter(k => !k.startsWith('__')).sort((a, b) => lnum(a) - lnum(b));
      const extra = ord.filter(g => n['__' + g]);
      $('grps').innerHTML = `<button type="button" class="chip" data-l="" aria-pressed="${!st.linha}">Todas<span class="n">${pool.length}</span></button>` + ls.map(l => `<button type="button" class="chip" data-l="${esc(l)}" aria-pressed="${st.linha === l}">${esc(l)}<span class="n">${n[l]}</span></button>`).join('') + extra.map(g => `<button type="button" class="chip" data-l="${esc('__' + g)}" aria-pressed="${st.linha === '__' + g}">${esc(g)}<span class="n">${n['__' + g]}</span></button>`).join('');
      const gs = ord.filter(g => base.some(it => it.grp === g && (!st.linha || (it.linha || '__' + it.grp) === st.linha)));
      $('linha').innerHTML = `<option value="">Todos os tipos</option>` + gs.map(g => `<option value="${esc(g)}" ${st.grp === g ? 'selected' : ''}>${esc(g)}</option>`).join('');
      $('linha').hidden = !!st.q;
    } else {
      const pool = base.filter(it => !st.linha || it.linha === st.linha);
      const n = {}; pool.forEach(it => n[it.grp] = (n[it.grp] || 0) + 1);
      const gs = ord.filter(g => n[g]);
      $('grps').innerHTML = `<button type="button" class="chip" data-g="" aria-pressed="${!st.grp}">Todos<span class="n">${pool.length}</span></button>` + gs.map(g => `<button type="button" class="chip" data-g="${esc(g)}" aria-pressed="${st.grp === g}">${esc(g)}<span class="n">${n[g]}</span></button>`).join('');
      const ls = [...new Set(base.filter(it => it.linha).map(it => it.linha))].sort((a, b) => lnum(a) - lnum(b));
      $('linha').hidden = !ls.length || !!st.q;
      $('linha').innerHTML = `<option value="">Todas as linhas</option>` + ls.map(l => `<option value="${esc(l)}" ${st.linha === l ? 'selected' : ''}>${esc(l)}</option>`).join('');
    }
    $('grps').hidden = !!st.q;
  }

  function card(it) {
    const p = it.preco;
    return `<article class="card${cart[it.id] ? ' in' : ''}" data-card="${it.id}"><div class="ph">${RC.photoTag(it)}</div><div class="info"><div class="code"><span>${it.id}</span>${it.linha ? `<span>${esc(it.linha)}</span>` : ''}</div>${RC.tags(it)}<div class="name">${esc(it.name)}</div>${it.spec ? `<div class="spec">${esc(it.spec)}</div>` : ''}<div class="price">${money(p, it.unit)}${it.unit ? `<small>${UNIT[it.unit]}</small>` : ''}</div>${cartCtl(it)}</div></article>`;
  }
  function renderList() {
    const rows = ITEMS.filter(matches);
    let html = '';
    const sec = (title, sub, a, cls) => `<section class="sec${cls || ''}"><h2>${esc(title)}<small>${sub}</small></h2><div class="grid">${a.map(card).join('')}</div></section>`;
    const cnt = a => `${a.length} ${a.length > 1 ? 'itens' : 'item'}`;
    if (byLine() && !st.q) {
      const ord = groupsOf('Força'); const srt = a => a.slice().sort((x, y) => ord.indexOf(x.grp) - ord.indexOf(y.grp));
      const ls = [...new Set(rows.filter(r => r.linha).map(r => r.linha))].sort((a, b) => lnum(a) - lnum(b));
      ls.forEach(l => { const a = srt(rows.filter(r => r.linha === l)); const tipos = [...new Set(a.map(r => r.grp))].slice(0, 4).join(' · '); html += sec(l, cnt(a) + ' · ' + esc(tipos), a, ' linha'); });
      ord.forEach(g => { const a = rows.filter(r => !r.linha && r.grp === g); if (a.length) html += sec(g, cnt(a), a, ' linha'); });
    } else {
      const by = {}; rows.forEach(it => (by[it.cat + '|' + it.grp] = by[it.cat + '|' + it.grp] || []).push(it));
      CATS.forEach(c => groupsOf(c).forEach(g => { const a = by[c + '|' + g]; if (!a) return; html += sec(g, cnt(a) + (st.q ? ' · ' + c : ''), a, ''); }));
    }
    $('list').innerHTML = html || `<div class="empty">Nenhum produto encontrado. Tente outro nome ou limpe os filtros.</div>`;
  }
  function renderAll() { renderCats(); renderConds(); renderGroups(); renderList(); renderCart(); }

  $('cats').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.cat = b.dataset.c; st.grp = ''; st.linha = ''; st.q = ''; $('q').value = ''; remember(); renderAll(); window.scrollTo({ top: 0 }); });
  $('conds').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.cond = b.dataset.k; st.grp = ''; st.linha = ''; remember(); renderAll(); });
  $('grps').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (byLine()) st.linha = b.dataset.l; else st.grp = b.dataset.g; remember(); renderGroups(); renderList(); });
  $('modo').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.modo = b.dataset.m; st.grp = ''; st.linha = ''; remember(); renderGroups(); renderList(); });
  $('linha').addEventListener('change', e => { if (byLine()) st.grp = e.target.value; else { st.linha = e.target.value; st.grp = ''; } remember(); renderGroups(); renderList(); });
  let qt; $('q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { st.q = e.target.value.trim(); renderAll(); }, 150); });

  // ---------- orçamento do cliente ----------
  let cart = {}; try { cart = JSON.parse(localStorage.getItem('rc-orcamento') || '{}') || {}; } catch (e) { cart = {}; }
  function saveCart() { try { localStorage.setItem('rc-orcamento', JSON.stringify(cart)); } catch (e) { } }
  function cartCtl(it) {
    const q = cart[it.id]; const u = uq(it);
    if (!q) return `<button type="button" class="add" data-add="${it.id}">Adicionar ao orçamento</button>`;
    return `<div class="qty"><button type="button" data-dec="${it.id}" aria-label="Diminuir">−</button><input class="inp" type="number" min="0" step="${u.step}" value="${q}" data-q="${it.id}" aria-label="Quantidade de ${esc(it.name)}"><span class="u">${u.u}</span><button type="button" data-inc="${it.id}" aria-label="Aumentar">+</button></div>`;
  }
  const cartRows = () => Object.entries(cart).filter(([k]) => byId[k]).map(([k, q]) => [byId[k], q]);
  const cartTotal = () => cartRows().reduce((s, [it, q]) => s + it.preco * q, 0);
  const siteUrl = () => location.href.split('#')[0].split('?')[0];
  function cartText() {
    const rows = cartRows();
    const lines = rows.map(([it, q]) => { const u = uq(it); return `• ${it.unit ? nfmt(q) + ' ' + u.u + ' de ' : q + 'x '}${it.name}${it.linha ? ' · ' + it.linha : ''} (${it.id}) — ${fmt0.format(it.preco * q)}`; });
    const code = rows.map(([it, q]) => it.id.replace('RC-', '') + '-' + String(q).replace('.', '_')).join('.');
    const nome = $('cNome').value.trim(), cid = $('cCidade').value.trim(), obs = $('cObs').value.trim();
    const dv = RC.datas();
    return `Olá! Quero um orçamento da RC Equipamentos.\nFeito em ${dv.emi} · válido até ${dv.val} (10 dias)\n` + (nome ? `Nome: ${nome}\n` : '') + (cid ? `Cidade: ${cid}\n` : '') + `\nItens:\n${lines.join('\n')}\n\nTotal estimado: ${fmt0.format(cartTotal())}` + (obs ? `\n\nObservações: ${obs}` : '') + `\n\n(Segue o PDF do orçamento em anexo.)\nOrçamento com fotos: ${siteUrl()}#orc.${code}`;
  }
  function renderCart() {
    const rows = cartRows(); const n = rows.length; const show = n > 0;
    $('cartbar').hidden = !show; document.body.classList.toggle('hascart', show);
    $('cartTotal').textContent = fmt0.format(cartTotal()); $('cartCount').textContent = `${n} ${n === 1 ? 'item' : 'itens'} no orçamento`;
    $('pTotal').textContent = fmt0.format(cartTotal());
    $('lines').innerHTML = n ? rows.map(([it, q]) => `<div class="ln"><div><div class="t">${esc(it.name)}</div><div class="c">${it.id} · ${money(it.preco, it.unit)}${it.unit ? ' ' + UNIT[it.unit] : ' cada'}</div></div><div class="v">${fmt0.format(it.preco * q)}</div>${cartCtl(it)}</div>`).join('') : `<p class="note">Nenhum item ainda. Toque em "Adicionar ao orçamento" nos produtos.</p>`;
    $('sendWa').setAttribute('aria-disabled', String(!n));
    $('sendWa').href = n ? `https://wa.me/${DATA.whatsapp}?text=${encodeURIComponent(cartText())}` : '#';
  }
  function setQty(id, q) {
    const it = byId[id]; const u = uq(it); q = Math.round(q * 100) / 100;
    if (!(q > 0)) delete cart[id]; else { if (q < u.min) q = u.min; cart[id] = q; }
    saveCart(); renderCart(); const c = document.querySelector(`[data-card="${id}"]`);
    if (c) { c.classList.toggle('in', !!cart[id]); const old = c.querySelector('.add,.qty'); if (old) old.outerHTML = cartCtl(it); }
  }
  function onCartClick(e) {
    const t = e.target.closest('[data-add],[data-inc],[data-dec]'); if (!t) return;
    if (t.dataset.add) { setQty(t.dataset.add, uq(byId[t.dataset.add]).min); toast('Adicionado ao orçamento.'); }
    else if (t.dataset.inc) { const id = t.dataset.inc; setQty(id, (cart[id] || 0) + uq(byId[id]).step); }
    else if (t.dataset.dec) { const id = t.dataset.dec; const u = uq(byId[id]); const nq = (cart[id] || 0) - u.step; setQty(id, nq < u.min ? 0 : nq); }
  }
  function onCartChange(e) { const t = e.target; if (!t.dataset.q) return; setQty(t.dataset.q, parseFloat(t.value) || 0); }
  $('list').addEventListener('click', onCartClick); $('list').addEventListener('change', onCartChange);
  $('lines').addEventListener('click', onCartClick); $('lines').addEventListener('change', onCartChange);
  $('openCart').addEventListener('click', () => { renderCart(); $('panel').hidden = false; $('closeCart').focus(); });
  $('closeCart').addEventListener('click', () => $('panel').hidden = true);
  $('panel').addEventListener('click', e => { if (e.target.id === 'panel') $('panel').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('panel').hidden = true; $('recv').hidden = true; } });
  ['cNome', 'cCidade', 'cObs'].forEach(id => $(id).addEventListener('input', renderCart));
  $('copyCart').addEventListener('click', async () => {
    const t = cartText();
    try { await navigator.clipboard.writeText(t); toast('Texto copiado. Cole no WhatsApp da RC.'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Texto copiado.'); } catch (_) { toast('Selecione e copie o texto manualmente.'); } ta.remove(); }
  });
  let clearArm = false; $('clearCart').addEventListener('click', e => {
    if (!clearArm) { clearArm = true; e.target.textContent = 'Toque de novo para esvaziar'; setTimeout(() => { clearArm = false; e.target.textContent = 'Esvaziar orçamento'; }, 3000); return; }
    cart = {}; saveCart(); renderCart(); renderList(); $('panel').hidden = true; e.target.textContent = 'Esvaziar orçamento'; clearArm = false;
  });

  // ---------- orçamento aberto por link (#orc.) ----------
  let recvRows = [];
  function showReceived() {
    const m = location.hash.match(/^#orc\.([A-Za-z0-9._-]+)$/); if (!m) { $('recv').hidden = true; return; }
    const rows = m[1].split('.').map(s => { const [id, q] = s.split('-'); return [byId['RC-' + id], parseFloat(String(q || '').replace('_', '.'))]; }).filter(([it, q]) => it && q > 0);
    if (!rows.length) return;
    recvRows = rows; let tot = 0;
    $('rlines').innerHTML = rows.map(([it, q]) => {
      const u = uq(it); const sub = it.preco * q; tot += sub;
      return `<div class="rl"><div class="tb">${RC.photoTag(it)}</div><div><div class="t">${esc(it.name)}</div><div class="c">${it.id}${it.linha ? ' · ' + esc(it.linha) : ''} · ${esc(it.grp)}</div><div class="c">${esc(RC.COND[it.cond] || 'Novo')}${it.origem ? ' · ' + esc(RC.ORIG[it.origem] || it.origem) : ''}</div><div class="c">${it.unit ? nfmt(q) + ' ' + u.u : q + ' un.'} × ${money(it.preco, it.unit)}</div></div><div class="v">${fmt0.format(sub)}</div></div>`;
    }).join('');
    $('rTotal').textContent = fmt0.format(tot); $('recv').hidden = false;
  }
  $('closeRecv').addEventListener('click', () => { $('recv').hidden = true; history.replaceState(null, '', siteUrl()); });
  window.addEventListener('hashchange', showReceived);

  // ---------- PDF ----------
  async function deliverPdf(rows, cli, btn) {
    if (!window.jspdf) { toast('O gerador de PDF não carregou. Verifique a internet e tente de novo.'); return; }
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Gerando PDF…';
    try {
      const { blob, name } = await RC.buildPdf(rows, cli, DATA.contatoPdf);
      const r = await RC.savePdf(blob, name);
      if (r === 'download') toast('PDF baixado. Agora toque no botão verde e anexe o PDF na conversa do WhatsApp.');
      else if (r === 'share') toast('Pronto. Se ainda não enviou, toque no botão verde para falar com a RC.');
    } catch (e) { console.error(e); toast('Não foi possível gerar o PDF. Tente de novo.'); }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  $('pdfCart').addEventListener('click', e => { const rows = cartRows(); if (!rows.length) { toast('Adicione itens ao orçamento primeiro.'); return; } deliverPdf(rows, { nome: $('cNome').value.trim(), cidade: $('cCidade').value.trim(), obs: $('cObs').value.trim() }, e.currentTarget); });
  $('pdfRecv').addEventListener('click', e => { if (!recvRows.length) return; deliverPdf(recvRows, { nome: $('rNome').value.trim(), cidade: $('rCidade').value.trim(), obs: '' }, e.currentTarget); });

  // ---------- carregar ----------
  async function boot() {
    try {
      const r = await fetch('data/produtos.json?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      DATA = Object.assign(DATA, await r.json());
    } catch (e) { $('list').innerHTML = `<div class="empty">Não foi possível carregar o catálogo. Verifique a internet e recarregue a página.</div>`; return; }
    ITEMS = (DATA.itens || []).filter(i => !i.oculto && i.preco > 0);
    byId = {}; ITEMS.forEach(i => byId[i.id] = i);
    const temSemi = ITEMS.some(i => i.cond === 'seminovo'); $('conds').parentElement.hidden = !temSemi; if (!temSemi) st.cond = '';
    Object.keys(cart).forEach(k => { if (!byId[k] || !(cart[k] > 0)) delete cart[k]; }); saveCart();
    $('contato').textContent = DATA.contato || 'Consulte prazo de entrega';
    if (DATA.atualizado) { const [y, m, d] = DATA.atualizado.split('-'); $('atual').textContent = `catálogo atualizado em ${d}/${m}/${y}`; }
    renderAll(); showReceived();
  }
  boot();
})();
