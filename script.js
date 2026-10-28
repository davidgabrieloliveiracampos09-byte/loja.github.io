const $ = s => document.querySelector(s);
const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const db = (typeof supabase !== 'undefined' && SUPABASE_URL.startsWith('https://')) ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let mangas = [], orders = [], clients = 0, me = null;
let cart = (() => { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } })();
let view = 'shop', q = '', cat = 'Todos', editId = null, mode = 'login', busy = false;

const saveCart = () => localStorage.setItem('cart', JSON.stringify(cart));
const isAdmin = () => !!(me && me.admin);
const find = id => mangas.find(m => m.id === id);

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
}
function cover(m) {
  const img = m.img ? `<img src="${esc(m.img)}" alt="Capa de ${esc(m.title)}" loading="lazy" onerror="this.parentNode.classList.remove('has-img');this.remove()">` : '';
  return `<div class="cover${m.img ? ' has-img' : ''}" style="--a:hsl(${m.hue},70%,55%);--b:hsl(${(m.hue + 40) % 360},60%,22%)">${img}<b>${esc(m.title)}</b><small>${esc(m.cat)}</small></div>`;
}
function go(v) { view = v; render(); window.scrollTo(0, 0); }

/* ---------- Dados (Supabase) ---------- */
async function loadMangas() {
  const { data, error } = await db.from('mangas').select('*').order('id');
  if (error) return toast('Erro ao carregar produtos: ' + error.message);
  mangas = data.map(m => ({ ...m, price: Number(m.price) }));
}
async function loadOrders() {
  orders = []; clients = 0;
  if (!me) return;
  const { data } = await db.from('orders').select('*').order('id', { ascending: false });
  orders = data || [];
  if (me.admin) {
    const r = await db.from('profiles').select('id,is_admin');
    clients = (r.data || []).filter(p => !p.is_admin).length;
  }
}
async function setUser(session) {
  me = null;
  if (session) {
    const { data } = await db.from('profiles').select('name,is_admin').eq('id', session.user.id).single();
    me = { id: session.user.id, email: session.user.email, name: (data && data.name) || session.user.email, admin: !!(data && data.is_admin) };
  }
  await loadOrders();
}

/* ---------- Cabeçalho ---------- */
function renderNav() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  $('#nav').innerHTML =
    (me ? `<button onclick="go('orders')">Meus pedidos</button>` : '') +
    (isAdmin() ? `<button onclick="go('admin')">Painel admin</button>` : '') +
    (me ? `<button onclick="logout()">Sair (${esc(me.name.split(' ')[0])})</button>` : `<button onclick="openAuth()">Entrar</button>`) +
    `<button onclick="toggleCart(true)">Carrinho (${n})</button>`;
}

/* ---------- Loja ---------- */
function shopView() {
  const cats = ['Todos', ...new Set(mangas.map(m => m.cat))];
  if (!cats.includes(cat)) cat = 'Todos';
  const list = mangas.filter(m => (cat === 'Todos' || m.cat === cat) && (m.title + ' ' + m.author).toLowerCase().includes(q.toLowerCase()));
  return `<section class="hero"><h1>Mangás para ler do primeiro ao último volume.</h1><p>Frete grátis acima de R$ 150 e retirada combinada na loja.</p></section>
  <div class="chips">${cats.map(c => `<button class="${c === cat ? 'on' : ''}" onclick="cat='${esc(c).replace(/'/g, '')}';render()">${esc(c)}</button>`).join('')}</div>
  <div class="grid">${list.map(m => `<article class="card">${cover(m)}<div class="info">
    <h3>${esc(m.title)}</h3><span class="by">${esc(m.author)}</span><span class="price">${brl(m.price)}</span>
    ${m.stock > 0 && m.stock <= 5 ? `<span class="low">Restam ${m.stock}</span>` : ''}
    <button class="red" ${m.stock < 1 ? 'disabled' : ''} onclick="add(${m.id})">${m.stock < 1 ? 'Esgotado' : 'Adicionar ao carrinho'}</button></div></article>`).join('')}</div>
  ${list.length ? '' : '<p class="empty">Nenhum mangá encontrado. Tente outra busca ou categoria.</p>'}`;
}

/* ---------- Carrinho (fica salvo no navegador) ---------- */
function toggleCart(open) { $('#cart').classList.toggle('open', open); if (open) renderCart(); }
function add(id) {
  const m = find(id); if (!m) return;
  const it = cart.find(i => i.id === id);
  if (it) { if (it.qty >= m.stock) return toast('Você já tem todo o estoque no carrinho'); it.qty++; }
  else if (m.stock > 0) cart.push({ id, qty: 1 });
  saveCart(); renderNav(); renderCart(); toast(m.title + ' adicionado');
}
function chg(id, d) {
  const it = cart.find(i => i.id === id), m = find(id); if (!it || !m) return;
  it.qty = Math.min(it.qty + d, m.stock);
  if (it.qty <= 0) cart = cart.filter(i => i.id !== id);
  saveCart(); renderNav(); renderCart();
}
function renderCart() {
  cart = cart.filter(i => find(i.id));
  const total = cart.reduce((s, i) => s + find(i.id).price * i.qty, 0);
  $('#items').innerHTML = cart.length ? cart.map(i => { const m = find(i.id); return `<div class="it">${cover(m)}
    <div><strong>${esc(m.title)}</strong><br>${brl(m.price)}</div>
    <div class="qty"><button onclick="chg(${m.id},-1)" aria-label="Diminuir">-</button>${i.qty}<button onclick="chg(${m.id},1)" aria-label="Aumentar">+</button></div></div>`; }).join('')
    : '<p class="empty">Seu carrinho está vazio. Escolha um mangá na loja.</p>';
  $('#total').textContent = brl(total);
}
async function checkout() {
  if (!cart.length) return toast('Adicione algo ao carrinho primeiro');
  if (!me) { toggleCart(false); toast('Entre na sua conta para finalizar'); return openAuth(); }
  if (busy) return; busy = true;
  try {
    const { error } = await db.rpc('place_order', { p_items: cart.map(i => ({ id: i.id, qty: i.qty })) });
    if (error) { await loadMangas(); renderCart(); return toast(error.message); }
    cart = []; saveCart();
    await loadMangas(); await loadOrders();
    toggleCart(false); view = 'orders'; render(); toast('Pedido realizado com sucesso!');
  } finally { busy = false; }
}

/* ---------- Pedidos ---------- */
function ordersTable(list, admin) {
  if (!list.length) return '<p class="empty">Nenhum pedido ainda.</p>';
  return `<div class="tw"><table><tr><th>Pedido</th>${admin ? '<th>Cliente</th>' : ''}<th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr>${list.map(o =>
    `<tr><td>#${o.id}</td>${admin ? `<td>${esc(o.user_email || '')}</td>` : ''}<td>${new Date(o.created_at).toLocaleString('pt-BR')}</td>
    <td>${o.items.map(i => esc(i.title) + ' x' + i.qty).join(', ')}</td><td>${brl(o.total)}</td>
    <td>${admin ? `<select onchange="setStatus(${o.id},this.value)">${['Pendente', 'Enviado', 'Entregue', 'Cancelado'].map(s => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select>` : esc(o.status)}</td></tr>`).join('')}</table></div>`;
}
function ordersView() {
  if (!me) return '<p class="empty">Entre na sua conta para ver seus pedidos.</p>';
  return `<h2>Meus pedidos</h2><div class="panel" style="margin-top:1rem">${ordersTable(orders.filter(o => o.user_id === me.id), false)}</div>`;
}
async function setStatus(id, s) {
  const { error } = await db.from('orders').update({ status: s }).eq('id', id);
  if (error) return toast('Erro: ' + error.message);
  orders.find(o => o.id === id).status = s; toast('Status atualizado');
}

/* ---------- Admin ---------- */
function adminView() {
  const e = editId ? find(editId) : null;
  const fat = orders.filter(o => o.status !== 'Cancelado').reduce((s, o) => s + Number(o.total), 0);
  return `<h2>Painel administrativo</h2>
  <div class="stats" style="margin-top:1rem"><div class="panel"><span>Faturamento</span><strong>${brl(fat)}</strong></div>
  <div class="panel"><span>Pedidos</span><strong>${orders.length}</strong></div>
  <div class="panel"><span>Produtos</span><strong>${mangas.length}</strong></div>
  <div class="panel"><span>Clientes</span><strong>${clients}</strong></div></div>
  <div class="panel"><h3>${e ? 'Editar mangá' : 'Novo mangá'}</h3><div class="form" style="margin-top:.7rem">
    <label>Título<input id="f-t" value="${e ? esc(e.title) : ''}"></label>
    <label>Autor<input id="f-a" value="${e ? esc(e.author) : ''}"></label>
    <label>Categoria<input id="f-c" value="${e ? esc(e.cat) : ''}" placeholder="Shonen"></label>
    <label>Preço (R$)<input id="f-p" value="${e ? e.price : ''}" inputmode="decimal"></label>
    <label>Estoque<input id="f-s" type="number" min="0" value="${e ? e.stock : ''}"></label>
    <label style="grid-column:1/-1">Link da foto da capa (opcional)<input id="f-i" value="${e && e.img ? esc(e.img) : ''}" placeholder="https://site.com/capa.jpg" oninput="prev()"></label>
    <div id="prev" style="width:110px">${e && e.img ? cover(e) : ''}</div>
    <div style="display:flex;gap:.5rem"><button class="red" onclick="saveManga()">${e ? 'Salvar alterações' : 'Adicionar mangá'}</button>${e ? '<button onclick="editId=null;render()">Cancelar</button>' : ''}</div></div></div>
  <div class="panel"><h3>Produtos</h3><div class="tw"><table><tr><th>Título</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th></th></tr>${mangas.map(m =>
    `<tr><td>${esc(m.title)}</td><td>${esc(m.cat)}</td><td>${brl(m.price)}</td><td>${m.stock}</td>
    <td><button onclick="editId=${m.id};render();window.scrollTo(0,0)">Editar</button> <button onclick="delManga(${m.id})">Excluir</button></td></tr>`).join('')}</table></div></div>
  <div class="panel"><h3>Todos os pedidos</h3>${ordersTable(orders, true)}</div>`;
}
async function saveManga() {
  const g = id => $('#' + id).value.trim();
  const t = g('f-t'), p = parseFloat(g('f-p').replace(',', '.')), s = parseInt(g('f-s'), 10);
  if (!t || isNaN(p) || p <= 0 || isNaN(s) || s < 0) return toast('Informe título, preço e estoque válidos');
  const img = g('f-i');
  if (img && !/^(https?:\/\/|data:image\/)/i.test(img)) return toast('O link da foto deve começar com http:// ou https://');
  const data = { title: t, author: g('f-a') || 'Autor desconhecido', cat: g('f-c') || 'Shonen', price: p, stock: s, img };
  if (busy) return; busy = true;
  try {
    const r = editId
      ? await db.from('mangas').update(data).eq('id', editId)
      : await db.from('mangas').insert({ ...data, hue: Math.floor(Math.random() * 360) });
    if (r.error) return toast('Erro: ' + r.error.message);
    toast(editId ? 'Mangá atualizado' : 'Mangá adicionado'); editId = null;
    await loadMangas(); render();
  } finally { busy = false; }
}
function prev() {
  const u = $('#f-i').value.trim();
  $('#prev').innerHTML = u ? cover({ title: $('#f-t').value || 'Prévia', cat: $('#f-c').value || 'Categoria', hue: 200, img: u }) : '';
}
async function delManga(id) {
  if (!confirm('Excluir este mangá?')) return;
  const { error } = await db.from('mangas').delete().eq('id', id);
  if (error) return toast('Erro: ' + error.message);
  cart = cart.filter(i => i.id !== id); saveCart();
  await loadMangas(); render(); toast('Mangá excluído');
}

/* ---------- Login e cadastro ---------- */
function setMode(m) {
  mode = m; $('#f-name').style.display = m === 'reg' ? '' : 'none';
  $('#a-go').textContent = m === 'reg' ? 'Criar conta' : 'Entrar'; $('#err').textContent = '';
  $('#t-login').classList.toggle('on', m === 'login'); $('#t-reg').classList.toggle('on', m === 'reg');
}
function openAuth() { setMode('login'); $('#auth').showModal(); }
function traduz(msg) {
  if (/invalid login/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(msg)) return 'Este e-mail já tem cadastro.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos.';
  return msg;
}
async function doAuth(e) {
  e.preventDefault();
  if (busy) return; busy = true; $('#err').textContent = '';
  const email = $('#a-email').value.trim().toLowerCase(), pass = $('#a-pass').value, name = $('#a-name').value.trim();
  try {
    const r = mode === 'login'
      ? await db.auth.signInWithPassword({ email, password: pass })
      : await db.auth.signUp({ email, password: pass, options: { data: { name: name || email.split('@')[0] } } });
    if (r.error) { $('#err').textContent = traduz(r.error.message); return; }
    if (!r.data.session) { $('#err').textContent = 'Conta criada! Confirme o e-mail que enviamos e depois entre.'; return; }
    await setUser(r.data.session);
    $('#auth').close(); e.target.reset(); view = 'shop'; render(); toast('Bem-vindo, ' + me.name + '!');
  } finally { busy = false; }
}
async function logout() {
  await db.auth.signOut(); me = null; orders = []; clients = 0;
  view = 'shop'; render(); toast('Você saiu da conta');
}

/* ---------- Render e início ---------- */
function render() {
  if (view === 'admin' && !isAdmin()) view = 'shop';
  $('#app').innerHTML = view === 'admin' ? adminView() : view === 'orders' ? ordersView() : shopView();
  renderNav();
}
(async function init() {
  if (!db) {
    $('#app').innerHTML = '<p class="empty">Abra o arquivo config.js e cole a URL e a chave pública do seu projeto Supabase.</p>';
    return;
  }
  try {
    const { data } = await db.auth.getSession();
    await setUser(data.session);
    await loadMangas();
  } catch (err) { toast('Não foi possível conectar ao Supabase: ' + err.message); }
  render(); renderCart();
})();