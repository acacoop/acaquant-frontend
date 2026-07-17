"use client";

// Vista RESEARCH (Nivel 1) — doc madre: docs/VISTA_RESEARCH.md (en TRD-FX).
// Split 50/50: IZQUIERDA = Market Data 1816 (placeholder hasta la API key) ·
// DERECHA = research diario de 1816 (mails), con destilado IA + búsqueda full-text.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ResearchHecho { hecho: string; tema?: string }
export interface ResearchDestilado { resumen?: string; temas?: string[]; hechos?: ResearchHecho[] }
export interface ResearchMail {
  id: number;
  fecha: string | null;
  fuente: string | null;
  asunto: string | null;
  tipo: string;
  texto: string | null;        // crudo limpio (headers/pie del reenvío ya sacados)
  destilado: ResearchDestilado | null;  // opcional — solo si se corrió --destilar
  fragmento?: string;
}
export interface ResearchData { items: ResearchMail[]; total: number }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  return `${d} ${MESES[mi] ?? m} ${y}`;
}

// Resalta el fragmento del buscador de forma SEGURA (el server marca los matches
// con « » vía ts_headline — nunca HTML crudo del mail).
function Resaltado({ texto }: { texto: string }) {
  const partes = texto.split(/«(.+?)»/g);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-[var(--t-accent)]/25 text-[var(--t-text)] rounded px-0.5">{p}</mark>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    diario: "bg-[#094293] text-white",
    mensual: "bg-amber-500 text-white",
  };
  const cls = map[tipo] || "bg-[var(--t-border-2)] text-[var(--t-text-muted)]";
  return <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>{tipo}</span>;
}

// El research en párrafos legibles. Los títulos de 1816 vienen en MAYÚSCULA →
// se resaltan solos. Los saltos sueltos dentro de un párrafo se reflowean.
function ResearchTexto({ texto }: { texto: string }) {
  const parrafos = texto
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return (
    <div className="space-y-2.5">
      {parrafos.map((p, i) => (
        <p key={i} className="text-[12px] leading-relaxed text-[var(--t-text)] text-justify">{p}</p>
      ))}
    </div>
  );
}

function MailCard({ m }: { m: ResearchMail }) {
  const d = m.destilado;
  return (
    <article className="border border-[var(--t-border)] rounded-md p-3">
      <header className="flex items-center gap-2 flex-wrap mb-2 pb-2 border-b border-[var(--t-border)]">
        <span className="text-[13px] font-semibold text-[var(--t-text)]">{fmtFecha(m.fecha)}</span>
        <TipoBadge tipo={m.tipo} />
        <span className="text-[10px] text-[var(--t-text-dim)] truncate max-w-full" title={m.asunto || ""}>
          {(m.asunto || "").replace(/^(RV:|V:|Fwd:|Fw:)\s*/i, "")}
        </span>
      </header>

      {/* Al buscar: el fragmento resaltado arriba */}
      {m.fragmento && (
        <p className="text-[11px] text-[var(--t-text-muted)] mb-2 leading-relaxed italic">
          …<Resaltado texto={m.fragmento} />…
        </p>
      )}

      {/* Resumen IA — SOLO si se destiló (opt-in, no automático) */}
      {d?.resumen && (
        <div className="mb-2 p-2 rounded bg-[var(--t-border-2)]/20 border-l-2 border-[var(--t-accent)]">
          <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] mb-0.5">Resumen IA</div>
          <p className="text-[11px] text-[var(--t-text-muted)] leading-relaxed">{d.resumen}</p>
        </div>
      )}

      {/* El research, tal cual — el texto es lo principal */}
      {m.texto
        ? <ResearchTexto texto={m.texto} />
        : <p className="text-[11px] text-[var(--t-text-dim)] italic">(sin texto)</p>}
    </article>
  );
}

export function ResearchView({ initial }: { initial: ResearchData }) {
  const [items, setItems] = useState<ResearchMail[]>(initial.items);
  const [total] = useState(initial.total);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [modoBusqueda, setModoBusqueda] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (t.length < 2) {
      setModoBusqueda(false);
      setItems(initial.items);
      return;
    }
    setBuscando(true);
    setModoBusqueda(true);
    try {
      const r = await fetch(`/api/research1816/mails/buscar?q=${encodeURIComponent(t)}`);
      const d: ResearchData = await r.json();
      setItems(d.items || []);
    } catch {
      setItems([]);
    } finally {
      setBuscando(false);
    }
  }, [initial.items]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => buscar(q), 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, buscar]);

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const r = await fetch(`/api/research1816/mails?limit=30&offset=${items.length}`);
      const d: ResearchData = await r.json();
      setItems((prev) => [...prev, ...(d.items || [])]);
    } catch { /* noop */ } finally { setCargandoMas(false); }
  };

  const hayMas = useMemo(() => !modoBusqueda && items.length < total, [modoBusqueda, items.length, total]);

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0 gap-2 p-2">
      {/* IZQUIERDA — Market Data 1816 (placeholder hasta la API key) */}
      <section className="lg:w-1/2 min-h-0 flex flex-col border border-[var(--t-border)] rounded-md">
        <div className="px-3 py-2 border-b border-[var(--t-border)] text-[11px] uppercase tracking-widest text-[var(--t-text-muted)]">
          Market Data — 1816
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <div className="text-[13px] font-semibold text-[var(--t-text)] mb-1">Próximamente: series históricas</div>
            <p className="text-[11px] text-[var(--t-text-muted)] leading-relaxed">
              Acá van a vivir las series históricas de 1816 (precio, paridad, TNA/TEA,
              duration…) de soberanos y corporativos, más los indicadores del día.
              Pendiente de conectar la API de 1816 (falta la API key).
            </p>
          </div>
        </div>
      </section>

      {/* DERECHA — Research diario (mails de 1816) */}
      <section className="lg:w-1/2 min-h-0 flex flex-col border border-[var(--t-border)] rounded-md">
        <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-[var(--t-text-muted)] whitespace-nowrap">
            Research diario — 1816
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (ej. BCRA, licitación, AO29)…"
            className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded bg-transparent border border-[var(--t-border)] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)]"
          />
          {buscando && <span className="text-[10px] text-[var(--t-text-dim)]">…</span>}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
          {items.length === 0 && (
            <div className="text-[11px] text-[var(--t-text-dim)] p-4 text-center">
              {modoBusqueda ? "Sin resultados para esa búsqueda." : "Todavía no hay research cargado. Los mails de 1816 aparecen acá apenas los ingesta el sistema."}
            </div>
          )}
          {items.map((m) => <MailCard key={m.id} m={m} />)}
          {hayMas && (
            <button
              type="button"
              onClick={cargarMas}
              disabled={cargandoMas}
              className="w-full py-1.5 text-[11px] font-semibold border border-[var(--t-border)] rounded text-[var(--t-text-muted)] hover:bg-[var(--t-border-2)]/30 disabled:opacity-50"
            >
              {cargandoMas ? "Cargando…" : `Cargar más (${total - items.length} restantes)`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
