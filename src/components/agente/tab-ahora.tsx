"use client";

// AHORA — EL NOTICIERO DEL DÍA. Doc: `docs/AGENT.md` §6.1.
//
// La regla, entera:
//
//     AHORA = hallazgos con fecha de HOY (ART), sin leer, sin resolver
//
// **Es solo informativo.** Lo único que se puede hacer acá es marcar leído —
// que lo saca de AHORA y de NINGÚN otro lado: el hallazgo sigue abierto, sigue
// en ENCONTRÓ y sigue con su botón. Un botón de acción acá volvería a mezclar
// el noticiero con la lista de trabajo, que es de lo que venimos escapando.
//
// ⚠️ **El contador NO se suma acá.** Sale de la misma query que la lista, del
// backend. En el agente viejo el «AHORA 92» lo sumaba el navegador juntando
// cuatro cosas de dos endpoints con frescuras distintas, contadas sobre listas
// ya cortadas en 200 filas y leídas de otra tabla.
import { useState } from "react";

import { COLOR, fechaHora, type Hallazgo } from "@/components/agente/tipos";
import { Recurrencia, Confirmado, Evidencia, Detalle } from "./evidencia";
import { Diagnostico } from "./diagnostico";

export function TabAhora({ filas, marcarLeidos, ignorar, verDiagnostico }: {
  filas: Hallazgo[];
  marcarLeidos: (ids: number[]) => Promise<void>;
  // ⚠️ **«LEÍDO» NO ALCANZA, Y ESA ERA LA MITAD QUE FALTABA.** Marcar leído
  // saca la fila de AHORA y nada más: el detector la vuelve a encontrar en la
  // pasada siguiente y mañana está de nuevo. Para lo que NO se va a hacer
  // —una ON que la mesa no quiere cargar— hace falta silenciar el PROBLEMA
  // (habilidad + sujeto + regla), que es lo que hace `/api/agente/ignorar`.
  // El endpoint y la tabla `agente.silenciados` existían desde el principio;
  // el botón sólo estaba en ENCONTRÓ, así que los avisos —que son la mayoría
  // de AHORA— no tenían forma de callarse. Es reversible.
  ignorar?: (id: number) => Promise<void>;
  // Abre el LAB con el ciclo del diagnóstico de ese hallazgo (o para pedirlo
  // si todavía no corrió). No es una acción sobre el hallazgo: es mirar.
  verDiagnostico?: (id: number) => void;
}) {
  const [enviando, setEnviando] = useState(false);

  async function marcar(ids: number[]) {
    if (!ids.length || enviando) return;
    setEnviando(true);
    try { await marcarLeidos(ids); } finally { setEnviando(false); }
  }

  if (!filas.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-[var(--t-text-muted)]">
          <b>Hoy no pasó nada nuevo.</b> Lo que sigue abierto de antes no es una
          novedad: vive en ENCONTRÓ, con su botón.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-[var(--t-text-dim)]">
          Lo que apareció <b>HOY</b>. <b>✓</b> lo saca de acá y de ningún otro
          lado — leer no resuelve. <b>✕</b> lo silencia para siempre: no vuelve
          a aparecer nunca más (reversible).
        </p>
        <button
          disabled={enviando}
          onClick={() => void marcar(filas.map((f) => f.id))}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {enviando ? "marcando…" : `✓ leí todo (${filas.length})`}
        </button>
      </div>

      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {filas.map((f) => (
          <div key={f.id} className="px-2 py-1.5 flex items-start gap-2">
            <span
              className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full"
              style={{ background: COLOR[f.severidad] }}
              title={f.severidad}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {/* La FECHA Y HORA van en todo lo que se muestra. */}
                <span className="text-[9px] tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
                  {fechaHora(f.detectado_at)}
                </span>
                <Confirmado desde={f.detectado_at} ultima={f.visto_ultima_vez} />
                <Recurrencia episodios={f.episodios} cronico={f.cronico} />
                <span className="text-[11px] font-bold text-[var(--t-text)] truncate">
                  {f.nombre || f.sujeto}
                </span>
                {/* De QUÉ habilidad salió: es lo que permite abrir el número. */}
                <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                  {f.habilidad}
                </span>
                {f.veces > 1 && (
                  <span className="text-[8px] text-[var(--t-text-dim)]">
                    ×{f.veces}
                  </span>
                )}
                {f.accionable && (
                  <span className="text-[8px] uppercase tracking-widest text-[var(--t-accent)]">
                    tiene arreglo → ENCONTRÓ
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">
                {f.problema}
              </p>
              {/* ⚠️ **EL ERROR CRUDO VA PRIMERO Y DESTACADO.** Es lo único que
                  dice de QUIÉN es el problema: un 401 es una credencial
                  nuestra, un 5xx es de ellos, un timeout es la red.
                  Antes se calculaba y quedaba enterrado en `evidencia`, que
                  esta pantalla ni leía, y en su lugar se veía una frase de
                  molde idéntica para los cuatro proveedores. */}
              <Detalle texto={f.detalle} />
              <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
                {f.que_hacer}
              </p>
              {/* Lo que concluyó EL DIAGNÓSTICO, si ya corrió: causa, acción y
                  qué NO hacer. El `que_hacer` de arriba es el del detector; esto
                  es lo investigado. */}
              <Diagnostico d={f.diagnostico} at={f.diagnosticado_at}
                           verCiclo={verDiagnostico ? () => verDiagnostico(f.id) : undefined} />
              {!f.diagnostico && verDiagnostico && (
                <button
                  onClick={() => verDiagnostico(f.id)}
                  title="Todavía no tiene diagnóstico: abre el LAB para pedirlo y ver el ciclo"
                  className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] mt-0.5 text-left"
                >
                  diagnosticar → LAB
                </button>
              )}
              <Evidencia ev={f.evidencia} />
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                disabled={enviando}
                onClick={() => void marcar([f.id])}
                title="Ya me enteré — no lo resuelve"
                className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
              >
                ✓
              </button>
              {ignorar && (
                <button
                  disabled={enviando}
                  onClick={() => void ignorar(f.id)}
                  title="No me interesa — no vuelve a aparecer. Esconde, no resuelve. Reversible."
                  className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
