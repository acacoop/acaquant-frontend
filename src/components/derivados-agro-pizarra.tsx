"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  pase_lleno: number | null;
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

type VistaPase = "agro" | "cobertura";

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
          ) : (
            <div className="flex flex-col gap-4">
              <PaseConCoberturaTable
                bloques={data.bloques}
                dim={dim}
                tasas={data.tasas_cobertura ?? null}
                pase={data.pase_cobertura ?? null}
              />
              <PaseCoberturaCards pase={data.pase_cobertura ?? null} dim={dim} />
            </div>
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
// Posición = "TRIGO JULIO 26". Pase Lleno = el `pase` actual (pizarra USD −
// futuro USD). Pagaré / ON / Sintético quedan en "—" hasta que se definan
// las fórmulas (a confirmar con la mesa).

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
  // Ganancia ON por posición (key = ticker; fallback commodity+vto) desde el
  // cálculo del backend, para llenar la columna ON de esta tabla resumen.
  const gananciaOn = new Map<string, number | null>();
  for (const c of pase?.commodities ?? []) {
    for (const card of c.cards) {
      const key = card.ticker ?? `${c.commodity}-${card.vto}`;
      gananciaOn.set(key, card.ganancia_on_usd);
    }
  }

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
          >
            Pase Lleno
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
          </th>
        </tr>
      </thead>
      <tbody className={dim}>
        {filas.map((f) => {
          const gOn = gananciaOn.get(f.ticker ?? `${f.commodity}-${f.vto}`) ?? null;
          return (
            <tr
              key={`${f.commodity}-${f.ticker ?? f.vto}`}
              className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]"
            >
              <td className="px-1.5 py-0.5 text-[var(--t-text)] font-semibold">
                {posicionFromVto(f.commodity, f.vto)}
              </td>
              <td className={`px-1.5 py-0.5 text-right ${pasecolor(f.pase)}`}>
                {fmtPx(f.pase)}
              </td>
              <td
                className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]"
                title="Pendiente — próxima iteración"
              >
                —
              </td>
              <td
                className={`px-1.5 py-0.5 text-right font-semibold ${pasecolor(gOn)}`}
                title="Ganancia Pase (Obligación Negociable) en US$/Tn"
              >
                {gOn === null ? "—" : fmtPx(gOn)}
              </td>
              <td
                className="px-1.5 py-0.5 text-right text-[var(--t-text-muted)]"
                title="Pendiente — próxima iteración"
              >
                —
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

function PaseCoberturaCards({
  pase,
  dim,
}: {
  pase: PaseCoberturaResp | null;
  dim: string;
}) {
  const hasCards = (pase?.commodities ?? []).some((c) => c.cards.length > 0);
  if (!pase || !hasCards) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-2 text-center">
        Cargá en Datos el Dólar Matba Rofex, el precio dispo (Cámara) y la Tasa
        ON para ver las cards del pase.
      </p>
    );
  }

  const hoyFmt = fmtFechaISO(pase.hoy);

  return (
    <div className={`flex flex-col gap-4 ${dim}`}>
      {pase.commodities.map((c) =>
        c.cards.length === 0 ? null : (
          <div key={c.commodity}>
            <div className="text-[10px] uppercase tracking-wide text-[var(--t-accent)] font-semibold mb-1.5">
              {c.commodity} — Obligación Negociable
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {c.cards.map((card) => (
                <ObligacionNegociableCard
                  key={card.ticker ?? card.vto}
                  card={card}
                  commodity={c.commodity}
                  hoy={hoyFmt}
                />
              ))}
            </div>
          </div>
        ),
      )}
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
    <tr className="border-y border-[#3a2c0a] bg-[var(--t-tint-amber)]">
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
