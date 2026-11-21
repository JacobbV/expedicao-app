// Login e dados do app Expedição.
// Modo nuvem: Firebase (Authentication + Firestore com cache offline).
// Modo local: tudo no aparelho, usado para testes (endereço com ?local=1 ou sem configuração).
import { firebaseConfig } from "../firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const LOCAL = !firebaseConfig || new URLSearchParams(location.search).has("local");

const listeners = new Set();
const state = { ready: false, user: null, profile: null, trips: [], online: navigator.onLine, pending: false, error: "", td: null };
// Coleções de cada viagem carregadas quando ela está aberta (state.td)
export const SUBS = ["checklist", "expenses", "lodging", "meta", "photos", "riders", "log", "points"];
const emptyTd = id => Object.fromEntries([["id", id], ["ready", false], ...SUBS.map(c => [c, {}])]);
const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
export const onChange = fn => { listeners.add(fn); fn(state); return () => listeners.delete(fn); };
export const getState = () => state;
addEventListener("online", () => { state.online = true; emit(); });
addEventListener("offline", () => { state.online = false; emit(); });

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Dados públicos do convite (quem tem o link vê só isto antes de entrar)
const inviteData = t => ({ trip: t.id, owner: t.owner, ownerNome: (t.members || {})[t.owner]?.nome || "", name: t.name || "", origem: t.origem || "", destino: t.destino || "", inicio: t.inicio || "", fim: t.fim || "" });
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
  db.users ||= {}; db.trips ||= {}; db.invites ||= {}; db.sub ||= {}; db.session ||= null;
  const save = () => { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) {} };
  const refresh = () => {
    const u = db.session && db.users[db.session];
    state.user = u ? { uid: u.uid, email: u.email, displayName: u.name, photoURL: "", provider: "password" } : null;
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
    async createTrip(t) { db.trips[t.id] = t; db.invites[t.invite] = inviteData(t); save(); refresh(); return t.id; },
    async updateTrip(id, patch) { Object.assign(db.trips[id], patch); save(); refresh(); },
    async deleteTrip(id) { const t = db.trips[id]; if (t) delete db.invites[t.invite]; delete db.trips[id]; delete db.sub[id]; save(); refresh(); },
    async ensureInvite(t) { db.invites[t.invite] = inviteData(t); save(); },
    async rotateInvite(t) { const code = newCode(); delete db.invites[t.invite]; db.trips[t.id].invite = code; db.invites[code] = inviteData({ ...t, invite: code }); save(); refresh(); return code; },
    async getInvite(code) { return db.invites[code] || null; },
    async joinTrip(inv, code, mine) {
      const t = db.trips[inv.trip], uid = db.session; if (!t || t.invite !== code) throw { code: "permission-denied" };
      if (!t.memberIds.includes(uid)) t.memberIds.push(uid);
      t.members[uid] = { ...mine, papel: "piloto" }; t.joinCode = code; save(); refresh();
    },
    openTrip(id) {
      if (state.td?.id === id) return;
      const sub = db.sub[id] || {}; state.td = emptyTd(id);
      SUBS.forEach(c => { state.td[c] = JSON.parse(JSON.stringify(sub[c] || {})); }); state.td.ready = true; setTimeout(emit, 0);
    },
    closeTrip() { state.td = null; },
    async put(coll, id, data, merge = true) {
      const t = state.td?.id; if (!t) return; db.sub[t] ||= {}; db.sub[t][coll] ||= {};
      db.sub[t][coll][id] = merge ? { ...(db.sub[t][coll][id] || {}), ...data } : data; save();
      if (state.td[coll]) state.td[coll][id] = JSON.parse(JSON.stringify(db.sub[t][coll][id])); emit();
    },
    async add(coll, data) { const id = newId(); await this.put(coll, id, data, false); return id; },
    async del(coll, id) { const t = state.td?.id; if (!t) return; delete db.sub[t]?.[coll]?.[id]; if (state.td[coll]) delete state.td[coll][id]; save(); emit(); },
    async getOne(coll, id) { const t = state.td?.id; return db.sub[t]?.[coll]?.[id] || null; },
    async updateMyMember(id, patch) { const t = db.trips[id], uid = db.session; t.members[uid] = { ...t.members[uid], ...patch }; save(); refresh(); },
    async removeMember(id, uid) { const t = db.trips[id]; t.memberIds = t.memberIds.filter(x => x !== uid); delete t.members[uid]; save(); refresh(); },
    async leaveTrip(id) { return this.removeMember(id, db.session); },
    async deleteAccount() {
      const uid = db.session;
      Object.values(db.trips).forEach(t => { if (t.owner === uid) { delete db.invites[t.invite]; delete db.trips[t.id]; } else if (t.memberIds.includes(uid)) { t.memberIds = t.memberIds.filter(x => x !== uid); delete t.members[uid]; } });
      delete db.users[uid]; db.session = null; save(); refresh();
    },
  };
}

/* =========================== modo nuvem =========================== */
function cloudStore() {
  let fb, fs, au, auth, db, unsubTrips = null, unsubProfile = null, unsubTd = [];
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
      state.user = user ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL || "", provider: user.providerData?.[0]?.providerId || "password" } : null;
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
    // Grava a viagem e o convite juntos (sem esperar a internet: sincroniza quando voltar)
    createTrip: t => w(async () => {
      const { id, ...data } = t, b = fs.writeBatch(db);
      b.set(fs.doc(db, "trips", id), { ...data, criado: fs.serverTimestamp() });
      b.set(fs.doc(db, "invites", t.invite), inviteData(t));
      b.commit().catch(e => console.error(e)); return id;
    }),
    updateTrip: (id, patch) => w(() => fs.setDoc(fs.doc(db, "trips", id), patch, { merge: true })),
    deleteTrip: id => w(() => {
      const t = state.trips.find(x => x.id === id), b = fs.writeBatch(db);
      b.delete(fs.doc(db, "trips", id)); if (t?.invite) b.delete(fs.doc(db, "invites", t.invite));
      return b.commit();
    }),
    ensureInvite: t => w(() => fs.setDoc(fs.doc(db, "invites", t.invite), inviteData(t))),
    // Abre as coleções da viagem (checklist, gastos, fotos…) e acompanha as mudanças em tempo real
    openTrip(id) {
      if (state.td?.id === id) return;
      this.closeTrip(); state.td = emptyTd(id); let left = SUBS.length;
      ready.then(() => {
        if (state.td?.id !== id) return;
        unsubTd = SUBS.map(c => fs.onSnapshot(fs.collection(db, "trips", id, c), qs => {
          if (state.td?.id !== id) return;
          const m = {}; qs.docs.forEach(d => { m[d.id] = d.data(); }); state.td[c] = m;
          if (!state.td.ready && --left <= 0) state.td.ready = true; emit();
        }, e => { console.error(c, e); if (state.td?.id === id && !state.td.ready && --left <= 0) { state.td.ready = true; emit(); } }));
      });
    },
    closeTrip() { unsubTd.forEach(u => u()); unsubTd = []; state.td = null; },
    put: (coll, id, data, merge = true) => w(() => { const t = state.td?.id; if (!t) return; return fs.setDoc(fs.doc(db, "trips", t, coll, id), data, { merge }); }),
    add: (coll, data) => w(() => { const t = state.td?.id, ref = fs.doc(fs.collection(db, "trips", t, coll)); fs.setDoc(ref, data).catch(e => console.error(e)); return ref.id; }),
    del: (coll, id) => w(() => { const t = state.td?.id; if (!t) return; return fs.deleteDoc(fs.doc(db, "trips", t, coll, id)); }),
    getOne: (coll, id) => w(async () => { const t = state.td?.id, s = await fs.getDoc(fs.doc(db, "trips", t, coll, id)); return s.exists() ? s.data() : null; }),
    rotateInvite: t => w(async () => {
      const code = newCode(), b = fs.writeBatch(db);
      b.update(fs.doc(db, "trips", t.id), { invite: code });
      b.delete(fs.doc(db, "invites", t.invite));
      b.set(fs.doc(db, "invites", code), inviteData({ ...t, invite: code }));
      await b.commit(); return code;
    }),
    getInvite: code => w(async () => { const s = await fs.getDoc(fs.doc(db, "invites", code)); return s.exists() ? s.data() : null; }),
    // Entrar: acrescenta o próprio uid e os próprios dados; as regras conferem o código
    joinTrip: (inv, code, mine) => w(() => {
      const uid = auth.currentUser.uid;
      return fs.updateDoc(fs.doc(db, "trips", inv.trip), { memberIds: fs.arrayUnion(uid), [`members.${uid}`]: { ...mine, papel: "piloto" }, joinCode: code });
    }),
    updateMyMember: (id, patch) => w(() => {
      const uid = auth.currentUser.uid, upd = {};
      Object.entries(patch).forEach(([k, v]) => { upd[`members.${uid}.${k}`] = v ?? null; });
      return fs.updateDoc(fs.doc(db, "trips", id), upd);
    }),
    removeMember: (id, uid) => w(() => fs.updateDoc(fs.doc(db, "trips", id), { memberIds: fs.arrayRemove(uid), [`members.${uid}`]: fs.deleteField() })),
    leaveTrip: id => w(() => { const uid = auth.currentUser.uid; return fs.updateDoc(fs.doc(db, "trips", id), { memberIds: fs.arrayRemove(uid), [`members.${uid}`]: fs.deleteField() }); }),
    deleteAccount: () => w(async () => {
      const uid = auth.currentUser.uid;
      for (const t of state.trips) {
        if (t.owner === uid) { const b = fs.writeBatch(db); b.delete(fs.doc(db, "trips", t.id)); if (t.invite) b.delete(fs.doc(db, "invites", t.invite)); await b.commit(); }
        else await fs.updateDoc(fs.doc(db, "trips", t.id), { memberIds: fs.arrayRemove(uid), [`members.${uid}`]: fs.deleteField() });
      }
      await fs.deleteDoc(fs.doc(db, "users", uid));
      await au.deleteUser(auth.currentUser);
    }),
  };
}

export const store = LOCAL ? localStore() : cloudStore();
