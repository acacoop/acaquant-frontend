"use client";

import { useState } from "react";
import type { ForwardDoc, ForwardZscoreDoc } from "@/lib/types";
import { FilterBtn, Panel } from "@/components/ui";
import { ForwardsPanel, type Curva, type Modo } from "@/components/forwards-panel";
import { ResearchForwards } from "@/components/research-forwards";

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
//
// El título aclara "por duration" porque el eje de la matriz NO es el
// vencimiento: el forward usa la duration como plazo efectivo. En bullets las
// dos casi coinciden y la matriz luce cronológica, pero en CER (cupones +
// amortización) no, y sin el rótulo la matriz parece desordenada cuando está
// bien. Ver el comentario en `engines/forwards.py::calcular`.

interface Props {
  forwards: ForwardDoc[];
  zscoreInicial?: ForwardZscoreDoc[];
}

const COLUMNAS: { curva: Curva; titulo: string }[] = [
  { curva: "tasa_fija", titulo: "TASA FIJA" },
  { curva: "cer", titulo: "CER" },
];

export function ForwardsTab({ forwards, zscoreInicial }: Props) {
  // El modo de cada matriz (LIVE / Z-SCORE) vive acá para poder renderizarlo en
  // la BARRA DE TÍTULO del panel: los controles dejan de comerle una fila al
  // contenido. GRÁFICO ya no es un modo de la matriz — tiene su panel propio.
  const [modo, setModo] = useState<Record<string, Modo>>({
    tasa_fija: "live", cer: "live",
  });

  return (
    <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
      {COLUMNAS.map(({ curva, titulo }) => (
        <div
          key={curva}
          className="min-w-0 min-h-0 grid grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3"
        >
          {/* 3fr / 2fr = 60% / 40% del alto de la columna */}
          <Panel
            title={`MATRIZ ${titulo} · por duration`}
            expandable
            actions={(["live", "zscore"] as Modo[]).map((m) => (
              <FilterBtn
                key={m}
                active={modo[curva] === m}
                onClick={() => setModo((p) => ({ ...p, [curva]: m }))}
              >
                {m === "live" ? "LIVE" : "Z-SCORE"}
              </FilterBtn>
            ))}
          >
            <ForwardsPanel
              forwards={forwards}
              zscoreInicial={zscoreInicial}
              curvaFija={curva}
              modoFijo={modo[curva]}
              sinGrafico
            />
          </Panel>
          <Panel title={`HISTÓRICO DE PARES ${titulo}`} fill expandable>
            {/* El MISMO componente que estaba en Research: se movió, no se
                duplicó. Trae su propio fetch filtrado por curva y rango. */}
            <ResearchForwards curvaFija={curva} />
          </Panel>
        </div>
      ))}
    </div>
  );
}
