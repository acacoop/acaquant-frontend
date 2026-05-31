"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useViewportKey } from "@/lib/use-viewport-key";
import { DualRange } from "./dual-range";

// ─────────────────────────────────────────────────────────────────
// Types — espejan el shape devuelto por
// /api/analitica/descomposicion-retorno y /rolldown-esperado.
// El backend ahora soporta curva tasa_fija | cer; los nombres genéricos
// (valor_ini, tasa_ini, tasa_curva_*) reemplazan los específicos viejos
// (precio_ini, tem_ini, tem_curva_*).
// ─────────────────────────────────────────────────────────────────

type Curva = "tasa_fija" | "cer";

interface BonoRealizado {
  ticker: string;
  ticker_corto?: string;
  tipo?: string;
  fecha_vencimiento?: string;
  vto_dias_ini: number;
  vto_dias_fin: number;
  precio_ini: number | null;
  precio_fin: number | null;
  // valor_ini/valor_fin = precio sucio (tasa_fija) o paridad (cer)
  valor_ini: number;
  valor_fin: number;
  // tasa_ini = TEM (tasa_fija) o TEA real (cer)
  tasa_ini: number;
  r_total: number;
  carry: number;
  rolldown: number;
  cambio_tasa: number;
  tasa_curva_ini_at_dias_fin: number;
  // Solo CER:
  cer_accrual?: number;
  r_total_ars?: number;
  is_zero_coupon?: boolean;
}

interface RealizadoResp {
  desde?: string;
  hasta?: string;
  dias?: number;
  metodo?: string;
  curva?: Curva;
  bonos?: BonoRealizado[];
  promedio_simple?: {
    r_total: number;
    carry: number;
    rolldown: number;
    cambio_tasa: number;
    cer_accrual?: number;
    r_total_ars?: number;
  } | null;
  cer_accrual_periodo?: number | null;
  cer_debug?: { cer_ini?: number; cer_fin?: number; fecha_cer_ini?: string; fecha_cer_fin?: string };
  error?: string;
}

interface BonoEsperado {
  ticker: string;
  ticker_corto?: string;
  tipo?: string;
  fecha_vencimiento?: string;
  precio: number | null;
  valor: number;
  tasa: number;
  vto_dias: number;
  vto_dias_horizonte: number;
  tasa_curva_at_horizonte: number;
  carry_esperado: number;
  rolldown_esperado: number;
  total_esperado: number;
  // Solo CER:
  cer_accrual_esperado?: number;
  total_esperado_ars?: number;
  is_zero_coupon?: boolean;
}

interface EsperadoResp {
  horizonte_dias?: number;
  metodo?: string;
  curva?: Curva;
  fecha?: string;
  bonos?: BonoEsperado[];
  cer_accrual_esperado?: number | null;
  cer_debug?: { n_meses_compoundeados?: number; medianas_mensuales?: number[]; fuente?: string };
  error?: string;
}

type SubTab = "realizado" | "esperado";
type Metodo = "lineal" | "cuadratica";

// ─────────────────────────────────────────────────────────────────
// Helpers de formato
// ─────────────────────────────────────────────────────────────────

function pct(n: number | undefined | null, decimals = 2): string {
  if (n == null || !isFinite(n)) return "--";
  return `${(n * 100).toFixed(decimals)}%`;
}

function pctSigned(n: number | undefined | null, decimals = 2): string {
  if (n == null || !isFinite(n)) return "--";
  const v = n * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function num(n: number | undefined | null, decimals = 4): string {
  if (n == null || !isFinite(n)) return "--";
  return n.toFixed(decimals);
}

function colorRet(n: number): string {
  if (n > 0) return "text-[#00cc66]";
  if (n < 0) return "text-[#ff3333]";
  return "text-[var(--t-text-dim)]";
}

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Ventana default = ~22 ruedas (≈ 1 mes hábil).
const VENTANA_DEFAULT_RUEDAS = 22;

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export function DescomposicionTab() {
  const [sub, setSub] = useState<SubTab>("realizado");
  const [metodo, setMetodo] = useState<Metodo>("lineal");
  const [curva, setCurva] = useState<Curva>("tasa_fija");

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 mr-3">
          <FilterBtn active={curva === "tasa_fija"} onClick={() => setCurva("tasa_fija")}>
            TASA FIJA
          </FilterBtn>
          <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
            CER
          </FilterBtn>
        </div>
        <span className="text-[10px] text-[var(--t-text-muted)] tracking-wider">VISTA</span>
        <div className="flex items-center gap-1 mr-3">
          <FilterBtn active={sub === "realizado"} onClick={() => setSub("realizado")}>
            REALIZADO
          </FilterBtn>
          <FilterBtn active={sub === "esperado"} onClick={() => setSub("esperado")}>
            ESPERADO
          </FilterBtn>
        </div>
        <span className="text-[10px] text-[var(--t-text-muted)] tracking-wider">MÉTODO</span>
        <div className="flex items-center gap-1">
          <FilterBtn active={metodo === "lineal"} onClick={() => setMetodo("lineal")}>
            LINEAL
          </FilterBtn>
          <FilterBtn active={metodo === "cuadratica"} onClick={() => setMetodo("cuadratica")}>
            CUADRÁTICA
          </FilterBtn>
        </div>
        <span className="text-[10px] text-[var(--t-text-muted)] ml-auto">
          {curva === "tasa_fija"
            ? "Lecap / Boncap (cupón cero, pesos)"
            : "Lecers (zero coupon) + Boncers cupón. Curva ref = solo Lecers."}
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {sub === "realizado" ? (
          <RealizadoView metodo={metodo} curva={curva} />
        ) : (
          <EsperadoView metodo={metodo} curva={curva} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REALIZADO — descomposición ex-post entre dos fechas
// ─────────────────────────────────────────────────────────────────

function RealizadoView({ metodo, curva }: { metodo: Metodo; curva: Curva }) {
  // Lista de fechas con trades reales para la curva elegida.
  const [fechas, setFechas] = useState<string[]>([]);
  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);
  const [data, setData] = useState<RealizadoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditIdx, setAuditIdx] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const vpKey = useViewportKey();

  // 1) Cuando cambia la curva, recargo el universo de fechas hábiles.
  useEffect(() => {
    let cancelled = false;
    setRangoIdx(null);
    setFechas([]);
    setAuditIdx(null);
    fetch(`/api/historico-curva?curva=${curva}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { fecha: string }[]) => {
        if (cancelled) return;
        const set = new Set(rows.map((r) => r.fecha));
        setFechas(Array.from(set).sort());
      })
      .catch(() => {
        if (!cancelled) setFechas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [curva]);

  const effectiveRango: [number, number] =
    fechas.length > 0
      ? rangoIdx == null
        ? [Math.max(0, fechas.length - 1 - VENTANA_DEFAULT_RUEDAS), fechas.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), fechas.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), fechas.length - 1),
          ]
      : [0, 0];

  const fechaDesde = fechas[effectiveRango[0]] || "";
  const fechaHasta = fechas[effectiveRango[1]] || "";

  useEffect(() => {
    if (!fechaDesde || !fechaHasta || fechaDesde === fechaHasta) {
      setData(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const url =
          `/api/analitica/descomposicion-retorno` +
          `?desde=${encodeURIComponent(fechaDesde)}` +
          `&hasta=${encodeURIComponent(fechaHasta)}` +
          `&metodo=${metodo}` +
          `&curva=${curva}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: RealizadoResp = await res.json();
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
          setAuditIdx(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fechaDesde, fechaHasta, metodo, curva]);

  const chartData = useMemo(() => {
    if (!data?.bonos) return [];
    return data.bonos.map((b) => {
      const base = {
        ticker: b.ticker_corto || b.ticker,
        carry: +(b.carry * 100).toFixed(4),
        rolldown: +(b.rolldown * 100).toFixed(4),
        cambio_tasa: +(b.cambio_tasa * 100).toFixed(4),
      };
      // CER suma una barra de cer_accrual (común a todos los bonos del período).
      return curva === "cer" && b.cer_accrual != null
        ? { ...base, cer_accrual: +(b.cer_accrual * 100).toFixed(4) }
        : base;
    });
  }, [data, curva]);

  const bonoSeleccionado = auditIdx != null && data?.bonos ? data.bonos[auditIdx] : null;

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 shrink-0 flex items-center gap-3 flex-wrap">
        {fechas.length < 2 ? (
          <span className="text-[10px] text-[var(--t-text-muted)]">cargando fechas…</span>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[300px]">
            <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[42px]">
              {fmtFechaCorta(fechaDesde)}
            </span>
            <DualRange
              min={0}
              max={fechas.length - 1}
              lo={effectiveRango[0]}
              hi={effectiveRango[1]}
              setLo={(v) => setRangoIdx([v, Math.max(v, effectiveRango[1])])}
              setHi={(v) => setRangoIdx([Math.min(v, effectiveRango[0]), v])}
            />
            <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[42px] text-right">
              {fmtFechaCorta(fechaHasta)}
            </span>
          </div>
        )}
        {data?.dias != null && (
          <span className="text-[10px] text-[var(--t-text-dim)] font-mono">
            {data.dias} días · {data.bonos?.length || 0} bonos
          </span>
        )}
        {curva === "cer" && data?.cer_accrual_periodo != null && (
          <span className="text-[10px] text-[#bb66ff] font-mono">
            CER accrual: {pctSigned(data.cer_accrual_periodo)}
          </span>
        )}
        {data?.promedio_simple && (
          <span className="text-[10px] text-[var(--t-text-dim)] font-mono ml-auto">
            promedio:{" "}
            <span className={colorRet(data.promedio_simple.r_total)}>
              {pctSigned(data.promedio_simple.r_total)}
            </span>
            {" · carry "}{pct(data.promedio_simple.carry)}
            {" · roll "}{pct(data.promedio_simple.rolldown)}
            {" · Δtasa "}{pctSigned(data.promedio_simple.cambio_tasa)}
            {curva === "cer" && data.promedio_simple.r_total_ars != null && (
              <>
                {" · ARS "}<span className={colorRet(data.promedio_simple.r_total_ars)}>{pctSigned(data.promedio_simple.r_total_ars)}</span>
              </>
            )}
          </span>
        )}
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px_auto] gap-3">
        {/* Chart */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 min-h-0">
          {error ? (
            <p className="text-[#ff3333] text-xs py-4 text-center">error: {error}</p>
          ) : !chartData.length ? (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              {loading ? "cargando…" : "sin datos en el período"}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 60, left: 4 }}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-50}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  formatter={(v) => `${Number(v).toFixed(3)}%`}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="carry" stackId="a" fill="#4a9eff" name="Carry" />
                <Bar dataKey="rolldown" stackId="a" fill="#ff9900" name="Roll-down" />
                <Bar dataKey="cambio_tasa" stackId="a" fill="#bb66ff" name="Δ Tasa" />
                {curva === "cer" && (
                  <Bar dataKey="cer_accrual" stackId="a" fill="#00cc66" name="CER" />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabla */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 overflow-y-auto min-h-0">
          {!data?.bonos?.length ? (
            <p className="text-[var(--t-text-muted)] text-[10px] py-4 text-center">--</p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="text-[var(--t-text-muted)]">
                  <th className="!px-1 text-left">TICKER</th>
                  <th className="!px-1 text-right">CARRY</th>
                  <th className="!px-1 text-right">ROLL</th>
                  <th className="!px-1 text-right">Δ TASA</th>
                  <th className="!px-1 text-right">{curva === "cer" ? "REAL" : "TOTAL"}</th>
                  {curva === "cer" && <th className="!px-1 text-right">ARS</th>}
                </tr>
              </thead>
              <tbody>
                {data.bonos.map((b, i) => {
                  const isSel = i === auditIdx;
                  return (
                    <tr
                      key={b.ticker}
                      onClick={() => {
                        setAuditIdx(i);
                        setAuditOpen(true);
                      }}
                      className={`cursor-pointer ${
                        isSel ? "bg-[var(--t-accent)]/15" : i % 2 === 0 ? "bg-[var(--t-panel)]" : ""
                      } hover:bg-[var(--t-border)]`}
                    >
                      <td className="!px-1 text-[var(--t-accent)]">{b.ticker_corto || b.ticker}</td>
                      <td className="!px-1 text-right text-[#4a9eff]">{pct(b.carry)}</td>
                      <td className="!px-1 text-right text-[var(--t-accent)]">{pct(b.rolldown)}</td>
                      <td className={`!px-1 text-right ${colorRet(b.cambio_tasa)}`}>
                        {pctSigned(b.cambio_tasa)}
                      </td>
                      <td className={`!px-1 text-right font-semibold ${colorRet(b.r_total)}`}>
                        {pctSigned(b.r_total)}
                      </td>
                      {curva === "cer" && (
                        <td className={`!px-1 text-right font-semibold ${colorRet(b.r_total_ars ?? 0)}`}>
                          {pctSigned(b.r_total_ars)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit drawer */}
        <AuditDrawer
          open={auditOpen}
          onToggle={() => setAuditOpen((v) => !v)}
        >
          {bonoSeleccionado ? (
            <AuditRealizado bono={bonoSeleccionado} curva={curva} dias={data?.dias || 0} />
          ) : (
            <p className="text-[10px] text-[var(--t-text-muted)] p-3">
              Click en una fila de la tabla para auditar el cálculo de ese bono.
            </p>
          )}
        </AuditDrawer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ESPERADO — qué bono rinde mejor a horizonte si la curva no se mueve
// ─────────────────────────────────────────────────────────────────

const HORIZONTES = [30, 60, 90] as const;

function EsperadoView({ metodo, curva }: { metodo: Metodo; curva: Curva }) {
  const [horizonte, setHorizonte] = useState<number>(30);
  const [data, setData] = useState<EsperadoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditIdx, setAuditIdx] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const url =
          `/api/analitica/rolldown-esperado` +
          `?horizonte_dias=${horizonte}` +
          `&metodo=${metodo}` +
          `&curva=${curva}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: EsperadoResp = await res.json();
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
          setAuditIdx(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [horizonte, metodo, curva]);

  const chartData = useMemo(() => {
    if (!data?.bonos) return [];
    return data.bonos.map((b) => ({
      ticker: b.ticker_corto || b.ticker,
      carry: +(b.carry_esperado * 100).toFixed(4),
      rolldown: +(b.rolldown_esperado * 100).toFixed(4),
      ...(curva === "cer" && b.cer_accrual_esperado != null
        ? { cer_accrual: +(b.cer_accrual_esperado * 100).toFixed(4) }
        : {}),
    }));
  }, [data, curva]);

  const bonoSeleccionado = auditIdx != null && data?.bonos ? data.bonos[auditIdx] : null;

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 shrink-0 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-[var(--t-text-muted)] tracking-wider">HORIZONTE</span>
        <div className="flex items-center gap-1">
          {HORIZONTES.map((h) => (
            <FilterBtn key={h} active={horizonte === h} onClick={() => setHorizonte(h)}>
              {h}D
            </FilterBtn>
          ))}
        </div>
        {data?.bonos && (
          <span className="text-[10px] text-[var(--t-text-dim)] font-mono">
            {data.bonos.length} bonos · curva al {data.fecha}
          </span>
        )}
        {curva === "cer" && data?.cer_accrual_esperado != null && (
          <span className="text-[10px] text-[#bb66ff] font-mono">
            CER esp ({data.cer_debug?.n_meses_compoundeados || 0}m REM): {pctSigned(data.cer_accrual_esperado)}
          </span>
        )}
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px_auto] gap-3">
        {/* Chart */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 min-h-0">
          {error ? (
            <p className="text-[#ff3333] text-xs py-4 text-center">error: {error}</p>
          ) : !chartData.length ? (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              {loading ? "cargando…" : "sin datos"}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 60, left: 4 }}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-50}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  formatter={(v) => `${Number(v).toFixed(3)}%`}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="carry" stackId="a" fill="#4a9eff" name="Carry" />
                <Bar dataKey="rolldown" stackId="a" fill="#ff9900" name="Roll-down" />
                {curva === "cer" && (
                  <Bar dataKey="cer_accrual" stackId="a" fill="#00cc66" name="CER esp" />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabla */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 overflow-y-auto min-h-0">
          {!data?.bonos?.length ? (
            <p className="text-[var(--t-text-muted)] text-[10px] py-4 text-center">--</p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="text-[var(--t-text-muted)]">
                  <th className="!px-1 text-left">TICKER</th>
                  <th className="!px-1 text-right">{curva === "cer" ? "TEA" : "TEM"}</th>
                  <th className="!px-1 text-right">CARRY</th>
                  <th className="!px-1 text-right">ROLL</th>
                  <th className="!px-1 text-right">{curva === "cer" ? "REAL" : "TOTAL"}</th>
                  {curva === "cer" && <th className="!px-1 text-right">ARS</th>}
                </tr>
              </thead>
              <tbody>
                {data.bonos.map((b, i) => {
                  const isSel = i === auditIdx;
                  return (
                    <tr
                      key={b.ticker}
                      onClick={() => {
                        setAuditIdx(i);
                        setAuditOpen(true);
                      }}
                      className={`cursor-pointer ${
                        isSel ? "bg-[var(--t-accent)]/15" : i % 2 === 0 ? "bg-[var(--t-panel)]" : ""
                      } hover:bg-[var(--t-border)]`}
                    >
                      <td className="!px-1 text-[var(--t-accent)]">{b.ticker_corto || b.ticker}</td>
                      <td className="!px-1 text-right text-[var(--t-text)]">{pct(b.tasa)}</td>
                      <td className="!px-1 text-right text-[#4a9eff]">{pct(b.carry_esperado)}</td>
                      <td className="!px-1 text-right text-[var(--t-accent)]">{pct(b.rolldown_esperado)}</td>
                      <td className="!px-1 text-right font-semibold text-[#00cc66]">
                        {pct(b.total_esperado)}
                      </td>
                      {curva === "cer" && (
                        <td className="!px-1 text-right font-semibold text-[#00cc66]">
                          {pct(b.total_esperado_ars)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Audit drawer */}
        <AuditDrawer open={auditOpen} onToggle={() => setAuditOpen((v) => !v)}>
          {bonoSeleccionado ? (
            <AuditEsperado
              bono={bonoSeleccionado}
              curva={curva}
              horizonte={horizonte}
              cerAccrualEsp={data?.cer_accrual_esperado ?? null}
            />
          ) : (
            <p className="text-[10px] text-[var(--t-text-muted)] p-3">
              Click en una fila de la tabla para auditar el cálculo de ese bono.
            </p>
          )}
        </AuditDrawer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Audit panel (drawer derecho colapsable)
// ─────────────────────────────────────────────────────────────────

function AuditDrawer({
  open, onToggle, children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border border-[var(--t-border)] bg-[var(--t-panel)] flex min-h-0 transition-[width] duration-150 ${
        open ? "w-[300px]" : "w-8"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-8 flex flex-col items-center justify-start py-2 text-[var(--t-text-muted)] hover:text-[var(--t-accent)] border-r border-[var(--t-border)] shrink-0"
        title={open ? "Cerrar audit" : "Abrir audit"}
      >
        <span className="text-[14px] leading-none mb-1">{open ? "›" : "‹"}</span>
        <span
          className="text-[9px] tracking-widest font-semibold"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          AUDIT
        </span>
      </button>
      {open && (
        <div className="flex-1 min-h-0 overflow-y-auto text-[10px] font-mono">
          {children}
        </div>
      )}
    </div>
  );
}

// Audit ex-post (Realizado): muestra inputs, descomposición, sanity check Fabozzi.
function AuditRealizado({
  bono, curva, dias,
}: {
  bono: BonoRealizado;
  curva: Curva;
  dias: number;
}) {
  const tasaLabel = curva === "cer" ? "TEA real" : "TEM";
  const valorLabel = curva === "cer" ? "Paridad" : "Precio sucio";
  const freq = curva === "cer" ? 365 : 30;

  // Sanity check Fabozzi (lineal): R ≈ −D × Δtasa + carry
  // Δtasa = tasa_curva_at_dias_fin − tasa_ini (en términos de la curva)
  // Para tasa_fija: Δtasa son TEMs, multiplico por 12 para anualizar.
  const dTasa = bono.tasa_curva_ini_at_dias_fin - bono.tasa_ini;
  const dTasaAnual = curva === "cer" ? dTasa : dTasa * 12;
  // Duration aproximada del bono: vto_dias_ini / freq (años o meses según convención)
  const durAprox = curva === "cer" ? bono.vto_dias_ini / 365 : bono.vto_dias_ini / 30;
  const fabozzi = -durAprox * dTasaAnual + bono.carry;
  const diff = bono.r_total - fabozzi;

  return (
    <div className="p-3 space-y-3">
      <div>
        <div className="text-[var(--t-accent)] text-[11px] font-semibold tracking-wide">
          {bono.ticker_corto || bono.ticker}
        </div>
        <div className="text-[var(--t-text-muted)] text-[9px]">
          {curva.toUpperCase()} · {dias} días · vto {bono.fecha_vencimiento}
        </div>
        {bono.is_zero_coupon === false && (
          <div className="text-[var(--t-accent)] text-[9px] mt-1">
            ⚠ Boncer cupón — descompuesto pero NO usado en curva ref
          </div>
        )}
      </div>

      <Section title="INPUTS">
        <Row label={`${valorLabel}_ini`} value={num(bono.valor_ini)} />
        <Row label={`${valorLabel}_fin`} value={num(bono.valor_fin)} />
        {curva === "cer" && bono.precio_ini && (
          <>
            <Row label="Precio_sucio_ini" value={num(bono.precio_ini, 2)} />
            <Row label="Precio_sucio_fin" value={num(bono.precio_fin, 2)} />
          </>
        )}
        <Row label={`${tasaLabel}_ini`} value={pct(bono.tasa_ini, 4)} />
        <Row label="vto_dias_ini" value={String(bono.vto_dias_ini)} />
        <Row label="vto_dias_fin" value={String(bono.vto_dias_fin)} />
        <Row label={`Curva_ini @ ${bono.vto_dias_fin}d`} value={pct(bono.tasa_curva_ini_at_dias_fin, 4)} />
        {curva === "cer" && bono.cer_accrual != null && (
          <Row label="CER_accrual" value={pctSigned(bono.cer_accrual)} highlight />
        )}
      </Section>

      <Section title="FÓRMULA">
        <pre className="text-[var(--t-text-dim)] text-[9px] leading-relaxed whitespace-pre-wrap">
{`R_total = ${valorLabel}_fin / ${valorLabel}_ini − 1
Carry = (1 + ${tasaLabel})^(${dias}/${freq}) − 1
Flujo = ${valorLabel}_ini × (1 + ${tasaLabel})^(${bono.vto_dias_ini}/${freq})
P_quieto = Flujo / (1 + curva_at_fin)^(${bono.vto_dias_fin}/${freq})
Roll = (P_quieto/${valorLabel}_ini) − 1 − Carry
ΔTasa = R_total − Carry − Roll`}
        </pre>
      </Section>

      <Section title="DESCOMPOSICIÓN">
        <Row label="R_total (paridad)" value={pctSigned(bono.r_total)} highlight />
        <Row label="Carry" value={pct(bono.carry)} color="#4a9eff" />
        <Row label="Roll-down" value={pct(bono.rolldown)} color="#ff9900" />
        <Row label="Δ Tasa" value={pctSigned(bono.cambio_tasa)} color="#bb66ff" />
        {curva === "cer" && bono.r_total_ars != null && (
          <Row label="R_total ARS" value={pctSigned(bono.r_total_ars)} highlight color="#00cc66" />
        )}
      </Section>

      <Section title="SANITY CHECK FABOZZI">
        <div className="text-[var(--t-text-dim)] text-[9px] mb-1">
          Aproximación lineal: R ≈ −Dur × ΔTasa_anual + Carry
        </div>
        <Row label="Dur aprox" value={num(durAprox, 3)} />
        <Row label={`Δ${tasaLabel}`} value={pctSigned(dTasa, 4)} />
        {curva === "tasa_fija" && (
          <Row label="ΔTasa anual" value={pctSigned(dTasaAnual, 3)} />
        )}
        <Row label="Fabozzi (lineal)" value={pctSigned(fabozzi)} />
        <Row label="Exacto vs Fabozzi" value={pctSigned(diff, 3)} />
        <div className="text-[var(--t-text-muted)] text-[9px] mt-1">
          La diferencia entre exacto y lineal viene de convexidad (cuadrático en Δtasa).
        </div>
      </Section>
    </div>
  );
}

// Audit ex-ante (Esperado): inputs + cálculo forward + sanity check.
function AuditEsperado({
  bono, curva, horizonte, cerAccrualEsp,
}: {
  bono: BonoEsperado;
  curva: Curva;
  horizonte: number;
  cerAccrualEsp: number | null;
}) {
  const tasaLabel = curva === "cer" ? "TEA real" : "TEM";
  const valorLabel = curva === "cer" ? "Paridad" : "Precio sucio";
  const freq = curva === "cer" ? 365 : 30;

  return (
    <div className="p-3 space-y-3">
      <div>
        <div className="text-[var(--t-accent)] text-[11px] font-semibold tracking-wide">
          {bono.ticker_corto || bono.ticker}
        </div>
        <div className="text-[var(--t-text-muted)] text-[9px]">
          {curva.toUpperCase()} · horizonte {horizonte}d · vto {bono.fecha_vencimiento}
        </div>
      </div>

      <Section title="INPUTS">
        <Row label={`${valorLabel}_actual`} value={num(bono.valor)} />
        {curva === "cer" && bono.precio && (
          <Row label="Precio_sucio" value={num(bono.precio, 2)} />
        )}
        <Row label={`${tasaLabel}_actual`} value={pct(bono.tasa, 4)} />
        <Row label="vto_dias" value={String(bono.vto_dias)} />
        <Row label={`vto a horizonte`} value={String(bono.vto_dias_horizonte)} />
        <Row
          label={`Curva @ ${bono.vto_dias_horizonte}d`}
          value={pct(bono.tasa_curva_at_horizonte, 4)}
        />
        {curva === "cer" && cerAccrualEsp != null && (
          <Row label="CER esp (REM)" value={pctSigned(cerAccrualEsp)} highlight />
        )}
      </Section>

      <Section title="FÓRMULA">
        <pre className="text-[var(--t-text-dim)] text-[9px] leading-relaxed whitespace-pre-wrap">
{`Carry = (1 + ${tasaLabel})^(${horizonte}/${freq}) − 1
Flujo = ${valorLabel} × (1 + ${tasaLabel})^(${bono.vto_dias}/${freq})
P_esp = Flujo / (1 + curva_horizonte)^(${bono.vto_dias_horizonte}/${freq})
Roll = (P_esp/${valorLabel}) − 1 − Carry
Total = Carry + Roll${curva === "cer" ? "\nTotal_ARS = (1+Total)(1+CER_esp) − 1" : ""}`}
        </pre>
      </Section>

      <Section title="PROYECCIÓN">
        <Row label="Carry esp" value={pct(bono.carry_esperado)} color="#4a9eff" />
        <Row label="Roll esp" value={pct(bono.rolldown_esperado)} color="#ff9900" />
        <Row label="Total real" value={pct(bono.total_esperado)} highlight />
        {curva === "cer" && bono.total_esperado_ars != null && (
          <Row
            label="Total ARS"
            value={pct(bono.total_esperado_ars)}
            highlight
            color="#00cc66"
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest text-[var(--t-accent)] font-semibold mb-1">
        {title}
      </div>
      <div className="bg-[var(--t-panel)] border border-[var(--t-border)] p-2 space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function Row({
  label, value, color, highlight,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--t-text-dim)] truncate">{label}</span>
      <span
        className={`tabular-nums ${highlight ? "font-semibold" : ""}`}
        style={{ color: color || "#d0d0d0" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────

function FilterBtn({
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
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
