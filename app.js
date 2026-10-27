import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, query, where, 
  updateDoc, deleteDoc, arrayUnion, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ВСТАВЬ СЮДА СВОЙ firebaseConfig:
const firebaseConfig = {
  apiKey: "ТВОЙ_API_KEY",
  authDomain: "household-space.firebaseapp.com",
  projectId: "household-space",
  storageBucket: "household-space.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let me = null, family = null, familyId = null;
let currentTableId = null, cellContext = null, columnDraft = [];

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

function toast(msg, ms = 2600) {
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

// Следим за состоянием входа
onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = { id: user.uid, name: user.displayName || user.email.split('@')[0] };
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
  const email = `${name.toLowerCase().replace(/[^a-zа-я0-9]/gi, '')}@family.local`;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    toast("Неверное имя или пароль");
  }
};

$("btn-logout").onclick = async () => { 
  await signOut(auth); 
  show("scr-login");
};

async function loadFamily() {
  try {
    const q = query(collection(db, "families"), where("members", "array-contains", me.id));
    const snap = await getDocs(q);
    if (snap.empty) { family = null; familyId = null; return; }
    const docSnap = snap.docs[0];
    familyId = docSnap.id;
    family = { id: familyId, ...docSnap.data() };
  } catch (e) { console.error("Ошибка загрузки семьи:", e); }
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
  if (!id) return toast("Введите ID");
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

function enterHome() {
  show("scr-home");
  renderFamilyTab();
  switchTab("tables");
  renderTables();
  updateBell();
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
function switchTab(n) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === n));
  document.querySelectorAll(".tabpane").forEach(p => p.classList.toggle("active", p.id === "tab-" + n));
}

const isOwner = () => !!family && family.ownerId === me?.id;

function renderFamilyTab() {
  if (!family) return;
  $("fam-name-label").textContent = family.name || "Семья";
  $("fam-id-label").textContent = familyId;
  $("admin-zone").style.display = isOwner() ? "block" : "none";
  
  const box = $("members-container"); box.innerHTML = "";
  (family.members || []).forEach(id => {
    const name = family.memberNames?.[id] || "Участник";
    const el = document.createElement("div");
    el.className = "member";
    el.innerHTML = `<div class="info"><b>${esc(name)}</b></div><div class="acts"><span class="role">${id === family.ownerId ? 'Владелец' : 'Участник'}</span></div>`;
    box.appendChild(el);
  });
}

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
      el.innerHTML = `<div class="pc-head"><b>${esc(t.name)}</b></div><div class="row-gap"><button class="btn primary" data-open="${d.id}">Открыть</button><button class="btn danger" data-delete="${d.id}">Удалить</button></div>`;
      box.appendChild(el);
    });
    
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openTable(b.dataset.open));
    box.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
      if(confirm('Удалить таблицу?')) {
        await deleteDoc(doc(db, "tables", b.dataset.delete));
        renderTables();
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

$("btn-save-table").onclick = async () => {
  toast('Все изменения сохранены!');
  renderTables();
};

function editCell(tableId, rowIndex, colId) {
  getDoc(doc(db, "tables", tableId)).then(snap => {
    if (!snap.exists()) return;
    const t = snap.data();
    const c = t.columns.find(x => x.id === colId);
    if (!c) return;
    
    cellContext = { tableId, rowIndex, colId };
    $("cell-modal-title").textContent = c.name;
    const host = $("cell-editor"); host.innerHTML = "";
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = t.rows[rowIndex][colId] || '';
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
  t.rows[rowIndex][colId] = $("cell-value").value;
  
  await updateDoc(doc(db, "tables", tableId), { rows: t.rows });
  $("modal-cell").classList.add('hidden');
  renderGrid({ id: tableId, ...t });
  toast('Сохранено');
};

async function updateBell() {
  if(!familyId) return;
  const q = query(collection(db, "notifications"), where("familyId", "==", familyId));
  const snap = await getDocs(q);
  const count = snap.docs.filter(d => d.data().authorId !== me.id).length;
  $("bell-badge").textContent = count;
  $("bell-badge").classList.toggle("hidden", count === 0);
}

$("bell-btn").onclick = () => {
  if(!familyId) return;
  updateBell();
  toast("Уведомления обновлены");
};
