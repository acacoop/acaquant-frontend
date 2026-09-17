"use client";

/**
 * COMISIONES FCI (Back Office) — lo que cobra ACA Valores por la tenencia de
 * fondos, sin planilla.
 *
 * Layout: 50 % izquierda (tabla por fondo, cada fila se abre y muestra las
 * cuentas que la componen) · 50 % derecha partida en dos (arriba el acumulado
 * MENSUAL histórico, abajo el acumulado por sociedad gerente del mes).
 *
 * ⚠️ **ACÁ NO SE CALCULA NADA.** Todos los números vienen resueltos del backend
 * (`api/services/comisiones_fci.py`). Si este componente recalculara el ÷2 o el
 * ÷365, habría dos fórmulas para la misma plata y el día que se separen las dos
 * pantallas van a contestar seguras con números distintos. Lo único que se hace
 * acá es sumar lo que ya vino, para los subtotales de pantalla.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJson } from "@/lib/fetch-json";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";

const BASE = "/api/back-office/comisiones-fci";

type Moneda = "ARS" | "USD";

type Fondo = {
  unidad: string;
  gerente: string;
  moneda: Moneda;
  fee_admin: number | null;
  arancel_dia: number;
  arancel_acum: number;
  valuacion: number;
  cuentas: number;
  sin_fee: boolean;
};

type Gerente = {
  gerente: string;
  moneda: Moneda;
  arancel_dia: number;
  arancel_acum: number;
  fondos: number;
};

type Resumen = {
  mes: string;
  corte: string | null;
  dias_devengados?: number;
  fondos: Fondo[];
  gerentes: Gerente[];
  totales: Record<Moneda, { dia: number; acum: number }>;
  sin_fee: { n: number; valuacion: number; fondos: string[] };
  sin_datos: boolean;
};

type CuentaDet = {
  id_cuenta: string;
  cuenta: string;
  valuacion: number;
  arancel_dia: number;
  arancel_acum: number;
};

type Detalle = {
  unidad: string;
  corte: string | null;
  moneda: Moneda;
  cuentas: CuentaDet[];
  total_dia: number;
  total_acum: number;
};

type SerieMes = { mes: string; ARS: number; USD: number };

type FeeFondo = {
  unidad: string;
  gerente: string;
  fee_admin: number | null;
  fee_aca: number | null;
};

type Fees = {
  fondos: FeeFondo[];
  sin_fee: string[];
  formula: {
    texto: string;
    parte_aca: number;
    dias_anio: number;
    por_que_mitad: string;
    fines_de_semana: string;
  };
};

/** "2026-08" → "Agosto 2026". */
function mesLargo(m: string): string {
  const [a, n] = m.split("-");
  const nombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
    "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${nombres[Number(n) - 1] ?? m} ${a}`;
}

/** "2026-08" → "Ago 26" (eje del gráfico, que tiene poco lugar). */
function mesCorto(m: string): string {
  const [a, n] = m.split("-");
  const ab = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${ab[Number(n) - 1] ?? n} ${a.slice(2)}`;
}

/** El nombre corto del fondo: `[15186] CAFCI876-2096 - FCI Balanz…` → `FCI Balanz…`.
 *  El código y el CAFCI quedan en el `title` — sirven para auditar, no para leer
 *  una tabla de 140 filas. */
function nombreFondo(u: string): string {
  const sinCodigo = u.replace(/^\[[^\]]*\]\s*/, "");
  const i = sinCodigo.indexOf(" - ");
  return (i >= 0 ? sinCodigo.slice(i + 3) : sinCodigo).trim() || u;
}

function pct(f: number | null): string {
  if (f == null) return "—";
  return `${(f * 100).toLocaleString("es-AR", { maximumFractionDigits: 4 })} %`;
}

export function ComisionesFciView() {
  const [meses, setMeses] = useState<string[]>([]);
  const [mes, setMes] = usePersistedState<string>("backoffice.comisionesFci.mes", "");
  // Un solo estado para la carga, con el mes AL QUE PERTENECE. Así "cargando" se
  // DERIVA (`llegó.mes !== mes`) en vez de setearse a mano: mientras viaja la
  // respuesta del mes nuevo es imposible mostrar los números del anterior como si
  // fueran los pedidos, que es el bug clásico de un `data` suelto.
  const [llegó, setLlegó] = useState<{ mes: string; data: Resumen | null; error: string | null }>(
    { mes: "", data: null, error: null });
  const [serie, setSerie] = useState<SerieMes[]>([]);
  const [fees, setFees] = useState<Fees | null>(null);
  const [verFees, setVerFees] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  // Cacheado por `mes|unidad`: el detalle de agosto no puede quedar colgado bajo
  // una fila de septiembre.
  const [detalle, setDetalle] = useState<Record<string, Detalle>>({});

  const cargando = !!mes && llegó.mes !== mes;
  const data = llegó.mes === mes ? llegó.data : null;
  const error = llegó.mes === mes ? llegó.error : null;

  // Meses disponibles: salen de los datos, no de un rango inventado. Ofrecer un
  // mes que no tiene foto sería prometer una pantalla vacía.
  useEffect(() => {
    fetchJson<{ meses: string[] }>(`${BASE}/meses`)
      .then((d) => {
        setMeses(d.meses || []);
        setMes((actual) => (actual && d.meses?.includes(actual) ? actual : d.meses?.[0] || ""));
      })
      .catch((e) => setLlegó({ mes: "", data: null, error: String(e) }));
    fetchJson<{ meses: SerieMes[] }>(`${BASE}/serie`)
      .then((d) => setSerie(d.meses || []))
      .catch(() => {/* el gráfico es accesorio: no puede voltear la vista */});
  }, [setMes]);

  useEffect(() => {
    if (!mes) return;
    let vivo = true;
    fetchJson<Resumen>(`${BASE}?mes=${mes}`)
      .then((d) => { if (vivo) { setLlegó({ mes, data: d, error: null }); setAbierto(null); } })
      .catch((e) => { if (vivo) setLlegó({ mes, data: null, error: String(e) }); });
    // Si el usuario cambia de mes mientras viaja la respuesta, la vieja se descarta
    // en vez de pisar a la nueva.
    return () => { vivo = false; };
  }, [mes]);

  const abrir = useCallback(async (unidad: string) => {
    if (abierto === unidad) { setAbierto(null); return; }
    setAbierto(unidad);
    const k = `${mes}|${unidad}`;
    if (detalle[k]) return;
    try {
      const d = await fetchJson<Detalle>(
        `${BASE}/detalle?mes=${mes}&unidad=${encodeURIComponent(unidad)}`);
      setDetalle((p) => ({ ...p, [k]: d }));
    } catch {
      /* el detalle que falla se muestra como "no se pudo cargar", no como vacío:
         un 502 y "este fondo no tuvo cuentas" no se pueden ver igual. */
      setDetalle((p) => ({ ...p, [k]: { unidad, corte: null, moneda: "ARS",
        cuentas: [], total_dia: -1, total_acum: -1 } }));
    }
  }, [abierto, detalle, mes]);

  const verFeesModal = useCallback(() => {
    setVerFees(true);
    if (!fees) fetchJson<Fees>(`${BASE}/fees`).then(setFees).catch(() => undefined);
  }, [fees]);

  const chart = useMemo(
    () => serie.map((m) => ({ ...m, label: mesCorto(m.mes) })),
    [serie]);

  const totARS = data?.totales?.ARS ?? { dia: 0, acum: 0 };
  const totUSD = data?.totales?.USD ?? { dia: 0, acum: 0 };

  return (
    <div className="h-full min-h-0 flex flex-col text-[11px]">
      {/* ── Barra: mes + totales + ayuda ───────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)]
                      px-3 py-2 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
            Mes
          </span>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1
                       text-[11px] text-[var(--t-text)]"
          >
            {meses.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
          </select>
        </div>

        <Total etiqueta="Total ARS" dia={totARS.dia} acum={totARS.acum} />
        <Total etiqueta="Total USD" dia={totUSD.dia} acum={totUSD.acum} />

        {data?.corte && (
          <span className="text-[9px] text-[var(--t-text-muted)]">
            corte {data.corte}
            {data.dias_devengados ? ` · ${data.dias_devengados} días devengados` : ""}
          </span>
        )}

        {/* Lo que NO se pudo calcular se dice acá arriba, no al pie: un fondo sin
            fee no aporta cero, no se sabe cuánto aporta. */}
        {!!data?.sin_fee?.n && (
          <span
            className="text-[9px] px-2 py-0.5 border border-[var(--t-warn,orange)]
                       text-[var(--t-warn,orange)]"
            title={data.sin_fee.fondos.join("\n")}
          >
            ⚠ {data.sin_fee.n} fondo(s) sin fee cargado · {fmtMoney(data.sin_fee.valuacion)} sin devengar
          </span>
        )}

        <button
          onClick={verFeesModal}
          className="ml-auto w-5 h-5 rounded-full border border-[var(--t-border-2)]
                     text-[var(--t-text-dim)] hover:text-[var(--t-accent)]
                     hover:border-[var(--t-accent)] text-[10px] leading-none"
          title="Cómo se calcula y qué fee tiene cada administradora"
        >
          ?
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-[var(--t-neg,red)] text-[11px]">{error}</div>
      )}

      {/* ── Cuerpo: 50 / 50 ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* IZQUIERDA — por fondo */}
        <div className="w-1/2 min-w-0 border-r border-[var(--t-border)] flex flex-col min-h-0">
          <Titulo>Aranceles por fondo</Titulo>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase
                                tracking-wide text-[var(--t-text-muted)]">
                <tr className="border-b border-[var(--t-border)]">
                  <th className="px-2 py-1.5 text-left">Fondo</th>
                  {/* AuM = la valuación de ese fondo en la foto de CORTE. Es la base
                      del arancel (arancel día = AuM × fee ÷ 2 ÷ 365), y sin ella la
                      tabla mostraba el resultado sin el número que lo genera. */}
                  <th className="px-2 py-1.5 text-right w-24">AuM</th>
                  <th className="px-2 py-1.5 text-right w-24">Último día</th>
                  <th className="px-2 py-1.5 text-right w-28">Acum. mes</th>
                </tr>
              </thead>
              <tbody>
                {cargando && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center
                        text-[var(--t-text-muted)]">cargando…</td></tr>
                )}
                {!cargando && data?.sin_datos && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center
                        text-[var(--t-text-muted)]">
                    sin foto de tenencia en {mesLargo(mes)}
                  </td></tr>
                )}
                {!cargando && data?.fondos?.map((f) => (
                  <FilaFondo
                    key={f.unidad}
                    f={f}
                    abierto={abierto === f.unidad}
                    detalle={detalle[`${mes}|${f.unidad}`]}
                    onToggle={() => abrir(f.unidad)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DERECHA — 50 % arriba / 50 % abajo */}
        <div className="w-1/2 min-w-0 flex flex-col min-h-0">
          <div className="h-1/2 min-h-0 flex flex-col border-b border-[var(--t-border)]">
            <Titulo>Acumulado mensual · histórico</Titulo>
            <div className="flex-1 min-h-0 p-2">
              {chart.length === 0 ? (
                <Vacio>sin historia todavía</Vacio>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 3" stroke="var(--t-border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                           axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                           axisLine={false} tickLine={false} width={52}
                           tickFormatter={(v) => fmtMoney(Number(v))} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--t-surface)",
                        border: "1px solid var(--t-border-2)",
                        fontSize: 11,
                      }}
                      formatter={(v, n) => [fmtMoneyFull(Number(v)), String(n)]}
                    />
                    {/* ARS y USD como series SEPARADAS y no apiladas: sumarlas daría
                        un número que no es plata de ninguna moneda. */}
                    <Bar dataKey="ARS" fill="var(--t-accent)" />
                    <Bar dataKey="USD" fill="var(--t-data-arancel, #7bb0d8)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="h-1/2 min-h-0 flex flex-col">
            <Titulo>Por sociedad gerente · {mes ? mesLargo(mes) : ""}</Titulo>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase
                                  tracking-wide text-[var(--t-text-muted)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className="px-2 py-1.5 text-left">Gerente</th>
                    <th className="px-2 py-1.5 text-right w-14">Fondos</th>
                    <th className="px-2 py-1.5 text-right w-24">Último día</th>
                    <th className="px-2 py-1.5 text-right w-28">Acum. mes</th>
                  </tr>
                </thead>
                <tbody>
                  {!data?.gerentes?.length && (
                    <tr><td colSpan={4} className="px-2 py-4 text-center
                          text-[var(--t-text-muted)]">—</td></tr>
                  )}
                  {data?.gerentes?.map((g) => (
                    <tr key={g.gerente}
                        className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                      <td className="px-2 py-1 truncate" title={g.gerente}>{g.gerente}</td>
                      <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{g.fondos}</td>
                      <td className="px-2 py-1 text-right" title={fmtMoneyFull(g.arancel_dia)}>
                        {fmtMoney(g.arancel_dia)}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold text-[var(--t-accent)]"
                          title={fmtMoneyFull(g.arancel_acum)}>
                        {fmtMoney(g.arancel_acum)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {verFees && <ModalFees fees={fees} onClose={() => setVerFees(false)} />}
    </div>
  );
}

function Total({ etiqueta, dia, acum }: { etiqueta: string; dia: number; acum: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
        {etiqueta}
      </span>
      <span className="font-semibold text-[var(--t-accent)]" title={fmtMoneyFull(acum)}>
        {fmtMoney(acum)}
      </span>
      <span className="text-[9px] text-[var(--t-text-dim)]" title={fmtMoneyFull(dia)}>
        día {fmtMoney(dia)}
      </span>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 px-3 py-1.5 text-[9px] uppercase tracking-widest
                    text-[var(--t-accent)] border-b border-[var(--t-border)]
                    bg-[var(--t-panel)]">
      {children}
    </div>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center text-[var(--t-text-muted)]">
      {children}
    </div>
  );
}

function FilaFondo({ f, abierto, detalle, onToggle }: {
  f: Fondo;
  abierto: boolean;
  detalle: Detalle | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={"border-t border-[var(--t-border)] cursor-pointer "
          + (abierto ? "bg-[var(--t-surface)]" : "hover:bg-[var(--t-surface)]")}
      >
        <td className="px-2 py-1 truncate" title={f.unidad}>
          <span className="text-[var(--t-text-muted)] mr-1">{abierto ? "▾" : "▸"}</span>
          {nombreFondo(f.unidad)}
          <span className="ml-1.5 text-[9px] text-[var(--t-text-muted)]">
            {f.moneda} · {f.cuentas} cta{f.cuentas === 1 ? "" : "s"}
          </span>
          {/* Sin fee no es cero: es que no se puede calcular, y se dice en la fila. */}
          {f.sin_fee && (
            <span className="ml-1.5 text-[9px] text-[var(--t-warn,orange)]"
                  title="Este fondo no tiene fee de administración cargado en Manager → Títulos">
              sin fee
            </span>
          )}
        </td>
        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]"
            title={`${fmtMoneyFull(f.valuacion)} · valuación al corte`}>
          {fmtMoney(f.valuacion)}
        </td>
        <td className="px-2 py-1 text-right" title={fmtMoneyFull(f.arancel_dia)}>
          {f.sin_fee ? "—" : fmtMoney(f.arancel_dia)}
        </td>
        <td className="px-2 py-1 text-right font-semibold text-[var(--t-accent)]"
            title={fmtMoneyFull(f.arancel_acum)}>
          {f.sin_fee ? "—" : fmtMoney(f.arancel_acum)}
        </td>
      </tr>

      {abierto && (
        <tr className="bg-[var(--t-surface)]">
          <td colSpan={4} className="px-2 pb-2">
            {!detalle && (
              <div className="py-2 text-[var(--t-text-muted)]">cargando cuentas…</div>
            )}
            {detalle && detalle.total_acum < 0 && (
              <div className="py-2 text-[var(--t-neg,red)]">
                no se pudo cargar el detalle
              </div>
            )}
            {detalle && detalle.total_acum >= 0 && (
              <table className="w-full text-[10px] tabular-nums">
                <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-2 py-1 text-left">Cuenta</th>
                    <th className="px-2 py-1 text-right w-28">Valuación</th>
                    <th className="px-2 py-1 text-right w-24">Último día</th>
                    <th className="px-2 py-1 text-right w-28">Acum. mes</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.cuentas.map((c) => (
                    <tr key={c.id_cuenta} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5 truncate" title={c.cuenta}>{c.cuenta}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]"
                          title={fmtMoneyFull(c.valuacion)}>{fmtMoney(c.valuacion)}</td>
                      <td className="px-2 py-0.5 text-right"
                          title={fmtMoneyFull(c.arancel_dia)}>{fmtMoney(c.arancel_dia)}</td>
                      <td className="px-2 py-0.5 text-right"
                          title={fmtMoneyFull(c.arancel_acum)}>{fmtMoney(c.arancel_acum)}</td>
                    </tr>
                  ))}
                  {!detalle.cuentas.length && (
                    <tr><td colSpan={4} className="px-2 py-2 text-center
                          text-[var(--t-text-muted)]">sin cuentas en el mes</td></tr>
                  )}
                </tbody>
                {/* El total del desplegable tiene que dar el de la fila que lo abrió:
                    los dos salen del mismo cálculo en el backend. */}
                <tfoot>
                  <tr className="border-t border-[var(--t-border-2)]
                                 text-[var(--t-text-dim)]">
                    <td className="px-2 py-0.5">{detalle.cuentas.length} cuenta(s)</td>
                    <td />
                    <td className="px-2 py-0.5 text-right">{fmtMoney(detalle.total_dia)}</td>
                    <td className="px-2 py-0.5 text-right font-semibold">
                      {fmtMoney(detalle.total_acum)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ModalFees({ fees, onClose }: { fees: Fees | null; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] max-w-3xl w-full
                   max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b border-[var(--t-border)] flex items-center">
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
            Cómo se calcula
          </span>
          <button onClick={onClose}
                  className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
            ✕
          </button>
        </div>

        <div className="p-4 overflow-auto text-[11px] space-y-3">
          {!fees && <div className="text-[var(--t-text-muted)]">cargando…</div>}
          {fees && (
            <>
              <div className="font-mono text-[12px] text-[var(--t-accent)]">
                {fees.formula.texto}
              </div>
              <p className="text-[var(--t-text-dim)]">{fees.formula.por_que_mitad}</p>
              <p className="text-[var(--t-text-dim)]">{fees.formula.fines_de_semana}</p>

              {!!fees.sin_fee.length && (
                <p className="text-[var(--t-warn,orange)]">
                  {fees.sin_fee.length} fondo(s) no tienen fee cargado en Manager →
                  Títulos. Para esos el arancel no es cero: no se puede calcular.
                </p>
              )}

              <table className="w-full tabular-nums">
                <thead className="text-[9px] uppercase tracking-wide
                                  text-[var(--t-text-muted)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className="px-2 py-1 text-left">Gerente</th>
                    <th className="px-2 py-1 text-left">Fondo</th>
                    <th className="px-2 py-1 text-right w-28">Fee gerente</th>
                    <th className="px-2 py-1 text-right w-28">Fee ACA (50 %)</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.fondos.map((f) => (
                    <tr key={f.unidad} className="border-t border-[var(--t-border)]">
                      <td className="px-2 py-0.5 truncate">{f.gerente}</td>
                      <td className="px-2 py-0.5 truncate" title={f.unidad}>
                        {nombreFondo(f.unidad)}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                        {pct(f.fee_admin)}
                      </td>
                      <td className={"px-2 py-0.5 text-right "
                        + (f.fee_aca == null ? "text-[var(--t-warn,orange)]"
                                             : "text-[var(--t-accent)]")}>
                        {pct(f.fee_aca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
