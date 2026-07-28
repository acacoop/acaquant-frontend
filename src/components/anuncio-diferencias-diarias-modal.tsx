"use client";

// Anuncio de la NUEVA vista OPERACIONES → DIFERENCIAS DIARIAS. Mismo patrón que
// el de Dólar Futuro: aparece SOLO a los roles de la mesa (admin / trader /
// sales / asistente_comercial), NUNCA al invitado, una vez por carga dentro de
// la ventana de lanzamiento (hoy y mañana ART), salvo "No volver a mostrar"
// (localStorage). Montado en layout.tsx. El botón deja abierta la sub-pestaña
// (sessionStorage "operaciones.tab" = "diferencias") y navega a /operaciones.
import { useEffect, useState } from "react";

const KEY = "anuncio.diferenciasdiarias.lanzamiento.2026-07";
const VENTANA = new Set(["2026-07-28", "2026-07-29"]);   // solo hoy y mañana (ART)
const ROLES_OK = new Set(["admin", "trader", "sales", "asistente_comercial"]);

function hoyART(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Qué muestra la vista (paneles).
const BLOQUES: { icon: string; titulo: string; desc: string }[] = [
  { icon: "💵", titulo: "Neto por moneda", desc: "USDL y ARS por separado (nunca se mezclan): resultado neto de la liquidación diaria de futuros." },
  { icon: "📦", titulo: "Por producto e instrumento", desc: "Desglose por producto (soja, maíz, trigo, dólar futuro…) y por vencimiento." },
  { icon: "👤", titulo: "Por cuenta", desc: "Qué comitente ganó o perdió con la diferencia diaria de sus posiciones." },
  { icon: "📊", titulo: "Evolución en el tiempo", desc: "Barras verdes/rojas por día, semana o mes según diferencia a favor o en contra." },
];

export function AnuncioDiferenciasDiariasModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!VENTANA.has(hoyART())) return;
    try { if (localStorage.getItem(KEY) === "1") return; } catch { return; }
    // Gate por rol: solo la mesa, nunca el invitado. El backend igual protege
    // los datos (default-deny); esto es solo UX del anuncio.
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { role?: string } | null) => {
        if (m?.role && ROLES_OK.has(m.role)) setOpen(true);
      })
      .catch(() => { /* sin /api/me → no mostrar */ });
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

  // Deja la sub-pestaña DIFERENCIAS DIARIAS abierta y navega a /operaciones.
  const irADiferencias = () => {
    try { sessionStorage.setItem("operaciones.tab", JSON.stringify("diferencias")); } catch { /* noop */ }
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
            <span className="text-[10px] font-mono text-[var(--t-text-dim)]">Operaciones · Julio 2026</span>
            <button onClick={() => setOpen(false)} aria-label="Cerrar"
              className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[16px] leading-none">✕</button>
          </div>
          <h2 className="text-[22px] font-bold text-[var(--t-text)] leading-tight">
            Nueva vista <span className="text-[var(--t-accent)]">DIFERENCIAS DIARIAS</span>
          </h2>
          <p className="text-[12px] text-[var(--t-text-muted)] leading-snug mt-2">
            Dentro de <span className="text-[var(--t-text)] font-semibold">OPERACIONES</span> ya podés ver
            las <span className="text-[var(--t-text)] font-semibold">diferencias diarias</span> de los futuros
            (liquidación mark-to-market de ROFEX/CME): el <span className="text-[var(--t-text)] font-semibold">resultado neto</span> a
            favor o en contra, cruzable por producto, cuenta y vencimiento, con USDL y ARS por separado.
          </p>
        </div>

        {/* Bloques */}
        <div className="px-6 py-4 overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--t-text-dim)] mb-2">Qué vas a ver</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BLOQUES.map((f) => (
              <div key={f.titulo} className="flex gap-2.5 p-3 rounded-md border border-[var(--t-border)] bg-[var(--t-surface)]/40">
                <span className="text-[18px] leading-none shrink-0">{f.icon}</span>
                <div>
                  <div className="text-[12.5px] font-semibold text-[var(--t-text)]">{f.titulo}</div>
                  <div className="text-[11px] text-[var(--t-text-muted)] leading-snug mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-[var(--t-border)] bg-[var(--t-surface)]/30">
          <button onClick={noMostrarMas}
            className="text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors">
            No volver a mostrar
          </button>
          <a href="/operaciones" onClick={irADiferencias}
            className="ml-auto px-4 py-1.5 text-[12px] font-semibold rounded bg-[var(--t-accent)] text-white hover:opacity-90 transition-opacity">
            Ir a Diferencias Diarias →
          </a>
        </div>
      </div>
    </div>
  );
}
