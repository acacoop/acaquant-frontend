"use client";

import { SensibilidadTable } from "./sensibilidad-table";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView } from "./comparar-inversion-view";
import { Panel } from "./panel";

// ESTRATEGIA — vista partida 50/50.
//   Izquierda  : Comparar Inversión (selección + tabs Comparación/Flujo).
//   Derecha    : arriba Análisis de Sensibilidad; abajo-izq Descomposición de
//                Retorno; abajo-der queda reservado para una herramienta futura.
// Cada panel se expande a pantalla completa con el botón ⤢ (Escape cierra).
export function RetornoTotalView() {
  return (
    <div className="h-full min-h-0 grid grid-cols-2 gap-3 p-3">
      {/* Izquierda — Comparar Inversión (alto completo) */}
      <Panel title="Comparar Inversión" fill expandable>
        <CompararInversionView />
      </Panel>

      {/* Derecha — Sensibilidad (arriba) + Descomposición/Próximamente (abajo) */}
      <div className="grid grid-rows-2 gap-3 min-h-0">
        <Panel title="Análisis de Sensibilidad" fill expandable>
          <SensibilidadTable compact />
        </Panel>
        <div className="grid grid-cols-2 gap-3 min-h-0">
          <Panel title="Descomposición de Retorno" fill expandable>
            <DescomposicionTab />
          </Panel>
          <Panel title="Próximamente">
            <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px] italic">
              Próximamente
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
