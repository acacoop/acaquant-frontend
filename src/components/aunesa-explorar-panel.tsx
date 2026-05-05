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
  const [tipoFiltro, setTipoFiltro] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const explorar = async () => {
    setLoading(true);
    setError(null);
    setOpenId(null);
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

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-[#d0d0d0]">
      {/* ── HEADER (fila única: fecha + botón + stats inline) ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1a1a1a] px-3 py-2 shrink-0 bg-[#080808]">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-black border border-[#333] px-2 py-0.5 text-[11px] font-mono text-[#d0d0d0]"
        />
        <button
          onClick={explorar}
          disabled={loading}
          className="bg-[#ff9900] text-black px-3 py-0.5 text-[10px] font-semibold tracking-wider disabled:opacity-50"
        >
          {loading ? "EXPLORANDO…" : "EXPLORAR"}
        </button>

        {data && (
          <>
            <Pipe />
            <Inline label="Total" value={data.meta.total} />
            <Inline
              label="Capt"
              value={`${data.meta.capturados} (${data.meta.pct_capturados}%)`}
              color="#3fbf6f"
            />
            <Inline
              label="Desc"
              value={`${data.meta.descartados} (${data.meta.pct_descartados}%)`}
              color="#ff9900"
            />
            <Inline label="Tipos" value={data.tipos.length} />
            <Pipe />
            <span className="text-[9px] text-[#666]">filtros actuales:</span>
            {data.meta.palabras_clave_actuales.map((p) => (
              <code key={p} className="text-[9px] bg-black px-1 text-[#ff9900]">
                {p}
              </code>
            ))}
          </>
        )}
      </div>

      {error && (
        <div className="border-b border-[#aa3333] bg-[#1a0808] px-3 py-2 text-[11px] text-[#ff7777] shrink-0">
          {error}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#555]">
          Elegí fecha y hacé click en EXPLORAR.
        </div>
      )}

      {data && (
        <div className="flex-1 grid grid-cols-[280px_1fr] min-h-0">
          {/* ── SIDEBAR — distribución por tipo clickable ── */}
          <div className="border-r border-[#1a1a1a] flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-[#666] border-b border-[#1a1a1a] flex items-center justify-between">
              <span>Tipos ({data.tipos.length})</span>
              {tipoFiltro && (
                <button
                  onClick={() => setTipoFiltro("")}
                  className="text-[#888] hover:text-[#ff9900]"
                  title="Limpiar filtro"
                >
                  × clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {data.tipos.map((t) => {
                const active = tipoFiltro === t.informacion;
                return (
                  <button
                    key={t.informacion}
                    onClick={() => setTipoFiltro(active ? "" : t.informacion)}
                    className={
                      "w-full flex items-baseline gap-1.5 px-2 py-1 text-left text-[10px] font-mono leading-tight " +
                      (active
                        ? "bg-[#1a1a1a] border-l-2 border-[#ff9900]"
                        : "hover:bg-[#0f0f0f] border-l-2 border-transparent")
                    }
                  >
                    <span
                      className={
                        "w-3 text-center shrink-0 " +
                        (t.capturado ? "text-[#3fbf6f]" : "text-[#aa6666]")
                      }
                    >
                      {t.capturado ? "✓" : "✗"}
                    </span>
                    <span className="w-10 text-right shrink-0 text-[#d0d0d0]">{t.count}</span>
                    <span
                      className={
                        "flex-1 truncate " +
                        (t.capturado ? "text-[#d0d0d0]" : "text-[#aa6666]")
                      }
                      title={t.informacion}
                    >
                      {t.informacion}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── MAIN — filtros + tabla ── */}
          <div className="flex flex-col min-h-0">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0">
              <div className="flex items-center gap-0.5">
                {(["all", "capturados", "descartados"] as FilterKind[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
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
                className="flex-1 min-w-[180px] bg-black border border-[#333] px-2 py-0.5 text-[11px] font-mono text-[#d0d0d0]"
              />
              <span className="text-[9px] text-[#888]">
                {filtered.length} / {data.movimientos.length}
              </span>
            </div>

            {/* Tabla con scroll interno */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#0f0f0f] text-[9px] uppercase tracking-widest text-[#666] z-10">
                  <tr>
                    <th className="px-2 py-1 text-center w-6"></th>
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
                    const isOpen = openId === id;
                    return (
                      <FragRow
                        key={id}
                        id={id}
                        m={m}
                        open={isOpen}
                        onToggle={() => setOpenId(isOpen ? null : id)}
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
          </div>
        </div>
      )}
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
        <td className="px-2 py-1 text-[#888] truncate max-w-[180px]">{m.cuenta ?? "—"}</td>
        <td className="px-2 py-1 text-right">{fmtTotal(m.total)}</td>
        <td className="px-2 py-1 text-[#888] truncate max-w-[200px]">{m.unidad ?? "—"}</td>
      </tr>
      {open && (
        <tr className="bg-[#080808]" key={`${id}-ex`}>
          <td colSpan={6} className="px-4 py-2">
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

function Inline({
  label,
  value,
  color = "#d0d0d0",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <span className="text-[10px]">
      <span className="text-[#666] uppercase tracking-wider">{label}: </span>
      <span style={{ color }} className="font-mono">{value}</span>
    </span>
  );
}

function Pipe() {
  return <span className="text-[#333]">│</span>;
}
