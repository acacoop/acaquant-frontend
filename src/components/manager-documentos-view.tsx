"use client";

// Manager → DOCUMENTOS: carga manual de PDFs y comentarios para la vista REPORTES
// FINANCIEROS de Research (lo que NO llega por mail). Doc: TRD-FX docs/RESEARCH_FRED.md.
// El PDF se lee en el browser como base64 (data URL) y se manda por JSON a
// POST /api/manager/documentos (gate manager). La vista Research lo lee aparte.
import { useCallback, useEffect, useState } from "react";

interface Doc {
  id: number; titulo: string; fecha: string | null; tipo: string; fuente: string | null;
  comentario: string | null; nombre_archivo: string | null; autor: string | null;
  tiene_pdf: boolean; bytes: number | null; created_at: string | null;
}

const INPUT = "text-[12px] px-2 py-1 rounded border border-[var(--t-border-2)] bg-[var(--t-surface)] text-[var(--t-text)] w-full";
const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-[var(--t-text-dim)]";

function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
function fmtBytes(b: number | null): string {
  if (!b) return "";
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${Math.round(b / 1e3)} KB`;
}

export function TabDocumentos() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tipo, setTipo] = useState<"pdf" | "comentario">("pdf");
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [fuente, setFuente] = useState("");
  const [comentario, setComentario] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/manager/documentos", { cache: "no-store" });
      if (r.ok) setDocs((await r.json()).documentos || []);
    } catch { /* noop */ }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const leerBase64 = (f: File): Promise<string> => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));   // data:...;base64,XXXX
    fr.onerror = () => rej(new Error("no pude leer el archivo"));
    fr.readAsDataURL(f);
  });

  const enviar = async () => {
    setMsg(null);
    if (!titulo.trim()) { setMsg({ ok: false, texto: "Poné un título." }); return; }
    if (tipo === "pdf" && !file) { setMsg({ ok: false, texto: "Elegí un PDF." }); return; }
    if (tipo === "comentario" && !comentario.trim()) { setMsg({ ok: false, texto: "Escribí el comentario." }); return; }
    setEnviando(true);
    try {
      const body: Record<string, unknown> = { titulo, fecha, tipo, fuente: fuente || null };
      if (tipo === "pdf" && file) {
        body.archivo_b64 = await leerBase64(file);
        body.nombre_archivo = file.name;
      } else {
        body.comentario = comentario;
      }
      const r = await fetch("/api/manager/documentos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${r.status}`);
      }
      setMsg({ ok: true, texto: "Cargado. Ya aparece en REPORTES FINANCIEROS." });
      setTitulo(""); setFuente(""); setComentario(""); setFile(null);
      await cargar();
    } catch (e) {
      setMsg({ ok: false, texto: `No se pudo cargar (${e instanceof Error ? e.message : "error"}).` });
    } finally { setEnviando(false); }
  };

  const borrar = async (id: number) => {
    if (!confirm("¿Borrar este documento?")) return;
    try {
      const r = await fetch(`/api/manager/documentos/${id}`, { method: "DELETE" });
      if (r.ok) await cargar();
    } catch { /* noop */ }
  };

  return (
    <div className="h-full min-h-0 overflow-auto p-4 flex flex-col gap-4">
      {/* Formulario de carga */}
      <section className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg p-4 max-w-3xl">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--t-text)] mb-3">Cargar documento</h3>
        <div className="flex gap-2 mb-3">
          {(["pdf", "comentario"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`text-[11px] font-semibold px-3 py-1 rounded border transition-colors ${tipo === t ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)]" : "text-[var(--t-text-muted)] border-[var(--t-border-2)]"}`}>
              {t === "pdf" ? "PDF" : "COMENTARIO"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><div className={LABEL}>Título</div><input className={INPUT} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Semanal 17-jul" /></div>
          <div><div className={LABEL}>Fecha</div><input type="date" className={INPUT} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div><div className={LABEL}>Fuente (opcional)</div><input className={INPUT} value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="Ej. Semanal, Nota mesa…" /></div>
          {tipo === "pdf" ? (
            <div><div className={LABEL}>Archivo PDF</div><input type="file" accept="application/pdf" className="text-[11px] text-[var(--t-text-muted)]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          ) : <div />}
        </div>
        {tipo === "comentario" && (
          <div className="mt-3"><div className={LABEL}>Comentario</div>
            <textarea className={`${INPUT} h-28 resize-y`} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Texto del comentario / contexto del día…" /></div>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={enviar} disabled={enviando}
            className="text-[12px] font-semibold px-4 py-1.5 rounded bg-[var(--t-accent)] text-white disabled:opacity-50">
            {enviando ? "Cargando…" : "Cargar"}
          </button>
          {msg && <span className="text-[11px]" style={{ color: msg.ok ? "var(--t-pos)" : "var(--t-neg)" }}>{msg.texto}</span>}
        </div>
      </section>

      {/* Lista de documentos cargados */}
      <section className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg p-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--t-text)] mb-3">Cargados ({docs.length})</h3>
        {docs.length === 0 ? (
          <div className="text-[11px] text-[var(--t-text-dim)]">Todavía no hay documentos manuales.</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead><tr className="text-[var(--t-text-dim)] text-left">
              <th className="py-1">Fecha</th><th>Tipo</th><th>Título</th><th>Fuente</th><th>Archivo</th><th></th>
            </tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-[var(--t-border)]">
                  <td className="py-1 whitespace-nowrap">{d.fecha}</td>
                  <td><span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--t-border-2)] text-[var(--t-text-muted)]">{d.tipo}</span></td>
                  <td className="text-[var(--t-text)]">{d.titulo}</td>
                  <td className="text-[var(--t-text-muted)]">{d.fuente || "—"}</td>
                  <td className="text-[var(--t-text-dim)] whitespace-nowrap">{d.tiene_pdf ? `${d.nombre_archivo || "PDF"} · ${fmtBytes(d.bytes)}` : "—"}</td>
                  <td className="text-right"><button type="button" onClick={() => borrar(d.id)} className="text-[10px] text-[var(--t-neg)] hover:underline">borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
