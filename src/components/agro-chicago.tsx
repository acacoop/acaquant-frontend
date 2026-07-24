"use client";

import { Panel, fmtPrice, fmtTs } from "./ui";
import { usePoll } from "@/lib/use-poll";

// Tab CHICAGO de AGRO — futuros CBOT (Soja / Aceite / Maíz / Trigo / Harina)
// en USD/tonelada, alimentados por el feed Eikon de oficina (mismo script que
// la RV internacional). Los datos solo se mueven con el feed prendido; si está
// apagado queda la última foto con su hora.

const POLL_MS = 10_000;

interface ChicagoRow {
  ric: string;
  posicion: number;
  mes: string | null;
  precio: number | null;
  variacion: number | null;
  updated_at: string | null;
}

interface ChicagoFamilia {
  familia: string;
  label: string;
  rows: ChicagoRow[];
  updated_at: string | null;
}

interface ChicagoResp {
  familias: ChicagoFamilia[];
  unidad: string;
}

const EMPTY: ChicagoResp = { familias: [], unidad: "USD/t" };

function VarCell({ v }: { v: number | null }) {
  if (v === null || v === undefined) {
    return <span className="text-[var(--t-text-dim)]">--</span>;
  }
  const cls =
    v > 0
      ? "text-[var(--t-pos)]"
      : v < 0
        ? "text-[var(--t-neg)]"
        : "text-[var(--t-text-dim)]";
  return (
    <span className={cls}>
      {v > 0 ? "+" : ""}
      {fmtPrice(v)}
    </span>
  );
}

function FamiliaTable({ fam, unidad }: { fam: ChicagoFamilia; unidad: string }) {
  return (
    <Panel
      title={fam.label}
      sub={fam.updated_at ? `últ. ${fmtTs(fam.updated_at)}` : undefined}
    >
      {fam.rows.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-[var(--t-text-dim)]">
          Sin datos — el feed Eikon de oficina no mandó esta familia todavía.
        </div>
      ) : (
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-panel)]">
            <tr>
              <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">
                Mes
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Precio {unidad}
              </th>
              <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">
                Var
              </th>
            </tr>
          </thead>
          <tbody>
            {fam.rows.map((r) => (
              <tr
                key={r.ric}
                className="border-b border-[var(--t-border)] last:border-b-0"
              >
                <td className="text-left px-2 py-1 text-[var(--t-text)]">
                  {r.mes ?? "--"}
                </td>
                <td className="text-right px-2 py-1 text-[var(--t-text)]">
                  {fmtPrice(r.precio ?? undefined)}
                </td>
                <td className="text-right px-2 py-1">
                  <VarCell v={r.variacion} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function AgroChicago() {
  const { data } = usePoll<ChicagoResp>("/api/derivados-agro/chicago", EMPTY, POLL_MS, {
    fetchOnMount: true,
  });

  if (data.familias.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--t-text-muted)] text-xs">
        Cargando Chicago…
      </div>
    );
  }

  // Grid 2 columnas (tablas al 50%); la 5ta familia baja de fila sola.
  return (
    <div className="h-full min-h-0 p-3 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
      {data.familias.map((fam) => (
        <FamiliaTable key={fam.familia} fam={fam} unidad={data.unidad} />
      ))}
    </div>
  );
}
