"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BonoCurva, CurvasVista, FairValueDoc, PillDef } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FilterBtn, Panel } from "@/components/ui";
import { CurvasChart, type Curva } from "@/components/curvas-chart";
import { BonosTable } from "@/components/bonos-table";
import { BonoModal } from "@/components/bono-modal";
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
// Existía en la tabla vieja (borrada 2026-08-30) y se perdió en la migración a
// la tab CURVAS: el componente quedó vivo y sin nadie que lo montara.

// ── FILTRO DE TEA ──────────────────────────────────────────────────────────
//
// Un piso de tasa: "mostrame solo lo que rinde de acá para arriba". Es el corte
// que la pantalla no tenía y que con EMISOR=CORPORATIVO hace falta de verdad —
// 134 ONs no se leen de un saque, pero las que pagan +10% sí.
//
// ⚠️ **Es GLOBAL y las dos escalas NO son comparables.** En ARS las TEA viven
// entre 30% y 60%, en USD entre 5% y 15%. Un mismo "TEA ≥ 5" no filtra NADA a la
// izquierda y sí a la derecha. Es una decisión tomada a conciencia (un solo
// control, arriba, como el de EMISOR), y por eso el botón MUESTRA el número
// activo en vez de guardárselo: el efecto asimétrico tiene que ser visible, no
// una sorpresa cuando una columna se vacía.
//
// Los presets cubren las dos escalas por el mismo motivo.
const PRESETS_TEA = [5, 7, 10, 15, 25, 35, 45, 60];

function FiltroTea({
  valor, setValor, ocultos,
}: {
  valor: number | null;
  setValor: (v: number | null) => void;
  // Cuántos bonos quedaron afuera POR NO TENER tasa comparable (celda vacía o
  // tasa ruido). No es lo mismo que "no llega al piso" y no se puede callar: si
  // un bono desaparece de la tabla, la pantalla tiene que poder decir por qué.
  ocultos: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Click afuera cierra. Sin esto el popover se queda abierto tapando la tabla.
  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const aplicar = (v: number | null) => {
    setValor(v);
    setAbierto(false);
  };

  return (
    <div className="relative" ref={ref}>
      <FilterBtn
        active={valor !== null}
        onClick={() => setAbierto((v) => !v)}
        title={
          valor === null
            ? "Filtrar por tasa: mostrar solo los bonos que rinden de un piso para arriba"
            : `Mostrando solo TEA ≥ ${valor}%${ocultos ? ` — ${ocultos} bono(s) sin tasa comparable quedan afuera` : ""}`
        }
      >
        {valor === null ? "TEA ≥" : `TEA ≥ ${valor}%`}
        {valor !== null && ocultos > 0 && (
          <span className="ml-1 opacity-60" title={`${ocultos} sin tasa comparable`}>
            −{ocultos}
          </span>
        )}
      </FilterBtn>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-[var(--t-panel)] border border-[var(--t-border-2)] p-2 w-[230px] shadow-lg">
          <div className="text-[9px] text-[var(--t-text-muted)] mb-1 leading-snug">
            Piso de TEA. Aplica a las DOS columnas — ojo que en ARS las tasas son
            de otra escala que en USD.
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {PRESETS_TEA.map((v) => (
              <button
                key={v}
                onClick={() => aplicar(v)}
                className={`px-1.5 py-0.5 text-[10px] font-semibold border transition-colors ${
                  valor === v
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseFloat(texto.replace(",", "."));
              // Un input vacío o ilegible QUITA el filtro en vez de dejar la
              // pantalla en un estado que nadie pidió.
              aplicar(Number.isFinite(n) ? n : null);
              setTexto("");
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="otro %"
              className="flex-1 min-w-0 bg-transparent border border-[var(--t-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--t-text-dim)] focus:outline-none focus:border-[var(--t-accent)]"
            />
            <button
              type="submit"
              className="px-1.5 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              OK
            </button>
          </form>
          {valor !== null && (
            <button
              onClick={() => aplicar(null)}
              className="mt-2 w-full px-1.5 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              QUITAR FILTRO
            </button>
          )}
          {valor !== null && ocultos > 0 && (
            <div className="mt-2 text-[9px] text-[var(--t-text-muted)] leading-snug">
              {ocultos} bono(s) quedan afuera por no tener tasa comparable (celda
              vacía o tasa de plazo muy corto). No es que no lleguen al piso: es
              que no se los puede comparar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FILTRO DE EMISOR (por NOMBRE) ──────────────────────────────────────────
//
// El de arriba (SOBERANO / PROVINCIAL / CORPORATIVO / BCRA) es el TIPO de
// emisor. Este es el emisor de verdad: YPF, Pampa, Telecom. Hace falta por lo
// mismo que hizo falta el piso de TEA — con TIPO=CORPORATIVO la tabla son ~134
// ONs de decenas de emisores, y la pregunta que la mesa se hace ahí no es "qué
// hay" sino "qué tiene YPF y a cuánto rinde contra Pampa".
//
// Tres decisiones:
//
//   1. **Agrupa por `emisor_key`, que la manda el BACKEND** (REGLA #9). Si esta
//      pantalla armara la clave con el string, `'YPF '` y `'YPF'` serían dos
//      chips —cada uno contando bien— y el que filtre por uno ve la mitad de
//      los bonos sin que nada falle. La clave es la MISMA con la que la base
//      resuelve la industria del emisor.
//   2. **Las opciones salen de lo que el TIPO ya dejó pasar**, no del universo:
//      un select con 67 emisores cuando estás mirando soberanos es ruido, y los
//      contadores contradirían a la tabla.
//   3. **Vacío = TODOS.** Acá sí (al revés que el filtro de TIPO, donde "nada
//      seleccionado" mentía mostrando todo): el botón DICE cuántos hay activos,
//      así que el estado se lee sin abrir el popover.
//
// Los bonos SIN emisor cargado no se esconden: son su propio grupo. Un bono que
// desaparece de una lista no se nota.
const SIN_EMISOR = "";   // la clave del grupo "(SIN EMISOR)" — `emisor_key` null

// ⚠️ **El backend puede todavía no mandar `emisor_key`.** El front va a Vercel
// solo y el backend se sube a mano, SIEMPRE después: entre un deploy y el otro,
// `emisor_key` no viene y sin esta caída TODOS los bonos irían al grupo
// "(SIN EMISOR)" — un filtro con una sola opción, roto sin decirlo. Se deriva
// del nombre con la MISMA regla (`upper` + espacios colapsados) y, en cuanto el
// campo llega, manda el backend: es UNA regla con dos implementaciones que dan
// lo mismo, no dos criterios.
function claveEmisor(b: BonoCurva): string {
  if (b.emisor_key !== undefined) return b.emisor_key ?? SIN_EMISOR;
  return (b.emisor ?? "").split(/\s+/).filter(Boolean).join(" ").toUpperCase();
}

interface OpcionEmisor {
  key:   string;    // "" = sin emisor cargado
  label: string;
  n:     number;    // BONOS, no filas (un dual llega repetido, una fila por pata)
}

function FiltroEmisor({
  opciones, seleccion, setSeleccion,
}: {
  opciones: OpcionEmisor[];
  seleccion: string[];
  setSeleccion: (v: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Click afuera / Esc cierran — igual que el filtro de TEA.
  useEffect(() => {
    if (!abierto) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const q = busca.trim().toUpperCase();
  const visibles = q ? opciones.filter((o) => o.label.toUpperCase().includes(q)) : opciones;

  const toggle = (k: string) =>
    setSeleccion(
      seleccion.includes(k) ? seleccion.filter((x) => x !== k) : [...seleccion, k],
    );

  // El botón dice el ESTADO sin abrirlo: un emisor por su nombre, varios por su
  // número. Sin eso, "vacío = todos" sería indistinguible de un filtro puesto.
  const etiqueta =
    seleccion.length === 0 ? "EMISOR"
      : seleccion.length === 1
        ? `EMISOR · ${opciones.find((o) => o.key === seleccion[0])?.label ?? "?"}`
        : `EMISOR · ${seleccion.length}`;

  return (
    <div className="relative" ref={ref}>
      <FilterBtn
        active={seleccion.length > 0}
        onClick={() => setAbierto((v) => !v)}
        title={
          seleccion.length === 0
            ? `Filtrar por emisor — ${opciones.length} en lo que estás mirando`
            : `Mostrando solo ${seleccion.length} emisor(es)`
        }
      >
        {etiqueta}
        {seleccion.length === 0 && (
          <span className="ml-1 opacity-60">{opciones.length}</span>
        )}
      </FilterBtn>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-[var(--t-panel)] border border-[var(--t-border-2)] p-2 w-[260px] shadow-lg">
          <div className="text-[9px] text-[var(--t-text-muted)] mb-1 leading-snug">
            Emisores de lo que el filtro de TIPO dejó pasar. Sin ninguno tildado
            se ven todos.
          </div>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar emisor"
            className="w-full bg-transparent border border-[var(--t-border-2)] px-1.5 py-0.5 mb-1 text-[10px] text-[var(--t-text-dim)] focus:outline-none focus:border-[var(--t-accent)]"
          />
          <div className="max-h-[260px] overflow-y-auto">
            {visibles.length === 0 && (
              <div className="text-[10px] text-[var(--t-text-muted)] px-1 py-2">
                nada que coincida
              </div>
            )}
            {visibles.map((o) => {
              const on = seleccion.includes(o.key);
              return (
                <button
                  key={o.key || "__sin__"}
                  onClick={() => toggle(o.key)}
                  className={`w-full flex items-center justify-between gap-2 px-1.5 py-0.5 text-[10px] text-left transition-colors ${
                    on
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
                  }`}
                  title={o.label}
                >
                  <span className="truncate">{on ? "✓ " : ""}{o.label}</span>
                  <span className="opacity-60 shrink-0">{o.n}</span>
                </button>
              );
            })}
          </div>
          {seleccion.length > 0 && (
            <button
              onClick={() => setSeleccion([])}
              className="mt-2 w-full px-1.5 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            >
              QUITAR FILTRO
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  barra?: React.ReactNode;   // las tabs, para que compartan fila con el filtro
  inicial: CurvasVista;
  fairValueInicial?: Record<string, FairValueDoc>;
}

function Columna({
  lado, pills, bonos, pill, setPill, fairValueInicial, libro, onSelect,
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
  // Click en una fila → la ficha del bono. El modal lo monta el PADRE (una sola
  // vez, fuera de las dos columnas): dos modales montados en paralelo es cómo
  // nacen los "se abrió el bono equivocado".
  onSelect?: (tickerCorto: string) => void;
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
        <BonosTable bonos={filas} onSelect={onSelect} />
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
  // Los emisores por NOMBRE (las CLAVES, no los nombres — ver `FiltroEmisor`).
  // Vacío = todos, y acá eso NO es ambiguo: el botón dice cuántos hay activos.
  // Tampoco se persiste, por lo mismo que el piso de TEA.
  const [emisorSel, setEmisorSel] = useState<string[]>([]);
  const [pillArs, setPillArs] = useState("tasa_fija");
  const [pillUsd, setPillUsd] = useState("hard_dolar");
  // Abierto/cerrado NO se persiste (la geometría sí, adentro de la ventana): que
  // la app te abra sola una ventana que no pediste esta vez es peor que tener
  // que clickear de nuevo.
  const [libroAbierto, setLibroAbierto] = useState(false);
  // Piso de TEA (en %, no en fracción — es lo que el usuario escribe). `null` =
  // sin filtro. NO se persiste a propósito: un filtro que esconde bonos y
  // sobrevive a la navegación es una pantalla que miente al que vuelve a ella.
  const [teaMin, setTeaMin] = useState<number | null>(null);
  // El bono cuya ficha está abierta (`null` = ninguna). Es el CORTO.
  const [fichaDe, setFichaDe] = useState<string | null>(null);

  // El orden es TIPO → EMISOR → TEA, el mismo en que se leen de izquierda a
  // derecha: cada uno corta sobre lo que el anterior dejó pasar. Así el contador
  // de "sin tasa comparable" habla de lo que el usuario está mirando y no del
  // universo entero.
  const delTipo = useMemo(
    () => data.bonos.filter((b) => emisores.includes(b.emisor_tipo)),
    [data.bonos, emisores],
  );

  // El catálogo del filtro de emisor: lo que hay EN LO QUE SE ESTÁ MIRANDO.
  //
  // ⚠️ Cuenta BONOS, no filas — un dual llega REPETIDO (una fila por pata) y sin
  // el dedupe el chip diría 4 donde hay 3, que es el mismo cuidado que el
  // backend ya tiene con el contador por tipo de emisor.
  const opcionesEmisor = useMemo<OpcionEmisor[]>(() => {
    const grupos = new Map<string, { label: string; tickers: Set<string> }>();
    for (const b of delTipo) {
      const key = claveEmisor(b);
      const g = grupos.get(key) ?? {
        // El NOMBRE que se muestra es el del bono; la CLAVE es la que agrupa.
        // Si dos filas del mismo emisor lo escriben distinto, se muestra la
        // primera — la clave ya garantizó que sean UN solo grupo, que es lo
        // único que cambia lo que el filtro devuelve.
        label: key === SIN_EMISOR ? "(SIN EMISOR)" : (b.emisor ?? key).trim(),
        tickers: new Set<string>(),
      };
      g.tickers.add(b.ticker_corto);
      grupos.set(key, g);
    }
    return [...grupos.entries()]
      .map(([key, g]) => ({ key, label: g.label, n: g.tickers.size }))
      // Por cantidad primero: con CORPORATIVO el que tiene 8 bonos es el que se
      // busca, y alfabético lo dejaría entre 60 emisores de un bono.
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [delTipo]);

  const delEmisor = useMemo(
    () => (emisorSel.length === 0
      ? delTipo
      : delTipo.filter((b) => emisorSel.includes(claveEmisor(b)))),
    [delTipo, emisorSel],
  );

  // ⚠️ Un bono SIN TEA no puede cumplir "TEA ≥ 5", así que sale — pero eso es
  // MUY distinto de no llegar al piso, y esta pantalla no puede tapar la
  // diferencia: se cuentan aparte y el botón los muestra.
  //
  // La TASA RUIDO entra en la misma bolsa: con duration ~0 el número existe pero
  // es un artefacto de anualizar pocos días (una ON a 3 días marcaba 142%). Un
  // piso de tasa lo dejaría pasar SIEMPRE y arriba de todo, que es exactamente al
  // revés de para qué sirve el filtro. Es el mismo criterio con el que el
  // gráfico ya lo excluye — y lo decide el backend (`tasa_ruido`), no acá.
  const { bonos, sinTasa } = useMemo(() => {
    if (teaMin === null) return { bonos: delEmisor, sinTasa: 0 };
    const piso = teaMin / 100;
    const out: BonoCurva[] = [];
    const fuera = new Set<string>();
    for (const b of delEmisor) {
      const tea = b.metrics?.TEA;
      if (tea === undefined || tea === null || b.tasa_ruido) {
        fuera.add(b.ticker_corto);
        continue;
      }
      if (tea >= piso) out.push(b);
    }
    return { bonos: out, sinTasa: fuera.size };
  }, [delEmisor, teaMin]);

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
  // CER o tasa fija para encontrarlo. Respeta los filtros de arriba (TIPO,
  // EMISOR y TEA), así que con el default (SOBERANO, sin emisor tildado) la
  // lista son exactamente los soberanos ARS.
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

  const toggle = (cod: string) => {
    const proximos = !emisores.includes(cod)
      ? [...emisores, cod]
      // Apagar el ÚLTIMO no hace nada: un filtro vacío no tiene lectura honesta
      // (o miente mostrando todo, o deja la pantalla muerta).
      : emisores.length === 1 ? emisores : emisores.filter((x) => x !== cod);
    if (proximos === emisores) return;
    setEmisores(proximos);
    // Y se SUELTAN los emisores tildados que el nuevo TIPO ya no muestra. Sin
    // esto, sacar CORPORATIVO dejaba "EMISOR · YPF" encendido sobre una tabla
    // de soberanos: cero filas y ningún control que lo explique. Se poda acá
    // —en el evento— y no derivando en el render, para que un emisor tildado
    // siga aplicándose aunque un día el bono no venga en el payload: la tabla
    // vacía con el botón encendido dice la verdad; mostrarlo todo, no.
    const vivas = new Set(
      data.bonos.filter((b) => proximos.includes(b.emisor_tipo))
                .map(claveEmisor),
    );
    setEmisorSel((prev) => prev.filter((k) => vivas.has(k)));
  };

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
        {/* TIPO, no EMISOR: estas 4 pills son el TIPO de emisor
            (`emisor_tipo`) y al lado ahora vive el filtro por emisor de verdad.
            Dos controles llamados igual es cómo se termina filtrando por uno
            creyendo que se filtró por el otro. */}
        <span className="text-[var(--t-text-2)] ml-1">TIPO</span>
        {data.emisores.map((e) => (
          <FilterBtn
            key={e.codigo}
            active={emisores.includes(e.codigo)}
            onClick={() => toggle(e.codigo)}
          >
            {e.label} <span className="ml-1 opacity-60">{e.n}</span>
          </FilterBtn>
        ))}
        {/* A la DERECHA del todo, en el orden en que cortan: el emisor sobre lo
            que el TIPO dejó pasar, y el piso de tasa sobre lo que dejó el
            emisor. Se lee de izquierda a derecha. */}
        <div className="ml-auto flex items-center gap-2">
          <FiltroEmisor
            opciones={opcionesEmisor}
            seleccion={emisorSel}
            setSeleccion={setEmisorSel}
          />
          <FiltroTea valor={teaMin} setValor={setTeaMin} ocultos={sinTasa} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <Columna
          lado="ARS" pills={pills} bonos={bonos} pill={pillArs} setPill={setPillArs}
          fairValueInicial={fairValueInicial}
          libro={botonLibro}
          onSelect={setFichaDe}
        />
        <Columna
          lado="USD" pills={pills} bonos={bonos} pill={pillUsd} setPill={setPillUsd}
          fairValueInicial={fairValueInicial}
          onSelect={setFichaDe}
        />
      </div>

      {/* La FICHA del bono. Se monta acá, una sola vez para las dos columnas, y
          se desmonta al cerrar: así no queda un fetch corriendo escondido. */}
      {fichaDe && <BonoModal ticker={fichaDe} onClose={() => setFichaDe(null)} />}

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
