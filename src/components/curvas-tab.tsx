"use client";

import { useMemo, useState } from "react";
import type { BonoCurva, CurvasVista, FairValueDoc, PillDef } from "@/lib/types";
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

// La pill de acá → la curva que el chart le pide al backend. Las 6 tienen la
// suya: `dual` no existe como `curva` en el master (los duales viven bajo
// cer/tamar) y se resuelve por el EJE `ajuste`.
const PILL_A_CURVA: Record<string, Curva> = {
  tasa_fija: "tasa_fija",
  cer: "cer",
  hard_dolar: "soberanos",
  dolar_linked: "dolar_linked",
  tamar: "tamar",
  duales: "dual",   // los duales se resuelven por el EJE `ajuste` en el backend
};

interface Props {
  barra?: React.ReactNode;   // las tabs, para que compartan fila con el filtro
  inicial: CurvasVista;
  fairValueInicial?: Record<string, FairValueDoc>;
}

function Columna({
  lado, pills, bonos, pill, setPill, fairValueInicial,
}: {
  lado: "ARS" | "USD";
  pills: PillDef[];
  bonos: BonoCurva[];
  pill: string;
  setPill: (p: string) => void;
  fairValueInicial?: Record<string, FairValueDoc>;
}) {
  const delLado = pills.filter((p) => p.lado === lado);
  const filas = bonos.filter((b) => b.pill === pill);
  const curva = PILL_A_CURVA[pill];

  return (
    <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
      {/* Las pills viven en la BARRA DE TÍTULO: una fila menos de controles es
          una fila más de bonos, y la tabla es lo que la vista da. */}
      <Panel
        title={lado}
        count={filas.length}
        expandable
        actions={delLado.map((p) => (
          <FilterBtn
            key={p.codigo}
            active={pill === p.codigo}
            onClick={() => setPill(p.codigo)}
          >
            {p.display}
            <span className="ml-1 opacity-60">{p.n}</span>
          </FilterBtn>
        ))}
      >
        <BonosTable bonos={filas} />
      </Panel>

      <Panel title={`CURVA ${lado}`} fill expandable>
        <CurvasChart
          bonos={filas}
          fairValueInicial={fairValueInicial}
          curvaFija={curva}
          sinPills
        />
      </Panel>
    </div>
  );
}

export function CurvasTab({ barra, inicial, fairValueInicial }: Props) {
  const { data } = usePoll<CurvasVista>(
    "/api/cotizaciones/curvas-vista", inicial, POLL_MS,
  );

  // Filtro de EMISOR: client-side a propósito. El emisor viaja en cada bono, así
  // que cambiarlo NO le pega al backend. Vacío = todos (decisión del user al
  // eliminar la vista de ONs: los corporativos se ven de entrada).
  const [emisores, setEmisores] = useState<string[]>(["soberano"]);
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
      {/* UNA sola fila: tabs + filtro de emisor. Dos filas de controles le
          comían alto a los datos, que es lo que la vista tiene para dar. */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 text-xs">
        {barra}
        <span className="text-[var(--t-text-2)] ml-1">EMISOR</span>
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
          fairValueInicial={fairValueInicial}
        />
        <Columna
          lado="USD" pills={pills} bonos={bonos} pill={pillUsd} setPill={setPillUsd}
          fairValueInicial={fairValueInicial}
        />
      </div>
    </div>
  );
}
