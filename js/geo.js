// Lugares, rotas e postos. Tudo grátis e sem chave:
// - Busca de cidades: Open-Meteo Geocoding (dados GeoNames, CC BY 4.0)
// - Rota pela estrada: OSRM (servidor público de demonstração, dados © colaboradores do OpenStreetMap, ODbL)
// - Postos no caminho: Overpass API (dados © colaboradores do OpenStreetMap, ODbL)
// - Nome do lugar pela posição e pontos turísticos (cachoeira, mirante, povoado): Nominatim (© colaboradores do OpenStreetMap, ODbL)
// Os resultados ficam guardados no aparelho: sem sinal, vale o último que foi baixado.
import { low } from "./util.js";

export const distKm = (a, b) => {
  const R = 6371, t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const mem = new Map(), pending = new Map();
const getC = k => { if (mem.has(k)) return mem.get(k); try { const v = JSON.parse(localStorage.getItem(k) || "null"); if (v != null) mem.set(k, v); return v ?? undefined; } catch (e) { return undefined; } };
const setC = (k, v) => { mem.set(k, v); try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cheio: tudo bem, fica só na memória */ } };
const once = (k, fn) => { if (pending.has(k)) return pending.get(k); const p = fn().finally(() => pending.delete(k)); pending.set(k, p); return p; };
const timeoutFetch = (url, ms = 10000, opt = {}) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };

/* ---------- cidades ---------- */
// "Sousa - PB", "Sousa/PB", "Sousa (PB)" → nome e estado
const UF = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
export function splitPlace(s) {
  const m = /^(.*?)[\s]*(?:[-–/,(]\s*)([A-Za-z]{2})\)?\s*$/.exec((s || "").trim());
  if (m && UF[m[2].toUpperCase()]) return { name: m[1].trim(), uf: m[2].toUpperCase() };
  return { name: (s || "").trim(), uf: "" };
}
export const placeLabel = p => p ? `${p.name}${p.admin1 ? " · " + (Object.entries(UF).find(([, v]) => v === p.admin1)?.[0] || p.admin1) : ""}${p.cc && p.cc !== "BR" ? " · " + p.country : ""}` : "";
// Procura a cidade. "near" ajuda a escolher entre cidades com o mesmo nome (a mais perto do ponto anterior).
export function geocode(text, near) {
  const { name, uf } = splitPlace(text); if (!name) return Promise.resolve(null);
  const k = `geo3:${low(name)}:${uf}:${near ? Math.round(near.lat) + "," + Math.round(near.lng) : ""}`;
  const c = getC(k); if (c !== undefined) return Promise.resolve(c);
  return once(k, async () => {
    try {
      const r = await timeoutFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=20&language=pt&format=json`);
      if (!r.ok) throw 0; const j = await r.json();
      let list = (j.results || []).map(x => ({ name: x.name, lat: x.latitude, lng: x.longitude, admin1: x.admin1 || "", cc: x.country_code || "", country: x.country || "", pop: x.population || 0, ppl: (x.feature_code || "").startsWith("PPL") }));
      if (uf) list = list.filter(x => x.cc === "BR" && low(x.admin1) === low(UF[uf]));
      if (!list.length) { const poi = await searchPoi(name, uf, near); setC(k, poi); return poi; }
      const score = x => (x.ppl ? 0 : 500) + (near ? distKm(near, x) : 0) - Math.log10(x.pop + 1) * 40 + (x.cc === "BR" ? 0 : near ? 0 : 300);
      list.sort((a, b) => score(a) - score(b));
      const v = list[0]; setC(k, v); return v;
    } catch (e) { return null; } // sem internet: tenta de novo da próxima vez
  });
}
// Pontos que não são cidade (Cachoeira do Mosquito, Morro do Pai Inácio, Sítio Triângulo…): busca no OpenStreetMap
// perto do ponto anterior. O Nominatim pede no máximo 1 busca por segundo: as buscas fazem fila.
let nomQ = Promise.resolve();
const nomWait = () => { const p = nomQ.then(() => new Promise(r => setTimeout(r, 1100))); nomQ = p; return p; };
async function searchPoi(name, uf, near) {
  const q = encodeURIComponent(name + (uf ? ", " + UF[uf] : ""));
  const box = near ? `&viewbox=${near.lng - 1.2},${near.lat + 1.2},${near.lng + 1.2},${near.lat - 1.2}&bounded=1` : "";
  const tryOnce = async extra => {
    await nomWait();
    const r = await timeoutFetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=pt-BR&q=${q}${extra}`, 8000);
    const j = await r.json(); const x = j[0];
    return x ? { name, lat: +x.lat, lng: +x.lon, admin1: "", cc: "", country: "", poi: true } : null;
  };
  try { return (box && await tryOnce(box)) || await tryOnce(near ? "" : "&countrycodes=br"); } catch (e) { throw e; }
}
export async function searchPlaces(text) {
  const { name, uf } = splitPlace(text); if (name.length < 2) return [];
  try {
    const r = await timeoutFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=pt&format=json`);
    const j = await r.json();
    return (j.results || []).filter(x => !uf || (x.country_code === "BR" && low(x.admin1) === low(UF[uf])))
      .map(x => ({ name: x.name, lat: x.latitude, lng: x.longitude, admin1: x.admin1 || "", cc: x.country_code || "", country: x.country || "" }));
  } catch (e) { return []; }
}

/* ---------- rota pela estrada ---------- */
// pts: [{lat,lng}] na ordem. Devolve { km, h (horas do roteador), line: [[lat,lng]…], legs: [km por trecho] } ou null
export function roadRoute(pts) {
  const key = "osrm3:" + pts.map(p => p.lat.toFixed(4) + "," + p.lng.toFixed(4)).join(";");
  const c = getC(key); if (c) return Promise.resolve(c);
  return once(key, async () => {
    try {
      const r = await timeoutFetch(`https://router.project-osrm.org/route/v1/driving/${pts.map(p => `${p.lng},${p.lat}`).join(";")}?overview=simplified&geometries=geojson`, 12000);
      const j = await r.json(); if (j.code !== "Ok" || !j.routes?.length) return null;
      const R = j.routes[0];
      const v = { km: R.distance / 1000, h: R.duration / 3600, legs: R.legs.map(l => l.distance / 1000), line: R.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]) };
      setC(key, v); return v;
    } catch (e) { return null; }
  });
}
// Distância ao longo da linha até o ponto mais próximo dela (e quão longe da linha ele fica)
export function along(line, p) {
  let acc = 0, best = { off: Infinity, km: 0 };
  for (let i = 1; i < line.length; i++) {
    const a = { lat: line[i - 1][0], lng: line[i - 1][1] }, b = { lat: line[i][0], lng: line[i][1] }, seg = distKm(a, b);
    const da = distKm(a, p), db = distKm(p, b);
    const f = seg > 0 ? Math.max(0, Math.min(1, (da * da - db * db + seg * seg) / (2 * seg * seg))) : 0;
    const q = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, off = distKm(q, p);
    if (off < best.off) best = { off, km: acc + seg * f };
    acc += seg;
  }
  return best;
}
export const lineKm = line => line.slice(1).reduce((s, p, i) => s + distKm({ lat: line[i][0], lng: line[i][1] }, { lat: p[0], lng: p[1] }), 0);
// Ponto da linha a "km" do início
export function pointAt(line, km) {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = { lat: line[i - 1][0], lng: line[i - 1][1] }, b = { lat: line[i][0], lng: line[i][1] }, seg = distKm(a, b);
    if (acc + seg >= km) { const f = seg ? (km - acc) / seg : 0; return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }; }
    acc += seg;
  }
  const l = line[line.length - 1]; return { lat: l[0], lng: l[1] };
}
function thin(line, n) { if (line.length <= n) return line; const out = [], step = (line.length - 1) / (n - 1); for (let i = 0; i < n; i++) out.push(line[Math.round(i * step)]); return out; }

/* ---------- postos no caminho ---------- */
// Postos (amenity=fuel) a até ~2 km da estrada, com a distância desde a saída.
// A rota é consultada em trechos de até ~120 km (servidor público aguenta melhor) e há um servidor reserva.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
async function overpass(q) {
  for (const url of OVERPASS) {
    try {
      const r = await timeoutFetch(url, 30000, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (r.ok) return await r.json();
    } catch (e) { /* tenta o próximo */ }
  }
  throw new Error("overpass");
}
function chunks(line, maxKm) {
  const out = []; let cur = [line[0]], acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += distKm({ lat: line[i - 1][0], lng: line[i - 1][1] }, { lat: line[i][0], lng: line[i][1] }); cur.push(line[i]);
    if (acc >= maxKm && i < line.length - 1) { out.push(cur); cur = [line[i]]; acc = 0; }
  }
  out.push(cur); return out;
}
// Devolve a lista de postos, ou null se o servidor não respondeu (aí NÃO quer dizer que não tem posto)
export function fuelOnRoute(line) {
  const key = "fuel4:" + thin(line, 12).map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join(";");
  const c = getC(key); if (c) return Promise.resolve(c);
  return once(key, async () => {
    try {
      const all = [];
      for (const part of chunks(line, 120)) {
        const pts = thin(part, 40).map(p => p.join(",")).join(",");
        const j = await overpass(`[out:json][timeout:25];(node(around:2000,${pts})[amenity=fuel];way(around:2000,${pts})[amenity=fuel];);out center tags;`);
        all.push(...(j.elements || []));
      }
      const seen = new Set(), list = [];
      all.forEach(e => {
        const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, t = e.tags || {}; if (lat == null || seen.has(e.type + e.id)) return; seen.add(e.type + e.id);
        const a = along(line, { lat, lng }); if (a.off >= 3) return;
        list.push({ lat, lng, km: Math.round(a.km), off: a.off, name: t.name || t.brand || "Posto", brand: t.brand || "", city: t["addr:city"] || "", h24: t.opening_hours === "24/7" });
      });
      list.sort((a, b) => a.km - b.km);
      const out = []; list.forEach(x => { const last = out[out.length - 1]; if (last && x.km - last.km < 3) { if (x.off < last.off) out[out.length - 1] = x; } else out.push(x); });
      setC(key, out); return out;
    } catch (e) { return null; }
  });
}
export const forgetFuel = () => { /* nada guardado quando falha: basta chamar de novo */ };
// Escolhe as paradas: anda até onde a autonomia segura deixa e para no último posto antes disso
export function planFuel(cands, total, safe) {
  const out = []; let pos = 0, warn = null;
  while (total - pos > safe) {
    const reach = cands.filter(x => x.km > pos && x.km - pos <= safe && x.km < total);
    if (!reach.length) { const nx = cands.find(x => x.km > pos); warn = { from: pos, gap: Math.round((nx ? Math.min(nx.km, total) : total) - pos) }; break; }
    const pick = reach[reach.length - 1]; out.push(pick); pos = pick.km;
  }
  return { stops: out, warn };
}

/* ---------- posição ---------- */
export function getPos() {
  const one = hi => new Promise(res => navigator.geolocation.getCurrentPosition(p => res({ pos: { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) } }), er => res({ err: er.code }), { enableHighAccuracy: hi, timeout: hi ? 15000 : 10000, maximumAge: 120000 }));
  if (!navigator.geolocation) return Promise.resolve({ err: 0 });
  return one(true).then(r => r.pos || r.err === 1 ? r : one(false));
}
export const POS_ERR = { 0: "Este aparelho não informa a localização.", 1: "A localização está bloqueada para o app. Libere nas configurações do navegador (ou no cadeado da barra de endereço) e tente de novo.", 2: "Não deu para achar a posição agora (sem GPS ou sinal).", 3: "O GPS demorou demais para responder." };
export async function placeName(pos) {
  const k = `rev3:${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}`; const c = getC(k); if (c) return c;
  try {
    const r = await timeoutFetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.lat}&lon=${pos.lng}&zoom=12&accept-language=pt-BR`, 6000);
    const j = await r.json(), a = j.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || "";
    const uf = (a["ISO3166-2-lvl4"] || "").replace(/^BR-/, "");
    const v = city ? `${city}${uf && uf.length === 2 ? " - " + uf : ""}` : ""; if (v) setC(k, v); return v;
  } catch (e) { return ""; }
}
