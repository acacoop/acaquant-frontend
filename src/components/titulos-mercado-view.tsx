"use client";

import { Fragment, useMemo, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
import { DownloadButton } from "./download-button";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 10_000;

interface CuentaRow {
  id_cuenta: string | null;
  cuenta: string;
  op: string;
  plazo: string | null;
  cantidad: number;
  importe: number;
  precio: number | null;
  comprobante: string | null;
  fecha: string | null;
  moneda: string | null;
}

interface TickerRow {
  ticker: string;
  enviar_qty: number;
  enviar_importe: number;
  recibir_qty: number;
  recibir_importe: number;
  neto_qty: number;
  n_ops: number;
  cuentas: CuentaRow[];
}

interface Totales {
  n_ops: number;
  enviar_qty: number;
  enviar_importe: number;
  recibir_qty: number;
  recibir_importe: number;
}

interface TitulosResp {
  fecha: string;
  dia_anterior: string | null;
  mercado_cerrado: boolean;
  ts: string;
  tickers: TickerRow[];
  totales: Totales;
  plazos_desconocidos: string[];
}

type Unidad = "nominales" | "dinero";
type Filtro = "ambos" | "enviar" | "recibir";
type Vista = "ticker" | "comitente";

interface TickerCuentaRow {
  ticker: string;
  cuenta: string;
  id_cuenta: string | null;
  enviar_qty: number;
  enviar_importe: number;
  recibir_qty: number;
  recibir_importe: number;
  neto_qty: number;
  neto_importe: number;
  n_ops: number;
}

const EMPTY: TitulosResp = {
  fecha: "",
  dia_anterior: null,
  mercado_cerrado: false,
  ts: "",
  tickers: [],
  totales: {
    n_ops: 0,
    enviar_qty: 0,
    enviar_importe: 0,
    recibir_qty: 0,
    recibir_importe: 0,
  },
  plazos_desconocidos: [],
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n) || n === 0) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtArs(n: number | null | undefined, dec = 0): string {
  if (n === null || n === undefined || !isFinite(n) || n === 0) return "—";
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.slice(0, 10);
  if (t.length !== 10) return s;
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`;
}

// ─── Componente principal ────────────────────────────────────────────────────

export function TitulosMercadoView() {
  const { data, lastAt } = usePoll<TitulosResp>(
    "/api/back-office/titulos-mercado",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  const [unidad, setUnidad] = useState<Unidad>("nominales");
  const [filtro, setFiltro] = useState<Filtro>("ambos");
  const [vista, setVista] = useState<Vista>("ticker");

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";

  // Filtra los tickers según el filtro (enviar/recibir/ambos). El sort
  // ya viene del backend: 'enviar_qty desc' → lo más crítico arriba.
  const tickersFiltrados = useMemo(() => {
    if (filtro === "enviar")  return data.tickers.filter((t) => t.enviar_qty  > 0);
    if (filtro === "recibir") return data.tickers.filter((t) => t.recibir_qty > 0);
    return data.tickers;
  }, [data.tickers, filtro]);

  // Vista "por comitente": aplana ticker × cuenta. Cada fila es (ticker,
  // cuenta) con enviar / recibir / neto agregados de todas las ops de
  // esa cuenta sobre ese ticker. Ordenado por ticker, luego por |neto| desc.
  const filasComitente = useMemo<TickerCuentaRow[]>(() => {
    if (vista !== "comitente") return [];
    const out: TickerCuentaRow[] = [];
    for (const t of tickersFiltrados) {
      const byCuenta = new Map<string, TickerCuentaRow>();
      for (const c of t.cuentas) {
        // Aplicamos también el filtro enviar/recibir a nivel cuenta.
        const isVenta = (c.op || "").toLowerCase().startsWith("v");
        if (filtro === "enviar"  && !isVenta) continue;
        if (filtro === "recibir" && isVenta)  continue;

        const key = c.cuenta;
        let row = byCuenta.get(key);
        if (!row) {
          row = {
            ticker:         t.ticker,
            cuenta:         c.cuenta,
            id_cuenta:      c.id_cuenta,
            enviar_qty:     0,
            enviar_importe: 0,
            recibir_qty:    0,
            recibir_importe:0,
            neto_qty:       0,
            neto_importe:   0,
            n_ops:          0,
          };
          byCuenta.set(key, row);
        }
        if (isVenta) {
          row.enviar_qty     += c.cantidad;
          row.enviar_importe += c.importe;
        } else {
          row.recibir_qty     += c.cantidad;
          row.recibir_importe += c.importe;
        }
        row.n_ops += 1;
      }
      for (const row of byCuenta.values()) {
        row.neto_qty     = row.enviar_qty     - row.recibir_qty;
        row.neto_importe = row.enviar_importe - row.recibir_importe;
        out.push(row);
      }
    }
    // Sort: ticker ascendente, dentro de cada ticker por |neto_qty| desc.
    out.sort(
      (a, b) =>
        a.ticker.localeCompare(b.ticker) ||
        Math.abs(b.neto_qty) - Math.abs(a.neto_qty),
    );
    return out;
  }, [tickersFiltrados, vista, filtro]);

  // Totales ajustados al filtro: si miro solo enviar, los totales reflejan
  // solo eso (consistencia visual con la tabla).
  const totalesView = useMemo(() => {
    if (filtro === "ambos") return data.totales;
    const acc = { n_ops: 0, enviar_qty: 0, enviar_importe: 0, recibir_qty: 0, recibir_importe: 0 };
    for (const t of tickersFiltrados) {
      acc.enviar_qty      += t.enviar_qty;
      acc.enviar_importe  += t.enviar_importe;
      acc.recibir_qty     += t.recibir_qty;
      acc.recibir_importe += t.recibir_importe;
      acc.n_ops           += t.n_ops;
    }
    return acc;
  }, [tickersFiltrados, data.totales, filtro]);

  async function handleDownload() {
    // Hoja 1 — resumen por título (ticker + neto en nominales).
    const resumen = data.tickers.map((t) => ({
      ticker: t.ticker,
      neto:   t.neto_qty,
    }));

    // Hoja 2 — detalle por cuenta. Para cada (ticker, cuenta), agregamos
    // venta − compra para que dé el neto firmado (positivo = enviar,
    // negativo = recibir).
    const byTC = new Map<string, { ticker: string; cuenta: string; neto: number }>();
    for (const t of data.tickers) {
      for (const c of t.cuentas) {
        const key = `${t.ticker}::${c.cuenta}`;
        const sign = (c.op || "").toLowerCase().startsWith("v") ? 1 : -1;
        const row = byTC.get(key) ?? { ticker: t.ticker, cuenta: c.cuenta, neto: 0 };
        row.neto += sign * c.cantidad;
        byTC.set(key, row);
      }
    }
    const detalle = Array.from(byTC.values()).sort(
      (a, b) => a.ticker.localeCompare(b.ticker) || b.neto - a.neto,
    );

    await exportToXlsx({
      sheets: [
        {
          name: "Resumen",
          rows: resumen,
          columns: [
            { header: "Ticker", key: "ticker", format: "text",    width: 14 },
            { header: "Neto",   key: "neto",   format: "integer", width: 14 },
          ],
          title: `Títulos/Mercado · liquida ${fmtFecha(data.fecha)}`,
        },
        {
          name: "Detalle por cuenta",
          rows: detalle,
          columns: [
            { header: "Ticker", key: "ticker", format: "text",    width: 14 },
            { header: "Cuenta", key: "cuenta", format: "text",    width: 40 },
            { header: "Neto",   key: "neto",   format: "integer", width: 14 },
          ],
          title: `Títulos/Mercado · liquida ${fmtFecha(data.fecha)} · neto por cuenta (positivo = enviar)`,
        },
      ],
      filename: `titulos-mercado-${data.fecha || timestampSuffix()}.xlsx`,
    });
  }

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      <Header
        fecha={data.fecha}
        diaAnterior={data.dia_anterior}
        totales={totalesView}
        mercadoCerrado={data.mercado_cerrado}
        ultimoDisplay={ultimoDisplay}
        plazosDesconocidos={data.plazos_desconocidos}
        unidad={unidad}
      />

      <div className="flex-1 min-h-0">
        <Panel
          title="TÍTULOS / MERCADO"
          expandable
          actions={
            <div className="flex items-center gap-2">
              <VistaToggle vista={vista} setVista={setVista} />
              <FiltroBtns filtro={filtro} setFiltro={setFiltro} />
              <UnidadToggle unidad={unidad} setUnidad={setUnidad} />
              <DownloadButton
                onClick={handleDownload}
                title="Descargar Excel (2 hojas: resumen + detalle)"
              />
            </div>
          }
        >
          {data.mercado_cerrado ? (
            <div className="py-8 text-center">
              <div className="text-[var(--t-text-dim)] text-sm font-semibold tracking-wide">
                MERCADO CERRADO
              </div>
              <div className="text-[10px] text-[var(--t-text-muted)] mt-1">
                Fin de semana o feriado argentino — no hay liquidación hoy.
              </div>
            </div>
          ) : tickersFiltrados.length === 0 ? (
            <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">
              {data.tickers.length === 0
                ? "Sin operaciones que liquiden hoy"
                : "Sin tickers que matcheen el filtro"}
            </p>
          ) : vista === "comitente" ? (
            <TablaTickerComitente filas={filasComitente} unidad={unidad} />
          ) : (
            <TablaTickers tickers={tickersFiltrados} unidad={unidad} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Header({
  fecha,
  diaAnterior,
  totales,
  mercadoCerrado,
  ultimoDisplay,
  plazosDesconocidos,
  unidad,
}: {
  fecha: string;
  diaAnterior: string | null;
  totales: Totales;
  mercadoCerrado: boolean;
  ultimoDisplay: string;
  plazosDesconocidos: string[];
  unidad: Unidad;
}) {
  const enviarVal  = unidad === "nominales" ? totales.enviar_qty  : totales.enviar_importe;
  const recibirVal = unidad === "nominales" ? totales.recibir_qty : totales.recibir_importe;
  const fmt = unidad === "nominales" ? fmtQty : (n: number) => fmtArs(n);

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 flex items-center gap-3 flex-wrap shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">LIQUIDA</span>
        <span className="text-[var(--t-accent)] font-mono text-[12px] font-semibold">
          {fmtFecha(fecha) || "—"}
        </span>
        {!mercadoCerrado && diaAnterior && (
          <span className="text-[9px] text-[var(--t-text-muted)]">
            (CI/Inm de hoy + 24hs de {fmtFecha(diaAnterior)})
          </span>
        )}
      </div>
      {!mercadoCerrado && (
        <>
          <div className="h-4 w-px bg-[var(--t-border)]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">ENVIAR</span>
            <span className="text-[#f87171] font-mono text-[12px] font-semibold">
              {fmt(enviarVal)}
            </span>
          </div>
          <div className="h-4 w-px bg-[var(--t-border)]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">RECIBIR</span>
            <span className="text-[#4ade80] font-mono text-[12px] font-semibold">
              {fmt(recibirVal)}
            </span>
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {plazosDesconocidos.length > 0 && (
          <span
            className="text-[9px] text-[var(--t-accent)]"
            title={`Plazos no clasificados: ${plazosDesconocidos.join(", ")}`}
          >
            ⚠ {plazosDesconocidos.length} plazo(s) sin clasificar
          </span>
        )}
        <span className="text-[9px] text-[var(--t-text-muted)]">ÚLT {ultimoDisplay}</span>
      </div>
    </div>
  );
}

function FiltroBtns({
  filtro,
  setFiltro,
}: {
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {(["ambos", "enviar", "recibir"] as Filtro[]).map((f) => (
        <button
          key={f}
          onClick={() => setFiltro(f)}
          className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
            filtro === f
              ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
              : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          }`}
        >
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function VistaToggle({
  vista,
  setVista,
}: {
  vista: Vista;
  setVista: (v: Vista) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([
        ["ticker",    "TICKER"],
        ["comitente", "COMITENTE"],
      ] as [Vista, string][]).map(([v, label]) => (
        <button
          key={v}
          onClick={() => setVista(v)}
          className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
            vista === v
              ? "bg-[#e0c890] text-black border-[#e0c890]"
              : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#e0c890] hover:border-[#e0c890]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function UnidadToggle({
  unidad,
  setUnidad,
}: {
  unidad: Unidad;
  setUnidad: (u: Unidad) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {(["nominales", "dinero"] as Unidad[]).map((u) => (
        <button
          key={u}
          onClick={() => setUnidad(u)}
          className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
            unidad === u
              ? "bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]"
              : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#3b82f6] hover:border-[#3b82f6]"
          }`}
        >
          {u === "nominales" ? "NOM" : "$"}
        </button>
      ))}
    </div>
  );
}

function TablaTickers({
  tickers,
  unidad,
}: {
  tickers: TickerRow[];
  unidad: Unidad;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Sort por la columna Neto. null = orden default del backend
  // (enviar_qty desc — lo más crítico arriba). Click cicla null → desc
  // → asc → null.
  const [netoSort, setNetoSort] = useState<null | "asc" | "desc">(null);

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function cycleNetoSort() {
    setNetoSort((s) => (s === null ? "desc" : s === "desc" ? "asc" : null));
  }

  const fmt = unidad === "nominales" ? fmtQty : (n: number) => fmtArs(n);
  const netoSigned = (t: TickerRow) =>
    unidad === "nominales"
      ? t.neto_qty
      : t.enviar_importe - t.recibir_importe;

  // Si el user clickeó Neto, reordeno; si no, respeto el orden del backend.
  const tickersOrdenados = useMemo(() => {
    if (!netoSort) return tickers;
    const sign = netoSort === "desc" ? -1 : 1;
    return [...tickers].sort((a, b) => sign * (netoSigned(a) - netoSigned(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, netoSort, unidad]);

  return (
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)] sticky top-0 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 border-b border-[var(--t-border)] w-6" />
          <th className="text-left px-2 py-1.5 border-b border-[var(--t-border)]">
            Ticker
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
            Enviar
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
            Recibir
          </th>
          <th
            onClick={cycleNetoSort}
            title={`Click para ordenar por Neto · ${
              netoSort === null
                ? "default (Enviar desc)"
                : netoSort === "desc"
                  ? "más a enviar arriba"
                  : "más a recibir arriba"
            }`}
            className={`text-right px-2 py-1.5 border-b border-[var(--t-border)] cursor-pointer select-none ${
              netoSort ? "text-[var(--t-accent)]" : "hover:text-[var(--t-text)]"
            }`}
          >
            Neto{" "}
            <span className="inline-block w-2 text-[9px]">
              {netoSort === "desc" ? "▼" : netoSort === "asc" ? "▲" : "↕"}
            </span>
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
            Movimientos
          </th>
        </tr>
      </thead>
      <tbody>
        {tickersOrdenados.map((t) => {
          const isOpen = expanded.has(t.ticker);
          const enviarVal  = unidad === "nominales" ? t.enviar_qty  : t.enviar_importe;
          const recibirVal = unidad === "nominales" ? t.recibir_qty : t.recibir_importe;
          // Neto $: aprox (enviar_importe − recibir_importe). Pequeño abuso
          // porque los precios pueden ser distintos por op, pero como neto
          // direccional alcanza.
          const netoVal =
            unidad === "nominales"
              ? t.neto_qty
              : t.enviar_importe - t.recibir_importe;
          const netoColor =
            netoVal > 0
              ? "text-[#f87171]"
              : netoVal < 0
                ? "text-[#4ade80]"
                : "text-[var(--t-text-muted)]";
          return (
            <Fragment key={t.ticker}>
              <tr
                onClick={() => toggle(t.ticker)}
                className="border-b border-[#101010] hover:bg-[var(--t-surface)] cursor-pointer"
              >
                <td className="px-2 py-1 text-[var(--t-text-muted)] text-[10px]">
                  {isOpen ? "▼" : "▶"}
                </td>
                <td className="px-2 py-1 text-[var(--t-accent)] font-semibold">
                  {t.ticker}
                </td>
                <td className="px-2 py-1 text-right text-[#f87171] font-semibold">
                  {fmt(enviarVal)}
                </td>
                <td className="px-2 py-1 text-right text-[#4ade80] font-semibold">
                  {fmt(recibirVal)}
                </td>
                <td className={`px-2 py-1 text-right ${netoColor} font-semibold`}>
                  {fmt(Math.abs(netoVal))}
                  {netoVal > 0 ? " ↑" : netoVal < 0 ? " ↓" : ""}
                </td>
                <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                  {t.n_ops}
                </td>
              </tr>
              {isOpen && (
                <tr className="bg-[var(--t-panel)]">
                  <td />
                  <td colSpan={5} className="px-2 py-2">
                    <CuentasDetail cuentas={t.cuentas} unidad={unidad} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function CuentasDetail({
  cuentas,
  unidad,
}: {
  cuentas: CuentaRow[];
  unidad: Unidad;
}) {
  return (
    <table className="w-full text-[10px] font-mono tabular-nums">
      <thead className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide">
        <tr>
          <th className="text-left px-1.5 py-0.5">Cuenta</th>
          <th className="text-left px-1.5 py-0.5">Op</th>
          <th className="text-left px-1.5 py-0.5">Plazo</th>
          <th className="text-center px-1.5 py-0.5">Fecha</th>
          <th className="text-right px-1.5 py-0.5">
            {unidad === "nominales" ? "Cant." : "Importe"}
          </th>
          <th className="text-right px-1.5 py-0.5">Precio</th>
          <th className="text-left px-1.5 py-0.5">Comprobante</th>
        </tr>
      </thead>
      <tbody>
        {cuentas.map((c, i) => {
          const isVenta = (c.op || "").toLowerCase().startsWith("v");
          const valor = unidad === "nominales" ? c.cantidad : c.importe;
          const fmtVal = unidad === "nominales" ? fmtQty : (n: number) => fmtArs(n);
          return (
            <tr
              key={`${c.comprobante ?? i}-${c.op}`}
              className="border-b border-[#101010]"
            >
              <td className="px-1.5 py-0.5 text-[var(--t-text)]">{c.cuenta}</td>
              <td
                className={`px-1.5 py-0.5 font-semibold ${
                  isVenta ? "text-[#f87171]" : "text-[#4ade80]"
                }`}
              >
                {c.op}
              </td>
              <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">{c.plazo ?? "—"}</td>
              <td className="px-1.5 py-0.5 text-center text-[var(--t-text-dim)]">
                {fmtFecha(c.fecha)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text)]">
                {fmtVal(valor)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtPrice(c.precio)}
              </td>
              <td className="px-1.5 py-0.5 text-[var(--t-text-muted)] text-[9px]">
                {c.comprobante ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Vista alternativa: Ticker × Comitente (plana, agregada por par) ─────────

function TablaTickerComitente({
  filas,
  unidad,
}: {
  filas: TickerCuentaRow[];
  unidad: Unidad;
}) {
  const fmt = unidad === "nominales" ? fmtQty : (n: number) => fmtArs(n);

  // Marca de "primera fila del ticker" para mostrar el ticker solo en la
  // primera ocurrencia (más legible cuando hay muchas cuentas por ticker).
  const firstOf = useMemo(() => {
    const seen = new Set<string>();
    return filas.map((f) => {
      if (seen.has(f.ticker)) return false;
      seen.add(f.ticker);
      return true;
    });
  }, [filas]);

  if (filas.length === 0) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">
        Sin pares ticker/comitente con el filtro actual
      </p>
    );
  }

  return (
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)] sticky top-0 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 border-b border-[var(--t-border)]">Ticker</th>
          <th className="text-left px-2 py-1.5 border-b border-[var(--t-border)]">Comitente</th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">Enviar</th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">Recibir</th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">Neto</th>
          <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">Mov.</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => {
          const enviarVal  = unidad === "nominales" ? f.enviar_qty  : f.enviar_importe;
          const recibirVal = unidad === "nominales" ? f.recibir_qty : f.recibir_importe;
          const netoVal    = unidad === "nominales" ? f.neto_qty    : f.neto_importe;
          const netoColor =
            netoVal > 0
              ? "text-[#f87171]"
              : netoVal < 0
                ? "text-[#4ade80]"
                : "text-[var(--t-text-muted)]";
          const isFirst = firstOf[i];
          return (
            <tr
              key={`${f.ticker}-${f.cuenta}-${i}`}
              className={`border-b border-[#101010] hover:bg-[var(--t-surface)] ${
                isFirst ? "border-t border-[var(--t-border)]" : ""
              }`}
            >
              <td
                className={`px-2 py-1 font-semibold ${
                  isFirst ? "text-[var(--t-accent)]" : "text-[var(--t-accent)]/40"
                }`}
              >
                {f.ticker}
              </td>
              <td className="px-2 py-1 text-[var(--t-text)]">
                {f.cuenta}
                {f.id_cuenta && (
                  <span className="ml-1 text-[9px] text-[var(--t-text-muted)]">
                    [{f.id_cuenta}]
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-right text-[#f87171] font-semibold">
                {fmt(enviarVal)}
              </td>
              <td className="px-2 py-1 text-right text-[#4ade80] font-semibold">
                {fmt(recibirVal)}
              </td>
              <td className={`px-2 py-1 text-right ${netoColor} font-semibold`}>
                {fmt(Math.abs(netoVal))}
                {netoVal > 0 ? " ↑" : netoVal < 0 ? " ↓" : ""}
              </td>
              <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{f.n_ops}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
