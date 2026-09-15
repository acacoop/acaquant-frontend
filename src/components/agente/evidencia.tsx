"use client";

import { useState } from "react";

import { fechaHora } from "./tipos";

/**
 * LA EVIDENCIA DEL DETECTOR, desplegable. Hasta el 2026-09-02 llegaba en cada
 * hallazgo y ningún componente la dibujaba: la fecha de la foto de Primary, la
 * lista de títulos, el pid de un motor — todo invisible. Cuando algo parece
 * mentira, esto es lo que se abre antes de discutirlo (AGENT.md §0.de).
 *
 * No deriva nada: muestra las claves tal cual las mandó el backend. Las listas
 * se cortan a 20 con «y N más»; un objeto se muestra como JSON corto.
 */
const TOPE_LISTA = 20;

function valor(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) {
    const xs = v.slice(0, TOPE_LISTA).map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)));
    return xs.join(" · ") + (v.length > TOPE_LISTA ? ` · y ${v.length - TOPE_LISTA} más` : "");
  }
  if (typeof v === "object") return JSON.stringify(v).slice(0, 400);
  if (typeof v === "boolean") return v ? "sí" : "no";
  return String(v);
}

export function Evidencia({ ev }: { ev: Record<string, unknown> | null | undefined }) {
  // ⚠️ **LAS CLAVES QUE EMPIEZAN CON `_` SON DATO DE MÁQUINA, no de pantalla.**
  //
  // La evidencia mezcla dos cosas: números para leer (cuántos fallos, qué error
  // devolvió el proveedor) e insumos que el backend necesita para decidir —
  // `_items` es la lista de unidades con la que `registro._ver` resuelve si algo
  // REINCIDIÓ. Dibujarla desplegaba 379 unidades adentro de una tarjeta cuyo
  // texto útil son dos renglones.
  const claves = Object.keys(ev ?? {}).filter((k) => !k.startsWith("_"));
  if (!claves.length) return null;
  return (
    <details className="mt-0.5">
      <summary className="cursor-pointer text-[8px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">
        evidencia · {claves.length}
      </summary>
      <dl className="mt-0.5 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-2 gap-y-0.5 text-[9px]">
        {claves.map((k) => (
          <div key={k} className="contents">
            <dt className="text-[var(--t-text-dim)] truncate" title={k}>{k}</dt>
            <dd className="text-[var(--t-text)] break-words font-mono">{valor(ev![k])}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** ¿ESTO ES NUEVO O PASA SIEMPRE? — la pregunta que decide qué hacer.
 *
 *  Un job que no escribió hoy y uno que no escribe todos los días se veían
 *  IGUAL, y por eso los dos terminaban en «relanzá el job». Para el primero
 *  está bien; para el segundo, relanzar es el parche — lo que hay que mirar es
 *  el umbral, el cron, o si el job sigue haciendo falta.
 *
 *  ⚠️ NO es `veces` (cuántas veces el detector lo vio en este episodio): es
 *  cuántas veces NACIÓ el problema en 30 días. Un problema que persiste no
 *  crea fila nueva, así que 27 episodios son 27 veces que apareció y se fue.
 *
 *  Sin dato NO se dibuja nada: el backend no pudo contar, y «no sé» no se
 *  puede mostrar como «es la primera vez».
 */
export function Recurrencia({ episodios, cronico }: {
  episodios?: number | null; cronico?: boolean;
}) {
  if (episodios == null || episodios < 2) return null;
  return (
    <span
      className="text-[8px] uppercase tracking-widest whitespace-nowrap"
      style={{ color: cronico ? "var(--t-neg)" : "var(--t-text-dim)" }}
      title={cronico
        ? `Apareció ${episodios} veces en los últimos 30 días. No es un incidente: `
          + `revisá el umbral, el cron o si el job sigue haciendo falta — `
          + `arreglarlo de nuevo lo tapa.`
        : `Apareció ${episodios} veces en los últimos 30 días.`}
    >
      {cronico ? `⚠ crónico · ${episodios}× en 30d` : `${episodios}× en 30d`}
    </span>
  );
}

/** «confirmado hace…»: cuándo el detector vio el problema por última vez. Sin
 *  esto un hallazgo de hace tres días y uno confirmado hace veinte minutos se
 *  ven iguales. Solo se dibuja si difiere del nacimiento. */
export function Confirmado({ desde, ultima }: { desde: string; ultima?: string | null }) {
  if (!ultima || ultima === desde) return null;
  return (
    <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
      · confirmado {fechaHora(ultima)}
    </span>
  );
}

/** El `detalle` de un hallazgo. Corto: como siempre. Largo (más de LINEAS_A_LA_VISTA
 *  líneas): plegado, con la primera línea a la vista —en una tabla es la cabecera—
 *  y un botón para desplegar. Plegar es presentación, no dato: el backend manda
 *  el texto entero y acá solo se decide cuánto se ve a la vez. */
export const LINEAS_A_LA_VISTA = 6;

export function Detalle({ texto }: { texto?: string | null }) {
  const [abierto, setAbierto] = useState(false);

  if (!texto) return null;

  const lineas = texto.split("\n");
  const pre =
    "text-[9px] text-[var(--t-text)] mt-0.5 px-1.5 py-1 border-l-2 border-[var(--t-accent)] "
    + "bg-[var(--t-surface)] whitespace-pre-wrap break-all font-mono";

  if (lineas.length <= LINEAS_A_LA_VISTA) {
    return <pre className={pre}>{texto}</pre>;
  }

  return (
    <>
      <pre className={pre}>{abierto ? texto : lineas[0]}</pre>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="text-[8px] uppercase tracking-widest text-[var(--t-accent)] hover:underline"
      >
        {abierto ? "▾ plegar" : `▸ ver las ${lineas.length} líneas`}
      </button>
    </>
  );
}
