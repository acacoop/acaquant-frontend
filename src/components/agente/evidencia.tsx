"use client";

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
  const claves = Object.keys(ev ?? {});
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
