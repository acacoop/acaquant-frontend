"use client";

import { useState, useMemo, useEffect, useRef } from "react";

interface Parsed {
  op: string;
  ticker: string;
  cantidad: number;
  precio: number;
  moneda: string;
  plazo: string;
}

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
  _categoria: string;
  _parsed: Parsed | null;
  _total_cliente: number | null;
  [k: string]: unknown;
}

interface Boleto {
  comprobante: string | null;
  cuenta: string | null;
  fecha: string | null;
  informacion: string | null;
  categoria: string;
  capturado: boolean;
  op: string | null;
  ticker: string | null;
  cantidad: number | null;
  precio: number | null;
  importe: number | null;
  moneda: string | null;
  plazo: string | null;
  lugar: string | null;
  estado: string | null;
  n_lineas: number;
  lineas: Movimiento[];
}

interface ExplorarResp {
  meta: {
    fecha: string;
    tiposCuenta: string;
    raw_total: number;
    excluidos: number;
    total: number;
    capturados: number;
    descartados: number;
    pct_capturados: number;
    pct_descartados: number;
    n_boletos: number;
    palabras_clave_actuales: string[];
    excluir_substrings: string[];
  };
  tipos: { informacion: string; count: number; capturado: boolean }[];
  categorias: { categoria: string; count: number }[];
  movimientos: Movimiento[];
  boletos: Boleto[];
}

type Vista = "consolidado" | "raw";
type CapFilter = "all" | "capturados" | "descartados";

const CATEGORIA_COLOR: Record<string, string> = {
  compra:                 "#3fbf6f",
  venta:                  "#ff5d6c",
  suscripcion_fci:        "#3fbf6f",
  rescate_fci:            "#ff5d6c",
  solicitud_suscripcion_fci: "#3fbf6f",
  solicitud_rescate_fci:  "#ff5d6c",
  acreencia:              "#9bd2ff",
  caucion_col_ap:         "#5fd0d0",
  caucion_col_ci:         "#7be8e8",
  caucion_tom_ap:         "#d09060",
  caucion_tom_ci:         "#e8a878",
  caucion_otro:           "#888",
  deposito:               "#ffd56b",
  extraccion:             "#ffa552",
  transferencia:          "#c19fff",
  comision:               "#888",
  impuesto:               "#888",
  otro:                   "#666",
};

const CATEGORIA_LABEL: Record<string, string> = {
  compra:                 "Compra",
  venta:                  "Venta",
  suscripcion_fci:        "Susc FCI",
  rescate_fci:            "Resc FCI",
  solicitud_suscripcion_fci: "Sol Susc FCI",
  solicitud_rescate_fci:  "Sol Resc FCI",
  acreencia:              "Acreencia",
  caucion_col_ap:         "Cauc Col Ap",
  caucion_col_ci:         "Cauc Col Ci",
  caucion_tom_ap:         "Cauc Tom Ap",
  caucion_tom_ci:         "Cauc Tom Ci",
  caucion_otro:           "Cauc otro",
  deposito:               "Depósito",
  extraccion:             "Extracción",
  transferencia:          "Transfer",
  comision:               "Comisión",
  impuesto:               "Impuesto",
  otro:                   "Otro",
};

function todayART(): string {
  // ART = UTC-3. Restamos 3h al "ahora" UTC y leemos su date ISO.
  // Independiente de la timezone del browser (Date.now() siempre UTC ms).
  const ar = new Date(Date.now() - 3 * 60 * 60_000);
  return ar.toISOString().slice(0, 10);
}

const fmtNum = (n: number | null | undefined, dec = 2): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

export function AunesaExplorarPanel() {
  const [fecha, setFecha] = useState<string>(todayART());
  const [data, setData] = useState<ExplorarResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>("consolidado");
  const [capFilter, setCapFilter] = useState<CapFilter>("all");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("");
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

  const filteredBoletos = useMemo<Boleto[]>(() => {
    if (!data) return [];
    let out = data.boletos;
    if (capFilter === "capturados") out = out.filter((b) => b.capturado);
    if (capFilter === "descartados") out = out.filter((b) => !b.capturado);
    if (catFilter) out = out.filter((b) => b.categoria === catFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((b) =>
        [b.comprobante, b.cuenta, b.informacion, b.ticker]
          .map((v) => String(v ?? "").toLowerCase())
          .some((s) => s.includes(q)),
      );
    }
    return out;
  }, [data, capFilter, catFilter, search]);

  const filteredMovs = useMemo<Movimiento[]>(() => {
    if (!data) return [];
    let out = data.movimientos;
    if (capFilter === "capturados") out = out.filter((m) => m._capturado);
    if (capFilter === "descartados") out = out.filter((m) => !m._capturado);
    if (catFilter) out = out.filter((m) => m._categoria === catFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((m) =>
        Object.values(m).some((v) => String(v ?? "").toLowerCase().includes(q)),
      );
    }
    return out;
  }, [data, capFilter, catFilter, search]);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-[var(--t-text)]">
      {/* HEADER */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--t-border)] px-3 py-2 shrink-0 bg-[var(--t-panel)]">
        <DatePickerCompact value={fecha} onChange={setFecha} />
        <button
          onClick={explorar}
          disabled={loading}
          className="bg-[#ff9900] text-black px-3 py-1 text-[10px] font-semibold tracking-wider disabled:opacity-50"
        >
          {loading ? "EXPLORANDO…" : "EXPLORAR"}
        </button>

        {data && (
          <>
            <span className="text-[#333]">│</span>
            <Inline label="Total" value={data.meta.total} />
            <Inline label="Boletos" value={data.meta.n_boletos} />
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
            <span className="text-[#333]">│</span>
            <Inline label="Excluidos OTC" value={data.meta.excluidos} color="#666" />
          </>
        )}

        <span className="ml-auto inline-flex border border-[#333] divide-x divide-[#333]">
          {(["consolidado", "raw"] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => { setVista(v); setOpenId(null); }}
              className={
                "px-3 py-0.5 text-[10px] uppercase tracking-wider " +
                (vista === v
                  ? "bg-[#ff9900] text-black"
                  : "bg-[var(--t-surface-2)] text-[var(--t-text-dim)] hover:text-[#ddd]")
              }
            >
              {v}
            </button>
          ))}
        </span>
      </div>

      {error && (
        <div className="border-b border-[#aa3333] bg-[#1a0808] px-3 py-2 text-[11px] text-[#ff7777] shrink-0">
          {error}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[var(--t-text-muted)]">
          Elegí fecha y hacé click en EXPLORAR.
        </div>
      )}

      {data && (
        <div className="flex-1 grid grid-cols-[260px_1fr] min-h-0">
          {/* SIDEBAR — categorías */}
          <div className="border-r border-[var(--t-border)] flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] border-b border-[var(--t-border)] flex items-center justify-between">
              <span>Categorías ({data.categorias.length})</span>
              {catFilter && (
                <button
                  onClick={() => setCatFilter("")}
                  className="text-[var(--t-text-dim)] hover:text-[#ff9900]"
                >
                  × clear
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {data.categorias.map((c) => {
                const active = catFilter === c.categoria;
                const color = CATEGORIA_COLOR[c.categoria] ?? "#666";
                const label = CATEGORIA_LABEL[c.categoria] ?? c.categoria;
                return (
                  <button
                    key={c.categoria}
                    onClick={() => setCatFilter(active ? "" : c.categoria)}
                    className={
                      "w-full flex items-center gap-2 px-3 py-1 text-left text-[11px] font-mono " +
                      (active
                        ? "bg-[#1a1a1a] border-l-2 border-[#ff9900]"
                        : "hover:bg-[var(--t-surface-2)] border-l-2 border-transparent")
                    }
                  >
                    <span className="w-2 h-2 inline-block" style={{ background: color }} />
                    <span className="w-10 text-right text-[var(--t-text)]">{c.count}</span>
                    <span className="text-[var(--t-text)] flex-1">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MAIN */}
          <div className="flex flex-col min-h-0">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
              <div className="flex items-center gap-0.5">
                {(["all", "capturados", "descartados"] as CapFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setCapFilter(f)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (capFilter === f
                        ? "bg-[#ff9900] text-black"
                        : "bg-[var(--t-surface-2)] text-[var(--t-text-dim)] hover:text-[#ddd]")
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
                placeholder="buscar…"
                className="flex-1 min-w-[150px] bg-black border border-[#333] px-2 py-0.5 text-[11px] font-mono text-[var(--t-text)]"
              />
              <span className="text-[9px] text-[var(--t-text-dim)]">
                {vista === "consolidado"
                  ? `${filteredBoletos.length} / ${data.boletos.length} boletos`
                  : `${filteredMovs.length} / ${data.movimientos.length} mov`}
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {vista === "consolidado" ? (
                <BoletoTable
                  boletos={filteredBoletos}
                  openId={openId}
                  onToggle={setOpenId}
                />
              ) : (
                <RawTable
                  movs={filteredMovs}
                  openId={openId}
                  onToggle={setOpenId}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tabla CONSOLIDADO (1 fila por boleto) ──────────────────────────────────

function BoletoTable({
  boletos, openId, onToggle,
}: {
  boletos: Boleto[];
  openId: string | null;
  onToggle: (id: string | null) => void;
}) {
  return (
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] z-10">
        <tr>
          <th className="px-2 py-1 text-left w-24">Categoría</th>
          <th className="px-2 py-1 text-left">Comprobante</th>
          <th className="px-2 py-1 text-left">Cuenta</th>
          <th className="px-2 py-1 text-left">Op</th>
          <th className="px-2 py-1 text-left">Ticker</th>
          <th className="px-2 py-1 text-right">Cantidad</th>
          <th className="px-2 py-1 text-right">Precio</th>
          <th className="px-2 py-1 text-right">Importe</th>
          <th className="px-2 py-1 text-left">Moneda</th>
          <th className="px-2 py-1 text-left">Plazo</th>
          <th className="px-2 py-1 text-left">Lugar</th>
        </tr>
      </thead>
      <tbody>
        {boletos.map((b, i) => {
          const id = `${b.comprobante ?? "X"}-${i}`;
          const open = openId === id;
          const color = CATEGORIA_COLOR[b.categoria] ?? "#666";
          const label = CATEGORIA_LABEL[b.categoria] ?? b.categoria;
          return (
            <FragBoleto
              key={id}
              id={id}
              b={b}
              color={color}
              label={label}
              open={open}
              onToggle={() => onToggle(open ? null : id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function FragBoleto({
  id, b, color, label, open, onToggle,
}: {
  id: string;
  b: Boleto;
  color: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  const cantClr = (b.cantidad ?? 0) > 0 ? "text-[#3fbf6f]" : (b.cantidad ?? 0) < 0 ? "text-[#ff5d6c]" : "text-[var(--t-text-dim)]";
  const impClr  = (b.importe ?? 0) > 0 ? "text-[#3fbf6f]" : (b.importe ?? 0) < 0 ? "text-[#ff5d6c]" : "text-[var(--t-text-dim)]";
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)]"
      >
        <td className="px-2 py-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 inline-block" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </span>
        </td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{b.comprobante ?? "—"}</td>
        <td className="px-2 py-1 text-[var(--t-text-dim)] truncate max-w-[180px]" title={b.cuenta ?? ""}>
          {b.cuenta ?? "—"}
        </td>
        <td className="px-2 py-1 text-[var(--t-text)]">{b.op ?? "—"}</td>
        <td className="px-2 py-1 text-[#ff9900]">{b.ticker ?? "—"}</td>
        <td className={`px-2 py-1 text-right ${cantClr}`}>{fmtNum(b.cantidad, 2)}</td>
        <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmtNum(b.precio, 2)}</td>
        <td className={`px-2 py-1 text-right ${impClr}`}>{fmtNum(b.importe, 2)}</td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{b.moneda ?? "—"}</td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{b.plazo ?? "—"}</td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{b.lugar ?? "—"}</td>
      </tr>
      {open && (
        <tr className="bg-[var(--t-panel)]">
          <td colSpan={11} className="px-4 py-3">
            <div className="text-[10px] text-[var(--t-text-muted)] mb-2">
              <strong className="text-[#ff9900]">{b.informacion}</strong> · {b.n_lineas} líneas raw
            </div>
            <table className="w-full text-[10px] font-mono">
              <thead className="text-[9px] uppercase text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-2 py-0.5 text-left">unidad</th>
                  <th className="px-2 py-0.5 text-right">total raw</th>
                  <th className="px-2 py-0.5 text-right">total cliente</th>
                  <th className="px-2 py-0.5 text-left">uso</th>
                  <th className="px-2 py-0.5 text-left">lugar</th>
                  <th className="px-2 py-0.5 text-left">estado</th>
                </tr>
              </thead>
              <tbody>
                {b.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-0.5 text-[var(--t-text)] truncate max-w-[300px]" title={String(l.unidad)}>{String(l.unidad)}</td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(l.total, 2)}</td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text)]">{fmtNum(l._total_cliente, 2)}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{String(l.uso ?? "")}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{String(l.lugar ?? "")}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{String(l.estado ?? "")}</td>
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

// ── Tabla RAW (1 fila por movimiento) ──────────────────────────────────────

function RawTable({
  movs, openId, onToggle,
}: {
  movs: Movimiento[];
  openId: string | null;
  onToggle: (id: string | null) => void;
}) {
  return (
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="sticky top-0 bg-[var(--t-surface-2)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] z-10">
        <tr>
          <th className="px-2 py-1 text-left w-24">Categoría</th>
          <th className="px-2 py-1 text-left">Comprobante</th>
          <th className="px-2 py-1 text-left">Información</th>
          <th className="px-2 py-1 text-left">Cuenta</th>
          <th className="px-2 py-1 text-right">Total raw</th>
          <th className="px-2 py-1 text-right">Cliente</th>
          <th className="px-2 py-1 text-left">Unidad</th>
          <th className="px-2 py-1 text-left">Uso</th>
        </tr>
      </thead>
      <tbody>
        {movs.map((m, i) => {
          const id = `${m.comprobante ?? "X"}-${i}`;
          const open = openId === id;
          const color = CATEGORIA_COLOR[m._categoria] ?? "#666";
          const label = CATEGORIA_LABEL[m._categoria] ?? m._categoria;
          return (
            <FragMov
              key={id}
              id={id}
              m={m}
              color={color}
              label={label}
              open={open}
              onToggle={() => onToggle(open ? null : id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function FragMov({
  id, m, color, label, open, onToggle,
}: {
  id: string;
  m: Movimiento;
  color: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  const tcClr = (m._total_cliente ?? 0) > 0 ? "text-[#3fbf6f]" : (m._total_cliente ?? 0) < 0 ? "text-[#ff5d6c]" : "text-[var(--t-text-dim)]";
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)]"
      >
        <td className="px-2 py-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 inline-block" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </span>
        </td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{m.comprobante ?? "—"}</td>
        <td className="px-2 py-1 text-[var(--t-text)] truncate max-w-[400px]" title={m.informacion ?? ""}>
          {m.informacion ?? "—"}
        </td>
        <td className="px-2 py-1 text-[var(--t-text-dim)] truncate max-w-[180px]" title={m.cuenta ?? ""}>
          {m.cuenta ?? "—"}
        </td>
        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtNum(m.total, 2)}</td>
        <td className={`px-2 py-1 text-right ${tcClr}`}>{fmtNum(m._total_cliente, 2)}</td>
        <td className="px-2 py-1 text-[var(--t-text-dim)] truncate max-w-[200px]" title={m.unidad ?? ""}>
          {m.unidad ?? "—"}
        </td>
        <td className="px-2 py-1 text-[var(--t-text-dim)]">{m.uso ?? "—"}</td>
      </tr>
      {open && (
        <tr className="bg-[var(--t-panel)]">
          <td colSpan={8} className="px-4 py-3">
            <table className="w-full text-[10px] font-mono">
              <tbody>
                {Object.entries(m)
                  .filter(([k]) => !k.startsWith("_") || k === "_categoria" || k === "_total_cliente" || k === "_capturado" || k === "_parsed")
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--t-border)]">
                      <td className="px-2 py-0.5 text-[var(--t-text-muted)] w-40">{k}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">
                        {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                      </td>
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

function Inline({
  label, value, color = "#d0d0d0",
}: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <span className="text-[10px]">
      <span className="text-[var(--t-text-muted)] uppercase tracking-wider">{label}: </span>
      <span style={{ color }} className="font-mono">{value}</span>
    </span>
  );
}

// ── DatePickerCompact ──────────────────────────────────────────────────────
// Selector de fecha con navegación rápida (← → · HOY) + dropdown con
// calendario inline navegable. No usa <input type="date"> nativo.

const MESES_AR = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_AR = ["L", "M", "X", "J", "V", "S", "D"];

function parseISO(s: string): Date {
  // "YYYY-MM-DD" → Date local sin issue de tz.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDisplay(s: string): string {
  const d = parseISO(s);
  const dia = DIAS_AR[(d.getDay() + 6) % 7]; // domingo=0 → 6
  return `${dia} ${d.getDate()} ${MESES_AR[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function DatePickerCompact({
  value, onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => parseISO(value));
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync viewDate cuando cambia el value externamente.
  useEffect(() => { setViewDate(parseISO(value)); }, [value]);

  // Click fuera para cerrar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = todayART();
  const isToday = value === today;
  const isFuture = parseISO(value) > parseISO(today);

  return (
    <div ref={wrapperRef} className="relative inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
      <button
        onClick={() => onChange(addDays(value, -1))}
        className="px-2 text-[var(--t-text-dim)] hover:text-[#ff9900] hover:bg-[#1a1a1a]"
        title="Día anterior"
      >
        ‹
      </button>
      <button
        onClick={() => setOpen((p) => !p)}
        className={
          "px-3 py-1 text-[11px] font-mono min-w-[170px] text-center " +
          (open ? "bg-[#1a1a1a] text-[#ff9900]" : "bg-black text-[var(--t-text)] hover:bg-[var(--t-surface-2)]")
        }
      >
        {fmtDisplay(value)}
      </button>
      <button
        onClick={() => onChange(addDays(value, 1))}
        disabled={isFuture}
        className="px-2 text-[var(--t-text-dim)] hover:text-[#ff9900] hover:bg-[#1a1a1a] disabled:text-[#333] disabled:hover:bg-transparent"
        title="Día siguiente"
      >
        ›
      </button>
      <button
        onClick={() => onChange(today)}
        disabled={isToday}
        className={
          "px-2 text-[10px] uppercase tracking-wider " +
          (isToday
            ? "bg-[#0a0a0a] text-[var(--t-text-muted)]"
            : "bg-[#0a0a0a] text-[var(--t-text-dim)] hover:text-[#ff9900] hover:bg-[#1a1a1a]")
        }
      >
        Hoy
      </button>

      {open && (
        <CalendarPopup
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onPick={(d) => { onChange(d); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CalendarPopup({
  value, viewDate, setViewDate, onPick,
}: {
  value: string;
  viewDate: Date;
  setViewDate: (d: Date) => void;
  onPick: (s: string) => void;
  onClose: () => void;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Primer día del mes y total de días.
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Lunes=0 ... Domingo=6
  const startCol = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayART();
  const todayD = parseISO(today);
  const valD = parseISO(value);

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-black border border-[#ff9900] p-3 shadow-2xl min-w-[260px]">
      {/* Header — mes/año + nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="px-2 text-[var(--t-text-dim)] hover:text-[#ff9900]"
        >
          ‹
        </button>
        <div className="text-[11px] font-mono text-[#ff9900]">
          {MESES_AR[month]} {year}
        </div>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="px-2 text-[var(--t-text-dim)] hover:text-[#ff9900]"
        >
          ›
        </button>
      </div>

      {/* Header días */}
      <div className="grid grid-cols-7 gap-0.5 mb-1 text-[9px] uppercase text-[var(--t-text-muted)] text-center">
        {DIAS_AR.map((d) => (
          <div key={d} className="py-0.5">{d}</div>
        ))}
      </div>

      {/* Grid días */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const dDate = new Date(year, month, d);
          const dISO = toISO(dDate);
          const isSelected = dISO === value;
          const isToday = dDate.getTime() === todayD.getTime();
          const isFuture = dDate > todayD;
          const isWeekend = dDate.getDay() === 0 || dDate.getDay() === 6;
          const baseClasses = "py-1 text-[11px] font-mono text-center transition";
          let cls = "";
          if (isSelected) {
            cls = "bg-[#ff9900] text-black font-semibold";
          } else if (isToday) {
            cls = "border border-[#ff9900] text-[#ff9900] hover:bg-[#1a1a1a]";
          } else if (isFuture) {
            cls = "text-[#333] cursor-not-allowed";
          } else if (isWeekend) {
            cls = "text-[var(--t-text-muted)] hover:bg-[#1a1a1a] hover:text-[var(--t-text-dim)]";
          } else {
            cls = "text-[var(--t-text)] hover:bg-[#1a1a1a] hover:text-[#ff9900]";
          }
          return (
            <button
              key={i}
              onClick={() => !isFuture && onPick(dISO)}
              disabled={isFuture}
              className={`${baseClasses} ${cls}`}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--t-border)] text-[9px] uppercase tracking-wider">
        <button
          onClick={() => onPick(today)}
          className="text-[var(--t-text-dim)] hover:text-[#ff9900]"
        >
          → Hoy
        </button>
        <span className="text-[var(--t-text-muted)]">
          Día seleccionado: {valD.getDate()}/{valD.getMonth() + 1}/{valD.getFullYear()}
        </span>
      </div>
    </div>
  );
}
