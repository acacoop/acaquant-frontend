"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";
import type {
  Companeros,
  DayTradingResp,
  DayTradingRow,
  MinuteBar,
  TapeTrade,
} from "@/lib/types-estrategia";
import { AccionChip } from "./estrategia-shared";
import { TableHelp } from "./help-tooltip";

/**
 * TRADE LAB — asistente de day-trading intradía de CEDEARs.
 *
 * La pregunta que responde: "quiero capturar 0.5/1% comprando y vendiendo
 * en el día — ¿qué papel me lo está dando HOY, ahora?". Rankea el universo
 * por VUELTAS (movimientos completos ≥ objetivo que el papel ya hizo hoy,
 * medidos sobre el tape por minuto del motor), muestra dónde está parado
 * cada papel en su rango del día, el spread que te come, y dispara ALERTAS
 * cuando un papel toca piso/techo o arranca.
 *
 * Backend: GET /api/scanner/day-trading (api/services/day_trading.py) +
 * /api/scanner/companeros/{t} + /api/scanner/cedears/{trades,intraday}.
 */

const GLOSARIO = [
  { label: "VUELTAS",       text: "Cuántas veces HOY el papel ya hizo un movimiento completo del tamaño que buscás (subida o bajada — long y short valen igual). Es LA columna: un papel con 6 vueltas de 0.5% viene dando seis chances en el día; uno con 0, ninguna. Se mide sobre los precios por minuto del tape." },
  { label: "COSTUMBRE",     text: "Cuántas vueltas de ese tamaño hace EN PROMEDIO por rueda (últimas ~20 ruedas). El día puede mentir; la costumbre no: un papel que da 4 vueltas por día es tu cancha, uno que da 0.5 no. Se acumula desde que el cron nocturno empezó a guardar el resumen diario." },
  { label: "AHORA",         text: "La pata en curso: cuánto lleva recorrido el movimiento ACTUAL desde el último pivote. Si buscás 0.5% y la pata va +0.4%, estás llegando tarde para sumarte — o cerca de que pague el fade. Verde sube, rojo baja." },
  { label: "FLUJO",         text: "De toda la plata operada hoy con lado conocido, qué % fue COMPRA (agresor comprador). Arriba de ~60% los compradores dominan; abajo de ~40%, los vendedores. El tooltip muestra el flujo de los últimos 30 minutos — el ahora." },
  { label: "RANGO HOY",     text: "Distancia entre el mínimo y el máximo del día, en %. La barrita muestra dónde está parado AHORA el precio dentro de ese rango: pegado a la izquierda = en los pisos del día, pegado a la derecha = en los techos." },
  { label: "HOY %",         text: "Variación contra el cierre de ayer. Te dice si el papel viene verde o rojo en el día." },
  { label: "15 MIN",        text: "Cuánto se movió en los últimos 15 minutos. Es el 'ahora mismo': un papel planchado hace horas puede estar arrancando acá." },
  { label: "VWAP",          text: "Precio promedio del día ponderado por volumen. Si el papel opera ARRIBA del VWAP, los compradores vienen mandando; abajo, los vendedores. Cruzar el VWAP suele ser señal de cambio de mano." },
  { label: "SPREAD",        text: "La diferencia entre la punta compradora y la vendedora, en %. Es lo que pagás por entrar y salir YA (comprás caro al offer, vendés barato al bid). REGLA DE ORO: si el spread es más de la mitad de tu objetivo, el trade nace perdiendo — por eso se pinta rojo." },
  { label: "$ HOY",         text: "Plata total operada hoy en ese papel. Si tu monto es grande comparado con esto, te va a costar entrar y salir sin mover el precio (el lab te avisa)." },
  { label: "SI LA EMBOCÁS", text: "Tu monto × el objetivo = lo que ganás si capturás un movimiento completo. Al lado, lo que el spread te come de ese premio." },
  { label: "IDEA",          text: "Sugerencia orientativa con su porqué (pasá el mouse): cerca del piso del día → LONG de rebote; cerca del techo → SHORT; empujando fuerte con VWAP a favor → seguir el impulso. NO es recomendación: es para mirar primero los candidatos con sentido." },
  { label: "SE MUEVE CON",  text: "Papeles que históricamente acompañan (o van al revés de) el elegido, según los cierres diarios del último año. Útil para no abrir dos trades que son LA MISMA apuesta, o para buscar el espejo short de un long." },
  { label: "ALERTAS",       text: "Avisos en el navegador cuando un papel toca el piso/techo del día, se mueve fuerte en 15 minutos o cruza el VWAP. Funcionan mientras la pestaña esté abierta. Activá el permiso de notificaciones para verlas aunque estés en otra ventana." },
];

const OBJETIVOS = [0.5, 0.75, 1, 1.5];
const MONTO_PRESETS = [
  { label: "500k", value: 500_000 },
  { label: "1M",   value: 1_000_000 },
  { label: "3M",   value: 3_000_000 },
  { label: "5M",   value: 5_000_000 },
];
const POLL_MS = 10_000;

type SortKey = "vueltas" | "prom_vueltas" | "rango_pct" | "dia_pct" | "mom15_pct" | "spread_pct" | "total_money" | "flujo_compra_pct";

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

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-[var(--t-text-muted)]";
  return v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

function fmtPctS(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

/** Barra low→high con el marcador de dónde está el precio ahora. */
function RangoBar({ r }: { r: DayTradingRow }) {
  if (r.posicion == null) return <span className="text-[var(--t-text-muted)]">--</span>;
  return (
    <span
      className="relative inline-block w-full h-[8px] bg-[var(--t-border)] align-middle"
      title={`mín $${r.low ?? "?"} · máx $${r.high ?? "?"} — está al ${r.posicion.toFixed(0)}% del rango`}
    >
      <span
        className="absolute top-[-2px] h-[12px] w-[3px] bg-[var(--t-accent)]"
        style={{ left: `calc(${r.posicion}% - 1px)` }}
      />
    </span>
  );
}

function Sparkline({ bars }: { bars: MinuteBar[] }) {
  const closes = bars.map((b) => b.c).filter((c): c is number => c != null && c > 0);
  if (closes.length < 2) {
    return <p className="text-[var(--t-text-muted)] text-[10px] py-2 text-center">Sin barras de hoy.</p>;
  }
  const w = 260, h = 48;
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes
    .map((c, i) => `${(i / (closes.length - 1)) * w},${h - ((c - min) / span) * (h - 4) - 2}`)
    .join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--t-pos)" : "var(--t-neg)"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Vista principal ──────────────────────────────────────────────────

export function TradeLabView() {
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
      className="!px-2 !py-1 text-right text-[9px] tracking-wider cursor-pointer hover:text-[var(--t-accent)]"
    >
      {label}{sort.key === key ? (sort.dir === -1 ? " ▼" : " ▲") : ""}
    </th>
  );

  const gananciaObjetivo = monto * objetivo / 100;

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2 overflow-y-auto">
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
          className="w-[110px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
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

        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums">
          {!data.en_rueda && lastAt > 0
            ? "sin rueda en curso — el tape arranca con el mercado"
            : lastAt > 0
            ? `live · si la embocás: +$${Math.round(gananciaObjetivo).toLocaleString("es-AR")} por vuelta`
            : "cargando…"}
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 flex-1 min-h-0">
        {/* ── Ranking ─────────────────────────────────────────────────── */}
        <div className={`${sel ? "xl:col-span-8" : "xl:col-span-12"} border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[300px]`}>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border-2)] z-10">
                <tr className="text-[var(--t-text-muted)]">
                  <th className="!px-2 !py-1 text-left text-[9px] tracking-wider">PAPEL</th>
                  <th className="!px-2 !py-1 text-right text-[9px] tracking-wider">ÚLTIMO</th>
                  {th("HOY", "dia_pct", "Variación vs cierre de ayer")}
                  {th("RANGO", "rango_pct", "Mín→máx del día y dónde está parado ahora")}
                  <th className="!px-1 !py-1 w-[80px]"></th>
                  {th(`VUELTAS ≥${objetivo}%`, "vueltas", "Movimientos completos del tamaño buscado que YA hizo hoy")}
                  {th("PROM", "prom_vueltas", "Costumbre: vueltas promedio por rueda (últimas ~20 ruedas)")}
                  <th className="!px-2 !py-1 text-right text-[9px] tracking-wider" title="Pata en curso: cuánto lleva recorrido el movimiento ACTUAL desde el último pivote">AHORA</th>
                  <th className="!px-2 !py-1 text-right text-[9px] tracking-wider" title="Arriba o abajo del precio promedio del día">VWAP</th>
                  {th("FLUJO", "flujo_compra_pct", "% de la plata de hoy que fue COMPRA (agresor) — el tooltip de cada celda muestra los últimos 30'")}
                  {th("SPREAD", "spread_pct", "Lo que te come entrar y salir — rojo si es más de la mitad del objetivo")}
                  {th("$ HOY", "total_money", "Plata operada hoy en el papel")}
                  <th className="!px-2 !py-1 text-center text-[9px] tracking-wider">IDEA</th>
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
                      <td className="!px-2 !py-1 font-mono font-semibold text-[var(--t-accent)]" title={r.nombre ?? undefined}>
                        {r.ticker}
                        {dormido && <span className="ml-1 text-[8px] text-[var(--t-text-muted)]">💤{r.min_sin_operar}{"'"}</span>}
                      </td>
                      <td className="!px-2 !py-1 text-right font-mono tabular-nums">
                        {r.last != null ? `$${r.last.toLocaleString("es-AR")}` : "--"}
                      </td>
                      <td className={`!px-2 !py-1 text-right font-mono tabular-nums ${pctClass(r.dia_pct)}`}>
                        {fmtPctS(r.dia_pct)}
                      </td>
                      <td className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text)]">
                        {r.rango_pct != null ? `${r.rango_pct.toFixed(2)}%` : "--"}
                      </td>
                      <td className="!px-1 !py-1"><RangoBar r={r} /></td>
                      <td className="!px-2 !py-1 text-right"
                          title={r.mejor_vuelta_pct != null ? `Mejor pata del día: ${r.mejor_vuelta_pct}%${r.vueltas_hora != null ? ` · ritmo ~${r.vueltas_hora}/hora` : ""}` : undefined}>
                        <span className={`font-mono tabular-nums font-bold text-[13px] ${
                          r.vueltas >= 4 ? "text-[var(--t-pos)]" : r.vueltas >= 2 ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"
                        }`}>
                          {r.vueltas}
                        </span>
                      </td>
                      <td className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text-dim)]"
                          title={r.prom_dias ? `Promedio sobre ${r.prom_dias} ruedas` : "Todavía sin historial — el cron nocturno lo va acumulando"}>
                        {r.prom_vueltas != null ? r.prom_vueltas.toFixed(1) : "--"}
                      </td>
                      <td className={`!px-2 !py-1 text-right font-mono tabular-nums ${r.pata ? (r.pata.pct >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]") : "text-[var(--t-text-muted)]"}`}
                          title={r.pata ? `Pata ${r.pata.dir === "long" ? "alcista" : "bajista"} en curso${r.mom15_pct != null ? ` · 15': ${fmtPctS(r.mom15_pct)}` : ""}` : undefined}>
                        {r.pata ? fmtPctS(r.pata.pct) : "--"}
                      </td>
                      <td className={`!px-2 !py-1 text-right font-mono tabular-nums ${pctClass(r.vs_vwap_pct)}`}>
                        {r.vs_vwap_pct == null ? "--" : r.vs_vwap_pct >= 0 ? "↑" : "↓"}
                        {r.vs_vwap_pct != null ? ` ${Math.abs(r.vs_vwap_pct).toFixed(2)}%` : ""}
                      </td>
                      <td className={`!px-2 !py-1 text-right font-mono tabular-nums ${
                        r.flujo_compra_pct == null ? "text-[var(--t-text-muted)]"
                        : r.flujo_compra_pct >= 60 ? "text-[var(--t-pos)]"
                        : r.flujo_compra_pct <= 40 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
                      }`}
                          title={r.flujo30_compra_pct != null ? `Últimos 30': ${r.flujo30_compra_pct.toFixed(0)}% compra` : undefined}>
                        {r.flujo_compra_pct != null ? `${r.flujo_compra_pct.toFixed(0)}%C` : "--"}
                      </td>
                      <td className={`!px-2 !py-1 text-right font-mono tabular-nums ${spreadMalo ? "text-[var(--t-neg)] font-semibold" : "text-[var(--t-text)]"}`}
                          title={spreadMalo ? "El spread se come más de la mitad del objetivo — el trade nace perdiendo" : undefined}>
                        {r.spread_pct != null ? `${r.spread_pct.toFixed(2)}%` : "--"}
                      </td>
                      <td className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text-dim)]" title={fmtMoneyFull(r.total_money)}>
                        {r.total_money != null ? fmtMoney(r.total_money) : "--"}
                      </td>
                      <td className="!px-2 !py-1 text-center" title={r.idea?.motivo}>
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

        {/* ── Detalle del papel ───────────────────────────────────────── */}
        {sel && (
          <DetallePapel
            row={selRow}
            ticker={sel}
            monto={monto}
            objetivo={objetivo}
            onClose={() => setSel(null)}
          />
        )}
      </div>
    </div>
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
  const [tipo, setTipo] = useState<AlertaTipo>("mueve15");
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
  row, ticker, monto, objetivo, onClose,
}: {
  row: DayTradingRow | null;
  ticker: string;
  monto: number;
  objetivo: number;
  onClose: () => void;
}) {
  const [comp, setComp] = useState<Companeros | null>(null);
  const [tape, setTape] = useState<TapeTrade[]>([]);
  const [bars, setBars] = useState<MinuteBar[]>([]);

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

  // Tape + barras del día — poll liviano mientras está seleccionado.
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`/api/scanner/cedears/trades?ticker=${encodeURIComponent(ticker)}&limite=14`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((j: TapeTrade[]) => { if (alive) setTape(j ?? []); })
        .catch(() => {});
      fetch(`/api/scanner/cedears/intraday?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((j: MinuteBar[]) => { if (alive) setBars(j ?? []); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, [ticker]);

  const ganancia = monto * objetivo / 100;
  const costoSpread = row?.spread_pct != null ? monto * row.spread_pct / 100 : null;
  const pesoEnElDia = row?.total_money ? (monto / row.total_money) * 100 : null;

  return (
    <div className="xl:col-span-4 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[300px] overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2 shrink-0">
        <span className="font-mono font-bold text-[13px] text-[var(--t-accent)]">{ticker}</span>
        {row?.nombre && <span className="text-[10px] text-[var(--t-text-dim)] truncate">{row.nombre}</span>}
        <button onClick={onClose} className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-neg)] text-[12px]">✕</button>
      </div>

      <div className="p-3 flex flex-col gap-3 text-[11px]">
        <Sparkline bars={bars} />

        {/* La cuenta en criollo */}
        <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-1">
          <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] font-semibold">LA CUENTA</div>
          <div className="flex justify-between">
            <span className="text-[var(--t-text-dim)]">Si capturás {objetivo}% con ${monto.toLocaleString("es-AR")}</span>
            <span className="font-mono tabular-nums text-[var(--t-pos)] font-semibold">
              +${Math.round(ganancia).toLocaleString("es-AR")}
            </span>
          </div>
          {costoSpread != null && (
            <div className="flex justify-between">
              <span className="text-[var(--t-text-dim)]">El spread te come (entrar + salir)</span>
              <span className="font-mono tabular-nums text-[var(--t-neg)]">
                −${Math.round(costoSpread).toLocaleString("es-AR")}
              </span>
            </div>
          )}
          {costoSpread != null && (
            <div className="flex justify-between border-t border-[var(--t-border)] pt-1">
              <span className="text-[var(--t-text)]">Te queda</span>
              <span className={`font-mono tabular-nums font-bold ${ganancia - costoSpread > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
                {ganancia - costoSpread > 0 ? "+" : ""}${Math.round(ganancia - costoSpread).toLocaleString("es-AR")}
              </span>
            </div>
          )}
          {row?.prom_vueltas != null && (
            <div className="flex justify-between">
              <span className="text-[var(--t-text-dim)]">Costumbre del papel ({row.prom_dias ?? "?"} ruedas)</span>
              <span className="font-mono tabular-nums text-[var(--t-text)]">
                ~{row.prom_vueltas.toFixed(1)} vueltas/día
              </span>
            </div>
          )}
          {row?.flujo_compra_pct != null && (
            <div className="flex justify-between">
              <span className="text-[var(--t-text-dim)]">Flujo de hoy (compra vs venta)</span>
              <span className={`font-mono tabular-nums ${row.flujo_compra_pct >= 60 ? "text-[var(--t-pos)]" : row.flujo_compra_pct <= 40 ? "text-[var(--t-neg)]" : "text-[var(--t-text)]"}`}>
                {row.flujo_compra_pct.toFixed(0)}% compra{row.flujo30_compra_pct != null ? ` · 30': ${row.flujo30_compra_pct.toFixed(0)}%` : ""}
              </span>
            </div>
          )}
          {pesoEnElDia != null && pesoEnElDia > 5 && (
            <div className="text-[9px] text-[var(--t-accent)] leading-snug pt-1">
              ⚠ Tu monto es el {pesoEnElDia.toFixed(0)}% de TODO lo operado hoy en este papel —
              puede costarte entrar y salir sin mover el precio.
            </div>
          )}
        </div>

        {row?.idea && (
          <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-widest text-[var(--t-text-muted)] font-semibold">IDEA</span>
              <AccionChip accion={row.idea.lado} />
            </div>
            <p className="text-[10px] text-[var(--t-text-dim)] leading-snug">{row.idea.motivo}</p>
          </div>
        )}

        {/* Se mueve con / contra */}
        {comp && (comp.con.length > 0 || comp.contra.length > 0) && (
          <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2 flex flex-col gap-1.5">
            <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] font-semibold">
              SE MUEVE CON / CONTRA
              <span className="ml-1 normal-case tracking-normal font-normal">(cierres diarios, último año)</span>
            </div>
            {comp.con.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[#ff7766] text-[9px] w-[38px]">CON</span>
                {comp.con.map((c) => (
                  <span key={c.ticker} className="px-1.5 py-0.5 border border-[#ff7766]/30 font-mono text-[10px]" title={`ρ ${c.rho}`}>
                    {c.ticker} <span className="text-[var(--t-text-muted)]">{c.rho}</span>
                  </span>
                ))}
              </div>
            )}
            {comp.contra.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[#6699ff] text-[9px] w-[38px]">CONTRA</span>
                {comp.contra.map((c) => (
                  <span key={c.ticker} className="px-1.5 py-0.5 border border-[#6699ff]/30 font-mono text-[10px]" title={`ρ ${c.rho}`}>
                    {c.ticker} <span className="text-[var(--t-text-muted)]">{c.rho}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tape */}
        {tape.length > 0 && (
          <div className="border border-[var(--t-border)] bg-[var(--t-surface)] p-2">
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
  );
}
