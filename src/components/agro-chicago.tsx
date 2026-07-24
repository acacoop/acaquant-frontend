"use client";

import { fmtPrice, fmtTs } from "./ui";
import { usePoll } from "@/lib/use-poll";

// Tab CHICAGO de AGRO — futuros CBOT (Soja / Aceite / Maíz / Trigo / Harina)
// en USD/tonelada, alimentados por el feed Eikon de oficina (mismo script que
// la RV internacional). Los datos solo se mueven con el feed prendido; si está
// apagado queda la última foto con su hora.
//
// Layout: tarjetas COMPACTAS una al lado de la otra (pocas columnas y pocos
// contratos por familia — un grid 50/50 quedaba desprolijo). VAR es NOMINAL
// (variación neta del día en USD/t, no %).

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

function FamiliaCard({ fam }: { fam: ChicagoFamilia }) {
  return (
    <div className="w-[290px] shrink-0 rounded-md border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden shadow-sm">
      {/* Header delineado (banda de acento sutil, mismo lenguaje que Panel) */}
      <div className="flex items-center px-2.5 py-1.5 border-b border-[var(--t-border-2)] bg-[var(--t-accent)]/10">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          {fam.label}
        </span>
        {fam.updated_at && (
          <span className="ml-auto text-[9px] font-mono text-[var(--t-text-muted)]">
            {fmtTs(fam.updated_at)}
          </span>
        )}
      </div>

      {fam.rows.length === 0 ? (
        <div className="p-4 text-center text-[10.5px] text-[var(--t-text-dim)]">
          Sin datos — feed apagado.
        </div>
      ) : (
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[var(--t-surface)]/60">
            <tr>
              <th className="text-left px-2.5 py-[3px] border-b border-[var(--t-border)]">
                Mes
              </th>
              <th className="text-right px-2.5 py-[3px] border-b border-[var(--t-border)]">
                USD/t
              </th>
              <th className="text-right px-2.5 py-[3px] border-b border-[var(--t-border)]">
                Var USD/t
              </th>
            </tr>
          </thead>
          <tbody>
            {fam.rows.map((r) => (
              <tr
                key={r.ric}
                className="border-b border-[var(--t-border)] last:border-b-0 odd:bg-[var(--t-surface)]/30 hover:bg-[var(--t-surface-2)]"
              >
                <td className="text-left px-2.5 py-[3px] text-[var(--t-text)]">
                  {r.mes ?? "--"}
                </td>
                <td className="text-right px-2.5 py-[3px] text-[var(--t-text)] font-semibold">
                  {fmtPrice(r.precio ?? undefined)}
                </td>
                <td className="text-right px-2.5 py-[3px]">
                  <VarCell v={r.variacion} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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

  // Tarjetas compactas lado a lado; en pantallas angostas van bajando solas.
  return (
    <div className="h-full min-h-0 p-3 overflow-y-auto">
      <div className="flex flex-wrap items-start gap-3">
        {data.familias.map((fam) => (
          <FamiliaCard key={fam.familia} fam={fam} />
        ))}
      </div>
    </div>
  );
}
