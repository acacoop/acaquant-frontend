"use client";

// Vista RESEARCH — doc madre: docs/VISTA_RESEARCH.md (en TRD-FX).
// Split 50/50: IZQUIERDA = Market Data 1816 (placeholder hasta la API key) ·
// DERECHA = REPORTES: research por fuente (1816, …), en acordeón (fecha+título →
// click → contenido). La IA no interviene: se muestra el texto crudo, limpio.
import { useMemo, useState } from "react";

export interface ResearchDestilado { resumen?: string; temas?: string[]; hechos?: { hecho: string }[] }
export interface ResearchMail {
  id: number;
  fecha: string | null;
  fuente: string | null;
  fuente_label: string;
  asunto: string | null;
  tipo: string;
  texto: string | null;              // crudo limpio, en párrafos
  destilado: ResearchDestilado | null;  // opcional (solo si se corrió --destilar)
}
export interface ResearchData { items: ResearchMail[]; total: number }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MESES[Number(m) - 1] ?? m} ${y}`;
}
const limpiarAsunto = (a: string | null) => (a || "").replace(/^(RV:|V:|Fwd:|Fw:)\s*/i, "").trim();

// Un párrafo: si arranca con un TITULAR en mayúscula (estilo 1816), lo resalta.
function Parrafo({ texto }: { texto: string }) {
  const m = texto.match(/^([^a-záéíóúñ]*?[.;:])\s+([\s\S]+)$/);
  const titular = m && m[1].replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length >= 8 ? m[1] : null;
  return (
    <p className="text-[12.5px] leading-[1.6] text-[var(--t-text-muted)]">
      {titular
        ? <><span className="font-semibold text-[var(--t-text)]">{titular}</span> {m![2]}</>
        : texto}
    </p>
  );
}

function ReporteItem({ m, abierto, onToggle }: { m: ResearchMail; abierto: boolean; onToggle: () => void }) {
  const parrafos = useMemo(
    () => (m.texto || "").split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean),
    [m.texto],
  );
  return (
    <article className="border border-[var(--t-border)] rounded-md overflow-hidden">
      {/* Cabecera — color distinto del cuerpo. Click abre/cierra. */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-[var(--t-accent)]/8 hover:bg-[var(--t-accent)]/15 transition-colors"
      >
        <span className={`text-[10px] text-[var(--t-text-dim)] transition-transform ${abierto ? "rotate-90" : ""}`}>▶</span>
        <span className="text-[12px] font-semibold text-[var(--t-accent)] whitespace-nowrap">{fmtFecha(m.fecha)}</span>
        <span className="text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--t-border-2)] text-[var(--t-text-muted)]">{m.tipo}</span>
        <span className="text-[12px] text-[var(--t-text)] truncate flex-1" title={limpiarAsunto(m.asunto)}>
          {limpiarAsunto(m.asunto) || "Reporte"}
        </span>
      </button>

      {abierto && (
        <div className="px-4 py-3 border-t border-[var(--t-border)] space-y-3">
          {parrafos.length > 0
            ? parrafos.map((p, i) => <Parrafo key={i} texto={p} />)
            : <p className="text-[11px] text-[var(--t-text-dim)] italic">(sin texto)</p>}
        </div>
      )}
    </article>
  );
}

export function ResearchView({ initial }: { initial: ResearchData }) {
  const [items, setItems] = useState<ResearchMail[]>(initial.items);
  const [total] = useState(initial.total);
  const [cargando, setCargando] = useState(false);

  // Fuentes disponibles (1816, ACA VALORES, …) — selector estilo News.
  const fuentes = useMemo(() => {
    const set = new Set(items.map((m) => m.fuente_label || "1816"));
    return Array.from(set);
  }, [items]);
  const [fuente, setFuente] = useState<string>(initial.items[0]?.fuente_label || "1816");
  const visibles = useMemo(() => items.filter((m) => (m.fuente_label || "1816") === fuente), [items, fuente]);

  // Acordeón: arranca abierto el más reciente de la fuente elegida.
  const [abiertoId, setAbiertoId] = useState<number | null>(initial.items[0]?.id ?? null);

  const cargarMas = async () => {
    setCargando(true);
    try {
      const r = await fetch(`/api/research1816/mails?limit=30&offset=${items.length}`);
      const d: ResearchData = await r.json();
      setItems((prev) => [...prev, ...(d.items || [])]);
    } catch { /* noop */ } finally { setCargando(false); }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 gap-2 p-2">
      {/* IZQUIERDA — Market Data 1816 (placeholder hasta la API key) */}
      <section className="lg:w-1/2 min-h-0 flex flex-col border border-[var(--t-border)] rounded-md">
        <div className="px-3 py-2.5 border-b border-[var(--t-border)] text-[11px] uppercase tracking-widest text-[var(--t-text-muted)]">
          Market Data
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <div className="text-[13px] font-semibold text-[var(--t-text)] mb-1">Próximamente: series históricas</div>
            <p className="text-[11px] text-[var(--t-text-muted)] leading-relaxed">
              Series históricas de 1816 (precio, paridad, TNA/TEA, duration…) de soberanos y
              corporativos, más los indicadores del día. Pendiente de conectar la API de 1816.
            </p>
          </div>
        </div>
      </section>

      {/* DERECHA — REPORTES */}
      <section className="lg:w-1/2 min-h-0 flex flex-col border border-[var(--t-border)] rounded-md">
        <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center justify-between gap-3">
          <span className="text-[11px] uppercase tracking-widest text-[var(--t-text-muted)]">Reportes</span>
          {fuentes.length > 0 && (
            <div className="flex items-center gap-1">
              {fuentes.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFuente(f)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                    f === fuente
                      ? "bg-[var(--t-accent)] text-white"
                      : "border border-[var(--t-border)] text-[var(--t-text-muted)] hover:bg-[var(--t-border-2)]/30"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2.5 space-y-2">
          {visibles.length === 0 && (
            <div className="text-[11px] text-[var(--t-text-dim)] p-4 text-center">
              No hay reportes de {fuente} todavía. Aparecen acá apenas los ingesta el sistema.
            </div>
          )}
          {visibles.map((m) => (
            <ReporteItem
              key={m.id}
              m={m}
              abierto={abiertoId === m.id}
              onToggle={() => setAbiertoId((cur) => (cur === m.id ? null : m.id))}
            />
          ))}
          {items.length < total && (
            <button
              type="button"
              onClick={cargarMas}
              disabled={cargando}
              className="w-full py-1.5 text-[11px] font-semibold border border-[var(--t-border)] rounded text-[var(--t-text-muted)] hover:bg-[var(--t-border-2)]/30 disabled:opacity-50"
            >
              {cargando ? "Cargando…" : `Cargar más (${total - items.length} restantes)`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
