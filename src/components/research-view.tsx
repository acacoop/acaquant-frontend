"use client";

// Vista RESEARCH — doc madre: docs/VISTA_RESEARCH.md (en TRD-FX).
// Tabs (keep-alive): ARGENTINA = 4 cuadrantes 50/50 (spread A−B · libre ·
// comparar · reportes 1816 en acordeón) · RENTA VARIABLE INTERNACIONAL = el
// tablero REUTERS (movido desde /trading el 2026-07-18).
// La IA no interviene: los reportes muestran el texto crudo, limpio.
import { useEffect, useMemo, useState } from "react";
import { ResearchBcra } from "@/components/research-bcra";
import { type Doc, PdfViewer } from "@/components/research-documentos";
import { ResearchFred } from "@/components/research-fred";
import { Maximizable } from "@/components/maximizable";
import { ResearchLab } from "@/components/research-lab";
import { ResearchRetornoTotal } from "@/components/research-retorno-total";
import { ReutersView } from "@/components/reuters-view";
import { SensibilidadTable } from "@/components/sensibilidad-table";
import { MESES_CORTOS as MESES } from "@/lib/fmt";

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

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MESES[Number(m) - 1] ?? m} ${y}`;
}
const limpiarAsunto = (a: string | null) => (a || "").replace(/^(RV:|V:|Fwd:|Fw:)\s*/i, "").trim();

// Un párrafo: si arranca con un TITULAR en mayúscula (estilo 1816), lo resalta.
// Cuerpo en --t-text (el muted era ilegible en los dos temas — feedback del user
// 2026-07-18); el titular se distingue por PESO (bold) + acento, no por gris.
function Parrafo({ texto }: { texto: string }) {
  const m = texto.match(/^([^a-záéíóúñ]*?[.;:])\s+([\s\S]+)$/);
  const titular = m && m[1].replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length >= 8 ? m[1] : null;
  return (
    <p className="text-[12.5px] leading-[1.6] text-[var(--t-text)]">
      {titular
        ? <><span className="font-bold text-[var(--t-accent)]">{titular}</span> {m![2]}</>
        : texto}
    </p>
  );
}

// ── Tabs de la vista (keep-alive, mismo patrón que trading-shell) ─────────────
type Tab = "argentina" | "sensibilidad" | "reportes" | "bcra" | "internacional" | "rv-int";

export function ResearchView({ initial }: { initial: ResearchData }) {
  const [tab, setTab] = useState<Tab>("argentina");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["argentina"]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "argentina"} onClick={() => setTab("argentina")}>RENTA FIJA ARGENTINA</TabBtn>
        {/* ANÁLISIS SENSIBILIDAD vivía en /retorno (vista ESTRATEGIA, eliminada
            2026-08-30). Se mudó acá tal cual: mismo componente, mismo endpoint
            (/api/analitica/sensibilidad-retorno). */}
        <TabBtn active={tab === "sensibilidad"} onClick={() => setTab("sensibilidad")}>ANÁLISIS SENSIBILIDAD</TabBtn>
        <TabBtn active={tab === "reportes"} onClick={() => setTab("reportes")}>REPORTES FINANCIEROS</TabBtn>
        <TabBtn active={tab === "bcra"} onClick={() => setTab("bcra")}>BCRA</TabBtn>
        <TabBtn active={tab === "internacional"} onClick={() => setTab("internacional")}>DATOS INTERNACIONALES</TabBtn>
        <TabBtn active={tab === "rv-int"} onClick={() => setTab("rv-int")}>RENTA VARIABLE INTERNACIONAL</TabBtn>
        {/* UN copiloto para toda Research (vista `research`): manda la tab activa
            como params y el server arma el contexto de ESA tab + los mails 1816.
            En RV INTERNACIONAL no se muestra: esa tab tiene su vista `reuters`. */}
        {tab !== "rv-int" && (
          <div className="ml-auto">
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {visited.has("argentina") && (
          <Pane active={tab === "argentina"}>
            {/* 3 paneles: spread · comparar · retorno total. Forwards se mudó a renta fija. */}
            <div className="h-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2 p-2 min-h-0">
              {/* FORWARDS se MUDÓ a la tab FORWARDS de renta fija (rediseño
                  2026-08-15): es donde se usa y no puede estar en dos lugares
                  yéndose de a poco cada uno para su lado. */}
              <Maximizable><ResearchLab modoFijo="spread" /></Maximizable>
              <Maximizable><ResearchLab modoFijo="overlay" /></Maximizable>
              <Maximizable><ResearchRetornoTotal /></Maximizable>
            </div>
          </Pane>
        )}
        {visited.has("sensibilidad") && (
          <Pane active={tab === "sensibilidad"}>
            <Maximizable><SensibilidadTable compact /></Maximizable>
          </Pane>
        )}
        {visited.has("reportes") && (
          <Pane active={tab === "reportes"}>
            <Maximizable><ReportesFinancieros initial={initial} /></Maximizable>
          </Pane>
        )}
        {visited.has("bcra") && (
          <Pane active={tab === "bcra"}>
            <Maximizable><ResearchBcra /></Maximizable>
          </Pane>
        )}
        {visited.has("internacional") && (
          <Pane active={tab === "internacional"}>
            <Maximizable><ResearchFred /></Maximizable>
          </Pane>
        )}
        {visited.has("rv-int") && (
          <Pane active={tab === "rv-int"}>
            <Maximizable><ReutersView /></Maximizable>
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

// ── REPORTES FINANCIEROS: UN feed unificado (mails 1816/ACA + documentos manuales),
//    lista a la izquierda por fecha, contenido a la derecha (texto / PDF / comentario).
interface FeedItem {
  key: string; kind: "mail" | "pdf" | "comentario"; fecha: string | null;
  titulo: string; fuente: string; mail?: ResearchMail; docId?: number; comentario?: string | null;
}

function ReportesFinancieros({ initial }: { initial: ResearchData }) {
  const [mails, setMails] = useState<ResearchMail[]>(initial.items);
  const [total] = useState(initial.total);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/research-docs/list", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { documentos: [] }))
      .then((d) => { if (vivo) setDocs(d.documentos || []); })
      .catch(() => { /* noop */ });
    return () => { vivo = false; };
  }, []);

  const feed: FeedItem[] = useMemo(() => {
    const a: FeedItem[] = mails.map((m) => ({
      key: `mail:${m.id}`, kind: "mail", fecha: m.fecha,
      titulo: limpiarAsunto(m.asunto) || "Reporte", fuente: m.fuente_label || "1816", mail: m,
    }));
    const b: FeedItem[] = docs.map((d) => ({
      key: `doc:${d.id}`, kind: d.tipo === "pdf" ? "pdf" : "comentario", fecha: d.fecha,
      titulo: d.titulo, fuente: d.fuente || "Manual", docId: d.id, comentario: d.comentario,
    }));
    return [...a, ...b].sort((x, y) => String(y.fecha || "").localeCompare(String(x.fecha || "")));
  }, [mails, docs]);

  const selKey = sel ?? feed[0]?.key ?? null;
  const item = feed.find((f) => f.key === selKey) ?? null;

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const r = await fetch(`/api/research1816/mails?limit=30&offset=${mails.length}`);
      const d: ResearchData = await r.json();
      setMails((prev) => [...prev, ...(d.items || [])]);
    } catch { /* noop */ } finally { setCargandoMas(false); }
  };

  const parrafos = (t: string | null) =>
    (t || "").split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);

  return (
    <div className="h-full min-h-0 flex gap-2 p-2">
      {/* Lista unificada */}
      <div className="w-72 shrink-0 min-h-0 flex flex-col border border-[var(--t-border)] rounded-lg bg-[var(--t-panel)] overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          {feed.map((f) => (
            <button key={f.key} type="button" onClick={() => setSel(f.key)}
              className={`w-full text-left px-3 py-2 border-b border-[var(--t-border)] transition-colors ${f.key === selKey ? "bg-[var(--t-accent)]/12" : "hover:bg-[var(--t-surface)]/50"}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-[var(--t-border-2)] text-[var(--t-text-muted)]">{f.kind}</span>
                <span className="text-[10px] text-[var(--t-accent)] font-semibold whitespace-nowrap">{fmtFecha(f.fecha)}</span>
                <span className="text-[9px] text-[var(--t-text-dim)] ml-auto truncate max-w-[80px]">{f.fuente}</span>
              </div>
              <div className="text-[12px] text-[var(--t-text)] truncate mt-0.5">{f.titulo}</div>
            </button>
          ))}
          {mails.length < total && (
            <button type="button" onClick={cargarMas} disabled={cargandoMas}
              className="w-full py-1.5 text-[11px] font-semibold text-[var(--t-text-muted)] hover:bg-[var(--t-border-2)]/30 disabled:opacity-50">
              {cargandoMas ? "Cargando…" : `Cargar más reportes (${total - mails.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Visor */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] rounded-lg bg-[var(--t-panel)] overflow-hidden flex flex-col">
        {!item ? (
          <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-dim)] px-6 text-center">
            No hay reportes ni documentos todavía. Los mails aparecen solos; los documentos se cargan desde Manager → DOCUMENTOS.
          </div>
        ) : item.kind === "pdf" ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-2 shrink-0">
              <span className="text-[12px] font-semibold text-[var(--t-text)] truncate">{item.titulo}</span>
              <a href={`/api/research-docs/${item.docId}/pdf`} target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-[var(--t-accent)] hover:underline whitespace-nowrap">abrir en pestaña ↗</a>
            </div>
            <div className="flex-1 min-h-0"><PdfViewer docId={item.docId!} titulo={item.titulo} /></div>
          </>
        ) : (
          <div className="min-h-0 overflow-auto px-5 py-4">
            <div className="text-[13px] font-semibold text-[var(--t-accent)] mb-1">{item.titulo}</div>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-3">{fmtFecha(item.fecha)} · {item.fuente}</div>
            {item.kind === "comentario"
              ? <p className="text-[13px] leading-[1.6] text-[var(--t-text)] whitespace-pre-wrap">{item.comentario}</p>
              : <div className="space-y-3">{parrafos(item.mail?.texto ?? null).map((p, i) => <Parrafo key={i} texto={p} />)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
