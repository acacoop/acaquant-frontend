"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Extracted {
  reservas_netas_mkt?: number | null;
  reservas_netas_fmi?: number | null;
  repo_stock_ars?: number | null;
  riesgo_pais_bps?: number | null;
  compras_bcra_dia_usd_mm?: number | null;
  compras_bcra_ytd_usd_mm?: number | null;
  brecha_mep_a3500_pct?: number | null;
  canje_ccl_mep_pct?: number | null;
  rollover_lici_pct?: number | null;
  bid_to_cover_lici?: number | null;
  inflacion_proy_mens_pct?: number | null;
  caucion_prom_pct?: number | null;
  comentario_macro?: string | null;
}

interface IntelDoc {
  id: string;
  fuente: string;
  fecha: string;
  titulo?: string;
  raw_text: string;
  extracted: Extracted;
  confirmed?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Preview {
  fuente: string;
  fecha: string;
  titulo: string;
  raw_text: string;
  extracted: Extracted;
  chars: number;
}

// Labels en el mismo orden que el schema del backend.
const FIELDS: { key: keyof Extracted; label: string; unit: string; type: "number" | "text" }[] = [
  { key: "reservas_netas_mkt",      label: "Reservas netas (VM)",      unit: "USD MM",  type: "number" },
  { key: "reservas_netas_fmi",      label: "Reservas netas (FMI)",     unit: "USD MM",  type: "number" },
  { key: "repo_stock_ars",          label: "REPO stock",               unit: "ARS",     type: "number" },
  { key: "riesgo_pais_bps",         label: "Riesgo país",              unit: "bps",     type: "number" },
  { key: "compras_bcra_dia_usd_mm", label: "Compras BCRA día",         unit: "USD MM",  type: "number" },
  { key: "compras_bcra_ytd_usd_mm", label: "Compras BCRA YTD",         unit: "USD MM",  type: "number" },
  { key: "brecha_mep_a3500_pct",    label: "Brecha MEP-A3500",         unit: "%",       type: "number" },
  { key: "canje_ccl_mep_pct",       label: "Canje CCL-MEP",            unit: "%",       type: "number" },
  { key: "rollover_lici_pct",       label: "Rollover lici",            unit: "%",       type: "number" },
  { key: "bid_to_cover_lici",       label: "Bid-to-cover lici",        unit: "",        type: "number" },
  { key: "inflacion_proy_mens_pct", label: "Inflación proy. mensual",  unit: "%",       type: "number" },
  { key: "caucion_prom_pct",        label: "Caución promedio",         unit: "% TNA",   type: "number" },
  { key: "comentario_macro",        label: "Comentario macro",         unit: "",        type: "text"   },
];

function fmtDate(s?: string): string {
  if (!s) return "—";
  // "YYYY-MM-DD" o ISO → "dd/mm/yyyy"
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "B";
  if (a >= 1e9)  return (v / 1e9).toFixed(2)  + "MM";
  if (a >= 1e6)  return (v / 1e6).toFixed(1)  + "M";
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

// ── Componentes ───────────────────────────────────────────────────────────────

function Field({
  label,
  unit,
  value,
  onChange,
  type,
}: {
  label: string;
  unit: string;
  value: number | string | null | undefined;
  onChange: (v: string | number | null) => void;
  type: "number" | "text";
}) {
  const display = value === null || value === undefined ? "" : String(value);
  return (
    <div className="grid grid-cols-[180px_1fr] gap-2 items-center">
      <div className="text-[10px] text-[#888888] uppercase tracking-wide">
        {label} {unit && <span className="text-[#555555]">({unit})</span>}
      </div>
      {type === "text" ? (
        <textarea
          value={display}
          onChange={(e) => onChange(e.target.value || null)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none min-h-[60px] resize-y"
          placeholder="null"
        />
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={display}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") return onChange(null);
            const n = Number(raw.replace(",", "."));
            onChange(isNaN(n) ? raw : n);
          }}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          placeholder="null"
        />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  onCommit,
  onDiscard,
}: {
  preview: Preview;
  onCommit: (p: Preview) => Promise<void>;
  onDiscard: () => void;
}) {
  const [current, setCurrent] = useState<Preview>(preview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Extracted, v: string | number | null) => {
    setCurrent((p) => ({
      ...p,
      extracted: { ...p.extracted, [k]: v as never },
    }));
  };

  async function confirmar() {
    setSaving(true);
    setError(null);
    try {
      await onCommit(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[#ff9900]/40 bg-[#ff9900]/5 p-3 space-y-3">
      <div className="flex items-center">
        <span className="text-[11px] font-semibold text-[#ff9900] uppercase tracking-wide">
          Preview — revisar y confirmar
        </span>
        <span className="ml-auto text-[10px] text-[#555555]">{current.chars.toLocaleString()} chars</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
        <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Fuente</div>
          <input
            value={current.fuente}
            onChange={(e) => setCurrent((p) => ({ ...p, fuente: e.target.value }))}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-2 items-center">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Fecha</div>
          <input
            type="date"
            value={current.fecha.slice(0, 10)}
            onChange={(e) => setCurrent((p) => ({ ...p, fecha: e.target.value }))}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-2 items-center lg:col-span-2">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Título</div>
          <input
            value={current.titulo}
            onChange={(e) => setCurrent((p) => ({ ...p, titulo: e.target.value }))}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
      </div>

      <div className="border-t border-[#ff9900]/20 pt-3">
        <div className="text-[10px] font-semibold text-[#ff9900] uppercase tracking-wide mb-2">
          Variables extraídas (editá si algún valor salió mal)
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2">
          {FIELDS.filter((f) => f.type === "number").map((f) => (
            <Field
              key={f.key}
              label={f.label}
              unit={f.unit}
              type={f.type}
              value={(current.extracted[f.key] as number | null | undefined) ?? null}
              onChange={(v) => set(f.key, v)}
            />
          ))}
        </div>
        <div className="mt-3">
          {FIELDS.filter((f) => f.type === "text").map((f) => (
            <Field
              key={f.key}
              label={f.label}
              unit={f.unit}
              type={f.type}
              value={(current.extracted[f.key] as string | null | undefined) ?? ""}
              onChange={(v) => set(f.key, v)}
            />
          ))}
        </div>
      </div>

      <details className="text-[10px] text-[#555555]">
        <summary className="cursor-pointer hover:text-[#ff9900]">Ver texto completo ({current.chars} chars)</summary>
        <pre className="mt-2 whitespace-pre-wrap border border-[#1a1a1a] p-2 max-h-60 overflow-y-auto text-[#888888]">
          {current.raw_text}
        </pre>
      </details>

      {error && <div className="text-[10px] text-[#ff3333] font-mono">{error}</div>}

      <div className="flex gap-2 border-t border-[#ff9900]/20 pt-2">
        <button
          onClick={confirmar}
          disabled={saving}
          className="px-3 py-1 text-[11px] bg-[#00cc66] text-black font-semibold uppercase tracking-wide hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Guardando…" : "Confirmar y guardar"}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          className="px-3 py-1 text-[11px] border border-[#555555] text-[#888888] uppercase tracking-wide hover:text-white hover:border-white"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

function Uploader({ onPreview }: { onPreview: (p: Preview) => void }) {
  const [fuente, setFuente] = useState("");
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function procesar() {
    if (!fuente.trim()) {
      setError("Fuente obligatoria (ej: 'ACA Research', 'BCRA', etc).");
      return;
    }
    const file = fileRef.current?.files?.[0] ?? null;
    if (!texto.trim() && !file) {
      setError("Pegá el texto del reporte o subí un PDF.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("fuente", fuente);
      fd.append("fecha", fecha);
      fd.append("titulo", titulo);
      if (texto.trim()) fd.append("texto", texto);
      if (file) fd.append("pdf", file);

      const res = await fetch("/api/manager/intel/extract", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as Preview;
      onPreview(data);
      // Reset parcial (mantenemos fuente/fecha para el próximo)
      setTexto("");
      setTitulo("");
      setPdfName(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#1a1a1a] bg-[#080808] p-3 space-y-2">
      <div className="text-[11px] font-semibold text-[#ff9900] uppercase tracking-wide">
        Nuevo reporte
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Fuente *</div>
          <input
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            placeholder="ACA Research"
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Fecha</div>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
          <div className="text-[10px] text-[#888888] uppercase tracking-wide">Título</div>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Opcional"
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
          />
        </div>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Pegá el texto completo del reporte acá..."
        rows={6}
        className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1.5 font-mono focus:border-[#ff9900] outline-none resize-y"
      />

      <div className="flex items-center gap-3">
        <label className="text-[10px] text-[#888888] uppercase tracking-wide cursor-pointer hover:text-[#ff9900]">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setPdfName(e.target.files?.[0]?.name ?? null)}
          />
          [ adjuntar PDF ]
        </label>
        {pdfName && <span className="text-[10px] text-[#00cc66] font-mono">📎 {pdfName}</span>}
        <span className="ml-auto" />
        {error && <span className="text-[10px] text-[#ff3333] font-mono">{error}</span>}
        <button
          onClick={procesar}
          disabled={loading}
          className="px-3 py-1 text-[11px] bg-[#ff9900] text-black font-semibold uppercase tracking-wide hover:brightness-110 disabled:opacity-40"
        >
          {loading ? "Extrayendo…" : "Procesar"}
        </button>
      </div>
    </div>
  );
}

function HistoryTable({
  docs,
  onDelete,
  onExpand,
  expandedId,
}: {
  docs: IntelDoc[];
  onDelete: (id: string) => void;
  onExpand: (id: string | null) => void;
  expandedId: string | null;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a]">
        <span className="text-[11px] font-semibold text-[#ff9900] uppercase tracking-wide">
          Historial ({docs.length})
        </span>
      </div>
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-[#555555] border-b border-[#1a1a1a]">
            <th className="px-2 py-1 text-left w-[90px]">Fecha</th>
            <th className="px-2 py-1 text-left w-[180px]">Fuente</th>
            <th className="px-2 py-1 text-left">Título / comentario</th>
            <th className="px-2 py-1 text-right w-[100px]">Variables</th>
            <th className="px-2 py-1 text-right w-[80px]"></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const isExp = expandedId === d.id;
            const nVars = Object.entries(d.extracted || {}).filter(
              ([, v]) => v !== null && v !== undefined && v !== "",
            ).length;
            return (
              <Fragment key={d.id}>
                <tr
                  onClick={() => onExpand(isExp ? null : d.id)}
                  className={`border-b border-[#1a1a1a] cursor-pointer hover:bg-[#0e0e0e] ${
                    isExp ? "bg-[#0e0e0e]" : ""
                  }`}
                >
                  <td className="px-2 py-1 text-[#888888]">{fmtDate(d.fecha)}</td>
                  <td className="px-2 py-1 text-[#d0d0d0] truncate">{d.fuente}</td>
                  <td className="px-2 py-1 text-[#a0a0a0] truncate max-w-0">
                    {d.titulo || (d.extracted?.comentario_macro ?? "").slice(0, 120)}
                  </td>
                  <td className="px-2 py-1 text-right text-[#00cc66]">{nVars}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Borrar "${d.fuente} ${fmtDate(d.fecha)}"?`)) onDelete(d.id);
                      }}
                      className="text-[#ff3333]/70 hover:text-[#ff3333] text-[11px]"
                      title="Borrar"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                {isExp && (
                  <tr>
                    <td colSpan={5} className="bg-[#050505] border-t border-[#1a1a1a] p-3">
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5 text-[11px]">
                        {FIELDS.filter((f) => f.type === "number").map((f) => {
                          const v = d.extracted?.[f.key] as number | null | undefined;
                          if (v === null || v === undefined) return null;
                          return (
                            <div key={f.key} className="flex justify-between border-b border-[#1a1a1a] py-0.5">
                              <span className="text-[#888888]">{f.label}</span>
                              <span className="text-[#d0d0d0]">
                                {fmtCompact(v)} {f.unit && <span className="text-[#555555]">{f.unit}</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {d.extracted?.comentario_macro && (
                        <div className="mt-2 border-t border-[#1a1a1a] pt-2">
                          <div className="text-[9px] text-[#555555] uppercase tracking-wide">Comentario macro</div>
                          <div className="text-[11px] text-[#d0d0d0] mt-1 whitespace-pre-wrap">
                            {d.extracted.comentario_macro}
                          </div>
                        </div>
                      )}
                      <details className="mt-2 text-[10px] text-[#555555]">
                        <summary className="cursor-pointer hover:text-[#ff9900]">Texto crudo</summary>
                        <pre className="mt-1 whitespace-pre-wrap border border-[#1a1a1a] p-2 max-h-60 overflow-y-auto text-[#888888]">
                          {d.raw_text}
                        </pre>
                      </details>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {docs.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-[#555555]">
                Sin reportes cargados todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function IntelPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [docs, setDocs] = useState<IntelDoc[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/intel?limit=100", { cache: "no-store" });
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function commitPreview(p: Preview) {
    const res = await fetch("/api/manager/intel/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    setPreview(null);
    await fetchDocs();
  }

  async function deleteDoc(id: string) {
    const res = await fetch(`/api/manager/intel/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocs((xs) => xs.filter((d) => d.id !== id));
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto p-3 gap-3">
      <Uploader onPreview={setPreview} />

      {preview && (
        <PreviewPanel
          preview={preview}
          onCommit={commitPreview}
          onDiscard={() => setPreview(null)}
        />
      )}

      {loading ? (
        <div className="text-[11px] text-[#555555] p-3">Cargando historial…</div>
      ) : (
        <HistoryTable
          docs={docs}
          onDelete={deleteDoc}
          onExpand={setExpandedId}
          expandedId={expandedId}
        />
      )}
    </div>
  );
}
