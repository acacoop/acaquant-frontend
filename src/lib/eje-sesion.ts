// Eje X "de sesión" para los charts históricos intradía de DERIVADOS.
//
// Problema: si el eje X es el tiempo real, las noches y los fines de semana
// abren huecos enormes; si es el número de punto, hoy (26 buckets de 15 min)
// ocupa casi todo el ancho y cada día anterior (un cierre) queda aplastado.
//
// Solución: cada día de rueda ocupa el MISMO ancho. Dentro del día, el punto
// se ubica según su hora en la sesión (11:00 → 17:00, hora local): un bucket
// de las 14:00 cae a mitad del día, el cierre de las 17:00 al final. Los ticks
// van al centro de cada día con su fecha.
const SESION_INI_MIN = 11 * 60;
const SESION_FIN_MIN = 17 * 60;
// Margen dentro del día para que el primer y el último punto no se peguen al
// límite del día vecino.
const PAD = 0.06;

/** Clave YYYY-MM-DD del día LOCAL de un timestamp (ms). */
export function claveDia(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 0 = apertura de la sesión, 1 = cierre. Clampeado. */
export function fraccionSesion(t: number): number {
  const d = new Date(t);
  const min = d.getHours() * 60 + d.getMinutes();
  const f = (min - SESION_INI_MIN) / (SESION_FIN_MIN - SESION_INI_MIN);
  return Math.min(1, Math.max(0, f));
}

export function fmtDDMM(t: number): string {
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fmtDDMMHHMM(t: number): string {
  const d = new Date(t);
  return `${fmtDDMM(t)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export interface EjeSesion {
  /** Posición X de cada punto, en el orden de `ts`. */
  xs: number[];
  /** Un tick por día, centrado en su franja. */
  ticks: number[];
  domain: [number, number];
  /** Etiqueta DD/MM del tick. */
  labelTick: (x: number) => string;
}

export function ejeSesion(ts: number[]): EjeSesion {
  const dias = [...new Set(ts.map(claveDia))].sort();
  const idxDia = new Map(dias.map((d, i) => [d, i] as const));
  const tsDia = new Map<string, number>();
  for (const t of ts) if (!tsDia.has(claveDia(t))) tsDia.set(claveDia(t), t);
  const xs = ts.map(
    (t) => idxDia.get(claveDia(t))! + PAD + (1 - 2 * PAD) * fraccionSesion(t),
  );
  return {
    xs,
    ticks: dias.map((_, i) => i + 0.5),
    domain: [0, Math.max(1, dias.length)],
    labelTick: (x) => {
      const d = dias[Math.floor(x)];
      return d ? fmtDDMM(tsDia.get(d)!) : "";
    },
  };
}
