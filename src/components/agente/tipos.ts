// Los tipos del AV Agent. Espejan lo que devuelve `agente/vista.py`.
//
// ⚠️ El front **no deriva**: clase, estado, arreglo y nombre vienen resueltos
// del backend. Si acá aparece un cálculo, está en el lugar equivocado.

export type Severidad = "alta" | "media" | "baja";

export type Hallazgo = {
  id: number;
  habilidad: string;
  sujeto: string;
  regla: string;
  nombre: string;
  severidad: Severidad;
  problema: string;
  que_hacer: string;
  arreglo: string;
  arreglo_titulo?: string;
  arreglo_donde?: string;
  evidencia: Record<string, unknown>;
  detectado_at: string;
  visto_ultima_vez?: string;
  veces: number;
  estado?: string;
  dominio: string | null;
  accionable?: boolean;
};

export type Habilidad = {
  nombre: string;
  tipo: "detector" | "consulta" | "accion";
  dominio: string;
  que_mira: string;
  usa_ia: boolean;
  cada_segundos: number;
  ventana: string;
  activa: boolean;
  clase: "aviso" | "trabajo";
  arreglos: Record<string, string>;
  ultima_corrida_at: string | null;
  ultimo_resultado: "ok" | "sin_datos" | "error" | null;
  ultimo_error: string;
  ultima_duracion_ms: number | null;
  corridas_hoy: number;
  hallazgos_total: number;
  hallazgos_abiertos: number;
  ultimo_hallazgo_at: string | null;
  reincidencias: number;
};

export type Reincidencia = {
  id: number;
  habilidad: string;
  sujeto: string;
  regla: string;
  arreglo_aplicado: string;
  resuelto_at: string;
  volvio_at: string;
  dias_aguanto: number;
};

export type Vista = {
  ok: boolean;
  latido: { vivo: boolean; at?: string; hace_s: number | null;
            cada_s?: number | null };
  ahora: { total: number; filas: Hallazgo[] };
  encontro: { total: number; filas: Hallazgo[]; por_habilidad: Record<string, number> };
  reincidencias: { total: number; filas: Reincidencia[] };
  habilidades: Habilidad[];
};

export type Accion = {
  id: number;
  at: string;
  arreglo: string;
  habilidad: string;
  sujeto: string;
  regla: string;
  hallazgo_id: number | null;
  por: string;
  donde: string;
  campo: string;
  antes: string;
  despues: string;
  ok: boolean;
  error: string;
  estado_hoy: string | null;
};

export type Historial = {
  filas: Accion[];
  hay_mas: boolean;
  ultimo_id: number | null;
  limite: number;
};

// El sello de tiempo va en TODO lo que se muestra (invariante 3).
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function hace(segundos: number | null): string {
  if (segundos == null) return "—";
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}m`;
  return `${Math.round(segundos / 3600)}h`;
}

export const COLOR: Record<Severidad, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-accent)",
  baja: "var(--t-text-muted)",
};
