"use client";

// Vista RESEARCH — doc madre: docs/VISTA_RESEARCH.md (en TRD-FX).
// Tabs (keep-alive): ARGENTINA = 4 cuadrantes 50/50 (spread A−B · libre ·
// comparar · reportes 1816 en acordeón) · RENTA VARIABLE INTERNACIONAL = el
// tablero REUTERS (movido desde /trading el 2026-07-18).
// La IA no interviene: los reportes muestran el texto crudo, limpio.
import { useMemo, useState } from "react";
import { ResearchLab } from "@/components/research-lab";
import { ReutersView } from "@/components/reuters-view";

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
    <article className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-md overflow-hidden">
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

// ── Tabs de la vista (keep-alive, mismo patrón que trading-shell) ─────────────
type Tab = "argentina" | "rv-int";

export function ResearchView({ initial }: { initial: ResearchData }) {
  const [tab, setTab] = useState<Tab>("argentina");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["argentina"]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "argentina"} onClick={() => setTab("argentina")}>ARGENTINA</TabBtn>
        <TabBtn active={tab === "rv-int"} onClick={() => setTab("rv-int")}>RENTA VARIABLE INTERNACIONAL</TabBtn>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {visited.has("argentina") && (
          <Pane active={tab === "argentina"}>
            {/* 4 cuadrantes 50/50: TL spread · TR (libre) · BL comparar · BR reportes */}
            <div className="h-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2 p-2 min-h-0">
              <ResearchLab modoFijo="spread" />
              <section className="h-full min-h-0 bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg flex items-center justify-center">
                <span className="text-[10px] text-[var(--t-text-dim)]">— próximo módulo —</span>
              </section>
              <ResearchLab modoFijo="overlay" />
              <ReportesPanel initial={initial} />
            </div>
          </Pane>
        )}
        {visited.has("rv-int") && (
          <Pane active={tab === "rv-int"}>
            <ReutersView />
          </Pane>
        )}
      </div>
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={active ? "h-full w-full" : "hidden"}>{children}</div>;
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

// ── Cuadrante REPORTES (mails de 1816, acordeón por fuente) ──────────────────
function ReportesPanel({ initial }: { initial: ResearchData }) {
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
      <section className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center justify-between gap-3 bg-[var(--t-panel)]">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--t-text)]">Reportes</span>
          {fuentes.length > 0 && (
            <div className="flex rounded-md overflow-hidden border border-[var(--t-border-2)] bg-[var(--t-surface)]">
              {fuentes.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFuente(f)}
                  className={`text-[10px] font-semibold px-2.5 py-[3px] transition-colors ${
                    f === fuente
                      ? "bg-[var(--t-accent)] text-white"
                      : "text-[var(--t-text-muted)] hover:bg-[var(--t-surface-2)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-2.5 space-y-2 bg-[var(--t-surface)]/30">
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
  );
}
