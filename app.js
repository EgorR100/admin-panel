import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, where, 
  updateDoc, deleteDoc, arrayUnion, getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// ВСТАВЬ СЮДА СВОЙ firebaseConfig ИЗ ПАНЕЛИ FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBa_b7A-UYhNh8jFhefJWIV0m57nTkqrzk",
  authDomain: "household-space.firebaseapp.com",
  projectId: "household-space",
  storageBucket: "household-space.firebasestorage.app",
  messagingSenderId: "471755254217",
  appId: "1:471755254217:web:d1bda855b262144f992018"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Глобальные переменные
let me = null, family = null, familyId = null;
let currentTableId = null, cellContext = null, columnDraft = [];

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

function toast(msg, ms = 3000) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), ms);
}

function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id)?.classList.add("active");
  $("app-header")?.classList.remove("hidden");
  $("bell-btn").style.display = ["scr-login"].includes(id) ? "none" : "block";
}

// Транслитерация для надежного email (Мама -> mama)
function translit(str) {
  const ru = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  return str.toLowerCase().split('').map(c => ru[c] || c).join('').replace(/[^a-z0-9]/g, '');
}

// ============================================================
// АВТОРИЗАЦИЯ
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = { id: user.uid, name: user.displayName || "Пользователь" };
    await loadFamily();
    if (!familyId) show("scr-family-choice");
    else enterHome();
  } else {
    me = null; family = null; familyId = null;
    show("scr-login");
  }
});

$("btn-login").onclick = async () => {
  const name = $("login-name").value.trim();
  const pass = $("login-pass").value;
  if (!name || !pass) return toast("Заполните все поля");
  
  const email = `${translit(name)}@family.local`;
  
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    toast("Неверное имя или пароль");
    console.error("Ошибка входа:", e.code);
  }
};

$("btn-logout").onclick = async () => { 
  await signOut(auth); 
};

// ============================================================
// СЕМЬЯ
// ============================================================
async function loadFamily() {
  try {
    const q = query(collection(db, "families"), where("members", "array-contains", me.id));
    const snap = await getDocs(q);
    if (snap.empty) { family = null; familyId = null; return; }
    const docSnap = snap.docs[0];
    familyId = docSnap.id;
    family = { id: familyId, ...docSnap.data() };
  } catch (e) { console.error(e); }
}

$("btn-do-create-family").onclick = async () => {
  const name = $("new-family-name").value.trim() || "Моя семья";
  const newId = uid();
  try {
    await setDoc(doc(db, "families", newId), {
      name, ownerId: me.id, members: [me.id], canInvite: [], memberNames: { [me.id]: me.name }
    });
    await loadFamily();
    enterHome();
  } catch (e) { toast("Ошибка: " + e.message); }
};

$("btn-join-family").onclick = async () => {
  const id = $("join-family-id").value.trim();
  if (!id) return toast("Введите ID семьи");
  try {
    const famRef = doc(db, "families", id);
    const famSnap = await getDoc(famRef);
    if (!famSnap.exists()) return toast("Семья не найдена");
    await updateDoc(famRef, { 
      members: arrayUnion(me.id),
      [`memberNames.${me.id}`]: me.name
    });
    await loadFamily();
    enterHome();
  } catch(e) { toast("Ошибка: " + e.message); }
};

$("btn-rename-group").onclick = async () => {
  if (!isOwner()) return toast("Только админ может менять название");
  const n = $("group-name-input").value.trim();
  if (!n) return toast("Введите название");
  await updateDoc(doc(db, "families", familyId), { name: n });
  family.name = n;
  renderFamilyTab();
  toast("Название обновлено");
};

$("btn-share-family").onclick = async () => {
  try { await navigator.clipboard.writeText(familyId); toast("ID скопирован"); }
  catch { prompt("Скопируйте ID:", familyId); }
};

$("btn-leave").onclick = async () => {
  if (!confirm("Покинуть семью?")) return;
  await updateDoc(doc(db, "families", familyId), { members: arrayRemove(me.id) });
  family = null; familyId = null;
  show("scr-family-choice");
};

$("btn-delete-family").onclick = async () => {
  if (!isOwner()) return toast("Только владелец может удалить семью");
  if (!confirm("Удалить всю семью и таблицы?")) return;
  await deleteDoc(doc(db, "families", familyId));
  family = null; familyId = null;
  show("scr-family-choice");
  toast("Семья удалена");
};

function enterHome() {
  show("scr-home");
  renderFamilyTab();
  switchTab("tables");
  renderTables();
  updateBell();
}

function switchTab(n) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === n));
  document.querySelectorAll(".tabpane").forEach(p => p.classList.toggle("active", p.id === "tab-" + n));
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.tab));

const isOwner = () => !!family && family.ownerId === me?.id;
const canInvite = () => !!family && !!me && (isOwner() || (family.canInvite || []).includes(me.id));

function renderFamilyTab() {
  if (!family) return;
  $("fam-name-label").textContent = family.name || "Семья";
  $("fam-id-label").textContent = familyId;
  $("btn-share-family").style.display = canInvite() ? "inline-flex" : "none";
  $("btn-leave").style.display = isOwner() ? "none" : "block";
  $("admin-zone").style.display = isOwner() ? "block" : "none";
  $("rename-group-zone").style.display = isOwner() ? "block" : "none";
  $("group-name-input").value = family.name || "";
  
  const box = $("members-container"); box.innerHTML = "";
  (family.members || []).forEach(id => {
    const name = family.memberNames?.[id] || "Участник";
    const role = id === family.ownerId ? "Владелец" : ((family.canInvite || []).includes(id) ? "Модератор" : "Участник");
    const el = document.createElement("div");
    el.className = "member";
    
    let acts = "";
    if (id === me.id) {
      acts = `<span class="role">${role}</span>`;
    } else if (canInvite()) {
      acts = (isOwner() ? `<button class="btn-tiny" data-action="invite" data-user="${id}">${(family.canInvite||[]).includes(id) ? 'Снять права' : 'Дать права'}</button>` : '') +
             `<button class="btn-tiny" data-action="remove" data-user="${id}">Удалить</button>`;
    } else {
      acts = `<span class="role">${role}</span>`;
    }
    
    el.innerHTML = `<div class="info"><b>${esc(name)}</b></div><div class="acts">${acts}</div>`;
    box.appendChild(el);
  });

  box.querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
    const n = b.dataset.user;
    if (b.dataset.action === 'remove') {
      if (!confirm('Удалить участника?')) return;
      await updateDoc(doc(db, "families", familyId), { members: arrayRemove(n) });
    } else {
      const a = family.canInvite || [];
      const next = a.includes(n) ? a.filter(x => x !== n) : [...a, n];
      await updateDoc(doc(db, "families", familyId), { canInvite: next });
    }
    await loadFamily();
    renderFamilyTab();
    toast('Готово');
  });
}

// ============================================================
// ТАБЛИЦЫ
// ============================================================
async function renderTables() {
  const box = $("tables-container"); box.innerHTML = "";
  try {
    const q = query(collection(db, "tables"), where("familyId", "==", familyId));
    const snap = await getDocs(q);
    if (snap.empty) { box.innerHTML = '<div class="empty">Таблиц пока нет. Нажмите ＋, чтобы создать.</div>'; return; }
    
    snap.forEach(d => {
      const t = d.data();
      const el = document.createElement("div");
      el.className = "purchase-card";
      el.innerHTML = `<div class="pc-head"><b>${esc(t.name)}</b><small>${(t.columns||[]).length} столбц. · ${(t.rows||[]).length} строк</small></div><div class="row-gap"><button class="btn primary" data-open="${d.id}">Открыть</button><button class="btn danger" data-delete="${d.id}">Удалить</button></div>`;
      box.appendChild(el);
    });
    
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openTable(b.dataset.open));
    box.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
      if(confirm('Удалить таблицу?')) {
        await deleteDoc(doc(db, "tables", b.dataset.delete));
        renderTables();
        toast("Таблица удалена");
      }
    });
  } catch (e) { console.error(e); }
}

$("btn-new-table").onclick = () => {
  $("table-modal-title").textContent = 'Новая таблица';
  $("table-name").value = '';
  $("modal-table").classList.remove('hidden');
};

$("btn-cancel-table").onclick = () => $("modal-table").classList.add('hidden');

$("btn-confirm-table").onclick = async () => {
  const name = $("table-name").value.trim();
  if (!name) return toast('Введите название');
  const newRef = doc(collection(db, "tables"));
  await setDoc(newRef, {
    familyId, name,
    columns: [{ id: uid(), name: 'Название', type: 'text', options: [] }],
    rows: [{}], createdAt: Date.now()
  });
  $("modal-table").classList.add('hidden');
  renderTables();
  openTable(newRef.id);
};

async function openTable(id) {
  currentTableId = id;
  const snap = await getDoc(doc(db, "tables", id));
  if (!snap.exists()) return;
  show('scr-table');
  $("table-heading").textContent = snap.data().name;
  renderGrid({ id: snap.id, ...snap.data() });
}

// ============================================================
// СЕТКА ТАБЛИЦЫ И ЯЧЕЙКИ
// ============================================================
function renderGrid(t) {
  const wrap = $("table-grid-wrap"); wrap.innerHTML = "";
  const table = document.createElement("table"); table.className = "data-table";
  const thead = document.createElement("thead"), hr = document.createElement("tr");
  const no = document.createElement("th"); no.textContent = "#"; hr.appendChild(no);
  
  t.columns.forEach(c => { const th = document.createElement("th"); th.textContent = c.name; hr.appendChild(th); });
  thead.appendChild(hr); table.appendChild(thead);
  
  const tbody = document.createElement("tbody");
  (t.rows || []).forEach((r, ri) => {
    const tr = document.createElement("tr");
    const num = document.createElement("td"); num.textContent = ri + 1; num.className = "row-number"; tr.appendChild(num);
    
    t.columns.forEach(c => {
      const td = document.createElement("td"); td.textContent = r[c.id] || "";
      td.onclick = () => editCell(t.id, ri, c.id);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table);
}

function editCell(tableId, rowIndex, colId) {
  getDoc(doc(db, "tables", tableId)).then(snap => {
    if (!snap.exists()) return;
    const t = snap.data();
    const c = t.columns.find(x => x.id === colId);
    if (!c) return;
    
    cellContext = { tableId, rowIndex, colId };
    $("cell-modal-title").textContent = c.name;
    const host = $("cell-editor"); host.innerHTML = "";
    
    let input;
    if (c.type === 'select') {
      input = document.createElement('select');
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— Выберите —'; input.appendChild(blank);
      (c.options || []).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; input.appendChild(o); });
      input.value = t.rows[rowIndex][colId] || '';
    } else {
      input = document.createElement('input');
      input.type = c.type === 'date' ? 'date' : c.type === 'time' ? 'time' : 'text';
      let val = t.rows[rowIndex][colId] || "";
      if (c.type === 'date' && /^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
        const [d, m, y] = val.split("."); val = `${y}-${m}-${d}`;
      }
      input.value = val;
    }
    
    input.id = "cell-value";
    host.appendChild(input);
    $("modal-cell").classList.remove('hidden');
  });
}

$("btn-cancel-cell").onclick = () => $("modal-cell").classList.add('hidden');

$("btn-save-cell").onclick = async () => {
  if (!cellContext) return;
  const { tableId, rowIndex, colId } = cellContext;
  const tSnap = await getDoc(doc(db, "tables", tableId));
  if (!tSnap.exists()) return;
  
  const t = tSnap.data();
  const c = t.columns.find(x => x.id === colId);
  let value = $("cell-value").value;
  if (c.type === 'date' && value) {
    const [y, m, d] = value.split('-'); value = `${d}.${m}.${y}`;
  }
  
  t.rows[rowIndex][colId] = value;
  await updateDoc(doc(db, "tables", tableId), { rows: t.rows });
  $("modal-cell").classList.add('hidden');
  renderGrid({ id: tableId, ...t });
  toast('Сохранено');
};

// ============================================================
// СТОЛБЦЫ (ДОБАВЛЕНИЕ)
// ============================================================
$("btn-manage-columns").onclick = async () => {
  const tSnap = await getDoc(doc(db, "tables", currentTableId));
  if (!tSnap.exists()) return;
  const t = tSnap.data();
  columnDraft = t.columns.map(c => ({ ...c, options: [...(c.options || [])] }));
  renderColumnEditor();
  $("column-name").value = ''; $("column-type").value = 'text'; $("column-options").value = '';
  toggleOptions();
  $("modal-columns").classList.remove('hidden');
};

function renderColumnEditor() {
  const box = $("columns-editor"); box.innerHTML = "";
  columnDraft.forEach((c, i) => {
    const row = document.createElement("div"); row.className = "column-editor-row";
    row.innerHTML = `<div><b>${esc(c.name)}</b><div class="muted small">${c.type}</div></div><button class="btn-tiny" data-rm-col="${i}">Удалить</button>`;
    box.appendChild(row);
  });
  box.querySelectorAll('[data-rm-col]').forEach(b => b.onclick = () => { columnDraft.splice(+b.dataset.rmCol, 1); renderColumnEditor(); });
}

function toggleOptions() {
  const on = $("column-type").value === 'select';
  $("options-label").classList.toggle('hidden', !on);
  $("column-options").classList.toggle('hidden', !on);
}
$("column-type").onchange = toggleOptions;

$("btn-add-column").onclick = () => {
  const name = $("column-name").value.trim();
  const type = $("column-type").value;
  if (!name) return toast('Введите название');
  if (columnDraft.some(c => c.name.toLowerCase() === name.toLowerCase())) return toast('Уже есть');
  const options = $("column-options").value.split(',').map(x => x.trim()).filter(Boolean);
  columnDraft.push({ id: uid(), name, type, options });
  $("column-name").value = ''; $("column-options").value = '';
  renderColumnEditor();
};

$("btn-close-columns").onclick = async () => {
  const tSnap = await getDoc(doc(db, "tables", currentTableId));
  const t = tSnap.data();
  t.columns = columnDraft;
  t.rows = (t.rows || []).map(r => {
    const next = {}; t.columns.forEach(c => next[c.id] = r[c.id] || ''); return next;
  });
  await updateDoc(doc(db, "tables", currentTableId), { columns: t.columns, rows: t.rows });
  $("modal-columns").classList.add('hidden');
  openTable(currentTableId);
};

// ============================================================
// КОЛОКОЛЬЧИК И УВЕДОМЛЕНИЯ
// ============================================================
async function updateBell() {
  if(!familyId) return;
  try {
    const q = query(collection(db, "notifications"), where("familyId", "==", familyId));
    const snap = await getDocs(q);
    const count = snap.docs.filter(d => d.data().authorId !== me.id).length;
    $("bell-badge").textContent = count;
    $("bell-badge").classList.toggle("hidden", count === 0);
  } catch (e) { console.error(e); }
}

$("bell-btn").onclick = async () => {
  if (!me || !familyId) return toast('Сначала войдите');
  try {
    const q = query(collection(db, "notifications"), where("familyId", "==", familyId));
    const snap = await getDocs(q);
    const box = $("notifs-container"); box.innerHTML = "";
    const list = snap.docs.filter(d => d.data().authorId !== me.id);
    
    if (list.length === 0) {
      box.innerHTML = '<div class="empty">Новых оповещений нет.</div>';
    } else {
      list.forEach(d => {
        const n = d.data();
        const el = document.createElement("div"); el.className = "notif info";
        el.innerHTML = `<div class="t">${esc(n.authorName || "Кто-то")} · ${esc(n.tableName)}</div><div class="d">${esc(n.action)} · ${new Date(n.createdAt).toLocaleString('ru-RU')}</div>`;
        box.appendChild(el);
      });
    }
    show("scr-notifs");
  } catch (e) { toast("Ошибка загрузки"); }
};

$("btn-close-notifs").onclick = () => { show("scr-home"); updateBell(); };

// Кнопки на экране таблицы
$("btn-back-tables").onclick = () => { show("scr-home"); renderTables(); };
$("btn-add-row").onclick = async () => {
  if (!currentTableId) return;
  const tSnap = await getDoc(doc(db, "tables", currentTableId));
  const t = tSnap.data();
  t.rows.push({});
  await updateDoc(doc(db, "tables", currentTableId), { rows: t.rows });
  renderGrid({ id: currentTableId, ...t });
  toast('Строка добавлена');
};
$("btn-save-table").onclick = () => { toast('Все изменения сохранены в облаке!'); renderTables(); };
