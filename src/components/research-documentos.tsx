"use client";

// Piezas de los DOCUMENTOS manuales de REPORTES FINANCIEROS (Research). El visor y
// el tipo se usan desde el feed unificado de research-view.tsx. Doc: TRD-FX
// docs/RESEARCH_FRED.md.
import { useEffect, useState } from "react";

export interface Doc {
  id: number; titulo: string; fecha: string | null; tipo: string; fuente: string | null;
  comentario: string | null; nombre_archivo: string | null; tiene_pdf: boolean;
}

// Visor de PDF que ESQUIVA el X-Frame-Options: DENY global (next.config): en vez de
// apuntar el iframe al endpoint (que el header bloquea), baja el PDF como blob y lo
// muestra desde una URL blob: (sin ese header) → se renderiza embebido, interno.
export function PdfViewer({ docId, titulo }: { docId: number; titulo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let obj: string | null = null;
    let vivo = true;
    setUrl(null); setErr(false);
    fetch(`/api/research-docs/${docId}/pdf`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((b) => { if (vivo) { obj = URL.createObjectURL(b); setUrl(obj); } })
      .catch(() => { if (vivo) setErr(true); });
    return () => { vivo = false; if (obj) URL.revokeObjectURL(obj); };
  }, [docId]);

  if (err) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-[11px] text-[var(--t-text-dim)]">
        No pude mostrar el PDF acá.
        <a href={`/api/research-docs/${docId}/pdf`} target="_blank" rel="noopener noreferrer" className="text-[var(--t-accent)] hover:underline">abrir en pestaña ↗</a>
      </div>
    );
  }
  if (!url) return <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">Cargando PDF…</div>;
  return <iframe title={titulo} src={url} className="w-full h-full border-0" />;
}
