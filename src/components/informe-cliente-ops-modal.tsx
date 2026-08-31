"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";
import { fmtMoneyFull } from "@/lib/fmt-money";

// Los BOLETOS de un cliente en el MES del corte.
//
// Reemplaza a la tab OPERACIONES del Detalle, que listaba las operaciones de TODOS
// los clientes del segmento en el período entero: miles de filas sin dueño, capeadas
// a las 1.000 más recientes, que no contestaban ninguna pregunta concreta. Acá se
// abre desde la fila de un cliente y muestra lo suyo.
//
// La ventana es el MES del corte y entran TODOS los boletos no anulados —no solo los
// que cobraron arancel—: es la misma definición con la que el filtro SOLO OPERATIVAS
// dejó pasar esa fila, así que una cuenta marcada como operativa no se puede abrir
// vacía. Es la regla que rige toda esta vista: la misma pregunta, el mismo predicado.
//
// Nada se deriva acá: los tres totales de la cabecera los manda el backend, calculados
// sobre las mismas filas que devuelve.

type Op = {
  fecha: string | null; fecha_dmy: string | null; boleto: string | null;
  operacion: string | null; operacion_label: string; tipo_operacion: string | null;
  instrumento: string | null; mercado: string | null; moneda: string | null;
  bruto: number; arancel: number; cantidad: number | null;
  etapa: string | null; es_cierre: boolean; cuenta_volumen: boolean;
};
type Resp = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; mes: string; desde: string; hasta: string;
  n_boletos: number; volumen: number; arancel: number; operaciones: Op[];
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
               "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (ym: string) =>
  `${MESES[Number(ym.slice(5, 7)) - 1] ?? "?"} ${ym.slice(2, 4)}`;

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="px-3 py-1.5 border-r border-[var(--t-border)] last:border-r-0">
      <div className="text-[8px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</div>
      <div className="text-[12px] tabular-nums text-[var(--t-text)]">{valor}</div>
    </div>
  );
}

export function InformeClienteOpsModal(
  { idCuenta, moneda = "ARS", fecha, onCerrar }:
  { idCuenta: string; moneda?: string; fecha?: string; onCerrar: () => void },
) {
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    const qs = new URLSearchParams({ id_cuenta: idCuenta, moneda });
    if (fecha) qs.set("fecha", fecha);
    setD(null); setErr(null);
    // fetchJson (no getJSON): un 403 o un 502 tienen que decirse. Devolver null los
    // haría indistinguibles de "este cliente no operó", que es justo lo contrario.
    fetchJson<Resp>(`/api/operaciones/comercial/informe-cliente-ops?${qs}`)
      .then(setD)
      .catch((e: Error) => setErr(e.message));
  }, [idCuenta, moneda, fecha]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[1100px] max-h-[85vh] flex flex-col bg-[var(--t-panel)]
                      border border-[var(--t-border-2)] shadow-2xl" onClick={(e) => e.stopPropagation()}>

        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold truncate">
            [{idCuenta}] {d?.denominacion ?? "cargando…"}
          </span>
          {d?.operador_nombre && (
            <span className="text-[10px] opacity-80 truncate max-w-[220px]">{d.operador_nombre}</span>
          )}
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70"
            aria-label="Cerrar">✕</button>
        </div>

        <div className="flex border-b border-[var(--t-border)] shrink-0">
          <Dato label="Mes" valor={d ? mesLabel(d.mes) : "…"} />
          <Dato label="Boletos" valor={d ? String(d.n_boletos) : "…"} />
          <Dato label="Volumen" valor={d ? fmtMoneyFull(d.volumen) : "…"} />
          <Dato label="Arancel" valor={d ? fmtMoneyFull(d.arancel) : "…"} />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {err && <div className="p-4 text-[11px] text-[var(--t-neg)]">{err}</div>}
          {!d && !err && (
            <div className="p-6 text-center text-[11px] text-[var(--t-text-muted)]">cargando…</div>
          )}
          {d && d.operaciones.length === 0 && (
            <div className="p-6 text-center text-[11px] text-[var(--t-text-muted)]">
              Sin boletos en {mesLabel(d.mes)}.
            </div>
          )}
          {d && d.operaciones.length > 0 && (
            <table className="w-full text-[11px] tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)]">
                <tr className="text-[9px] text-[var(--t-text-muted)] tracking-wide
                               border-b border-[var(--t-border)]">
                  <th className="text-left px-3 py-2">FECHA</th>
                  <th className="text-left px-1">BOLETO</th>
                  <th className="text-left px-1">OPERACIÓN</th>
                  <th className="text-left px-1">INSTRUMENTO</th>
                  <th className="text-left px-1">MERCADO</th>
                  <th className="text-right px-2">BRUTO</th>
                  <th className="text-right px-3">ARANCEL</th>
                </tr>
              </thead>
              <tbody>
                {d.operaciones.map((o, i) => (
                  <tr key={(o.boleto ?? "") + i}
                    className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1.5 text-[var(--t-text-dim)] whitespace-nowrap">{o.fecha_dmy}</td>
                    <td className="px-1 py-1.5 text-[var(--t-text-muted)]">{o.boleto}</td>
                    <td className="px-1 py-1.5 text-[var(--t-text)] truncate max-w-[150px]"
                      title={o.tipo_operacion ?? undefined}>
                      {o.operacion_label || o.operacion || "—"}
                      {/* Un cierre de caución NO suma volumen (doble conteo). Se marca
                          en la fila para que el bruto de la columna cierre con el total
                          de arriba sin que haya que explicarlo aparte. */}
                      {o.es_cierre && (
                        <span className="ml-1 text-[8px] uppercase text-[var(--t-text-muted)]">cierre</span>
                      )}
                      {o.etapa === "solicitud" && (
                        <span className="ml-1 text-[8px] uppercase text-[var(--t-text-muted)]">solicitud</span>
                      )}
                    </td>
                    <td className="px-1 py-1.5 text-[var(--t-text-dim)] truncate max-w-[170px]"
                      title={o.instrumento ?? undefined}>{o.instrumento ?? "—"}</td>
                    <td className="px-1 py-1.5 text-[var(--t-text-muted)]">{o.mercado ?? "—"}</td>
                    <td className={"text-right px-2 " + (o.cuenta_volumen
                      ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)] line-through")}>
                      {o.bruto ? fmtMoneyFull(o.bruto) : "—"}
                    </td>
                    <td className="text-right px-3 text-[var(--t-data-arancel)]">
                      {o.arancel ? fmtMoneyFull(o.arancel) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
