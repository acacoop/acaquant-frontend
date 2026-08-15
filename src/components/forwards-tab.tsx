"use client";

import type { ForwardDoc, ForwardHistDoc, ForwardZscoreDoc } from "@/lib/types";
import { Panel } from "@/components/ui";
import { ForwardsPanel, type Curva } from "@/components/forwards-panel";

// Tab FORWARDS del rediseño (docs/RENTA_FIJA.md §0, paso 4).
//
// Antes era UN panel donde la curva y el modo competían por el mismo espacio:
// para ver la matriz de CER había que dejar de ver la de tasa fija, y para ver
// el histórico de un par había que dejar de ver la matriz. Ahora las dos
// dimensiones se abren en ejes distintos:
//
//   COLUMNA = curva  (izquierda TASA FIJA · derecha CER)
//   FILA    = qué se muestra  (arriba la MATRIZ · abajo el GRÁFICO de pares)
//
// Son las "4 tablas" que pidió el user: 2 matrices + 2 gráficos, cada matriz con
// su histórico debajo. Las matrices se llevan el 60% del alto y los gráficos el
// 40%, que es la proporción que pidió — la matriz es densa y necesita el aire.
//
// No hay componente nuevo: son cuatro instancias del MISMO `ForwardsPanel` con
// la curva y el modo fijados. Cualquier arreglo en la matriz o en el gráfico
// sigue estando en un solo lugar.

interface Props {
  forwards: ForwardDoc[];
  historico?: ForwardHistDoc[];
  zscoreInicial?: ForwardZscoreDoc[];
}

const COLUMNAS: { curva: Curva; titulo: string }[] = [
  { curva: "tasa_fija", titulo: "TASA FIJA" },
  { curva: "cer", titulo: "CER" },
];

export function ForwardsTab({ forwards, historico, zscoreInicial }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
      {COLUMNAS.map(({ curva, titulo }) => (
        <div
          key={curva}
          className="min-w-0 min-h-0 grid grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3"
        >
          {/* 3fr / 2fr = 60% / 40% del alto de la columna */}
          <Panel title={`MATRIZ ${titulo}`} expandable>
            <ForwardsPanel
              forwards={forwards}
              historico={historico}
              zscoreInicial={zscoreInicial}
              curvaFija={curva}
            />
          </Panel>
          <Panel title={`HISTÓRICO DE PARES ${titulo}`} fill expandable>
            <ForwardsPanel
              forwards={forwards}
              historico={historico}
              zscoreInicial={zscoreInicial}
              curvaFija={curva}
              modoFijo="grafico"
            />
          </Panel>
        </div>
      ))}
    </div>
  );
}
