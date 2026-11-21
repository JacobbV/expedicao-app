// Expedição · seções da viagem: início, roteiro, mapa, tempo, abastecimento, checklist, gastos,
// diário de bordo, segurança, modo pilotando, hospedagem, pendências, revisão, fotos, roadbook e resumo.
import { store, getState, newId } from "./store.js";
import { $, esc, pad, todayISO, parseISO, diffDays, addDays, WD, WDL, fmtD, fmtDW, num, brl, parseNum, hhmm, dur, toH, nowHM, low,
  toast, openSheet, closeSheet, armed, ls, downloadFile, isMobile, ico } from "./util.js";
import { geocode, roadRoute, fuelOnRoute, planFuel, distKm, along, lineKm, getPos, POS_ERR, placeName } from "./geo.js";
import { wxInfo, wxPlan, wxDay, wxDayCached, wxTypical, wxTypicalCached, windFrom } from "./weather.js";
import { ensureLeaflet, MapView } from "./map.js";

const S = getState;
const me = () => S().user?.uid;
const TD = () => S().td || {};
let trip = null, redraw = () => {};
export function setRedraw(fn) { redraw = fn; }
const ROAD = "#c8102e";

/* =========================== seções =========================== */
export const SECTIONS = [
  // [chave, nome, ícone, principal (menu e abas)]
  ["inicio", "Início", "inicio", true],
  ["roteiro", "Roteiro", "roteiro", true],
  ["mapa", "Mapa", "mapa", true],
  ["checklist", "Checklist", "checklist", true],
  ["gastos", "Gastos", "gastos", true],
  ["tempo", "Tempo", "tempo"],
  ["abastecer", "Abastecimento", "posto"],
  ["diario", "Diário de bordo", "diario"],
  ["seguranca", "Segurança", "escudo"],
  ["pilotando", "Modo pilotando", "velocimetro"],
  ["hospedagem", "Hospedagem", "cama"],
  ["pendencias", "Pendências", "pendencia"],
  ["revisao", "Revisão das motos", "chave"],
  ["fotos", "Fotos", "foto"],
  ["roadbook", "Roadbook", "roadbook"],
  ["resumo", "Resumo", "resumo"],
];
const secName = k => (SECTIONS.find(s => s[0] === k) || [, ""])[1];
const link = (k, extra = "") => `#viagem/${trip.id}${k === "inicio" ? "" : "/" + k}${extra ? "/" + extra : ""}`;
const back = (to = "inicio", label) => `<a href="${link(to)}" class="small" style="text-decoration:none">← ${label || secName(to)}</a>`;

/* =========================== dados =========================== */
const riderIds = () => (trip.memberIds || []).filter(u => trip.members?.[u]);
const rider = u => trip.members?.[u] || {};
const rname = u => (rider(u).nome || "Piloto").split(" ")[0];
const avgSpeed = () => Number(trip.avgSpeed) || 65;
export const tripDaysList = t => (t.days || []).map((d, i) => ({ ...d, i, n: i + 1, date: t.inicio ? addDays(t.inicio, i) : "" }));
const days = () => tripDaysList(trip);
// "misto": dia de estrada que termina com passeio leve na chegada
const isRoad = d => ["estrada", "misto"].includes(d.tipo || "estrada");
const TIPO = { estrada: "Dia de estrada", misto: "Estrada + passeio", passeio: "Passeio", descanso: "Descanso" };
// Cidades separadas por vírgula, "·", "→", ";" ou linha. Texto entre parênteses é nota e fica de fora.
const splitPlaces = t => (t || "").replace(/\([^)]*\)/g, " ").split(/[,;→>\n·•|]+|\s+-\s+(?![A-Z]{2}\b)/).map(s => s.replace(/\.$/, "").trim()).filter(s => s && s.length < 60);
const viaList = d => splitPlaces(d.via);
const samePlace = (a, b) => low(a).replace(/\s*-\s*[a-z]{2}$/, "") === low(b).replace(/\s*-\s*[a-z]{2}$/, "");
function stopNames(d) {
  const raw = isRoad(d) ? [d.origem, ...viaList(d), d.destino] : d.tipo === "passeio" ? viaList(d) : [];
  const out = []; raw.map(x => (x || "").trim()).filter(Boolean).forEach((x, i, a) => {
    // tira repetição (ex.: caminho que já começa na cidade de saída)
    if (out.length && samePlace(out[out.length - 1], x)) { if (i === a.length - 1) out[out.length - 1] = x; return; }
    out.push(x);
  });
  return out;
}
const hasRoute = d => d.tipo !== "descanso" && stopNames(d).length >= 2;
export const DAY_COLORS = [["vermelho", "#c8102e"], ["rosa", "#e85b9c"], ["azul", "#1d4ed8"], ["laranja", "#e8590c"], ["verde", "#16a34a"], ["roxo", "#7c3aed"], ["cinza", "#6b7280"]];
const dayColor = d => (DAY_COLORS.find(c => c[0] === d.cor) || [])[1] || ({ estrada: "#c8102e", misto: "#e85b9c", passeio: "#1d4ed8", descanso: "#6b7280" }[d.tipo || "estrada"]);
const sigOf = d => low(stopNames(d).join("|"));
// onde a pessoa dorme / passa o dia
function dayPlace(d) {
  if (isRoad(d)) return d.destino || d.origem || "";
  if (d.origem) return d.origem;
  const ds = days(); for (let i = d.i - 1; i >= 0; i--) if (ds[i].destino || (ds[i].tipo !== "estrada" && ds[i].origem)) return ds[i].destino || ds[i].origem;
  return trip.destino || "";
}
function dayTitle(d) {
  if (isRoad(d)) return d.titulo || (d.origem || d.destino ? `${d.origem || "?"} → ${d.destino || "?"}` : "Dia de estrada a definir");
  const p = dayPlace(d);
  return d.titulo || (d.tipo === "passeio" ? `Passeio${p ? " em " + p : ""}` : `Descanso${p ? " em " + p : ""}`);
}
// km e horas do dia (rota calculada, ou o que foi digitado)
function dayKm(d) { return Number(d.km) || d.geo?.km || null; }
function dayHours(d) { const k = dayKm(d); return k ? k / avgSpeed() : null; }
function dayArrive(d) { const h = dayHours(d), s = toH(d.saida); return h != null && s != null ? s + h : null; }
const LONG_H = 8, LONG_KM = 600;
const isLong = d => isRoad(d) && ((dayHours(d) || 0) > LONG_H || (dayKm(d) || 0) > LONG_KM);
const todayIdx = () => { const t = todayISO(); return days().findIndex(d => d.date === t); };
function focusDay() {
  const ds = days(); if (!ds.length) return null; const t = todayISO();
  return ds.find(d => d.date === t) || ds.find(d => d.date > t) || ds[ds.length - 1];
}
const lodgings = () => Object.entries(TD().lodging || {}).map(([id, x]) => ({ id, ...x }));
const lodgingFor = d => lodgings().filter(l => l.dayId === d.id).sort((a, b) => (STATUS_ORD[b.status] || 0) - (STATUS_ORD[a.status] || 0))[0];
const STATUS_ORD = { pago: 3, reservado: 2, ideia: 1 };
const STATUS = { ideia: "Opção", reservado: "Reservado", pago: "Pago" };

// Guarda os dias (lista inteira) na viagem
function saveDays(list) {
  const clean = list.map(({ i, n, date, ...d }) => d);
  trip.days = clean; store.updateTrip(trip.id, { days: clean }).catch(() => toast("Sem internet: o roteiro é salvo quando a conexão voltar"));
}

/* ---------- cálculo da rota de cada dia (cidades → estrada) ---------- */
const computing = new Set();
async function computeDay(d, force) {
  if (!hasRoute(d)) return null;
  const sig = sigOf(d);
  if (!force && d.geo?.sig === sig && d.geo.km) return d.geo;
  if (computing.has(d.id)) return null; computing.add(d.id);
  try {
    const pts = [], miss = []; let prev = days()[d.i - 1]?.geo?.pts?.slice(-1)[0] || null;
    if (!navigator.onLine) return null;
    for (const n of stopNames(d)) { const p = await geocode(n, prev); if (p) { pts.push({ name: n, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) }); prev = p; } else miss.push(n); }
    if (pts.length < 2) { const list = days(), cur = list.find(x => x.id === d.id); if (cur && sigOf(cur) === sig && miss.length) { cur.geo = { sig, pts, km: null, miss }; saveDays(list); } return null; }
    const R = await roadRoute(pts);
    const geo = { sig, pts, km: Math.round(R ? R.km : lineKm(pts.map(p => [p.lat, p.lng])) * 1.25), road: !!R, legs: R ? R.legs.map(Math.round) : null, miss };
    const list = days(); const cur = list.find(x => x.id === d.id); if (!cur || sigOf(cur) !== sig) return null;
    cur.geo = geo; saveDays(list); return geo;
  } finally { computing.delete(d.id); }
}
function computeMissing() {
  if (!navigator.onLine) return;
  days().filter(d => hasRoute(d) && d.geo?.sig !== sigOf(d)).slice(0, 3).forEach(d => computeDay(d).then(g => { if (g) redraw(); }));
}
async function dayLine(d) {
  if (!d.geo?.pts || d.geo.pts.length < 2) return null;
  const R = d.geo.road ? await roadRoute(d.geo.pts) : null;
  return R ? R.line : d.geo.pts.map(p => [p.lat, p.lng]);
}
// paradas do dia com km e horário estimado de passagem
function dayStops(d) {
  const g = d.geo; if (!g?.pts) return [];
  const t0 = toH(d.saida) ?? 6; let acc = 0;
  const f = Number(d.km) && g.km ? Number(d.km) / g.km : 1;
  return g.pts.map((p, i) => { if (i) acc += g.legs ? g.legs[i - 1] : distKm(g.pts[i - 1], p) * 1.25; const km = Math.round(acc * f); return { ...p, km, eta: t0 + km / avgSpeed() }; });
}
const gmapsUrl = d => {
  if (d.gmaps) return d.gmaps;
  const p = d.geo?.pts, names = stopNames(d); if (!names.length) return null;
  const q = (x, i) => p?.[i] ? `${p[i].lat},${p[i].lng}` : encodeURIComponent(x);
  const n = p?.length || names.length, all = p ? p : names;
  const dest = q(names[names.length - 1], n - 1), way = all.slice(1, -1).map((x, i) => p ? `${x.lat},${x.lng}` : encodeURIComponent(x)).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${way ? "&waypoints=" + way : ""}&travelmode=driving`;
};
const wazeUrl = d => { const p = d.geo?.pts?.slice(-1)[0]; return p ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes` : d.destino ? `https://waze.com/ul?q=${encodeURIComponent(d.destino)}&navigate=yes` : null; };

/* ---------- tempo do dia ---------- */
async function dayLoc(d) {
  if (d.geo?.pts?.length) return d.geo.pts[d.geo.pts.length - 1];
  const p = dayPlace(d); return p ? geocode(p, null) : null;
}
async function dayWx(d) {
  if (!d.date) return null;
  const loc = await dayLoc(d); if (!loc) return null;
  const plan = wxPlan(d.date, todayISO());
  const [day, typ] = await Promise.all([wxDay(loc.lat, loc.lng, plan), plan.kind === "ref" ? wxTypical(loc.lat, loc.lng, plan.target) : null]);
  return { loc, plan, day, typ };
}
const tC = v => v == null ? "—" : Math.round(v) + "°";
function wxChipHTML(W) {
  if (!W) return "";
  const { plan, day, typ } = W;
  if (plan.kind === "ref") {
    if (!typ) return `<span class="wx muted">tempo a partir de ${fmtD(plan.availableFrom)}</span>`;
    return `<span class="wx">${wxInfo(typ.rainy >= 3 ? 61 : typ.rainy ? 2 : 1).icon} ~${tC(typ.tmax)}/${tC(typ.tmin)} <small>clima típico · choveu ${typ.rainy} de ${typ.n} anos</small></span>`;
  }
  if (!day) return "";
  const i = wxInfo(day.code);
  return `<span class="wx">${i.icon} ${tC(day.tmax)}/${tC(day.tmin)} <small>${plan.kind === "past" ? "como foi" : i.text}${day.prob != null ? ` · chuva ${day.prob}%` : day.rain ? ` · ${num(day.rain, 1)} mm` : ""}${day.gust >= 50 ? ` · rajadas ${Math.round(day.gust)} km/h` : ""}</small></span>`;
}
function fillWx(root = document) {
  root.querySelectorAll("[data-wx]").forEach(el => {
    const d = days().find(x => x.id === el.dataset.wx); if (!d) return;
    dayWx(d).then(W => {
      if (!el.isConnected) return; el.innerHTML = wxChipHTML(W) || "";
      const ar = dayArrive(d), sun = W?.day?.sunset ? toH(W.day.sunset) : null;
      const late = el.parentElement?.querySelector("[data-late]");
      if (late && isRoad(d) && ar != null && sun != null && ar > sun) late.innerHTML = `<span class="chip warn">🌙 chega depois do pôr do sol (${hhmm(sun)})</span>`;
    });
  });
}

/* ---------- abastecimento ---------- */
const fuelCons = u => realCons(u) || Number(rider(u).consumo) || null;
const autonomy = u => (Number(rider(u).tanque) || 0) * (fuelCons(u) || 0);
async function fuelPlanDay(d) {
  if (!hasRoute(d) || !d.geo?.pts) return null;
  const line = await dayLine(d); if (!line) return null;
  const total = dayKm(d) || Math.round(lineKm(line));
  const F = await fuelOnRoute(line), postos = Array.isArray(F) ? F : F?.postos || null;
  const cities = dayStops(d).slice(1, -1).map(s => ({ name: s.name, km: s.km, city: true }));
  const cands = [...(postos || []).map(p => ({ ...p, name: p.city ? `${p.name} · ${p.city}` : p.name })), ...cities].sort((a, b) => a.km - b.km);
  // sem a lista de postos (servidor fora do ar), o plano usa só as cidades do caminho e não acusa "trecho sem posto"
  return { total, postos: postos || [], offline: !postos, riders: riderIds().map(u => { const aut = autonomy(u); if (!aut) return { u, missing: true };
    const P = planFuel(cands, total, aut * .8); if (!postos) P.warn = null; return { u, aut, ...P }; }) };
}
function fuelLine(P, compact) {
  if (!P) return `<span class="muted">calculando…</span>`;
  return (P.offline ? `<div class="muted small">⏳ Não deu para consultar os postos agora (servidor do mapa ocupado ou sem internet). Por enquanto, paradas nas cidades do caminho. <button class="linkbtn" data-t="fuelRetry">Tentar de novo</button></div>` : "") + P.riders.map(r => `<div><b>${esc(rname(r.u))}:</b> ${r.missing ? `<span class="muted">informe consumo e tanque em “Minha moto”</span>`
    : r.stops.length ? r.stops.map(s => `${s.city ? "" : "⛽ "}${esc(s.name)}${compact ? "" : ` <span class="muted">km ${num(s.km)}</span>`}`).join(" → ") : r.warn ? "abasteça antes de sair e onde puder" : P.offline && P.total > r.aut * .8 ? "abasteça nas cidades do caminho" : "um tanque dá até o destino"}${r.warn ? ` <span class="chip warn">⚠ ${num(r.warn.gap)} km sem posto</span>` : ""}</div>`).join("");
}
function fillFuel(root = document) {
  root.querySelectorAll("[data-fuel]").forEach(el => {
    const d = days().find(x => x.id === el.dataset.fuel); if (!d) return;
    fuelPlanDay(d).then(P => { if (el.isConnected) el.innerHTML = P ? fuelLine(P, el.dataset.compact) : `<span class="muted">${navigator.onLine ? "rota ainda não calculada" : "sem internet para calcular"}</span>`; });
  });
}

/* ---------- gastos ---------- */
// Categorias (as mesmas da Expedição Chapada, para importar a planilha de lá sem perder nada)
export const CATS = [["combustivel", "Combustível", "⛽"], ["hospedagem", "Hospedagem", "🛏️"], ["alimentacao", "Alimentação", "🍽️"], ["pedagio", "Pedágio", "🛣️"],
  ["passeio", "Passeios e guias", "🎟️"], ["estacionamento", "Estacionamento", "🅿️"], ["imprevisto", "Imprevistos na estrada", "⚠️"], ["moto", "Moto: manutenção e conserto", "🔧"],
  ["equipamentos", "Equipamentos", "🧳"], ["protecao", "Equipamentos de proteção", "🦺"], ["ferramentas", "Ferramentas", "🧰"], ["bagagem", "Bagagem", "🎒"],
  ["navegacao", "Navegação e estrada", "🧭"], ["roupas", "Roupas e higiene", "👕"], ["trilhas", "Trilhas e cachoeiras", "🥾"], ["fotos", "Fotos e comunicação", "📷"],
  ["medicamentos", "Medicamentos", "💊"], ["outros", "Outros", "🧾"]];
const CAT_ALIAS = { comida: "alimentacao", manutencao: "moto", conserto: "moto", equipamento: "protecao" };
const catOf = k => CATS.find(c => c[0] === (CAT_ALIAS[k] || k)) || CATS[CATS.length - 1];
const PREP_CATS = ["moto", "equipamentos", "protecao", "ferramentas", "bagagem", "navegacao", "roupas", "fotos", "medicamentos", "outros"];
const byNew = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0);
// Gastos da viagem (todos veem). Os que vieram de "Meus gastos" (fromPrep) só aparecem, não entram na divisão.
const allExpenses = () => Object.entries(TD().expenses || {}).map(([id, e]) => ({ id, ...e })).sort(byNew);
const expenses = () => allExpenses().filter(e => !e.fromPrep);
// Meus gastos de preparação (só eu vejo, a menos que marque "exibir para o grupo")
const prepList = () => Object.entries(TD().prep || {}).map(([id, e]) => ({ id, ...e })).sort(byNew);
function settlement() {
  const ids = riderIds(), list = expenses().filter(e => e.shared !== false);
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0), share = ids.length ? total / ids.length : 0;
  const bal = {}; ids.forEach(u => bal[u] = -share); list.forEach(e => { if (bal[e.rider] != null) bal[e.rider] += Number(e.amount) || 0; });
  // quem paga a quem (menor número de transferências)
  const pos = ids.filter(u => bal[u] > .009).map(u => ({ u, v: bal[u] })).sort((a, b) => b.v - a.v);
  const neg = ids.filter(u => bal[u] < -.009).map(u => ({ u, v: -bal[u] })).sort((a, b) => b.v - a.v);
  const moves = []; let i = 0, j = 0;
  while (i < neg.length && j < pos.length) { const v = Math.min(neg[i].v, pos[j].v); if (v > .009) moves.push({ from: neg[i].u, to: pos[j].u, v: Math.round(v * 100) / 100 }); neg[i].v -= v; pos[j].v -= v; if (neg[i].v < .01) i++; if (pos[j].v < .01) j++; }
  return { total, share, bal, moves };
}
const myCost = u => { const st = settlement(); return st.share + expenses().filter(e => e.rider === u && e.shared === false).reduce((s, e) => s + (Number(e.amount) || 0), 0); };

/* ---------- consumo real (abastecimentos com hodômetro) ---------- */
function fuelLog(u) {
  const L = expenses().filter(e => e.rider === u && e.cat === "combustivel" && e.odo && e.litros).sort((a, b) => a.odo - b.odo);
  let lastFull = null, since = 0, kmSeg = 0, lSeg = 0;
  L.forEach(e => { e.seg = null; if (lastFull != null) since += Number(e.litros) || 0;
    if (e.cheio !== false) { if (lastFull != null && since > 0 && e.odo > lastFull) { const km = e.odo - lastFull; e.seg = { km, cons: km / since }; kmSeg += km; lSeg += since; } lastFull = e.odo; since = 0; } });
  return { L, km: L.length > 1 ? L[L.length - 1].odo - L[0].odo : 0, real: lSeg ? kmSeg / lSeg : null };
}
const realCons = u => fuelLog(u).real;

/* =========================== INÍCIO =========================== */
const phase = () => { const h = todayISO(); if (!trip.inicio) return "sem"; if (h < trip.inicio) return "antes"; if (!trip.fim || h <= trip.fim) return "durante"; return "depois"; };
function signHTML() {
  const ds = days(), ph = phase(), i = todayIdx(), d = trip.inicio && trip.fim ? diffDays(trip.inicio, trip.fim) + 1 : null;
  const n = trip.inicio ? diffDays(todayISO(), trip.inicio) : null;
  const big = ph === "antes" ? `Faltam <b>${num(n)}</b> ${n === 1 ? "dia" : "dias"}` : ph === "durante" ? `Dia <b>${i + 1}</b>${ds.length ? ` de ${ds.length}` : d ? ` de ${d}` : ""}` : ph === "depois" ? "Expedição concluída" : "Sem data";
  const kmT = ds.filter(isRoad).reduce((s, x) => s + (dayKm(x) || 0), 0);
  return `<div class="sign">
    <div class="label" style="color:inherit;opacity:.8">${esc(trip.name)}${d ? ` · ${d} ${d === 1 ? "dia" : "dias"}` : ""}${kmT ? ` · ~${num(kmT)} km` : ""}</div>
    <div class="big">${big}</div>
    <div class="srow"><span><span class="arr">↑</span>${esc(trip.destino)}</span><span class="km">${fmtD(trip.inicio)}</span></div>
    <div class="srow"><span><span class="arr">↓</span>${esc(trip.origem)}</span><span class="km">${fmtD(trip.fim)}</span></div>
  </div>`;
}
const extrasHTML = d => [d.trilha ? `🥾 Trilha ${esc(d.trilha)}` : "", d.terra ? "🟫 tem trecho de terra" : ""].filter(Boolean).map(x => `<span class="chip">${x}</span>`).join(" ");
const pontosHTML = d => { const P = splitPlaces(d.pontos); return P.length ? `<div class="pontos">${P.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""; };
function timeLine(d) {
  const ar = dayArrive(d);
  return `${d.saida ? `🕓 <b>${hhmm(toH(d.saida))}</b>${ar != null && hasRoute(d) ? ` → ~${hhmm(ar)}` : ""}` : `<span class="muted">sem horário de saída</span>`}${dayKm(d) ? ` · 🏍️ <b>${num(dayKm(d))} km</b> de moto${isRoad(d) ? ` · ${dur(dayHours(d))} de estrada` : ""}` : ""}`;
}
function dayPreview(d, label) {
  const lg = lodgingFor(d), route = hasRoute(d) || dayKm(d);
  return `<div class="card day-prev" style="--c:${dayColor(d)}">
    <div class="between"><span class="label">${label} · ${d.date ? fmtDW(d.date) : "Dia " + d.n}</span><a class="small" href="${link("roteiro")}">Dia ${d.n} de ${days().length}</a></div>
    <h3 style="margin:0">${esc(dayTitle(d))}</h3>
    ${pontosHTML(d)}
    <div class="sect"><div class="label">Tempo</div><div data-wx="${d.id}"><span class="muted small">carregando…</span></div><div data-late></div></div>
    ${route || d.saida ? `<div class="sect"><div class="label">Horário e distância</div><div class="kvline">${timeLine(d)}</div>${isLong(d) ? `<span class="chip warn">⚠ dia longo</span>` : ""}${extrasHTML(d) ? `<div>${extrasHTML(d)}</div>` : ""}</div>` : ""}
    ${hasRoute(d) ? `<div class="sect"><div class="label">Abastecimento</div><div data-fuel="${d.id}" data-compact="1" class="small"><span class="muted">calculando…</span></div></div>` : ""}
    ${d.nota ? `<details class="dnote"><summary>Observações</summary>${esc(d.nota)}</details>` : ""}
    <div class="sect"><div class="label">Pernoite</div>${lg ? `🛏️ <b>${esc(lg.nome)}</b> <span class="chip ${lg.status === "ideia" ? "" : "ok"}">${STATUS[lg.status] || "Opção"}</span>` : d.pernoite ? `🛏️ ${esc(d.pernoite)}` : `<a href="${link("hospedagem")}">a definir</a>`}</div>
    <div class="quick">
      ${gmapsUrl(d) ? `<a class="qbtn" href="${gmapsUrl(d)}" target="_blank" rel="noopener">${ico("nav")}Navegar</a>` : ""}
      <a class="qbtn" href="${link("mapa", d.id)}">${ico("mapa")}Mapa</a>
      <button class="qbtn" data-t="wxDay" data-id="${d.id}">${ico("tempo")}Tempo</button>
      <a class="qbtn" href="${link("roadbook")}">${ico("roadbook")}Roadbook</a>
    </div>
  </div>`;
}
function vInicio() {
  const ds = days(), f = focusDay(), ph = phase(), st = settlement();
  const pend = Object.values(TD().meta || {}).filter(m => m.kind === "pend" && !m.done).length;
  const ck = riderIds().map(u => { const it = TD().checklist?.[u]?.items || []; return { u, pct: it.length ? Math.round(it.filter(x => x.done).length / it.length * 100) : null }; });
  return `<div class="view">
    ${signHTML()}
    ${!ds.length ? `<div class="card"><h3>Comece pelo roteiro</h3><p class="muted" style="margin:0">Monte os dias da viagem: de onde sai, para onde vai e por onde passa. O app calcula os km, as horas de estrada, o tempo e onde abastecer.</p><a class="btn primary" href="${link("roteiro")}">Montar o roteiro</a></div>`
      : f ? dayPreview(f, ph === "durante" && f.date === todayISO() ? "Hoje" : ph === "antes" ? "Prévia do dia 1" : f.date > todayISO() ? "Próximo dia" : "Último dia") : ""}
    <div class="stats">
      ${ck.map(c => `<a class="stat" href="${link("checklist", c.u)}"><div class="v">${c.pct == null ? "—" : c.pct + "%"}</div><div class="k">checklist ${esc(rname(c.u))}</div></a>`).join("")}
      <a class="stat" href="${link("gastos")}"><div class="v sm">${brl(st.total)}</div><div class="k">gastos divididos</div></a>
      <a class="stat" href="${link("pendencias")}"><div class="v">${pend}</div><div class="k">pendências abertas</div></a>
    </div>
    ${maisGrid()}
  </div>`;
}
function maisGrid() {
  return `<div class="tiles">${SECTIONS.filter(s => !s[3]).map(([k, l, i]) => `<a class="tile" href="${link(k)}">${ico(i)}<span>${l}</span></a>`).join("")}<a class="tile" href="#pilotos/${trip.id}">${ico("pilotos")}<span>Pilotos e convite</span></a></div>`;
}
function vMais() { return `<div class="view"><h2>Mais</h2>${maisGrid()}</div>`; }

/* =========================== ROTEIRO =========================== */
function dayCard(d) {
  const lg = lodgingFor(d), road = isRoad(d), names = stopNames(d), route = hasRoute(d);
  const late = trip.fim && d.date && d.date > trip.fim;
  return `<article class="dcard" id="d-${d.id}" style="--dc:${dayColor(d)}">
    <header><span class="dn">${d.n}</span><div><b>${d.date ? `${WDL[parseISO(d.date).getDay()]}, ${fmtD(d.date)}` : "Dia " + d.n}</b><small>${TIPO[d.tipo || "estrada"]}${late ? " · depois da volta marcada" : ""}</small></div>
      <button class="ibtn" data-t="dayMenu" data-id="${d.id}" aria-label="Opções do dia">⋯</button></header>
    <h3>${esc(dayTitle(d))}</h3>
    ${names.length > (road ? 2 : 1) ? `<div class="via">${names.map(esc).join(' <span class="arr">→</span> ')}</div>` : ""}
    ${pontosHTML(d)}
    ${route || d.saida || dayKm(d) ? `<div class="kvline">${route && !dayKm(d) ? `<span class="muted">${d.geo?.miss?.length && d.geo.sig === sigOf(d) ? "sem rota: faltam pontos no mapa" : navigator.onLine ? "calculando a rota…" : "sem internet para calcular a rota"}</span>${d.saida ? " · " + timeLine(d) : ""}` : timeLine(d)}</div>` : road ? `<div class="kvline"><span class="muted">informe saída e destino</span></div>` : ""}
    ${extrasHTML(d) ? `<div>${extrasHTML(d)}</div>` : ""}
    ${isLong(d) ? `<div class="chip warn">⚠ Dia longo: ${dur(dayHours(d))} de estrada. Vale dividir em dois dias ou sair mais cedo.</div>` : ""}<div data-late></div>
    ${d.geo?.miss?.length && d.geo.sig === sigOf(d) ? `<div class="chip warn">⚠ Não achei no mapa: ${d.geo.miss.map(esc).join(", ")}. Confira a escrita (ex.: “Sousa - PB”); a rota segue sem ${d.geo.miss.length > 1 ? "esses pontos" : "esse ponto"}.</div>` : ""}
    <div class="wxrow" data-wx="${d.id}"></div>
    ${route ? `<div class="sect"><div class="label">Abastecimento</div><div class="small" data-fuel="${d.id}" data-compact="1"><span class="muted">…</span></div></div>` : ""}
    ${d.nota ? `<details class="dnote"><summary>Observações</summary>${esc(d.nota)}</details>` : ""}
    <div class="sect"><div class="label">Pernoite</div>${lg ? `🛏️ <b>${esc(lg.nome)}</b> <span class="chip ${lg.status === "ideia" ? "" : "ok"}">${STATUS[lg.status] || "Opção"}</span>` : d.pernoite ? `🛏️ ${esc(d.pernoite)}` : `<a href="${link("hospedagem")}" class="small">a definir</a>`}</div>
    <footer>
      ${gmapsUrl(d) ? `<a class="btn sm" href="${gmapsUrl(d)}" target="_blank" rel="noopener">Google Maps</a>` : ""}
      ${route && wazeUrl(d) ? `<a class="btn sm" href="${wazeUrl(d)}" target="_blank" rel="noopener">Waze</a>` : ""}
      ${route ? `<a class="btn sm" href="${link("mapa", d.id)}">Mapa</a>` : ""}
      <button class="btn sm" data-t="wxDay" data-id="${d.id}">Tempo</button>
      <button class="btn sm" data-t="editDay" data-id="${d.id}">Editar</button>
    </footer>
  </article>`;
}
function dayRow(d) {
  const sub = [TIPO[d.tipo || "estrada"], d.saida ? "saída " + hhmm(toH(d.saida)) : "", isRoad(d) && dayArrive(d) != null ? "chegada ~" + hhmm(dayArrive(d)) : "", d.trilha ? "trilha " + d.trilha : ""].filter(Boolean).join(" · ");
  return `<button class="drow" data-t="openDay" data-id="${d.id}" style="--dc:${dayColor(d)}">
    <span class="dd"><b>${d.date ? parseISO(d.date).getDate() : d.n}</b><small>${d.date ? WD[parseISO(d.date).getDay()] : "dia"}</small></span>
    <span class="dt"><b>${esc(dayTitle(d))}</b><small>${esc(sub)}</small></span>
    <span class="dk">${dayKm(d) ? num(dayKm(d)) + " km" : ""}</span></button>`;
}
function vRoteiro() {
  const ds = days(), span = trip.inicio && trip.fim ? diffDays(trip.inicio, trip.fim) + 1 : null, compact = ls.get("rtView", "cards") === "lista";
  const kmT = ds.reduce((s, d) => s + (dayKm(d) || 0), 0), kmR = ds.filter(isRoad).reduce((s, d) => s + (dayKm(d) || 0), 0), hT = kmR / avgSpeed();
  const nRoad = ds.filter(isRoad).length;
  setTimeout(computeMissing, 50);
  return `<div class="view">
    <div class="between"><h2>Roteiro</h2><div class="row"><div class="seg sm">${[["cards", "Detalhado"], ["lista", "Lista"]].map(([k, l]) => `<button type="button" data-t="rtView" data-v="${k}" aria-pressed="${(compact ? "lista" : "cards") === k}">${l}</button>`).join("")}</div><button class="btn sm" data-t="routeCfg">Média ${num(avgSpeed())} km/h</button></div></div>
    ${ds.length ? `<div class="stats">
      <div class="stat"><div class="v">${ds.length}</div><div class="k">${ds.length === 1 ? "dia" : "dias"}${span && span !== ds.length ? ` (viagem tem ${span})` : ""} · ${nRoad} de estrada</div></div>
      <div class="stat"><div class="v">${kmT ? num(kmT) : "—"}</div><div class="k">km de moto na viagem</div></div>
      <div class="stat"><div class="v">${kmR ? dur(hT) : "—"}</div><div class="k">de estrada nos dias de viagem</div></div>
    </div>` : `<div class="card"><h3>Monte os dias</h3><p class="muted" style="margin:0">${span ? `A viagem vai de ${fmtDW(trip.inicio)} a ${fmtDW(trip.fim)}: ${span} ${span === 1 ? "dia" : "dias"}. Crie todos de uma vez e depois preencha cada um.` : "Sem datas de ida e volta, os dias ficam numerados. Dá para pôr as datas depois em Editar viagem."}</p>
      ${span ? `<button class="btn primary" data-t="makeDays">Criar os ${span} dias</button>` : ""}</div>`}
    <div class="${compact ? "drows" : "dlist"}">${ds.map(compact ? dayRow : dayCard).join("")}</div>
    <button class="btn block" data-t="addDay">+ Adicionar dia</button>
    <p class="muted small" style="margin:0">Km pela estrada (OSRM, dados do OpenStreetMap) a partir das cidades do caminho, ou o km que você digitar. As horas usam a média de ${num(avgSpeed())} km/h, já contando paradas rápidas. Confira antes de sair.</p>
  </div>`;
}
function dayForm(d, isNew, afterIdx) {
  const prev = isNew ? days()[afterIdx] : null;
  d = d || { id: newId(), tipo: "estrada", origem: prev ? dayPlace(prev) : trip.origem || "", destino: "", via: "", saida: "06:00", pernoite: "", nota: "", gmaps: "" };
  const tipo = d.tipo || "estrada";
  openSheet(`<h3>${isNew ? "Novo dia" : `Dia ${d.n}${d.date ? " · " + fmtDW(d.date) : ""}`}</h3>
    <form id="dF">
      <div class="seg" id="dTipo">${Object.entries(TIPO).map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${tipo === k}">${k === "estrada" ? "Estrada" : l}</button>`).join("")}</div>
      <label class="field"><span>Título</span><input id="dTi" value="${esc(d.titulo || "")}" placeholder="Ex.: Circuito 2 · Cachoeira da Fumaça e Vale do Capão"><small class="road-only">Opcional: sem título, aparece “saída → destino”.</small></label>
      <div class="field"><span>Cor do dia</span><div class="colors" id="dCor">${DAY_COLORS.map(([k, hex]) => `<button type="button" data-v="${k}" style="--c:${hex}" aria-pressed="${(d.cor || "") === k}" title="${k}"></button>`).join("")}<button type="button" data-v="" aria-pressed="${!d.cor}" class="auto">auto</button></div><small>Uma cor por circuito ajuda a achar o dia no roteiro e no mapa.</small></div>
      <div class="grid2 road-only"><label class="field"><span>Saída de</span><input id="dO" value="${esc(d.origem || "")}" placeholder="Cidade - UF"></label>
      <label class="field"><span>Destino</span><input id="dD" value="${esc(d.destino || "")}" placeholder="Cidade - UF"></label></div>
      <label class="field base-only"><span>Cidade base</span><input id="dB" value="${esc(d.tipo !== "estrada" ? d.origem || "" : "")}" placeholder="Onde vocês estão hospedados"></label>
      <label class="field not-rest"><span id="lbV">Passando por</span><textarea id="dV" rows="2" placeholder="Sousa · Cajazeiras · Salgueiro">${esc(d.via || "")}</textarea><small id="hV">Separe com vírgula ou “·”. A rota no mapa, os km, o tempo no caminho e o abastecimento seguem estas cidades. Use “Cidade - UF” para não confundir com outra de mesmo nome. Nota entre parênteses é ignorada.</small></label>
      <div class="grid2"><label class="field"><span>Horário de saída</span><input id="dS" type="time" value="${esc(d.saida || "")}"></label>
      <label class="field"><span>Km de moto</span><input id="dK" inputmode="numeric" value="${d.km ?? ""}" placeholder="${d.geo?.km ? "calculado: " + num(d.geo.km) : "automático"}"></label></div>
      <label class="field not-rest"><span>Link do Google Maps</span><input id="dG" value="${esc(d.gmaps || "")}" placeholder="https://maps.app.goo.gl/…"><small>Monte a rota no Google Maps do jeito que vocês vão, toque em Compartilhar e cole aqui. O botão Navegar abre exatamente essa rota.</small></label>
      <label class="field not-road"><span id="lbPo">O que tem no dia</span><input id="dPo" value="${esc(d.pontos || "")}" placeholder="Poço do Diabo · Cachoeira do Mosquito · Pai Inácio"></label>
      <div class="grid2 not-rest"><label class="field"><span>Trilha a pé</span><input id="dTr" value="${esc(d.trilha || "")}" placeholder="Ex.: 12 km · 5 a 6 h"></label>
      <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="dTe" ${d.terra ? "checked" : ""}> Tem trecho de terra</label></div>
      <label class="field"><span>Pernoite</span><input id="dP" value="${esc(d.pernoite || "")}" placeholder="Cidade ou pousada (detalhes em Hospedagem)"></label>
      <label class="field"><span>Observações</span><textarea id="dN" rows="4">${esc(d.nota || "")}</textarea></label>
      <p class="err" id="dErr" hidden></p>
      <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="dDel">Apagar dia</button>`}<button class="btn primary">Salvar</button></div>
    </form>`, sh => {
    let t = tipo, cor = d.cor || "";
    const setT = v => { t = v; sh.querySelectorAll("#dTipo button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
      const rd = v === "estrada" || v === "misto";
      sh.querySelectorAll(".road-only").forEach(e => e.hidden = !rd); sh.querySelectorAll(".not-road").forEach(e => e.hidden = v === "estrada"); sh.querySelectorAll(".base-only").forEach(e => e.hidden = rd); sh.querySelectorAll(".not-rest").forEach(e => e.hidden = v === "descanso");
      sh.querySelector("#lbV").textContent = rd ? "Passando por" : "Caminho do passeio (cidades e lugares, na ordem)";
      sh.querySelector("#dV").placeholder = rd ? "Sousa · Cajazeiras · Salgueiro" : "Lençóis · Palmeiras · Vale do Capão · Lençóis";
      sh.querySelector("#lbPo").textContent = v === "misto" ? "Passeio na chegada" : "O que tem no dia"; };
    setT(t); sh.querySelectorAll("#dTipo button").forEach(b => b.addEventListener("click", () => setT(b.dataset.v)));
    sh.querySelectorAll("#dCor button").forEach(b => b.addEventListener("click", () => { cor = b.dataset.v; sh.querySelectorAll("#dCor button").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
    sh.querySelector("#dF").addEventListener("submit", async e => {
      e.preventDefault();
      const v = id => sh.querySelector(id).value.trim();
      const road = t === "estrada" || t === "misto", rest = t === "descanso";
      const nd = { ...d, tipo: t, cor, titulo: v("#dTi"), origem: road ? v("#dO") : v("#dB"), destino: road ? v("#dD") : "", via: rest ? "" : v("#dV"),
        saida: v("#dS"), km: parseNum(v("#dK")), gmaps: rest ? "" : v("#dG"), pontos: t === "estrada" ? "" : v("#dPo"), trilha: rest ? "" : v("#dTr"), terra: !rest && sh.querySelector("#dTe").checked,
        pernoite: v("#dP"), nota: v("#dN") };
      if (road && (!nd.origem || !nd.destino)) { const er = sh.querySelector("#dErr"); er.textContent = "Informe a saída e o destino."; er.hidden = false; return; }
      ["i", "n", "date"].forEach(k => delete nd[k]);
      const list = days();
      if (isNew) list.splice(afterIdx + 1, 0, nd); else list[d.i] = { ...list[d.i], ...nd };
      saveDays(list); closeSheet(); toast(isNew ? "Dia criado" : "Dia salvo");
      const cur = days().find(x => x.id === nd.id);
      if (cur && hasRoute(cur)) {
        const g = await computeDay(cur); redraw();
        const now = days().find(x => x.id === nd.id);
        if (g && now && isLong(now)) longDaySheet(now);
      } else redraw();
    });
    const del = sh.querySelector("#dDel");
    if (del) armed(del, "Toque de novo para apagar", () => { const list = days().filter(x => x.id !== d.id); saveDays(list); closeSheet(); toast("Dia apagado"); redraw(); });
  });
}
// Ideia do Irineu: avisar quando o dia passa da conta
function longDaySheet(d) {
  openSheet(`<h3>Esse dia dá ${dur(dayHours(d))} de estrada</h3>
    <p style="margin:0">${esc(dayTitle(d))}: <b>${num(dayKm(d))} km</b> a ${num(avgSpeed())} km/h de média.${dayArrive(d) != null ? ` Saindo ${hhmm(toH(d.saida))}, chega por volta de <b>${hhmm(dayArrive(d))}</b>.` : ""}</p>
    <p class="muted" style="margin:0">Acima de ${LONG_H} horas o cansaço pesa e aumenta o risco, principalmente no fim da tarde. Tem certeza?</p>
    <div class="actions"><button class="btn" data-t="splitDay" data-id="${d.id}">Dividir em dois dias</button><button class="btn primary" data-close="1">Manter assim</button></div>`);
}
function splitDay(d) {
  const st = dayStops(d), half = (dayKm(d) || 0) / 2;
  const mid = st.slice(1, -1).sort((a, b) => Math.abs(a.km - half) - Math.abs(b.km - half))[0];
  const list = days(), cur = list[d.i];
  const names = stopNames(d), midName = mid?.name || "";
  const vias = viaList(d), k = midName ? vias.indexOf(midName) : -1;
  const first = { ...cur, destino: midName || "a definir", via: k > 0 ? vias.slice(0, k).join(", ") : "", km: null, geo: null, gmaps: "" };
  const second = { id: newId(), tipo: "estrada", origem: midName || "a definir", destino: cur.destino, via: k >= 0 ? vias.slice(k + 1).join(", ") : "", saida: cur.saida, pernoite: cur.pernoite, nota: "", gmaps: "" };
  first.pernoite = midName; list.splice(d.i, 1, first, second); saveDays(list); closeSheet();
  toast(midName ? `Dividido em ${midName}` : "Dia dividido: escolha onde dormir"); redraw();
  setTimeout(() => days().slice(d.i, d.i + 2).forEach(x => computeDay(x, true).then(() => redraw())), 50);
  if (!midName) setTimeout(() => dayForm(days()[d.i]), 300);
}
function dayMenu(d) {
  openSheet(`<h3>Dia ${d.n}${d.date ? " · " + fmtDW(d.date) : ""}</h3>
    <div class="menu-list">
      <button data-t="editDay" data-id="${d.id}">${ico("editar")}Editar</button>
      <button data-t="addAfter" data-id="${d.id}">${ico("mais")}Inserir um dia depois deste</button>
      ${d.i > 0 ? `<button data-t="moveDay" data-id="${d.id}" data-v="-1">${ico("cima")}Passar para antes</button>` : ""}
      ${d.i < days().length - 1 ? `<button data-t="moveDay" data-id="${d.id}" data-v="1">${ico("baixo")}Passar para depois</button>` : ""}
      ${hasRoute(d) ? `<button data-t="recalc" data-id="${d.id}">${ico("roteiro")}Recalcular a rota</button>` : ""}
    </div>
    <p class="muted small" style="margin:0">As datas seguem a ordem dos dias a partir da ida.</p>
    <div class="actions"><button class="btn" data-close="1">Fechar</button></div>`);
}
function routeCfg() {
  openSheet(`<h3>Média de velocidade</h3><p class="muted" style="margin:0">Usada para calcular as horas de estrada e o horário de chegada. Conte as paradas rápidas: em moto, 60 a 70 km/h costuma ser realista na estrada.</p>
    <form id="rcF"><label class="field"><span>Média (km/h)</span><input id="rcV" inputmode="numeric" value="${avgSpeed()}"></label>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#rcF").addEventListener("submit", e => { e.preventDefault(); const v = parseNum(sh.querySelector("#rcV").value); if (!v || v < 20 || v > 130) return toast("Use um valor entre 20 e 130 km/h");
      trip.avgSpeed = v; store.updateTrip(trip.id, { avgSpeed: v }).catch(() => {}); closeSheet(); redraw(); });
  });
}

/* ---------- tempo de um dia (folha) ---------- */
async function wxSheet(d) {
  openSheet(`<h3>Tempo · ${esc(dayTitle(d))}</h3><p class="muted" style="margin:0">${d.date ? fmtDW(d.date) : "Dia sem data"}</p><div id="wxBox"><p class="muted">Carregando…</p></div><div class="actions"><button class="btn" data-close="1">Fechar</button></div>`, async sh => {
    const box = sh.querySelector("#wxBox");
    if (!d.date) { box.innerHTML = `<p class="muted">Ponha a data de ida em Editar viagem para ver o tempo.</p>`; return; }
    const W = await dayWx(d); if (!box.isConnected) return;
    if (!W) { box.innerHTML = `<p class="muted">${navigator.onLine ? "Não achei o lugar deste dia. Confira o nome da cidade (ex.: Sousa - PB)." : "Sem internet agora."}</p>`; return; }
    const { plan, day, typ, loc } = W; let html = "";
    if (plan.kind === "ref") {
      html += `<div class="note">A previsão sai ${fmtD(plan.availableFrom)} (15 dias antes). Até lá, o clima típico do lugar nessa data.</div>`;
      if (typ) html += `<div class="wxbig">${wxInfo(typ.rainy >= 3 ? 61 : 2).icon}<div><b>~${tC(typ.tmax)} / ${tC(typ.tmin)}</b><small>média dos últimos ${typ.n} anos · choveu em ${typ.rainy} deles</small></div></div>
        <div class="years">${typ.years.map(y => `<span>${y.y}: ${wxInfo(y.code).icon} ${tC(y.tmax)} · ${y.rain >= 1 ? num(y.rain, 0) + " mm" : "sem chuva"}</span>`).join("")}</div>`;
      if (day) html += `<div class="label">Mesmo dia do ano passado, hora a hora</div>${hoursHTML(day)}`;
    } else if (day) {
      const i = wxInfo(day.code);
      html += `<div class="wxbig">${i.icon}<div><b>${tC(day.tmax)} / ${tC(day.tmin)} · ${i.text}</b><small>${day.prob != null ? `chuva ${day.prob}% · ` : ""}${num(day.rain || 0, 1)} mm · vento ${Math.round(day.wind || 0)} km/h${day.dir != null ? " do " + windFrom(day.dir) : ""}${day.gust ? ` · rajadas ${Math.round(day.gust)}` : ""}${day.uv != null ? ` · UV ${Math.round(day.uv)}` : ""}</small><small>☀️ ${day.sunrise || "—"} · 🌙 ${day.sunset || "—"}</small></div></div>
        <div class="label">Em ${esc(loc.name)}, hora a hora</div>${hoursHTML(day)}`;
    }
    if (hasRoute(d) && d.geo?.pts?.length > 1 && plan.kind !== "ref") html += `<div class="label" style="margin-top:6px">No caminho, na hora em que vocês passam</div><div id="wxRoute" class="routewx"><p class="muted small">Carregando…</p></div>`;
    html += `<p class="muted small" style="margin:0">Tempo: Open-Meteo (CC BY 4.0).</p>`;
    box.innerHTML = html;
    const rb = box.querySelector("#wxRoute");
    if (rb) {
      const st = dayStops(d);
      const rows = await Promise.all(st.map(async s => { const w = await wxDay(s.lat, s.lng, plan); const h = w?.hours?.find(x => x.h === Math.min(23, Math.round(s.eta))); return { s, h }; }));
      if (rb.isConnected) rb.innerHTML = rows.map(({ s, h }) => `<div class="rw"><b>${hhmm(s.eta)}</b><span>${esc(s.name)} <small class="muted">km ${num(s.km)}</small></span><span>${h ? `${wxInfo(h.code, !h.day).icon} ${tC(h.t)}${h.prob != null ? ` · ${h.prob}%` : h.rain ? ` · ${num(h.rain, 1)} mm` : ""}${h.gust >= 45 ? ` · rajadas ${Math.round(h.gust)}` : ""}` : "—"}</span></div>`).join("");
    }
  });
}
function hoursHTML(day) {
  const hs = (day.hours || []).filter(h => h.h >= 5 && h.h <= 21);
  return `<div class="hours">${hs.map(h => `<div class="hr"><small>${pad(h.h)}h</small><span>${wxInfo(h.code, !h.day).icon}</span><b>${tC(h.t)}</b><small>${h.prob != null ? h.prob + "%" : h.rain ? num(h.rain, 1) : ""}</small></div>`).join("")}</div>`;
}
function vTempo() {
  const ds = days();
  return `<div class="view">${back()}<h2>Tempo</h2>
    <p class="muted" style="margin:0">Previsão até 15 dias antes; antes disso, o clima típico do lugar na mesma data (últimos 5 anos). Toque num dia para ver hora a hora e o tempo no caminho.</p>
    ${ds.length ? `<div class="wxlist">${ds.map(d => `<button class="wxitem" data-t="wxDay" data-id="${d.id}"><span class="dn">${d.n}</span><div><b>${d.date ? fmtDW(d.date) : "Dia " + d.n}</b><small>${esc(dayTitle(d))}</small></div><div data-wx="${d.id}" class="small"><span class="muted">…</span></div></button>`).join("")}</div>` : `<div class="card"><p class="muted" style="margin:0">Monte o roteiro primeiro.</p><a class="btn" href="${link("roteiro")}">Ir para o roteiro</a></div>`}
  </div>`;
}

/* =========================== MAPA =========================== */
const PTYPES = { pousada: "Hospedagem", cachoeira: "Cachoeira / rio", mirante: "Mirante / foto", comida: "Comida", posto: "Posto", oficina: "Oficina / borracharia", perigo: "Atenção na estrada", cidade: "Cidade", ponto: "Outro" };
let mapView = null, mapDay = "all";
const mapStyle = () => ls.get("mapStyle", "padrao");
function vMapa(extra) {
  if (extra) mapDay = extra; else if (!days().some(d => d.id === mapDay)) mapDay = "all";
  const ds = days().filter(d => hasRoute(d) && d.geo?.pts);
  return `<div class="view mapview">
    <div class="between"><h2>Mapa</h2><div class="seg sm" id="mStyle">${[["padrao", "Padrão"], ["relevo", "Relevo"], ["escuro", "Escuro"]].map(([k, l]) => `<button type="button" data-t="mapStyle" data-v="${k}" aria-pressed="${mapStyle() === k}">${l}</button>`).join("")}</div></div>
    <div class="chips"><button class="chipb" data-t="mapDay" data-v="all" aria-pressed="${mapDay === "all"}">Toda a viagem</button>${ds.map(d => `<button class="chipb" data-t="mapDay" data-v="${d.id}" aria-pressed="${mapDay === d.id}"><i class="cdot" style="--c:${dayColor(d)}"></i>Dia ${d.n}</button>`).join("")}</div>
    <div id="map" class="map"><p class="muted center pad">Carregando o mapa…</p></div>
    <div class="row"><button class="btn sm" data-t="mapAdd">+ Marcar ponto</button><span class="muted small">ou segure o dedo (clique direito) no mapa</span></div>
    <div id="mapInfo"></div>
  </div>`;
}
async function mountMap() {
  const el = $("#map"); if (!el) return;
  let L; try { L = await ensureLeaflet(); } catch (e) { el.innerHTML = `<p class="muted center pad">${esc(e.message)}</p>`; return; }
  if (!el.isConnected) return; el.innerHTML = "";
  mapView = new MapView(L, el, { style: mapStyle(), onPin: id => pinSheet(id), onPlace: ll => pointForm(null, ll) });
  updateMap();
}
async function updateMap() {
  if (!mapView || !mapView.alive()) return;
  const ds = days().filter(d => hasRoute(d) && d.geo?.pts && (mapDay === "all" || d.id === mapDay));
  const pts = [];
  ds.forEach(d => { const a = d.geo.pts[0], b = d.geo.pts[d.geo.pts.length - 1];
    const loop = distKm(a, b) < 3;
    if (!loop) pts.push({ id: "s" + d.id, lat: a.lat, lng: a.lng, color: "#0b6b3a", type: "saida", name: a.name });
    pts.push({ id: "c" + d.id, lat: b.lat, lng: b.lng, color: dayColor(d), type: loop ? "mirante" : "chegada", name: loop ? dayTitle(d) : b.name, order: d.n }); });
  Object.entries(TD().points || {}).forEach(([id, p]) => { if (p.lat != null && (mapDay === "all" || !p.dayId || p.dayId === mapDay)) pts.push({ id: "p" + id, lat: p.lat, lng: p.lng, color: p.type === "perigo" ? "#e8590c" : "#1d4ed8", type: p.type, name: p.name }); });
  const key = mapDay + "|" + ds.map(d => d.geo.sig).join(";");
  mapView.setPoints(pts, key);
  const lines = await Promise.all(ds.map(dayLine));
  if (!mapView.alive()) return;
  mapView.setRoutes(lines.map((l, i) => l && ({ latlngs: l, color: dayColor(ds[i]) })).filter(Boolean));
  const info = $("#mapInfo");
  if (info) { const km = ds.reduce((s, d) => s + (dayKm(d) || 0), 0);
    info.innerHTML = ds.length ? `<div class="card"><div class="between"><b>${mapDay === "all" ? "Toda a viagem" : esc(dayTitle(ds[0]))}</b><span class="tag-y">${num(km)} km</span></div>
      ${mapDay !== "all" ? `<div class="row">${gmapsUrl(ds[0]) ? `<a class="btn sm" href="${gmapsUrl(ds[0])}" target="_blank" rel="noopener">Abrir no Google Maps</a>` : ""}${wazeUrl(ds[0]) ? `<a class="btn sm" href="${wazeUrl(ds[0])}" target="_blank" rel="noopener">Waze</a>` : ""}</div>` : ""}
      <p class="muted small" style="margin:0">A linha segue as cidades do caminho, na cor do dia. Bandeira verde: saída; colorida: chegada. Para a rota exata do Google, use o botão do Google Maps.</p></div>`
      : `<div class="card"><p class="muted" style="margin:0">Nenhum dia de estrada com rota ainda. Monte o roteiro e o caminho aparece aqui.</p></div>`; }
  if (mapDay === "all" && !ds.length) mapView.map.setView([-14.2, -51.9], 4);
}
function pinSheet(pid) {
  if (pid.startsWith("p")) { const id = pid.slice(1), p = TD().points?.[id]; if (!p) return;
    openSheet(`<h3>${esc(p.name)}</h3><p class="muted" style="margin:0">${PTYPES[p.type] || "Ponto"}${p.dayId ? ` · Dia ${days().find(d => d.id === p.dayId)?.n || ""}` : ""}</p>${p.nota ? `<p style="margin:0">${esc(p.nota)}</p>` : ""}
      <div class="row"><a class="btn sm" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Navegar até aqui</a><button class="btn sm" data-t="editPoint" data-id="${id}">Editar</button></div>
      <div class="actions"><button class="btn" data-close="1">Fechar</button></div>`); return; }
  const d = days().find(x => x.id === pid.slice(1)); if (!d) return;
  openSheet(`<h3>Dia ${d.n} · ${esc(dayTitle(d))}</h3><p class="muted" style="margin:0">${d.date ? fmtDW(d.date) : ""}${dayKm(d) ? ` · ${num(dayKm(d))} km` : ""}</p>
    <div class="row"><a class="btn sm" href="${link("roteiro")}#d-${d.id}">Ver no roteiro</a>${gmapsUrl(d) ? `<a class="btn sm" href="${gmapsUrl(d)}" target="_blank" rel="noopener">Google Maps</a>` : ""}</div>
    <div class="actions"><button class="btn" data-close="1">Fechar</button></div>`);
}
function pointForm(id, ll) {
  const p = id ? TD().points?.[id] : { name: "", type: "ponto", nota: "", dayId: mapDay !== "all" ? mapDay : "", lat: ll?.lat, lng: ll?.lng };
  openSheet(`<h3>${id ? "Editar ponto" : "Novo ponto no mapa"}</h3>
    <form id="pF"><label class="field"><span>Nome</span><input id="pN" value="${esc(p.name)}" required placeholder="Ex.: Mirante da serra"></label>
    <div class="grid2"><label class="field"><span>Tipo</span><select id="pT">${Object.entries(PTYPES).map(([k, l]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field"><span>Dia</span><select id="pD"><option value="">Qualquer dia</option>${days().map(d => `<option value="${d.id}" ${p.dayId === d.id ? "selected" : ""}>Dia ${d.n}${d.date ? " · " + fmtD(d.date) : ""}</option>`).join("")}</select></label></div>
    <label class="field"><span>Observação</span><textarea id="pO" rows="2">${esc(p.nota || "")}</textarea></label>
    ${p.lat == null ? `<p class="note">Depois de salvar, toque no mapa no lugar do ponto.</p>` : ""}
    <div class="actions">${id ? `<button type="button" class="btn danger" id="pDel">Apagar</button>` : `<button type="button" class="btn" data-close="1">Cancelar</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#pF").addEventListener("submit", e => { e.preventDefault();
      const data = { name: sh.querySelector("#pN").value.trim(), type: sh.querySelector("#pT").value, dayId: sh.querySelector("#pD").value, nota: sh.querySelector("#pO").value.trim(), lat: p.lat ?? null, lng: p.lng ?? null, by: me() };
      if (!data.name) return;
      const save = d2 => { if (id) store.put("points", id, d2).catch(() => {}); else store.add("points", d2).catch(() => {}); };
      closeSheet();
      if (data.lat == null && mapView) { toast("Toque no mapa onde fica o ponto"); mapView.startPlacing(ll2 => { save({ ...data, lat: +ll2.lat.toFixed(5), lng: +ll2.lng.toFixed(5) }); toast("Ponto marcado"); }); }
      else { save(data); toast("Ponto salvo"); }
    });
    const del = sh.querySelector("#pDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("points", id).catch(() => {}); closeSheet(); toast("Ponto apagado"); });
  });
}

/* =========================== ABASTECIMENTO =========================== */
function vAbastecer() {
  const ds = days().filter(hasRoute), kmT = ds.reduce((s, d) => s + (dayKm(d) || 0), 0), price = Number(trip.gasPrice) || null;
  return `<div class="view">${back()}<div class="between"><h2>Abastecimento</h2><button class="btn sm" data-t="gasPrice">${price ? brl(price) + "/L" : "Preço da gasolina"}</button></div>
    <div class="stats">${riderIds().map(u => { const c = fuelCons(u), aut = autonomy(u), L = c ? kmT / c : null;
      return `<div class="stat"><div class="v sm">${aut ? "~" + num(aut) + " km" : "—"}</div><div class="k"><b>${esc(rname(u))}</b> · ${c ? num(c, 1) + " km/L" + (realCons(u) ? " real" : "") : "sem consumo"}${L ? ` · ~${num(L)} L${price ? " · " + brl(L * price) : ""} na viagem` : ""}</div></div>`; }).join("")}</div>
    ${riderIds().some(u => !autonomy(u)) ? `<div class="note">Para calcular as paradas, cada piloto informa consumo e tanque em <a href="#pilotos/${trip.id}">Minha moto</a>.</div>` : ""}
    ${ds.length ? ds.map(d => `<div class="card"><div class="between"><b>Dia ${d.n} · ${esc(dayTitle(d))}</b><span class="muted small">${dayKm(d) ? num(dayKm(d)) + " km" : ""}</span></div>
      <div data-fuel="${d.id}"><span class="muted small">calculando…</span></div></div>`).join("") : `<div class="card"><p class="muted" style="margin:0">Nenhum dia de estrada no roteiro ainda.</p></div>`}
    <p class="muted small" style="margin:0">Saindo de tanque cheio e guardando 20% de reserva. Postos a até 2 km da estrada, do OpenStreetMap (Overpass API): a lista pode estar incompleta, e posto pode fechar. No sertão e em trecho de serra, abasteça quando puder.</p>
  </div>`;
}
function gasPriceSheet() {
  openSheet(`<h3>Preço da gasolina</h3><p class="muted" style="margin:0">Para estimar quanto cada um vai gastar de combustível na viagem.</p>
    <form id="gpF"><label class="field"><span>R$ por litro</span><input id="gpV" inputmode="decimal" value="${trip.gasPrice ? num(trip.gasPrice, 2) : ""}" placeholder="Ex.: 6,29"></label>
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#gpF").addEventListener("submit", e => { e.preventDefault(); const v = parseNum(sh.querySelector("#gpV").value); trip.gasPrice = v; store.updateTrip(trip.id, { gasPrice: v }).catch(() => {}); closeSheet(); redraw(); });
  });
}

/* =========================== CHECKLIST =========================== */
const CK_TEMPLATE = {
  "Documentos": ["CNH", "Documento da moto (CRLV)", "RG ou passaporte", "Cartão do plano de saúde", "Dinheiro em espécie", "Cartões"],
  "Moto": ["Revisão feita", "Pneus calibrados e com sulco", "Corrente lubrificada e esticada", "Óleo no nível", "Luzes e buzina funcionando", "Freios conferidos"],
  "Ferramentas": ["Kit de ferramentas da moto", "Kit reparo de pneu e bomba (ou CO₂)", "Abraçadeiras e fita", "Lubrificante de corrente", "Lanterna"],
  "Proteção e roupa": ["Capacete", "Jaqueta", "Luvas", "Botas", "Capa de chuva", "Segunda pele / frio", "Roupas", "Chinelo"],
  "Saúde": ["Remédios de uso contínuo", "Analgésico e antialérgico", "Protetor solar e labial", "Curativos", "Repelente"],
  "Eletrônicos": ["Celular e carregador", "Suporte de celular", "Carregador na moto (USB)", "Power bank", "Intercomunicador", "Câmera"],
};
let ckView = null;
const ckItems = u => TD().checklist?.[u]?.items || [];
const saveCk = (items) => store.put("checklist", me(), { items, rider: me() }).catch(() => toast("Salvo no aparelho; envia quando a internet voltar"));
function vChecklist(extra) {
  const u = extra && riderIds().includes(extra) ? extra : (ckView && riderIds().includes(ckView) ? ckView : me()); ckView = u;
  const items = ckItems(u), mine = u === me(), done = items.filter(x => x.done).length;
  const cats = [...new Set(items.map(x => x.cat || "Outros"))];
  return `<div class="view narrow"><div class="between"><h2>Checklist</h2>${mine && items.length ? `<span class="tag-y">${done}/${items.length}</span>` : ""}</div>
    ${riderIds().length > 1 ? `<div class="seg">${riderIds().map(r => `<button type="button" data-t="ckWho" data-v="${r}" aria-pressed="${r === u}">${esc(rname(r))}</button>`).join("")}</div>` : ""}
    ${items.length ? `<div class="bar"><i style="width:${Math.round(done / items.length * 100)}%"></i></div>` : ""}
    ${!items.length ? `<div class="card"><p class="muted" style="margin:0">${mine ? "Sua lista está vazia. Comece com a lista pronta (documentos, moto, ferramentas, roupa, saúde, eletrônicos) e ajuste do seu jeito." : esc(rname(u)) + " ainda não montou a lista."}</p>${mine ? `<button class="btn primary" data-t="ckTemplate">Usar a lista pronta</button>` : ""}</div>` : ""}
    ${cats.map(c => `<div class="card ck"><h3>${esc(c)}</h3>${items.filter(x => (x.cat || "Outros") === c).map(x => `<label class="ckrow ${x.done ? "done" : ""}"><input type="checkbox" ${mine ? `data-t="ckToggle" data-id="${x.id}"` : "disabled"} ${x.done ? "checked" : ""}><span>${esc(x.txt)}</span>${mine ? `<button type="button" class="ibtn sm" data-t="ckDel" data-id="${x.id}" aria-label="Tirar da lista">×</button>` : ""}</label>`).join("")}</div>`).join("")}
    ${mine ? `<form id="ckAdd" class="card"><div class="grid2"><input id="ckT" placeholder="Novo item" required><select id="ckC">${[...new Set([...Object.keys(CK_TEMPLATE), ...cats, "Outros"])].map(c => `<option>${esc(c)}</option>`).join("")}</select></div><button class="btn">Adicionar</button></form>` : ""}
  </div>`;
}
function bindChecklist() {
  $("#ckAdd")?.addEventListener("submit", e => { e.preventDefault(); const t = $("#ckT").value.trim(); if (!t) return;
    saveCk([...ckItems(me()), { id: newId(), txt: t, cat: $("#ckC").value, done: false }]); $("#ckT").value = ""; });
}

/* =========================== GASTOS =========================== */
let gTab = "viagem";
const sum = l => l.reduce((s, e) => s + (Number(e.amount) || 0), 0);
function expRow(e, act) {
  const c = catOf(e.cat), chips = [e.fromPrep ? `<span class="chip">da preparação</span>` : "", e._prep ? (e.show ? `<span class="chip ok">exibido</span>` : `<span class="chip">🔒 privado</span>`) : "", e._trip ? `<span class="chip">da viagem</span>` : ""].join("");
  return `<button class="exp" data-t="${act}" data-id="${e.id}"><span class="ei">${c[2]}</span><div><b>${esc(e.desc || c[1])}</b><small>${e.date ? fmtDW(e.date) : ""} · ${esc(c[1])}${act === "viewExp" || e.fromPrep ? " · " + esc(rname(e.rider)) : ""}${e.shared === false && !e.fromPrep && !e._prep ? " · só dele" : ""}${e.litros ? ` · ${num(e.litros, 2)} L` : ""}</small></div><span class="r"><b class="ev">${brl(e.amount)}</b>${chips}</span></button>`;
}
function vGastos() {
  const st = settlement(), ids = riderIds(), u = me();
  const tabs = `<div class="seg"><button type="button" data-t="gTab" data-v="viagem" aria-pressed="${gTab === "viagem"}">Gastos da viagem</button><button type="button" data-t="gTab" data-v="meus" aria-pressed="${gTab === "meus"}">🔒 Meus gastos</button></div>`;
  if (gTab === "meus") {
    const prep = prepList().map(e => ({ ...e, _prep: true })), mineTrip = expenses().filter(e => e.rider === u).map(e => ({ ...e, _trip: true }));
    const list = [...prep, ...mineTrip].sort(byNew);
    const byCat = CATS.map(([k, l, i]) => ({ l, i, v: sum(list.filter(e => catOf(e.cat)[0] === k)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v), max = Math.max(1, ...byCat.map(x => x.v));
    return `<div class="view"><div class="between"><h2>Gastos</h2><div class="row"><label class="btn sm">Importar planilha<input type="file" id="impCsv" accept=".csv,text/csv" hidden></label><button class="btn primary sm" data-t="newPrep">+ Gasto</button></div></div>${tabs}
      <div class="note">🔒 <b>Só você vê esta aba.</b> Ela junta a preparação (pneu, revisão, equipamento…) e o que você pagou na viagem. Para mostrar um gasto da preparação aos outros pilotos, abra e ligue “Exibir para o grupo”: ele aparece em Gastos da viagem, sem entrar na divisão.</div>
      <div class="stats"><div class="stat"><div class="v sm">${brl(sum(prep))}</div><div class="k">preparação</div></div><div class="stat"><div class="v sm">${brl(myCost(u))}</div><div class="k">sua parte na viagem</div></div>
        <div class="stat"><div class="v sm">${brl(sum(prep) + myCost(u))}</div><div class="k">total da expedição para você</div></div><div class="stat"><div class="v sm">${brl(sum(prep.filter(e => e.show)))}</div><div class="k">exibido para o grupo</div></div></div>
      <div class="cols"><div class="col">${byCat.length ? `<div class="card"><h3>Por categoria</h3>${byCat.map(c => `<div class="cbar"><span>${c.i} ${esc(c.l)}</span><i style="width:${Math.round(c.v / max * 100)}%"></i><b>${brl(c.v)}</b></div>`).join("")}</div>` : ""}</div>
      <div class="col"><div class="card"><div class="between"><h3>Lançamentos</h3>${list.length ? `<button class="btn sm" data-t="csvMine">Exportar planilha</button>` : ""}</div>
        ${list.length ? `<div class="exps">${list.map(e => expRow(e, e._prep ? "editPrep" : "editExp")).join("")}</div>` : `<p class="muted" style="margin:0">Nada ainda. Lance aqui o que gastou preparando a moto e o equipamento, ou importe a planilha “Meus gastos” exportada da Expedição Chapada.</p>`}</div></div></div>
    </div>`;
  }
  const list = allExpenses();
  const byCat = CATS.map(([k, l, i]) => ({ k, l, i, v: sum(expenses().filter(e => catOf(e.cat)[0] === k)) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...byCat.map(x => x.v));
  return `<div class="view"><div class="between"><h2>Gastos</h2><button class="btn primary sm" data-t="newExp">+ Gasto</button></div>${tabs}
    <div class="stats">
      <div class="stat"><div class="v sm">${brl(st.total)}</div><div class="k">divididos entre ${ids.length}</div></div>
      <div class="stat"><div class="v sm">${brl(st.share)}</div><div class="k">parte de cada um</div></div>
      <div class="stat"><div class="v sm">${brl(myCost(u))}</div><div class="k">seu custo na viagem (com os só seus)</div></div>
    </div>
    <div class="cols"><div class="col">
    <div class="card"><h3>Acerto de contas</h3>
      ${!st.total ? `<p class="muted" style="margin:0">Nenhum gasto dividido ainda.</p>` : st.moves.length ? st.moves.map(m => `<div class="move"><b>${esc(rname(m.from))}</b> paga <b>${brl(m.v)}</b> a <b>${esc(rname(m.to))}</b></div>`).join("") : `<p style="margin:0">Contas acertadas. ✅</p>`}
      ${ids.length ? `<div class="small muted">${ids.map(r => `${esc(rname(r))} pagou ${brl(sum(expenses().filter(e => e.rider === r && e.shared !== false)))}`).join(" · ")}</div>` : ""}
    </div>
    ${byCat.length ? `<div class="card"><h3>Por categoria</h3>${byCat.map(c => `<div class="cbar"><span>${c.i} ${esc(c.l)}</span><i style="width:${Math.round(c.v / max * 100)}%"></i><b>${brl(c.v)}</b></div>`).join("")}</div>` : ""}
    </div><div class="col">
    <div class="card"><div class="between"><h3>Lançamentos</h3>${list.length ? `<button class="btn sm" data-t="csv">Exportar planilha</button>` : ""}</div>
      ${list.length ? `<div class="exps">${list.map(e => expRow(e, e.rider === u ? (e.fromPrep ? "editPrep" : "editExp") : "viewExp")).join("")}</div>`
      : `<p class="muted" style="margin:0">Lance combustível, hospedagem, comida e pedágio. Gasto dividido entra no acerto; gasto só seu fica fora.</p>`}
    </div></div></div>
  </div>`;
}
const catSelect = (sel, only) => `<select id="eK">${CATS.filter(c => !only || only.includes(c[0]) || c[0] === catOf(sel)[0]).map(([k, l, i]) => `<option value="${k}" ${catOf(sel)[0] === k ? "selected" : ""}>${i} ${l}</option>`).join("")}</select>`;
const SHARED_DEF = ["hospedagem", "passeio", "estacionamento", "combustivel", "alimentacao", "pedagio"];
function expForm(e) {
  const isNew = !e;
  e = e || { cat: "combustivel", amount: "", desc: "", date: todayISO(), shared: true, rider: me() };
  openSheet(`<h3>${isNew ? "Novo gasto da viagem" : "Editar gasto"}</h3>
    <form id="eF">
      <div class="grid2"><label class="field"><span>Categoria</span>${catSelect(e.cat)}</label><label class="field"><span>Valor (R$)</span><input id="eV" inputmode="decimal" value="${e.amount !== "" && e.amount != null ? num(e.amount, 2) : ""}" required placeholder="0,00"></label></div>
      <div class="grid2"><label class="field"><span>Data</span><input id="eD" type="date" value="${esc(e.date || "")}"></label><label class="field"><span>Descrição</span><input id="eT" value="${esc(e.desc || "")}" placeholder="Ex.: posto em Salgueiro"></label></div>
      <div class="fuel-only grid2"><label class="field"><span>Litros</span><input id="eL" inputmode="decimal" value="${e.litros != null ? num(e.litros, 2) : ""}"></label>
      <label class="field"><span>Hodômetro (km)</span><input id="eO" inputmode="numeric" value="${e.odo ?? ""}"></label></div>
      <label class="check fuel-only"><input type="checkbox" id="eC" ${e.cheio !== false ? "checked" : ""}> Tanque cheio <small class="muted">(com hodômetro, entra no consumo real)</small></label>
      <label class="check"><input type="checkbox" id="eS" ${e.shared !== false ? "checked" : ""}> Dividir com todos os pilotos</label>
      <p class="err" id="eErr" hidden></p>
      <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="eDel">Apagar</button>`}<button class="btn primary">Salvar</button></div>
    </form>`, sh => {
    const K = sh.querySelector("#eK"), setC = () => { sh.querySelectorAll(".fuel-only").forEach(x => x.hidden = K.value !== "combustivel"); if (isNew) sh.querySelector("#eS").checked = SHARED_DEF.includes(K.value); };
    setC(); K.addEventListener("change", setC);
    sh.querySelector("#eF").addEventListener("submit", ev => { ev.preventDefault();
      const cat = K.value, amount = parseNum(sh.querySelector("#eV").value); if (!amount || amount <= 0) { const er = sh.querySelector("#eErr"); er.textContent = "Informe o valor."; er.hidden = false; return; }
      const odo = parseNum(sh.querySelector("#eO").value);
      const data = { rider: me(), cat, amount: Math.round(amount * 100) / 100, date: sh.querySelector("#eD").value, desc: sh.querySelector("#eT").value.trim(), shared: sh.querySelector("#eS").checked,
        litros: cat === "combustivel" ? parseNum(sh.querySelector("#eL").value) : null, odo: cat === "combustivel" && odo ? Math.round(odo) : null,
        cheio: cat === "combustivel" ? sh.querySelector("#eC").checked : null, created: e.created || Date.now() };
      if (isNew) store.add("expenses", data).catch(() => {}); else store.put("expenses", e.id, data, false).catch(() => {});
      closeSheet(); toast(isNew ? "Gasto lançado" : "Gasto salvo");
    });
    const del = sh.querySelector("#eDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("expenses", e.id).catch(() => {}); closeSheet(); toast("Gasto apagado"); });
  });
}
// Gasto da preparação: fica em private/{eu}/prep; "exibir" copia para os gastos da viagem com o mesmo id (sem dividir)
function savePrep(id, data) {
  store.put("prep", id, data, false).catch(() => {});
  if (data.show) store.put("expenses", id, { rider: me(), cat: data.cat, amount: data.amount, date: data.date, desc: data.desc, shared: false, fromPrep: true, created: data.created }, false).catch(() => {});
  else if (TD().expenses?.[id]) store.del("expenses", id).catch(() => {});
}
function prepForm(e) {
  const isNew = !e;
  e = e || { cat: "moto", amount: "", desc: "", date: todayISO(), show: false };
  openSheet(`<h3>${isNew ? "Novo gasto de preparação" : "Editar gasto"}</h3>
    <p class="muted small" style="margin:0">🔒 Só você vê, a menos que ligue “Exibir para o grupo”.</p>
    <form id="pF2">
      <div class="grid2"><label class="field"><span>Categoria</span>${catSelect(e.cat, PREP_CATS)}</label><label class="field"><span>Valor (R$)</span><input id="eV" inputmode="decimal" value="${e.amount !== "" && e.amount != null ? num(e.amount, 2) : ""}" required placeholder="0,00"></label></div>
      <div class="grid2"><label class="field"><span>Data</span><input id="eD" type="date" value="${esc(e.date || "")}"></label><label class="field"><span>Descrição</span><input id="eT" value="${esc(e.desc || "")}" placeholder="Ex.: par de pneus, kit relação, luvas"></label></div>
      <label class="check"><input type="checkbox" id="eSh" ${e.show ? "checked" : ""}> Exibir para o grupo <small class="muted">(aparece em Gastos da viagem, sem entrar na divisão)</small></label>
      <p class="err" id="eErr" hidden></p>
      <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="eDel">Apagar</button>`}<button class="btn primary">Salvar</button></div>
    </form>`, sh => {
    sh.querySelector("#pF2").addEventListener("submit", ev => { ev.preventDefault();
      const amount = parseNum(sh.querySelector("#eV").value); if (!amount || amount <= 0) { const er = sh.querySelector("#eErr"); er.textContent = "Informe o valor."; er.hidden = false; return; }
      const data = { cat: sh.querySelector("#eK").value, amount: Math.round(amount * 100) / 100, date: sh.querySelector("#eD").value, desc: sh.querySelector("#eT").value.trim(), show: sh.querySelector("#eSh").checked, created: e.created || Date.now() };
      savePrep(isNew ? newId() : e.id, data); closeSheet(); toast("Gasto salvo");
    });
    const del = sh.querySelector("#eDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("prep", e.id).catch(() => {}); if (TD().expenses?.[e.id]) store.del("expenses", e.id).catch(() => {}); closeSheet(); toast("Gasto apagado"); });
  });
}
const csvCell = c => `"${String(c ?? "").replace(/"/g, '""')}"`;
const brDate = iso => iso ? iso.split("-").reverse().join("/") : "";
function exportCSV(mine) {
  if (mine) {
    const rows = [["Data", "Origem", "Categoria", "Descrição", "Valor (R$)", "Exibido para o grupo"]];
    [...prepList().map(e => ({ ...e, _o: "Preparação" })), ...expenses().filter(e => e.rider === me()).map(e => ({ ...e, _o: "Viagem" }))].sort(byNew).reverse()
      .forEach(e => rows.push([brDate(e.date), e._o, catOf(e.cat)[1], e.desc || "", num(e.amount, 2), e._o === "Preparação" ? (e.show ? "sim" : "não") : ""]));
    return downloadFile(`meus-gastos-${low(trip.name).replace(/[^a-z0-9]+/g, "-")}.csv`, rows.map(r => r.map(csvCell).join(";")).join("\r\n"));
  }
  const rows = [["Data", "Quem pagou", "Categoria", "Descrição", "Valor (R$)", "Dividido", "Litros", "Hodômetro"]];
  allExpenses().slice().reverse().forEach(e => rows.push([brDate(e.date), rname(e.rider), catOf(e.cat)[1], e.desc || "", num(e.amount, 2), e.fromPrep ? "da preparação" : e.shared === false ? "não" : "sim", e.litros ? num(e.litros, 2) : "", e.odo || ""]));
  downloadFile(`gastos-${low(trip.name).replace(/[^a-z0-9]+/g, "-")}.csv`, rows.map(r => r.map(csvCell).join(";")).join("\r\n"));
}
/* ---------- importar planilha (Expedição Chapada ou do próprio app) ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, ""); const first = text.split(/\r?\n/)[0] || "", sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const catFromLabel = l => { const x = low(l); const c = CATS.find(([k, lab]) => low(lab) === x || k === x) || CATS.find(([, lab]) => x && low(lab).startsWith(x.split(":")[0])); return c ? c[0] : CAT_ALIAS[x] || "outros"; };
const isoFromBr = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s || ""); if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : ""; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; };
function importCSV(text) {
  const rows = parseCSV(text); if (rows.length < 2) return toast("Planilha vazia");
  const H = rows[0].map(h => low(h)), col = (...names) => H.findIndex(h => names.some(n => h.startsWith(n)));
  const cD = col("data"), cO = col("origem"), cC = col("categoria"), cT = col("descricao"), cV = col("valor"), cE = col("exibido"), cQ = col("quem pagou"), cS = col("dividido"), cL = col("litros"), cH = col("hodometro");
  if (cV < 0 || cD < 0) return toast("Não reconheci a planilha: precisa ter as colunas Data e Valor");
  const exist = new Set([...prepList(), ...expenses().filter(e => e.rider === me())].map(e => `${e.date}|${num(e.amount, 2)}|${low(e.desc)}`));
  const myName = low(rname(me())), items = []; let dup = 0, others = 0;
  rows.slice(1).forEach(r => {
    const amount = parseNum((r[cV] || "").replace(/r\$\s*/i, "")); if (!amount) return;
    const date = isoFromBr(r[cD]), desc = (r[cT] || "").trim(), cat = cC >= 0 ? catFromLabel(r[cC]) : "outros";
    const isTrip = cO >= 0 ? low(r[cO]) === "viagem" : cQ >= 0;
    if (cQ >= 0 && r[cQ] && low(r[cQ]).split(" ")[0] !== myName) { others++; return; } // só importo o que eu paguei
    const key = `${date}|${num(amount, 2)}|${low(desc)}`; if (exist.has(key)) { dup++; return; } exist.add(key);
    items.push(isTrip ? { kind: "trip", data: { rider: me(), cat, amount, date, desc, shared: cS >= 0 ? low(r[cS]) === "sim" : SHARED_DEF.includes(cat), litros: cL >= 0 ? parseNum(r[cL]) : null, odo: cH >= 0 ? parseNum(r[cH]) : null, created: Date.now() } }
      : { kind: "prep", data: { cat, amount, date, desc, show: cE >= 0 && low(r[cE]) === "sim", created: Date.now() } });
  });
  const nP = items.filter(i => i.kind === "prep"), nT = items.filter(i => i.kind === "trip");
  openSheet(`<h3>Importar planilha</h3>
    <p style="margin:0">Encontrei <b>${items.length}</b> ${items.length === 1 ? "gasto" : "gastos"} para importar: ${nP.length} da preparação (${brl(sum(nP.map(i => i.data)))}) e ${nT.length} da viagem (${brl(sum(nT.map(i => i.data)))}).</p>
    ${dup ? `<p class="muted small" style="margin:0">${dup} já ${dup === 1 ? "estava" : "estavam"} no app e ${dup === 1 ? "ficou" : "ficaram"} de fora.</p>` : ""}${others ? `<p class="muted small" style="margin:0">${others} ${others === 1 ? "foi pago" : "foram pagos"} por outra pessoa: cada um importa os seus.</p>` : ""}
    <div class="exps" style="max-height:40vh;overflow:auto">${items.map((it, i) => expRow({ id: "i" + i, ...it.data, _prep: it.kind === "prep", _trip: it.kind === "trip" }, "noop")).join("")}</div>
    <div class="actions"><button class="btn" data-close="1">Cancelar</button>${items.length ? `<button class="btn primary" id="impGo">Importar ${items.length}</button>` : ""}</div>`, sh => {
    sh.querySelector("#impGo")?.addEventListener("click", () => {
      items.forEach(it => it.kind === "prep" ? savePrep(newId(), it.data) : store.add("expenses", it.data).catch(() => {}));
      closeSheet(); toast(`${items.length} ${items.length === 1 ? "gasto importado" : "gastos importados"}`);
    });
  });
}
function bindGastos() {
  $("#impCsv")?.addEventListener("change", async e => { const f = e.target.files?.[0]; if (!f) return; importCSV(await f.text()); e.target.value = ""; });
}

/* =========================== DIÁRIO DE BORDO =========================== */
let diView = null;
const logs = u => Object.entries(TD().log || {}).map(([id, x]) => ({ id, ...x })).filter(x => !u || x.rider === u).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.at || 0) - (a.at || 0));
function vDiario() {
  const u = diView && riderIds().includes(diView) ? diView : me(); diView = u;
  const F = fuelLog(u), cad = Number(rider(u).consumo) || null, diff = F.real && cad ? (F.real - cad) / cad * 100 : null, mine = u === me();
  const notes = logs(u), gasto = F.L.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return `<div class="view narrow">${back()}<div class="between"><h2>Diário de bordo</h2>${mine ? `<button class="btn sm primary" data-t="newLog">+ Anotar</button>` : ""}</div>
    ${riderIds().length > 1 ? `<div class="seg">${riderIds().map(r => `<button type="button" data-t="diWho" data-v="${r}" aria-pressed="${r === u}">${esc(rname(r))}</button>`).join("")}</div>` : ""}
    <div class="stats">
      <div class="stat"><div class="v">${F.real ? num(F.real, 1) : "—"}</div><div class="k">km/L real${diff != null ? ` · ${diff >= 0 ? "+" : ""}${num(diff)}% do informado` : ""}</div></div>
      <div class="stat"><div class="v">${F.km ? num(F.km) : "—"}</div><div class="k">km entre abastecimentos</div></div>
      <div class="stat"><div class="v sm">${F.km && gasto ? brl(gasto / F.km) : "—"}</div><div class="k">combustível por km</div></div>
    </div>
    <div class="card"><div class="between"><h3>Abastecimentos</h3>${mine ? `<button class="btn sm" data-t="newFuel">+ Abastecimento</button>` : ""}</div>
      ${F.L.length ? F.L.slice().reverse().map(e => `<div class="logrow"><div><b>${e.date ? fmtDW(e.date) : "—"}</b>${e.desc ? ` · ${esc(e.desc)}` : ""}<small>${num(e.odo)} km no hodômetro${e.cheio === false ? " · parcial" : ""}</small></div><div class="r"><b>${num(e.litros, 2)} L</b><small>${brl(e.amount)}</small>${e.seg ? `<span class="chip ok">${num(e.seg.cons, 1)} km/L</span>` : ""}</div></div>`).join("")
        : `<p class="muted" style="margin:0">Lance o abastecimento em Gastos (categoria Combustível) com litros e hodômetro. Entre dois tanques cheios o app calcula o consumo real, e ele passa a valer nas contas de autonomia.</p>`}
    </div>
    <div class="card"><h3>Anotações</h3>${notes.length ? notes.map(n => `<div class="note-entry" ${n.rider === me() ? `data-t="editLog" data-id="${n.id}"` : ""}><b>${n.date ? fmtDW(n.date) : ""}</b>${n.odo ? ` <small class="muted">· ${num(n.odo)} km</small>` : ""}<p>${esc(n.texto)}</p></div>`).join("") : `<p class="muted" style="margin:0">Como foi o dia, a estrada, o que deu certo e o que mudar. Fica para o resumo da expedição.</p>`}</div>
  </div>`;
}
function logForm(n) {
  const isNew = !n; n = n || { date: todayISO(), texto: "", odo: null };
  openSheet(`<h3>${isNew ? "Anotar no diário" : "Editar anotação"}</h3><form id="lgF">
    <div class="grid2"><label class="field"><span>Dia</span><input id="lgD" type="date" value="${esc(n.date)}"></label><label class="field"><span>Hodômetro (opcional)</span><input id="lgO" inputmode="numeric" value="${n.odo ?? ""}"></label></div>
    <label class="field"><span>Como foi</span><textarea id="lgT" rows="5" required>${esc(n.texto)}</textarea></label>
    <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="lgDel">Apagar</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#lgF").addEventListener("submit", e => { e.preventDefault(); const texto = sh.querySelector("#lgT").value.trim(); if (!texto) return;
      const data = { rider: me(), date: sh.querySelector("#lgD").value, texto, odo: parseNum(sh.querySelector("#lgO").value), at: n.at || Date.now() };
      if (isNew) store.add("log", data).catch(() => {}); else store.put("log", n.id, data, false).catch(() => {}); closeSheet(); toast("Anotado"); });
    const del = sh.querySelector("#lgDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("log", n.id).catch(() => {}); closeSheet(); });
  });
}

/* =========================== SEGURANÇA =========================== */
const EMERG = [["sangue", "Tipo sanguíneo", "Ex.: O+"], ["alergias", "Alergias", "Ex.: dipirona, nenhuma"], ["remedios", "Remédios de uso contínuo", ""], ["plano", "Plano de saúde", "Nome e número da carteirinha"],
  ["contatoNome", "Contato de emergência", "Nome e parentesco"], ["contatoTel", "Telefone do contato", "(83) 9 9999-9999"], ["placa", "Placa da moto", ""], ["assistencia", "Seguro / assistência 24h", "Empresa e telefone"]];
const NUMS = [["190", "Polícia"], ["191", "PRF (rodovias federais)"], ["192", "SAMU"], ["193", "Bombeiros"]];
const telHref = v => "tel:" + (v || "").replace(/[^\d+]/g, "");
const checkins = () => Object.entries(TD().meta || {}).filter(([, m]) => m.kind === "ck").map(([id, c]) => ({ id, ...c })).sort((a, b) => (b.at || 0) - (a.at || 0));
const ckWhen = at => { const d = new Date(at); return `${WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`; };
function vSeguranca() {
  const em = u => TD().riders?.[u]?.emerg || {};
  return `<div class="view">${back()}<h2>Segurança</h2>
    <div class="grid2"><button class="btn primary big" data-t="alert" data-v="ok">✅ Cheguei bem</button><button class="btn big" data-t="alert" data-v="loc">📍 Enviar localização</button></div>
    <div class="cols"><div class="col">
    <div class="card"><h3>Avisos do grupo</h3>${checkins().length ? `<ul class="cklist">${checkins().slice(0, 12).map(c => `<li><span>${c.kind2 === "ok" ? "✅" : "📍"}</span><div><b>${esc(rname(c.rider))}</b> ${c.kind2 === "ok" ? `chegou bem${c.place ? " em " + esc(c.place) : ""}` : `mandou a localização${c.place ? " perto de " + esc(c.place) : ""}`} · <span class="muted">${ckWhen(c.at)}</span>${c.lat != null ? ` · <a href="https://maps.google.com/?q=${c.lat},${c.lng}" target="_blank" rel="noopener">ver no mapa</a>` : ""}</div></li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Quando alguém avisar que chegou ou mandar a localização, aparece aqui para todos.</p>`}</div>
    <div class="card"><h3>Números de emergência</h3><div class="row">${NUMS.map(([n, l]) => `<a class="btn sm" href="tel:${n}"><b>${n}</b>&nbsp;${l}</a>`).join("")}</div><p class="muted small" style="margin:0">Números do Brasil. Em outro país, confira os de lá antes de sair.</p></div>
    </div><div class="col">
    ${riderIds().map(u => { const e = em(u), has = EMERG.some(([k]) => e[k]); return `<div class="card"><div class="between"><h3>Ficha de ${esc(rname(u))}</h3>${u === me() ? `<button class="btn sm" data-t="emergForm">${has ? "Editar" : "Preencher"}</button>` : ""}</div>
      ${has ? `<dl class="kv">${EMERG.filter(([k]) => e[k]).map(([k, l]) => `<dt>${l}</dt><dd>${k === "contatoTel" ? `<a href="${telHref(e[k])}">${esc(e[k])}</a>` : esc(e[k])}</dd>`).join("")}</dl>` : `<p class="muted" style="margin:0">${u === me() ? "Preencha: em caso de acidente, os outros pilotos sabem quem chamar e o que informar." : "Ainda não preenchida."}</p>`}</div>`; }).join("")}
    </div></div>
  </div>`;
}
function emergForm() {
  const e = TD().riders?.[me()]?.emerg || {};
  openSheet(`<h3>Sua ficha de emergência</h3><p class="muted" style="margin:0">Fica visível só para os pilotos desta viagem.</p><form id="emF">${EMERG.map(([k, l, ph]) => `<label class="field"><span>${l}</span><input id="em_${k}" value="${esc(e[k] || "")}" placeholder="${ph}"></label>`).join("")}
    <div class="actions"><button type="button" class="btn" data-close="1">Cancelar</button><button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#emF").addEventListener("submit", ev => { ev.preventDefault(); const emerg = {}; EMERG.forEach(([k]) => emerg[k] = sh.querySelector("#em_" + k).value.trim());
      store.put("riders", me(), { emerg }).catch(() => {}); closeSheet(); toast("Ficha salva"); });
  });
}
function sendAlert(kind) {
  openSheet(`<h3>${kind === "ok" ? "✅ Cheguei bem" : "📍 Enviar minha localização"}</h3><div id="alBox"><p class="muted">Pegando sua localização…</p></div><button class="btn" data-close="1">Fechar</button>`, async sh => {
    const box = sh.querySelector("#alBox");
    const run = async () => {
      box.innerHTML = `<p class="muted">Pegando sua localização…</p>`;
      const g = await getPos(); if (!box.isConnected) return;
      const pos = g.pos || null, hm = nowHM().replace(":", "h"), where = pos ? await placeName(pos) : ""; if (!box.isConnected) return;
      const f = focusDay(), dayLine = f && f.date === todayISO() ? `🛣️ Dia ${f.n} · ${dayTitle(f)}` : "";
      const L = kind === "ok" ? [`✅ *${myFirst()} chegou bem!*`, `📍 ${where || (f ? dayPlace(f) : "") || "Local no mapa abaixo"} · ${hm}`] : [`📍 *Localização de ${myFirst()}*`, `${where ? "Perto de " + where : "Posição no mapa abaixo"} · ${hm}`];
      if (dayLine) L.push(dayLine);
      L.push(pos ? `https://maps.google.com/?q=${pos.lat},${pos.lng}` : "(sem localização agora)", `— ${trip.name} · Expedição`);
      const text = L.join("\n"), wa = isMobile ? `whatsapp://send?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      box.innerHTML = `${pos ? "" : `<div class="note">${esc(POS_ERR[g.err] || POS_ERR[2])}</div>`}<div class="msgprev">${esc(text).replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</div>
        <a class="btn primary block" id="alWa" href="${wa}" ${isMobile ? "" : 'target="_blank" rel="noopener"'}>Enviar pelo WhatsApp</a>
        <div class="grid2">${navigator.share ? `<button class="btn" id="alSh">Outros apps</button>` : ""}<button class="btn" id="alCp">Copiar texto</button></div>
        ${pos ? "" : `<button class="btn" id="alRe">Tentar de novo</button>`}<p class="muted small" style="margin:0">Ao enviar, o aviso também fica registrado no app para o grupo.</p>`;
      let logged = false; const log = () => { if (logged) return; logged = true; store.add("meta", { kind: "ck", kind2: kind, rider: me(), at: Date.now(), lat: pos?.lat ?? null, lng: pos?.lng ?? null, place: where }).catch(() => {}); };
      box.querySelector("#alWa").addEventListener("click", log);
      box.querySelector("#alSh")?.addEventListener("click", () => { log(); navigator.share({ text }).catch(() => {}); });
      box.querySelector("#alCp").addEventListener("click", () => { log(); navigator.clipboard?.writeText(text).then(() => toast("Texto copiado"), () => toast("Não deu para copiar")); });
      box.querySelector("#alRe")?.addEventListener("click", run);
    };
    run();
  });
}
const myFirst = () => rname(me());

/* =========================== MODO PILOTANDO =========================== */
let watchId = null, wakeLock = null, ridePos = null;
function vPilotando() {
  const d = focusDay();
  return `<div class="ride">
    <div class="ride-top"><a href="${link("inicio")}" class="ride-x" data-t="rideStop">✕ Sair</a><span id="rClock">${nowHM()}</span></div>
    ${!d ? `<p>Monte o roteiro primeiro.</p>` : `
    <div class="ride-label">${d.date === todayISO() ? "Hoje" : d.date ? fmtDW(d.date) : "Dia " + d.n} · Dia ${d.n}</div>
    <div class="ride-dest">${esc(isRoad(d) ? d.destino : dayTitle(d))}</div>
    <div class="ride-grid">
      <div><small>Faltam</small><b id="rLeft">${dayKm(d) ? num(dayKm(d)) : "—"}</b><small>km</small></div>
      <div><small>Chegada</small><b id="rEta">${dayArrive(d) != null ? hhmm(dayArrive(d)) : "—"}</b><small>prevista</small></div>
    </div>
    ${hasRoute(d) ? `<div id="rMap" class="ride-map"></div>` : ""}
    <div class="ride-fuel" data-fuel="${d.id}" data-compact="1"></div>
    <div class="ride-btns">
      ${gmapsUrl(d) ? `<a class="rbtn go" href="${gmapsUrl(d)}" target="_blank" rel="noopener">${ico("nav")}Navegar</a>` : ""}
      <button class="rbtn ok" data-t="alert" data-v="ok">${ico("ok")}Cheguei bem</button>
      <button class="rbtn" data-t="alert" data-v="loc">${ico("local")}Localização</button>
    </div>
    <p class="ride-note" id="rNote">Tela fica acesa enquanto este modo está aberto. Pilote olhando a estrada.</p>`}
  </div>`;
}
async function startRide() {
  const d = focusDay();
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) {}
  const clock = setInterval(() => { const c = $("#rClock"); if (!c) return clearInterval(clock); c.textContent = nowHM(); }, 15000);
  if (!d || !hasRoute(d)) return;
  const line = await dayLine(d); if (!line) return;
  const total = dayKm(d) || lineKm(line);
  // mapa pequeno com a rota do dia e a sua posição (a navegação curva a curva fica com o Google Maps ou o Waze)
  let dot = null, follow = true, rm = null;
  try {
    const L = await ensureLeaflet(), el = $("#rMap");
    if (el) { rm = new MapView(L, el, { style: "escuro", onPin: () => {}, onPlace: () => {} });
      rm.setRoutes([{ latlngs: line, color: dayColor(d) }]); const e2 = line[line.length - 1];
      rm.setPoints([{ id: "fim", lat: e2[0], lng: e2[1], color: dayColor(d), type: "chegada", name: d.destino || dayTitle(d) }], "ride");
      rm.map.fitBounds(line, { padding: [24, 24] }); rm.map.on("dragstart", () => { follow = false; });
      dot = L.circleMarker([0, 0], { radius: 9, color: "#fff", weight: 3, fillColor: "#1d8cf0", fillOpacity: 1 }); }
  } catch (e) { /* sem mapa: segue só com os números */ }
  if (!navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(p => {
    ridePos = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (dot && rm?.alive()) { dot.setLatLng([ridePos.lat, ridePos.lng]); if (!rm.map.hasLayer(dot)) dot.addTo(rm.map); if (follow) rm.map.setView([ridePos.lat, ridePos.lng], Math.max(rm.map.getZoom(), 11)); }
    const a = along(line, ridePos), left = Math.max(0, total - a.km * (total / lineKm(line)));
    const el = $("#rLeft"); if (!el) return stopRide();
    if (a.off < 25) { el.textContent = num(left); const eta = new Date(Date.now() + left / avgSpeed() * 3600e3); $("#rEta").textContent = `${pad(eta.getHours())}h${pad(eta.getMinutes())}`; $("#rNote").textContent = "Pela sua posição agora, na média do roteiro."; }
    else $("#rNote").textContent = `Você está a ${num(a.off)} km da rota do dia.`;
  }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 });
}
export function stopRide() { if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; try { wakeLock?.release(); } catch (e) {} wakeLock = null; }

/* =========================== HOSPEDAGEM =========================== */
function vHospedagem() {
  const ds = days().filter((d, i, a) => i < a.length - 1 || d.destino !== trip.origem);
  return `<div class="view narrow">${back()}<div class="between"><h2>Hospedagem</h2><button class="btn sm primary" data-t="newLodge">+ Hospedagem</button></div>
    ${ds.length ? ds.map(d => { const ls2 = lodgings().filter(l => l.dayId === d.id); return `<div class="card"><div class="between"><b>Noite do dia ${d.n}${d.date ? " · " + fmtDW(d.date) : ""}</b><span class="muted small">${esc(dayPlace(d) || "")}</span></div>
      ${ls2.length ? ls2.map(l => `<button class="lodge" data-t="editLodge" data-id="${l.id}"><div><b>${esc(l.nome)}</b><small>${[l.cidade, l.valor ? brl(l.valor) : "", l.tel].filter(Boolean).map(esc).join(" · ")}</small></div><span class="chip ${l.status === "ideia" ? "" : "ok"}">${STATUS[l.status] || "Opção"}</span></button>`).join("")
        : `<p class="muted small" style="margin:0">${d.pernoite ? "Anotado no roteiro: " + esc(d.pernoite) : "Nada ainda."}</p>`}
      <button class="btn sm" data-t="newLodge" data-v="${d.id}">+ Opção para esta noite</button></div>`; }).join("") : `<div class="card"><p class="muted" style="margin:0">Monte o roteiro primeiro: as noites seguem os dias.</p></div>`}
  </div>`;
}
function lodgeForm(l, dayId) {
  const isNew = !l; l = l || { dayId: dayId || focusDay()?.id || "", nome: "", cidade: "", tel: "", link: "", valor: null, status: "ideia", nota: "" };
  openSheet(`<h3>${isNew ? "Nova hospedagem" : "Editar hospedagem"}</h3><form id="hF">
    <label class="field"><span>Noite</span><select id="hD">${days().map(d => `<option value="${d.id}" ${l.dayId === d.id ? "selected" : ""}>Dia ${d.n}${d.date ? " · " + fmtD(d.date) : ""} · ${esc(dayPlace(d) || "")}</option>`).join("")}</select></label>
    <label class="field"><span>Nome</span><input id="hN" value="${esc(l.nome)}" required placeholder="Pousada, hotel, camping…"></label>
    <div class="grid2"><label class="field"><span>Cidade</span><input id="hC" value="${esc(l.cidade)}"></label><label class="field"><span>Telefone / WhatsApp</span><input id="hT" inputmode="tel" value="${esc(l.tel)}"></label></div>
    <div class="grid2"><label class="field"><span>Valor total (R$)</span><input id="hV" inputmode="decimal" value="${l.valor != null ? num(l.valor, 2) : ""}"></label>
    <label class="field"><span>Situação</span><select id="hS">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${l.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
    <label class="field"><span>Link (site, Booking, Instagram)</span><input id="hL" value="${esc(l.link)}"></label>
    <label class="field"><span>Observações</span><textarea id="hO" rows="2" placeholder="Garagem para a moto? Café incluso?">${esc(l.nota)}</textarea></label>
    ${!isNew && (l.tel || l.link) ? `<div class="row">${l.tel ? `<a class="btn sm" href="https://wa.me/${(l.tel.replace(/\D/g, "").startsWith("55") ? "" : "55") + l.tel.replace(/\D/g, "")}" target="_blank" rel="noopener">WhatsApp</a><a class="btn sm" href="${telHref(l.tel)}">Ligar</a>` : ""}${l.link ? `<a class="btn sm" href="${esc(l.link)}" target="_blank" rel="noopener">Abrir link</a>` : ""}</div>` : ""}
    <div class="actions">${isNew ? `<button type="button" class="btn" data-close="1">Cancelar</button>` : `<button type="button" class="btn danger" id="hDel">Apagar</button>`}<button class="btn primary">Salvar</button></div></form>`, sh => {
    sh.querySelector("#hF").addEventListener("submit", e => { e.preventDefault(); const g = id => sh.querySelector(id).value.trim();
      const data = { dayId: g("#hD"), nome: g("#hN"), cidade: g("#hC"), tel: g("#hT"), link: g("#hL"), valor: parseNum(g("#hV")), status: g("#hS"), nota: g("#hO"), by: l.by || me() };
      if (!data.nome) return; if (isNew) store.add("lodging", data).catch(() => {}); else store.put("lodging", l.id, data, false).catch(() => {});
      closeSheet(); toast("Hospedagem salva"); });
    const del = sh.querySelector("#hDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("lodging", l.id).catch(() => {}); closeSheet(); });
  });
}

/* =========================== PENDÊNCIAS =========================== */
const pends = () => Object.entries(TD().meta || {}).filter(([, m]) => m.kind === "pend").map(([id, m]) => ({ id, ...m })).sort((a, b) => (a.done - b.done) || (a.at || 0) - (b.at || 0));
function vPendencias() {
  const P = pends(), open = P.filter(p => !p.done);
  return `<div class="view narrow">${back()}<div class="between"><h2>Pendências</h2><span class="tag-y">${open.length} ${open.length === 1 ? "aberta" : "abertas"}</span></div>
    <p class="muted" style="margin:0">O que falta resolver antes de sair: reservar, comprar, confirmar. Todos os pilotos veem e podem marcar.</p>
    <form id="pdF" class="card"><div class="grid2"><input id="pdT" placeholder="Ex.: Confirmar pousada em Lençóis" required><select id="pdW"><option value="">Qualquer um</option>${riderIds().map(u => `<option value="${u}">${esc(rname(u))}</option>`).join("")}</select></div><button class="btn">Adicionar</button></form>
    <div class="card">${P.length ? P.map(p => `<label class="ckrow ${p.done ? "done" : ""}"><input type="checkbox" data-t="pdToggle" data-id="${p.id}" ${p.done ? "checked" : ""}><span>${esc(p.txt)}${p.who ? ` <small class="muted">· ${esc(rname(p.who))}</small>` : ""}</span><button type="button" class="ibtn sm" data-t="pdDel" data-id="${p.id}" aria-label="Apagar">×</button></label>`).join("") : `<p class="muted" style="margin:0">Nada pendente.</p>`}</div>
  </div>`;
}
function bindPendencias() {
  $("#pdF")?.addEventListener("submit", e => { e.preventDefault(); const t = $("#pdT").value.trim(); if (!t) return;
    store.add("meta", { kind: "pend", txt: t, who: $("#pdW").value, done: false, by: me(), at: Date.now() }).catch(() => {}); $("#pdT").value = ""; });
}

/* =========================== REVISÃO DAS MOTOS =========================== */
const REV_SUG = ["Troca de óleo e filtro", "Kit relação (corrente, coroa e pinhão)", "Pneu dianteiro", "Pneu traseiro", "Pastilhas de freio", "Fluido de freio", "Bateria", "Velas", "Filtro de ar", "Suspensão e retentores", "Lâmpadas e farol", "Cabos de embreagem e acelerador"];
let rvView = null;
const revOf = u => TD().riders?.[u]?.revisao || [];
function vRevisao() {
  const u = rvView && riderIds().includes(rvView) ? rvView : me(); rvView = u; const R = revOf(u), mine = u === me();
  return `<div class="view narrow">${back()}<h2>Revisão das motos</h2>
    ${riderIds().length > 1 ? `<div class="seg">${riderIds().map(r => `<button type="button" data-t="rvWho" data-v="${r}" aria-pressed="${r === u}">${esc(rname(r))}</button>`).join("")}</div>` : ""}
    <div class="card"><div class="between"><h3>${esc(rider(u).moto || "Moto")}</h3><span class="tag-y">${R.filter(x => x.done).length}/${R.length}</span></div>
      ${R.length ? R.map(x => `<label class="ckrow ${x.done ? "done" : ""}"><input type="checkbox" ${mine ? `data-t="rvToggle" data-id="${x.id}"` : "disabled"} ${x.done ? "checked" : ""}><span>${esc(x.txt)}${x.nota ? ` <small class="muted">· ${esc(x.nota)}</small>` : ""}</span>${mine ? `<button type="button" class="ibtn sm" data-t="rvDel" data-id="${x.id}" aria-label="Tirar">×</button>` : ""}</label>`).join("") : `<p class="muted" style="margin:0">${mine ? "O que a moto precisa antes da viagem. Comece pelas sugestões e marque o que já foi feito." : "Nada anotado ainda."}</p>`}
      ${mine ? `<form id="rvF" class="row"><input id="rvT" placeholder="Outro item" style="flex:1"><button class="btn sm">Adicionar</button></form>
      <div class="chips">${REV_SUG.filter(s => !R.some(x => x.txt === s)).map(s => `<button class="chipb" data-t="rvAdd" data-v="${esc(s)}">+ ${esc(s)}</button>`).join("")}</div>` : ""}
    </div></div>`;
}
const saveRev = list => store.put("riders", me(), { revisao: list }).catch(() => {});
function bindRevisao() { $("#rvF")?.addEventListener("submit", e => { e.preventDefault(); const t = $("#rvT").value.trim(); if (!t) return; saveRev([...revOf(me()), { id: newId(), txt: t, done: false }]); }); }

/* =========================== FOTOS =========================== */
const photos = () => Object.entries(TD().photos || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.at || 0) - (b.at || 0));
function compress(file, max, q) {
  return new Promise((ok, fail) => { const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok({ data: c.toDataURL("image/jpeg", q), w: c.width, h: c.height }); };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("img")); }; img.src = url; });
}
function vFotos() {
  const P = photos(), ds = days();
  const groups = ds.map(d => ({ d, list: P.filter(p => p.dayId === d.id) })).filter(g => g.list.length);
  const loose = P.filter(p => !ds.some(d => d.id === p.dayId));
  const def = focusDay()?.id || "";
  return `<div class="view">${back()}<div class="between"><h2>Fotos</h2><span class="tag-y">${P.length}</span></div>
    <div class="card"><div class="grid2"><select id="phDay">${ds.map(d => `<option value="${d.id}" ${d.id === def ? "selected" : ""}>Dia ${d.n}${d.date ? " · " + fmtD(d.date) : ""}</option>`).join("")}<option value="">Sem dia</option></select>
      <label class="btn primary">+ Pôr fotos<input type="file" id="phIn" accept="image/*" multiple hidden></label></div>
      <p class="muted small" style="margin:0">As fotos são reduzidas para caber no plano grátis (até 1600 px). Guarde as originais no celular.</p></div>
    ${[...groups, ...(loose.length ? [{ d: null, list: loose }] : [])].map(g => `<div><div class="label">${g.d ? `Dia ${g.d.n}${g.d.date ? " · " + fmtDW(g.d.date) : ""} · ${esc(dayTitle(g.d))}` : "Sem dia"}</div>
      <div class="pgrid">${g.list.map(p => `<button class="ph" data-t="photo" data-id="${p.id}"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join("")}</div></div>`).join("") || `<div class="card"><p class="muted" style="margin:0">Nenhuma foto ainda. Elas aparecem para todos os pilotos e entram no resumo da expedição.</p></div>`}
  </div>`;
}
function bindFotos() {
  $("#phIn")?.addEventListener("change", async e => {
    const files = [...(e.target.files || [])]; if (!files.length) return; const dayId = $("#phDay").value;
    toast(`Enviando ${files.length} ${files.length === 1 ? "foto" : "fotos"}…`); let ok = 0;
    for (const f of files) { try {
      const th = await compress(f, 360, .7);
      // cabe num documento do Firestore (até ~1 MB): reduz até caber
      let full = null; for (const [mx, q] of [[1600, .8], [1280, .74], [1024, .7], [800, .66]]) { full = await compress(f, mx, q); if (full.data.length < 900000) break; }
      if (full.data.length >= 900000) throw new Error("grande");
      const id = newId();
      await store.put("photofull", id, { rider: me(), data: full.data }, false);
      await store.put("photos", id, { rider: me(), dayId, thumb: th.data, w: full.w, h: full.h, at: Date.now() }, false); ok++;
    } catch (x) { console.error(x); } }
    toast(ok === files.length ? "Fotos enviadas" : `${ok} de ${files.length} enviadas`);
  });
}
async function photoSheet(id) {
  const p = TD().photos?.[id]; if (!p) return; const d = days().find(x => x.id === p.dayId);
  openSheet(`<div class="phview"><img id="phBig" src="${p.thumb}" alt=""></div><p class="muted small" style="margin:0">${esc(rname(p.rider))}${d ? ` · Dia ${d.n} · ${esc(dayTitle(d))}` : ""}</p>
    <div class="actions">${p.rider === me() ? `<button class="btn danger" id="phDel">Apagar</button>` : ""}<a class="btn" id="phSave" download="foto-${id}.jpg" href="${p.thumb}">Baixar</a><button class="btn" data-close="1">Fechar</button></div>`, async sh => {
    const del = sh.querySelector("#phDel"); if (del) armed(del, "Toque de novo para apagar", () => { store.del("photos", id).catch(() => {}); store.del("photofull", id).catch(() => {}); closeSheet(); });
    try { const f = await store.getOne("photofull", id); if (f?.data && sh.isConnected) { sh.querySelector("#phBig").src = f.data; sh.querySelector("#phSave").href = f.data; } } catch (e) {}
  }, "wide");
}

/* =========================== ROADBOOK =========================== */
function vRoadbook() {
  const ds = days(), fmt = ls.get("rbFmt", "a4");
  document.documentElement.dataset.rb = fmt;
  let ps = document.getElementById("rbPage"); if (!ps) { ps = document.createElement("style"); ps.id = "rbPage"; document.head.appendChild(ps); }
  ps.textContent = fmt === "10x15" ? "@media print { @page { size: 100mm 150mm; margin: 5mm; } }" : "@media print { @page { size: A4; margin: 10mm; } }";
  return `<div class="view rbview">
    <div class="noprint">${back()}<div class="between"><h2>Roadbook</h2><button class="btn primary sm" data-t="print">${ico("imprimir")} Imprimir ou salvar PDF</button></div>
      <div class="seg sm" style="max-width:320px">${[["a4", "Folha A4"], ["10x15", "Cartão 10×15"]].map(([k, l]) => `<button type="button" data-t="rbFmt" data-v="${k}" aria-pressed="${fmt === k}">${l}</button>`).join("")}</div>
      <p class="muted small" style="margin:0">No celular, escolha “Salvar como PDF” na hora de imprimir. O 10×15 cabe no bolso do tanque ou no porta-mapa.</p></div>
    <div class="rb">
      <div class="rbcover"><b>${esc(trip.name)}</b><span>${esc(trip.origem)} → ${esc(trip.destino)}${trip.inicio ? ` · ${fmtD(trip.inicio)} a ${fmtD(trip.fim)}` : ""}</span><span>${riderIds().map(u => esc(rider(u).nome || "")).join(" · ")}</span></div>
      ${ds.map(d => { const lg = lodgingFor(d), st = dayStops(d), ar = dayArrive(d); return `<section class="rbday" style="--dc:${dayColor(d)}">
        <header><span class="rbn">${d.n}</span><div><b>${d.date ? `${WDL[parseISO(d.date).getDay()]}, ${fmtD(d.date)}` : "Dia " + d.n}</b><small>${TIPO[d.tipo || "estrada"]}</small></div>${dayKm(d) ? `<span class="rbkm">${num(dayKm(d))} km</span>` : ""}</header>
        <h3>${esc(dayTitle(d))}</h3>
        ${splitPlaces(d.pontos).length ? `<div class="rbbox"><div class="rblabel">O que tem no dia</div><div>${splitPlaces(d.pontos).map(esc).join(" · ")}</div></div>` : ""}
        ${hasRoute(d) || d.saida ? `<div class="rbbox"><div class="rblabel">Horário</div><div>${d.saida ? `Saída <b>${hhmm(toH(d.saida))}</b>` : "Saída —"}${ar != null && isRoad(d) ? ` · chegada <b>~${hhmm(ar)}</b>` : ""}${isRoad(d) && dayHours(d) ? ` · ${dur(dayHours(d))} de estrada` : ""}${d.trilha ? ` · trilha ${esc(d.trilha)}` : ""}${d.terra ? " · tem trecho de terra" : ""}</div></div>` : ""}
        ${hasRoute(d) ? `
        ${st.length > 1 ? `<div class="rbbox"><div class="rblabel">Caminho</div><div class="rbpath">${st.map(s => `<span>${esc(s.name)}<small>${s.km ? "km " + num(s.km) + " · " : ""}~${hhmm(s.eta)}</small></span>`).join("<i>↓</i>")}</div></div>` : ""}
        <div class="rbbox"><div class="rblabel">Abastecimento</div><div data-fuel="${d.id}" data-compact="1">—</div></div>` : ""}
        <div class="rbbox"><div class="rblabel">Tempo</div><div data-wx="${d.id}">—</div></div>
        <div class="rbbox"><div class="rblabel">Pernoite</div><div>${lg ? `<b>${esc(lg.nome)}</b>${lg.tel ? " · " + esc(lg.tel) : ""}${lg.cidade ? " · " + esc(lg.cidade) : ""}` : esc(d.pernoite || "—")}</div></div>
        ${d.nota ? `<div class="rbbox"><div class="rblabel">Notas</div><div>${esc(d.nota)}</div></div>` : ""}
      </section>`; }).join("")}
      <div class="rbfoot">Emergência: 190 Polícia · 191 PRF · 192 SAMU · 193 Bombeiros · Feito no Expedição</div>
    </div>
  </div>`;
}

/* =========================== RESUMO =========================== */
function vResumo() {
  const ds = days(), road = ds.filter(isRoad), km = road.reduce((s, d) => s + (dayKm(d) || 0), 0), st = settlement(), all = expenses();
  const total = all.reduce((s, e) => s + (Number(e.amount) || 0), 0), P = photos();
  const real = riderIds().map(u => ({ u, F: fuelLog(u) }));
  return `<div class="view">${back()}<div class="between"><h2>Resumo da expedição</h2><button class="btn sm primary" data-t="shareSum">Compartilhar</button></div>
    ${signHTML()}
    <div class="stats">
      <div class="stat"><div class="v">${ds.length}</div><div class="k">dias</div></div>
      <div class="stat"><div class="v">${num(km)}</div><div class="k">km planejados</div></div>
      <div class="stat"><div class="v">${road.length}</div><div class="k">dias de estrada</div></div>
      <div class="stat"><div class="v sm">${brl(total)}</div><div class="k">gasto total</div></div>
      <div class="stat"><div class="v sm">${brl(riderIds().length ? total / riderIds().length : 0)}</div><div class="k">por piloto</div></div>
      <div class="stat"><div class="v">${P.length}</div><div class="k">fotos</div></div>
    </div>
    <div class="cols"><div class="col">
    <div class="card"><h3>Pilotos</h3>${riderIds().map(u => { const F = real.find(x => x.u === u).F; return `<div class="between" style="border-top:1px solid var(--line);padding-top:8px"><div><b>${esc(rider(u).nome || "")}</b><div class="muted small">${esc(rider(u).moto || "")}</div></div><div class="r small">${F.km ? `${num(F.km)} km rodados<br>` : ""}${F.real ? `${num(F.real, 1)} km/L real` : ""}<br>custo ${brl(myCost(u))}</div></div>`; }).join("")}</div>
    <div class="card"><h3>Planejado x realizado</h3>${road.map(d => { const n = logs().filter(l => l.date === d.date); return `<div class="pr"><b>Dia ${d.n}</b> ${esc(dayTitle(d))}<small>${dayKm(d) ? num(dayKm(d)) + " km planejados" : ""}${n.length ? " · " + n.length + " anotação" + (n.length > 1 ? "ões" : "") : ""}</small></div>`; }).join("") || `<p class="muted" style="margin:0">Sem dias de estrada.</p>`}
      <p class="muted small" style="margin:0">Os km rodados vêm do hodômetro dos abastecimentos; as anotações, do diário de bordo.</p></div>
    </div><div class="col">
    ${P.length ? `<div class="card"><h3>Fotos</h3><div class="pgrid">${P.slice(0, 12).map(p => `<button class="ph" data-t="photo" data-id="${p.id}"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join("")}</div>${P.length > 12 ? `<a href="${link("fotos")}">Ver as ${P.length}</a>` : ""}</div>` : ""}
    <div class="card"><h3>Diário</h3>${logs().slice(0, 6).map(n => `<div class="note-entry"><b>${esc(rname(n.rider))} · ${n.date ? fmtD(n.date) : ""}</b><p>${esc(n.texto)}</p></div>`).join("") || `<p class="muted" style="margin:0">Nenhuma anotação ainda.</p>`}</div>
    </div></div>
  </div>`;
}
function shareSummary() {
  const ds = days(), km = ds.filter(isRoad).reduce((s, d) => s + (dayKm(d) || 0), 0), total = expenses().reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const text = [`🏍️ *${trip.name}*`, `${trip.origem} → ${trip.destino}${trip.inicio ? ` · ${fmtD(trip.inicio)} a ${fmtD(trip.fim)}` : ""}`, `${ds.length} dias · ~${num(km)} km de estrada`,
    `Pilotos: ${riderIds().map(u => rider(u).nome).join(", ")}`, total ? `Gasto total: ${brl(total)} (${brl(total / Math.max(1, riderIds().length))} por piloto)` : "", `Planejado no Expedição: https://jacobbv.github.io/expedicao-app/`].filter(Boolean).join("\n");
  openSheet(`<h3>Compartilhar o resumo</h3><div class="msgprev">${esc(text).replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</div>
    <div class="grid2"><a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn" id="smCp">Copiar texto</button></div>
    <div class="actions"><button class="btn" data-close="1">Fechar</button></div>`, sh => sh.querySelector("#smCp").addEventListener("click", () => navigator.clipboard?.writeText(text).then(() => toast("Texto copiado"))));
}

/* =========================== desenho e ações =========================== */
export function renderTrip(t, sub, extra) {
  trip = t; store.openTrip(t.id);
  if (sub !== "pilotando") stopRide();
  if (sub !== "roadbook") delete document.documentElement.dataset.rb;
  if (!TD().ready && sub !== "roteiro" && sub !== "inicio" && sub !== "mapa" && sub !== "tempo" && sub !== "roadbook" && sub !== "abastecer" && sub !== "pilotando") return `<div class="view"><p class="muted center pad">Carregando a viagem…</p></div>`;
  const V = { inicio: vInicio, roteiro: vRoteiro, mapa: () => vMapa(extra), tempo: vTempo, abastecer: vAbastecer, checklist: () => vChecklist(extra), gastos: vGastos, diario: vDiario, seguranca: vSeguranca,
    pilotando: vPilotando, hospedagem: vHospedagem, pendencias: vPendencias, revisao: vRevisao, fotos: vFotos, roadbook: vRoadbook, resumo: vResumo, mais: vMais }[sub || "inicio"] || vInicio;
  return V();
}
export function afterRender(sub) {
  fillWx(); fillFuel();
  if (sub === "mapa") { if (mapView?.alive()) updateMap(); else { mapView = null; mountMap(); } } else mapView = null;
  if (sub === "checklist") bindChecklist();
  if (sub === "gastos") bindGastos();
  if (sub === "pendencias") bindPendencias();
  if (sub === "revisao") bindRevisao();
  if (sub === "fotos") bindFotos();
  if (sub === "pilotando") startRide();
}
// O mapa não é redesenhado a cada mudança (perderia o zoom): só os pontos e as linhas
export const keepMap = sub => sub === "mapa" && mapView?.alive();
export const refreshMap = () => updateMap();

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-t]"); if (!b || !trip) return;
  const t = b.dataset.t, id = b.dataset.id, v = b.dataset.v, d = id ? days().find(x => x.id === id) : null;
  switch (t) {
    case "wxDay": if (d) wxSheet(d); break;
    case "editDay": closeSheet(); if (d) dayForm(d); break;
    case "dayMenu": if (d) dayMenu(d); break;
    case "addDay": dayForm(null, true, days().length - 1); break;
    case "addAfter": closeSheet(); if (d) dayForm(null, true, d.i); break;
    case "moveDay": { closeSheet(); const list = days(), j = d.i + Number(v); [list[d.i], list[j]] = [list[j], list[d.i]]; saveDays(list); redraw(); break; }
    case "recalc": closeSheet(); if (d) { toast("Recalculando…"); computeDay(d, true).then(() => redraw()); } break;
    case "splitDay": if (d) splitDay(d); break;
    case "makeDays": { const span = diffDays(trip.inicio, trip.fim) + 1, list = [];
      for (let i = 0; i < span; i++) list.push({ id: newId(), tipo: "estrada", origem: i === 0 ? trip.origem : "", destino: i === span - 1 ? trip.origem : i === 0 ? trip.destino : "", via: "", saida: "06:00", pernoite: "", nota: "" });
      saveDays(list); redraw(); toast("Dias criados: agora edite cada um"); break; }
    case "routeCfg": routeCfg(); break;
    case "rtView": ls.set("rtView", v); redraw(); break;
    case "openDay": ls.set("rtView", "cards"); redraw(); setTimeout(() => document.getElementById("d-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); break;
    case "fuelRetry": b.disabled = true; b.textContent = "buscando…"; fillFuel(); break;
    case "mapStyle": ls.set("mapStyle", v); mapView?.setStyle(v); b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); break;
    case "mapDay": mapDay = v; b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); updateMap(); break;
    case "mapAdd": pointForm(null, null); break;
    case "editPoint": closeSheet(); pointForm(id); break;
    case "gasPrice": gasPriceSheet(); break;
    case "ckWho": ckView = v; redraw(); break;
    case "ckTemplate": { const items = []; Object.entries(CK_TEMPLATE).forEach(([cat, l]) => l.forEach(txt => items.push({ id: newId(), txt, cat, done: false }))); saveCk(items); break; }
    case "ckToggle": saveCk(ckItems(me()).map(x => x.id === id ? { ...x, done: b.checked } : x)); break;
    case "ckDel": e.preventDefault(); saveCk(ckItems(me()).filter(x => x.id !== id)); break;
    case "newExp": expForm(null); break;
    case "newFuel": expForm(null); break;
    case "editExp": { const x = expenses().find(y => y.id === id); if (x) expForm(x); break; }
    case "viewExp": { const x = expenses().find(y => y.id === id); if (x) toast(`${catOf(x.cat)[1]} · ${brl(x.amount)} · lançado por ${rname(x.rider)}`); break; }
    case "csv": exportCSV(false); break;
    case "csvMine": exportCSV(true); break;
    case "gTab": gTab = v; redraw(); break;
    case "newPrep": prepForm(null); break;
    case "editPrep": { const x = prepList().find(y => y.id === id); if (x) prepForm(x); else { const y = allExpenses().find(z => z.id === id); if (y) toast("Gasto da preparação: edite em Meus gastos"); } break; }
    case "diWho": diView = v; redraw(); break;
    case "newLog": logForm(null); break;
    case "editLog": { const n = logs().find(x => x.id === id); if (n) logForm(n); break; }
    case "alert": sendAlert(v); break;
    case "emergForm": emergForm(); break;
    case "rideStop": stopRide(); break;
    case "newLodge": lodgeForm(null, v); break;
    case "editLodge": { const l = lodgings().find(x => x.id === id); if (l) lodgeForm(l); break; }
    case "pdToggle": store.put("meta", id, { done: b.checked }).catch(() => {}); break;
    case "pdDel": e.preventDefault(); store.del("meta", id).catch(() => {}); break;
    case "rvWho": rvView = v; redraw(); break;
    case "rvToggle": saveRev(revOf(me()).map(x => x.id === id ? { ...x, done: b.checked } : x)); break;
    case "rvDel": e.preventDefault(); saveRev(revOf(me()).filter(x => x.id !== id)); break;
    case "rvAdd": saveRev([...revOf(me()), { id: newId(), txt: v, done: false }]); break;
    case "photo": photoSheet(id); break;
    case "print": window.print(); break;
    case "rbFmt": ls.set("rbFmt", v); redraw(); break;
    case "shareSum": shareSummary(); break;
  }
});
