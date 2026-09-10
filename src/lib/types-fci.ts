/**
 * Tipos de la vista FONDOS COMUNES DE INVERSIÓN (`/fci`) — lo que devuelve
 * `/api/fci/*` (backend `api/services/fci_sql.py`, doc `docs/FCI.md`).
 *
 * Los rendimientos son FRACCIONES (0.0123 = 1,23 %), calculados por el backend
 * desde la serie diaria de VCP con UNA convención de anclas. El front no deriva nada.
 */

export type FciFuente = "primary" | "tenencia" | "manual";

export interface FciFila {
  fci_id:          number;
  nombre:          string;
  gerente:         string | null;
  /** El estante del informe (T+0 MONEY MARKET, T+1, CER…) o null. */
  categoria:       string | null;
  moneda:          "ARS" | "USD" | null;
  tipo_renta:      string | null;
  /** Días de liquidación (T+n). */
  plazo:           number | null;
  simbolo_primary: string | null;
  /** `portafolio.assets.unidad` si la ALyC tiene el fondo. */
  unidad:          string | null;
  cafci:           string | null;
  origen:          "primary" | "asset" | "manual";
  en_tenencia:     boolean;
  /** Fecha del último VCP y de dónde salió. */
  fecha:           string | null;
  vcp:             number | null;
  fuente:          FciFuente | null;
  fecha_1d:        string | null;
  r_1d:    number | null;
  r_wtd:   number | null;
  r_mtd:   number | null;
  r_ytd:   number | null;
  r_7d:    number | null;
  r_30d:   number | null;
  r_90d:   number | null;
  r_365d:  number | null;
  tna_7d:  number | null;
  tna_30d: number | null;
}

export interface FciTabla {
  fondos:     FciFila[];
  categorias: { nombre: string | null; n: number }[];
  gerentes:   { nombre: string | null; n: number }[];
  monedas:    { nombre: string | null; n: number }[];
  fecha_max:  string | null;
  n:          number;
}

export interface FciFicha extends FciFila {
  serie:   { fecha: string; vcp: number; fuente: FciFuente }[];
  fuentes: { fuente: FciFuente; n: number; desde: string | null; hasta: string | null }[];
  asset:   {
    ticker: string | null; emisor: string | null; clase_activo: string | null;
    fee_admin: number | null; codigo_cnv: string | null; instrumento: string | null;
  } | null;
}
