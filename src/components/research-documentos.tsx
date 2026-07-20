"use client";

// REPORTES FINANCIEROS → sub-tab DOCUMENTOS: lo que se carga a mano desde Manager
// (PDFs como el "Semanal" + comentarios). Master-detail: lista a la izquierda,
// visor a la derecha (PDF embebido en iframe / comentario como texto). Read-only;
// la carga vive en Manager → DOCUMENTOS. Doc: TRD-FX docs/RESEARCH_FRED.md.
import { useEffect, useMemo, useState } from "react";

interface Doc {
  id: number; titulo: string; fecha: string | null; tipo: string; fuente: string | null;
  comentario: string | null; nombre_archivo: string | null; tiene_pdf: boolean;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MESES[Number(m) - 1] ?? m} ${y}`;
}

export function DocumentosPanel() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/research-docs/list", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { if (vivo) { const ds: Doc[] = d.documentos || []; setDocs(ds); setSel(ds[0]?.id ?? null); } })
      .catch((e) => { if (vivo) setErr(`No pude cargar los documentos (${e.message}).`); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const doc = useMemo(() => docs.find((x) => x.id === sel) ?? null, [docs, sel]);

  if (cargando) return <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">Cargando…</div>;
  if (err) return <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-neg)] px-6 text-center">{err}</div>;
  if (docs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-dim)] px-6 text-center">
        Todavía no hay documentos cargados. Se agregan desde <b className="mx-1">Manager → DOCUMENTOS</b> (PDFs o comentarios).
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex gap-2">
      {/* Lista */}
      <div className="w-64 shrink-0 min-h-0 overflow-auto border border-[var(--t-border)] rounded-lg bg-[var(--t-panel)]">
        {docs.map((d) => (
          <button key={d.id} type="button" onClick={() => setSel(d.id)}
            className={`w-full text-left px-3 py-2 border-b border-[var(--t-border)] transition-colors ${d.id === sel ? "bg-[var(--t-accent)]/12" : "hover:bg-[var(--t-surface)]/50"}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase px-1 py-0.5 rounded bg-[var(--t-border-2)] text-[var(--t-text-muted)]">{d.tipo}</span>
              <span className="text-[10px] text-[var(--t-accent)] font-semibold whitespace-nowrap">{fmtFecha(d.fecha)}</span>
            </div>
            <div className="text-[12px] text-[var(--t-text)] truncate mt-0.5">{d.titulo}</div>
            {d.fuente && <div className="text-[9px] text-[var(--t-text-dim)]">{d.fuente}</div>}
          </button>
        ))}
      </div>

      {/* Visor */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] rounded-lg bg-[var(--t-panel)] overflow-hidden flex flex-col">
        {!doc ? (
          <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">Elegí un documento.</div>
        ) : doc.tiene_pdf ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--t-text)] truncate">{doc.titulo}</span>
              <a href={`/api/research-docs/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer"
                className="ml-auto text-[10px] text-[var(--t-accent)] hover:underline whitespace-nowrap">abrir en pestaña ↗</a>
            </div>
            <iframe title={doc.titulo} src={`/api/research-docs/${doc.id}/pdf`} className="flex-1 w-full border-0" />
          </>
        ) : (
          <div className="min-h-0 overflow-auto p-5">
            <div className="text-[13px] font-semibold text-[var(--t-accent)] mb-1">{doc.titulo}</div>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-3">{fmtFecha(doc.fecha)}{doc.fuente ? ` · ${doc.fuente}` : ""}</div>
            <p className="text-[13px] leading-[1.6] text-[var(--t-text)] whitespace-pre-wrap">{doc.comentario}</p>
          </div>
        )}
      </div>
    </div>
  );
}
