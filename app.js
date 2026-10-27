import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ВСТАВЬ СВОЙ КОНФИГ:
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
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

function toast(msg, ms = 4000) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), ms);
}
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id)?.classList.add("active");
}

// Перевод имени в email (Мама -> mama@family.local)
function translit(str) {
  const ru = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  return str.toLowerCase().split('').map(c => ru[c] || c).join('').replace(/[^a-z0-9]/g, '');
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    me = { id: user.uid, name: user.displayName || "Пользователь" };
    await loadFamily();
    if (!familyId) show("scr-family-choice");
    else {
      show("scr-home");
      renderFamilyTab();
      renderTables();
    }
  } else {
    me = null; familyId = null; familyData = null;
    show("scr-login");
  }
});

// Навигация
$("to-register").onclick = () => show("scr-register");
$("to-login").onclick = () => show("scr-login");

// ВХОД
$("btn-login").onclick = async () => {
  const name = $("login-name").value.trim();
  const pass = $("login-pass").value;
  if (!name || !pass) return toast("Заполните поля");
  
  try {
    await signInWithEmailAndPassword(auth, `${translit(name)}@family.local`, pass);
  } catch (e) {
    console.error("Ошибка входа:", e);
    toast(`Ошибка входа: ${e.code}`);
  }
};

// РЕГИСТРАЦИЯ
$("btn-register").onclick = async () => {
  const name = $("reg-name").value.trim();
  const pass = $("reg-pass").value;
  if (!name || !pass) return toast("Заполните поля");
  if (pass.length < 6) return toast("Пароль минимум 6 символов");

  const btn = $("btn-register");
  btn.disabled = true;
  btn.textContent = "Создание...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, `${translit(name)}@family.local`, pass);
    await updateProfile(cred.user, { displayName: name });
    // Firebase сам перекинет на экран выбора семьи, так как сработает onAuthStateChanged
  } catch (e) {
    console.error("Ошибка регистрации:", e);
    let msg = e.message;
    if (e.code === 'auth/email-already-in-use') msg = "Это имя уже занято";
    if (e.code === 'auth/weak-password') msg = "Пароль слишком простой";
    if (e.code === 'auth/network-request-failed') msg = "Нет связи с Firebase. Проверьте интернет или VPN.";
    toast(`Ошибка: ${msg}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Создать аккаунт";
  }
};

const logout = async () => { await signOut(auth); show("scr-login"); };
$("btn-logout").onclick = logout;
$("btn-logout2").onclick = logout;

async function loadFamily() {
  try {
    const q = query(collection(db, "families"), where("members", "array-contains", me.id));
    const snap = await getDocs(q);
    if (snap.empty) { familyId = null; familyData = null; return; }
    const docSnap = snap.docs[0];
    familyId = docSnap.id;
    familyData = docSnap.data();
  } catch (e) { console.error("Ошибка загрузки семьи:", e); }
}

$("btn-create-family").onclick = async () => {
  const newId = uid();
  try {
    await setDoc(doc(db, "families", newId), {
      name: "Моя семья",
      ownerId: me.id,
      members: [me.id],
      memberNames: { [me.id]: me.name }
    });
    await loadFamily();
    show("scr-home");
    renderFamilyTab();
    renderTables();
  } catch(e) { toast("Ошибка создания семьи: " + e.message); }
};

$("btn-join-family").onclick = async () => {
  const code = $("join-family-id").value.trim();
  if (!code) return toast("Введите код");
  try {
    const famRef = doc(db, "families", code);
    const famSnap = await getDoc(famRef);
    if (!famSnap.exists()) return toast("Семья не найдена");
    
    await updateDoc(famRef, {
      members: arrayUnion(me.id),
      [`memberNames.${me.id}`]: me.name
    });
    await loadFamily();
    show("scr-home");
    renderFamilyTab();
    renderTables();
  } catch (e) { toast("Ошибка вступления: " + e.message); }
};

function renderFamilyTab() {
  if (!familyData) return;
  $("fam-name-label").textContent = familyData.name || "Семья";
  $("fam-id-label").textContent = familyId;
  
  const box = $("members-container"); box.innerHTML = "";
  (familyData.members || []).forEach(id => {
    const name = familyData.memberNames?.[id] || "Участник";
    const el = document.createElement("div");
    el.className = "member";
    el.innerHTML = `<div class="info"><b>${esc(name)}</b></div><div class="acts"><span class="role">${id === familyData.ownerId ? 'Владелец' : 'Участник'}</span></div>`;
    box.appendChild(el);
  });
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === b.dataset.tab));
  document.querySelectorAll(".tabpane").forEach(p => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab));
});

async function renderTables() {
  const box = $("tables-container"); box.innerHTML = "";
  if (!familyId) return;
  const q = query(collection(db, "tables"), where("familyId", "==", familyId));
  const snap = await getDocs(q);
  
  if (snap.empty) { box.innerHTML = '<div class="empty">Таблиц нет.</div>'; return; }
  
  snap.forEach(d => {
    const t = d.data();
    const el = document.createElement("div");
    el.className = "purchase-card";
    el.innerHTML = `<div class="pc-head"><b>${esc(t.name)}</b></div><div class="row-gap"><button class="btn primary" data-open="${d.id}">Открыть</button></div>`;
    box.appendChild(el);
  });
  box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => toast("Редактор таблиц в следующем шаге"));
}

$("btn-new-table").onclick = async () => {
  if (!familyId) return toast("Сначала создайте семью");
  const name = prompt("Название таблицы:");
  if (!name) return;
  
  const newRef = doc(collection(db, "tables"));
  await setDoc(newRef, {
    familyId,
    name,
    columns: [{ id: uid(), name: 'Название', type: 'text' }],
    rows: [{}],
    createdAt: Date.now()
  });
  renderTables();
};
