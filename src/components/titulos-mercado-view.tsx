"use client";

import { Fragment, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
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

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      <Header
        fecha={data.fecha}
        diaAnterior={data.dia_anterior}
        totales={data.totales}
        mercadoCerrado={data.mercado_cerrado}
        ultimoDisplay={ultimoDisplay}
        plazosDesconocidos={data.plazos_desconocidos}
      />

      <div className="flex-1 min-h-0">
        <Panel title="TÍTULOS / MERCADO" expandable>
          {data.mercado_cerrado ? (
            <div className="py-8 text-center">
              <div className="text-[#888] text-sm font-semibold tracking-wide">
                MERCADO CERRADO
              </div>
              <div className="text-[10px] text-[#555] mt-1">
                Fin de semana o feriado argentino — no hay liquidación hoy.
              </div>
            </div>
          ) : data.tickers.length === 0 ? (
            <p className="text-[#555] text-xs py-6 text-center">
              Sin operaciones que liquiden hoy
            </p>
          ) : (
            <TablaTickers tickers={data.tickers} />
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
}: {
  fecha: string;
  diaAnterior: string | null;
  totales: Totales;
  mercadoCerrado: boolean;
  ultimoDisplay: string;
  plazosDesconocidos: string[];
}) {
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
              {fmtQty(totales.enviar_qty)}
            </span>
            <span className="text-[9px] text-[#666]">
              {fmtArs(totales.enviar_importe)}
            </span>
          </div>
          <div className="h-4 w-px bg-[#1a1a1a]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] tracking-widest">RECIBIR</span>
            <span className="text-[#4ade80] font-mono text-[12px] font-semibold">
              {fmtQty(totales.recibir_qty)}
            </span>
            <span className="text-[9px] text-[#666]">
              {fmtArs(totales.recibir_importe)}
            </span>
          </div>
          <div className="h-4 w-px bg-[#1a1a1a]" />
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#666] tracking-widest">OPS</span>
            <span className="text-[#d0d0d0] font-mono text-[11px]">
              {totales.n_ops}
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

function TablaTickers({ tickers }: { tickers: TickerRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(ticker: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

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
            $ Enviar
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Recibir
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            $ Recibir
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            Neto
          </th>
          <th className="text-right px-2 py-1.5 border-b border-[#1a1a1a]">
            # ops
          </th>
        </tr>
      </thead>
      <tbody>
        {tickers.map((t) => {
          const isOpen = expanded.has(t.ticker);
          const netoColor =
            t.neto_qty > 0
              ? "text-[#f87171]"
              : t.neto_qty < 0
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
                  {fmtQty(t.enviar_qty)}
                </td>
                <td className="px-2 py-1 text-right text-[#a0a0a0]">
                  {fmtArs(t.enviar_importe)}
                </td>
                <td className="px-2 py-1 text-right text-[#4ade80] font-semibold">
                  {fmtQty(t.recibir_qty)}
                </td>
                <td className="px-2 py-1 text-right text-[#a0a0a0]">
                  {fmtArs(t.recibir_importe)}
                </td>
                <td className={`px-2 py-1 text-right ${netoColor} font-semibold`}>
                  {fmtQty(Math.abs(t.neto_qty))}
                  {t.neto_qty > 0
                    ? " ↑"
                    : t.neto_qty < 0
                      ? " ↓"
                      : ""}
                </td>
                <td className="px-2 py-1 text-right text-[#808080]">
                  {t.n_ops}
                </td>
              </tr>
              {isOpen && (
                <tr className="bg-[#0a0a0a]">
                  <td />
                  <td colSpan={7} className="px-2 py-2">
                    <CuentasDetail cuentas={t.cuentas} />
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

function CuentasDetail({ cuentas }: { cuentas: CuentaRow[] }) {
  return (
    <table className="w-full text-[10px] font-mono tabular-nums">
      <thead className="text-[9px] text-[#666] uppercase tracking-wide">
        <tr>
          <th className="text-left px-1.5 py-0.5">Cuenta</th>
          <th className="text-left px-1.5 py-0.5">Op</th>
          <th className="text-left px-1.5 py-0.5">Plazo</th>
          <th className="text-center px-1.5 py-0.5">Fecha</th>
          <th className="text-right px-1.5 py-0.5">Cant.</th>
          <th className="text-right px-1.5 py-0.5">Precio</th>
          <th className="text-right px-1.5 py-0.5">Importe</th>
          <th className="text-left px-1.5 py-0.5">Comprobante</th>
        </tr>
      </thead>
      <tbody>
        {cuentas.map((c, i) => {
          const isVenta = (c.op || "").toLowerCase().startsWith("v");
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
                {fmtQty(c.cantidad)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                {fmtPrice(c.precio)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                {fmtArs(c.importe)}
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
