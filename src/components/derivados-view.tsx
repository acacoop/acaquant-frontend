"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, fmtHoraAR, shortTicker } from "./ui";
import { OpcionesTableCompact } from "./opciones-table-compact";
import { EstrategiasTabla } from "./estrategias-tabla";
import { PayoffChart } from "./payoff-chart";
import { EscenariosTabla } from "./escenarios-tabla";
import { CostoHistoricoChart } from "./costo-historico-chart";
import { OpcionHistoricoChart } from "./opcion-historico-chart";
import { GriegasHistoricoChart } from "./griegas-historico-chart";
import { medir } from "@/lib/perf";
import { usePoll } from "@/lib/use-poll";
import {
  buildPorStrike,
  calcularEstrategias,
  type EstrategiaRow,
  type OpcionDoc,
} from "@/lib/estrategias";

// Intervalo de polling para la chain de opciones. El motor de opciones
// replacea el snapshot cada 1 s, pero la pantalla la usa muy poca gente
// y cada poll es una invocación serverless en Vercel — bajamos a 30 s
// para reducir 6× la carga sin perder utilidad práctica (las opciones
// no son trade activo en la mesa).
const POLL_OPCIONES_MS = 30_000;

interface Meta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

type DetalleTab = "payoff" | "escenarios";
// Filtro de la tabla OPCIONES GGAL: chain CALL/PUT o la tabla de estrategias.
type TablaVista = "CALL" | "PUT" | "ESTRATEGIAS";

export function DerivadosView({
  docs: initialDocs,
  metaInicial,
  isAdmin = false,
}: {
  docs: OpcionDoc[];
  metaInicial: Meta;
  isAdmin?: boolean;
}) {
  // Polling live de la chain de opciones. Antes el SSR de /derivados/page.tsx
  // hacía el fetch inicial — lo sacamos para que Vercel no compute opciones
  // si el user solo va a ver agro. fetchOnMount=true compensa el initial
  // vacío para que la pantalla cargue al primer render.
  const { data: docs, lastAt: atDocs } = usePoll<OpcionDoc[]>(
    "/api/cotizaciones/opciones",
    initialDocs,
    POLL_OPCIONES_MS,
    { fetchOnMount: true },
  );

  const [meta, setMeta] = useState<Meta>(metaInicial);
  const [tasaInput, setTasaInput] = useState(metaInicial.tasa.toFixed(3));
  const [savingTasa, setSavingTasa] = useState(false);

  const [strike, setStrike] = useState<number | null>(null);
  const [categoria, setCategoria] = useState("Cono / Cuna");
  // Dos selecciones independientes: la estrategia (índice en `rows`, default
  // ATM) y el contrato (por instrumento, así sigue vivo con cada poll). La
  // columna derecha muestra una u otra según la tab de la tabla: CALL/PUT →
  // contrato (costo hist. + griegas); ESTRAT. → estrategia (payoff/escenarios
  // + costo hist.). Por default la vista es la chain, o sea el contrato.
  const [selected, setSelected] = useState<number>(0);
  const [selectedInstrumento, setSelectedInstrumento] = useState<string | null>(null);
  const [detalleTab, setDetalleTab] = useState<DetalleTab>("payoff");
  // Filtro de la tabla OPCIONES GGAL (CALL/PUT = chain; ESTRATEGIAS = tabla
  // de estrategias en el mismo panel).
  const [tablaVista, setTablaVista] = useState<TablaVista>("CALL");

  // Contrato activo: el elegido, y si todavía no eligió ninguno, el CALL más
  // operado del día (primera fila de la chain). Se fija UNA sola vez, cuando
  // llega la primera chain con datos: si el ranking cambia durante la rueda el
  // chart no salta, y si el user deselecciona (click sobre la fila activa) no
  // se lo volvemos a elegir — `autoPickHecho` guarda eso, no el estado.
  const autoPickHecho = useRef(false);
  useEffect(() => {
    if (autoPickHecho.current || selectedInstrumento != null || !docs.length) return;
    const top = docs
      .filter((d) => d.tipo === "CALL" && ((d.last || 0) > 0 || (d.bid || 0) > 0 || (d.offer || 0) > 0))
      .sort((a, b) => (b.ev || 0) - (a.ev || 0))[0];
    if (!top) return;
    autoPickHecho.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedInstrumento(top.instrumento);
  }, [docs, selectedInstrumento]);

  const selectedOpcion = useMemo<OpcionDoc | null>(
    () => docs.find((d) => d.instrumento === selectedInstrumento) ?? null,
    [docs, selectedInstrumento],
  );

  function pickOpcion(d: OpcionDoc | null) {
    setSelectedInstrumento(d?.instrumento ?? null);
  }

  const spot = useMemo(
    () => docs.find((d) => (d.spot || 0) > 0)?.spot || 0,
    [docs]
  );

  const ultimoDisplay = atDocs > 0 ? fmtHoraAR(atDocs) : "—";
  const modoContrato = tablaVista !== "ESTRATEGIAS";

  const { liquidStrikes, atmStrike, rows } = useMemo(() => {
    const { porStrike, liquidStrikes } = buildPorStrike(docs);
    if (!liquidStrikes.length) {
      return {
        liquidStrikes: [] as number[],
        atmStrike: null as number | null,
        rows: [] as EstrategiaRow[],
      };
    }
    let atmIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < liquidStrikes.length; i++) {
      const d = Math.abs(liquidStrikes[i] - spot);
      if (d < bestD) {
        bestD = d;
        atmIdx = i;
      }
    }
    const atmStrike = liquidStrikes[atmIdx];
    const selK = strike ?? atmStrike;
    const idx = Math.max(0, liquidStrikes.indexOf(selK));
    return {
      liquidStrikes,
      atmStrike,
      // Instrumentado (apagado por default, ver lib/perf.ts): acá corre el
      // motor de estrategias completo — templates, pricing bid/offer por pata
      // y Black-Scholes en TypeScript. Es el candidato #1 a portar al backend,
      // así que primero se mide cuánto cuesta de verdad en el browser.
      rows: medir("estrategias opciones (motor completo)", () =>
        calcularEstrategias(porStrike, liquidStrikes, idx, categoria),
      ),
    };
  }, [docs, strike, spot, categoria]);

  // Clamp la selección del usuario al rango actual; si la fila elegida quedó
  // sin liquidez o se cambió de categoría, caemos a la primera válida.
  const effectiveSelected = useMemo<number | null>(() => {
    if (
      selected >= 0 &&
      selected < rows.length &&
      rows[selected]?.costo !== null
    ) {
      return selected;
    }
    const firstValid = rows.findIndex((r) => r.costo !== null);
    return firstValid >= 0 ? firstValid : null;
  }, [rows, selected]);

  const selRow = effectiveSelected != null ? rows[effectiveSelected] : undefined;
  const selLegs = selRow?.legs ?? [];
  // selCosto = ALL-IN (prima neta × 100 + comisión de prima). Payoff y
  // escenarios lo usan así. Para el histórico restamos la comisión porque ese
  // chart grafica prima pura (sin comisión) calculada en el backend.
  const selCosto = selRow?.costo ?? 0;
  const selComision = selRow?.comision ?? 0;

  async function guardarTasa() {
    const val = parseFloat(tasaInput);
    if (isNaN(val) || val <= 0 || val >= 3) return;
    try {
      setSavingTasa(true);
      const res = await fetch(`/api/opciones-meta?valor=${val}`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMeta({ ...meta, tasa: val });
    } catch {
      // no-op
    } finally {
      setSavingTasa(false);
    }
  }

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-3">
      {/* Header KPIs */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 flex flex-wrap items-center gap-4 shrink-0">
        <Kpi label="SPOT" value={spot ? `$${spot.toFixed(2)}` : "—"} accent />
        <Kpi
          label="VR GGAL (40r)"
          value={meta.vr_local ? `${(meta.vr_local * 100).toFixed(1)}%` : "—"}
        />
        <Kpi
          label="ADR"
          value={meta.vr_adr ? `${(meta.vr_adr * 100).toFixed(1)}%` : "—"}
        />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--t-text-dim)] tracking-wide">
            TASA R
          </span>
          {isAdmin ? (
            <>
              <input
                type="number"
                step="0.005"
                min="0"
                max="3"
                value={tasaInput}
                onChange={(e) => setTasaInput(e.target.value)}
                className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-16"
              />
              <button
                onClick={guardarTasa}
                disabled={savingTasa || parseFloat(tasaInput) === meta.tasa}
                className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingTasa ? "..." : "OK"}
              </button>
              <span className="text-[9px] text-[var(--t-text-muted)]">
                ({(meta.tasa * 100).toFixed(1)}%)
              </span>
            </>
          ) : (
            // Read-only para todos los users que no son admin: la tasa
            // risk-free es global y afecta los Greeks de toda la mesa.
            <span className="text-[var(--t-accent)] font-mono text-[11px] px-1">
              {(meta.tasa * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          ÚLT. ACT {ultimoDisplay}
        </span>
      </div>

      {/* Layout: izq = OPCIONES GGAL a página completa | der = detalle + griegas/costo */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Columna izquierda: la chain ocupa todo el alto ── */}
        <Panel
          title="OPCIONES GGAL"
          count={tablaVista === "ESTRATEGIAS" ? rows.length : docs.length}
          fill
          expandable
          actions={
            <div className="flex items-center gap-1">
              {(["CALL", "PUT", "ESTRATEGIAS"] as const).map((v) => (
                <TabBtn key={v} active={tablaVista === v} onClick={() => setTablaVista(v)}>
                  {v === "ESTRATEGIAS" ? "ESTRAT." : v}
                </TabBtn>
              ))}
            </div>
          }
        >
          {tablaVista === "ESTRATEGIAS" ? (
            <EstrategiasTabla
              rows={rows}
              liquidStrikes={liquidStrikes}
              atmStrike={atmStrike}
              strike={strike}
              setStrike={setStrike}
              categoria={categoria}
              setCategoria={setCategoria}
              selected={effectiveSelected ?? -1}
              setSelected={setSelected}
            />
          ) : (
            <OpcionesTableCompact
              data={docs}
              vistaControlada={tablaVista}
              hideFilter
              selectedInstrumento={selectedOpcion?.instrumento ?? null}
              onSelect={pickOpcion}
            />
          )}
        </Panel>

        {/* ── Columna derecha: sigue a la tab de la tabla ──
            CALL/PUT (default): sup. COSTO HIST. del contrato · inf. GRIEGAS.
            ESTRAT.:            sup. PAYOFF / ESCENARIOS   · inf. COSTO HISTÓRICO de la estrategia. */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          {modoContrato ? (
            selectedOpcion ? (
            <Panel
              title={`COSTO HIST. — ${shortTicker(selectedOpcion.instrumento)}`}
              fill
              expandable
            >
              <OpcionHistoricoChart
                instrumento={selectedOpcion.instrumento}
                lastLive={selectedOpcion.last}
              />
            </Panel>
            ) : (
              <Panel title="COSTO HISTÓRICO" fill expandable>
                <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  Clickeá un contrato en OPCIONES GGAL para ver su costo histórico.
                </p>
              </Panel>
            )
          ) : (
            <Panel
              title={buildDetalleTitle(detalleTab, selRow, selCosto)}
              fill
              expandable
              actions={
                <div className="flex items-center gap-1">
                  <TabBtn active={detalleTab === "payoff"} onClick={() => setDetalleTab("payoff")}>
                    PAYOFF
                  </TabBtn>
                  <TabBtn active={detalleTab === "escenarios"} onClick={() => setDetalleTab("escenarios")}>
                    ESCENARIOS
                  </TabBtn>
                </div>
              }
            >
              {!selRow || !selLegs.length ? (
                <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  Seleccioná una estrategia con liquidez (filtro ESTRAT.).
                </p>
              ) : detalleTab === "payoff" ? (
                <PayoffChart legs={selLegs} spot={spot} costo={selCosto || 0} />
              ) : (
                <EscenariosTabla
                  legs={selLegs}
                  spot={spot}
                  costo={selCosto || 0}
                  tasa={meta.tasa}
                />
              )}
            </Panel>
          )}

          {modoContrato ? (
            selectedOpcion ? (
            <Panel
              title={`GRIEGAS — ${shortTicker(selectedOpcion.instrumento)}`}
              fill
              expandable
            >
              <GriegasHistoricoChart instrumento={selectedOpcion.instrumento} />
            </Panel>
            ) : (
              <Panel title="GRIEGAS" fill expandable>
                <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  Clickeá un contrato en OPCIONES GGAL para ver la variación de sus griegas.
                </p>
              </Panel>
            )
          ) : (
            <Panel
              title={
                selRow ? `COSTO HISTÓRICO — ${selRow.nombre}` : "COSTO HISTÓRICO"
              }
              fill
              expandable
            >
              {selRow && selRow.tplLegs?.length ? (
                <CostoHistoricoChart
                  legs={selRow.tplLegs}
                  bucketMin={15}
                  costoLive={(selCosto || 0) - selComision}
                />
              ) : (
                <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  Elegí una estrategia con liquidez para ver su costo histórico.
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function buildDetalleTitle(
  tab: DetalleTab,
  selRow: EstrategiaRow | undefined,
  selCosto: number,
): string {
  const tag = tab === "escenarios" ? "ESCENARIOS" : "PAYOFF";
  if (!selRow) return tag;
  const sign = (selCosto || 0) > 0 ? "DEBIT" : "CREDIT";
  const com = selRow.comision
    ? ` · com $${Math.round(selRow.comision).toLocaleString("es-AR")}`
    : "";
  return `${tag} — ${selRow.nombre} (${sign} $${Math.abs(selCosto || 0).toFixed(2)})${com}`;
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] text-[var(--t-text-dim)] tracking-wide uppercase">
        {label}
      </span>
      <span
        className={`text-[13px] font-semibold ${
          accent ? "text-[var(--t-accent)]" : "text-[var(--t-text)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] px-1.5 py-0.5 border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
