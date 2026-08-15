"use client";

import { useMemo, useState } from "react";
import type { FairValueDoc, FlujoTicker, ForwardDoc } from "@/lib/types";
import type { BonoCurva, CurvasVista, PillDef } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FilterBtn, Panel } from "@/components/ui";
import { CurvasChart, type Curva } from "@/components/curvas-chart";
import { BonosTable } from "@/components/bonos-table";

// Tab CURVAS del rediseño (docs/RENTA_FIJA.md §0, paso 3b).
//
// La MONEDA deja de ser una pill y pasa a ser el LAYOUT: izquierda ARS, derecha
// USD. Adentro de cada lado, el AJUSTE es la pill — y cada columna tiene la suya
// INDEPENDIENTE, así se puede mirar CER a la izquierda y HARD DOLAR a la derecha
// al mismo tiempo, que es lo que la vista de una sola tabla no dejaba hacer.
//
// Todo sale de UN endpoint (`/api/cotizaciones/curvas-vista`) con los bonos ya
// clasificados server-side. La vista vieja pedía 4 endpoints y clasificaba en el
// navegador con un mapa armado a partir de los cronogramas completos de los 222
// bonos (240 KB para usar 5 campos).
const POLL_MS = 5_000;

// La pill de acá → la curva que el chart sabe pedirle al backend. `tamar` existe
// en `_CURVAS_VALIDAS`; `duales` todavía NO es una curva del backend (los duales
// viven repartidos en cer/tamar hasta que se les dé la suya), así que ese lado
// muestra la tabla y avisa en vez de dibujar un gráfico vacío.
const PILL_A_CURVA: Record<string, Curva | null> = {
  tasa_fija: "tasa_fija",
  cer: "cer",
  hard_dolar: "soberanos",
  dolar_linked: "dolar_linked",
  tamar: null,
  duales: null,
};

interface Props {
  inicial: CurvasVista;
  forwards: ForwardDoc[];
  flujos: FlujoTicker[];
  fairValueInicial?: Record<string, FairValueDoc>;
}

function Columna({
  lado, pills, bonos, pill, setPill, forwards, flujos, fairValueInicial,
}: {
  lado: "ARS" | "USD";
  pills: PillDef[];
  bonos: BonoCurva[];
  pill: string;
  setPill: (p: string) => void;
  forwards: ForwardDoc[];
  flujos: FlujoTicker[];
  fairValueInicial?: Record<string, FairValueDoc>;
}) {
  const delLado = pills.filter((p) => p.lado === lado);
  const filas = bonos.filter((b) => b.pill === pill);
  const curva = PILL_A_CURVA[pill] ?? null;

  return (
    <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
      <Panel title={lado} count={filas.length} expandable>
        <div className="h-full flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
            {delLado.map((p) => (
              <FilterBtn
                key={p.codigo}
                active={pill === p.codigo}
                onClick={() => setPill(p.codigo)}
              >
                {p.display}
                {/* el contador va en la pill: se ve de una si una curva quedó
                    vacía, que es justo lo que antes no se notaba */}
                <span className="ml-1 opacity-60">{p.n}</span>
              </FilterBtn>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <BonosTable bonos={filas} />
          </div>
        </div>
      </Panel>

      <Panel title={`CURVA ${lado}`} fill expandable>
        {curva ? (
          <CurvasChart
            forwards={forwards}
            flujos={flujos}
            fairValueInicial={fairValueInicial}
            curvaFija={curva}
            sinPills
          />
        ) : (
          <div className="h-full flex items-center justify-center text-center px-4
                          text-[var(--t-text-2)] text-xs">
            La curva de <b className="mx-1">{pill.toUpperCase()}</b> todavía no
            existe en el backend — la tabla de arriba sí está completa.
          </div>
        )}
      </Panel>
    </div>
  );
}

export function CurvasTab({ inicial, forwards, flujos, fairValueInicial }: Props) {
  const { data } = usePoll<CurvasVista>(
    "/api/cotizaciones/curvas-vista", inicial, POLL_MS,
  );

  // Filtro de EMISOR: client-side a propósito. El emisor viaja en cada bono, así
  // que cambiarlo NO le pega al backend. Vacío = todos (decisión del user al
  // eliminar la vista de ONs: los corporativos se ven de entrada).
  const [emisores, setEmisores] = useState<string[]>([]);
  const [pillArs, setPillArs] = useState("tasa_fija");
  const [pillUsd, setPillUsd] = useState("hard_dolar");

  const bonos = useMemo(
    () => (emisores.length === 0
      ? data.bonos
      : data.bonos.filter((b) => emisores.includes(b.emisor_tipo))),
    [data.bonos, emisores],
  );

  // Los contadores de las pills tienen que reflejar el filtro de emisor: si no,
  // una pill diría 129 y la tabla mostraría 21.
  const pills = useMemo<PillDef[]>(
    () => data.pills.map((p) => ({
      ...p, n: bonos.filter((b) => b.pill === p.codigo).length,
    })),
    [data.pills, bonos],
  );

  const toggle = (cod: string) =>
    setEmisores((prev) =>
      prev.includes(cod) ? prev.filter((x) => x !== cod) : [...prev, cod]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap shrink-0 text-xs">
        <span className="text-[var(--t-text-2)]">EMISOR</span>
        <FilterBtn active={emisores.length === 0} onClick={() => setEmisores([])}>
          TODOS <span className="ml-1 opacity-60">{data.bonos.length}</span>
        </FilterBtn>
        {data.emisores.map((e) => (
          <FilterBtn
            key={e.codigo}
            active={emisores.includes(e.codigo)}
            onClick={() => toggle(e.codigo)}
          >
            {e.label} <span className="ml-1 opacity-60">{e.n}</span>
          </FilterBtn>
        ))}
        {data.sin_clasificar.length > 0 && (
          <span
            className="ml-auto text-[var(--t-text-2)]"
            title={data.sin_clasificar.join(", ")}
          >
            {data.sin_clasificar.length} sin clasificar
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <Columna
          lado="ARS" pills={pills} bonos={bonos} pill={pillArs} setPill={setPillArs}
          forwards={forwards} flujos={flujos} fairValueInicial={fairValueInicial}
        />
        <Columna
          lado="USD" pills={pills} bonos={bonos} pill={pillUsd} setPill={setPillUsd}
          forwards={forwards} flujos={flujos} fairValueInicial={fairValueInicial}
        />
      </div>
    </div>
  );
}
