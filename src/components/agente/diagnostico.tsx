"use client";

// EL DIAGNÓSTICO de un hallazgo (backend: asistente/diagnostico.py, doc
// AvAgentAI.md §15). La conclusión viene resuelta del backend: causa, acción,
// qué no hacer, las afirmaciones con su marca de verificado o hipótesis, y qué
// ajustó el validador. Acá se dibuja, no se opina (invariante 11).

import type { Diagnostico as D } from "./tipos";

const CAUSA: Record<string, string> = {
  transitorio: "transitorio: se resuelve solo",
  configuracion: "configuración mal puesta",
  bug_codigo: "bug de código",
  fuera_de_alcance: "fuera de alcance del Droplet",
  detector_desactualizado: "el detector supone algo viejo",
  incidente: "incidente real",
  sin_verificar: "sin verificar",
};

const ACCION: Record<string, string> = {
  aplicar_arreglo: "aplicar el arreglo",
  esperar_hasta: "esperar",
  escalar_a: "escalar",
  cambiar_codigo: "cambiar código",
  nada_porque: "no hacer nada",
  no_se: "no sé",
};

function fechaHora(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function Diagnostico({ d, at }: { d?: D | null; at?: string | null }) {
  if (!d) return null;
  const sinVerificar = d.causa === "sin_verificar" || d.accion === "no_se";
  const tono = sinVerificar ? "text-[var(--t-text-dim)]" : "text-[var(--t-accent)]";
  return (
    <div className={`mt-1 border-l-2 pl-2 ${sinVerificar ? "border-[var(--t-border)]" : "border-[var(--t-accent)]"}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[9px]">
        <span className={`uppercase tracking-widest ${tono}`}>diagnóstico</span>
        <b className="text-[var(--t-text)]">{CAUSA[d.causa] ?? d.causa}</b>
        <span className="text-[var(--t-text-dim)]">→</span>
        <b className="text-[var(--t-text)]">{ACCION[d.accion] ?? d.accion}</b>
        {at && <span className="text-[var(--t-text-dim)] tabular-nums">{fechaHora(at)}</span>}
      </div>
      {d.resumen && (
        <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">{d.resumen}</p>
      )}
      {d.accion_detalle && (
        <p className="text-[10px] text-[var(--t-text)] mt-0.5">{d.accion_detalle}</p>
      )}
      {(d.archivo || d.motivo_codigo) && (
        <p className="text-[9px] text-[var(--t-text-muted)] mt-0.5">
          código: <span className="font-mono">{d.archivo ?? "?"}</span>
          {d.motivo_codigo && <> — {d.motivo_codigo}</>}
        </p>
      )}
      {d.escalar_a && (
        <p className="text-[9px] text-[var(--t-text-muted)] mt-0.5">escalar a: {d.escalar_a}</p>
      )}
      {(d.no_hacer?.length ?? 0) > 0 && (
        <ul className="text-[9px] text-[var(--t-neg)] mt-0.5">
          {d.no_hacer!.map((n, i) => <li key={i}>✕ {n}</li>)}
        </ul>
      )}
      {(d.verificado?.length ?? 0) > 0 && (
        <ul className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
          {d.verificado!.map((v, i) => (
            <li key={i}>
              <span className={v.estado === "verificado" ? "text-[var(--t-pos)]" : "text-[var(--t-text-dim)]"}>
                {v.estado === "verificado" ? "✓ verificado" : "? hipótesis"}
              </span>{" "}
              {v.afirmacion}
            </li>
          ))}
        </ul>
      )}
      {(d.validado?.cambios?.length ?? 0) > 0 && (
        <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
          el validador ajustó: {d.validado!.cambios.join(" · ")}
        </p>
      )}
      {d.control && !d.control.ok && (
        <p className="text-[9px] text-[var(--t-neg)] mt-0.5">
          ⚠ el inspector marcó la conclusión: {d.control.hallazgos.map((h) => h.que_paso).join(" · ")}
        </p>
      )}
    </div>
  );
}
