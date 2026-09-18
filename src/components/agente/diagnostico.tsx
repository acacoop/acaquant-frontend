"use client";

// EL DIAGNÓSTICO de un hallazgo (backend: asistente/diagnostico.py, doc
// AvAgentAI.md §15). La conclusión viene resuelta del backend: causa, acción,
// qué no hacer, las afirmaciones con su marca de verificado o hipótesis, y qué
// ajustó el validador. Acá se dibuja, no se opina (invariante 11).
//
// Vive en LAB → DIAGNÓSTICOS, arriba del ciclo (`traza-diagnostico.tsx`), y
// NO en AHORA: ahí va el aviso del AV AGENT y nada más (pedido del user,
// 2026-09-18). Para un hallazgo de PROCESO la conclusión es el IMPLICA
// (`asistente/implica.py`): qué implica el error, y un prompt listo para pegar
// en una IA de código — con el botón para copiarlo, que es para lo que existe.

import { useState } from "react";

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

export function Diagnostico({ d, at, verCiclo }: {
  d?: D | null; at?: string | null;
  // Abre en el LAB el ciclo que produjo esta conclusión (qué miró, qué dijo,
  // qué le costó). La conclusión sola no alcanza para confiar en ella.
  verCiclo?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!d) return null;

  if (d.tipo === "implica") {
    const copiar = async () => {
      if (!d.prompt) return;
      try {
        await navigator.clipboard.writeText(d.prompt);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      } catch {
        setCopiado(false);
      }
    };
    return (
      <div className="mt-1 border-l-2 border-[var(--t-accent)] pl-2">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[9px]">
          <span className="uppercase tracking-widest text-[var(--t-accent)]">implica</span>
          <b className="text-[var(--t-text)]">{d.firma ?? CAUSA[d.causa] ?? d.causa}</b>
          {d.categoria && <span className="text-[var(--t-text-dim)]">({d.categoria})</span>}
          {at && <span className="text-[var(--t-text-dim)] tabular-nums">{fechaHora(at)}</span>}
          {verCiclo && (
            <button
              onClick={verCiclo}
              className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] uppercase tracking-widest"
            >
              ver el ciclo → LAB
            </button>
          )}
        </div>
        {d.que_implica && (
          <p className="text-[10px] text-[var(--t-text)] mt-0.5">{d.que_implica}</p>
        )}
        {d.prompt && (<>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
              prompt para una IA de código
            </span>
            <button
              onClick={() => void copiar()}
              title="Copia el prompt entero al portapapeles, para pegarlo en la IA que va a corregir el código"
              className="text-[8px] uppercase tracking-widest border border-[var(--t-border)] px-1.5 py-0.5 text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
            >
              {copiado ? "copiado ✓" : "copiar prompt"}
            </button>
          </div>
          <pre className="text-[9px] text-[var(--t-text)] whitespace-pre-wrap break-words bg-[var(--t-surface)] px-1.5 py-1 mt-0.5 max-h-72 overflow-y-auto font-mono">
            {d.prompt}
          </pre>
        </>)}
      </div>
    );
  }

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
        {verCiclo && (
          <button
            onClick={verCiclo}
            title="Ver en el LAB cada vuelta: qué miró, qué dijo el modelo y cuánto costó"
            className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] uppercase tracking-widest"
          >
            ver cómo lo pensó → LAB
          </button>
        )}
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
