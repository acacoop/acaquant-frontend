"use client";

import { useState, useMemo } from "react";

interface Movimiento {
  comprobante?: string;
  informacion?: string;
  cuenta?: string;
  fecha?: string;
  total?: number;
  unidad?: string;
  estado?: string;
  lugar?: string;
  uso?: string;
  _capturado: boolean;
  [k: string]: unknown;
}

interface TipoStat {
  informacion: string;
  count: number;
  capturado: boolean;
}

interface ExplorarResp {
  meta: {
    fecha: string;
    tiposCuenta: string;
    total: number;
    capturados: number;
    descartados: number;
    pct_capturados: number;
    pct_descartados: number;
    palabras_clave_actuales: string[];
  };
  tipos: TipoStat[];
  movimientos: Movimiento[];
  keys_universo: string[];
}

type FilterKind = "all" | "capturados" | "descartados";

function todayART(): string {
  const now = new Date();
  // ART = UTC-3
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ar = new Date(utc - 3 * 60 * 60_000);
  return ar.toISOString().slice(0, 10);
}

export function AunesaExplorarPanel() {
  const [fecha, setFecha] = useState<string>(todayART());
  const [data, setData] = useState<ExplorarResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tipoFiltro, setTipoFiltro] = useState<string>(""); // "" = sin filtro

  const explorar = async () => {
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    try {
      const res = await fetch(`/api/manager/aunesa/explorar?fecha=${fecha}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const j: ExplorarResp = await res.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const filtered: Movimiento[] = useMemo(() => {
    if (!data) return [];
    let out = data.movimientos;
    if (filter === "capturados") out = out.filter((m) => m._capturado);
    if (filter === "descartados") out = out.filter((m) => !m._capturado);
    if (tipoFiltro) out = out.filter((m) => m.informacion === tipoFiltro);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((m) =>
        Object.values(m).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    return out;
  }, [data, filter, tipoFiltro, search]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full overflow-auto bg-[#0a0a0a] text-[#d0d0d0]">
      <div className="p-4 space-y-4">
        {/* ── Controles ── */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[#1a1a1a] pb-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-[#666] mb-1">Fecha</div>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-black border border-[#333] px-2 py-1 text-[12px] font-mono text-[#d0d0d0]"
            />
          </div>
          <button
            onClick={explorar}
            disabled={loading}
            className="bg-[#ff9900] text-black px-4 py-1 text-[11px] font-semibold tracking-wider disabled:opacity-50"
          >
            {loading ? "Explorando…" : "EXPLORAR"}
          </button>
          <div className="text-[10px] text-[#666] ml-2">
            endpoint:{" "}
            <code className="bg-black px-1 text-[#3fbf6f]">
              /operaciones/consolidadosGenerales
            </code>{" "}
            · puede tardar 1-2 min con días de mucha actividad.
          </div>
        </div>

        {error && (
          <div className="border border-[#aa3333] bg-[#1a0808] p-3 text-[11px] text-[#ff7777]">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── Resumen ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total" value={data.meta.total} />
              <Stat
                label="Capturados (filtro actual)"
                value={`${data.meta.capturados} (${data.meta.pct_capturados}%)`}
                tone="green"
              />
              <Stat
                label="Descartados"
                value={`${data.meta.descartados} (${data.meta.pct_descartados}%)`}
                tone="amber"
              />
              <Stat
                label="Tipos distintos"
                value={data.tipos.length}
              />
            </div>

            <div className="text-[10px] text-[#888] -mt-2">
              Filtro de captura actual (jobs/cashflow.py):{" "}
              {data.meta.palabras_clave_actuales.map((p) => (
                <code key={p} className="bg-black px-1 text-[#ff9900] mr-1">{p}</code>
              ))}
            </div>

            {/* ── Distribución por tipo (clickable) ── */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[#666] mb-2">
                Distribución por tipo (click para filtrar la tabla)
              </div>
              <div className="space-y-0.5">
                {data.tipos.map((t) => {
                  const active = tipoFiltro === t.informacion;
                  return (
                    <button
                      key={t.informacion}
                      onClick={() => setTipoFiltro(active ? "" : t.informacion)}
                      className={
                        "w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] font-mono " +
                        (active
                          ? "bg-[#1a1a1a] border-l-2 border-[#ff9900]"
                          : "hover:bg-[#0f0f0f] border-l-2 border-transparent")
                      }
                    >
                      <span
                        className={
                          "inline-block w-3 text-center " +
                          (t.capturado ? "text-[#3fbf6f]" : "text-[#aa6666]")
                        }
                      >
                        {t.capturado ? "✓" : "✗"}
                      </span>
                      <span className="w-12 text-right text-[#d0d0d0]">{t.count}</span>
                      <span
                        className={t.capturado ? "text-[#d0d0d0]" : "text-[#aa6666]"}
                      >
                        {t.informacion}
                      </span>
                    </button>
                  );
                })}
              </div>
              {tipoFiltro && (
                <div className="mt-1 text-[10px] text-[#ff9900]">
                  Filtrando por: <code>{tipoFiltro}</code>{" "}
                  <button
                    onClick={() => setTipoFiltro("")}
                    className="ml-2 text-[#888] hover:text-[#ff9900]"
                  >
                    × limpiar
                  </button>
                </div>
              )}
            </div>

            {/* ── Filtros tabla ── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[#1a1a1a] pt-3">
              <div className="flex items-center gap-1">
                {(["all", "capturados", "descartados"] as FilterKind[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={
                      "px-2 py-1 text-[10px] uppercase tracking-wider " +
                      (filter === f
                        ? "bg-[#ff9900] text-black"
                        : "bg-[#0f0f0f] text-[#888] hover:text-[#ddd]")
                    }
                  >
                    {f === "all" ? "todos" : f}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="buscar (cualquier campo)…"
                className="flex-1 min-w-[200px] bg-black border border-[#333] px-2 py-1 text-[11px] font-mono text-[#d0d0d0]"
              />
              <span className="text-[10px] text-[#888]">
                {filtered.length} / {data.movimientos.length}
              </span>
            </div>

            {/* ── Tabla ── */}
            <div className="border border-[#1a1a1a]">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="bg-[#0f0f0f] text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-2 py-1 text-center w-8">●</th>
                    <th className="px-2 py-1 text-left">Comprobante</th>
                    <th className="px-2 py-1 text-left">Información</th>
                    <th className="px-2 py-1 text-left">Cuenta</th>
                    <th className="px-2 py-1 text-right">Total</th>
                    <th className="px-2 py-1 text-left">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => {
                    const id = `${m.comprobante ?? "?"}-${i}`;
                    const isOpen = expanded.has(id);
                    return (
                      <FragRow
                        key={id}
                        id={id}
                        m={m}
                        open={isOpen}
                        onToggle={() => toggle(id)}
                      />
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="p-6 text-center text-[11px] text-[#666]">
                  Sin movimientos para los filtros aplicados.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FragRow({
  id,
  m,
  open,
  onToggle,
}: {
  id: string;
  m: Movimiento;
  open: boolean;
  onToggle: () => void;
}) {
  const cap = m._capturado;
  return (
    <>
      <tr
        onClick={onToggle}
        className={
          "border-t border-[#1a1a1a] cursor-pointer hover:bg-[#0f0f0f] " +
          (cap ? "" : "bg-[#1a0e08]/30")
        }
      >
        <td className={"px-2 py-1 text-center " + (cap ? "text-[#3fbf6f]" : "text-[#aa6666]")}>
          {cap ? "✓" : "✗"}
        </td>
        <td className="px-2 py-1 text-[#888]">{m.comprobante ?? "—"}</td>
        <td className={cap ? "px-2 py-1 text-[#d0d0d0]" : "px-2 py-1 text-[#aa6666]"}>
          {m.informacion ?? "—"}
        </td>
        <td className="px-2 py-1 text-[#888] truncate max-w-[200px]">{m.cuenta ?? "—"}</td>
        <td className="px-2 py-1 text-right">{fmtTotal(m.total)}</td>
        <td className="px-2 py-1 text-[#888] truncate max-w-[200px]">{m.unidad ?? "—"}</td>
      </tr>
      {open && (
        <tr className="bg-[#080808]" key={`${id}-ex`}>
          <td colSpan={6} className="px-4 py-3">
            <table className="w-full text-[10px] font-mono">
              <tbody>
                {Object.entries(m)
                  .filter(([k]) => k !== "_capturado")
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-[#111]">
                      <td className="px-2 py-0.5 text-[#666] w-40">{k}</td>
                      <td className="px-2 py-0.5 text-[#d0d0d0]">{String(v ?? "")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function fmtTotal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") {
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v);
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "amber";
}) {
  const color =
    tone === "green" ? "text-[#3fbf6f]" : tone === "amber" ? "text-[#ff9900]" : "text-[#d0d0d0]";
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3">
      <div className="text-[9px] uppercase tracking-widest text-[#666]">{label}</div>
      <div className={`text-[18px] font-mono mt-1 ${color}`}>{value}</div>
    </div>
  );
}
