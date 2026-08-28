/**
 * Tipos compartidos entre páginas y componentes. Antes estaban duplicados
 * en casi cada archivo. Los componentes existentes pueden migrar
 * gradualmente — no es breaking.
 */

export interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    vwap?: number;
    total_nominals?: number;
    high_price?: number;
    low_price?: number;
    closing_price?: number;
    open_price?: number;
    duration?: number;
    mod_duration?: number;
    convexity?: number;
    // TC breakeven = MEP × (flujo_vto / last). Sólo populado para
    // bonos de tasa fija (nativa o CER ya fijado por el BCRA).
    tc_breakeven?: number | null;
    // Pago final = bullet al vto por 100 VN. Populado para tasa fija (nativa o
    // CER fijado); se muestra en la columna "Pago Final".
    flujo_vencimiento?: number;
  };
}

export interface ForwardDoc {
  curva: string;
  tickers?: string[];
  tasas?: Record<string, number>;
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

export interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

export interface ForwardZscoreStats {
  media: number;
  desvio: number;
  n_obs: number;
}

export interface ForwardZscoreDoc {
  curva: string;
  fecha_calculo?: string;
  ventana_dias_habiles?: number;
  n_obs_min?: number;
  stats?: Record<string, Record<string, ForwardZscoreStats>>;
}

export interface FairValueBono {
  ticker: string;
  ticker_corto?: string | null;
  duration: number;
  tea_obs: number;
  tea_teorica: number;
  residuo_bps: number;
  z_estatico: number | null;
  z_temporal: number | null;
  n_obs?: number | null;
  en_universo?: boolean;
}

export interface FairValueDoc {
  curva: string;
  ts_cierre_beta?: string;     // live trae el ts_cierre del cual son los β
  ts_cierre?: string;           // cierre persistido trae fecha del cierre
  beta0: number;
  beta1: number;
  beta2: number;
  r2: number;
  sigma_dia_bps: number;
  n_bonos_universo: number;
  updated_at?: string | null;
  bonos: FairValueBono[];
  error?: string;
}

export interface FairValueHistRow {
  fecha: string;
  residuo_bps: number;
  z_temporal: number | null;
  z_estatico: number | null;
  tea_obs: number;
  tea_teorica: number;
  duration: number;
}

export interface FairValueHistorico {
  ticker: string;
  curva?: string | null;
  dias: number;
  serie: FairValueHistRow[];
}

export interface FlujoTicker {
  ticker: string;
  curva: string;
  /** Curva efectiva: si `cer_fijado=true` se reasigna a 'tasa_fija' para que
   *  el frontend lo muestre en esa pestaña aunque el `curva` original sea 'cer'. */
  curva_efectiva?: string;
  /** True si es un bono CER cuyo CER de liquidación del vto ya fue publicado
   *  por el BCRA (se comporta como tasa fija). El backend lo computa via
   *  `_bonos_cer_fijados()` en cada request. */
  cer_fijado?: boolean;
  fecha_vencimiento?: string;
}

export interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

export interface BreakevenDoc {
  pares?: BreakevenPar[];
  updated_at?: string;
}

export interface BreakevenHistDoc {
  fecha: string;
  pares: BreakevenPar[];
}

export interface Quote {
  symbol: string;
  type: "stock" | "forex" | "treasury" | "index";
  grupo?: string;
  last: number | null;
  prev_close: number | null;
  pct_day: number | null;
  ret_7d:  number | null;
  ret_mtd: number | null;
  ret_ytd: number | null;
  ret_1y:  number | null;
  updated_at?: string;
}

// ── Tab CURVAS del rediseño de renta fija (docs/RENTA_FIJA.md §0) ────────────
// Shape de `GET /api/cotizaciones/curvas-vista`: los bonos llegan YA
// clasificados por el backend (pill + lado + ejes), así que el front no
// reconstruye la clasificación — antes la armaba con los cronogramas completos.

export interface BonoCurva {
  ticker_corto:      string;
  instrumento:       string | null;   // 'MERV - XMEV - AL30 - 24hs'
  pill:              string;          // tasa_fija | cer | hard_dolar | dolar_linked | tamar | duales
  lado:              "ARS" | "USD";
  emisor_tipo:       string;          // soberano | provincial | corporativo | bcra
  emisor:            string | null;
  moneda:            string;
  ajuste:            string;
  // La SEGUNDA pata de un dual. Un dual llega REPETIDO — una fila por pill, misma
  // ficha, distinto `pill`/`lado` — porque el trader lo mira en sus dos tablas.
  // Por eso `bonos` puede tener más filas que bonos: filtrá por `pill` como
  // siempre y no cuentes bonos con `bonos.length`.
  ajuste_alt:        string | null;
  // Cuál de las dos patas del bono es ESTA fila (`cer` en la tabla CER, `tamar`
  // en la de TAMAR). Antes las dos filas de un dual llevaban la MISMA tasa,
  // porque el snapshot tiene una sola por símbolo — y entre las patas de TXMD9
  // hay ~2.900 bps (6,82% real por CER contra 38,62% nominal por TAMAR).
  pata?:             string | null;
  // De dónde salió la TEA de esta fila. `null`/ausente = del motor (Primary,
  // live). `"1816"` = del job `tamar_1816`, que corre cada 30' y por lo tanto
  // tiene DELAY y puede ser de la rueda de `tea_fecha`. Viaja siempre para que
  // una tasa nunca obligue a adivinar su procedencia.
  tea_fuente?:       string | null;
  tea_fecha?:        string | null;   // la rueda a la que corresponde (YYYY-MM-DD)
  // El MARGEN sobre la TAMAR: lo que la mesa realmente mira de un bono TAMAR
  // (cuánto paga por encima de la tasa de referencia del BCRA). En FRACCIÓN
  // (0.0973 = 9,73%), la misma escala que la TEA. `null` = no lo tenemos.
  margen?:           number | null;
  // TC al que el bono en pesos empata contra comprar MEP hoy y esperar al
  // vencimiento. Solo en tasa fija (flujo final determinado); `null` = no se pudo
  // calcular (sin MEP, sin flujo final) — NUNCA 0, que se leería como un TC.
  tc_breakeven?:     number | null;
  // La TEA de este bono es un ARTEFACTO de plazo, no un rendimiento: con duration
  // ~0, anualizar pocos días infla el número a tres dígitos. Lo decide el BACKEND
  // para que la tabla y el gráfico no puedan contradecirse. La tabla la muestra
  // apagada; el gráfico la EXCLUYE (un solo 142% aplasta a los otros 120 bonos).
  tasa_ruido?:       boolean;
  // La INDUSTRIA del EMISOR (`mercado.emisores`), resuelta por el backend en la
  // lectura. Solo viaja para corporativos — un soberano no tiene industria.
  // `null` en un corporativo = SIN CLASIFICAR, y se muestra como grupo propio:
  // mezclarlo con "otros" haría que "nadie lo decidió" se vea igual que una
  // decisión tomada.
  industria:         string | null;
  ley:               string | null;   // local (Bonar) | ny (Global)
  tipo:              string | null;
  vencimiento:       string | null;
  cer_fijado:        boolean;
  flujo_vencimiento: number | null;
  metrics:           Record<string, number>;
}

export interface PillDef {
  codigo:  string;
  display: string;
  lado:    "ARS" | "USD";
  orden:   number;
  n:       number;
}

export interface CurvasVista {
  pills:           PillDef[];
  emisores:        { codigo: string; label: string; n: number }[];
  bonos:           BonoCurva[];
  sin_clasificar:  string[];
}

// ── FICHA DE UN BONO (`GET /api/cotizaciones/bono/<ticker>`) ────────────────
//
// Lo que abre el click en una fila de la tab CURVAS. El backend arma el
// cronograma con la MISMA función que el motor usa para calcular la TEA que
// muestra la tabla (`engines.curvas.rama_calculo` + su `monto_flujo_*`), así el
// modal no puede contradecir a la fila que lo abrió.

export interface FlujoBono {
  fecha:                string;    // YYYY-MM-DD
  amortizacion:         number;    // por 100 VN
  interes:              number;    // por 100 VN
  monto:                number;    // amortizacion + interes, por 100 VN
  residual_previo_pct:  number | null;
  futuro:               boolean;   // >= hoy
  bullet?:              boolean;   // sintetizado de `flujo_vencimiento` (Lecap/Boncap)
}

export interface PataBono {
  pill:         string;
  lado:         "ARS" | "USD";
  pata:         string | null;
  metrics:      Record<string, number>;
  tea_fuente:   string | null;
  tea_fecha:    string | null;
  margen:       number | null;
  tasa_ruido:   boolean | null;
  tc_breakeven: number | null;
}

export interface BonoDetalle {
  // El backend contesta 200 con `error` cuando el ticker no está en el master:
  // el modal tiene que poder decir "no lo encontré" sin romper la pantalla.
  error?:        string;
  ticker?:       string;
  instrumento?:  string | null;
  ficha?: {
    emisor:            string | null;
    emisor_tipo:       string | null;
    industria:         string | null;
    tipo:              string | null;
    curva:             string | null;
    moneda:            string | null;
    moneda_flujo:      string | null;
    ajuste:            string | null;
    ajuste_alt:        string | null;
    ley:               string | null;
    fecha_emision:     string | null;
    fecha_vencimiento: string | null;
    valor_nominal:     number | null;
    cupon_anual:       number | null;
    cer_emision:       number | null;
    flujo_vencimiento: number | null;
    cer_fijado:        boolean;
  };
  // La rama de cálculo del motor (soberanos | cer | on | tasa_fija | …). Viaja
  // para que se pueda ver, desde la pantalla, con qué fórmula se valúa el bono.
  rama?:          string;
  // Qué significa "100" en la columna MONTO. Lo decide el backend porque depende
  // de la rama: un número por 100 VN sin unidad no se puede leer.
  unidad_flujo?:  string;
  nota_flujo?:    string | null;
  flujos?:        FlujoBono[];
  resumen?: {
    n_pagos_futuros: number;
    proximo_pago:    FlujoBono | null;
    total_futuro:    number;
    ultimo_pago:     FlujoBono | null;
  };
  patas?:         PataBono[];
}
