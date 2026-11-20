// Login e dados do app Expedição.
// Modo nuvem: Firebase (Authentication + Firestore com cache offline).
// Modo local: tudo no aparelho, usado para testes (endereço com ?local=1 ou sem configuração).
import { firebaseConfig } from "../firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const LOCAL = !firebaseConfig || new URLSearchParams(location.search).has("local");

const listeners = new Set();
const state = { ready: false, user: null, profile: null, trips: [], online: navigator.onLine, pending: false, error: "" };
const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
export const onChange = fn => { listeners.add(fn); fn(state); return () => listeners.delete(fn); };
export const getState = () => state;
addEventListener("online", () => { state.online = true; emit(); });
addEventListener("offline", () => { state.online = false; emit(); });

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

// Mensagens de erro do login em português
const AUTH_MSG = {
  "auth/invalid-email": "E-mail inválido.",
  "auth/missing-password": "Digite a senha.",
  "auth/weak-password": "A senha precisa ter pelo menos 8 caracteres.",
  "auth/password-does-not-meet-requirements": "A senha precisa ter pelo menos 8 caracteres.",
  "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Use “Entrar” ou “Esqueci minha senha”.",
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/wrong-password": "E-mail ou senha incorretos.",
  "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem internet. Conecte-se para entrar.",
  "auth/popup-closed-by-user": "Login com Google cancelado.",
  "auth/cancelled-popup-request": "Login com Google cancelado.",
  "auth/account-exists-with-different-credential": "Esse e-mail já tem conta. Entre com o método que você usou antes.",
  "auth/unauthorized-domain": "Este endereço não está autorizado no Firebase.",
};
export const authMessage = e => AUTH_MSG[e?.code] || "Não deu certo agora. Tente de novo.";

/* =========================== modo local =========================== */
function localStore() {
  const K = "expedicao-local";
  let db = {}; try { db = JSON.parse(localStorage.getItem(K) || "{}"); } catch (e) {}
  db.users ||= {}; db.trips ||= {}; db.session ||= null;
  const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) {} };
  const refresh = () => {
    const u = db.session && db.users[db.session];
    state.user = u ? { uid: u.uid, email: u.email, displayName: u.name, provider: "password" } : null;
    state.profile = u ? u.profile || null : null;
    state.trips = u ? Object.values(db.trips).filter(t => t.memberIds.includes(u.uid)) : [];
    state.ready = true; emit();
  };
  setTimeout(refresh, 0);
  return {
    mode: "local",
    async signUp(name, email, pass) {
      if (!/^\S+@\S+\.\S+$/.test(email)) throw { code: "auth/invalid-email" };
      if ((pass || "").length < 8) throw { code: "auth/weak-password" };
      if (Object.values(db.users).some(u => u.email === email)) throw { code: "auth/email-already-in-use" };
      const uid = "u" + newId(); db.users[uid] = { uid, email, pass, name, profile: { nome: name } }; db.session = uid; save(); refresh();
    },
    async signIn(email, pass) {
      const u = Object.values(db.users).find(x => x.email === email && x.pass === pass);
      if (!u) throw { code: "auth/invalid-credential" }; db.session = u.uid; save(); refresh();
    },
    async signInGoogle() { return this.signUp("Piloto de teste", `teste${Date.now()}@exemplo.com`, "senha-teste-123").catch(() => {}); },
    async resetPassword() {},
    async signOut() { db.session = null; save(); refresh(); },
    async saveProfile(p) { const u = db.users[db.session]; u.profile = { ...u.profile, ...p }; if (p.nome) u.name = p.nome; save(); refresh(); },
    async createTrip(t) { db.trips[t.id] = t; save(); refresh(); return t.id; },
    async updateTrip(id, patch) { Object.assign(db.trips[id], patch); save(); refresh(); },
    async deleteTrip(id) { delete db.trips[id]; save(); refresh(); },
    async deleteAccount() { const uid = db.session; Object.values(db.trips).forEach(t => { if (t.owner === uid) delete db.trips[t.id]; }); delete db.users[uid]; db.session = null; save(); refresh(); },
  };
}

/* =========================== modo nuvem =========================== */
function cloudStore() {
  let fb, fs, au, auth, db, unsubTrips = null, unsubProfile = null;
  const ready = (async () => {
    const [appMod, fsMod, auMod] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-firestore.js"), import(SDK + "firebase-auth.js")]);
    fs = fsMod; au = auMod;
    fb = appMod.initializeApp(firebaseConfig);
    try { db = fs.initializeFirestore(fb, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
    catch (e) { db = fs.getFirestore(fb); }
    auth = au.getAuth(fb); auth.languageCode = "pt-BR";
    try { await au.setPersistence(auth, au.browserLocalPersistence); } catch (e) {}
    au.getRedirectResult(auth).catch(e => { state.error = authMessage(e); emit(); });
    au.onAuthStateChanged(auth, user => {
      unsubTrips?.(); unsubProfile?.(); unsubTrips = unsubProfile = null;
      state.user = user ? { uid: user.uid, email: user.email, displayName: user.displayName, provider: user.providerData?.[0]?.providerId || "password" } : null;
      state.profile = null; state.trips = [];
      if (!user) { state.ready = true; emit(); return; }
      unsubProfile = fs.onSnapshot(fs.doc(db, "users", user.uid), s => { state.profile = s.exists() ? s.data() : { nome: user.displayName || "" }; emit(); }, () => {});
      const q = fs.query(fs.collection(db, "trips"), fs.where("memberIds", "array-contains", user.uid));
      unsubTrips = fs.onSnapshot(q, { includeMetadataChanges: true }, qs => {
        state.trips = qs.docs.map(d => ({ id: d.id, ...d.data() }));
        state.pending = qs.metadata.hasPendingWrites; state.ready = true; state.error = ""; emit();
      }, e => { state.ready = true; state.error = e.code === "permission-denied" ? "Sem permissão para ler as viagens. Confira as regras do Firestore." : "Não deu para carregar as viagens agora."; emit(); });
    });
  })();
  const w = async fn => { await ready; return fn(); };
  return {
    mode: "cloud",
    signUp: (name, email, pass) => w(async () => {
      const cred = await au.createUserWithEmailAndPassword(auth, email, pass);
      await au.updateProfile(cred.user, { displayName: name });
      await fs.setDoc(fs.doc(db, "users", cred.user.uid), { nome: name, criado: fs.serverTimestamp() }, { merge: true });
      state.user = { ...state.user, displayName: name }; emit();
    }),
    signIn: (email, pass) => w(() => au.signInWithEmailAndPassword(auth, email, pass)),
    signInGoogle: () => w(async () => {
      const prov = new au.GoogleAuthProvider(); prov.setCustomParameters({ prompt: "select_account" });
      const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      if (standalone) return au.signInWithRedirect(auth, prov); // app instalado: a janela do Google não abre como pop-up
      const cred = await au.signInWithPopup(auth, prov);
      const ref = fs.doc(db, "users", cred.user.uid);
      await fs.setDoc(ref, { nome: cred.user.displayName || "" }, { merge: true });
    }),
    resetPassword: email => w(() => au.sendPasswordResetEmail(auth, email)),
    signOut: () => w(() => au.signOut(auth)),
    saveProfile: p => w(async () => {
      await fs.setDoc(fs.doc(db, "users", auth.currentUser.uid), p, { merge: true });
      if (p.nome) await au.updateProfile(auth.currentUser, { displayName: p.nome });
    }),
    createTrip: t => w(async () => { const { id, ...data } = t; fs.setDoc(fs.doc(db, "trips", id), { ...data, criado: fs.serverTimestamp() }); return id; }),
    updateTrip: (id, patch) => w(() => fs.setDoc(fs.doc(db, "trips", id), patch, { merge: true })),
    deleteTrip: id => w(() => fs.deleteDoc(fs.doc(db, "trips", id))),
    deleteAccount: () => w(async () => {
      const uid = auth.currentUser.uid;
      for (const t of state.trips.filter(t => t.owner === uid)) await fs.deleteDoc(fs.doc(db, "trips", t.id));
      await fs.deleteDoc(fs.doc(db, "users", uid));
      await au.deleteUser(auth.currentUser);
    }),
  };
}

export const store = LOCAL ? localStore() : cloudStore();
