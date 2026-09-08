"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

import { DownloadButton } from "./download-button";

// ── Types ─────────────────────────────────────────────────────────────────

export interface BoletoDetalle {
  fecha: string;
  categoria: string;
  op: string;
  cantidad: number;
  precio: number;
  importe: number;       // crudo en moneda original
  importe_ars: number;   // pesificado
  moneda: string;
  mep: number | null;
  factor?: number;       // solo ajuste_split: factor aplicado (10 = 10:1)
}

// Pseudo-boletos de AJUSTE (operaciones.pnl_ajustes): eventos corporativos sin
// boleto (splits, canjes) que el motor mergea al stream. Su `cantidad` viene
// CON SIGNO = delta aplicado al stock (un split 10:1 sobre 100 trae +900).
const esAjuste = (cat: string) => cat === "ajuste_split" || cat === "ajuste_cantidad";

export interface PnLRow {
  ticker: string;            // match key — único interno (ej CAFCI..., AL30)
  display_name?: string;     // nombre humano para mostrar (Assets.TICKER)
  unidad: string;
  qty_aum: number;
  qty_calc: number;
  qty_efectiva?: number;     // qty usado en el cálculo de valor (live)
  qty_compras: number;
  qty_ventas: number;
  precio_actual: number;
  precio_promedio: number | null;
  costo_remanente: number;
  valor_actual_aum: number;       // legado del AuM (valuación del cierre)
  valor_actual_live?: number;     // qty × precio_live (con normalizer por tipo)
  valor_actual_source?: "live" | "cierre" | "aum";
  pnl_realizado: number;
  pnl_realizado_dia?: number;     // day-trades cerrados intraday
  pnl_no_realizado: number | null;
  pnl_pasivo: number;
  pnl_pasivo_dia?: number;        // cobros pasivos intraday
  breakdown_pasivo: Record<string, number>;
  pnl_total: number;
  // ── Espejo USD (costo a MEP histórico, valor a MEP de hoy). Opcionales:
  // solo presentes una vez que el cache PnLTotalesCache se recalcula. ──
  costo_remanente_usd?: number;
  valor_actual_usd?: number | null;
  pnl_realizado_usd?: number;
  pnl_realizado_dia_usd?: number;
  pnl_no_realizado_usd?: number | null;
  pnl_pasivo_usd?: number;
  pnl_pasivo_dia_usd?: number;
  pnl_total_usd?: number;
  completeness: "completa" | "parcial" | "sin_boletos";
  moneda_mixta: boolean;
  n_movimientos: number;
  fechas_sin_mep: string[];
  boletos: BoletoDetalle[];
}

interface PnLResp {
  id_cuenta: string;
  fecha_actual: string | null;
  rows: PnLRow[];
  totales: {
    costo_remanente:    number;
    valor_actual:       number;
    pnl_realizado:      number;
    pnl_realizado_dia?: number;
    pnl_no_realizado:   number;
    pnl_pasivo:         number;
    pnl_pasivo_dia?:    number;
    pnl_total:          number;
    // Espejo USD (costo a MEP histórico, valor a MEP de hoy).
    costo_remanente_usd?:  number;
    valor_actual_usd?:     number;
    pnl_no_realizado_usd?: number;
    pnl_pasivo_usd?:       number;
  };
  n_tickers: number;
}

type Moneda = "ARS" | "USD";

type SortKey =
  | "pnl_total"
  | "pnl_no_realizado"
  | "pnl_pasivo"
  | "valor_actual_aum"
  | "costo_remanente"
  | "ticker";

// ── Helpers ───────────────────────────────────────────────────────────────

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

export function fmtSigned(n: number): string {
  return (n > 0 ? "+" : "") + fmtCompact(n);
}

export function pnlClass(n: number | null | undefined): string {
  if (n == null) return "text-[var(--t-text-dim)]";
  if (n > 0) return "text-[var(--t-pos)]";
  if (n < 0) return "text-[var(--t-neg)]";
  return "text-[var(--t-text-dim)]";
}

// Valor / costo de una fila según moneda. En USD el costo va al MEP
// histórico de cada boleto y el valor al MEP de hoy (campos del backend).
const valVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.valor_actual_usd ?? 0) : (r.valor_actual_live ?? r.valor_actual_aum);
const costoVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.costo_remanente_usd ?? 0) : r.costo_remanente;

// Formato moneda-aware: el "$" base pasa a "US$" en vista USD.
const fmtMon = (n: number, esUSD: boolean) =>
  esUSD ? fmtCompact(n).replace("$", "US$") : fmtCompact(n);
const fmtMonSigned = (n: number, esUSD: boolean) =>
  esUSD ? fmtSigned(n).replace("$", "US$") : fmtSigned(n);

// Filtra boletos al "período activo del stock actual" — desde la última
// vez que qty pasó por 0. Los boletos previos se compensaron entre sí
// (compras + ventas que cerraron lots) y no aportan al cost basis vivo.
// Las acreencias (cupones / divs / amorts) NO mueven qty, así que no
// fuerzan reset — quedan dentro del slice si están temporalmente
// posteriores al último reset (lo que es lo correcto: cobros sobre el
// stock vivo).
function _filtrarPeriodoActual(boletos: BoletoDetalle[]): BoletoDetalle[] {
  let qty = 0;
  let inicio = 0;
  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    const cant = Math.abs(b.cantidad || 0);
    const antes = qty;
    if (b.categoria === "compra" || b.categoria === "suscripcion_fci") {
      qty += cant;
    } else if (b.categoria === "venta" || b.categoria === "rescate_fci") {
      qty -= cant;
    } else if (esAjuste(b.categoria)) {
      // Delta con signo (split: qty_post − qty_pre). Sin esto el running qty
      // quedaría pre-split y una venta post-split dispararía un reset falso.
      qty += b.cantidad || 0;
    }
    if (antes > 0 && qty <= 0) {
      inicio = i + 1;
    }
  }
  return boletos.slice(inicio);
}

function _statsDelPeriodo(boletos: BoletoDetalle[]) {
  let compras = 0;
  let ventas = 0;
  let ajustes = 0; // Σ deltas de ajustes corporativos (splits/canjes) del período
  const breakdownPasivo: Record<string, number> = {};
  for (const b of boletos) {
    const cant = Math.abs(b.cantidad || 0);
    if (b.categoria === "compra" || b.categoria === "suscripcion_fci") {
      compras += cant;
    } else if (b.categoria === "venta" || b.categoria === "rescate_fci") {
      ventas += cant;
    } else if (esAjuste(b.categoria)) {
      ajustes += b.cantidad || 0;
    } else if (b.categoria === "acreencia") {
      const op = b.op || "Otros";
      breakdownPasivo[op] = (breakdownPasivo[op] || 0) + (b.importe_ars || 0);
    }
  }
  return { compras, ventas, ajustes, neto: compras - ventas + ajustes, breakdownPasivo };
}

// ── Consolidado de boletos ────────────────────────────────────────────────
// Los MISMOS boletos del stock actual, agrupados por TIPO de movimiento:
// COMPRAS → VENTAS → un grupo por tipo de cobro (Interest payment,
// Amortization, Dividend…) → AJUSTES. Es una re-presentación de las filas que
// ya están en pantalla, no un cálculo nuevo: cada subtotal suma exactamente
// los boletos que cuelgan de él.
export interface GrupoBoletos {
  key: string;
  label: string;
  orden: number;
  boletos: BoletoDetalle[];
  cantidad: number;           // compras/ventas: Σ|cant| · ajustes: Σ con signo
  precioProm: number | null;  // ponderado por cantidad (null si no hay qty)
  importe: number | null;     // null = el grupo mezcla monedas → no se suma
  moneda: string;             // "MIX" si mezcla
  importeArs: number;
}

// Σ importes en moneda ORIGINAL sólo si todos los boletos comparten moneda:
// sumar USD con ARS daría un número sin unidad. IMP ARS siempre se puede
// sumar — el backend lo pesifica boleto a boleto al MEP de su fecha.
function _sumaMoneda(boletos: BoletoDetalle[]): { importe: number | null; moneda: string } {
  const monedas = new Set(boletos.map((b) => b.moneda || ""));
  const total = boletos.reduce((acc, b) => acc + (b.importe || 0), 0);
  return monedas.size === 1
    ? { importe: total, moneda: [...monedas][0] }
    : { importe: null, moneda: "MIX" };
}

function _consolidarBoletos(boletos: BoletoDetalle[]): GrupoBoletos[] {
  const acc = new Map<string, { label: string; orden: number; boletos: BoletoDetalle[] }>();
  for (const b of boletos) {
    let key: string, label: string, orden: number;
    if (b.categoria === "compra" || b.categoria === "suscripcion_fci") {
      key = "compras"; label = "COMPRAS"; orden = 0;
    } else if (b.categoria === "venta" || b.categoria === "rescate_fci") {
      key = "ventas"; label = "VENTAS"; orden = 1;
    } else if (esAjuste(b.categoria)) {
      key = "ajustes"; label = "AJUSTES"; orden = 3;
    } else {
      // Acreencias: un grupo por OP, que es la pregunta real («cuánto cobré
      // de intereses» ≠ «cuánto me amortizaron»).
      const op = (b.op || b.categoria || "otros").trim();
      key = `cobro:${op}`; label = op.toUpperCase(); orden = 2;
    }
    const g = acc.get(key) ?? { label, orden, boletos: [] };
    g.boletos.push(b);
    acc.set(key, g);
  }
  return [...acc.entries()]
    .map(([key, g]) => {
      const esAj = key === "ajustes";
      const cantAbs = g.boletos.reduce((a, b) => a + Math.abs(b.cantidad || 0), 0);
      const pxPond  = g.boletos.reduce((a, b) => a + Math.abs(b.cantidad || 0) * (b.precio || 0), 0);
      const { importe, moneda } = _sumaMoneda(g.boletos);
      return {
        key,
        label: g.label,
        orden: g.orden,
        boletos: g.boletos,
        // Los ajustes son deltas CON signo (un split 10:1 sobre 100 trae
        // +900); compras y ventas viajan sin signo confiable → magnitud.
        cantidad: esAj ? g.boletos.reduce((a, b) => a + (b.cantidad || 0), 0) : cantAbs,
        precioProm: cantAbs > 0 && pxPond > 0 ? pxPond / cantAbs : null,
        importe,
        moneda,
        importeArs: g.boletos.reduce((a, b) => a + (b.importe_ars || 0), 0),
      };
    })
    .sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label));
}

// ── Component ─────────────────────────────────────────────────────────────

export function PnLTitulosView({ idCuenta }: { idCuenta: string }) {
  const [data, setData]         = useState<PnLResp | null>(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("pnl_total");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [moneda, setMoneda]     = useState<Moneda>("ARS");
  const esUSD = moneda === "USD";

  useEffect(() => {
    if (!idCuenta) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(
          `/api/aum-pnl?id_cuenta=${encodeURIComponent(idCuenta)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setSelectedTicker(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  const filasFiltradas = useMemo(() => {
    if (!data) return [];
    return data.rows;
  }, [data]);

  // Total mostrado en UI = no_realizado + pasivo. Realizado se excluye
  // hasta que tengamos la vista histórica de realizado (futuro). El
  // backend sigue devolviendo `pnl_realizado` y `pnl_total` (que lo
  // incluye) — acá los ignoramos para no presentar números mezclados.
  const totalView = (r: PnLRow) =>
    esUSD
      ? (r.pnl_no_realizado_usd ?? 0) + (r.pnl_pasivo_usd ?? 0)
      : (r.pnl_no_realizado ?? 0) + r.pnl_pasivo;

  const filasOrdenadas = useMemo(() => {
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * sgn;
      if (sortKey === "pnl_total") return (totalView(a) - totalView(b)) * sgn;
      if (sortKey === "valor_actual_aum") return (valVista(a, esUSD) - valVista(b, esUSD)) * sgn;
      if (sortKey === "costo_remanente") return (costoVista(a, esUSD) - costoVista(b, esUSD)) * sgn;
      const av = (a[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      const bv = (b[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      return (av - bv) * sgn;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasFiltradas, sortKey, sortDir, esUSD]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  if (!idCuenta) {
    return <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Elegí una cuenta.</div>;
  }
  if (err) {
    return <div className="p-3 text-[11px] text-[var(--t-neg)]">Error: {err}</div>;
  }
  if (loading && !data) {
    return <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Cargando…</div>;
  }
  if (!data) return null;

  const t = data.totales;
  const tNoReal = esUSD ? (t.pnl_no_realizado_usd ?? 0) : t.pnl_no_realizado;
  const tValor  = esUSD ? (t.valor_actual_usd ?? 0) : t.valor_actual;
  const tCosto  = esUSD ? (t.costo_remanente_usd ?? 0) : t.costo_remanente;
  // ¿El backend trae datos USD? (requiere MEP de hoy disponible).
  const usdDisponible =
    (t.valor_actual_usd ?? 0) > 0 || data.rows.some((r) => (r.valor_actual_usd ?? 0) > 0);

  // Export "DESCARGAR TODO" de la cuenta: un solo Excel con 2 hojas —
  // (1) Posiciones y (2) Movimientos. Trae EXACTAMENTE lo que muestra la
  // página: por cada posición, los boletos del STOCK ACTUAL (los mismos que
  // se ven en el detalle y que entran al cálculo del PnL). Es para VALIDAR el
  // PnL → tiene que reconciliar 1:1 con la pantalla, no traer histórico.
  // Los importes van como número nativo (number-format de Excel por celda).
  const exportarTodo = async () => {
    // Hoja 1 — Posiciones (en la moneda seleccionada ARS/USD).
    const posiciones = filasOrdenadas.map((r) => {
      const costoRow = costoVista(r, esUSD);
      const valorRow = valVista(r, esUSD);
      const total = totalView(r);
      return {
        ticker: r.display_name || r.ticker,
        unidad: r.unidad,
        cantidad: r.qty_aum,
        costo: costoRow,
        valor: valorRow,
        pnl_no_real: esUSD ? (r.pnl_no_realizado_usd ?? null) : r.pnl_no_realizado,
        pnl_cobros: esUSD ? (r.pnl_pasivo_usd ?? 0) : r.pnl_pasivo,
        pnl_total: total,
        gan_pct: costoRow > 0 ? (total / costoRow) * 100 : null,
        fuente: r.valor_actual_source ?? "",
        estado: r.completeness,
      };
    });

    // Hoja 2 — Movimientos: aplanamos los boletos de cada posición. Marcamos
    // con `en_stock_actual` los que pertenecen al período del stock vivo (los
    // que se ven en el detalle) vs los históricos ya compensados.
    const movimientos = filasOrdenadas.flatMap((r) =>
      _filtrarPeriodoActual(r.boletos).map((b) => ({
        ticker: r.display_name || r.ticker,
        unidad: r.unidad,
        fecha: b.fecha,
        op: b.op || b.categoria,
        categoria: b.categoria,
        cantidad: b.cantidad,
        precio: b.precio,
        importe: b.importe,
        moneda: b.moneda,
        mep: b.mep,
        importe_ars: b.importe_ars,
      })),
    );

    await exportToXlsx({
      filename: `pnl-titulos-${idCuenta}-${moneda}-${timestampSuffix()}.xlsx`,
      sheets: [
        {
          name: "Posiciones",
          title: `PnL Títulos · cuenta ${idCuenta} · ${moneda}${data.fecha_actual ? ` · al ${data.fecha_actual}` : ""}`,
          rows: posiciones,
          columns: [
            { header: "Ticker", key: "ticker", format: "text", width: 28 },
            { header: "Unidad", key: "unidad", format: "text", width: 24 },
            { header: "Cantidad", key: "cantidad", format: "number", width: 16 },
            { header: `Costo (${moneda})`, key: "costo", format: "number", width: 16 },
            { header: `Valor (${moneda})`, key: "valor", format: "number", width: 16 },
            { header: `PnL No Realizado (${moneda})`, key: "pnl_no_real", format: "number", width: 20 },
            { header: `PnL Cobros (${moneda})`, key: "pnl_cobros", format: "number", width: 18 },
            { header: `PnL Total (${moneda})`, key: "pnl_total", format: "number", width: 18 },
            { header: "Gan %", key: "gan_pct", format: "percent", width: 10 },
            { header: "Fuente Valor", key: "fuente", format: "text", width: 12 },
            { header: "Estado", key: "estado", format: "text", width: 12 },
          ],
        },
        {
          name: "Movimientos",
          title: `Movimientos · cuenta ${idCuenta} · todas las posiciones`,
          rows: movimientos,
          columns: [
            { header: "Ticker", key: "ticker", format: "text", width: 28 },
            { header: "Unidad", key: "unidad", format: "text", width: 24 },
            { header: "Fecha", key: "fecha", format: "date", width: 12 },
            { header: "Op", key: "op", format: "text", width: 18 },
            { header: "Categoría", key: "categoria", format: "text", width: 16 },
            { header: "Cantidad", key: "cantidad", format: "number", width: 14 },
            { header: "Precio", key: "precio", format: "number", width: 14 },
            { header: "Importe", key: "importe", format: "number", width: 16 },
            { header: "Moneda", key: "moneda", format: "text", width: 8 },
            { header: "MEP", key: "mep", format: "number", width: 10 },
            { header: "Importe ARS", key: "importe_ars", format: "number", width: 16 },
          ],
        },
      ],
    });
  };

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {/* KPIs — solo Valor Actual + PnL No Realizado (el resto confunde) */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={`VALOR ACTUAL · ${moneda}`}
             value={fmtMon(tValor, esUSD)}
             sub={tCosto > 0 ? `costo: ${fmtMon(tCosto, esUSD)}` : ""}
        />
        <Kpi label={`PNL NO REALIZADO · ${moneda}`}
             value={fmtMonSigned(tNoReal, esUSD)}
             accent={tNoReal >= 0 ? "var(--t-pos)" : "#ff4d4d"}
             sub={esUSD ? "valor hoy − costo USD" : "stock vivo · papel"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">MONEDA</span>
          {(["ARS", "USD"] as Moneda[]).map((m) => {
            const disabled = m === "USD" && !usdDisponible;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMoneda(m)}
                disabled={disabled}
                title={disabled ? "Sin MEP de hoy para convertir a USD" : ""}
                className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                  moneda === m
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : disabled
                      ? "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border)] cursor-not-allowed"
                      : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
        <span className="text-[9px] text-[var(--t-text-muted)] ml-auto font-mono">
          {filasOrdenadas.length} tickers
          {data.fecha_actual ? ` · al ${data.fecha_actual}` : ""}
        </span>
        {filasOrdenadas.length > 0 && (
          <DownloadButton onClick={exportarTodo} title="Descargar TODO — posiciones + movimientos (Excel, 2 hojas)" />
        )}
      </div>

      {/* Split layout: posiciones (izq) + detalle de la seleccionada (der) */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* ── Panel izquierdo: POSICIONES ─────────────────────────── */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
          {filasOrdenadas.length === 0 ? (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-[11px]">Sin tickers para mostrar.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
                  <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                    <th onClick={() => toggleSort("ticker")} className="px-3 py-2 text-left cursor-pointer hover:text-[var(--t-accent)] select-none">
                      TICKER {arrow("ticker")}
                    </th>
                    <th className="px-2 py-2 text-right">CANT</th>
                    <th onClick={() => toggleSort("costo_remanente")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      COSTO {arrow("costo_remanente")}
                    </th>
                    <th onClick={() => toggleSort("valor_actual_aum")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      VALOR {arrow("valor_actual_aum")}
                    </th>
                    <th className="px-2 py-2 text-right">GAN %</th>
                    <th onClick={() => toggleSort("pnl_total")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      PNL {arrow("pnl_total")}
                    </th>
                    <th className="px-2 py-2 text-right">FLAGS</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((r) => {
                    const isSel  = selectedTicker === r.ticker;
                    const total  = totalView(r);
                    const costoRow = costoVista(r, esUSD);
                    const valorRow = valVista(r, esUSD);
                    const ganPct = costoRow > 0
                      ? (total / costoRow) * 100
                      : null;
                    return (
                      <tr
                        key={r.ticker}
                        onClick={() => setSelectedTicker(isSel ? null : r.ticker)}
                        className={
                          "border-b border-[var(--t-border)] cursor-pointer " +
                          (isSel ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-accent)]/5")
                        }
                      >
                        <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[180px]" title={r.display_name || r.ticker}>
                          {r.display_name || r.ticker}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text)]">
                          {r.qty_aum.toLocaleString("es-AR")}
                          {r.qty_calc !== r.qty_aum && (
                            <span className="ml-1 text-[var(--t-accent)] text-[9px]" title={`Boletos: ${r.qty_calc}`}>
                              ({r.qty_calc.toLocaleString("es-AR")})
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                          {costoRow > 0 ? fmtMon(costoRow, esUSD) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text)]">
                          {fmtMon(valorRow, esUSD)}
                          {r.valor_actual_source === "live" && (
                            <span className="ml-1 text-[7px] text-[var(--t-pos)] tracking-widest">LIVE</span>
                          )}
                          {r.valor_actual_source === "cierre" && (
                            <span className="ml-1 text-[7px] text-[var(--t-text-dim)] tracking-widest">CIE</span>
                          )}
                          {r.valor_actual_source === "aum" && (
                            <span className="ml-1 text-[7px] text-[var(--t-text-muted)] tracking-widest">AUM</span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${pnlClass(ganPct)}`}>
                          {ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${pnlClass(total)}`}>
                          {fmtMonSigned(total, esUSD)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[9px]">
                          {r.completeness === "parcial" && (
                            <span className="px-1 py-0 bg-[var(--t-accent)]/15 text-[var(--t-accent)] tracking-widest">P</span>
                          )}
                          {r.completeness === "sin_boletos" && (
                            <span className="px-1 py-0 bg-[#ff4d4d]/15 text-[var(--t-neg)] tracking-widest">SB</span>
                          )}
                          {r.moneda_mixta && (
                            <span className="ml-1 px-1 py-0 bg-[#4a9eff]/15 text-[#4a9eff] tracking-widest">$</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel derecho: DETALLE de la posición seleccionada ──── */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] min-h-0 overflow-y-auto">
          {selectedTicker ? (
            <PosicionDetalle
              row={filasOrdenadas.find((r) => r.ticker === selectedTicker)!}
              esUSD={esUSD}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px] tracking-widest">
              Seleccioná una posición a la izquierda
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panel detalle ────────────────────────────────────────────────────────
// Cómo se leen los boletos del stock actual: DETALLE = cronológico, tal cual
// vienen; CONSOLIDADO = agrupados por tipo con subtotal por grupo y neto abajo.
type Modo = "detalle" | "consolidado";

export function PosicionDetalle({ row, esUSD = false }: { row: PnLRow; esUSD?: boolean }) {
  const boletosPeriodo = _filtrarPeriodoActual(row.boletos);
  const stats = _statsDelPeriodo(boletosPeriodo);
  const tieneBreakdown = Object.keys(stats.breakdownPasivo).length > 0;
  // El modo vive acá y NO se resetea al cambiar de ticker (el componente no
  // se remonta): quien mira consolidado sigue mirando consolidado al saltar
  // de posición. En CONSOLIDADO los grupos arrancan CERRADOS — la respuesta
  // («cuánto compré, vendí y cobré») queda en 3 o 4 líneas, y el detalle de
  // cada grupo se abre clickeándolo.
  const [modo, setModo] = useState<Modo>("detalle");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const grupos    = _consolidarBoletos(boletosPeriodo);
  const totalCons = _sumaMoneda(boletosPeriodo);
  const totalArs  = boletosPeriodo.reduce((a, b) => a + (b.importe_ars || 0), 0);
  const toggleGrupo = (k: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // Vista moneda-aware. En USD: costo a MEP histórico, valor a MEP de hoy.
  // El realizado del día (intraday) entra al total/GAN% acá, igual que en ARS.
  const costo   = costoVista(row, esUSD);
  const valor   = valVista(row, esUSD);
  const noReal  = esUSD ? (row.pnl_no_realizado_usd ?? null) : row.pnl_no_realizado;
  const pasivo  = esUSD ? (row.pnl_pasivo_usd ?? 0) : row.pnl_pasivo;
  const realDia = esUSD ? (row.pnl_realizado_dia_usd ?? 0) : (row.pnl_realizado_dia ?? 0);
  const pnlTot  = (noReal ?? 0) + pasivo + realDia;
  const ganPct = costo > 0 ? (pnlTot / costo) * 100 : null;

  // Export de la tabla de BOLETOS del stock actual a Excel. Importe / precio /
  // MEP van como número nativo (en su moneda original — IMPORTE ARS pesificado).
  const exportarBoletos = async () => {
    await exportToXlsx({
      filename: `boletos-${(row.display_name || row.ticker).replace(/[^\w.-]+/g, "_")}-${timestampSuffix()}.xlsx`,
      sheets: [
        {
          name: "Boletos",
          title: `Boletos del stock actual · ${row.display_name || row.ticker} · ${row.unidad}`,
          rows: boletosPeriodo.map((b) => ({
            fecha: b.fecha,
            op: b.op || b.categoria,
            categoria: b.categoria,
            cantidad: b.cantidad,
            precio: b.precio,
            importe: b.importe,
            moneda: b.moneda,
            mep: b.mep,
            importe_ars: b.importe_ars,
          })),
          columns: [
            { header: "Fecha", key: "fecha", format: "date", width: 12 },
            { header: "Op", key: "op", format: "text", width: 18 },
            { header: "Categoría", key: "categoria", format: "text", width: 16 },
            { header: "Cantidad", key: "cantidad", format: "number", width: 14 },
            { header: "Precio", key: "precio", format: "number", width: 14 },
            { header: "Importe", key: "importe", format: "number", width: 16 },
            { header: "Moneda", key: "moneda", format: "text", width: 8 },
            { header: "MEP", key: "mep", format: "number", width: 10 },
            { header: "Importe ARS", key: "importe_ars", format: "number", width: 16 },
          ],
        },
        {
          name: "Consolidado",
          title: `Consolidado del stock actual · ${row.display_name || row.ticker} · ${row.unidad}`,
          rows: [
            ...grupos.map((g) => ({
              grupo: g.label,
              movimientos: g.boletos.length,
              cantidad: g.cantidad,
              precio_prom: g.precioProm,
              importe: g.importe,
              moneda: g.moneda,
              importe_ars: g.importeArs,
            })),
            {
              grupo: "NETO",
              movimientos: boletosPeriodo.length,
              cantidad: stats.neto,
              precio_prom: null,
              importe: totalCons.importe,
              moneda: totalCons.moneda,
              importe_ars: totalArs,
            },
          ],
          columns: [
            { header: "Grupo", key: "grupo", format: "text", width: 22 },
            { header: "Movs", key: "movimientos", format: "integer", width: 8 },
            { header: "Cantidad", key: "cantidad", format: "number", width: 14 },
            { header: "Precio prom.", key: "precio_prom", format: "number", width: 14 },
            { header: "Importe", key: "importe", format: "number", width: 16 },
            { header: "Moneda", key: "moneda", format: "text", width: 8 },
            { header: "Importe ARS", key: "importe_ars", format: "number", width: 16 },
          ],
        },
      ],
    });
  };

  return (
    <div className="p-3 text-[10px] text-[var(--t-text-dim)]">
      {/* Header del ticker */}
      <div className="border-b border-[var(--t-border)] pb-2 mb-3">
        <div className="text-[12px] text-[var(--t-text)] font-mono mb-0.5">{row.display_name || row.ticker}</div>
        <div className="text-[9px] text-[var(--t-text-muted)]">
          {row.ticker !== (row.display_name || row.ticker) && <span>{row.ticker} · </span>}
          {row.unidad}
        </div>
      </div>

      {/* Mini-KPIs por ticker */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <DetKpi label={`COSTO${esUSD ? " USD" : ""}`} value={costo > 0 ? fmtMon(costo, esUSD) : "—"} />
        <DetKpi label="VALOR"    value={fmtMon(valor, esUSD)} />
        <DetKpi label="PNL"
                value={fmtMonSigned(pnlTot, esUSD)}
                accent={pnlTot >= 0 ? "var(--t-pos)" : "#ff4d4d"} />
        <DetKpi label="NO REAL"  value={noReal != null ? fmtMonSigned(noReal, esUSD) : "—"}
                accent={(noReal ?? 0) >= 0 ? "var(--t-pos)" : "#ff4d4d"} />
        <DetKpi label="COBROS"   value={pasivo !== 0 ? fmtMonSigned(pasivo, esUSD) : "—"}
                accent={pasivo >= 0 ? "var(--t-pos)" : "#ff4d4d"} />
        <DetKpi label="GAN %"    value={ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(2)}%` : "—"}
                accent={(ganPct ?? 0) >= 0 ? "var(--t-pos)" : "#ff4d4d"} />
      </div>

      {/* Realizado intraday — solo si hubo day-trades cerrados */}
      {realDia !== 0 && (
        <div className="mb-3 px-2 py-1 border border-[#4a9eff]/30 bg-[#4a9eff]/5 text-[10px]">
          <span className="text-[var(--t-text-muted)] tracking-widest mr-2">REALIZADO HOY:</span>
          <span className={pnlClass(realDia) + " font-semibold"}>
            {fmtMonSigned(realDia, esUSD)}
          </span>
          <span className="ml-1 text-[8px] text-[#4a9eff]">day-trade cerrado</span>
        </div>
      )}

      {/* Flujo del stock actual */}
      <div className="mb-2">
        <span className="text-[var(--t-text-muted)] tracking-widest">FLUJO (STOCK ACTUAL):</span>{" "}
        {stats.compras > 0 && <span>compras: {stats.compras.toLocaleString("es-AR")} · </span>}
        {stats.ventas > 0 && <span>ventas: {stats.ventas.toLocaleString("es-AR")} · </span>}
        {stats.ajustes !== 0 && (
          <span className="text-[var(--t-accent)]">
            ajustes: {stats.ajustes > 0 ? "+" : ""}{stats.ajustes.toLocaleString("es-AR")} ·{" "}
          </span>
        )}
        <span>neto: {stats.neto.toLocaleString("es-AR")}</span>
        {row.qty_calc !== row.qty_aum && (
          <span className="text-[var(--t-accent)]"> · AuM: {row.qty_aum.toLocaleString("es-AR")} (Δ {(row.qty_aum - row.qty_calc).toLocaleString("es-AR")})</span>
        )}
        <span className="text-[var(--t-text-muted)]"> · {boletosPeriodo.length}/{row.boletos.length} movs</span>
      </div>

      {/* Cobros pasivos del período */}
      {tieneBreakdown && (
        <div className="mb-2">
          <span className="text-[var(--t-text-muted)] tracking-widest">COBROS PASIVOS (PERÍODO):</span>{" "}
          {Object.entries(stats.breakdownPasivo).map(([op, val]) => (
            <span key={op}>
              <span className="text-[var(--t-text-muted)]">{op}:</span> <span className="text-[var(--t-text)]">{fmtCompact(val)}</span>
              {" · "}
            </span>
          ))}
        </div>
      )}

      {row.fechas_sin_mep.length > 0 && (
        <div className="mb-2 text-[9px] text-[var(--t-accent)]">
          ⚠ {row.fechas_sin_mep.length} fechas sin MEP — montos USD sin pesificar correctamente
        </div>
      )}

      {/* Boletos del período activo — dos lecturas del MISMO listado */}
      {boletosPeriodo.length > 0 && (
        <div className="mt-3 border-t border-[var(--t-border)] pt-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-[var(--t-text-muted)] tracking-widest">
              BOLETOS DEL STOCK ACTUAL ({boletosPeriodo.length}
              {row.boletos.length > boletosPeriodo.length && (
                <span className="text-[var(--t-text-muted)]"> · {row.boletos.length - boletosPeriodo.length} históricos ocultos</span>
              )}
              ):
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(["detalle", "consolidado"] as Modo[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  title={m === "detalle"
                    ? "Listado cronológico, un boleto abajo del otro"
                    : "Agrupado: compras, ventas y cada tipo de cobro, con subtotales y neto"}
                  className={`px-1.5 py-0.5 text-[9px] tracking-widest border transition-colors ${
                    modo === m
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                      : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
              <DownloadButton onClick={exportarBoletos} title="Descargar boletos (Excel: detalle + consolidado)" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="text-[9px] text-[var(--t-text-muted)] tracking-widest">
                <tr>
                  <th className="px-2 py-1 text-left">FECHA</th>
                  <th className="px-2 py-1 text-left">OP</th>
                  <th className="px-2 py-1 text-right">CANT</th>
                  <th className="px-2 py-1 text-right">PRECIO</th>
                  <th className="px-2 py-1 text-right">IMPORTE</th>
                  <th className="px-2 py-1 text-left">MON</th>
                  <th className="px-2 py-1 text-right">MEP</th>
                  <th className="px-2 py-1 text-right">IMP ARS</th>
                </tr>
              </thead>
              <tbody>
                {modo === "detalle"
                  ? boletosPeriodo.map((b, i) => <FilaBoleto key={i} b={b} />)
                  : grupos.map((g) => {
                      const abierto = expandidos.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          <tr
                            onClick={() => toggleGrupo(g.key)}
                            className="border-t border-[var(--t-border-2)] bg-[var(--t-surface)] cursor-pointer hover:bg-[var(--t-accent)]/5"
                          >
                            <td colSpan={2} className="px-2 py-1 text-[var(--t-text)] tracking-widest">
                              <span className="text-[var(--t-text-muted)] mr-1">{abierto ? "▾" : "▸"}</span>
                              {g.label}
                              <span className="text-[var(--t-text-muted)]"> ({g.boletos.length})</span>
                            </td>
                            <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">
                              {g.cantidad ? g.cantidad.toLocaleString("es-AR") : "—"}
                            </td>
                            <td className="px-2 py-1 text-right text-[var(--t-text-muted)]">
                              {g.precioProm != null ? g.precioProm.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : "—"}
                            </td>
                            <td className={`px-2 py-1 text-right font-semibold ${pnlClass(g.importe)}`}>
                              {g.importe != null ? g.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                            </td>
                            <td className="px-2 py-1 text-[var(--t-text-dim)]">{g.moneda}</td>
                            <td className="px-2 py-1" />
                            <td className={`px-2 py-1 text-right font-semibold ${pnlClass(g.importeArs)}`}>
                              {g.importeArs ? fmtCompact(g.importeArs) : "—"}
                            </td>
                          </tr>
                          {abierto && g.boletos.map((b, i) => <FilaBoleto key={`${g.key}-${i}`} b={b} sangria />)}
                        </Fragment>
                      );
                    })}
                {modo === "consolidado" && (
                  <tr className="border-t-2 border-[var(--t-accent)]/40 bg-[var(--t-accent)]/5">
                    <td colSpan={2} className="px-2 py-1 text-[var(--t-text)] tracking-widest font-semibold">
                      NETO
                    </td>
                    <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">
                      {stats.neto.toLocaleString("es-AR")}
                    </td>
                    <td className="px-2 py-1" />
                    <td className={`px-2 py-1 text-right font-semibold ${pnlClass(totalCons.importe)}`}>
                      {totalCons.importe != null ? totalCons.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="px-2 py-1 text-[var(--t-text-dim)]">{totalCons.moneda}</td>
                    <td className="px-2 py-1" />
                    <td className={`px-2 py-1 text-right font-semibold ${pnlClass(totalArs)}`}>
                      {totalArs ? fmtCompact(totalArs) : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {modo === "consolidado" && (
            <div className="mt-1.5 text-[9px] text-[var(--t-text-muted)] leading-relaxed">
              NETO de nominales = compras − ventas{stats.ajustes !== 0 ? " ± ajustes" : ""} (los cobros no mueven cantidad);
              NETO de importes = plata neta del período (compras con signo negativo, ventas y cobros positivos).
              El <span className="text-[var(--t-text-dim)]">COSTO</span> de los KPIs no es esta resta: cada venta libera
              costo al PROMEDIO PONDERADO del stock en ese momento, no al precio de la compra que salió.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Una fila de boleto — la misma en DETALLE y adentro de cada grupo del
// CONSOLIDADO (`sangria` la corre para que se lea colgando de su grupo).
function FilaBoleto({ b, sangria = false }: { b: BoletoDetalle; sangria?: boolean }) {
  const colorImporte =
    b.importe > 0 ? "text-[var(--t-pos)]"
    : b.importe < 0 ? "text-[var(--t-neg)]"
    : "text-[var(--t-text-dim)]";
  // Pseudo-boletos de ajuste (splits/canjes manuales) en ámbar: no son
  // boletos de Aunesa, son correcciones cargadas a mano.
  const ajuste = esAjuste(b.categoria);
  return (
    <tr
      className={`border-t border-[var(--t-border)] hover:bg-[var(--t-surface)] ${
        ajuste ? "bg-[var(--t-accent)]/10" : ""
      }`}
    >
      <td className={`py-0.5 text-[var(--t-text)] ${sangria ? "pl-4 pr-2" : "px-2"}`}>{b.fecha}</td>
      <td className={`px-2 py-0.5 ${ajuste ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"}`}>
        {b.op || b.categoria}
      </td>
      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
        {b.cantidad ? b.cantidad.toLocaleString("es-AR") : "—"}
      </td>
      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
        {b.precio ? b.precio.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : "—"}
      </td>
      <td className={`px-2 py-0.5 text-right ${colorImporte}`}>
        {b.importe ? b.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
      </td>
      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.moneda}</td>
      <td className="px-2 py-0.5 text-right text-[var(--t-text-muted)]">
        {b.mep ? b.mep.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
      </td>
      <td className={`px-2 py-0.5 text-right ${colorImporte}`}>
        {b.importe_ars ? fmtCompact(b.importe_ars) : "—"}
      </td>
    </tr>
  );
}

function DetKpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-1">
      <div className="text-[8px] text-[var(--t-text-muted)] uppercase tracking-wider">{label}</div>
      <div className="text-[12px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
      <div className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--t-text-muted)]">{sub}</div>}
    </div>
  );
}
