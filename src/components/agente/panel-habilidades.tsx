"use client";

// EL PANEL DE HABILIDADES — a la derecha, SIEMPRE visible.
//
// Pedido del user (2026-08-24): *«tenemos que agregar acá en la punta derecha
// un listado de todas las skills, y cada skill tiene que tener la última hora
// que se ejecutó»*.
//
// ⚠️ **«Cuándo miró» es el único dato del agente que NO se puede derivar.** Una
// corrida que no encontró nada no deja rastro en los hallazgos, así que sin
// esta columna «miré y estaba todo bien» y «no corrí» se ven idénticos — que es
// el bug estructural del agente viejo y la razón por la que la tabla de
// habilidades existe.
//
// Por eso el panel va al lado de las listas y no escondido en una tab: mirar
// «ENCONTRÓ 0» sin ver que cuatro habilidades no corrieron es leer un verde que
// no significa nada.
import { fechaHora, type Habilidad } from "@/components/agente/tipos";

// CUATRO estados, no dos. La distinción que el agente viejo no hacía.
const ESTADO: Record<string, { color: string; txt: string }> = {
  ok: { color: "var(--t-pos)", txt: "miró y guardó lo que vio" },
  sin_datos: { color: "var(--t-accent)", txt: "NO PUDO MIRAR — no cerró nada" },
  error: { color: "var(--t-neg)", txt: "reventó — no cerró nada" },
};
const NUNCA = { color: "var(--t-text-dim)", txt: "todavía no le tocó" };

export function PanelHabilidades({ habilidades }: { habilidades: Habilidad[] }) {
  const orden = [...habilidades].sort((a, b) => {
    // Lo que NO pudo mirar va arriba: es una advertencia sobre el AGENTE, no
    // sobre el sistema, y es la que nadie sale a buscar.
    const peso = (h: Habilidad) =>
      h.ultimo_resultado === "error" ? 0
      : h.ultimo_resultado === "sin_datos" ? 1
      : h.ultima_corrida_at ? 3 : 2;
    return peso(a) - peso(b) || a.nombre.localeCompare(b.nombre);
  });
  const ciegas = orden.filter((h) =>
    h.ultimo_resultado === "error" || h.ultimo_resultado === "sin_datos").length;

  return (
    <aside className="w-full lg:w-72 shrink-0 lg:border-l border-[var(--t-border)] lg:pl-3">
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          habilidades
        </h3>
        <span className="text-[9px] tabular-nums text-[var(--t-text-muted)]">
          {habilidades.length}
        </span>
        {ciegas > 0 && (
          <span className="text-[9px] text-[var(--t-neg)]" title="no pudieron mirar">
            ⚠ {ciegas} sin ver
          </span>
        )}
      </div>
      <p className="text-[8px] text-[var(--t-text-dim)] mb-1.5 leading-tight">
        «corrió y no encontró nada» y «no corrió» <b>no son lo mismo</b>.
      </p>

      <div className="flex flex-col divide-y divide-[var(--t-border)] border border-[var(--t-border)]">
        {orden.map((h) => {
          const e = h.ultima_corrida_at
            ? (ESTADO[h.ultimo_resultado ?? ""] ?? NUNCA)
            : NUNCA;
          return (
            <div key={h.nombre} className="px-1.5 py-1"
                 title={`${h.que_mira}\n\n${e.txt}${h.ultimo_error ? `\n\n${h.ultimo_error}` : ""}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="w-1 h-1 rounded-full shrink-0"
                      style={{ background: e.color }} />
                <span className="text-[10px] text-[var(--t-text)] truncate flex-1 min-w-0">
                  {h.nombre}
                </span>
                {h.hallazgos_abiertos > 0 && (
                  <span className="text-[9px] tabular-nums text-[var(--t-accent)]">
                    {h.hallazgos_abiertos}
                  </span>
                )}
                {h.reincidencias > 0 && (
                  <span className="text-[9px] tabular-nums text-[var(--t-neg)]"
                        title="volvió después de arreglarse">
                    ⚠{h.reincidencias}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 pl-2.5">
                {/* LA HORA. Es lo que el user pidió y lo único que no se
                    puede derivar de ninguna otra tabla. */}
                <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
                  {h.ultima_corrida_at ? fechaHora(h.ultima_corrida_at) : "nunca"}
                </span>
                <span className="text-[8px] text-[var(--t-text-dim)] truncate">
                  {h.clase === "trabajo" ? "arregla" : "avisa"}
                  {h.ventana !== "siempre" ? ` · ${h.ventana}` : ""}
                </span>
                {h.corridas_hoy > 0 && (
                  <span className="text-[8px] tabular-nums text-[var(--t-text-dim)] ml-auto"
                        title="corridas hoy">
                    ×{h.corridas_hoy}
                  </span>
                )}
              </div>
              {h.ultimo_error && (
                <p className="text-[8px] text-[var(--t-neg)] pl-2.5 truncate">
                  {h.ultimo_error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
