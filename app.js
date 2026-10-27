import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, arrayUnion, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let me = null, familyId = null, familyData = null;
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
}
function translit(str) {
  const ru = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  return str.toLowerCase().split('').map(c => ru[c] || c).join('').replace(/[^a-z0-9]/g, '');
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = { id: user.uid, name: user.displayName || "Пользователь" };
    await loadFamily();
    if (!familyId) show("scr-family-choice");
    else enterHome();
  } else {
    me = null; familyId = null; familyData = null;
    show("scr-login");
  }
});

$("to-register").onclick = () => show("scr-register");
$("to-login").onclick = () => show("scr-login");

$("btn-login").onclick = async () => {
  const name = $("login-name").value.trim();
  const pass = $("login-pass").value;
  if (!name || !pass) return toast("Заполните поля");
  try { await signInWithEmailAndPassword(auth, `${translit(name)}@family.local`, pass); }
  catch (e) { toast(`Ошибка: неверное имя или пароль`); }
};

$("btn-register").onclick = async () => {
  const name = $("reg-name").value.trim();
  const pass = $("reg-pass").value;
  if (!name || !pass) return toast("Заполните поля");
  if (pass.length < 6) return toast("Пароль минимум 6 символов");
  const btn = $("btn-register"); btn.disabled = true; btn.textContent = "Создание...";
  try {
    const cred = await createUserWithEmailAndPassword(auth, `${translit(name)}@family.local`, pass);
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    toast(e.code === 'auth/email-already-in-use' ? "Это имя занято" : "Ошибка регистрации");
    btn.disabled = false; btn.textContent = "Создать аккаунт";
  }
};

const logout = async () => { await signOut(auth); show("scr-login"); };
$("btn-logout").onclick = logout;
$("btn-logout2").onclick = logout;

// ==========================================
// СЕМЬЯ
// ==========================================
async function loadFamily() {
  const q = query(collection(db, "families"), where("members", "array-contains", me.id));
  const snap = await getDocs(q);
  if (snap.empty) { familyId = null; familyData = null; return; }
  const docSnap = snap.docs[0];
  familyId = docSnap.id;
  familyData = docSnap.data();
}

$("btn-create-family").onclick = () => show("scr-family-new");
$("back-choice-1").onclick = () => show("scr-family-choice");

$("btn-do-create-family").onclick = async () => {
  const name = $("new-family-name").value.trim() || "Моя семья";
  const newId = uid();
  await setDoc(doc(db, "families", newId), {
    name, ownerId: me.id, members: [me.id], memberNames: { [me.id]: me.name }, canInvite: []
  });
  await loadFamily(); enterHome();
};

$("btn-join-family").onclick = async () => {
  const code = $("join-family-id").value.trim();
  if (!code) return toast("Введите код");
  const famRef = doc(db, "families", code);
  const famSnap = await getDoc(famRef);
  if (!famSnap.exists()) return toast("Семья не найдена");
  
  await updateDoc(famRef, { members: arrayUnion(me.id), [`memberNames.${me.id}`]: me.name });
  await loadFamily(); enterHome();
};

function enterHome() {
  show("scr-home");
  renderFamilyTab();
  renderTables();
  updateBell();
}

const isOwner = () => !!familyData && familyData.ownerId === me?.id;

function renderFamilyTab() {
  if (!familyData) return;
  $("fam-name-label").textContent = familyData.name || "Семья";
  $("fam-id-label").textContent = familyId;
  
  $("admin-zone").style.display = isOwner() ? "block" : "none";
  $("rename-group-zone").style.display = isOwner() ? "block" : "none";
  $("group-name-input").value = familyData.name || "";
  
  const box = $("members-container"); box.innerHTML = "";
  (familyData.members || []).forEach(id => {
    const name = familyData.memberNames?.[id] || "Без имени";
    const isMe = id === me.id;
    const role = id === familyData.ownerId ? "Владелец" : "Участник";
    
    const el = document.createElement("div");
    el.className = "member";
    el.innerHTML = `
      <div class="info">
        <b>${esc(name)} ${isMe ? '(Вы)' : ''}</b>
        <div class="muted small">UID: <code>${id.slice(0,8)}...</code></div>
      </div>
      <div class="acts"><span class="role">${role}</span></div>
    `;
    box.appendChild(el);
  });
}

$("btn-rename-group").onclick = async () => {
  if (!isOwner()) return toast("Только админ может менять название");
  const n = $("group-name-input").value.trim();
  if (!n) return toast("Введите название");
  await updateDoc(doc(db, "families", familyId), { name: n });
  familyData.name = n;
  renderFamilyTab(); toast("Название обновлено");
};

document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === b.dataset.tab));
  document.querySelectorAll(".tabpane").forEach(p => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
});

// ==========================================
// ТАБЛИЦЫ
// ==========================================
async function renderTables() {
  const box = $("tables-container"); box.innerHTML = "";
  if (!familyId) return;
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
      renderTables(); toast("Удалено");
    }
  });
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
  renderTables(); openTable(newRef.id);
};

async function openTable(id) {
  currentTableId = id;
  const snap = await getDoc(doc(db, "tables", id));
  if (!snap.exists()) return;
  show('scr-table');
  $("table-heading").textContent = snap.data().name;
  renderGrid({ id: snap.id, ...snap.data() });
}

// ==========================================
// РЕДАКТОР ТАБЛИЦЫ
// ==========================================
function renderGrid(t) {
  const wrap = $("table-grid-wrap"); wrap.innerHTML = "";
  if (!t.columns || !t.columns.length) {
    wrap.innerHTML = '<div class="empty">Добавьте столбцы через ⚙ Столбцы.</div>'; return;
  }

  const table = document.createElement("table"); table.className = "data-table";
  const thead = document.createElement("thead"), hr = document.createElement("tr");
  const no = document.createElement("th"); no.textContent = "#"; no.className = "row-number"; hr.appendChild(no);
  
  t.columns.forEach(c => { const th = document.createElement("th"); th.textContent = c.name; hr.appendChild(th); });
  thead.appendChild(hr); table.appendChild(thead);
  
  const tbody = document.createElement("tbody");
  (t.rows || []).forEach((r, ri) => {
    const tr = document.createElement("tr");
    const num = document.createElement("td"); num.textContent = ri + 1; num.className = "row-number"; tr.appendChild(num);
    
    t.columns.forEach(c => {
      const td = document.createElement("td"); td.textContent = r[c.id] || "";
      td.title = "Нажмите, чтобы изменить";
      td.onclick = () => editCell(t.id, ri, c.id);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody); wrap.appendChild(table);
}

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

$("btn-save-table").onclick = () => { toast('Все изменения уже сохранены!'); renderTables(); };

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
  
  await addDoc(collection(db, "notifications"), {
    familyId, tableId, tableName: t.name,
    authorId: me.id, authorName: me.name,
    action: `изменил(а) ячейку «${c.name}»`,
    createdAt: Date.now()
  });

  $("modal-cell").classList.add('hidden');
  renderGrid({ id: tableId, ...t });
  toast('Сохранено');
};

// ==========================================
// СТОЛБЦЫ
// ==========================================
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

// ==========================================
// УВЕДОМЛЕНИЯ
// ==========================================
async function updateBell() {
  if(!familyId) return;
  const q = query(collection(db, "notifications"), where("familyId", "==", familyId));
  const snap = await getDocs(q);
  const count = snap.docs.filter(d => d.data().authorId !== me.id).length;
  $("bell-badge").textContent = count;
  $("bell-badge").classList.toggle("hidden", count === 0);
}

$("bell-btn").onclick = async () => {
  if (!me || !familyId) return toast('Сначала войдите');
  const q = query(collection(db, "notifications"), where("familyId", "==", familyId));
  const snap = await getDocs(q);
  const box = $("notifs-container"); box.innerHTML = "";
  const list = snap.docs.filter(d => d.data().authorId !== me.id).sort((a,b) => b.data().createdAt - a.data().createdAt);
  
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
};

$("btn-close-notifs").onclick = () => { show("scr-home"); updateBell(); };
