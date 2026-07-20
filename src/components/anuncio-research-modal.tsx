"use client";

// Anuncio de la NUEVA vista RESEARCH. Aparece SOLO el 20 y 21 de julio 2026 (hora
// ART), una vez por carga, salvo que el usuario toque "No volver a mostrar"
// (localStorage → no vuelve nunca). Montado en layout.tsx (toda la app). Tono
// interno/informativo: qué se integró y qué datos hay ahora. Contenido estático.
import { useEffect, useState } from "react";

const KEY = "anuncio.research.lanzamiento.2026-07";
const VENTANA = new Set(["2026-07-20", "2026-07-21"]);   // días que se muestra (ART)

function hoyART(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const CHIPS = ["1816", "Reuters / Eikon", "FRED", "BCRA"];

// Datos de mercado disponibles ahora (por bloque).
const DATOS: { icon: string; titulo: string; desc: string }[] = [
  { icon: "🇺🇸", titulo: "Estados Unidos", desc: "Tasas del Tesoro (2/5/10/30 años), inflación (CPI, PCE), empleo, actividad y volatilidad (VIX)." },
  { icon: "🌾", titulo: "Commodities y agro", desc: "Soja, harina y aceite de soja, maíz, trigo, petróleo (WTI/Brent), cobre y gas." },
  { icon: "🌐", titulo: "Global y emergentes", desc: "Dólar y monedas (real, yuan, yen, euro, peso mex.), spreads de crédito (High Yield, IG, emergentes), China, Brasil y liquidez de la Fed." },
  { icon: "🏦", titulo: "BCRA", desc: "Reservas, tasas, base monetaria, inflación, CER/UVA y depósitos, en series históricas." },
];

export function AnuncioResearchModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (VENTANA.has(hoyART()) && localStorage.getItem(KEY) !== "1") setOpen(true);
    } catch { /* localStorage no disponible → no mostrar */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const noMostrarMas = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* noop */ }
    setOpen(false);
  };

  return (
    <div onClick={() => setOpen(false)}
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[var(--t-panel)] border border-[var(--t-accent)] rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        <div className="h-1 bg-[var(--t-accent)]" />

        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-[var(--t-border)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[var(--t-accent)] text-white">Nuevo</span>
            <span className="text-[10px] font-mono text-[var(--t-text-dim)]">Julio 2026</span>
            <button onClick={() => setOpen(false)} aria-label="Cerrar"
              className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[16px] leading-none">✕</button>
          </div>
          <h2 className="text-[22px] font-bold text-[var(--t-text)] leading-tight">
            Nueva vista <span className="text-[var(--t-accent)]">RESEARCH</span>
          </h2>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--t-text-dim)]">Integrada a</span>
            {CHIPS.map((c) => (
              <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--t-border-2)] text-[var(--t-text-muted)]">{c}</span>
            ))}
          </div>
        </div>

        {/* Datos disponibles */}
        <div className="px-6 py-4 overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--t-text-dim)] mb-2">Datos disponibles ahora</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DATOS.map((f) => (
              <div key={f.titulo} className="flex gap-2.5 p-3 rounded-md border border-[var(--t-border)] bg-[var(--t-surface)]/40">
                <span className="text-[18px] leading-none shrink-0">{f.icon}</span>
                <div>
                  <div className="text-[12.5px] font-semibold text-[var(--t-text)]">{f.titulo}</div>
                  <div className="text-[11px] text-[var(--t-text-muted)] leading-snug mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Reportes / documentos — ancho completo */}
          <div className="flex gap-2.5 p-3 rounded-md border border-[var(--t-border)] bg-[var(--t-surface)]/40 mt-3">
            <span className="text-[18px] leading-none shrink-0">📰</span>
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--t-text)]">Reportes financieros</div>
              <div className="text-[11px] text-[var(--t-text-muted)] leading-snug mt-0.5">
                Los reportes diarios de 1816 y ACA VALORES, más PDFs (el Semanal) y notas que se cargan a mano desde Manager, todos en un mismo lugar.
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 p-3 rounded-md border border-[var(--t-border)] bg-[var(--t-surface)]/40 mt-3">
            <span className="text-[18px] leading-none shrink-0">📈</span>
            <div>
              <div className="text-[12.5px] font-semibold text-[var(--t-text)]">Renta Fija Argentina</div>
              <div className="text-[11px] text-[var(--t-text-muted)] leading-snug mt-0.5">
                Spreads, forwards, comparador de curvas y Retorno Total por bono (con carry en USD).
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-[var(--t-border)] bg-[var(--t-surface)]/30">
          <button onClick={noMostrarMas}
            className="text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors">
            No volver a mostrar
          </button>
          <a href="/research" onClick={() => setOpen(false)}
            className="ml-auto px-4 py-1.5 text-[12px] font-semibold rounded bg-[var(--t-accent)] text-white hover:opacity-90 transition-opacity">
            Explorar Research →
          </a>
        </div>
      </div>
    </div>
  );
}
