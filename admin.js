/* RC Equipamentos — gestão do catálogo (salva direto no GitHub) */
(function () {
  const { CATS, GORDER, PREFIX, UNIT, money, esc, lnum } = RC;
  const API = 'https://api.github.com';
  const $ = id => document.getElementById(id);
  const PAGE = 60;

  let cfg = null;
  let prod = null, prodSha = null, cust = null, custSha = null;
  let snapProd = '', snapCust = '';
  let uploads = {};          // caminho -> base64 da foto nova
  let deletes = new Set();   // fotos antigas a remover
  let changed = new Set();
  let shown = PAGE;
  let busy = false;
  let custOk = false;    // custos.json lido com sucesso do repositório privado

  function toast(t, ms) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms || 5200); }
  function banner(html) {
    let b = $('warn');
    if (!b) { b = document.createElement('section'); b.id = 'warn'; b.className = 'card2'; b.style.cssText = 'border-color:var(--red);background:color-mix(in srgb,var(--red) 8%,var(--surface))'; const w = document.querySelector('#appView main .wrap'); w.insertBefore(b, w.firstChild); }
    b.innerHTML = html || ''; b.hidden = !html;
  }
  const tokenTail = () => cfg && cfg.token ? '…' + cfg.token.slice(-4) : '';
  function status(t, cls) { const s = $('status'); s.textContent = t; s.className = 'status' + (cls ? ' ' + cls : ''); }

  // ---------- GitHub ----------
  function b64FromBytes(bytes) { let s = ''; const C = 0x8000; for (let i = 0; i < bytes.length; i += C) s += String.fromCharCode.apply(null, bytes.subarray(i, i + C)); return btoa(s); }
  const b64FromText = t => b64FromBytes(new TextEncoder().encode(t));
  function textFromB64(b) { const bin = atob(b.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }
  async function gh(method, path, body, accept) {
    const r = await fetch(API + path, {
      method, cache: 'no-store',
      headers: Object.assign({ Authorization: 'Bearer ' + cfg.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) { } const err = new Error(m || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    return accept && accept.includes('raw') ? r.text() : (r.status === 204 ? null : r.json());
  }
  const cpath = (repo, p) => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(repo)}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
  async function getFile(repo, p) {
    const j = await gh('GET', cpath(repo, p) + '?t=' + Date.now());
    let text = j.content ? textFromB64(j.content) : '';
    if (!text) text = await gh('GET', cpath(repo, p) + '?t=' + Date.now(), null, 'application/vnd.github.raw+json');
    return { sha: j.sha, text };
  }
  const putFile = (repo, p, b64, sha, msg) => gh('PUT', cpath(repo, p), Object.assign({ message: msg, content: b64 }, sha ? { sha } : {}));
  async function delFile(repo, p, msg) {
    try { const j = await gh('GET', cpath(repo, p)); await gh('DELETE', cpath(repo, p), { message: msg, sha: j.sha }); }
    catch (e) { if (e.status !== 404) throw e; }
  }
  function errText(e) {
    if (e.status === 401) return 'Token inválido ou vencido. Gere um novo token no GitHub e entre de novo.';
    if (e.status === 403) return 'O token não tem permissão para gravar. No GitHub, dê permissão "Contents: Read and write" aos dois repositórios.';
    if (e.status === 404) return 'Repositório ou arquivo não encontrado. Confira o usuário e os nomes dos repositórios.';
    if (e.status === 409 || e.status === 422) return 'Os dados foram alterados em outro lugar (outro aparelho?). Recarregue a página e faça a alteração de novo.';
    if (e.status === 429) return 'Muitas operações seguidas. Aguarde um minuto e tente de novo.';
    return 'Falha de conexão com o GitHub (' + (e.message || 'erro') + '). Verifique a internet e tente de novo.';
  }

  // ---------- preços ----------
  const isMan = id => cust.manual.includes(id);
  const hasUsd = id => cust.usd[id] != null && cust.usd[id] !== '';
  function auto(it, dolar) { const v = +cust.usd[it.id] * (dolar || cust.dolar); return it.unit ? Math.round(v * 100) / 100 : Math.round(v); }
  function recalc(it) { if (hasUsd(it.id) && !isMan(it.id)) it.preco = auto(it); }
  function setMan(id, on) { const s = new Set(cust.manual); on ? s.add(id) : s.delete(id); cust.manual = [...s]; }
  const byId = id => prod.itens.find(i => i.id === id);

  // ---------- estado ----------
  function isDirty() { return JSON.stringify(prod) !== snapProd || JSON.stringify(cust) !== snapCust || Object.keys(uploads).length > 0 || deletes.size > 0; }
  function markDirty() { const d = isDirty(); $('dirty').hidden = !d; $('saveBtn').disabled = busy || !d; $('discardBtn').disabled = busy || !d; renderKpi(); }
  function snapshot() { snapProd = JSON.stringify(prod); snapCust = JSON.stringify(cust); }
  window.addEventListener('beforeunload', e => { if (prod && isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- lista ----------
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function thumb(it) { return `<div class="tb">${it._preview ? `<img class="one" src="${it._preview}" alt="">` : RC.photoTag(it)}</div>`; }
  function filtered() {
    const q = norm($('fq').value.trim()), c = $('fcat').value, s = $('fshow').value;
    return prod.itens.filter(it => {
      if (c && it.cat !== c) return false;
      if (s === 'man' && !(isMan(it.id) || !hasUsd(it.id))) return false;
      if (s === 'off' && !it.oculto) return false;
      if (s === 'semi' && it.cond !== 'seminovo') return false;
      if (s === 'nac' && it.origem !== 'nacional') return false;
      if (s === 'new' && !changed.has(it.id)) return false;
      if (q) { const h = norm(it.name + ' ' + it.id + ' ' + it.grp + ' ' + (it.linha || '')); if (!q.split(/\s+/).every(w => h.includes(w))) return false; }
      return true;
    });
  }
  function row(it) {
    const usd = hasUsd(it.id), man = usd && isMan(it.id);
    const pill = !usd ? `<span class="pill man">PREÇO FIXO R$</span>` : man ? `<span class="pill man">PREÇO MANUAL</span>` : `<span class="pill">AUTOMÁTICO</span>`;
    return `<div class="prow${it.oculto ? ' off' : ''}" data-row="${it.id}">${thumb(it)}
      <div class="main"><div class="nm">${esc(it.name)}</div>
        <div class="sub"><span>${it.id}</span><span>${esc(it.cat)} · ${esc(it.grp)}${it.linha ? ' · ' + esc(it.linha) : ''}</span>${it.cond === 'seminovo' ? '<span class="tag semi">SEMINOVO</span>' : ''}${it.origem === 'nacional' ? '<span class="tag">NACIONAL</span>' : ''}${pill}${it.oculto ? '<span class="pill">OCULTO</span>' : ''}</div></div>
      <div class="fld"><label for="u-${it.id}">Custo US$</label><input class="inp" type="number" min="0" step="0.01" id="u-${it.id}" data-usd="${it.id}" value="${usd ? cust.usd[it.id] : ''}" placeholder="—"></div>
      <div class="fld"><label for="b-${it.id}">Venda R$${it.unit ? ' ' + UNIT[it.unit] : ''}</label><input class="inp" type="number" min="0" step="${it.unit ? '0.01' : '1'}" id="b-${it.id}" data-brl="${it.id}" value="${it.preco}"></div>
      <div class="acts">${man ? `<button class="btn sm" data-auto="${it.id}" title="Voltar a calcular pelo dólar">Automático</button>` : ''}<button class="btn sm ghost" data-hide="${it.id}">${it.oculto ? 'Mostrar' : 'Ocultar'}</button><button class="btn sm dark" data-edit="${it.id}">Editar</button></div></div>`;
  }
  function renderList() {
    const a = filtered();
    $('plist').innerHTML = a.length ? a.slice(0, shown).map(row).join('') : `<div class="empty">Nenhum produto com esse filtro.</div>`;
    $('moreBtn').hidden = a.length <= shown;
    $('moreBtn').textContent = `Mostrar mais (${a.length - Math.min(shown, a.length)} restantes)`;
  }
  function rerow(id) { const el = document.querySelector(`[data-row="${CSS.escape(id)}"]`); const it = byId(id); if (el && it) el.outerHTML = row(it); }
  function renderKpi() {
    if (!prod) return; const I = prod.itens;
    const n = I.length, off = I.filter(i => i.oculto).length, man = I.filter(i => hasUsd(i.id) && isMan(i.id)).length, semi = I.filter(i => i.cond === 'seminovo').length;
    $('kpi').innerHTML = `<span><b>${n}</b> produtos</span><span><b>${n - off}</b> visíveis</span><span><b>${man}</b> com preço manual</span><span><b>${semi}</b> seminovos</span>`;
  }
  function fillCats() { $('fcat').innerHTML = `<option value="">Todas</option>` + CATS.map(c => `<option>${c}</option>`).join(''); $('fCat').innerHTML = CATS.map(c => `<option>${c}</option>`).join(''); }
  function renderAll() {
    $('dolar').value = cust.dolar; $('contatoInp').value = prod.contato || ''; $('waInp').value = prod.whatsapp || '';
    renderList(); markDirty();
  }

  let ft; $('fq').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(() => { shown = PAGE; renderList(); }, 150); });
  $('fcat').addEventListener('change', () => { shown = PAGE; renderList(); });
  $('fshow').addEventListener('change', () => { shown = PAGE; renderList(); });
  $('moreBtn').addEventListener('click', () => { shown += PAGE * 2; renderList(); });

  $('plist').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.usd) {
      const id = t.dataset.usd, it = byId(id), v = parseFloat(t.value);
      if (t.value === '') { delete cust.usd[id]; setMan(id, false); }
      else if (!(v >= 0)) { t.value = hasUsd(id) ? cust.usd[id] : ''; return; }
      else { cust.usd[id] = v; recalc(it); }
      changed.add(id); rerow(id); markDirty();
    }
    if (t.dataset.brl) {
      const id = t.dataset.brl, it = byId(id), v = parseFloat(t.value);
      if (!(v > 0)) { t.value = it.preco; toast('Digite um preço maior que zero.'); return; }
      it.preco = it.unit ? Math.round(v * 100) / 100 : Math.round(v);
      if (hasUsd(id)) setMan(id, Math.abs(it.preco - auto(it)) >= 0.005);
      changed.add(id); rerow(id); markDirty();
    }
  });
  $('plist').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.auto) { const id = b.dataset.auto; setMan(id, false); recalc(byId(id)); changed.add(id); rerow(id); markDirty(); }
    if (b.dataset.hide) { const it = byId(b.dataset.hide); if (it.oculto) delete it.oculto; else it.oculto = true; changed.add(it.id); rerow(it.id); markDirty(); }
    if (b.dataset.edit) openForm(byId(b.dataset.edit));
  });
  $('applyDolar').addEventListener('click', () => {
    const v = parseFloat($('dolar').value); if (!(v > 0)) { toast('Digite um valor de dólar válido.'); $('dolar').value = cust.dolar; return; }
    if (!prod.itens.some(it => hasUsd(it.id))) { toast('Nenhum produto tem custo em dólar carregado, então o dólar não muda os preços. Veja o aviso em vermelho no topo.', 8000); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    cust.dolar = v; let n = 0;
    prod.itens.forEach(it => { if (hasUsd(it.id) && !isMan(it.id)) { const old = it.preco; recalc(it); if (old !== it.preco) { n++; changed.add(it.id); } } });
    renderList(); markDirty();
    toast(`Dólar a R$ ${String(v).replace('.', ',')}: ${n} preços recalculados. Toque em "Salvar e publicar" para os clientes verem.`, 7000);
  });
  $('contatoInp').addEventListener('input', e => { prod.contato = e.target.value.trim(); markDirty(); });
  $('waInp').addEventListener('input', e => { prod.whatsapp = e.target.value.replace(/\D/g, ''); markDirty(); });

  // ---------- formulário ----------
  let editing = null, fPhoto = null; // fPhoto = {dataUrl, b64}
  const radio = n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value;
  const setRadio = (n, v) => { const el = document.querySelector(`input[name="${n}"][value="${v}"]`); if (el) el.checked = true; };
  function fillLists() {
    const c = $('fCat').value;
    const gs = [...new Set((GORDER[c] || []).concat(prod.itens.filter(i => i.cat === c).map(i => i.grp)))];
    $('grpList').innerHTML = gs.map(g => `<option value="${esc(g)}">`).join('');
    const ls = [...new Set(prod.itens.filter(i => i.cat === c && i.linha).map(i => i.linha))].sort((a, b) => lnum(a) - lnum(b));
    $('linhaList').innerHTML = ls.map(l => `<option value="${esc(l)}">`).join('');
  }
  function formPrice() {
    const unit = $('fUnit').value;
    if (radio('fMode') === 'usd') { const u = parseFloat($('fUsd').value); if (!(u > 0)) return null; const v = u * cust.dolar; return unit ? Math.round(v * 100) / 100 : Math.round(v); }
    const v = parseFloat($('fBrl').value); if (!(v > 0)) return null; return unit ? Math.round(v * 100) / 100 : Math.round(v);
  }
  function updPreview() {
    const m = radio('fMode'); $('fUsdBox').hidden = m !== 'usd'; $('fBrlBox').hidden = m !== 'brl';
    const p = formPrice(), unit = $('fUnit').value;
    $('fPreview').innerHTML = p ? money(p, unit) + (unit ? `<small>${UNIT[unit]}</small>` : '') + (m === 'usd' ? `<small>US$ × ${String(cust.dolar).replace('.', ',')}</small>` : '') : '—';
  }
  function setThumb(it) { $('fThumb').innerHTML = fPhoto ? `<img class="one" src="${fPhoto.dataUrl}" alt="">` : (it ? thumb(it).replace(/^<div class="tb">|<\/div>$/g, '') : '<span class="help" style="display:grid;place-items:center;height:100%">sem foto</span>'); }
  function openForm(it) {
    editing = it || null; fPhoto = null; $('fPhoto').value = '';
    $('ftitle').textContent = it ? 'Editar ' + it.id : 'Novo produto';
    $('fName').value = it ? it.name : '';
    $('fCat').value = it ? it.cat : ($('fcat').value || 'Força'); fillLists();
    $('fGrp').value = it ? it.grp : ''; $('fLinha').value = it ? (it.linha || '') : ''; $('fSpec').value = it ? (it.spec || '') : '';
    setRadio('fCond', it ? (it.cond || 'novo') : 'novo'); setRadio('fOrig', it ? (it.origem || 'importado') : 'importado');
    $('fUnit').value = it ? (it.unit || '') : '';
    const usd = it && hasUsd(it.id);
    setRadio('fMode', !it || (usd && !isMan(it.id)) ? 'usd' : 'brl');
    $('fUsd').value = usd ? cust.usd[it.id] : ''; $('fBrl').value = it ? it.preco : '';
    $('fHide').checked = !!(it && it.oculto);
    $('fDelete').hidden = !it; $('fDelete').textContent = 'Remover produto'; delArm = false;
    setThumb(it); updPreview(); $('form').hidden = false; $('fName').focus();
  }
  function closeForm() { $('form').hidden = true; editing = null; fPhoto = null; }
  $('fCat').addEventListener('change', fillLists);
  ['fUsd', 'fBrl', 'fUnit'].forEach(id => $(id).addEventListener('input', updPreview));
  document.querySelectorAll('input[name="fMode"]').forEach(r => r.addEventListener('change', updPreview));
  $('fClose').addEventListener('click', closeForm); $('fCancel').addEventListener('click', closeForm);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('form').hidden) closeForm(); });

  function resizePhoto(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => {
        const MAX = 900; const k = Math.min(1, MAX / Math.max(im.width, im.height)); const w = Math.round(im.width * k), h = Math.round(im.height * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url); const dataUrl = cv.toDataURL('image/jpeg', 0.85); res({ dataUrl, b64: dataUrl.split(',')[1] });
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); }; im.src = url;
    });
  }
  $('fPhoto').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { fPhoto = await resizePhoto(f); setThumb(editing); } catch (err) { toast('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.'); }
  });
  function nextId(cat) {
    const p = PREFIX[cat]; cust.seq = cust.seq || {};
    let max = cust.seq[p] || 0;
    prod.itens.forEach(i => { const m = i.id.match(new RegExp('^RC-' + p + '(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
    cust.seq[p] = max + 1; return 'RC-' + p + String(max + 1).padStart(3, '0');
  }
  function dropPhoto(it) {
    if (!it.img || !it.img.startsWith('fotos/p/')) return;
    if (uploads[it.img]) delete uploads[it.img]; else deletes.add(it.img);
  }
  $('fOk').addEventListener('click', () => {
    const name = $('fName').value.trim(), cat = $('fCat').value, grp = $('fGrp').value.trim();
    if (!name) { toast('Digite o nome do produto.'); $('fName').focus(); return; }
    if (!grp) { toast('Escolha ou digite o tipo do produto.'); $('fGrp').focus(); return; }
    const preco = formPrice(); if (!preco) { toast(radio('fMode') === 'usd' ? 'Digite o custo em dólar.' : 'Digite o preço de venda.'); return; }
    let linha = $('fLinha').value.trim(); if (/^\d+$/.test(linha)) linha = 'Linha ' + linha;
    const it = editing || { id: nextId(cat) };
    Object.assign(it, { cat, grp, name, linha, spec: $('fSpec').value.trim().replace(/\s*\n\s*/g, ' · '), unit: $('fUnit').value, cond: radio('fCond'), origem: radio('fOrig'), preco });
    if ($('fHide').checked) it.oculto = true; else delete it.oculto;
    if (radio('fMode') === 'usd') { cust.usd[it.id] = parseFloat($('fUsd').value); setMan(it.id, false); }
    else setMan(it.id, hasUsd(it.id));
    if (fPhoto) {
      dropPhoto(it);
      const path = `fotos/p/${it.id}-${Date.now().toString(36)}.jpg`;
      uploads[path] = fPhoto.b64; it.img = path; it._preview = fPhoto.dataUrl; delete it.sp;
    }
    if (!editing) prod.itens.push(it);
    changed.add(it.id); const isNew = !editing; closeForm();
    if (isNew) { $('fshow').value = 'new'; $('fq').value = ''; $('fcat').value = ''; }
    shown = PAGE; renderList(); markDirty();
    toast((isNew ? 'Produto ' + it.id + ' criado.' : 'Produto atualizado.') + ' Toque em "Salvar e publicar" para os clientes verem.', 6500);
  });
  let delArm = false;
  $('fDelete').addEventListener('click', () => {
    if (!editing) return;
    if (!delArm) { delArm = true; $('fDelete').textContent = 'Toque de novo para remover'; setTimeout(() => { delArm = false; $('fDelete').textContent = 'Remover produto'; }, 3500); return; }
    const it = editing; dropPhoto(it);
    prod.itens = prod.itens.filter(i => i !== it); delete cust.usd[it.id]; setMan(it.id, false); changed.delete(it.id);
    closeForm(); renderList(); markDirty(); toast('Produto ' + it.id + ' removido. Toque em "Salvar e publicar" para confirmar.');
  });
  $('newBtn').addEventListener('click', () => openForm(null));

  // ---------- salvar / descartar ----------
  function prodJson() {
    const clean = prod.itens.map(i => { const o = Object.assign({}, i); delete o._preview; return o; });
    const head = Object.assign({}, prod); delete head.itens; head.atualizado = new Date().toISOString().slice(0, 10);
    const h = JSON.stringify(head); return h.slice(0, -1) + ',"itens":[\n' + clean.map(o => JSON.stringify(o)).join(',\n') + '\n]}\n';
  }
  $('saveBtn').addEventListener('click', async () => {
    if (busy || !isDirty()) return; busy = true; markDirty(); $('saveBtn').textContent = 'Publicando…';
    try {
      const ups = Object.keys(uploads); let k = 0;
      for (const p of ups) { status(`Enviando fotos (${++k}/${ups.length})…`); await putFile(cfg.repo, p, uploads[p], null, 'Foto de produto'); delete uploads[p]; }
      for (const p of [...deletes]) { status('Removendo fotos antigas…'); await delFile(cfg.repo, p, 'Remove foto antiga'); deletes.delete(p); }
      status('Publicando catálogo…');
      const txt = prodJson();
      try { const pr = await putFile(cfg.repo, 'data/produtos.json', b64FromText(txt), prodSha, 'Atualiza catálogo'); prodSha = pr.content.sha; }
      catch (e) { if (e.status === 403 || e.status === 404) { e.status = 'w'; e.message = 'O token ' + tokenTail() + ' não tem permissão de gravar no repositório "' + cfg.repo + '". No GitHub, edite o token: Repository access com "' + cfg.repo + '" e "' + cfg.priv + '", e Contents = Read and write. Depois toque em "Trocar token" e entre de novo.'; } throw e; }
      prod.atualizado = new Date().toISOString().slice(0, 10);
      prod.itens.forEach(i => delete i._preview);
      let custMsg = '';
      if (custOk) {
        status('Salvando custos (privado)…');
        try { const cr = await putFile(cfg.priv, 'custos.json', b64FromText(JSON.stringify(cust, null, 1)), custSha, 'Atualiza custos'); custSha = cr.content.sha; }
        catch (e) { custMsg = ' Atenção: os custos em dólar não foram salvos (' + errText(e) + ')'; }
      } else custMsg = ' Os custos em dólar não foram salvos porque a gestão não tem acesso ao repositório "' + cfg.priv + '".';
      snapshot(); changed.clear();
      status('Publicado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. O site dos clientes atualiza em 1 a 2 minutos.' + custMsg, custMsg ? 'err' : 'ok');
      toast('Catálogo publicado! Em 1 a 2 minutos os clientes já veem as mudanças.' + custMsg, custMsg ? 9000 : 5200);
      if ($('fshow').value === 'new') $('fshow').value = '';
      renderList();
    } catch (e) { console.error(e); const m = e.status === 'w' ? e.message : errText(e); status('NÃO publicou. ' + m, 'err'); banner('<h2>Não foi publicado</h2><p class="help">' + esc(m) + '</p><div class="row"><button class="btn dark" data-swap>Trocar token</button></div>'); toast('Não publicou. ' + m, 10000); }
    finally { busy = false; $('saveBtn').textContent = 'Salvar e publicar'; markDirty(); }
  });
  $('discardBtn').addEventListener('click', () => {
    if (!isDirty()) return;
    if (!$('discardBtn').dataset.arm) { $('discardBtn').dataset.arm = '1'; $('discardBtn').textContent = 'Toque de novo para descartar'; setTimeout(() => { delete $('discardBtn').dataset.arm; $('discardBtn').textContent = 'Descartar'; }, 3500); return; }
    delete $('discardBtn').dataset.arm; $('discardBtn').textContent = 'Descartar';
    prod = JSON.parse(snapProd); cust = JSON.parse(snapCust); uploads = {}; deletes.clear(); changed.clear(); renderAll(); toast('Alterações descartadas.');
  });

  // ---------- entrar ----------
  async function load() {
    $('loginView').hidden = true; $('appView').hidden = false; status('Carregando dados do GitHub…');
    try {
      const pf = await getFile(cfg.repo, 'data/produtos.json'); prodSha = pf.sha; prod = JSON.parse(pf.text);
    } catch (e) {
      if (e.status === 404) { showLogin('Não encontrei data/produtos.json no repositório "' + cfg.repo + '". Confira o nome do repositório e se a pasta data foi enviada.'); return; }
      showLogin(errText(e)); return;
    }
    let custErr = '';
    try { const cf = await getFile(cfg.priv, 'custos.json'); custSha = cf.sha; cust = JSON.parse(cf.text); }
    catch (e) {
      if (e.status === 401) { showLogin(errText(e)); return; }
      custSha = null; cust = { dolar: 28, usd: {}, manual: [] };
      let semAcesso = true; if (e.status === 404) { try { await gh('GET', `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.priv)}`); semAcesso = false; } catch (_) { } }
      custErr = semAcesso
        ? `O token em uso (${esc(tokenTail())}) não consegue abrir o repositório privado <b>${esc(cfg.priv)}</b>. Por isso os custos em dólar aparecem vazios e o "Aplicar a todos" não muda preços. No GitHub, abra o token, marque <b>${esc(cfg.repo)}</b> e <b>${esc(cfg.priv)}</b> em Repository access com Contents = Read and write. Se gerou um token novo, toque em <b>Trocar token</b> e cole o novo.`
        : `O repositório <b>${esc(cfg.priv)}</b> abriu, mas não tem o arquivo <b>custos.json</b> na raiz. Envie o custos.json para ele e recarregue a página.`;
    }
    if (custErr) banner('<h2>Custos em dólar não carregaram</h2><p class="help">' + custErr + '</p><div class="row"><button class="btn dark" data-swap>Trocar token</button><button class="btn" onclick="location.reload()">Recarregar</button></div>'); else banner('');
    custOk = !custErr;
    cust.usd = cust.usd || {}; cust.manual = cust.manual || []; cust.dolar = +cust.dolar || 28;
    prod.itens = prod.itens || [];
    snapshot();
    $('connInfo').innerHTML = `Conectado como <b>${esc(cfg.owner)}</b> · site: <b>${esc(cfg.repo)}</b> · custos: <b>${esc(cfg.priv)}</b> (privado) · token em uso: <b>${esc(tokenTail())}</b>.`;
    status('Pronto. Os preços dos clientes só mudam quando você toca em "Salvar e publicar".');
    renderAll();
  }
  function showLogin(msg) {
    $('appView').hidden = true; $('loginView').hidden = false;
    if (cfg) { $('lOwner').value = cfg.owner || ''; $('lRepo').value = cfg.repo || ''; $('lPriv').value = cfg.priv || 'rc-custos'; $('lToken').value = cfg.token || ''; }
    else { const g = location.hostname.match(/^([^.]+)\.github\.io$/); if (g) $('lOwner').value = g[1]; const seg = location.pathname.split('/').filter(Boolean); if (g && seg.length && !seg[0].endsWith('.html')) $('lRepo').value = seg[0]; else if (g) $('lRepo').value = g[1] + '.github.io'; }
    $('loginMsg').textContent = msg || ''; $('loginMsg').className = 'status' + (msg ? ' err' : '');
  }
  $('loginBtn').addEventListener('click', async () => {
    const c = { owner: $('lOwner').value.trim(), repo: $('lRepo').value.trim(), priv: $('lPriv').value.trim() || 'rc-custos', token: $('lToken').value.trim() };
    if (!c.owner || !c.repo || !c.token) { $('loginMsg').textContent = 'Preencha usuário, repositório do site e token.'; $('loginMsg').className = 'status err'; return; }
    cfg = c; $('loginMsg').textContent = 'Conferindo…'; $('loginMsg').className = 'status';
    try { await gh('GET', `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`); }
    catch (e) { $('loginMsg').textContent = errText(e); $('loginMsg').className = 'status err'; return; }
    try { localStorage.setItem('rc-admin', JSON.stringify(c)); } catch (e) { }
    load();
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-swap]')) { if (isDirty() && !confirmLeave()) return; try { localStorage.removeItem('rc-admin'); } catch (_) { } const keep = cfg; cfg = Object.assign({}, keep, { token: '' }); prod = null; cust = null; showLogin('Cole o token novo e toque em Entrar.'); $('lToken').value = ''; $('lToken').focus(); } });
  $('logoutBtn').addEventListener('click', () => {
    if (isDirty() && !confirmLeave()) return;
    try { localStorage.removeItem('rc-admin'); } catch (e) { }
    cfg = null; prod = null; cust = null; showLogin(''); $('lToken').value = '';
  });
  let leaveArm = false;
  function confirmLeave() { if (leaveArm) return true; leaveArm = true; toast('Há alterações não publicadas. Toque em "Sair" de novo para sair mesmo assim.'); setTimeout(() => leaveArm = false, 4000); return false; }

  fillCats();
  try { cfg = JSON.parse(localStorage.getItem('rc-admin') || 'null'); } catch (e) { cfg = null; }
  if (cfg && cfg.token) load(); else showLogin('');
})();
