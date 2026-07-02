// Tipos de la vista TRADING (pivots sobre el CEDEAR).

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
  sin_datos?: boolean;
  fecha?: string | null;
  high?: number;
  low?: number;
  close?: number;
  pivots?: PivotLevels;
}

export type AssetClass = "cedear" | "bono";

export interface UniversoItem {
  ticker_corto: string;
  nombre: string;
  clase?: AssetClass;
}
