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
import { Recurrencia, Confirmado, Evidencia } from "./evidencia";

export function TabAhora({ filas, marcarLeidos, investigar, ignorar }: {
  filas: Hallazgo[];
  marcarLeidos: (ids: number[]) => Promise<void>;
  // ⚠️ **EL BOTÓN QUE FALTABA.** La mayoría de estas filas son AVISOS: dicen
  // «Relanzar jobs.interbanking_sync» y no tienen ningún botón, así que el
  // agente termina ahí y el trabajo queda sin dueño. Esto no ejecuta nada —
  // manda a investigar POR QUÉ pasó, que es lo que hoy hace una persona
  // abriendo logs.
  // ⚠️ Sólo se dibuja donde `f.investigable` viene en true — lo decide el
  // BACKEND. Una copia acá de qué se puede investigar serían dos verdades sin
  // árbitro: agregar una investigación no mostraría el botón y sacar una
  // dejaría uno que falla.
  investigar?: (sujeto: string) => void;
  // ⚠️ **«LEÍDO» NO ALCANZA, Y ESA ERA LA MITAD QUE FALTABA.** Marcar leído
  // saca la fila de AHORA y nada más: el detector la vuelve a encontrar en la
  // pasada siguiente y mañana está de nuevo. Para lo que NO se va a hacer
  // —una ON que la mesa no quiere cargar— hace falta silenciar el PROBLEMA
  // (habilidad + sujeto + regla), que es lo que hace `/api/agente/ignorar`.
  // El endpoint y la tabla `agente.silenciados` existían desde el principio;
  // el botón sólo estaba en ENCONTRÓ, así que los avisos —que son la mayoría
  // de AHORA— no tenían forma de callarse. Es reversible.
  ignorar?: (id: number) => Promise<void>;
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
              {f.detalle && (
                <pre className="text-[9px] text-[var(--t-text)] mt-0.5 px-1.5 py-1 border-l-2 border-[var(--t-accent)] bg-[var(--t-surface)] whitespace-pre-wrap break-all font-mono">
                  {f.detalle}
                </pre>
              )}
              {/* ⚠️ **EL TEXTO DEL MODELO, CON EL PISO ATRÁS.**
                  La mayoría de estas filas son AVISOS: no tienen botón, así
                  que el TEXTO es el entregable entero. Escrito a mano en el
                  detector era el mismo para todos los casos de esa regla
                  («mirar qué creció») y devolvía el trabajo al que lee.
                  Ahora lo redacta el modelo con la evidencia adelante y el
                  backend le valida cada número contra los hechos.
                  Si no vino —sin key, sin presupuesto, o el backend lo
                  rechazó— se dibuja el determinista de siempre: la fila NUNCA
                  queda muda. El piso viaja en el `title` para poder comparar
                  los dos sin ocupar pantalla. */}
              <p
                className="text-[9px] text-[var(--t-text-dim)] mt-0.5"
                title={f.ia_texto ? `texto fijo: ${f.que_hacer}` : undefined}
              >
                {f.ia_texto && (
                  <span
                    className="text-[8px] uppercase tracking-widest text-[var(--t-accent)] mr-1"
                    title={`escrito por la IA · ${fechaHora(f.ia_at)}`}
                  >
                    ia
                  </span>
                )}
                {f.ia_texto || f.que_hacer}
              </p>
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
              {investigar && f.investigable && (
                <button
                  onClick={() => investigar(f.sujeto)}
                  title="Averiguar por qué pasó — no ejecuta nada"
                  className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                >
                  🔍
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
