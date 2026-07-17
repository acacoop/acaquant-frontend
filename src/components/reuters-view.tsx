"use client";

import { useMemo, useState } from "react";

import { IaVistaPanel } from "@/components/ia-vista-panel";
import { ReutersFicha } from "@/components/reuters-ficha";
import { ReutersFundamentals } from "@/components/reuters-fundamentals";
import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS: tablero live de los subyacentes US suscriptos (feed de la
// PC de oficina), a pantalla completa. Toda columna ordena con click (números
// de mayor a menor, texto A→Z) y se puede ocultar desde el selector COLUMNAS
// (preferencia persistente). PRE/AFTER muestran la VARIACIÓN, no el precio.
// La columna CCL está modelada pero PENDIENTE: cedear_ars × ratio / adr_usd.
const POLL_MS = 5_000;

interface ReutersRow {
  ticker: string;
  ric: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volumen: number | null;
  var_pct: number | null;
  var_neta: number | null;
  pre_last: number | null;
  pre_var_pct: number | null;
  ah_last: number | null;
  ah_var_pct: number | null;
  ret_5d: number | null;
  ret_wtd: number | null;
  ret_mtd: number | null;
  ret_qtd: number | null;
  ret_ytd: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_1y: number | null;
  ret_5y: number | null;
  ratio: number | null;
  ccl: number | null;
  updated_at: string | null;
}

type SortKey = keyof ReutersRow;

function fmt(n: number | null, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVol(n: number | null): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(v: number | null, dec = 1): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
}

function hora(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-AR", { hour12: false });
}

function varClass(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v) || v === 0) return "text-[var(--t-text-dim)]";
  return v > 0 ? "text-green-400" : "text-red-400";
}

interface ColDef {
  key: SortKey;
  label: string;
  title?: string;
  align?: "left" | "right";
  texto?: boolean; // orden A→Z por default (numérico ordena desc primero)
  fija?: boolean;  // no se puede ocultar
  render: (r: ReutersRow) => React.ReactNode;
}

const pct = (k: SortKey, dec = 1) => {
  const Render = (r: ReutersRow) => {
    const v = r[k] as number | null;
    return <span className={varClass(v)}>{fmtPct(v, dec)}</span>;
  };
  return Render;
};

const COLS: ColDef[] = [
  {
    key: "ticker", label: "ACTIVO", align: "left", texto: true, fija: true,
    render: (r) => (
      <>
        <span className="text-[var(--t-accent)] font-semibold">{r.ticker}</span>
        {r.ric && <span className="ml-1.5 text-[9px] text-[var(--t-text-dim)]">{r.ric}</span>}
      </>
    ),
  },
  { key: "last", label: "ÚLTIMO", title: "Último precio operado en NY (USD).", render: (r) => <span className="text-[var(--t-text)] font-semibold">{fmt(r.last)}</span> },
  { key: "bid", label: "BID", title: "Mejor precio de COMPRA en pantalla: lo que están pagando ahora.", render: (r) => <span className="text-[var(--t-text)]">{fmt(r.bid)}</span> },
  { key: "ask", label: "ASK", title: "Mejor precio de VENTA en pantalla: lo que están pidiendo ahora. La diferencia con el bid es el spread (costo de entrar y salir).", render: (r) => <span className="text-[var(--t-text)]">{fmt(r.ask)}</span> },
  { key: "high", label: "MÁX", title: "Máximo operado en la rueda de hoy.", render: (r) => fmt(r.high) },
  { key: "low", label: "MÍN", title: "Mínimo operado en la rueda de hoy.", render: (r) => fmt(r.low) },
  { key: "prev_close", label: "CIERRE", title: "Cierre de la rueda anterior — la base contra la que se mide la variación de hoy.", render: (r) => fmt(r.prev_close) },
  { key: "volumen", label: "VOLUMEN", title: "Acciones operadas hoy. Volumen alto = el movimiento del precio tiene más respaldo.", render: (r) => fmtVol(r.volumen) },
  { key: "var_pct", label: "VAR %", title: "Variación de hoy en % contra el cierre anterior.", render: pct("var_pct", 2) },
  {
    key: "var_neta", label: "VAR NETA", title: "Variación de hoy en USD (cuántos dólares se movió el precio, no %).",
    render: (r) => (
      <span className={varClass(r.var_neta)}>
        {r.var_neta === null ? "—" : `${r.var_neta > 0 ? "+" : ""}${fmt(r.var_neta)}`}
      </span>
    ),
  },
  { key: "pre_var_pct", label: "PRE", title: "Variación del PRE market (operaciones ANTES de la apertura de NY) contra el cierre anterior. Anticipa el gap de apertura.", render: pct("pre_var_pct") },
  { key: "ah_var_pct", label: "AFTER", title: "Variación del AFTER market (operaciones DESPUÉS del cierre de NY) contra el cierre de hoy. Refleja reacción a balances/noticias fuera de rueda.", render: pct("ah_var_pct") },
  { key: "ret_5d", label: "5D", title: "Retorno de las últimas 5 ruedas, medido al cierre anterior (no incluye hoy).", render: pct("ret_5d") },
  { key: "ret_wtd", label: "WTD", title: "Retorno de la semana CALENDARIO en curso (week-to-date), al cierre anterior.", render: pct("ret_wtd") },
  { key: "ret_mtd", label: "MTD", title: "Retorno del mes CALENDARIO en curso (month-to-date), al cierre anterior. No es lo mismo que 1M (ventana móvil de 30 días).", render: pct("ret_mtd") },
  { key: "ret_qtd", label: "QTD", title: "Retorno del trimestre CALENDARIO en curso (quarter-to-date), al cierre anterior.", render: pct("ret_qtd") },
  { key: "ret_ytd", label: "YTD", title: "Retorno del año CALENDARIO en curso (year-to-date), al cierre anterior.", render: pct("ret_ytd") },
  { key: "ret_1m", label: "1M", title: "Retorno de los últimos 30 días (ventana MÓVIL), al cierre anterior. No es lo mismo que MTD (mes calendario).", render: pct("ret_1m") },
  { key: "ret_3m", label: "3M", title: "Retorno de los últimos 3 meses (ventana móvil), al cierre anterior.", render: pct("ret_3m") },
  { key: "ret_1y", label: "1A", title: "Retorno de los últimos 12 meses (ventana móvil), al cierre anterior.", render: pct("ret_1y") },
  { key: "ret_5y", label: "5A", title: "Retorno de los últimos 5 años, al cierre anterior.", render: pct("ret_5y") },
  {
    key: "ratio", label: "RATIO", title: "Ratio de conversión del CEDEAR: cuántos CEDEARs equivalen a 1 acción del subyacente. Insumo del CCL implícito.",
    render: (r) => (r.ratio === null ? "—" : `${fmt(r.ratio, 0)}:1`),
  },
  { key: "ccl", label: "CCL", title: "CCL implícito del papel: precio del CEDEAR en ARS × ratio ÷ precio del ADR en USD — a qué tipo de cambio está pagando el mercado ese activo. Próximamente.", render: () => "—" },
];

// Columnas que solo aparecen con el filtro AFTER HOURS activado.
const COLS_AFTER: SortKey[] = ["pre_var_pct", "ah_var_pct"];

export function ReutersView() {
  const { data: rows } = usePoll<ReutersRow[]>(
    "/api/trading/reuters", [], POLL_MS, { fetchOnMount: true },
  );
  // dir: -1 = descendente (default numérico), 1 = ascendente (default texto)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  // Columnas ocultas — preferencia del usuario, sobrevive al cierre de la app.
  const [ocultas, setOcultas] = usePersistedState<Partial<Record<SortKey, boolean>>>(
    "reuters.cols.ocultas", {}, "local",
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  // Ficha de empresa abierta (click en fila / Enter en el buscador).
  const [fichaTicker, setFichaTicker] = usePersistedState<string | null>("reuters.ficha", null);
  const [busqueda, setBusqueda] = useState("");
  // Sub-vista: COTIZACIONES (quotes live) o FUNDAMENTALS (screener comparativo).
  const [subvista, setSubvista] = usePersistedState<"cotizaciones" | "fundamentals">(
    "reuters.subvista", "cotizaciones",
  );
  // Filtro AFTER HOURS: muestra/oculta las columnas PRE y AFTER.
  const [afterHours, setAfterHours] = usePersistedState<boolean>("reuters.afterhours", false, "local");

  const visibles = useMemo(
    () => COLS.filter((c) => c.fija || !ocultas[c.key])
      .filter((c) => (COLS_AFTER.includes(c.key) ? afterHours : true)),
    [ocultas, afterHours],
  );
  // Hora del dato más fresco del feed (reemplaza a la vieja columna HORA).
  const ultimaHora = useMemo(() => {
    const ts = (Array.isArray(rows) ? rows : [])
      .map((r) => (r.updated_at ? new Date(r.updated_at).getTime() : 0))
      .filter((t) => t > 0);
    return ts.length ? hora(new Date(Math.max(...ts)).toISOString()) : null;
  }, [rows]);
  const nOcultas = COLS.filter((c) => !COLS_AFTER.includes(c.key)).length
    - visibles.filter((c) => !COLS_AFTER.includes(c.key)).length;

  const clickSort = (col: ColDef) => {
    setSort((s) => {
      if (s?.key === col.key) return { key: col.key, dir: s.dir === 1 ? -1 : 1 };
      return { key: col.key, dir: col.texto ? 1 : -1 };
    });
  };

  const filas = useMemo(() => {
    let base = Array.isArray(rows) ? [...rows] : [];
    const t = busqueda.trim().toUpperCase();
    if (t) {
      base = base.filter((r) =>
        r.ticker.toUpperCase().includes(t) || (r.ric ?? "").toUpperCase().includes(t));
    }
    if (!sort) return base;
    const { key, dir } = sort;
    return base.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      // nulls SIEMPRE al final, sin importar la dirección
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sort, busqueda]);

  // Ficha abierta → reemplaza al screener (← VOLVER la cierra).
  if (fichaTicker) {
    return <ReutersFicha ticker={fichaTicker} onVolver={() => setFichaTicker(null)} />;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">REUTERS</span>
        {subvista === "cotizaciones" && (
          <>
            <span className="text-[10px] text-[var(--t-text-muted)]">
              {filas.length} activo{filas.length === 1 ? "" : "s"} suscripto{filas.length === 1 ? "" : "s"}
            </span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filas.length > 0) {
                  setFichaTicker(filas[0].ticker);
                  setBusqueda("");
                }
              }}
              placeholder="buscar empresa… (Enter abre la ficha)"
              spellCheck={false}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[210px]"
            />
            {sort && (
              <button
                onClick={() => setSort(null)}
                className="text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5"
                title="Volver al orden original"
              >
                ✕ orden
              </button>
            )}

            {/* Filtro AFTER HOURS: agrega/quita las columnas PRE y AFTER */}
            <button
              onClick={() => setAfterHours((v) => !v)}
              title="Mostrar/ocultar las columnas del pre y after market"
              className={`text-[9px] tracking-widest border px-1.5 py-0.5 transition-colors ${
                afterHours
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}
            >
              AFTER HOURS
            </button>

            {/* Selector de columnas visibles */}
            <div className="relative">
              <button
                onClick={() => setSelectorAbierto((v) => !v)}
                className={`text-[9px] tracking-widest border px-1.5 py-0.5 transition-colors ${
                  selectorAbierto || nOcultas > 0
                    ? "text-[var(--t-accent)] border-[var(--t-accent)]"
                    : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                COLUMNAS{nOcultas > 0 ? ` (${nOcultas} ocultas)` : ""} ▾
              </button>
              {selectorAbierto && (
                <div className="absolute left-0 top-full mt-1 z-30 bg-[var(--t-surface)] border border-[var(--t-border-2)] shadow-lg p-2 max-h-[60vh] overflow-auto min-w-[170px]">
                  {COLS.filter((c) => !c.fija && !COLS_AFTER.includes(c.key)).map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-1 py-0.5 text-[10px] text-[var(--t-text)] cursor-pointer hover:bg-[var(--t-surface-2)]">
                      <input
                        type="checkbox"
                        checked={!ocultas[c.key]}
                        onChange={() => setOcultas((o) => ({ ...o, [c.key]: !o[c.key] }))}
                      />
                      {c.label}
                    </label>
                  ))}
                  <button
                    onClick={() => setOcultas({})}
                    className="mt-1 w-full text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5"
                  >
                    Mostrar todas
                  </button>
                </div>
              )}
            </div>

            {ultimaHora && (
              <span className="text-[9px] text-[var(--t-text-dim)]" title="Hora argentina del último dato recibido del feed">
                actualizado {ultimaHora}
              </span>
            )}
          </>
        )}

        {/* Derecha: sub-vistas + copiloto */}
        <div className="ml-auto flex items-center gap-2">
          {([["cotizaciones", "COTIZACIONES"], ["fundamentals", "FUNDAMENTALS"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setSubvista(k)}
              className={`px-2 py-0.5 text-[9px] font-semibold border transition-colors ${
                subvista === k
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}>
              {lbl}
            </button>
          ))}
          {subvista === "cotizaciones" && (
            <span className="text-[9px] text-[var(--t-text-dim)]">live · 5s</span>
          )}
          {/* Copiloto IA de la vista REUTERS (oculto sin módulos ia+trading) */}
          <IaVistaPanel vista="reuters" />
        </div>
      </div>

      {subvista === "fundamentals" ? (
        <div className="flex-1 min-h-0">
          <ReutersFundamentals onFicha={setFichaTicker} />
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-auto" onClick={() => selectorAbierto && setSelectorAbierto(false)}>
        {filas.length === 0 ? (
          <div className="p-4 text-[11px] text-[var(--t-text-muted)]">
            Sin activos suscriptos todavía — prendé el feed en la PC de la oficina
            y cargá los códigos en Manager → Títulos → Renta Variable.
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
              <tr className="text-[var(--t-text-dim)] tracking-widest text-[9px]">
                {visibles.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => clickSort(c)}
                    title={c.title ?? "Click para ordenar"}
                    className={`px-2 py-2 cursor-pointer select-none hover:text-[var(--t-accent)] whitespace-nowrap ${c.align === "left" ? "text-left" : "text-right"} ${sort?.key === c.key ? "text-[var(--t-accent)]" : ""}`}
                  >
                    {c.label}
                    {c.title && <span className="ml-0.5 text-[7px] align-super opacity-50">?</span>}
                    {sort?.key === c.key && <span className="ml-0.5">{sort.dir === -1 ? "▼" : "▲"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.ticker}
                  onClick={() => setFichaTicker(r.ticker)}
                  title={`Abrir la ficha de ${r.ticker}`}
                  className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)] cursor-pointer">
                  {visibles.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 py-1.5 whitespace-nowrap text-[var(--t-text-dim)] ${c.align === "left" ? "text-left px-3" : "text-right"}`}
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}
