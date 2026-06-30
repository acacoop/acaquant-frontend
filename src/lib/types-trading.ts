// Tipos de la vista TRADING (panel intradía de CEDEARs).
// Espejo del shape que devuelve api/services/trading_panel.py.

export type SistemaEstado = "INACTIVO" | "VIGILAR" | "ACTIVO";
export type Lado = "long" | "short" | null;

export interface Sistema {
  estado: SistemaEstado;
  lado: Lado;
  nota: string;
}

export interface Sistemas {
  S1: Sistema;
  S2: Sistema;
  S3: Sistema;
  S4: Sistema;
  S5: Sistema;
}

export interface PanelRow {
  ticker: string | null;
  error?: string;
  last: number | null;
  vwap: number | null;
  pct_vs_vwap: number | null;
  pos_rango: number | null;
  gap_adr_pct: number | null;
  spread_pct: number | null;
  vs_1d_pct: number | null;
  vs_1d_usd_pct: number | null;
  adr_vs_1d_pct: number | null;
  adr_ret_mtd_pct: number | null;
  rango_dia_pct: number | null;
  zscore: number | null;
  vol_diaria_pct: number | null;
  dia_volatil: boolean;
  dist_R_pct: number | null;
  dist_S_pct: number | null;
  toca_R2_R3: boolean | null;
  toca_S2_S3: boolean | null;
  vwap_crosses: number | null;
  estado_OR: "BREAK_UP" | "BREAK_DOWN" | "INSIDE" | null;
  climax: boolean | null;
  minutos_rueda: number | null;
  rvol: number | null;
  updated_at: string | null;
  sistemas: Sistemas;
}

export interface CclLive {
  value: number | null;
  vs_1d_pct: number | null;
  ts: string | null;
}

export interface PanelResp {
  generado_en: string;
  ccl: CclLive;
  rows: PanelRow[];
}

// Etiquetas + descripción corta de cada sistema (para el header de columnas y la leyenda).
export const SISTEMAS_META: { key: keyof Sistemas; titulo: string; desc: string }[] = [
  { key: "S1", titulo: "Apertura", desc: "Continuación direccional en los primeros 90' (rompe el opening range a favor del ADR + VWAP)." },
  { key: "S2", titulo: "Fade", desc: "Reversión de toma de ganancias en día volátil (estirado en un extremo + empezó a retroceder)." },
  { key: "S3", titulo: "Scalp", desc: "Vueltas en rango en día lateral (muchos cruces de VWAP, spread angosto, piso/techo del rango)." },
  { key: "S4", titulo: "Disloc.", desc: "CEDEAR vs ADR: el local se despegó de lo que implica el ADR + CCL (catch-up / fade)." },
  { key: "S5", titulo: "Holdeo", desc: "Sostener tenencia mientras aguante (arriba del VWAP, tendencial, fondo de mes a favor)." },
];
