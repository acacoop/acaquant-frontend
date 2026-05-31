"use client";

import { useMemo, useState } from "react";
import { Panel, fmtHoraAR, shortTicker } from "./ui";
import { OpcionesTableCompact } from "./opciones-table-compact";
import { EstrategiasTabla } from "./estrategias-tabla";
import { PayoffChart } from "./payoff-chart";
import { EscenariosTabla } from "./escenarios-tabla";
import { CostoHistoricoChart } from "./costo-historico-chart";
import { OpcionHistoricoChart } from "./opcion-historico-chart";
import { GriegasHistoricoChart } from "./griegas-historico-chart";
import { DerivadosOperar } from "./derivados-operar";
import { PostTradeLab } from "./post-trade-lab";
import { usePoll } from "@/lib/use-poll";
import {
  buildPorStrike,
  calcularEstrategias,
  type EstrategiaRow,
  type OpcionDoc,
  type ResolvedLeg,
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

type DetalleTab = "payoff" | "escenarios" | "lab";
// Tab del panel cuando hay un contrato individual elegido.
type OpcionTab = "operar" | "lab";
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
  // Selección mutuamente excluyente: o hay una estrategia seleccionada
  // (`selected` ≠ null) o un contrato individual (`selectedOpcion` ≠ null),
  // nunca las dos a la vez. La default al primer render es la estrategia
  // ATM (selected=0); clickear un contrato la limpia, y clickear una
  // estrategia limpia el contrato.
  const [selected, setSelected] = useState<number | null>(0);
  const [selectedOpcion, setSelectedOpcion] = useState<OpcionDoc | null>(null);
  const [detalleTab, setDetalleTab] = useState<DetalleTab>("payoff");
  // Filtro de la tabla OPCIONES GGAL (CALL/PUT = chain; ESTRATEGIAS = tabla
  // de estrategias en el mismo panel).
  const [tablaVista, setTablaVista] = useState<TablaVista>("CALL");
  const [opcionTab, setOpcionTab] = useState<OpcionTab>("operar");

  function pickStrategy(i: number) {
    setSelected(i);
    setSelectedOpcion(null);
  }

  function pickOpcion(d: OpcionDoc | null) {
    setSelectedOpcion(d);
    if (d) setSelected(null);
  }

  const spot = useMemo(
    () => docs.find((d) => (d.spot || 0) > 0)?.spot || 0,
    [docs]
  );

  const ultimoDisplay = atDocs > 0 ? fmtHoraAR(atDocs) : "—";

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
      rows: calcularEstrategias(porStrike, liquidStrikes, idx, categoria),
    };
  }, [docs, strike, spot, categoria]);

  // Clamp la selección del usuario al rango actual; si la fila elegida quedó
  // sin liquidez o se cambió de categoría, caemos a la primera válida.
  // `null` = no hay estrategia activa (porque el user clickeó un contrato).
  const effectiveSelected = useMemo<number | null>(() => {
    if (selected == null) return null;
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
                className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none w-16"
              />
              <button
                onClick={guardarTasa}
                disabled={savingTasa || parseFloat(tasaInput) === meta.tasa}
                className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[#ff9900] hover:border-[#ff9900] disabled:opacity-40 disabled:cursor-not-allowed"
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
            <span className="text-[#ff9900] font-mono text-[11px] px-1">
              {(meta.tasa * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          ÚLT. ACT {ultimoDisplay}
        </span>
      </div>

      {/* Layout 2×2: izq (opciones/estrategias + costo hist) | der (payoff/escenarios + griegas) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Columna izquierda ── */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
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
                setSelected={pickStrategy}
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

          <Panel
            title={
              selectedOpcion
                ? `COSTO HIST. — ${shortTicker(selectedOpcion.instrumento)}`
                : "COSTO HISTÓRICO"
            }
            fill
            expandable
          >
            {selectedOpcion ? (
              <OpcionHistoricoChart
                instrumento={selectedOpcion.instrumento}
                lastLive={selectedOpcion.last}
              />
            ) : selRow && selRow.tplLegs?.length ? (
              <CostoHistoricoChart
                legs={selRow.tplLegs}
                bucketMin={15}
                costoLive={(selCosto || 0) - selComision}
              />
            ) : (
              <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                Elegí una estrategia (filtro ESTRAT.) o un contrato (CALL/PUT) para ver el costo histórico.
              </p>
            )}
          </Panel>
        </div>

        {/* ── Columna derecha ── */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          {selectedOpcion ? (
            // Contrato elegido → OPERAR (book + ticket) o LAB (post-trade).
            <Panel
              title={`${opcionTab === "lab" ? "LAB" : "OPERAR"} — ${shortTicker(selectedOpcion.instrumento)}`}
              fill
              expandable
              actions={
                <div className="flex items-center gap-1">
                  <TabBtn active={opcionTab === "operar"} onClick={() => setOpcionTab("operar")}>
                    OPERAR
                  </TabBtn>
                  <TabBtn active={opcionTab === "lab"} onClick={() => setOpcionTab("lab")}>
                    LAB
                  </TabBtn>
                </div>
              }
            >
              {opcionTab === "operar" ? (
                <DerivadosOperar
                  instrumento={selectedOpcion.instrumento}
                  last={selectedOpcion.last}
                />
              ) : (
                <PostTradeLab
                  legs={[opcionAsLeg(selectedOpcion)]}
                  spot={spot}
                  tasa={meta.tasa}
                  entrySugerido={selectedOpcion.last ?? 0}
                  vence={selectedOpcion.vence}
                  singleLeg
                />
              )}
            </Panel>
          ) : (
            // Estrategia → payoff / escenarios / lab.
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
                  <TabBtn active={detalleTab === "lab"} onClick={() => setDetalleTab("lab")}>
                    LAB
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
              ) : detalleTab === "escenarios" ? (
                <EscenariosTabla
                  legs={selLegs}
                  spot={spot}
                  costo={selCosto || 0}
                  tasa={meta.tasa}
                />
              ) : (
                <PostTradeLab
                  legs={selLegs}
                  spot={spot}
                  tasa={meta.tasa}
                  entrySugerido={(selCosto || 0) / 100}
                  vence={selLegs[0]?.vence}
                />
              )}
            </Panel>
          )}

          <Panel
            title={
              selectedOpcion
                ? `GRIEGAS — ${shortTicker(selectedOpcion.instrumento)}`
                : "GRIEGAS"
            }
            fill
            expandable
          >
            {selectedOpcion ? (
              <GriegasHistoricoChart instrumento={selectedOpcion.instrumento} />
            ) : (
              <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                Clickeá un contrato en OPCIONES GGAL (CALL/PUT) para ver la variación de sus griegas.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// Convierte un contrato individual (OpcionDoc) en un leg comprado x1, para
// alimentar el LAB post-trade (el lado/cantidad se editan dentro del LAB).
function opcionAsLeg(d: OpcionDoc): ResolvedLeg {
  return {
    instrumento: d.instrumento,
    K: d.strike ?? 0,
    tipo: d.tipo === "PUT" ? "PUT" : "CALL",
    side: "buy",
    qty: 1,
    px: d.last ?? 0,
    iv: d.iv ?? 0,
    vence: d.vence ?? "",
    T: null,
  };
}

function buildDetalleTitle(
  tab: DetalleTab,
  selRow: EstrategiaRow | undefined,
  selCosto: number,
): string {
  const tag = tab === "escenarios" ? "ESCENARIOS" : tab === "lab" ? "LAB" : "PAYOFF";
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
          accent ? "text-[#ff9900]" : "text-[var(--t-text)]"
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
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
