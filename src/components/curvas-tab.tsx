"use client";

import { useMemo, useState } from "react";
import type { BonoCurva, CurvasVista, FairValueDoc, PillDef } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FilterBtn, Panel } from "@/components/ui";
import { CurvasChart, type Curva } from "@/components/curvas-chart";
import { BonosTable } from "@/components/bonos-table";
import { LibroPanel } from "@/components/libro-panel";
import { VentanaFlotante } from "@/components/ventana-flotante";

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

// LIBRO: el TIME & SALES. **No es una pill y no es una asset class** — es una
// herramienta sobre el mismo universo, así que vive a la DERECHA del header, con
// aire, y abre una VENTANA FLOTANTE (`ventana-flotante.tsx`).
//
// Las dos decisiones son del user (2026-08-18) y son la misma:
//   1. pegado a TASA FIJA / CER / TAMAR / BADLAR se leía como un ajuste más;
//   2. al ocupar el panel te TAPABA la tabla y la curva — justo contra lo que
//      uno compara el tape. Flotando, se mira el libro Y la vista entera.
//
// Existía en la tabla vieja (`renta-fija-table`) y se perdió en la migración a
// la tab CURVAS: el componente quedó vivo y sin nadie que lo montara.

interface Props {
  barra?: React.ReactNode;   // las tabs, para que compartan fila con el filtro
  inicial: CurvasVista;
  fairValueInicial?: Record<string, FairValueDoc>;
}

function Columna({
  lado, pills, bonos, pill, setPill, fairValueInicial, libro,
}: {
  lado: "ARS" | "USD";
  pills: PillDef[];
  bonos: BonoCurva[];
  pill: string;
  setPill: (p: string) => void;
  fairValueInicial?: Record<string, FairValueDoc>;
  // El botón del LIBRO, ya armado por el padre (es él quien tiene la ventana).
  // La columna no sabe qué hace: solo dónde va.
  libro?: React.ReactNode;
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
        rightActions={libro}
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
  // que cambiarlo NO le pega al backend.
  //
  // ⚠️ NUNCA queda vacío. Antes "ninguno seleccionado" significaba "todos", y eso
  // hacía que la pantalla contradijera a sus propios controles: con las 4 pills
  // apagadas la tabla igual mostraba 129 bonos. Peor: como en ARS mandan los
  // soberanos y en USD los corporativos, parecía un filtro aplicado al revés.
  // Ahora el último activo no se puede apagar → lo que se ve es SIEMPRE lo que
  // está encendido.
  const [emisores, setEmisores] = useState<string[]>(["soberano"]);
  const [pillArs, setPillArs] = useState("tasa_fija");
  const [pillUsd, setPillUsd] = useState("hard_dolar");
  // Abierto/cerrado NO se persiste (la geometría sí, adentro de la ventana): que
  // la app te abra sola una ventana que no pediste esta vez es peor que tener
  // que clickear de nuevo.
  const [libroAbierto, setLibroAbierto] = useState(false);

  const bonos = useMemo(
    () => data.bonos.filter((b) => emisores.includes(b.emisor_tipo)),
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

  // El universo del LIBRO es el lado ARS ENTERO, no una pill: el tape se busca
  // por TICKER, y cortarlo por ajuste obligaría a saber de antemano si el bono es
  // CER o tasa fija para encontrarlo. Respeta el filtro de EMISOR de arriba, así
  // que con el default (SOBERANO) la lista son exactamente los soberanos ARS.
  //
  // Tres cuidados:
  //   · `lado` y no `moneda`: un dual TAMAR + DOLAR LINKED es ARS pero tiene una
  //     fila de cada lado (mismo criterio que `bonos-table`).
  //   · DEDUPE por instrumento — un dual llega REPETIDO, una fila por pata, y el
  //     selector mostraría el ticker dos veces.
  //   · solo los que tienen `last_price`: sin precio no hubo rueda y el tape
  //     arrancaría vacío. Es el mismo filtro que la tabla vieja hacía con
  //     `flujos` (bonos VIVOS), sin volver a pedir los 240 KB de cronogramas.
  const libroBonos = useMemo(() => {
    const vistos = new Set<string>();
    const out: { instrumento: string; metrics: { last_price?: number; total_nominals?: number } }[] = [];
    for (const b of bonos) {
      if (b.lado !== "ARS" || !b.instrumento) continue;
      if (!b.metrics?.last_price) continue;
      if (vistos.has(b.instrumento)) continue;
      vistos.add(b.instrumento);
      out.push({
        instrumento: b.instrumento,
        metrics: {
          last_price: b.metrics.last_price,
          total_nominals: b.metrics.total_nominals,
        },
      });
    }
    return out;
  }, [bonos]);

  const botonLibro = (
    <FilterBtn
      active={libroAbierto}
      onClick={() => setLibroAbierto((v) => !v)}
      title="Time & Sales intradía por ticker — se abre en una ventana que podés arrastrar"
    >
      LIBRO
      <span className="ml-1 opacity-60">{libroBonos.length}</span>
    </FilterBtn>
  );

  const toggle = (cod: string) =>
    setEmisores((prev) => {
      if (!prev.includes(cod)) return [...prev, cod];
      // Apagar el ÚLTIMO no hace nada: un filtro vacío no tiene lectura honesta
      // (o miente mostrando todo, o deja la pantalla muerta).
      return prev.length === 1 ? prev : prev.filter((x) => x !== cod);
    });

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {/* UNA sola fila: tabs + filtro de emisor. Dos filas de controles le
          comían alto a los datos, que es lo que la vista tiene para dar. */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 text-xs">
        {barra}
        {/* Los SIN CLASIFICAR se sacaron de esta barra (2026-08-16, pedido del
            user): es una pantalla de mercado y ese contador es una tarea de
            mantenimiento. Ya vive donde se acciona — Manager → TÍTULOS · BONOS
            lo muestra en el banner ámbar, con el botón para clasificar cada uno.
            El campo sigue viajando en el payload: se sacó de la vista, no del
            modelo. */}
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
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <Columna
          lado="ARS" pills={pills} bonos={bonos} pill={pillArs} setPill={setPillArs}
          fairValueInicial={fairValueInicial}
          libro={botonLibro}
        />
        <Columna
          lado="USD" pills={pills} bonos={bonos} pill={pillUsd} setPill={setPillUsd}
          fairValueInicial={fairValueInicial}
        />
      </div>

      {/* La ventana se monta FUERA de la grilla (va por portal al body): no le
          saca ancho ni alto a las columnas, que es todo el punto. Se desmonta al
          cerrar, así el poll de trades no sigue corriendo escondido. */}
      {libroAbierto && (
        <VentanaFlotante
          titulo="LIBRO · ARS"
          storageKey="rentaFija.libro.ventana"
          onClose={() => setLibroAbierto(false)}
          anchoInicial={440}
          altoInicial={520}
          sub={
            <span className="text-[10px] text-[var(--t-text-muted)]">
              {libroBonos.length} tickers
            </span>
          }
        >
          <LibroPanel data={libroBonos} />
        </VentanaFlotante>
      )}
    </div>
  );
}
