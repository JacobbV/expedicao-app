// Expedição · telas: entrada, Minhas viagens, viagem, perfil, ajustes, sobre e a navegação (menu lateral, abas e menu da conta)
import { store, onChange, getState, newId, newCode, authMessage } from "./store.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseISO = s => { const [y, m, d] = (s || "").split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const fmtD = s => s ? `${pad(parseISO(s).getDate())}/${pad(parseISO(s).getMonth() + 1)}` : "—";
const fmtDW = s => s ? `${WD[parseISO(s).getDay()]} ${fmtD(s)}` : "—";
const num = (v, d = 0) => v == null || v === "" || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const parseNum = v => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };
const TRIP_COLORS = ["#c8102e", "#0b6b3a", "#1d4ed8", "#e8590c", "#7c3aed", "#e85b9c"];
const TIPOS = [["solo", "Solo"], ["casal", "Casal"], ["amigos", "Amigos"], ["grupo", "Grupo"]];
const tipoLabel = k => (TIPOS.find(t => t[0] === k) || [, ""])[1];
const ESTILOS = [["placa", "Placa", "BR 116"], ["asfalto", "Asfalto", "— — —"], ["trilha", "Trilha", "Trilha"]];

function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), Math.max(2400, msg.length * 60));
}
function openSheet(html, init) {
  const L = $("#layer");
  L.innerHTML = `<div class="backdrop" data-close="1"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const sh = L.querySelector(".sheet");
  L.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSheet));
  init?.(sh);
  sh.querySelector("input, select, textarea")?.focus({ preventScroll: true });
}
const closeSheet = () => { $("#layer").innerHTML = ""; };

/* ---------- aparência: estilo, tema claro/escuro e menu recolhido ---------- */
const ls = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
const getEstilo = () => ls.get("estilo", "placa");
const getTema = () => ls.get("tema", "auto");
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applyLook() {
  const d = document.documentElement, e = getEstilo(), t = getTema();
  d.dataset.estilo = e;
  d.dataset.tema = e === "asfalto" || t === "escuro" || (t === "auto" && darkMQ.matches) ? "escuro" : "claro";
  const tc = e === "asfalto" ? "#0d1011" : e === "trilha" ? (d.dataset.tema === "escuro" ? "#120d09" : "#3b2a1c") : "#0b6b3a";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tc);
}
function setEstilo(s) { ls.set("estilo", s); applyLook(); }
function setTema(t) { ls.set("tema", t); applyLook(); }
darkMQ.addEventListener?.("change", () => { if (getTema() === "auto") applyLook(); });
function toggleMenu() { const mini = document.documentElement.dataset.menu !== "mini"; if (mini) document.documentElement.dataset.menu = "mini"; else delete document.documentElement.dataset.menu; ls.set("menu", mini ? "mini" : "aberto"); renderSide(); }

/* ---------- ícones (desenhados para o app) ---------- */
const IC = {
  viagens: '<path d="M9 4l-5 2v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>',
  inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  pincel: '<path d="M4 20c3 0 5-2 5-4.5S7.5 12 6 13.5 4 17 4 20z"/><path d="M9 14l11-11"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  sair: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
  recolher: '<path d="M15 6l-6 6 6 6"/>',
  expandir: '<path d="M9 6l6 6-6 6"/>',
  pilotos: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ""}</svg>`;
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="29" rx="7" style="fill:var(--logo-bg);stroke:var(--logo-fg)" stroke-width="2.4"/><path d="M16 25V9M9.5 15.5L16 9l6.5 6.5" style="stroke:var(--logo-fg)" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ESTILO_NOME = { placa: "Placa", asfalto: "Asfalto", trilha: "Trilha" };

/* ---------- rotas ---------- */
let route = "viagens", param = "", sub = "";
function parseHash() { const h = location.hash.slice(1) || "viagens"; [route, param = "", sub = ""] = h.split("/"); }
addEventListener("hashchange", () => { parseHash(); closeSheet(); render(); scrollTo(0, 0); });

/* ---------- utilidades de viagem ---------- */
const S = () => getState();
const me = () => S().user?.uid;
const myName = () => S().profile?.nome || S().user?.displayName || (S().user?.email || "").split("@")[0];
const tripById = id => S().trips.find(t => t.id === id);
const tripColor = t => TRIP_COLORS[Math.abs([...(t.id || "")].reduce((a, c) => a + c.charCodeAt(0), 0)) % TRIP_COLORS.length];
const tripDays = t => t.inicio && t.fim ? diffDays(t.inicio, t.fim) + 1 : null;
function tripPhase(t) {
  const h = todayISO();
  if (!t.inicio) return { k: "sem", txt: "Sem data" };
  if (h < t.inicio) { const n = diffDays(h, t.inicio); return { k: "antes", n, txt: n === 1 ? "Falta 1 dia" : `Faltam ${n} dias` }; }
  if (!t.fim || h <= t.fim) return { k: "durante", n: diffDays(t.inicio, h) + 1, txt: `Dia ${diffDays(t.inicio, h) + 1}${tripDays(t) ? ` de ${tripDays(t)}` : ""}` };
  return { k: "depois", txt: "Concluída" };
}
const sortTrips = list => [...list].sort((a, b) => {
  const pa = tripPhase(a).k, pb = tripPhase(b).k, rank = { durante: 0, antes: 1, sem: 2, depois: 3 };
  if (rank[pa] !== rank[pb]) return rank[pa] - rank[pb];
  return pa === "depois" ? (b.inicio || "").localeCompare(a.inicio || "") : (a.inicio || "").localeCompare(b.inicio || "");
});

/* =========================== ENTRADA =========================== */
let loginTab = "entrar";
function viewLogin() {
  const st = S();
  return `<div class="login"><div class="lhero">
    <div class="sign">
      <div class="srow"><span><span class="arr">↑</span>Roteiro por dias</span></div>
      <div class="srow"><span><span class="arr">↗</span>Abastecimento</span></div>
      <div class="srow"><span><span class="arr">↑</span>Tempo no caminho</span></div>
    </div>
    <div><h2>Expedição</h2><p class="lead muted" style="margin:6px 0 0">O companheiro de viagem para expedições de moto: planeje por dias, saiba onde abastecer e leve o roadbook na palma da mão.</p></div>
    ${route === "convite" || ls.get("convitePendente", "") ? `<p class="note" style="margin:0"><b>Você recebeu um convite para uma viagem.</b> Entre ou crie sua conta e ele abre em seguida.</p>` : ""}
    </div><div class="lform">
    <div class="seg" role="tablist">${[["entrar", "Entrar"], ["criar", "Criar conta"]].map(([k, l]) => `<button type="button" data-act="ltab" data-v="${k}" aria-pressed="${loginTab === k}">${l}</button>`).join("")}</div>
    <form id="fLogin" novalidate>
      ${loginTab === "criar" ? `<label class="field"><span>Seu nome</span><input id="lNome" autocomplete="name" required placeholder="Como os parceiros te chamam"></label>` : ""}
      <label class="field"><span>E-mail</span><input id="lEmail" type="email" autocomplete="email" inputmode="email" required></label>
      <label class="field"><span>Senha</span><input id="lPass" type="password" autocomplete="${loginTab === "criar" ? "new-password" : "current-password"}" required minlength="8">${loginTab === "criar" ? "<small>Pelo menos 8 caracteres.</small>" : ""}</label>
      <p class="err" id="lErr" ${st.error ? "" : "hidden"}>${esc(st.error)}</p>
      <button class="btn primary block" id="lGo">${loginTab === "criar" ? "Criar conta" : "Entrar"}</button>
      ${loginTab === "entrar" ? `<button type="button" class="btn sm" data-act="forgot" style="justify-self:center;border:0;background:none;color:var(--brand)">Esqueci minha senha</button>` : ""}
    </form>
    <div class="or">ou</div>
    <button type="button" class="btn google block" data-act="google"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Continuar com Google</button>
    <p class="muted small center" style="margin:0">Ao continuar, você concorda em usar o app para planejar suas viagens. Seus dados ficam visíveis só para quem viaja com você.</p>
    <p class="center" style="margin:0">${qyuMark()}</p>
  </div></div>`;
}
function bindLogin() {
  const f = $("#fLogin"); if (!f) return;
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const er = $("#lErr"), go = $("#lGo"), email = $("#lEmail").value.trim(), pass = $("#lPass").value;
    er.hidden = true; go.disabled = true;
    try {
      if (loginTab === "criar") {
        const nome = $("#lNome").value.trim();
        if (!nome) throw { msg: "Digite seu nome." };
        await store.signUp(nome, email, pass); loginTab = "entrar";
      } else await store.signIn(email, pass);
    } catch (x) { er.textContent = x.msg || authMessage(x); er.hidden = false; go.disabled = false; }
  });
}
function forgotSheet() {
  openSheet(`<h3>Recuperar senha</h3><p class="muted" style="margin:0">Mandamos um link para o seu e-mail para criar uma senha nova.</p>
    <form id="fForgot"><label class="field"><span>E-mail</span><input id="fgEmail" type="email" inputmode="email" value="${esc($("#lEmail")?.value || "")}" required></label>
    <p class="err" id="fgErr" hidden></p><p class="ok" id="fgOk" hidden></p>
    <div class="actions"><button type="button" class="btn" data-close="1">Fechar</button><button class="btn primary">Enviar link</button></div></form>`, sh => {
    sh.querySelector("#fForgot").addEventListener("submit", async e => {
      e.preventDefault(); const er = sh.querySelector("#fgErr"), ok = sh.querySelector("#fgOk"); er.hidden = ok.hidden = true;
      try { await store.resetPassword(sh.querySelector("#fgEmail").value.trim()); ok.textContent = "Se esse e-mail tiver conta, o link chega em instantes. Confira também o spam."; ok.hidden = false; }
      catch (x) { er.textContent = authMessage(x); er.hidden = false; }
    });
  });
}

/* =========================== MINHAS VIAGENS =========================== */
function viewViagens() {
  const st = S(), list = sortTrips(st.trips), next = list.find(t => ["durante", "antes"].includes(tripPhase(t).k));
  const first = myName().split(" ")[0];
  const signTop = next ? (() => { const ph = tripPhase(next);
    return `<a class="sign" href="#viagem/${next.id}" style="text-decoration:none;display:block">
      <div class="label" style="color:inherit;opacity:.8">${ph.k === "durante" ? "Na estrada" : "Próxima expedição"}</div>
      <div class="big">${ph.k === "durante" ? `${esc(ph.txt)}` : `Faltam <b>${num(ph.n)}</b> ${ph.n === 1 ? "dia" : "dias"}`}</div>
      <div class="srow"><span><span class="arr">↑</span>${esc(next.destino || next.name)}</span><span class="km">${fmtD(next.inicio)}</span></div>
    </a>`; })()
    : `<div class="sign"><div class="label" style="color:inherit;opacity:.8">Olá, ${esc(first)}</div><div class="big">Pra onde <b>vamos</b>?</div></div>`;
  return `<div class="view">
    ${signTop}
    ${st.error ? `<p class="note" style="border-color:var(--bad)">${esc(st.error)}</p>` : ""}
    <div class="between"><h2>Minhas viagens</h2>${list.length ? `<span class="tag-y">${list.length} ${list.length === 1 ? "viagem" : "viagens"}</span>` : ""}</div>
    ${list.length ? `<div class="trips">${list.map(tripCard).join("")}</div>`
      : `<div class="card empty"><svg viewBox="0 0 64 64"><path d="M8 52l14-36 10 20 6-10 18 26z"/><circle cx="46" cy="16" r="5"/></svg><h3>Nenhuma viagem ainda</h3><p class="muted" style="margin:0">Crie sua primeira expedição: dê um nome, diga de onde sai e pra onde vai. O roteiro você monta depois, com calma.</p></div>`}
    <a class="btn primary block" href="#nova">+ Nova viagem</a>
  </div>`;
}
function tripCard(t) {
  const ph = tripPhase(t), d = tripDays(t), n = (t.memberIds || []).length;
  const date = t.inicio ? parseISO(t.inicio) : null;
  return `<a class="trip" href="#viagem/${t.id}" style="--c:${tripColor(t)}">
    <div class="th"><span class="k">${esc(tipoLabel(t.tipo) || "Viagem")}${d ? ` · ${d} ${d === 1 ? "dia" : "dias"}` : ""}</span><span>${date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}` : "—"}</span></div>
    <div class="tb"><div class="tt">${esc(t.name)}</div>
      <div class="tm">${[t.origem && t.destino ? `${esc(t.origem)} → ${esc(t.destino)}` : "", `${n} ${n === 1 ? "piloto" : "pilotos"}`, esc(ph.txt)].filter(Boolean).join(" · ")}</div></div>
  </a>`;
}

/* =========================== NOVA / EDITAR VIAGEM =========================== */
function viewNova(edit) {
  const p = S().profile || {}, t = edit || {};
  const mine = edit ? (t.members || {})[me()] || {} : { moto: p.moto, consumo: p.consumo, tanque: p.tanque };
  const tipo = t.tipo || "amigos";
  return `<div class="view narrow">
    <a href="${edit ? `#viagem/${t.id}` : "#viagens"}" class="small" style="text-decoration:none">← ${edit ? "Voltar à viagem" : "Minhas viagens"}</a>
    <h2>${edit ? "Editar viagem" : "Nova viagem"}</h2>
    <form id="fTrip" class="card">
      <label class="field"><span>Nome da expedição</span><input id="tNome" required maxlength="40" value="${esc(t.name || "")}" placeholder="Ex.: Atacama pelos Andes"><small>Aparece no topo do app enquanto você estiver nessa viagem.</small></label>
      <div class="field"><span>Quem vai</span><div class="seg" id="tTipo">${TIPOS.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${tipo === k}">${l}</button>`).join("")}</div></div>
      <div class="grid2">
        <label class="field"><span>Saída de</span><input id="tOrig" required value="${esc(t.origem || "")}" placeholder="Cidade"></label>
        <label class="field"><span>Destino</span><input id="tDest" required value="${esc(t.destino || "")}" placeholder="Cidade ou região"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Ida</span><input id="tIni" type="date" value="${esc(t.inicio || "")}"></label>
        <label class="field"><span>Volta</span><input id="tFim" type="date" value="${esc(t.fim || "")}"></label>
      </div>
      <div class="label" style="margin-top:4px">Sua moto nessa viagem</div>
      <label class="field"><span>Modelo</span><input id="tMoto" value="${esc(mine.moto || "")}" placeholder="Ex.: BMW G 650 GS"></label>
      <div class="grid2">
        <label class="field"><span>Consumo (km/L)</span><input id="tCons" inputmode="decimal" value="${mine.consumo ?? ""}" placeholder="Ex.: 25"></label>
        <label class="field"><span>Tanque (L)</span><input id="tTanq" inputmode="decimal" value="${mine.tanque ?? ""}" placeholder="Ex.: 14"></label>
      </div>
      <small class="muted">Com consumo e tanque o app calcula a autonomia e onde abastecer. Dá para preencher depois.</small>
      <p class="err" id="tErr" hidden></p>
      <button class="btn primary block">${edit ? "Salvar" : "Criar viagem"}</button>
    </form>
  </div>`;
}
function bindNova(edit) {
  const f = $("#fTrip"); if (!f) return;
  let tipo = edit?.tipo || "amigos";
  f.querySelectorAll("#tTipo button").forEach(b => b.addEventListener("click", () => { tipo = b.dataset.v; f.querySelectorAll("#tTipo button").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const er = $("#tErr"); er.hidden = true;
    const name = $("#tNome").value.trim(), origem = $("#tOrig").value.trim(), destino = $("#tDest").value.trim(), inicio = $("#tIni").value, fim = $("#tFim").value;
    if (!name || !origem || !destino) { er.textContent = "Preencha o nome, a saída e o destino."; er.hidden = false; return; }
    if (inicio && fim && fim < inicio) { er.textContent = "A volta não pode ser antes da ida."; er.hidden = false; return; }
    const moto = { moto: $("#tMoto").value.trim(), consumo: parseNum($("#tCons").value), tanque: parseNum($("#tTanq").value) };
    try {
      if (edit) {
        const patch = { name, tipo, origem, destino, inicio, fim };
        if (edit.owner === me()) patch.members = { ...edit.members, [me()]: { ...(edit.members || {})[me()], ...moto } };
        await store.updateTrip(edit.id, patch); toast("Viagem salva"); location.hash = `#viagem/${edit.id}`;
      } else {
        const id = newId();
        const trip = { id, name, tipo, origem, destino, inicio, fim, owner: me(), memberIds: [me()],
          members: { [me()]: { nome: myName(), papel: "dono", foto: S().profile?.fotoMini || S().user?.photoURL || "", ...moto } }, invite: newCode(), days: [], moeda: "BRL", avgSpeed: 65, schema: 2 };
        await store.createTrip(trip);
        if (moto.moto && !S().profile?.moto) store.saveProfile(moto).catch(() => {});
        toast("Viagem criada"); location.hash = `#viagem/${id}`;
      }
    } catch (x) { er.textContent = "Não deu para salvar agora. Confira a internet e tente de novo."; er.hidden = false; }
  });
}

/* =========================== VIAGEM =========================== */
function motoLine(m) {
  return [m.moto || "moto não informada", m.consumo ? `${num(m.consumo, 1)} km/L` : "", m.tanque ? `${num(m.tanque, 1)} L` : "", m.consumo && m.tanque ? `~${num(m.consumo * m.tanque)} km por tanque` : ""].filter(Boolean).join(" · ");
}
const faceOf = (m, name) => m?.foto ? `<img src="${esc(m.foto)}" alt="">` : esc(initials(name));
function viewViagem(t) {
  if (!t) return `<div class="view"><div class="card empty"><h3>Viagem não encontrada</h3><p class="muted" style="margin:0">Ela pode ter sido apagada, você saiu dela, ou ainda não participa. Se recebeu um convite, abra o link de novo.</p><a class="btn" href="#viagens">Minhas viagens</a></div></div>`;
  const ph = tripPhase(t), d = tripDays(t), dono = t.owner === me();
  const members = Object.entries(t.members || {}).filter(([uid]) => (t.memberIds || []).includes(uid))
    .sort((a, b) => (a[1].papel === "dono" ? -1 : b[1].papel === "dono" ? 1 : (a[1].nome || "").localeCompare(b[1].nome || "")));
  return `<div class="view">
    <a href="#viagens" class="small" style="text-decoration:none">← Minhas viagens</a>
    <div class="sign">
      <div class="label" style="color:inherit;opacity:.8">${esc(tipoLabel(t.tipo))}${d ? ` · ${d} ${d === 1 ? "dia" : "dias"}` : ""}</div>
      <div class="big">${ph.k === "antes" ? `Faltam <b>${num(ph.n)}</b> ${ph.n === 1 ? "dia" : "dias"}` : esc(ph.txt)}</div>
      <div class="srow"><span><span class="arr">↑</span>${esc(t.destino)}</span><span class="km">${fmtD(t.inicio)}</span></div>
      <div class="srow"><span><span class="arr">↓</span>${esc(t.origem)}</span><span class="km">${fmtD(t.fim)}</span></div>
    </div>
    <div class="cols"><div class="col">
    <div class="card">
      <div class="between"><h3>${esc(t.name)}</h3>${dono ? `<a class="btn sm" href="#editar/${t.id}">Editar</a>` : ""}</div>
      <dl class="kv"><dt>Saída</dt><dd>${esc(t.origem)}${t.inicio ? ` · ${fmtDW(t.inicio)}` : ""}</dd><dt>Destino</dt><dd>${esc(t.destino)}</dd><dt>Volta</dt><dd>${t.fim ? fmtDW(t.fim) : "—"}</dd></dl>
    </div>
    <div class="card">
      <div class="between"><h3>Pilotos</h3><span class="tag-y">${members.length}</span></div>
      <div class="riders">${members.map(([uid, m]) => `<div class="rider">
        <span class="avatar sm">${faceOf(m, m.nome)}</span>
        <div class="rb"><b>${esc(m.nome || "Piloto")}</b>${uid === me() ? ` <span class="muted small">(você)</span>` : ""}<div class="muted small">${esc(motoLine(m))}</div></div>
        ${m.papel === "dono" ? `<span class="shield">DONO</span>` : ""}
        ${uid === me() ? `<button class="btn sm" data-act="myMoto" data-id="${t.id}">Minha moto</button>` : dono ? `<button class="btn sm danger" data-act="kick" data-id="${t.id}" data-uid="${uid}">Remover</button>` : ""}
      </div>`).join("")}</div>
      <button class="btn primary block" data-act="invite" data-id="${t.id}">+ Convidar pilotos</button>
      ${members.length < 2 ? `<p class="muted small" style="margin:0">Mande o link para quem vai junto. Cada um entra com a própria conta e informa a moto, e a viagem passa a aparecer para todos.</p>` : ""}
    </div>
    </div><div class="col">
    <div class="card">
      <h3>Em breve nesta viagem</h3>
      <p class="muted" style="margin:0">Roteiro por dias, mapa, tempo no caminho, abastecimento pela autonomia de cada moto, gastos divididos, checklist, diário de bordo, segurança e roadbook para imprimir.</p>
    </div>
    ${dono ? `<button class="btn danger" data-act="delTrip" data-id="${t.id}">Apagar viagem</button>` : `<button class="btn danger" data-act="leave" data-id="${t.id}">Sair desta viagem</button>`}
    </div></div>
  </div>`;
}

/* ---------- convite ---------- */
const inviteLink = code => `${location.origin}${location.pathname}#convite/${code}`;
// Folha de envio de link: WhatsApp, copiar e compartilhar (usada no convite e no "Compartilhar o app")
function linkSheet({ title, intro, link, msg, extra = "", init }) {
  openSheet(`<h3>${title}</h3>
    <p class="muted" style="margin:0">${intro}</p>
    <div class="linkbox"><code>${esc(link)}</code></div>
    <div class="grid2">
      <a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
      <button class="btn" id="lkCopy">Copiar link</button>
    </div>
    ${navigator.share ? `<button class="btn block" id="lkShare">Compartilhar de outro jeito</button>` : ""}
    ${extra}
    <div class="actions"><button class="btn" data-close="1">Fechar</button></div>`, sh => {
    sh.querySelector("#lkCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); toast("Link copiado"); } catch (e) { toast("Não deu para copiar. Segure o link para copiar."); } });
    sh.querySelector("#lkShare")?.addEventListener("click", () => navigator.share({ title: "Expedição", text: msg.replace(link, "").trim(), url: link }).catch(() => {}));
    init?.(sh);
  });
}
function inviteSheet(t) {
  const dono = t.owner === me();
  if (dono) store.ensureInvite(t).catch(() => {});
  const link = inviteLink(t.invite);
  linkSheet({
    title: "Convidar pilotos",
    intro: "Quem abrir o link entra na viagem com a própria conta. Mande só para quem vai junto.",
    link, msg: `Bora pra “${t.name}”? Entra na viagem pelo Expedição: ${link}`,
    extra: dono ? `<div class="note">Mandou para a pessoa errada? <button class="btn sm" id="ivNew" style="margin-left:6px">Trocar o link</button><br><span class="small muted">O link antigo para de funcionar. Quem já entrou continua na viagem.</span></div>` : "",
    init: sh => sh.querySelector("#ivNew")?.addEventListener("click", async () => {
      try { const code = await store.rotateInvite(t); toast("Link novo criado"); inviteSheet({ ...t, invite: code }); }
      catch (e) { toast("Não deu para trocar agora. Confira a internet."); }
    }),
  });
}
const inviteCache = {};
function viewConvite(code) {
  const c = inviteCache[code];
  if (!c || c.loading) {
    if (!c) { inviteCache[code] = { loading: true };
      store.getInvite(code).then(inv => { inviteCache[code] = { inv }; }).catch(e => { inviteCache[code] = { err: e?.code || "erro" }; }).finally(() => { if (route === "convite") render(); }); }
    return `<div class="view narrow"><p class="muted center pad">Abrindo o convite…</p></div>`;
  }
  const inv = c.inv;
  if (!inv) return `<div class="view narrow"><div class="card empty"><h3>Convite não encontrado</h3><p class="muted" style="margin:0">${c.err === "unavailable" ? "Sem internet agora. Conecte-se e abra o link de novo." : "O link pode ter sido trocado pelo dono da viagem. Peça um link novo para quem te convidou."}</p><a class="btn" href="#viagens">Minhas viagens</a></div></div>`;
  if (tripById(inv.trip)) return `<div class="view narrow"><div class="card empty"><h3>Você já está nessa viagem</h3><a class="btn primary" href="#viagem/${inv.trip}">Abrir “${esc(inv.name)}”</a></div></div>`;
  const p = S().profile || {}, d = inv.inicio && inv.fim ? diffDays(inv.inicio, inv.fim) + 1 : null;
  return `<div class="view narrow">
    <div class="sign">
      <div class="label" style="color:inherit;opacity:.8">${esc((inv.ownerNome || "Um piloto").split(" ")[0])} te convidou</div>
      <div class="big">${esc(inv.name)}</div>
      <div class="srow"><span><span class="arr">↑</span>${esc(inv.destino)}</span><span class="km">${fmtD(inv.inicio)}</span></div>
      <div class="srow"><span><span class="arr">↓</span>${esc(inv.origem)}</span><span class="km">${fmtD(inv.fim)}</span></div>
    </div>
    <form id="fJoin" class="card">
      <p style="margin:0">Saída de <b>${esc(inv.origem)}</b>${inv.inicio ? ` ${fmtDW(inv.inicio)}` : ""}${d ? `, ${d} ${d === 1 ? "dia" : "dias"}` : ""}. Ao entrar, você vê o roteiro e os outros pilotos veem você e sua moto.</p>
      <div class="label">Sua moto nessa viagem</div>
      <label class="field"><span>Modelo</span><input id="jMoto" value="${esc(p.moto || "")}" placeholder="Ex.: Honda CG 160 Titan"></label>
      <div class="grid2">
        <label class="field"><span>Consumo (km/L)</span><input id="jCons" inputmode="decimal" value="${p.consumo ?? ""}"></label>
        <label class="field"><span>Tanque (L)</span><input id="jTanq" inputmode="decimal" value="${p.tanque ?? ""}"></label>
      </div>
      <p class="err" id="jErr" hidden></p>
      <button class="btn primary block" id="jGo">Entrar na viagem</button>
      <a class="btn block" href="#viagens">Agora não</a>
    </form>
  </div>`;
}
function bindConvite(code) {
  const f = $("#fJoin"); if (!f) return;
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const inv = inviteCache[code]?.inv, er = $("#jErr"), go = $("#jGo"); er.hidden = true; go.disabled = true;
    const p = S().profile || {};
    const mine = { nome: myName(), moto: $("#jMoto").value.trim(), consumo: parseNum($("#jCons").value), tanque: parseNum($("#jTanq").value), foto: p.fotoMini || S().user?.photoURL || "" };
    try {
      await store.joinTrip(inv, code, mine);
      if (mine.moto && !p.moto) store.saveProfile({ moto: mine.moto, consumo: mine.consumo, tanque: mine.tanque }).catch(() => {});
      delete inviteCache[code]; toast(`Bem-vindo à “${inv.name}”`); location.hash = `#viagem/${inv.trip}`;
    } catch (x) { er.textContent = x?.code === "permission-denied" ? "Esse link não vale mais. Peça um novo para quem te convidou." : "Não deu para entrar agora. Confira a internet e tente de novo."; er.hidden = false; go.disabled = false; }
  });
}
function motoSheet(t) {
  const m = (t.members || {})[me()] || {};
  openSheet(`<h3>Minha moto nesta viagem</h3>
    <form id="fMoto">
      <label class="field"><span>Modelo</span><input id="mMoto" value="${esc(m.moto || "")}"></label>
      <div class="grid2">
        <label class="field"><span>Consumo (km/L)</span><input id="mCons" inputmode="decimal" value="${m.consumo ?? ""}"></label>
        <label class="field"><span>Tanque (L)</span><input id="mTanq" inputmode="decimal" value="${m.tanque ?? ""}"></label>
      </div>
      <p class="err" id="mErr" hidden></p>
      <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div>
    </form>`, sh => {
    sh.querySelector("#fMoto").addEventListener("submit", async e => {
      e.preventDefault();
      try { await store.updateMyMember(t.id, { moto: sh.querySelector("#mMoto").value.trim(), consumo: parseNum(sh.querySelector("#mCons").value), tanque: parseNum(sh.querySelector("#mTanq").value) }); closeSheet(); toast("Moto salva"); }
      catch (x) { const er = sh.querySelector("#mErr"); er.textContent = "Não deu para salvar agora."; er.hidden = false; }
    });
  });
}

/* ---------- foto do perfil (guardada pequena, sem precisar de armazenamento pago) ---------- */
function shrinkImage(file, size, quality = .82) {
  return new Promise((ok, fail) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas"); c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("imagem")); };
    img.src = url;
  });
}
async function setPhoto(file) {
  const foto = file ? await shrinkImage(file, 256) : "", fotoMini = file ? await shrinkImage(file, 72, .75) : "";
  await store.saveProfile({ foto, fotoMini });
  // atualiza o rostinho nas viagens de que participa
  await Promise.all(S().trips.filter(t => (t.memberIds || []).includes(me())).map(t => store.updateMyMember(t.id, { foto: fotoMini }).catch(() => {})));
}

/* =========================== PERFIL =========================== */
function viewPerfil() {
  const u = S().user, p = S().profile || {};
  return `<div class="view">
    <h2>Perfil</h2>
    <div class="cols">
    <form id="fPerf" class="card">
      <div class="phrow"><span class="avatar xl">${avatarInner()}</span>
        <div class="row"><label class="btn sm">${p.foto || u.photoURL ? "Trocar foto" : "Pôr foto"}<input type="file" id="pFoto" accept="image/*" hidden></label>${p.foto ? `<button type="button" class="btn sm" data-act="noPhoto">Tirar foto</button>` : ""}</div>
      </div>
      <label class="field"><span>Nome</span><input id="pNome" value="${esc(p.nome || u.displayName || "")}" required></label>
      <div class="label" style="margin-top:4px">Sua moto</div>
      <label class="field"><span>Modelo</span><input id="pMoto" value="${esc(p.moto || "")}" placeholder="Ex.: Honda CG 160 Titan"></label>
      <div class="grid2">
        <label class="field"><span>Consumo (km/L)</span><input id="pCons" inputmode="decimal" value="${p.consumo ?? ""}"></label>
        <label class="field"><span>Tanque (L)</span><input id="pTanq" inputmode="decimal" value="${p.tanque ?? ""}"></label>
      </div>
      <small class="muted">Vem preenchido quando você cria ou entra numa viagem. Para mudar a moto de uma viagem que já existe, use “Minha moto” dentro dela.</small>
      <button class="btn primary block">Salvar perfil</button>
    </form>
    <div class="card">
      <h3>Conta</h3>
      <dl class="kv"><dt>E-mail</dt><dd>${esc(u.email || "—")}</dd><dt>Entrada</dt><dd>${u.provider === "google.com" ? "Google" : "E-mail e senha"}</dd></dl>
      <div class="row"><button class="btn" data-act="logout">Sair</button><button class="btn danger" data-act="delAccount">Excluir conta</button></div>
    </div>
    </div>
  </div>`;
}
function bindPerfil() {
  $("#pFoto")?.addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return;
    toast("Enviando foto…");
    try { await setPhoto(f); toast("Foto atualizada"); } catch (x) { toast("Não deu para usar essa imagem"); }
  });
  $("#fPerf")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#pNome").value.trim(); if (!nome) return;
    try {
      await store.saveProfile({ nome, moto: $("#pMoto").value.trim(), consumo: parseNum($("#pCons").value), tanque: parseNum($("#pTanq").value) });
      // o nome também aparece para os outros pilotos
      S().trips.filter(t => (t.members || {})[me()] && t.members[me()].nome !== nome).forEach(t => store.updateMyMember(t.id, { nome }).catch(() => {}));
      toast("Perfil salvo");
    } catch (x) { toast("Não deu para salvar agora"); }
  });
}

/* =========================== AJUSTES =========================== */
const CREDITS = [
  ["Firebase", "https://firebase.google.com", "login e sincronização (Google)", ""],
  ["GitHub Pages", "https://pages.github.com", "hospedagem do app", ""],
  ["Overpass", "https://fonts.google.com/specimen/Overpass", "fonte principal, inspirada nas placas de rodovia (Delve Withrington)", "SIL OFL 1.1"],
  ["Overpass Mono", "https://fonts.google.com/specimen/Overpass+Mono", "números", "SIL OFL 1.1"],
  ["Fraunces", "https://fonts.google.com/specimen/Fraunces", "títulos do estilo Trilha (Undercase Type)", "SIL OFL 1.1"],
  ["Google Fonts", "https://fonts.google.com", "entrega das fontes", ""],
  ["DejaVu Sans", "https://dejavu-fonts.github.io", "texto da imagem de pré-visualização do link", "licença livre DejaVu (Bitstream Vera)"],
];
const qyuMark = () => `<a class="qyu" href="https://jacobbv.github.io/" target="_blank" rel="noopener">Desenvolvido por <b>QYUDEV.</b></a>`;
const TEMAS = [["claro", "Claro"], ["escuro", "Escuro"], ["auto", "Do aparelho"]];
const temaSeg = (curto) => `<div class="seg" role="group" aria-label="Tema">${TEMAS.map(([k, l]) => `<button type="button" data-act="tema" data-v="${k}" aria-pressed="${getTema() === k}" ${getEstilo() === "asfalto" ? "disabled" : ""}>${curto && k === "auto" ? "Auto" : l}</button>`).join("")}</div>`;
function viewAjustes() {
  const e = getEstilo();
  return `<div class="view narrow">
    <h2>Estilo e ajustes</h2>
    <div class="card">
      <h3>Estilo do app</h3>
      <div class="styles">${ESTILOS.map(([k, l, s]) => `<button type="button" data-act="estilo" data-v="${k}" aria-pressed="${e === k}"><div class="sw ${k}">${s}</div><div class="nm">${l}</div></button>`).join("")}</div>
      <p class="muted small" style="margin:0">Placa: placa verde de rodovia. Asfalto: noite e faixa amarela. Trilha: papel e curvas de nível.</p>
    </div>
    <div class="card">
      <h3>Tema</h3>
      ${temaSeg()}
      <p class="muted small" style="margin:0">${e === "asfalto" ? "O estilo Asfalto é sempre escuro." : "“Do aparelho” acompanha o modo claro ou escuro do celular ou do computador."}</p>
    </div>
    <div class="card only-wide">
      <h3>Menu lateral</h3>
      <p class="muted small" style="margin:0">No computador o menu fica na lateral. Recolhido, mostra só os ícones e deixa mais espaço para a viagem.</p>
      <div class="row"><button class="btn sm" data-act="menuMini">${document.documentElement.dataset.menu === "mini" ? "Mostrar menu completo" : "Recolher menu"}</button></div>
    </div>
    <p class="muted small" style="margin:0">Estilo, tema e menu ficam guardados neste aparelho.</p>
  </div>`;
}
function viewSobre() {
  return `<div class="view">
    <h2>Sobre e créditos</h2>
    <div class="cols"><div class="col">
    <div class="card">
      <div class="between" style="justify-content:flex-start"><span class="mark" style="width:44px;height:44px">${MARK}</span><h3>Expedição</h3></div>
      <p style="margin:0">Companheiro de viagem para expedições de moto: planeja a viagem por dias, avisa o que vem pela frente e guarda o que aconteceu. A navegação curva a curva fica com o Google Maps ou o Waze.</p>
      <p class="muted small" style="margin:0">Versão ${esc(self.APP_VERSION || "")}${store.mode === "local" ? " · modo de teste neste aparelho" : ""}</p>
      <p style="margin:0">${qyuMark()}</p>
    </div>
    </div><div class="col">
    <div class="card">
      <h3>Créditos</h3>
      <ul class="credits">${CREDITS.map(([n, url, what, lic]) => `<li><a href="${url}" target="_blank" rel="noopener">${n}</a><span>${what}${lic ? ` · ${lic}` : ""}</span></li>`).join("")}</ul>
      <p class="muted small" style="margin:0">Google é marca do Google LLC. Ícones e marca desenhados para o app.</p>
    </div>
    </div></div>
  </div>`;
}

/* =========================== NAVEGAÇÃO =========================== */
// Seções da viagem. Cada uma aparece no menu quando estiver pronta (roteiro, mapa, checklist e gastos chegam na 2.0-c).
const TRIP_TABS = [["inicio", "Início", "inicio"]];
const curTrip = () => ["viagem", "editar"].includes(route) ? tripById(param) : null;
const initials = n => (n || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function avatarInner() {
  const u = S().user || {}, foto = S().profile?.foto || u.photoURL;
  return foto ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : esc(initials(myName()));
}
function renderSide() {
  const side = $("#side"), st = S(), t = curTrip();
  const list = sortTrips(st.trips).slice(0, 8);
  const on = r => route === r ? " on" : "";
  side.innerHTML = `
    <a class="sbrand" href="#viagens" title="Minhas viagens"><span class="mark">${MARK}</span><span class="b1">Expedição</span></a>
    <div class="sgrp">Viagens</div>
    <a class="si${route === "viagens" ? " on" : ""}" href="#viagens" title="Minhas viagens">${ico("viagens")}<span class="lbl">Minhas viagens</span></a>
    ${list.map(x => `<a class="si sub${t && t.id === x.id ? " on" : ""}" href="#viagem/${x.id}" title="${esc(x.name)}"><span class="dotc" style="--c:${tripColor(x)}">${esc(initials(x.name.replace(/^expedi[cç][aã]o\s+/i, "")).slice(0, 1))}</span><span class="lbl">${esc(x.name)}</span></a>`).join("")}
    <a class="si sub${on("nova")}" href="#nova" title="Nova viagem">${ico("mais")}<span class="lbl">Nova viagem</span></a>
    ${t ? `<div class="sgrp">${esc(t.name)}</div>${TRIP_TABS.map(([k, l, i]) => `<a class="si${(sub || "inicio") === k && route === "viagem" ? " on" : ""}" href="#viagem/${t.id}${k === "inicio" ? "" : "/" + k}" title="${l}">${ico(i)}<span class="lbl">${l}</span></a>`).join("")}` : ""}
    <div class="sfoot">
      <button class="si" data-act="menuMini" title="${document.documentElement.dataset.menu === "mini" ? "Mostrar menu" : "Recolher menu"}">${ico(document.documentElement.dataset.menu === "mini" ? "expandir" : "recolher")}<span class="lbl">Recolher menu</span></button>
      ${qyuMark()}
    </div>`;
}
function renderBottomNav() {
  const nav = $("#nav"), t = curTrip(), tabs = t ? TRIP_TABS : [];
  const show = tabs.length >= 2;
  nav.hidden = !show; document.body.classList.toggle("has-nav", show);
  nav.innerHTML = show ? `<div class="in">${tabs.map(([k, l, i]) => `<a class="${(sub || "inicio") === k ? "on" : ""}" href="#viagem/${t.id}${k === "inicio" ? "" : "/" + k}">${ico(i)}${l}</a>`).join("")}</div>` : "";
}
function openUserMenu() {
  const st = S(), u = st.user, t = curTrip();
  const L = $("#layer");
  L.innerHTML = `<div class="backdrop light" data-close="1"></div>
  <div class="umenu" role="dialog" aria-modal="true" aria-label="Sua conta">
    <div class="uhead"><span class="avatar lg">${avatarInner()}</span><div class="who"><b>${esc(myName())}</b><small>${esc(u.email || "")}</small>${t ? `<small>Na viagem: ${esc(t.name)}</small>` : ""}</div><button class="x" data-close="1" aria-label="Fechar">×</button></div>
    <div class="ugrp">Sua conta</div>
    <a class="uitem" href="#perfil"><span class="ic">${ico("perfil")}</span>Perfil e moto<span class="v">${esc(st.profile?.moto || "")}</span></a>
    ${t ? `<button class="uitem" data-act="invite" data-id="${t.id}"><span class="ic">${ico("pilotos")}</span>Convidar para esta viagem</button>` : ""}
    <div class="ugrp">Aparência</div>
    <div class="uitem" style="cursor:default"><span class="ic">${ico("lua")}</span>Tema${temaSeg(true)}</div>
    <a class="uitem" href="#ajustes"><span class="ic">${ico("pincel")}</span>Estilo e ajustes<span class="v">${ESTILO_NOME[getEstilo()]}</span></a>
    <div class="ugrp">O app</div>
    <button class="uitem" data-act="share"><span class="ic">${ico("share")}</span>Compartilhar o app</button>
    <a class="uitem" href="#sobre"><span class="ic">${ico("info")}</span>Sobre e créditos</a>
    <div class="ugrp">Conta</div>
    <button class="uitem bad" data-act="logout"><span class="ic">${ico("sair")}</span>Sair da conta</button>
    <div class="ufoot">${store.mode === "local" ? "Modo de teste: tudo fica neste aparelho" : !st.online ? "Sem sinal: o que você fizer é salvo quando a internet voltar" : st.pending ? "Enviando para a nuvem…" : "Salvo na nuvem"} · versão ${esc(self.APP_VERSION || "")}</div>
  </div>`;
  L.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSheet));
  L.querySelectorAll("a.uitem").forEach(a => a.addEventListener("click", closeSheet));
}
$("#avatarBtn").addEventListener("click", openUserMenu);
function shareApp() {
  const link = "https://jacobbv.github.io/expedicao-app/";
  linkSheet({
    title: "Compartilhar o app",
    intro: "Mande o Expedição para outros motociclistas. Cada um cria a conta e monta as próprias viagens.",
    link, msg: `Conhece o Expedição? Planeja a viagem de moto por dias, mostra onde abastecer pela autonomia da moto e o tempo no caminho. É grátis: ${link}`,
  });
}

/* =========================== AÇÕES =========================== */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "ltab") { loginTab = b.dataset.v; S().error = ""; render(); }
  else if (act === "forgot") forgotSheet();
  else if (act === "google") { try { await store.signInGoogle(); } catch (x) { const er = $("#lErr"); if (er) { er.textContent = authMessage(x); er.hidden = false; } } }
  else if (act === "estilo") { setEstilo(b.dataset.v); render(); }
  else if (act === "tema") { setTema(b.dataset.v); b.closest(".seg")?.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); if (route === "ajustes") render(); }
  else if (act === "menuMini") { toggleMenu(); if (route === "ajustes") render(); }
  else if (act === "share") { closeSheet(); shareApp(); }
  else if (act === "invite") { const t = tripById(id); if (t) { closeSheet(); inviteSheet(t); } }
  else if (act === "myMoto") { const t = tripById(id); if (t) motoSheet(t); }
  else if (act === "noPhoto") { try { await setPhoto(null); toast("Foto removida"); } catch (x) { toast("Não deu para tirar agora"); } }
  else if (act === "kick") {
    const t = tripById(id), uid = b.dataset.uid, m = t?.members?.[uid]; if (!t) return;
    openSheet(`<h3>Remover ${esc(m?.nome || "piloto")}?</h3><p class="muted" style="margin:0">A viagem some para essa pessoa. Ela só volta com um link de convite. Se quiser garantir, troque o link depois.</p>
      <div class="actions"><button class="btn" data-close="1">Cancelar</button><button class="btn danger" id="cKick">Remover</button></div>`, sh => {
      sh.querySelector("#cKick").addEventListener("click", async () => { closeSheet(); await store.removeMember(id, uid).then(() => toast("Piloto removido")).catch(() => toast("Não deu para remover agora")); });
    });
  }
  else if (act === "leave") {
    const t = tripById(id); if (!t) return;
    openSheet(`<h3>Sair de “${esc(t.name)}”?</h3><p class="muted" style="margin:0">A viagem some da sua lista. Para voltar, peça um link de convite.</p>
      <div class="actions"><button class="btn" data-close="1">Cancelar</button><button class="btn danger" id="cLeave">Sair da viagem</button></div>`, sh => {
      sh.querySelector("#cLeave").addEventListener("click", async () => { closeSheet(); try { await store.leaveTrip(id); toast("Você saiu da viagem"); location.hash = "#viagens"; } catch (x) { toast("Não deu para sair agora"); } });
    });
  }
  else if (act === "logout") { closeSheet(); loginTab = "entrar"; await store.signOut(); location.hash = "#viagens"; }
  else if (act === "delTrip") {
    const t = tripById(id); if (!t) return;
    openSheet(`<h3>Apagar “${esc(t.name)}”?</h3><p class="muted" style="margin:0">A viagem e o link de convite somem para todos os pilotos. Não dá para desfazer.</p>
      <div class="actions"><button class="btn" data-close="1">Cancelar</button><button class="btn danger" id="cDel">Apagar viagem</button></div>`, sh => {
      sh.querySelector("#cDel").addEventListener("click", async () => { closeSheet(); await store.deleteTrip(id).catch(() => toast("Não deu para apagar agora")); toast("Viagem apagada"); location.hash = "#viagens"; });
    });
  }
  else if (act === "delAccount") {
    openSheet(`<h3>Excluir sua conta?</h3><p class="muted" style="margin:0">Apaga sua conta, seu perfil e as viagens que você criou. Nas viagens dos outros, você sai e elas continuam com eles. Não dá para desfazer.</p>
      <p class="err" id="daErr" hidden></p>
      <div class="actions"><button class="btn" data-close="1">Cancelar</button><button class="btn danger" id="cDa">Excluir conta</button></div>`, sh => {
      sh.querySelector("#cDa").addEventListener("click", async () => {
        try { await store.deleteAccount(); closeSheet(); toast("Conta excluída"); }
        catch (x) { const er = sh.querySelector("#daErr"); er.textContent = x?.code === "auth/requires-recent-login" ? "Por segurança, saia e entre de novo antes de excluir a conta." : "Não deu para excluir agora."; er.hidden = false; }
      });
    });
  }
});

/* =========================== DESENHO =========================== */
function syncTop() {
  const st = S(), pill = $("#syncPill"); if (!pill) return;
  pill.hidden = store.mode === "local";
  pill.classList.toggle("off", !st.online || st.pending);
  pill.querySelector(".t").textContent = !st.online ? "Sem sinal" : st.pending ? "Enviando…" : "Sincronizado";
  pill.title = pill.querySelector(".t").textContent;
}
function render() {
  const st = S(), view = $("#view");
  if (!st.ready) return;
  const logged = !!st.user;
  $(".top").hidden = !logged; $("#side").hidden = !logged; $("#avatarBtn").hidden = !logged;
  document.body.classList.toggle("has-side", logged);
  if (!logged) {
    if (route === "convite" && param) ls.set("convitePendente", param);
    $("#nav").hidden = true; document.body.classList.remove("has-nav"); view.innerHTML = viewLogin(); bindLogin(); return;
  }
  const pend = ls.get("convitePendente", ""); if (pend) { ls.set("convitePendente", ""); try { localStorage.removeItem("convitePendente"); } catch (e) {} if (route !== "convite") { location.hash = `#convite/${pend}`; return; } }
  const t = curTrip();
  $(".top .brand .mark").innerHTML = MARK;
  $("#brandTrip").textContent = t ? t.name.replace(/^expedi[cç][aã]o\s+/i, "") : "";
  $(".top .brand").classList.toggle("intrip", !!t);
  $("#avatarBtn").innerHTML = avatarInner();
  syncTop(); renderSide(); renderBottomNav();
  if (route === "nova") { view.innerHTML = viewNova(); bindNova(); }
  else if (route === "editar") { view.innerHTML = t ? viewNova(t) : viewViagem(null); if (t) bindNova(t); }
  else if (route === "viagem") view.innerHTML = viewViagem(t);
  else if (route === "perfil") { view.innerHTML = viewPerfil(); bindPerfil(); }
  else if (route === "ajustes") view.innerHTML = viewAjustes();
  else if (route === "sobre") view.innerHTML = viewSobre();
  else if (route === "convite") { view.innerHTML = viewConvite(param); bindConvite(param); }
  else view.innerHTML = viewViagens();
}
// Não redesenha enquanto a pessoa digita num formulário (evita perder o que foi escrito)
onChange(() => { const a = document.activeElement; if (a && a.closest("form") && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && S().user) { syncTop(); return; } render(); });
applyLook();
parseHash();
