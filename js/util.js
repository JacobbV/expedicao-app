// Expedição · utilidades compartilhadas pelas telas
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pad = n => String(n).padStart(2, "0");
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const parseISO = s => { const [y, m, d] = (s || "").split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); };
export const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WDL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const fmtD = s => s ? `${pad(parseISO(s).getDate())}/${pad(parseISO(s).getMonth() + 1)}` : "—";
export const fmtDW = s => s ? `${WD[parseISO(s).getDay()]} ${fmtD(s)}` : "—";
export const num = (v, d = 0) => v == null || v === "" || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
export const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const parseNum = v => { if (v == null || String(v).trim() === "") return null; const s = String(v).trim(); const n = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s); return isNaN(n) ? null : n; };
// horas decimais → "8h30"; "06:30" → 6.5
export const hhmm = h => { if (h == null || isNaN(h)) return "—"; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${pad(H % 24)}h${pad(M)}`; };
export const dur = h => { if (h == null || isNaN(h)) return "—"; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return M ? `${H}h${pad(M)}` : `${H}h`; };
export const toH = s => { if (!s) return null; const [h, m] = s.split(":").map(Number); return isNaN(h) ? null : h + (m || 0) / 60; };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const low = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), Math.max(2400, msg.length * 60));
}
export function openSheet(html, init, cls = "") {
  const L = $("#layer");
  L.innerHTML = `<div class="backdrop" data-close="1"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const sh = L.querySelector(".sheet");
  L.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeSheet));
  init?.(sh);
  if (!matchMedia("(pointer: coarse)").matches) sh.querySelector("input:not([type=checkbox]):not([type=file]), select, textarea")?.focus({ preventScroll: true });
}
export const closeSheet = () => { $("#layer").innerHTML = ""; };
// Confirmação em dois toques no mesmo botão (sem janela de alerta do navegador)
export function armed(btn, label, fn) {
  let on = false; const orig = btn.textContent;
  btn.addEventListener("click", () => { if (!on) { on = true; btn.textContent = label; setTimeout(() => { on = false; if (btn.isConnected) btn.textContent = orig; }, 4000); return; } fn(); });
}
export const ls = {
  get: (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  getJ: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? d; } catch (e) { return d; } },
  setJ: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
export function downloadFile(name, text, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/* ---------- ícones (desenhados para o app) ---------- */
export const IC = {
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
  roteiro: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h7"/>',
  mapa: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  checklist: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  gastos: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  grade: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  tempo: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z"/>',
  posto: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15"/><path d="M4 20h11M5 10h9"/><path d="M14 8l3 2v6.5a1.5 1.5 0 0 0 3 0V9l-2-3"/>',
  diario: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
  escudo: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  velocimetro: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.5"/>',
  cama: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
  pendencia: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  chave: '<path d="M14.5 4.5a4.5 4.5 0 0 0-4.3 5.8L4 16.5V20h3.5l6.2-6.2a4.5 4.5 0 1 0 .8-9.3z"/>',
  foto: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6l1.5-2h5L16 6"/><circle cx="12" cy="13" r="3.5"/>',
  roadbook: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  resumo: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  sino: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  cima: '<path d="M6 15l6-6 6 6"/>',
  baixo: '<path d="M6 9l6 6 6-6"/>',
  nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
  local: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="7"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 10"/>',
  telefone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  imprimir: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
};
export const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ""}</svg>`;
