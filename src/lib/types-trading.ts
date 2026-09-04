// Tipos de la vista TRADING (pivots sobre el CEDEAR).

// Color del VWAP en toda la vista (card + curva del chart) — verde claro.
export const VWAP_COLOR = "#86efac";

export type PivotMode = "precio" | "dif" | "pct";

export interface PivotLevels {
  pp: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface PivotRow {
  ticker: string;
  last: number | null;
  vwap?: number | null;
  sin_datos?: boolean;
  fecha?: string | null;
  high?: number;
  low?: number;
  close?: number;
  pivots?: PivotLevels;
}

export type AssetClass = "cedear" | "bono";

// Fila del radar de proximidad a pivote (/api/trading/pivot-radar).
export interface PivotRadarRow {
  ticker: string;
  last: number;
  nivel: string; // "PP" | "R1".."R3" | "S1".."S3"
  nivel_precio: number;
  dist_pct: number; // signed: + = last por encima del nivel
  // Plata operada hoy por el papel (`total_money` del snapshot, NO el nominal).
  // Es el MISMO campo que ranquea la tab VOLUMENES — lo manda el backend en la
  // misma fila, acá no se suma ni se cruza nada. null = no operó.
  cash?: number | null;
}

export interface UniversoItem {
  ticker_corto: string;
  nombre: string;
  clase?: AssetClass;
}

// ── tab MONITOR (/api/trading/monitor*) ─────────────────────────────────────
// El backend manda TODO resuelto: de qué tabla salió (`fuente`), si el perfil
// es exacto o derivado de barras (`aproximado`), el POC y el área de valor.
// Acá no se deriva nada — si la pantalla recalculara el POC podría contradecir
// al endpoint que se lo dio.
export type MonitorClase = "rv" | "rf";

export interface MonitorVentana {
  ventana: string;      // "hoy" | "5r" | "20r" | "3r"
  etiqueta: string;     // "HOY" | "5 R" | ...
  ruedas: number;
  paso_min: number;     // resample de la serie (1' hoy, 5'/15' multi-rueda)
  fuente: string;       // tabla + precisión, para el chip
  aproximado: boolean;  // true = perfil derivado de barras de 1', no de trades
}

export interface MonitorItem {
  ticker: string;
  nombre: string;
  grupo: string;
  moneda: string | null;
  last: number | null;
  var_pct: number | null;
  cash: number | null;  // plata operada hoy (solo CEDEARs)
}

export interface MonitorUniverso {
  clase: MonitorClase;
  ventanas: MonitorVentana[];
  items: MonitorItem[];
}

export interface MonitorBucket {
  px_lo: number;
  px_hi: number;
  vol: number;
  trades: number;
}

export interface MonitorPunto {
  t: string;  // naive ART "YYYY-MM-DDTHH:MM:00"
  o: number; h: number; l: number; c: number;
  vol: number; trades: number;
}

export interface MonitorResp {
  clase: MonitorClase;
  ticker: string;
  ventana: string;
  fuente: string;
  aproximado: boolean;
  paso_min: number;
  sin_datos: boolean;
  motivo?: string;
  serie: MonitorPunto[];
  buckets: MonitorBucket[];
  poc: { px_lo: number; px_hi: number; px: number; vol: number } | null;
  val: number | null;
  vah: number | null;
  resumen: {
    first?: number; last?: number; high?: number; low?: number;
    vwap?: number | null; vol?: number; trades?: number; ruedas?: number;
    desde?: string; hasta?: string;
  };
}
