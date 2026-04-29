"use client";

import { useMemo, useState } from "react";
import { Panel, fmtHoraAR } from "./ui";
import { OpcionesTableCompact } from "./opciones-table-compact";
import { EstrategiasTabla } from "./estrategias-tabla";
import { PayoffChart } from "./payoff-chart";
import { EscenariosTabla } from "./escenarios-tabla";
import { CostoHistoricoChart } from "./costo-historico-chart";
import { usePoll } from "@/lib/use-poll";
import {
  buildPorStrike,
  calcularEstrategias,
  type EstrategiaRow,
  type OpcionDoc,
} from "@/lib/estrategias";

// Intervalo de polling para la chain de opciones. El motor de opciones
// replacea el snapshot cada 1 s; 5 s es un compromise razonable entre
// frescura y carga de red.
const POLL_OPCIONES_MS = 5_000;

interface Meta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

type DetalleTab = "payoff" | "escenarios";

export function DerivadosView({
  docs: initialDocs,
  metaInicial,
  isAdmin = false,
}: {
  docs: OpcionDoc[];
  metaInicial: Meta;
  isAdmin?: boolean;
}) {
  // Polling live de la chain de opciones; el SSR provee el initialData
  // para carga rápida. Antes docs venía sólo del SSR y la vista quedaba
  // estática hasta F5.
  const { data: docs, lastAt: atDocs } = usePoll<OpcionDoc[]>(
    "/api/cotizaciones/opciones",
    initialDocs,
    POLL_OPCIONES_MS,
  );

  const [meta, setMeta] = useState<Meta>(metaInicial);
  const [tasaInput, setTasaInput] = useState(metaInicial.tasa.toFixed(3));
  const [savingTasa, setSavingTasa] = useState(false);

  const [strike, setStrike] = useState<number | null>(null);
  const [categoria, setCategoria] = useState("Cono / Cuna");
  const [selected, setSelected] = useState(0);
  const [detalleTab, setDetalleTab] = useState<DetalleTab>("payoff");

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
  const effectiveSelected = useMemo(() => {
    if (
      selected >= 0 &&
      selected < rows.length &&
      rows[selected]?.costo !== null
    ) {
      return selected;
    }
    const firstValid = rows.findIndex((r) => r.costo !== null);
    return firstValid >= 0 ? firstValid : 0;
  }, [rows, selected]);

  const selRow = rows[effectiveSelected];
  const selLegs = selRow?.legs ?? [];
  const selCosto = selRow?.costo ?? 0;

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
      <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 flex flex-wrap items-center gap-4 shrink-0">
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
          <span className="text-[10px] text-[#808080] tracking-wide">
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
                className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-1 py-0.5 font-mono focus:border-[#ff9900] outline-none w-16"
              />
              <button
                onClick={guardarTasa}
                disabled={savingTasa || parseFloat(tasaInput) === meta.tasa}
                className="text-[10px] px-2 py-0.5 border border-[#2a2a2a] text-[#ff9900] hover:border-[#ff9900] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingTasa ? "..." : "OK"}
              </button>
              <span className="text-[9px] text-[#555]">
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
        <span className="ml-auto text-[10px] text-[#555]">
          ÚLT. ACT {ultimoDisplay}
        </span>
      </div>

      {/* Layout: columna izq (opciones + estrategias) | columna der full detalle */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          <Panel title="OPCIONES GGAL" count={docs.length} fill>
            <OpcionesTableCompact data={docs} />
          </Panel>
          <Panel title="ESTRATEGIAS" fill>
            <EstrategiasTabla
              rows={rows}
              liquidStrikes={liquidStrikes}
              atmStrike={atmStrike}
              strike={strike}
              setStrike={setStrike}
              categoria={categoria}
              setCategoria={setCategoria}
              selected={effectiveSelected}
              setSelected={setSelected}
            />
          </Panel>
        </div>

        <div className="min-w-0 min-h-0 grid grid-rows-[3fr_2fr] gap-3">
          <Panel
            title={
              selRow
                ? `${selRow.nombre} — ${
                    (selCosto || 0) > 0 ? "DEBIT" : "CREDIT"
                  } $${Math.abs(selCosto || 0).toFixed(2)}`
                : "DETALLE"
            }
            fill
            actions={
              <div className="flex items-center gap-1">
                <TabBtn
                  active={detalleTab === "payoff"}
                  onClick={() => setDetalleTab("payoff")}
                >
                  PAYOFF
                </TabBtn>
                <TabBtn
                  active={detalleTab === "escenarios"}
                  onClick={() => setDetalleTab("escenarios")}
                >
                  ESCENARIOS
                </TabBtn>
              </div>
            }
          >
            {!selRow || !selLegs.length ? (
              <p className="text-[#555555] text-xs py-4 text-center">
                Seleccioná una estrategia con liquidez para ver el detalle.
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
          <Panel title="COSTO HISTÓRICO" fill>
            {!selRow || !selRow.tplLegs?.length ? (
              <p className="text-[#555555] text-xs py-4 text-center">
                Seleccioná una estrategia para ver la serie de costo del OPEX.
              </p>
            ) : (
              <CostoHistoricoChart
                legs={selRow.tplLegs}
                bucketMin={15}
                costoLive={selCosto || 0}
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
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
      <span className="text-[9px] text-[#808080] tracking-wide uppercase">
        {label}
      </span>
      <span
        className={`text-[13px] font-semibold ${
          accent ? "text-[#ff9900]" : "text-[#d0d0d0]"
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
          : "bg-transparent text-[#808080] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
