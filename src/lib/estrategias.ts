// Port de dashboard/views/opciones.py — STRATEGY_TEMPLATES + _calcular_estrategias
// + Black-Scholes para "Teórico" en la tabla de escenarios.

export type Side = "buy" | "sell";
export type Tipo = "CALL" | "PUT";

export interface Leg {
  offset: number;
  tipo: Tipo;
  side: Side;
  qty: number;
}

export interface Template {
  categoria: string;
  nombre: string;
  legs: Leg[];
}

export const CATEGORIAS = [
  "Spread Alcista",
  "Spread Bajista",
  "Cono / Cuna",
  "Ratio",
  "Backspread",
  "Cóndor de Hierro",
  "Venta de Vol",
] as const;

export const STRATEGY_TEMPLATES: Template[] = (() => {
  const t: Template[] = [];
  for (let n = 1; n <= 6; n++) {
    t.push({
      categoria: "Spread Alcista",
      nombre: `Spread Alcista (Calls) +${n}`,
      legs: [
        { offset: 0, tipo: "CALL", side: "buy", qty: 1 },
        { offset: +n, tipo: "CALL", side: "sell", qty: 1 },
      ],
    });
  }
  for (let n = 1; n <= 6; n++) {
    t.push({
      categoria: "Spread Bajista",
      nombre: `Spread Bajista (Puts) -${n}`,
      legs: [
        { offset: 0, tipo: "PUT", side: "buy", qty: 1 },
        { offset: -n, tipo: "PUT", side: "sell", qty: 1 },
      ],
    });
  }
  t.push({
    categoria: "Cono / Cuna",
    nombre: "Cono ATM",
    legs: [
      { offset: 0, tipo: "CALL", side: "buy", qty: 1 },
      { offset: 0, tipo: "PUT", side: "buy", qty: 1 },
    ],
  });
  for (let n = 1; n <= 5; n++) {
    t.push({
      categoria: "Cono / Cuna",
      nombre: `Cuna ${n}w`,
      legs: [
        { offset: +n, tipo: "CALL", side: "buy", qty: 1 },
        { offset: -n, tipo: "PUT", side: "buy", qty: 1 },
      ],
    });
  }
  for (let n = 1; n <= 5; n++) {
    t.push({
      categoria: "Ratio",
      nombre: `Ratio Call 1×2 +${n}`,
      legs: [
        { offset: 0, tipo: "CALL", side: "buy", qty: 1 },
        { offset: +n, tipo: "CALL", side: "sell", qty: 2 },
      ],
    });
  }
  for (let n = 1; n <= 5; n++) {
    t.push({
      categoria: "Ratio",
      nombre: `Ratio Put 1×2 -${n}`,
      legs: [
        { offset: 0, tipo: "PUT", side: "buy", qty: 1 },
        { offset: -n, tipo: "PUT", side: "sell", qty: 2 },
      ],
    });
  }
  for (let n = 1; n <= 5; n++) {
    t.push({
      categoria: "Backspread",
      nombre: `Backspread Call +${n}`,
      legs: [
        { offset: 0, tipo: "CALL", side: "sell", qty: 1 },
        { offset: +n, tipo: "CALL", side: "buy", qty: 2 },
      ],
    });
  }
  for (let n = 1; n <= 5; n++) {
    t.push({
      categoria: "Backspread",
      nombre: `Backspread Put -${n}`,
      legs: [
        { offset: 0, tipo: "PUT", side: "sell", qty: 1 },
        { offset: -n, tipo: "PUT", side: "buy", qty: 2 },
      ],
    });
  }
  const condors: [string, number, number][] = [
    ["Cóndor de Hierro 1|2", 2, 1],
    ["Cóndor de Hierro 2|3", 3, 2],
    ["Cóndor de Hierro 1|3", 3, 1],
    ["Cóndor de Hierro 1|4", 4, 1],
    ["Cóndor de Hierro 2|4", 4, 2],
  ];
  for (const [name, outer, inner] of condors) {
    t.push({
      categoria: "Cóndor de Hierro",
      nombre: name,
      legs: [
        { offset: -outer, tipo: "PUT", side: "buy", qty: 1 },
        { offset: -inner, tipo: "PUT", side: "sell", qty: 1 },
        { offset: +inner, tipo: "CALL", side: "sell", qty: 1 },
        { offset: +outer, tipo: "CALL", side: "buy", qty: 1 },
      ],
    });
  }
  t.push({
    categoria: "Venta de Vol",
    nombre: "Cono Vendido",
    legs: [
      { offset: 0, tipo: "CALL", side: "sell", qty: 1 },
      { offset: 0, tipo: "PUT", side: "sell", qty: 1 },
    ],
  });
  for (let n = 1; n <= 4; n++) {
    t.push({
      categoria: "Venta de Vol",
      nombre: `Cuna Vendida ${n}w`,
      legs: [
        { offset: +n, tipo: "CALL", side: "sell", qty: 1 },
        { offset: -n, tipo: "PUT", side: "sell", qty: 1 },
      ],
    });
  }
  return t;
})();

// ── Tipos de opción del backend ──

export interface OpcionDoc {
  instrumento: string;
  bid?: number;
  offer?: number;
  last?: number;
  open?: number;
  high?: number;
  low?: number;
  ev?: number;
  spot?: number;
  strike?: number;
  tipo?: Tipo | string;
  vence?: string;
  closing_price?: number;
  delta?: number;
  gamma?: number;
  iv?: number;
  theta?: number;
  vega?: number;
  updated_at?: string;
}

// ── Resolución de estrategia a partir del snapshot ──

export interface ResolvedLeg {
  instrumento: string;
  K: number;
  tipo: Tipo;
  side: Side;
  qty: number;
  px: number;
  iv: number;
  vence: string;
  T: number | null;
}

export interface EstrategiaRow {
  nombre: string;
  categoria: string;
  strikes: string;
  costo: number | null;
  volPata: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  legs: ResolvedLeg[];
}

type PorStrike = Record<number, { CALL?: OpcionDoc; PUT?: OpcionDoc }>;

function getPx(d: OpcionDoc | undefined, side: Side): number {
  if (!d) return 0;
  const offer = d.offer || 0;
  const bid = d.bid || 0;
  const last = d.last || 0;
  return offer > 0 && bid > 0 ? (side === "buy" ? offer : bid) : last;
}

function estimateT(d: OpcionDoc | undefined): number | null {
  if (!d) return null;
  const iv = d.iv || 0;
  const vega = d.vega || 0;
  const gamma = d.gamma || 0;
  const spot = d.spot || 0;
  if (vega > 0 && gamma > 0 && spot > 0 && iv > 0) {
    return vega / (gamma * spot * spot * iv);
  }
  if (d.vence && d.vence.length === 8) {
    try {
      const y = parseInt(d.vence.slice(0, 4));
      const m = parseInt(d.vence.slice(4, 6)) - 1;
      const day = parseInt(d.vence.slice(6, 8));
      const vd = new Date(y, m, day);
      const diff = (vd.getTime() - Date.now()) / 86400_000;
      return Math.max(diff, 1) / 365;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildPorStrike(docs: OpcionDoc[]): {
  porStrike: PorStrike;
  liquidStrikes: number[];
} {
  const porStrike: PorStrike = {};
  for (const d of docs) {
    const k = d.strike;
    const t = d.tipo;
    if (!k || !t || (t !== "CALL" && t !== "PUT")) continue;
    if (!porStrike[k]) porStrike[k] = {};
    porStrike[k][t as Tipo] = d;
  }
  const isLiquid = (d?: OpcionDoc) =>
    !!d && ((d.bid || 0) > 0 || (d.offer || 0) > 0);
  const liquidStrikes = Object.keys(porStrike)
    .map(Number)
    .filter((k) => isLiquid(porStrike[k].CALL) || isLiquid(porStrike[k].PUT))
    .sort((a, b) => a - b);
  return { porStrike, liquidStrikes };
}

export function calcularEstrategias(
  porStrike: PorStrike,
  liquidStrikes: number[],
  centerIdx: number,
  categoria: string
): EstrategiaRow[] {
  const rows: EstrategiaRow[] = [];
  for (const tpl of STRATEGY_TEMPLATES) {
    if (tpl.categoria !== categoria) continue;

    let neto = 0;
    let dNet = 0;
    let gNet = 0;
    let tNet = 0;
    let valid = true;
    const usedK: number[] = [];
    const legEvs: number[] = [];
    const resolvedLegs: ResolvedLeg[] = [];

    for (const leg of tpl.legs) {
      const idx = centerIdx + leg.offset;
      if (idx < 0 || idx >= liquidStrikes.length) {
        valid = false;
        break;
      }
      const K = liquidStrikes[idx];
      const d = porStrike[K]?.[leg.tipo];
      const px = getPx(d, leg.side);
      if (px <= 0) {
        valid = false;
        break;
      }
      const m = leg.side === "buy" ? 1 : -1;
      neto += px * leg.qty * m;
      dNet += (d?.delta || 0) * leg.qty * m;
      gNet += (d?.gamma || 0) * leg.qty * m;
      tNet += (d?.theta || 0) * leg.qty * m;
      usedK.push(K);
      legEvs.push((d?.ev || 0) / Math.max(leg.qty, 1));
      resolvedLegs.push({
        instrumento: d?.instrumento || "",
        K,
        tipo: leg.tipo,
        side: leg.side,
        qty: leg.qty,
        px,
        iv: d?.iv || 0,
        vence: d?.vence || "",
        T: estimateT(d),
      });
    }

    const uniqK = Array.from(new Set(usedK)).sort((a, b) => a - b);
    rows.push({
      nombre: tpl.nombre,
      categoria: tpl.categoria,
      strikes: valid ? uniqK.map((k) => k.toLocaleString("es-AR", { maximumFractionDigits: 0 })).join("/") : "-",
      costo: valid ? neto * 100 : null,
      volPata: valid && legEvs.length ? Math.min(...legEvs) : null,
      delta: valid ? dNet : null,
      gamma: valid ? gNet : null,
      theta: valid ? tNet : null,
      legs: valid ? resolvedLegs : [],
    });
  }
  return rows;
}

// ── Black-Scholes (port de quant/black_scholes.py::bs_price) ──

function normCdf(x: number): number {
  // Abramowitz–Stegun approximation, error < 7.5e-8
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

export function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  tipo: Tipo
): number {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) {
    if (tipo === "CALL") return Math.max(S - K * Math.exp(-r * T), 0);
    return Math.max(K * Math.exp(-r * T) - S, 0);
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (tipo === "CALL") {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// ── Payoff al vencimiento ──

export function payoffCurve(
  legs: ResolvedLeg[],
  spot: number,
  neto: number,
  points = 200
): { x: number; pl: number }[] {
  if (!legs.length || spot <= 0) return [];
  const xMin = spot * 0.65;
  const xMax = spot * 1.35;
  const step = (xMax - xMin) / (points - 1);
  const out: { x: number; pl: number }[] = [];
  for (let i = 0; i < points; i++) {
    const x = xMin + step * i;
    let intr = 0;
    for (const leg of legs) {
      const m = leg.side === "buy" ? 1 : -1;
      const payoff =
        leg.tipo === "CALL" ? Math.max(x - leg.K, 0) : Math.max(leg.K - x, 0);
      intr += m * leg.qty * payoff;
    }
    out.push({ x, pl: intr * 100 - (neto || 0) });
  }
  return out;
}

export function findBreakevens(curve: { x: number; pl: number }[]): number[] {
  const bes: number[] = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const { x: x0, pl: y0 } = curve[i];
    const { x: x1, pl: y1 } = curve[i + 1];
    if (Math.sign(y0) !== Math.sign(y1) && y1 !== y0) {
      bes.push(Math.round(x0 - (y0 * (x1 - x0)) / (y1 - y0)));
    }
  }
  return bes;
}

// ── Tabla de escenarios ±2% ──

export interface ScenarioRow {
  precio: number;
  varPct: number;
  finish: number;
  teorico: number | null;
}

export function buildScenarios(
  legs: ResolvedLeg[],
  spot: number,
  costoActual: number,
  tasa: number
): { rows: ScenarioRow[]; T: number | null } {
  const Ts = legs.map((l) => l.T).filter((t): t is number => t !== null && t > 0);
  const T = Ts.length ? Ts.reduce((a, b) => a + b, 0) / Ts.length : null;
  const rows: ScenarioRow[] = [];
  for (let p = -7; p <= 7; p++) {
    const pct = p * 0.02;
    const precio = spot * (1 + pct);
    let finish = 0;
    let teo = 0;
    for (const leg of legs) {
      const m = leg.side === "buy" ? 1 : -1;
      const intrinsic =
        leg.tipo === "CALL"
          ? Math.max(precio - leg.K, 0)
          : Math.max(leg.K - precio, 0);
      finish += m * leg.qty * intrinsic * 100;
      if (T && leg.iv > 0) {
        teo += m * leg.qty * bsPrice(precio, leg.K, T, tasa, leg.iv, leg.tipo) * 100;
      }
    }
    finish -= costoActual;
    rows.push({
      precio,
      varPct: pct,
      finish,
      teorico: T ? teo - costoActual : null,
    });
  }
  return { rows, T };
}
