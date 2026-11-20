// Expedição · telas (versão 2.0-a: entrada, perfil, Minhas viagens, nova viagem, ajustes)
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

/* ---------- estilo ---------- */
const getEstilo = () => { try { return localStorage.getItem("estilo") || "placa"; } catch (e) { return "placa"; } };
function setEstilo(s) {
  try { localStorage.setItem("estilo", s); } catch (e) {}
  document.documentElement.dataset.estilo = s;
  const tc = { placa: "#0b6b3a", asfalto: "#0d1011", trilha: "#3b2a1c" }[s];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tc);
}

/* ---------- rotas ---------- */
let route = "viagens", param = "";
function parseHash() { const h = location.hash.slice(1) || "viagens"; [route, param = ""] = h.split("/"); }
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
  return `<div class="login">
    <div class="sign">
      <div class="srow"><span><span class="arr">↑</span>Roteiro por dias</span></div>
      <div class="srow"><span><span class="arr">↗</span>Abastecimento</span></div>
      <div class="srow"><span><span class="arr">↑</span>Tempo no caminho</span></div>
    </div>
    <div><h2>Expedição</h2><p class="lead muted" style="margin:6px 0 0">O companheiro de viagem para expedições de moto: planeje por dias, saiba onde abastecer e leve o roadbook na palma da mão.</p></div>
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
  </div>`;
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
  return `<div class="view">
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
          members: { [me()]: { nome: myName(), papel: "dono", ...moto } }, invite: newCode(), days: [], moeda: "BRL", avgSpeed: 65, schema: 2 };
        await store.createTrip(trip);
        if (moto.moto && !S().profile?.moto) store.saveProfile(moto).catch(() => {});
        toast("Viagem criada"); location.hash = `#viagem/${id}`;
      }
    } catch (x) { er.textContent = "Não deu para salvar agora. Confira a internet e tente de novo."; er.hidden = false; }
  });
}

/* =========================== VIAGEM =========================== */
function viewViagem(t) {
  if (!t) return `<div class="view"><div class="card empty"><h3>Viagem não encontrada</h3><p class="muted" style="margin:0">Ela pode ter sido apagada, ou você ainda não participa dela.</p><a class="btn" href="#viagens">Minhas viagens</a></div></div>`;
  const ph = tripPhase(t), d = tripDays(t), dono = t.owner === me(), members = Object.entries(t.members || {});
  return `<div class="view">
    <a href="#viagens" class="small" style="text-decoration:none">← Minhas viagens</a>
    <div class="sign">
      <div class="label" style="color:inherit;opacity:.8">${esc(tipoLabel(t.tipo))}${d ? ` · ${d} ${d === 1 ? "dia" : "dias"}` : ""}</div>
      <div class="big">${ph.k === "antes" ? `Faltam <b>${num(ph.n)}</b> ${ph.n === 1 ? "dia" : "dias"}` : esc(ph.txt)}</div>
      <div class="srow"><span><span class="arr">↑</span>${esc(t.destino)}</span><span class="km">${fmtD(t.inicio)}</span></div>
      <div class="srow"><span><span class="arr">↓</span>${esc(t.origem)}</span><span class="km">${fmtD(t.fim)}</span></div>
    </div>
    <div class="card">
      <div class="between"><h3>${esc(t.name)}</h3>${dono ? `<a class="btn sm" href="#editar/${t.id}">Editar</a>` : ""}</div>
      <dl class="kv"><dt>Saída</dt><dd>${esc(t.origem)}${t.inicio ? ` · ${fmtDW(t.inicio)}` : ""}</dd><dt>Destino</dt><dd>${esc(t.destino)}</dd><dt>Volta</dt><dd>${t.fim ? fmtDW(t.fim) : "—"}</dd></dl>
    </div>
    <div class="card">
      <div class="between"><h3>Pilotos</h3><span class="tag-y">${members.length}</span></div>
      ${members.map(([uid, m]) => `<div class="between" style="border-top:1px solid var(--line);padding-top:8px"><div><b>${esc(m.nome || "Piloto")}</b>${uid === me() ? ` <span class="muted small">(você)</span>` : ""}<div class="muted small">${esc(m.moto || "moto não informada")}${m.consumo ? ` · ${num(m.consumo, 1)} km/L` : ""}${m.tanque ? ` · ${num(m.tanque, 1)} L` : ""}${m.consumo && m.tanque ? ` · ~${num(m.consumo * m.tanque)} km por tanque` : ""}</div></div>${m.papel === "dono" ? `<span class="shield">DONO</span>` : ""}</div>`).join("")}
      <p class="note">Em breve: convite por link para quem vai junto entrar na viagem.</p>
    </div>
    <div class="card">
      <h3>Em breve nesta viagem</h3>
      <p class="muted" style="margin:0">Roteiro por dias, mapa, tempo no caminho, abastecimento pela autonomia de cada moto, gastos divididos, checklist, diário de bordo, segurança e roadbook para imprimir.</p>
    </div>
    ${dono ? `<button class="btn danger" data-act="delTrip" data-id="${t.id}">Apagar viagem</button>` : ""}
  </div>`;
}

/* =========================== PERFIL =========================== */
function viewPerfil() {
  const u = S().user, p = S().profile || {};
  return `<div class="view">
    <h2>Perfil</h2>
    <form id="fPerf" class="card">
      <label class="field"><span>Nome</span><input id="pNome" value="${esc(p.nome || u.displayName || "")}" required></label>
      <div class="label" style="margin-top:4px">Sua moto</div>
      <label class="field"><span>Modelo</span><input id="pMoto" value="${esc(p.moto || "")}" placeholder="Ex.: Honda CG 160 Titan"></label>
      <div class="grid2">
        <label class="field"><span>Consumo (km/L)</span><input id="pCons" inputmode="decimal" value="${p.consumo ?? ""}"></label>
        <label class="field"><span>Tanque (L)</span><input id="pTanq" inputmode="decimal" value="${p.tanque ?? ""}"></label>
      </div>
      <small class="muted">Vem preenchido quando você cria uma viagem nova.</small>
      <button class="btn primary block">Salvar perfil</button>
    </form>
    <div class="card">
      <h3>Conta</h3>
      <dl class="kv"><dt>E-mail</dt><dd>${esc(u.email || "—")}</dd><dt>Entrada</dt><dd>${u.provider === "google.com" ? "Google" : "E-mail e senha"}</dd></dl>
      <div class="row"><button class="btn" data-act="logout">Sair</button><button class="btn danger" data-act="delAccount">Excluir conta</button></div>
    </div>
  </div>`;
}
function bindPerfil() {
  $("#fPerf")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#pNome").value.trim(); if (!nome) return;
    await store.saveProfile({ nome, moto: $("#pMoto").value.trim(), consumo: parseNum($("#pCons").value), tanque: parseNum($("#pTanq").value) }).catch(() => toast("Não deu para salvar agora"));
    toast("Perfil salvo");
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
];
const qyuMark = () => `<a class="qyu" href="https://jacobbv.github.io/" target="_blank" rel="noopener">Desenvolvido por <b>QYUDEV.</b></a>`;
function viewAjustes() {
  const e = getEstilo();
  return `<div class="view">
    <h2>Ajustes</h2>
    <div class="card">
      <h3>Estilo do app</h3>
      <div class="styles">${ESTILOS.map(([k, l, s]) => `<button type="button" data-act="estilo" data-v="${k}" aria-pressed="${e === k}"><div class="sw ${k}">${s}</div><div class="nm">${l}</div></button>`).join("")}</div>
      <p class="muted small" style="margin:0">Placa: placa verde de rodovia. Asfalto: noite e faixa amarela. Trilha: papel e curvas de nível. Fica guardado neste aparelho.</p>
    </div>
    <div class="card">
      <h3>Sobre</h3>
      <p style="margin:0">O <b>Expedição</b> é um companheiro de viagem para expedições de moto: planeja a viagem por dias, avisa o que vem pela frente e guarda o que aconteceu. A navegação curva a curva fica com o Google Maps ou o Waze.</p>
      <p class="muted small" style="margin:0">Versão ${esc(self.APP_VERSION || "")}${store.mode === "local" ? " · modo de teste neste aparelho" : ""}</p>
      <p style="margin:0">${qyuMark()}</p>
    </div>
    <div class="card">
      <h3>Créditos</h3>
      <ul class="credits">${CREDITS.map(([n, url, what, lic]) => `<li><a href="${url}" target="_blank" rel="noopener">${n}</a><span>${what}${lic ? ` · ${lic}` : ""}</span></li>`).join("")}</ul>
      <p class="muted small" style="margin:0">Google é marca do Google LLC. Ícones desenhados para o app.</p>
    </div>
  </div>`;
}

/* =========================== AÇÕES =========================== */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "ltab") { loginTab = b.dataset.v; S().error = ""; render(); }
  else if (act === "forgot") forgotSheet();
  else if (act === "google") { try { await store.signInGoogle(); } catch (x) { const er = $("#lErr"); if (er) { er.textContent = authMessage(x); er.hidden = false; } } }
  else if (act === "estilo") { setEstilo(b.dataset.v); render(); }
  else if (act === "logout") { loginTab = "entrar"; await store.signOut(); location.hash = "#viagens"; }
  else if (act === "delTrip") {
    const t = tripById(id); if (!t) return;
    openSheet(`<h3>Apagar “${esc(t.name)}”?</h3><p class="muted" style="margin:0">A viagem some para todos os pilotos. Não dá para desfazer.</p>
      <div class="actions"><button class="btn" data-close="1">Cancelar</button><button class="btn danger" id="cDel">Apagar viagem</button></div>`, sh => {
      sh.querySelector("#cDel").addEventListener("click", async () => { closeSheet(); await store.deleteTrip(id).catch(() => toast("Não deu para apagar agora")); toast("Viagem apagada"); location.hash = "#viagens"; });
    });
  }
  else if (act === "delAccount") {
    openSheet(`<h3>Excluir sua conta?</h3><p class="muted" style="margin:0">Apaga sua conta, seu perfil e as viagens que você criou. Viagens de outros pilotos continuam com eles. Não dá para desfazer.</p>
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
function render() {
  const st = S(), view = $("#view"), nav = $("#nav");
  if (!st.ready) return;
  if (!st.user) {
    $(".top").hidden = true; nav.hidden = true;
    view.innerHTML = viewLogin(); bindLogin(); return;
  }
  $(".top").hidden = false; nav.hidden = false;
  const t = ["viagem", "editar"].includes(route) ? tripById(param) : null;
  $("#brandTrip").textContent = t ? t.name.replace(/^expedi[cç][aã]o\s+/i, "") : "";
  const pill = $("#syncPill");
  pill.hidden = store.mode === "local";
  pill.classList.toggle("off", !st.online || st.pending);
  pill.querySelector(".t").textContent = !st.online ? "Sem sinal" : st.pending ? "Enviando…" : "Sincronizado";
  nav.querySelectorAll("a").forEach(a => a.classList.toggle("on", a.dataset.r === route || (a.dataset.r === "viagens" && ["viagem", "nova", "editar"].includes(route))));
  if (route === "nova") { view.innerHTML = viewNova(); bindNova(); }
  else if (route === "editar") { view.innerHTML = t ? viewNova(t) : viewViagem(null); if (t) bindNova(t); }
  else if (route === "viagem") view.innerHTML = viewViagem(t);
  else if (route === "perfil") { view.innerHTML = viewPerfil(); bindPerfil(); }
  else if (route === "ajustes") view.innerHTML = viewAjustes();
  else view.innerHTML = viewViagens();
}
// Não redesenha enquanto a pessoa digita num formulário (evita perder o que foi escrito)
onChange(() => { const a = document.activeElement; if (a && a.closest("form") && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName) && S().user) { syncTop(); return; } render(); });
function syncTop() { const st = S(), pill = $("#syncPill"); if (!pill) return; pill.classList.toggle("off", !st.online || st.pending); pill.querySelector(".t").textContent = !st.online ? "Sem sinal" : st.pending ? "Enviando…" : "Sincronizado"; }
setEstilo(getEstilo());
parseHash();
