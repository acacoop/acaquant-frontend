"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";
import type {
  Companeros,
  DayTradingResp,
  DayTradingRow,
  TapeTrade,
} from "@/lib/types-estrategia";
import { AccionChip } from "./estrategia-shared";
import { TableHelp } from "./help-tooltip";
import { DerivadosOperar } from "./derivados-operar";
import { Panel } from "./panel";
import { TickerChartPanel } from "./ticker-chart-panel";

/**
 * TRADE LAB — asistente de day-trading intradía de CEDEARs.
 *
 * Layout 50/50: tabla consolidada a la IZQUIERDA (ranking por vueltas),
 * DERECHA el chart del papel seleccionado (reusa TickerChartPanel del
 * Scanner: LIVE con nuestro feed / histórico TradingView / retornos) +
 * el detalle (LA CUENTA, idea, se mueve con/contra, tape). Sin selección,
 * la derecha muestra el manual rápido en criollo.
 *
 * Backend: GET /api/scanner/day-trading (api/services/day_trading.py) +
 * /api/scanner/companeros/{t} + /api/scanner/cedears/trades.
 */

const GLOSARIO = [
  { label: "VUELTAS",       text: "Cuántas veces HOY el papel ya hizo un movimiento completo del tamaño que buscás (subida o bajada — long y short valen igual). Es LA columna: un papel con 6 vueltas de 0.5% viene dando seis chances en el día; uno con 0, ninguna. Se mide sobre los precios por minuto del tape." },
  { label: "PROM (COSTUMBRE)", text: "Cuántas vueltas de ese tamaño hace EN PROMEDIO por rueda (últimas ~20 ruedas). El día puede mentir; la costumbre no: un papel que da 4 vueltas por día es tu cancha, uno que da 0.5 no. Se acumula desde que el cron nocturno empezó a guardar el resumen diario." },
  { label: "AHORA",         text: "La pata en curso: cuánto lleva recorrido el movimiento ACTUAL desde el último pivote. Si buscás 0.5% y la pata va +0.4%, estás llegando tarde para sumarte — o cerca de que pague el fade. Verde sube, rojo baja. El tooltip agrega el movimiento de los últimos 15' y el lado del VWAP." },
  { label: "FLUJO",         text: "De toda la plata operada hoy con lado conocido, qué % fue COMPRA (agresor comprador). Arriba de ~60% los compradores dominan; abajo de ~40%, los vendedores. El tooltip muestra el flujo de los últimos 30 minutos — el ahora." },
  { label: "RANGO",         text: "La barrita es el recorrido del día (mínimo → máximo) y la marca naranja es dónde está parado AHORA: pegado a la izquierda = en los pisos del día, a la derecha = en los techos. El tooltip trae los precios y el ancho del rango en %." },
  { label: "HOY %",         text: "Variación contra el cierre de ayer. Te dice si el papel viene verde o rojo en el día." },
  { label: "SPREAD",        text: "La diferencia entre la punta compradora y la vendedora, en %. Es lo que pagás por entrar y salir YA (comprás caro al offer, vendés barato al bid). REGLA DE ORO: si el spread es más de la mitad de tu objetivo, el trade nace perdiendo — por eso se pinta rojo." },
  { label: "💤 DORMIDO",    text: "El papel no opera hace más de 10 minutos: la fila se atenúa. Por buena que sea su estadística, sin trades no hay quién te compre ni te venda AHORA." },
  { label: "TU MONTO",      text: "El tamaño que pensás operar. El lab lo usa para avisarte si tu monto es grande contra lo que el papel operó hoy (si sos el 20% del volumen, entrar y salir te va a mover el precio en contra)." },
  { label: "OPERAR",        text: "Si tenés permiso de operar (módulo admin), al elegir un papel aparece el book en vivo con la boleta: click en una punta carga precio y tamaño, elegís cuenta y mandás la orden ahí mismo. Es el mismo motor de órdenes del módulo OPERAR." },
  { label: "IDEA",          text: "Sugerencia orientativa con su porqué (pasá el mouse): cerca del piso del día → LONG de rebote; cerca del techo → SHORT; empujando fuerte con VWAP a favor → seguir el impulso. NO es recomendación: es para mirar primero los candidatos con sentido." },
  { label: "SE MUEVE CON",  text: "Papeles que históricamente acompañan (o van al revés de) el elegido, según los cierres diarios del último año. Útil para no abrir dos trades que son LA MISMA apuesta, o para buscar el espejo short de un long." },
  { label: "ALERTAS",       text: "Avisos cuando un papel toca el piso/techo del día, se mueve fuerte en 15', cruza el VWAP o ARRANCA UNA PATA del tamaño que buscás. Funcionan con la pestaña abierta; activá el permiso de notificaciones para verlas desde otra ventana." },
];

const OBJETIVOS = [0.5, 0.75, 1, 1.5];
const MONTO_PRESETS = [
  { label: "500k", value: 500_000 },
  { label: "1M",   value: 1_000_000 },
  { label: "3M",   value: 3_000_000 },
  { label: "5M",   value: 5_000_000 },
];
const POLL_MS = 10_000;

type SortKey = "vueltas" | "prom_vueltas" | "rango_pct" | "dia_pct" | "spread_pct" | "flujo_compra_pct";

// ── Alertas ──────────────────────────────────────────────────────────

type AlertaTipo = "piso" | "techo" | "mueve15" | "vwap" | "pata";

interface ReglaAlerta {
  id: string;
  ticker: string; // "*" = todos
  tipo: AlertaTipo;
  umbral?: number; // solo mueve15 (en %)
}

interface AlertaDisparada {
  hora: string;
  ticker: string;
  msg: string;
}

const TIPO_LABEL: Record<AlertaTipo, string> = {
  piso:    "toca el PISO del día",
  techo:   "toca el TECHO del día",
  mueve15: "se mueve fuerte en 15'",
  vwap:    "cruza el VWAP",
  pata:    "arranca una pata ≥ objetivo",
};

function evaluarAlertas(
  reglas: ReglaAlerta[],
  rows: DayTradingRow[],
  prev: Map<string, DayTradingRow>,
  objetivo: number,
): AlertaDisparada[] {
  const out: AlertaDisparada[] = [];
  const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  for (const r of rows) {
    const p = prev.get(r.ticker);
    if (!p) continue; // primera pasada: solo armar estado, no disparar
    for (const reg of reglas) {
      if (reg.ticker !== "*" && reg.ticker !== r.ticker) continue;
      if (reg.tipo === "piso" && r.posicion != null && p.posicion != null
          && r.posicion <= 3 && p.posicion > 3) {
        out.push({ hora, ticker: r.ticker, msg: `${r.ticker} tocó el PISO del día ($${r.last ?? "?"})` });
      }
      if (reg.tipo === "techo" && r.posicion != null && p.posicion != null
          && r.posicion >= 97 && p.posicion < 97) {
        out.push({ hora, ticker: r.ticker, msg: `${r.ticker} tocó el TECHO del día ($${r.last ?? "?"})` });
      }
      if (reg.tipo === "mueve15" && r.mom15_pct != null && p.mom15_pct != null) {
        const u = reg.umbral ?? 0.5;
        if (Math.abs(r.mom15_pct) >= u && Math.abs(p.mom15_pct) < u) {
          out.push({
            hora, ticker: r.ticker,
            msg: `${r.ticker} ${r.mom15_pct > 0 ? "subió" : "bajó"} ${Math.abs(r.mom15_pct).toFixed(2)}% en 15'`,
          });
        }
      }
      if (reg.tipo === "pata" && r.pata && Math.abs(r.pata.pct) >= objetivo
          && (!p.pata || Math.abs(p.pata.pct) < objetivo || p.pata.dir !== r.pata.dir)) {
        out.push({
          hora, ticker: r.ticker,
          msg: `${r.ticker} está haciendo una pata de ${r.pata.pct > 0 ? "+" : ""}${r.pata.pct.toFixed(2)}% AHORA`,
        });
      }
      if (reg.tipo === "vwap" && r.vs_vwap_pct != null && p.vs_vwap_pct != null
          && Math.sign(r.vs_vwap_pct) !== Math.sign(p.vs_vwap_pct)
          && Math.abs(r.vs_vwap_pct) >= 0.05) {
        out.push({
          hora, ticker: r.ticker,
          msg: `${r.ticker} cruzó el VWAP hacia ${r.vs_vwap_pct > 0 ? "ARRIBA (compradores)" : "ABAJO (vendedores)"}`,
        });
      }
    }
  }
  return out;
}

// ── Helpers visuales ─────────────────────────────────────────────────

function fmtPctS(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-[var(--t-text-muted)]";
  return v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

/** Barra low→high con el marcador de dónde está el precio ahora. */
function RangoBar({ r }: { r: DayTradingRow }) {
  if (r.posicion == null) return <span className="text-[var(--t-text-muted)]">--</span>;
  return (
    <span
      className="relative inline-block w-full h-[8px] bg-[var(--t-border)] align-middle"
      title={`rango hoy ${r.rango_pct ?? "?"}% · mín $${r.low ?? "?"} · máx $${r.high ?? "?"} — está al ${r.posicion.toFixed(0)}%`}
    >
      <span
        className="absolute top-[-2px] h-[12px] w-[3px] bg-[var(--t-accent)]"
        style={{ left: `calc(${r.posicion}% - 1px)` }}
      />
    </span>
  );
}

// ── Vista principal ──────────────────────────────────────────────────

export function TradeLabView({ puedeOperar = false }: { puedeOperar?: boolean }) {
  const [monto, setMonto] = usePersistedState<number>("estrategia.tl.montoArs", 1_000_000);
  const [objetivo, setObjetivo] = usePersistedState<number>("estrategia.tl.objetivo", 0.5);
  const [soloOperables, setSoloOperables] = usePersistedState<boolean>("estrategia.tl.operables", false);
  const [filtro, setFiltro] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "vueltas", dir: -1 });
  const [sel, setSel] = usePersistedState<string | null>("estrategia.tl.sel", null);

  const endpoint = `/api/scanner/day-trading?objetivo=${objetivo}`;
  const initial = useMemo<DayTradingResp>(
    () => ({ objetivo_pct: objetivo, generado: "", en_rueda: false, rows: [] }),
    [objetivo],
  );
  const { data, lastAt } = usePoll<DayTradingResp>(endpoint, initial, POLL_MS, { fetchOnMount: true });

  // ── Alertas ────────────────────────────────────────────────────────
  const [reglas, setReglas] = usePersistedState<ReglaAlerta[]>("estrategia.tl.reglas", []);
  const [disparadas, setDisparadas] = useState<AlertaDisparada[]>([]);
  const [alertasOpen, setAlertasOpen] = useState(false);
  const [notifOk, setNotifOk] = useState(false);
  const prevRowsRef = useRef<Map<string, DayTradingRow>>(new Map());
  const reglasRef = useRef(reglas);
  reglasRef.current = reglas;

  useEffect(() => {
    setNotifOk(typeof Notification !== "undefined" && Notification.permission === "granted");
  }, []);

  useEffect(() => {
    if (!data.rows.length) return;
    const nuevas = evaluarAlertas(reglasRef.current, data.rows, prevRowsRef.current, data.objetivo_pct);
    prevRowsRef.current = new Map(data.rows.map((r) => [r.ticker, r]));
    if (!nuevas.length) return;
    setDisparadas((prev) => [...nuevas, ...prev].slice(0, 50));
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const a of nuevas) new Notification("TRADE LAB", { body: a.msg });
    }
  }, [data]);

  // ── Filtrado + orden ───────────────────────────────────────────────
  const rows = useMemo(() => {
    let r = data.rows;
    if (soloOperables) {
      r = r.filter(
        (x) => x.spread_pct != null && x.spread_pct <= objetivo / 2 && (x.total_money ?? 0) > 0,
      );
    }
    const q = filtro.trim().toUpperCase();
    if (q) {
      r = r.filter(
        (x) => x.ticker.includes(q) || (x.nombre ?? "").toUpperCase().includes(q)
          || (x.sector ?? "").toUpperCase().includes(q),
      );
    }
    const { key, dir } = sort;
    return [...r].sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va == null) return 1;
      if (vb == null) return -1;
      return (Number(va) - Number(vb)) * dir;
    });
  }, [data.rows, soloOperables, filtro, sort, objetivo]);

  const selRow = useMemo(() => data.rows.find((r) => r.ticker === sel) ?? null, [data.rows, sel]);

  const th = (label: string, key: SortKey, title?: string) => (
    <th
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === -1 ? 1 : -1) : -1 }))}
      title={title}
      className="!px-1.5 !py-1 text-right text-[9px] tracking-wider cursor-pointer hover:text-[var(--t-accent)]"
    >
      {label}{sort.key === key ? (sort.dir === -1 ? " ▼" : " ▲") : ""}
    </th>
  );

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2">
      {/* ── Controles ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">TU MONTO $</span>
          <input
            value={monto ? monto.toLocaleString("es-AR") : ""}
            onChange={(e) => {
              const d = e.target.value.replace(/[^\d]/g, "");
              setMonto(d ? Number(d) : 0);
            }}
            inputMode="numeric"
            className="w-[100px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-right font-mono text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          />
          {MONTO_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setMonto(p.value)}
              className={`px-1.5 py-1 text-[9px] font-semibold border transition-colors ${
                monto === p.value
                  ? "text-[var(--t-accent)] border-[var(--t-accent)]/50"
                  : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </span>

        <span className="flex items-center gap-1 pl-2 border-l border-[var(--t-border)]">
          <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">BUSCO</span>
          {OBJETIVOS.map((o) => (
            <button
              key={o}
              onClick={() => setObjetivo(o)}
              className={`px-2 py-1 text-[10px] font-bold tabular-nums border transition-colors ${
                objetivo === o
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}
            >
              {o}%
            </button>
          ))}
        </span>

        <button
          onClick={() => setSoloOperables((v) => !v)}
          title="Esconde los papeles cuyo spread se come más de la mitad del objetivo o que no operaron plata hoy"
          className={`px-2 py-1 text-[9px] font-semibold tracking-wider border transition-colors ${
            soloOperables
              ? "text-[var(--t-pos)] border-[var(--t-pos)]/50 bg-[var(--t-pos)]/10"
              : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-text)]"
          }`}
        >
          SOLO OPERABLES
        </button>

        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="buscar papel…"
          className="w-[100px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
        />

        <button
          onClick={() => setAlertasOpen((v) => !v)}
          className={`px-2 py-1 text-[9px] font-semibold tracking-wider border transition-colors ${
            alertasOpen || reglas.length
              ? "text-[var(--t-accent)] border-[var(--t-accent)]/50"
              : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
          }`}
        >
          🔔 ALERTAS{reglas.length ? ` (${reglas.length})` : ""}
        </button>

        <TableHelp entries={GLOSARIO} />

        <span className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-[var(--t-text-muted)] tabular-nums">
            {!data.en_rueda && lastAt > 0 ? "sin rueda en curso" : lastAt > 0 ? "● live" : "cargando…"}
          </span>
          <ComoSeUsa puedeOperar={puedeOperar} />
        </span>
      </div>

      {/* ── Panel de alertas ────────────────────────────────────────── */}
      {alertasOpen && (
        <AlertasPanel
          reglas={reglas}
          setReglas={setReglas}
          disparadas={disparadas}
          notifOk={notifOk}
          setNotifOk={setNotifOk}
          tickers={data.rows.map((r) => r.ticker)}
        />
      )}

      {/* ── 50/50: tabla | chart + detalle ──────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 flex-1 min-h-0">
        {/* IZQUIERDA: ranking consolidado */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[320px] overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border-2)] z-10">
                <tr className="text-[var(--t-text-muted)]">
                  <th className="!px-1.5 !py-1 text-left text-[9px] tracking-wider">PAPEL</th>
                  {th("HOY", "dia_pct", "Variación vs cierre de ayer")}
                  {th("RANGO", "rango_pct", "Mín→máx del día; la marca naranja es dónde está AHORA")}
                  {th(`V≥${objetivo}%`, "vueltas", "VUELTAS: movimientos completos del tamaño buscado que YA hizo hoy")}
                  {th("PROM", "prom_vueltas", "Costumbre: vueltas promedio por rueda (~20 ruedas)")}
                  <th className="!px-1.5 !py-1 text-right text-[9px] tracking-wider" title="Pata en curso: cuánto lleva recorrido el movimiento ACTUAL">AHORA</th>
                  {th("FLUJO", "flujo_compra_pct", "% de la plata de hoy que fue COMPRA — tooltip: últimos 30' y VWAP")}
                  {th("SPREAD", "spread_pct", "Lo que te come entrar y salir — rojo si es más de la mitad del objetivo")}
                  <th className="!px-1.5 !py-1 text-center text-[9px] tracking-wider">IDEA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const spreadMalo = r.spread_pct != null && r.spread_pct > objetivo / 2;
                  const dormido = r.min_sin_operar != null && r.min_sin_operar > 10;
                  return (
                    <tr
                      key={r.ticker}
                      onClick={() => setSel(r.ticker === sel ? null : r.ticker)}
                      className={`border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)] ${sel === r.ticker ? "bg-[var(--t-accent)]/10" : ""} ${dormido ? "opacity-50" : ""}`}
                      title={dormido ? `Sin operar hace ${r.min_sin_operar}' — ojo con la liquidez ahora` : undefined}
                    >
                      <td
                        className="!px-1.5 !py-1 font-mono font-semibold text-[var(--t-accent)]"
                        title={`${r.nombre ?? ""}${r.last != null ? ` · último $${r.last.toLocaleString("es-AR")}` : ""}${r.total_money != null ? ` · operó ${fmtMoney(r.total_money)}` : ""}${r.volumen_nominal != null ? ` · ${Math.round(r.volumen_nominal).toLocaleString("es-AR")} nominales` : ""}`}
                      >
                        {r.ticker}
                        {dormido && <span className="ml-1 text-[8px] text-[var(--t-text-muted)]">💤{r.min_sin_operar}{"'"}</span>}
                      </td>
                      <td className={`!px-1.5 !py-1 text-right font-mono tabular-nums ${pctClass(r.dia_pct)}`}>
                        {fmtPctS(r.dia_pct)}
                      </td>
                      <td className="!px-1 !py-1 w-[72px]"><RangoBar r={r} /></td>
                      <td
                        className="!px-1.5 !py-1 text-right"
                        title={r.mejor_vuelta_pct != null ? `Mejor pata del día: ${r.mejor_vuelta_pct}%${r.vueltas_hora != null ? ` · ritmo ~${r.vueltas_hora}/hora` : ""}` : undefined}
                      >
                        <span className={`font-mono tabular-nums font-bold text-[13px] ${
                          r.vueltas >= 4 ? "text-[var(--t-pos)]" : r.vueltas >= 2 ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"
                        }`}>
                          {r.vueltas}
                        </span>
                      </td>
                      <td
                        className="!px-1.5 !py-1 text-right font-mono tabular-nums text-[var(--t-text-dim)]"
                        title={r.prom_dias ? `Promedio sobre ${r.prom_dias} ruedas` : "Todavía sin historial — el cron nocturno lo va acumulando"}
                      >
                        {r.prom_vueltas != null ? r.prom_vueltas.toFixed(1) : "--"}
                      </td>
                      <td
                        className={`!px-1.5 !py-1 text-right font-mono tabular-nums ${r.pata ? (r.pata.pct >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]") : "text-[var(--t-text-muted)]"}`}
                        title={r.pata ? `Pata ${r.pata.dir === "long" ? "alcista" : "bajista"} en curso${r.mom15_pct != null ? ` · 15': ${fmtPctS(r.mom15_pct)}` : ""}${r.vs_vwap_pct != null ? ` · VWAP ${r.vs_vwap_pct >= 0 ? "↑" : "↓"}${Math.abs(r.vs_vwap_pct).toFixed(2)}%` : ""}` : undefined}
                      >
                        {r.pata ? fmtPctS(r.pata.pct) : "--"}
                      </td>
                      <td
                        className={`!px-1.5 !py-1 text-right font-mono tabular-nums ${
                          r.flujo_compra_pct == null ? "text-[var(--t-text-muted)]"
                          : r.flujo_compra_pct >= 60 ? "text-[var(--t-pos)]"
                          : r.flujo_compra_pct <= 40 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
                        }`}
                        title={`${r.flujo30_compra_pct != null ? `Últimos 30': ${r.flujo30_compra_pct.toFixed(0)}% compra` : ""}${r.vs_vwap_pct != null ? ` · VWAP ${r.vs_vwap_pct >= 0 ? "↑ arriba" : "↓ abajo"}` : ""}`}
                      >
                        {r.flujo_compra_pct != null ? `${r.flujo_compra_pct.toFixed(0)}%C` : "--"}
                      </td>
                      <td
                        className={`!px-1.5 !py-1 text-right font-mono tabular-nums ${spreadMalo ? "text-[var(--t-neg)] font-semibold" : "text-[var(--t-text)]"}`}
                        title={spreadMalo ? "El spread se come más de la mitad del objetivo — el trade nace perdiendo" : undefined}
                      >
                        {r.spread_pct != null ? `${r.spread_pct.toFixed(2)}%` : "--"}
                      </td>
                      <td className="!px-1.5 !py-1 text-center" title={r.idea?.motivo}>
                        {r.idea ? <AccionChip accion={r.idea.lado} /> : <span className="text-[var(--t-text-muted)]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lastAt > 0 && rows.length === 0 && (
              <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">
                {data.en_rueda
                  ? "Ningún papel pasa los filtros — probá sacando SOLO OPERABLES o bajando el objetivo."
                  : "Sin rueda en curso: el ranking se arma con los trades del día (13:20–20:00 UTC, L-V)."}
              </p>
            )}
          </div>
        </div>

        {/* DERECHA: chart + detalle (o el manual si no hay selección) */}
        <div className="min-h-0 grid grid-rows-[3fr_2fr] gap-2">
          <Panel title={sel ? `CHART — ${sel}` : "CHART"} expandable fill>
            <TickerChartPanel ticker={sel} />
          </Panel>
          {sel ? (
            <DetallePapel
              row={selRow}
              ticker={sel}
              monto={monto}
              puedeOperar={puedeOperar}
              onClose={() => setSel(null)}
            />
          ) : (
            <ManualRapido puedeOperar={puedeOperar} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual: contenido compartido (panel derecho + modal CÓMO SE USA) ──

function ManualContenido({ puedeOperar }: { puedeOperar: boolean }) {
  return (
    <div className="p-3 text-[11px] text-[var(--t-text-dim)] leading-relaxed flex flex-col gap-1.5">
      <p><span className="text-[var(--t-accent)] font-semibold">1.</span> Poné <span className="text-[var(--t-text)]">tu monto</span> y el movimiento que <span className="text-[var(--t-text)]">buscás capturar</span> (0.5%, 1%…).</p>
      <p><span className="text-[var(--t-accent)] font-semibold">2.</span> La tabla rankea por <span className="text-[var(--t-text)]">VUELTAS</span>: cuántas veces HOY cada papel ya hizo un movimiento de ese tamaño. <span className="text-[var(--t-text)]">PROM</span> es su costumbre histórica.</p>
      <p><span className="text-[var(--t-accent)] font-semibold">3.</span> Mirá <span className="text-[var(--t-text)]">AHORA</span> (la pata en curso) y <span className="text-[var(--t-text)]">FLUJO</span> (quién empuja: compra o venta). La barrita de RANGO te dice si está en los pisos o techos del día.</p>
      <p><span className="text-[var(--t-accent)] font-semibold">4.</span> <span className="text-[var(--t-neg)]">SPREAD en rojo = no hay trade</span>: te come más de la mitad del premio. Activá SOLO OPERABLES para esconderlos. 💤 = no opera hace +10&apos;.</p>
      <p><span className="text-[var(--t-accent)] font-semibold">5.</span> Click en un papel → chart en vivo{puedeOperar ? <>, <span className="text-[var(--t-text)]">el book con la boleta para mandar la orden ahí mismo</span> (click en una punta carga precio y tamaño)</> : ""}, con qué papeles se mueve y el tape.</p>
      <p><span className="text-[var(--t-accent)] font-semibold">6.</span> Armá <span className="text-[var(--t-text)]">🔔 ALERTAS</span> (&quot;arranca una pata&quot;, &quot;toca el piso&quot;, &quot;cruza el VWAP&quot;) y dejá que el lab mire por vos.</p>
      <p className="text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)] pt-1.5 mt-1">
        La IDEA (LONG/SHORT) es orientativa, no recomendación. Todo sale de nuestro feed
        BYMA en vivo; el ranking solo tiene datos en horario de rueda. El glosario completo
        está en el <span className="text-[var(--t-accent)]">?</span> de arriba.
      </p>
    </div>
  );
}

function ManualRapido({ puedeOperar }: { puedeOperar: boolean }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 text-[11px] font-semibold text-[var(--t-accent)] tracking-wide shrink-0">
        CÓMO SE USA
      </div>
      <ManualContenido puedeOperar={puedeOperar} />
    </div>
  );
}

/** Botón "CÓMO SE USA" de la barra superior → abre el manual en un modal. */
function ComoSeUsa({ puedeOperar }: { puedeOperar: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2 py-1 text-[9px] font-semibold tracking-wider border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
      >
        CÓMO SE USA
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--t-panel)]/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] max-w-[560px] w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-surface)]">
              <span className="text-[11px] tracking-wide uppercase text-[var(--t-accent)] font-semibold">
                Cómo se usa
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--t-text-dim)] hover:text-[#ffffff] text-[14px] leading-none px-1 transition-colors"
                aria-label="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
            <ManualContenido puedeOperar={puedeOperar} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Panel de alertas ─────────────────────────────────────────────────

function AlertasPanel({
  reglas, setReglas, disparadas, notifOk, setNotifOk, tickers,
}: {
  reglas: ReglaAlerta[];
  setReglas: React.Dispatch<React.SetStateAction<ReglaAlerta[]>>;
  disparadas: AlertaDisparada[];
  notifOk: boolean;
  setNotifOk: (v: boolean) => void;
  tickers: string[];
}) {
  const [tk, setTk] = useState("*");
  const [tipo, setTipo] = useState<AlertaTipo>("pata");
  const [umbral, setUmbral] = useState("0.5");

  return (
    <div className="border border-[var(--t-accent)]/30 bg-[var(--t-accent)]/5 p-2 flex flex-col gap-2 shrink-0 text-[10px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[var(--t-accent)] font-semibold tracking-wider">NUEVA ALERTA:</span>
        <select
          value={tk}
          onChange={(e) => setTk(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] font-mono text-[var(--t-text)]"
        >
          <option value="*">CUALQUIER PAPEL</option>
          {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as AlertaTipo)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] text-[var(--t-text)]"
        >
          {(Object.keys(TIPO_LABEL) as AlertaTipo[]).map((t) => (
            <option key={t} value={t}>{TIPO_LABEL[t]}</option>
          ))}
        </select>
        {tipo === "mueve15" && (
          <span className="flex items-center gap-1">
            ≥
            <input
              value={umbral}
              onChange={(e) => setUmbral(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-[44px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] text-right font-mono text-[var(--t-text)]"
            />
            %
          </span>
        )}
        <button
          onClick={() => {
            const u = Number(umbral.replace(",", ".")) || 0.5;
            setReglas((prev) => [
              ...prev,
              { id: `${Date.now()}`, ticker: tk, tipo, ...(tipo === "mueve15" ? { umbral: u } : {}) },
            ]);
          }}
          className="px-2 py-0.5 font-semibold border border-[var(--t-accent)]/50 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 transition-colors"
        >
          AGREGAR
        </button>
        {!notifOk && typeof Notification !== "undefined" && (
          <button
            onClick={() => {
              void Notification.requestPermission().then((p) => setNotifOk(p === "granted"));
            }}
            className="px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
            title="Para ver los avisos aunque estés en otra ventana"
          >
            ACTIVAR NOTIFICACIONES
          </button>
        )}
      </div>

      {reglas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {reglas.map((r) => (
            <span key={r.id} className="flex items-center gap-1 px-1.5 py-0.5 border border-[var(--t-border-2)] font-mono">
              {r.ticker === "*" ? "TODOS" : r.ticker} · {TIPO_LABEL[r.tipo]}{r.tipo === "mueve15" ? ` ≥${r.umbral}%` : ""}
              <button
                onClick={() => setReglas((prev) => prev.filter((x) => x.id !== r.id))}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)]"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {disparadas.length > 0 && (
        <div className="max-h-[90px] overflow-y-auto border-t border-[var(--t-border)] pt-1 flex flex-col gap-0.5">
          {disparadas.map((a, i) => (
            <div key={i} className="flex gap-2 font-mono tabular-nums">
              <span className="text-[var(--t-text-muted)]">{a.hora}</span>
              <span className="text-[var(--t-text)]">{a.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detalle del papel seleccionado ───────────────────────────────────

function DetallePapel({
  row, ticker, monto, puedeOperar, onClose,
}: {
  row: DayTradingRow | null;
  ticker: string;
  monto: number;
  puedeOperar: boolean;
  onClose: () => void;
}) {
  const [comp, setComp] = useState<Companeros | null>(null);
  const [tape, setTape] = useState<TapeTrade[]>([]);

  // Compañeros (correlación EOD) — 1 fetch por selección, backend cachea 300s.
  useEffect(() => {
    let alive = true;
    fetch(`/api/scanner/companeros/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Companeros | null) => {
        if (alive) setComp(j);
      })
      .catch(() => { if (alive) setComp(null); });
    return () => { alive = false; };
  }, [ticker]);

  // Tape — poll liviano mientras está seleccionado.
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`/api/scanner/cedears/trades?ticker=${encodeURIComponent(ticker)}&limite=10`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((j: TapeTrade[]) => { if (alive) setTape(j ?? []); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, [ticker]);

  const pesoEnElDia = row?.total_money && monto ? (monto / row.total_money) * 100 : null;
  const conBoleta = puedeOperar && !!row?.ticker_full;

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2 shrink-0">
        <span className="font-mono font-bold text-[13px] text-[var(--t-accent)]">{ticker}</span>
        {row?.nombre && <span className="text-[10px] text-[var(--t-text-dim)] truncate">{row.nombre}</span>}
        {row?.last != null && (
          <span className="text-[10px] font-mono tabular-nums text-[var(--t-text)]">
            ${row.last.toLocaleString("es-AR")}
          </span>
        )}
        {row?.vs_vwap_pct != null && (
          <span className={`text-[9px] font-mono ${pctClass(row.vs_vwap_pct)}`}>
            VWAP {row.vs_vwap_pct >= 0 ? "↑" : "↓"}{Math.abs(row.vs_vwap_pct).toFixed(2)}%
          </span>
        )}
        {(row?.total_money != null || row?.volumen_nominal != null) && (
          <span
            className="text-[9px] font-mono tabular-nums text-[var(--t-text-dim)]"
            title={`Volumen del día${row?.total_money != null ? ` · cash ${fmtMoneyFull(row.total_money)}` : ""}${row?.volumen_nominal != null ? ` · ${Math.round(row.volumen_nominal).toLocaleString("es-AR")} nominales` : ""}`}
          >
            VOL {row?.total_money != null ? fmtMoney(row.total_money) : "--"}
            {row?.volumen_nominal != null ? ` · ${Math.round(row.volumen_nominal).toLocaleString("es-AR")} nom` : ""}
          </span>
        )}
        {conBoleta && (
          <span className="text-[8px] tracking-widest text-[var(--t-pos)] border border-[var(--t-pos)]/40 px-1">
            OPERAR
          </span>
        )}
        <button onClick={onClose} className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-neg)] text-[12px]">✕</button>
      </div>

      <div className={`p-2 grid grid-cols-1 ${conBoleta ? "md:grid-cols-2" : ""} gap-2 text-[11px] flex-1 min-h-0`}>
        {/* Book L2 + boleta — SOLO módulo operar (admin). Reusa la pieza de
            Derivados: mismos endpoints /api/operar/order-book + /api/ordenes,
            cuenta recordada, click en punta carga el ticket. */}
        {conBoleta && (
          <div className="border border-[var(--t-border)] bg-[var(--t-surface)] min-h-[300px] flex flex-col">
            <DerivadosOperar instrumento={row!.ticker_full!} last={row?.last ?? undefined} />
          </div>
        )}

        {/* Info del papel: idea + contexto + compañeros + tape */}
        <div className="flex flex-col gap-2 min-w-0 min-h-0">
          {(row?.idea || row?.prom_vueltas != null || row?.flujo_compra_pct != null || (pesoEnElDia != null && pesoEnElDia > 5)) && (
            <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-1">
              {row?.idea && (
                <div className="flex items-start gap-2">
                  <AccionChip accion={row.idea.lado} />
                  <p className="text-[10px] text-[var(--t-text-dim)] leading-snug">{row.idea.motivo}</p>
                </div>
              )}
              {row?.prom_vueltas != null && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--t-text-dim)]">Costumbre ({row.prom_dias ?? "?"} ruedas)</span>
                  <span className="font-mono tabular-nums text-[var(--t-text)]">~{row.prom_vueltas.toFixed(1)} vueltas/día</span>
                </div>
              )}
              {row?.flujo_compra_pct != null && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--t-text-dim)]">Flujo de hoy</span>
                  <span className={`font-mono tabular-nums ${row.flujo_compra_pct >= 60 ? "text-[var(--t-pos)]" : row.flujo_compra_pct <= 40 ? "text-[var(--t-neg)]" : "text-[var(--t-text)]"}`}>
                    {row.flujo_compra_pct.toFixed(0)}% compra{row.flujo30_compra_pct != null ? ` · 30': ${row.flujo30_compra_pct.toFixed(0)}%` : ""}
                  </span>
                </div>
              )}
              {(row?.total_money != null || row?.volumen_nominal != null) && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-[var(--t-text-dim)]">Volumen hoy</span>
                  <span className="font-mono tabular-nums text-[var(--t-text)]" title={fmtMoneyFull(row?.total_money)}>
                    {row?.total_money != null ? fmtMoney(row.total_money) : "--"}
                    {row?.volumen_nominal != null ? ` · ${Math.round(row.volumen_nominal).toLocaleString("es-AR")} nom` : ""}
                  </span>
                </div>
              )}
              {pesoEnElDia != null && pesoEnElDia > 5 && (
                <div className="text-[9px] text-[var(--t-accent)] leading-snug">
                  ⚠ Tu monto es el {pesoEnElDia.toFixed(0)}% de lo operado hoy en este papel —
                  puede costarte entrar y salir sin mover el precio.
                </div>
              )}
            </div>
          )}

          {comp && (comp.con.length > 0 || comp.contra.length > 0) && (
            <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-1.5">
              <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] font-semibold">
                SE MUEVE CON / CONTRA
              </div>
              {comp.con.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[#ff7766] text-[9px] w-[38px]">CON</span>
                  {comp.con.slice(0, 4).map((c) => (
                    <span key={c.ticker} className="px-1.5 py-0.5 border border-[#ff7766]/30 font-mono text-[10px]" title={`ρ ${c.rho}`}>
                      {c.ticker} <span className="text-[var(--t-text-muted)]">{c.rho}</span>
                    </span>
                  ))}
                </div>
              )}
              {comp.contra.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[#6699ff] text-[9px] w-[38px]">CONTRA</span>
                  {comp.contra.slice(0, 4).map((c) => (
                    <span key={c.ticker} className="px-1.5 py-0.5 border border-[#6699ff]/30 font-mono text-[10px]" title={`ρ ${c.rho}`}>
                      {c.ticker} <span className="text-[var(--t-text-muted)]">{c.rho}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tape.length > 0 && (
            <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex-1 min-h-0 overflow-y-auto">
              <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] font-semibold mb-1">ÚLTIMOS TRADES</div>
              <table className="w-full text-[10px] font-mono tabular-nums">
                <tbody>
                  {tape.map((t, i) => (
                    <tr key={i}>
                      <td className="text-[var(--t-text-muted)] !py-px">
                        {t.timestamp ? new Date(t.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--"}
                      </td>
                      <td className={`text-right !py-px ${t.side === "BUY" ? "text-[var(--t-pos)]" : t.side === "SELL" ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>
                        {t.side === "BUY" ? "compra" : t.side === "SELL" ? "venta" : "—"}
                      </td>
                      <td className="text-right !py-px text-[var(--t-text)]">
                        {t.price != null ? `$${t.price.toLocaleString("es-AR")}` : "--"}
                      </td>
                      <td className="text-right !py-px text-[var(--t-text-dim)]" title={fmtMoneyFull(t.money)}>
                        {t.money != null ? fmtMoney(t.money) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
