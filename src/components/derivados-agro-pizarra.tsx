"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Panel, fmtHoraAR } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;

type Commodity = "TRIGO" | "MAIZ" | "SOJA";

interface AgroRow {
  tipo: "pizarra" | "dispo" | "futuro";
  ticker?: string;
  vencimiento: string | null;
  posicion: string;
  us: number | null;
  pase: number | null;
  ars: number | null;
  tnav_us: number | null;
  bid?: number | null;
  offer?: number | null;
  vol_efectivo?: number | null;
  dias_a_vto?: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

interface AgroBloque {
  commodity: Commodity;
  rows: AgroRow[];
}

interface TasasCobertura {
  tasa_on: number | null;
  tasa_pagare: number | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

// Card "Pase con Cobertura" (sección Obligación Negociable) — calculada en backend.
interface PaseCard {
  posicion: string;
  ticker: string | null;
  vto: string | null;
  dias: number | null;
  pase_bruto: number | null;
  pase_lleno: number | null; // neto del costo pase (bruto − gastos MATBA+ALyC)
  tc: number | null;
  venta_dispo_ars: number | null;
  monto_pesos_cau_7d: number | null;
  tasa_on: number | null;
  interes: number | null;
  tc_on: number | null;
  compra_usd: number | null;
  valor_pase_agro_usd: number | null;
  gastos_pct: number | null;
  total_gastos: number | null;
  compra_futuro: number | null;
  ganancia_on_usd: number | null;
  // Pagaré
  bna_comprador_t1: number | null;
  tasa_pagare: number | null;
  interes_descontado: number | null;
  tc_pagare: number | null;
  compra_usd_pagare: number | null;
  ganancia_pagare_usd: number | null;
  // Sintético (tasa desde Mercados → Sintéticos, mismo mes que el pase)
  sintetico_ticker: string | null;
  tasa_sintetico: number | null;
  interes_sintetico: number | null;
  tc_sintetico: number | null;
  compra_usd_sintetico: number | null;
  ganancia_sintetico_usd: number | null;
}

interface PaseCoberturaCommodity {
  commodity: Commodity;
  venta_dispo_ars: number | null;
  cards: PaseCard[];
}

interface PaseCoberturaResp {
  hoy: string;
  tc_matba: number | null;
  tasa_on: number | null;
  commodities: PaseCoberturaCommodity[];
}

export interface AgroResp {
  oficial: {
    value: number | null;
    ts: string | null;
    source: string;
    age_s?: number | null;
    stale?: boolean;
  };
  ts: string;
  // Freshness — lo agrega el backend (puede faltar si la API es vieja).
  data_fresh?: boolean;
  last_snapshot_at?: string | null;
  snapshot_age_s?: number | null;
  bloques: AgroBloque[];
  // Tasas manuales ON / Pagaré (tab DATOS) — alimentan las columnas de abajo.
  tasas_cobertura?: TasasCobertura | null;
  // Cards + ganancia ON del Pase con Cobertura (calculado en backend).
  pase_cobertura?: PaseCoberturaResp | null;
  // Misma tabla con el disponible de la Cámara de Bahía Blanca.
  pase_cobertura_bahia?: PaseCoberturaResp | null;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fmtArs(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtFechaVtoFuturo(yyyymmdd: string | null): string {
  if (!yyyymmdd) return "—";
  const s = yyyymmdd.replace(/-/g, "");
  if (s.length !== 8) return yyyymmdd;
  const dd = s.slice(6, 8);
  const mm = s.slice(4, 6);
  const yyyy = s.slice(0, 4);
  return `${dd}/${mm}/${yyyy}`;
}

/** El motor agro corre L-V 13:00–20:05 UTC. Fuera de esa ventana, datos
 *  viejos = mercado cerrado (normal); dentro = algo se rompió. */
function mercadoAbiertoUTC(d: Date = new Date()): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 13 * 60 && mins <= 20 * 60 + 5;
}

function pasecolor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[var(--t-text-muted)]";
  return n >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}
function tnavColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[var(--t-text-muted)]";
  return n >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

// ─── Flash al cambiar de valor ───────────────────────────────────────────────
// Cuando un precio cambia entre dos polls, la celda pulsa verde (subió) o
// rojo (bajó) y se desvanece.

function useFlashBg(value: number | null | undefined): string {
  const prev = useRef<number | null | undefined>(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p !== null && p !== undefined && value !== null && value !== undefined &&
        value !== p) {
      setDir(value > p ? "up" : "down");
      prev.current = value;
      const t = setTimeout(() => setDir(null), 850);
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return dir === "up"
    ? "rgba(74,222,128,0.22)"
    : dir === "down"
      ? "rgba(248,113,113,0.22)"
      : "transparent";
}

function FlashCell({
  value,
  text,
  className,
}: {
  value: number | null | undefined;
  text: string;
  className: string;
}) {
  const bg = useFlashBg(value);
  return (
    <td
      className={className}
      style={{
        backgroundColor: bg,
        transition: "background-color 0.8s ease-out",
      }}
    >
      {text}
    </td>
  );
}

// ─── Indicador de frescura ───────────────────────────────────────────────────

type EstadoFeed = "live" | "cerrado" | "stale";

function FreshnessPill({ estado }: { estado: EstadoFeed }) {
  const cfg =
    estado === "live"
      ? { dot: "bg-[#4ade80] animate-pulse", txt: "text-[var(--t-pos)]", label: "LIVE" }
      : estado === "cerrado"
        ? { dot: "bg-[#666]", txt: "text-[var(--t-text-dim)]", label: "MERCADO CERRADO" }
        : { dot: "bg-[#f87171]", txt: "text-[var(--t-neg)]", label: "DESACTUALIZADO" };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] tracking-wide">
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      <span className={cfg.txt}>{cfg.label}</span>
    </span>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

type VistaPase = "agro" | "cobertura" | "tarjetas";

export function DerivadosAgroPizarra({
  initial,
  canEdit,
  setHeaderExtras,
}: {
  initial: AgroResp;
  canEdit: boolean;
  setHeaderExtras: (n: ReactNode) => void;
}) {
  const [vista, setVista] = useState<VistaPase>("agro");
  const { data, lastAt } = usePoll<AgroResp>(
    "/api/derivados-agro",
    initial,
    POLL_MS,
  );

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";
  const oficial = data.oficial?.value ?? null;
  const oficialSource = data.oficial?.source ?? "none";
  const oficialStale = data.oficial?.stale === true;
  // undefined (backend viejo sin freshness) → asumimos fresh para no asustar.
  const fresh = data.data_fresh !== false;
  const estado: EstadoFeed = fresh
    ? "live"
    : mercadoAbiertoUTC()
      ? "stale"
      : "cerrado";
  const dim = !fresh ? "opacity-50" : "";

  // Inyecto extras (frescura + dólar oficial + últ. act) en la fila del shell.
  useEffect(() => {
    setHeaderExtras(
      <>
        <FreshnessPill estado={estado} />
        <span className="text-[10px] text-[var(--t-text-dim)] tracking-wide ml-2">
          DÓLAR OF
        </span>
        <span
          className={`font-mono text-[11px] ${
            oficialStale ? "text-[var(--t-neg)]" : "text-[var(--t-accent)]"
          }`}
        >
          {oficial ? fmtArs(oficial) : "—"}
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)]">({oficialSource})</span>
        <span className="text-[10px] text-[var(--t-text-muted)] ml-3">
          ÚLT {ultimoDisplay}
        </span>
      </>,
    );
    return () => setHeaderExtras(null);
  }, [
    estado,
    oficial,
    oficialSource,
    oficialStale,
    ultimoDisplay,
    setHeaderExtras,
  ]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel
          title="PASES — TRIGO · MAÍZ · SOJA"
          expandable
          actions={
            <div className="flex gap-0.5">
              <VistaBtn
                active={vista === "agro"}
                onClick={() => setVista("agro")}
              >
                Pase Agro
              </VistaBtn>
              <VistaBtn
                active={vista === "cobertura"}
                onClick={() => setVista("cobertura")}
              >
                Pase con Cobertura
              </VistaBtn>
              <VistaBtn
                active={vista === "tarjetas"}
                onClick={() => setVista("tarjetas")}
              >
                Tarjetas
              </VistaBtn>
            </div>
          }
        >
          {vista === "agro" ? (
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-1.5 py-1 border-b border-[var(--t-border)]">
                    Vto
                  </th>
                  <th className="text-left px-1.5 py-1 border-b border-[var(--t-border)]">
                    Posición
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
                    US$
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
                    Pase Lleno
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
                    Valor $
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
                    TNAV
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.bloques.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                      Sin data
                    </td>
                  </tr>
                ) : (
                  data.bloques.map((b, bi) => (
                    <BloqueRows
                      key={b.commodity}
                      bloque={b}
                      canEdit={canEdit}
                      dim={dim}
                      first={bi === 0}
                    />
                  ))
                )}
              </tbody>
            </table>
          ) : vista === "cobertura" ? (
            <div className="flex flex-col gap-3">
              <div>
                <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--t-accent)]">
                  Cámara Rosario
                </div>
                <PaseConCoberturaTable
                  bloques={data.bloques}
                  dim={dim}
                  tasas={data.tasas_cobertura ?? null}
                  pase={data.pase_cobertura ?? null}
                />
              </div>
              <div>
                <div className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--t-accent)] border-t border-[var(--t-border)] pt-2">
                  Cámara Bahía Blanca
                </div>
                <PaseConCoberturaTable
                  bloques={data.bloques}
                  dim={dim}
                  tasas={data.tasas_cobertura ?? null}
                  pase={data.pase_cobertura_bahia ?? null}
                />
              </div>
            </div>
          ) : (
            <PaseCoberturaTarjetas
              rosario={data.pase_cobertura ?? null}
              bahia={data.pase_cobertura_bahia ?? null}
              dim={dim}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function VistaBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Tabla "Pase con Cobertura" ─────────────────────────────────────────────
// Replica la planilla: una fila por (commodity, vencimiento) — solo futuros.
// Posición = "TRIGO JULIO 26". Pase Lleno = (pizarra USD − futuro USD) NETO
// del costo pase (gastos MATBA+ALyC 0,45%, lo calcula el backend; ver panel
// COSTO PASE en DATOS). Columna Sintético: misma fórmula que ON pero la tasa
// sale de la TNA del sintético del mismo mes (Mercados › Sintéticos), no manual.

const MESES_ES: Record<string, string> = {
  "01": "ENERO",
  "02": "FEBRERO",
  "03": "MARZO",
  "04": "ABRIL",
  "05": "MAYO",
  "06": "JUNIO",
  "07": "JULIO",
  "08": "AGOSTO",
  "09": "SEPTIEMBRE",
  "10": "OCTUBRE",
  "11": "NOVIEMBRE",
  "12": "DICIEMBRE",
};

function posicionFromVto(commodity: Commodity, vto: string | null): string {
  if (!vto || vto.length !== 8) return commodity;
  const mes = MESES_ES[vto.slice(4, 6)] ?? "?";
  const yr = vto.slice(2, 4);
  return `${commodity} ${mes} ${yr}`;
}

function fmtTasa(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function PaseConCoberturaTable({
  bloques,
  dim,
  tasas,
  pase,
}: {
  bloques: AgroBloque[];
  dim: string;
  tasas: TasasCobertura | null;
  pase: PaseCoberturaResp | null;
}) {
  // Card completa por posición (key = ticker; fallback commodity+vto) desde el
  // cálculo del backend: llena las columnas ON/Pagaré y alimenta el explicador.
  const cardByKey = new Map<string, PaseCard>();
  for (const c of pase?.commodities ?? []) {
    for (const card of c.cards) {
      cardByKey.set(card.ticker ?? `${c.commodity}-${card.vto}`, card);
    }
  }

  // Fila seleccionada → modal con el paso a paso del cálculo.
  const [detalle, setDetalle] = useState<
    { card: PaseCard; commodity: Commodity; hoy: string } | null
  >(null);

  const filas: { commodity: Commodity; vto: string | null; pase: number | null; ticker?: string }[] = [];
  for (const b of bloques) {
    for (const r of b.rows) {
      if (r.tipo !== "futuro") continue;
      if (r.us == null) continue; // sin precio, no se calcula
      filas.push({
        commodity: b.commodity,
        vto: r.vencimiento,
        pase: r.pase,
        ticker: r.ticker,
      });
    }
  }

  if (filas.length === 0) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-3 text-center">
        Sin futuros con precio
      </p>
    );
  }

  return (
    <>
    <div className="flex items-center gap-1.5 px-1.5 pb-1.5 text-[9px] text-[var(--t-text-muted)]">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[var(--t-border-2)] text-[8px] leading-none">
        ?
      </span>
      Hacé clic en una fila para ver el cálculo paso a paso.
    </div>
    <table className="w-full text-[11px] font-mono tabular-nums">
      <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)] sticky top-0 z-10">
        <tr>
          <th
            rowSpan={2}
            className="text-left px-1.5 py-1 border-b border-[var(--t-border)] align-bottom"
          >
            Posición
          </th>
          <th
            rowSpan={2}
            className="text-right px-1.5 py-1 border-b border-[var(--t-border)] align-bottom"
            title="(Pizarra US$ − Futuro US$) − Costo Pase (gastos MATBA + ALyC 0,45%, ver DATOS)"
          >
            Pase Lleno
            <span className="block text-[8px] font-normal text-[var(--t-text-muted)]">
              neto de costo pase
            </span>
          </th>
          <th
            colSpan={3}
            className="text-center px-1.5 py-1 border-b border-[var(--t-border)] text-[9px] text-[var(--t-text-muted)]"
          >
            Resultado en US$ × Tn
          </th>
        </tr>
        <tr>
          <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
            Pagaré
            <span className="ml-1 text-[9px] font-normal text-[var(--t-text-muted)]">
              {fmtTasa(tasas?.tasa_pagare)}
            </span>
          </th>
          <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
            ON
            <span className="ml-1 text-[9px] font-normal text-[var(--t-text-muted)]">
              {fmtTasa(tasas?.tasa_on)}
            </span>
          </th>
          <th className="text-right px-1.5 py-1 border-b border-[var(--t-border)]">
            Sintético
            <span className="block text-[8px] font-normal text-[var(--t-text-muted)]">
              tasa por mes
            </span>
          </th>
        </tr>
      </thead>
      <tbody className={dim}>
        {filas.map((f, i) => {
          const key = f.ticker ?? `${f.commodity}-${f.vto}`;
          const card = cardByKey.get(key) ?? null;
          const gOn = card?.ganancia_on_usd ?? null;
          const gPag = card?.ganancia_pagare_usd ?? null;
          const gSint = card?.ganancia_sintetico_usd ?? null;
          // Pase Lleno neto (backend le resta el costo pase). Sin card todavía
          // (payload viejo en caché), cae al pase bruto del bloque.
          const paseLleno = card?.pase_lleno ?? f.pase;
          // Primer pase de cada commodity (TRIGO/MAÍZ/SOJA): corte visual leve
          // — borde superior + fondo apenas más oscuro. Es un screen que se
          // pasa a clientes, así que la división es sutil (no a lo ancho).
          const grupoInicio = i === 0 || filas[i - 1].commodity !== f.commodity;
          return (
            <Fragment key={`${f.commodity}-${f.ticker ?? f.vto}`}>
              {grupoInicio && i > 0 && (
                <tr aria-hidden>
                  <td colSpan={5} className="h-2" />
                </tr>
              )}
            <tr
              onClick={() =>
                card &&
                setDetalle({
                  card,
                  commodity: f.commodity,
                  hoy: pase?.hoy ?? "",
                })
              }
              className={`border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] ${
                grupoInicio ? "border-t border-[#3a2c0a] bg-[var(--t-tint-amber)]" : ""
              } ${card ? "cursor-pointer" : ""}`}
            >
              <td className="px-1.5 py-0.5 text-[var(--t-text)] font-semibold">
                {posicionFromVto(f.commodity, f.vto)}
              </td>
              <td
                className={`px-1.5 py-0.5 text-right ${pasecolor(paseLleno)}`}
                title="(Pizarra − Futuro) − Costo Pase"
              >
                {fmtPx(paseLleno)}
              </td>
              <td
                className={`px-1.5 py-0.5 text-right font-semibold ${pasecolor(gPag)}`}
                title="Ganancia Pase (Pagaré) en US$/Tn"
              >
                {gPag === null ? "—" : fmtPx(gPag)}
              </td>
              <td
                className={`px-1.5 py-0.5 text-right font-semibold ${pasecolor(gOn)}`}
                title="Ganancia Pase (Obligación Negociable) en US$/Tn"
              >
                {gOn === null ? "—" : fmtPx(gOn)}
              </td>
              <td
                className={`px-1.5 py-0.5 text-right font-semibold ${pasecolor(gSint)}`}
                title={
                  card?.sintetico_ticker
                    ? `Ganancia Pase (Sintético ${card.sintetico_ticker}, tasa ${fmtTasa(card.tasa_sintetico)}) en US$/Tn`
                    : "Sin sintético en ese mes"
                }
              >
                {gSint === null ? "—" : fmtPx(gSint)}
              </td>
            </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
    {detalle && (
      <PaseCalcModal
        card={detalle.card}
        commodity={detalle.commodity}
        hoy={detalle.hoy}
        onClose={() => setDetalle(null)}
      />
    )}
    </>
  );
}

// ─── Explicador del cálculo de un pase (modal) ──────────────────────────────
// Se abre al clickear una fila. Muestra, prolijo, el paso a paso de cómo se
// llega a la Ganancia ON y Pagaré: cada fórmula con los números reales puestos.

function PaseCalcModal({
  card,
  commodity,
  hoy,
  onClose,
}: {
  card: PaseCard;
  commodity: Commodity;
  hoy: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const noun = commodity.charAt(0) + commodity.slice(1).toLowerCase();
  const hoyFmt = fmtFechaISO(hoy);
  const fpFmt = fmtFechaVtoFuturo(card.vto);
  const tasaOn = fmtTasa(card.tasa_on);
  const tasaPag = fmtTasa(card.tasa_pagare);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-lg max-h-[90vh] overflow-y-auto text-[11px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 sticky top-0">
          <span className="text-[12px] font-semibold text-[var(--t-accent)] tracking-wide">
            Cálculo — Pase {noun} {fpFmt}
          </span>
          <button
            onClick={onClose}
            className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[13px] px-1"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3 font-mono tabular-nums">
          <CalcBlock title="Datos base">
            <CalcLine label="Hoy (se valúa siempre a hoy)" value={hoyFmt} />
            <CalcLine label="Fecha Pase (vto del futuro)" value={fpFmt} />
            <CalcLine label="Días (Fecha Pase − Hoy)" value={card.dias ?? "—"} />
            <CalcLine label="Tipo de Cambio (Matba Rofex)" value={fmtPx(card.tc)} />
            <CalcLine label="BNA Comprador T−1 (ayer)" value={fmtPx(card.bna_comprador_t1)} />
            <CalcLine label={`Venta ${noun} Dispo (ARS)`} value={fmtArs(card.venta_dispo_ars)} />
            <CalcLine label="Valor US$ Pase Agro (futuro)" value={fmtPx(card.valor_pase_agro_usd)} />
          </CalcBlock>

          <CalcBlock title="Costo Pase (gastos MATBA + ALyC — común a todo)">
            <CalcLine
              label="(0,175% der. mercado + 0,05% apertura) × 2 patas"
              value={fmtTasa((card.gastos_pct ?? 0) * 100)}
            />
            <CalcLine
              label={`Costo Pase = Valor US$ × ${fmtTasa((card.gastos_pct ?? 0) * 100)}`}
              value={fmtPx(card.total_gastos)}
              strong
            />
          </CalcBlock>

          <CalcBlock title="Pase Lleno">
            <CalcLine
              label="Pase bruto = Pizarra US$ − Futuro US$"
              value={fmtPx(card.pase_bruto)}
            />
            <CalcLine
              label="Pase Lleno = Pase bruto − Costo Pase"
              value={fmtPx(card.pase_lleno)}
              strong
              color={pasecolor(card.pase_lleno)}
            />
          </CalcBlock>

          <CalcBlock title="Compra del futuro (común a ON y Pagaré)">
            <CalcLine
              label="Compra Futuro = Valor US$ + Costo Pase"
              value={fmtPx(card.compra_futuro)}
              strong
            />
          </CalcBlock>

          <CalcBlock title="Obligación Negociable (ON)">
            <CalcLine
              label={`Interés = TC − TC / (1 + ${tasaOn}/365 × ${card.dias ?? "—"} días)`}
              value={fmtPx(card.interes)}
            />
            <CalcLine label="Tipo de Cambio ON = TC − Interés" value={fmtPx(card.tc_on)} />
            <CalcLine label="Compra USD = Venta Dispo / TC ON" value={fmtPx(card.compra_usd)} />
            <CalcLine
              label="Ganancia ON = Compra USD − Compra Futuro"
              value={fmtPx(card.ganancia_on_usd)}
              strong
              color={pasecolor(card.ganancia_on_usd)}
            />
          </CalcBlock>

          <CalcBlock title="Pagaré">
            <CalcLine
              label={`Interés desc. = BNA T−1 − BNA T−1 / (1 + ${tasaPag}/365 × ${card.dias ?? "—"} días)`}
              value={fmtPx(card.interes_descontado)}
            />
            <CalcLine label="TC Pagaré = BNA T−1 − Interés desc." value={fmtPx(card.tc_pagare)} />
            <CalcLine label="Compra USD = Venta Dispo / TC Pagaré" value={fmtPx(card.compra_usd_pagare)} />
            <CalcLine
              label="Ganancia Pagaré = Compra USD − Compra Futuro"
              value={fmtPx(card.ganancia_pagare_usd)}
              strong
              color={pasecolor(card.ganancia_pagare_usd)}
            />
          </CalcBlock>

          <CalcBlock
            title={
              card.sintetico_ticker
                ? `Sintético (${card.sintetico_ticker} — Mercados › Sintéticos)`
                : "Sintético"
            }
          >
            {card.sintetico_ticker ? (
              <>
                <CalcLine
                  label="Tasa = TNA del sintético del mismo mes (Long Rofex + Long Lecap)"
                  value={fmtTasa(card.tasa_sintetico)}
                />
                <CalcLine
                  label={`Interés = TC − TC / (1 + ${fmtTasa(card.tasa_sintetico)}/365 × ${card.dias ?? "—"} días)`}
                  value={fmtPx(card.interes_sintetico)}
                />
                <CalcLine label="TC Sintético = TC − Interés" value={fmtPx(card.tc_sintetico)} />
                <CalcLine
                  label="Compra USD = Venta Dispo / TC Sintético"
                  value={fmtPx(card.compra_usd_sintetico)}
                />
                <CalcLine
                  label="Ganancia Sintético = Compra USD − Compra Futuro"
                  value={fmtPx(card.ganancia_sintetico_usd)}
                  strong
                  color={pasecolor(card.ganancia_sintetico_usd)}
                />
              </>
            ) : (
              <CalcLine
                label="Sin sintético en el mes del pase — no se calcula"
                value="—"
              />
            )}
          </CalcBlock>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CalcBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--t-accent)] font-semibold mb-1 pb-1 border-b border-[var(--t-border)]">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function CalcLine({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--t-text-dim)] leading-snug">{label}</span>
      <span
        className={`text-right whitespace-nowrap ${strong ? "font-bold" : ""} ${
          color ?? "text-[var(--t-text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Cards "Pase con Cobertura" — Obligación Negociable ─────────────────────
// Una card por commodity × pase (replica la planilla). Muestra la cadena de
// cálculo de la ON. Los números los calcula el backend (agro_cobertura) — acá
// solo se formatean. Pagaré / Sintético se agregan en próximas iteraciones.

function fmtFechaISO(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

// Tarjetas del Pase con Cobertura con tab de plaza (Rosario / Bahía Blanca):
// se elige la cámara y se muestran solo esas tarjetas, no todas juntas.
function PaseCoberturaTarjetas({
  rosario,
  bahia,
  dim,
}: {
  rosario: PaseCoberturaResp | null;
  bahia: PaseCoberturaResp | null;
  dim: string;
}) {
  const [plaza, setPlaza] = useState<"rosario" | "bahia">("rosario");
  const pase = plaza === "bahia" ? bahia : rosario;
  return (
    <div className={`flex flex-col gap-2 ${dim}`}>
      <div className="flex gap-0.5">
        <VistaBtn active={plaza === "rosario"} onClick={() => setPlaza("rosario")}>
          Rosario
        </VistaBtn>
        <VistaBtn active={plaza === "bahia"} onClick={() => setPlaza("bahia")}>
          Bahía Blanca
        </VistaBtn>
      </div>
      <PaseCoberturaCards pase={pase} dim="" />
    </div>
  );
}

function PaseCoberturaCards({
  pase,
  dim,
}: {
  pase: PaseCoberturaResp | null;
  dim: string;
}) {
  // Solo los commodities que tienen tarjetas; se elige uno y se muestran las
  // suyas (no todas desparramadas).
  const conCards = (pase?.commodities ?? []).filter((c) => c.cards.length > 0);
  const [sel, setSel] = useState<Commodity | null>(null);

  if (!pase || conCards.length === 0) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-2 text-center">
        Cargá en Datos el Dólar Matba Rofex, el precio dispo (Cámara) y la Tasa
        ON para ver las tarjetas del pase.
      </p>
    );
  }

  const activo = conCards.find((c) => c.commodity === sel) ?? conCards[0];
  const hoyFmt = fmtFechaISO(pase.hoy);

  return (
    <div className={`flex flex-col gap-3 ${dim}`}>
      <div className="flex gap-0.5">
        {conCards.map((c) => (
          <VistaBtn
            key={c.commodity}
            active={activo.commodity === c.commodity}
            onClick={() => setSel(c.commodity)}
          >
            {c.commodity}
          </VistaBtn>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
        {activo.cards.map((card) => (
          <ObligacionNegociableCard
            key={card.ticker ?? card.vto}
            card={card}
            commodity={activo.commodity}
            hoy={hoyFmt}
          />
        ))}
      </div>
    </div>
  );
}

function CardRow({
  label,
  value,
  strong,
  accentBg,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accentBg?: boolean;
  color?: string;
}) {
  return (
    <div
      className={`flex justify-between gap-2 px-2 py-0.5 ${
        accentBg ? "bg-[var(--t-surface)]" : ""
      }`}
    >
      <span className="text-[var(--t-text-dim)]">{label}</span>
      <span
        className={`text-right ${strong ? "font-bold" : ""} ${
          color ?? "text-[var(--t-text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ObligacionNegociableCard({
  card,
  commodity,
  hoy,
}: {
  card: PaseCard;
  commodity: Commodity;
  hoy: string;
}) {
  const noun = commodity.charAt(0) + commodity.slice(1).toLowerCase();
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] text-[10px] font-mono tabular-nums">
      <div className="bg-[#1e2a4a] text-[#e8edf7] px-2 py-1 font-semibold tracking-wide text-[11px]">
        Pase {card.posicion.replace(commodity, noun)}
      </div>
      <div className="bg-[#2a3a63] text-[#cdd7ec] px-2 py-0.5 flex justify-between">
        <span>Hoy</span>
        <span>{hoy}</span>
      </div>
      <CardRow label="Tipo de Cambio" value={fmtPx(card.tc)} />
      <CardRow label="Tn" value="1" />
      <CardRow label={`Venta ${noun} Dispo`} value={fmtArs(card.venta_dispo_ars)} strong />
      <CardRow label="Monto Pesos Cau 7D" value={fmtArs(card.monto_pesos_cau_7d)} />
      <CardRow label="Fecha Pase" value={fmtFechaVtoFuturo(card.vto)} />
      <CardRow label="Tasa ON" value={fmtTasa(card.tasa_on)} accentBg />
      <CardRow label="Interés" value={fmtPx(card.interes)} />
      <CardRow label="Tipo de Cambio ON" value={fmtPx(card.tc_on)} />
      <CardRow label="Compra USD / Tn" value={fmtPx(card.compra_usd)} />
      <CardRow label={`Compra Futuro ${noun}`} value={fmtPx(card.compra_futuro)} />
      <CardRow
        label="Ganancia Pase U$S / Tn"
        value={fmtPx(card.ganancia_on_usd)}
        strong
        color={pasecolor(card.ganancia_on_usd)}
      />
      <div className="border-t border-[var(--t-border)] mt-1">
        <CardRow label="Gastos MATBA + ALyC" value={fmtPct(card.gastos_pct)} />
        <CardRow label="Total" value={fmtPx(card.total_gastos)} />
        <div className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)]">
          (0,175% + 0,05% der. Mercado / apertura) × 2
        </div>
      </div>
      <div className="h-3 border-t-2 border-[var(--t-border-2)] mt-3" />
      <div className="bg-[#1e2a4a] text-[#e8edf7] px-2 py-1 font-semibold tracking-wide">
        Pagaré
      </div>
      <CardRow label="Interés descontado" value={fmtPx(card.interes_descontado)} />
      <CardRow label="Tipo de Cambio Pagaré" value={fmtPx(card.tc_pagare)} accentBg />
      <CardRow label="Compra de USD x Tn" value={fmtPx(card.compra_usd_pagare)} />
      <CardRow label={`Compra de Futuro ${noun}`} value={fmtPx(card.compra_futuro)} />
      <CardRow
        label="Ganancia Pase / Tn"
        value={fmtPx(card.ganancia_pagare_usd)}
        strong
        color={pasecolor(card.ganancia_pagare_usd)}
      />
    </div>
  );
}

function BloqueRows({
  bloque,
  canEdit,
  dim,
  first,
}: {
  bloque: AgroBloque;
  canEdit: boolean;
  dim: string;
  first: boolean;
}) {
  return (
    <>
      {!first && (
        <tr>
          <td colSpan={6} className="h-1.5" />
        </tr>
      )}
      {bloque.rows.map((r, i) => {
        if (r.tipo === "pizarra") {
          return (
            <PizarraRow
              key={`${bloque.commodity}-pizarra`}
              commodity={bloque.commodity}
              row={r}
              canEdit={canEdit}
            />
          );
        }
        if (r.tipo === "dispo") {
          return (
            <tr
              key={`${bloque.commodity}-dispo`}
              className="border-b border-[var(--t-border)]"
            >
              <td className="px-1.5 py-0.5 text-[var(--t-text-muted)]">
                {r.vencimiento ? fmtFechaVtoFuturo(r.vencimiento) : "—"}
              </td>
              <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">{r.posicion}</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]">#N/A</td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]">#N/A</td>
            </tr>
          );
        }
        return (
          <tr
            key={`${bloque.commodity}-${r.ticker ?? i}`}
            className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]"
          >
            <td className={`px-1.5 py-0.5 text-[var(--t-text-dim)] ${dim}`}>
              {fmtFechaVtoFuturo(r.vencimiento)}
            </td>
            <td className={`px-1.5 py-0.5 text-[var(--t-text)] ${dim}`}>
              {r.posicion}
            </td>
            <FlashCell
              value={r.us}
              text={fmtPx(r.us)}
              className={`px-1.5 py-0.5 text-right text-[var(--t-text)] ${dim}`}
            />
            <FlashCell
              value={r.pase}
              text={fmtPx(r.pase)}
              className={`px-1.5 py-0.5 text-right ${pasecolor(r.pase)} ${dim}`}
            />
            <FlashCell
              value={r.ars}
              text={fmtArs(r.ars)}
              className={`px-1.5 py-0.5 text-right text-[var(--t-text-dim)] ${dim}`}
            />
            <FlashCell
              value={r.tnav_us}
              text={fmtPct(r.tnav_us)}
              className={`px-1.5 py-0.5 text-right ${tnavColor(r.tnav_us)} ${dim}`}
            />
          </tr>
        );
      })}
    </>
  );
}

function PizarraRow({
  row,
}: {
  commodity: Commodity;
  row: AgroRow;
  canEdit: boolean;
}) {
  // El vencimiento es HOY automático (lo devuelve el backend, no se edita).
  // El US$ vive en Datos (Cámara Cereales).
  const arsBg = useFlashBg(row.ars);

  return (
    <tr className="border-y border-[#3a2c0a] bg-[var(--t-tint-amber)] font-semibold">
      <td className="px-1.5 py-1 text-[#e0c890]">
        {fmtFechaVtoFuturo(row.vencimiento)}
      </td>
      <td className="px-1.5 py-1 text-[var(--t-accent)] font-semibold tracking-wide">
        {row.posicion}
      </td>
      <td
        className="px-1.5 py-1 text-right text-[#e0c890] font-semibold"
        title="Editable en la tab Datos (Cámara Arbitral)"
      >
        {fmtPx(row.us)}
      </td>
      <td className="px-1.5 py-1 text-right text-[var(--t-text-muted)]">—</td>
      <td
        className="px-1.5 py-1 text-right text-[#e0c890] font-semibold"
        style={{
          backgroundColor: arsBg,
          transition: "background-color 0.8s ease-out",
        }}
      >
        {fmtArs(row.ars)}
      </td>
      <td className="px-1.5 py-1 text-right text-[var(--t-text-muted)]">—</td>
    </tr>
  );
}
