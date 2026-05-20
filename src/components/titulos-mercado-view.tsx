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

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";

  // Filtra los tickers según el filtro (enviar/recibir/ambos). El sort
  // ya viene del backend: 'enviar_qty desc' → lo más crítico arriba.
  const tickersFiltrados = useMemo(() => {
    if (filtro === "enviar")  return data.tickers.filter((t) => t.enviar_qty  > 0);
    if (filtro === "recibir") return data.tickers.filter((t) => t.recibir_qty > 0);
    return data.tickers;
  }, [data.tickers, filtro]);

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
              <div className="text-[#888] text-sm font-semibold tracking-wide">
                MERCADO CERRADO
              </div>
              <div className="text-[10px] text-[#555] mt-1">
                Fin de semana o feriado argentino — no hay liquidación hoy.
              </div>
            </div>
          ) : tickersFiltrados.length === 0 ? (
            <p className="text-[#555] text-xs py-6 text-center">
              {data.tickers.length === 0
                ? "Sin operaciones que liquiden hoy"
                : "Sin tickers que matcheen el filtro"}
            </p>
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
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 flex items-center gap-3 flex-wrap shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[#666] tracking-widest">LIQUIDA</span>
        <span className="text-[#ff9900] font-mono text-[12px] font-semibold">
          {fmtFecha(fecha) || "—"}
        </span>
        {!mercadoCerrado && diaAnterior && (
          <span className="text-[9px] text-[#666]">
            (CI/Inm de hoy + 24hs de {fmtFecha(diaAnterior)})
          </span>
        )}
      </div>
      {!mercadoCerrado && (
        <>
          <div className="h-4 w-px bg-[#1a1a1a]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] tracking-widest">ENVIAR</span>
            <span className="text-[#f87171] font-mono text-[12px] font-semibold">
              {fmt(enviarVal)}
            </span>
          </div>
          <div className="h-4 w-px bg-[#1a1a1a]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] tracking-widest">RECIBIR</span>
            <span className="text-[#4ade80] font-mono text-[12px] font-semibold">
              {fmt(recibirVal)}
            </span>
          </div>
        </>
      )}
      <div className="ml-auto flex items-center gap-3">
        {plazosDesconocidos.length > 0 && (
          <span
            className="text-[9px] text-[#ff9900]"
            title={`Plazos no clasificados: ${plazosDesconocidos.join(", ")}`}
          >
            ⚠ {plazosDesconocidos.length} plazo(s) sin clasificar
          </span>
        )}
        <span className="text-[9px] text-[#555]">ÚLT {ultimoDisplay}</span>
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
              ? "bg-[#ff9900] text-black border-[#ff9900]"
              : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
          }`}
        >
          {f.toUpperCase()}
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
              : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#3b82f6] hover:border-[#3b82f6]"
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

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  const fmt = unidad === "nominales" ? fmtQty : (n: number) => fmtArs(n);

  return (
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
        <tr>
          <th className="text-left px-2 py-1.5 border-b border-[#1a1a1a] w-6" />
          <th className="text-left px-2 py-1.5 border-b border-[#1a1a1a]">
            Ticker
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Enviar
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Recibir
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Neto
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Movimientos
          </th>
        </tr>
      </thead>
      <tbody>
        {tickers.map((t) => {
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
                : "text-[#666]";
          return (
            <Fragment key={t.ticker}>
              <tr
                onClick={() => toggle(t.ticker)}
                className="border-b border-[#101010] hover:bg-[#0d0d0d] cursor-pointer"
              >
                <td className="px-2 py-1 text-[#666] text-[10px]">
                  {isOpen ? "▼" : "▶"}
                </td>
                <td className="px-2 py-1 text-[#ff9900] font-semibold">
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
                <td className="px-2 py-1 text-right text-[#808080]">
                  {t.n_ops}
                </td>
              </tr>
              {isOpen && (
                <tr className="bg-[#0a0a0a]">
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
      <thead className="text-[9px] text-[#666] uppercase tracking-wide">
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
              <td className="px-1.5 py-0.5 text-[#d0d0d0]">{c.cuenta}</td>
              <td
                className={`px-1.5 py-0.5 font-semibold ${
                  isVenta ? "text-[#f87171]" : "text-[#4ade80]"
                }`}
              >
                {c.op}
              </td>
              <td className="px-1.5 py-0.5 text-[#808080]">{c.plazo ?? "—"}</td>
              <td className="px-1.5 py-0.5 text-center text-[#808080]">
                {fmtFecha(c.fecha)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                {fmtVal(valor)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                {fmtPrice(c.precio)}
              </td>
              <td className="px-1.5 py-0.5 text-[#666] text-[9px]">
                {c.comprobante ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
