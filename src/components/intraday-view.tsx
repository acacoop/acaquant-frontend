"use client";

import { useEffect, useMemo, useState } from "react";

// Monitor intradía de renta variable. Sube el CSV de boletos del día (export
// ROFEX/Aunesa, formato AR) y el backend (api/services/intraday.py) consolida
// por (cuenta, especie) con FIFO. Acá: filtro por cuenta, mark editable a mano
// (cuando el feed no tiene la especie), multiplicador de contrato editable por
// especie (1 = acción/CEDEAR, 100 = derivado x100 — escala costo/PnL, no el
// arancel), costo en book, detalle de operaciones por posición y un simulador
// de precio (en drawer lateral). Persiste en sessionStorage.

interface Trade {
  hora: string;
  lado: string;
  precio: number;
  cantidad: number;
  monto: number;
  pos_acum: number;
  ponderado_acum: number;
  interes: number;
  iva: number;
}
interface Posicion {
  cuenta: string;
  especie: string;
  moneda: string;
  n_ops: number;
  compras_qty: number;
  ventas_qty: number;
  qty_neta: number;
  estado: "LONG" | "SHORT" | "CERRADA";
  precio_ponderado: number | null;
  mark: number;
  mark_source: "live" | "csv";
  mark_updated_at: string | null;
  pnl_realizado: number;
  intereses: number;
  iva: number;
  trades: Trade[];
}
interface Resultado {
  archivo: string | null;
  filas_validas: number;
  posiciones: Posicion[];
  timestamp: number;
}

const STORAGE_KEY = "intraday_fifo_v2";
const EXCL_KEY = "intraday_excl_v1";
const PASOS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const keyOf = (p: Posicion) => `${p.especie}|${p.cuenta}`;

// Puente al copiloto de la vista TRADING: las posiciones ABIERTAS quedan en
// localStorage (son efímeras — el excel vive en este browser) y el panel IA
// de /trading las manda como parámetro para aconsejar DESDE la posición.
const POSICIONES_IA_KEY = "trd-fx-intraday-posiciones-v1";

function persistirPosicionesAbiertas(posiciones: Posicion[]) {
  try {
    const abiertas = (posiciones ?? [])
      .filter((p) => p.estado === "LONG" || p.estado === "SHORT")
      .map((p) => ({
        especie: p.especie,
        estado: p.estado,
        qty: Math.abs(p.qty_neta),
        precio: p.precio_ponderado,
      }));
    localStorage.setItem(POSICIONES_IA_KEY, JSON.stringify(abiertas));
  } catch {
    /* storage lleno/bloqueado: el copiloto simplemente no las ve */
  }
}

// Especies destildadas (no cuentan como daytrade). Persiste en sessionStorage.
function loadExcl(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(EXCL_KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return new Set(a as string[]);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

const MULT_KEY = "intraday_mult_v1";

// Multiplicador de contrato por ESPECIE (no por cuenta: es intrínseco del título).
// Persiste entre archivos así no reescribís el x100 en cada carga.
function loadMult(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(MULT_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") return o as Record<string, number>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

const EXCT_KEY = "intraday_exct_v1";

function loadExcT(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(EXCT_KEY);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) return new Set(a as string[]);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

function loadResultado(): Resultado | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Resultado;
      if (parsed?.posiciones && Array.isArray(parsed.posiciones)) return parsed;
    }
  } catch {
    /* storage corrupto/disabled */
  }
  return null;
}

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtSigned(n: number, d = 0): string {
  const s = n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return n > 0 ? `+${s}` : s;
}
function pnlColor(n: number): string {
  if (Math.abs(n) < 1e-9) return "#888";
  return n > 0 ? "var(--t-pos)" : "var(--t-neg)";
}
function estadoColor(e: string): string {
  if (e === "LONG") return "var(--t-pos)";
  if (e === "SHORT") return "var(--t-neg)";
  return "#888";
}

// PnL derivado del mark EFECTIVO (override manual o el del backend) y del
// multiplicador de contrato `mult` (1 = acción/CEDEAR; 100 = derivado x100).
// El multiplicador escala la plata (costo, realizado, no realizado); el arancel
// e IVA NO se tocan (salen del Monto real del boleto).
function derive(p: Posicion, mark: number, mult = 1) {
  const abierta = Math.abs(p.qty_neta) > 1e-9;
  const ponder = p.precio_ponderado ?? 0;
  const noreal = (abierta ? p.qty_neta * (mark - ponder) : 0) * mult;
  const real = p.pnl_realizado * mult;
  const bruto = real + noreal;
  const neto = bruto - p.intereses - p.iva;
  const costo = (abierta ? p.qty_neta * ponder : 0) * mult; // plata puesta (long +, short −)
  return { noreal, real, bruto, neto, costo };
}

export function IntradayView() {
  const [resultado, setResultado] = useState<Resultado | null>(loadResultado);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cuentaFiltro, setCuentaFiltro] = useState<string>("todas");
  const [simSel, setSimSel] = useState<string>("__todas__");
  const [simOpen, setSimOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [markOv, setMarkOv] = useState<Record<string, number>>({});
  // Marks live refrescados por el botón "Actualizar cotizaciones" (keyed por especie).
  const [liveMarks, setLiveMarks] = useState<Record<string, { last: number; updated_at: string | null }>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [multOv, setMultOv] = useState<Record<string, number>>(loadMult);
  const [excluidas, setExcluidas] = useState<Set<string>>(loadExcl);

  useEffect(() => {
    try {
      sessionStorage.setItem(MULT_KEY, JSON.stringify(multOv));
    } catch {
      /* ignore */
    }
  }, [multOv]);

  useEffect(() => {
    try {
      sessionStorage.setItem(EXCL_KEY, JSON.stringify([...excluidas]));
    } catch {
      /* ignore */
    }
  }, [excluidas]);

  const toggleIncl = (p: Posicion) => {
    const k = keyOf(p);
    setExcluidas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  // ── exclusión por-trade individual + recálculo FIFO en el backend ──
  const [excTrades, setExcTrades] = useState<Set<string>>(loadExcT);
  const [recomp, setRecomp] = useState<Record<string, Posicion>>({});

  useEffect(() => {
    try {
      sessionStorage.setItem(EXCT_KEY, JSON.stringify([...excTrades]));
    } catch {
      /* ignore */
    }
  }, [excTrades]);

  const tradeKey = (p: Posicion, i: number) => `${keyOf(p)}#${i}`;
  const excCount = (p: Posicion) =>
    p.trades.reduce((n, _t, i) => (excTrades.has(tradeKey(p, i)) ? n + 1 : n), 0);
  const toggleTrade = (p: Posicion, i: number) => {
    const tk = tradeKey(p, i);
    setExcTrades((prev) => {
      const n = new Set(prev);
      if (n.has(tk)) n.delete(tk);
      else n.add(tk);
      return n;
    });
  };

  // Posición efectiva: null si NO cuenta (especie destildada o todos los trades
  // fuera); `p` si no tiene exclusión por-trade; el recálculo del backend si tiene
  // algunos trades fuera (cae a `p` mientras llega la respuesta).
  const effPos = (p: Posicion): Posicion | null => {
    if (excluidas.has(keyOf(p))) return null;
    const exc = excCount(p);
    if (exc === 0) return p;
    if (exc >= p.trades.length) return null;
    return recomp[keyOf(p)] ?? p;
  };

  // Recalcula (debounce) las posiciones con exclusión PARCIAL por-trade.
  useEffect(() => {
    const mods = (resultado?.posiciones ?? []).filter((p) => {
      const exc = p.trades.reduce((n, _t, i) => (excTrades.has(`${keyOf(p)}#${i}`) ? n + 1 : n), 0);
      return exc > 0 && exc < p.trades.length;
    });
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      if (!mods.length) {
        setRecomp({});
        return;
      }
      try {
        const body = {
          posiciones: mods.map((p) => ({
            cuenta: p.cuenta,
            especie: p.especie,
            moneda: p.moneda,
            trades: p.trades
              .filter((_t, i) => !excTrades.has(`${keyOf(p)}#${i}`))
              .map((t) => ({ hora: t.hora, lado: t.lado, precio: t.precio, cantidad: t.cantidad, monto: t.monto })),
          })),
        };
        const r = await fetch("/api/operaciones/intraday/recalcular", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!r.ok) return;
        const data = (await r.json()) as { posiciones: Posicion[] };
        const m: Record<string, Posicion> = {};
        for (const pos of data.posiciones) m[`${pos.especie}|${pos.cuenta}`] = pos;
        setRecomp(m);
        persistirPosicionesAbiertas(data.posiciones);
      } catch {
        /* abort / transitorio */
      }
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [excTrades, resultado]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCargando(true);
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("iso-8859-1").decode(buf); // export viene en latin-1
      const res = await fetch("/api/operaciones/intraday/analizar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, archivo: file.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Error ${res.status}`);
      }
      const data = (await res.json()) as Resultado;
      data.timestamp = Date.now();
      setResultado(data);
      persistirPosicionesAbiertas(data.posiciones);
      setMarkOv({});
      setLiveMarks({});
      setLastRefresh(null);
      setExpanded(new Set());
      setExcluidas(new Set());
      setExcTrades(new Set());
      setRecomp({});
      setCuentaFiltro("todas");
      setSimSel("__todas__");
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* quota */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
      e.target.value = "";
    }
  };

  const limpiar = () => {
    setResultado(null);
    setError(null);
    setMarkOv({});
    setLiveMarks({});
    setLastRefresh(null);
    setExpanded(new Set());
    setExcluidas(new Set());
    setExcTrades(new Set());
    setRecomp({});
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Refresca los marks live (precios de mercado) sin re-subir el CSV. Pide al
  // backend el last actual por especie, actualiza `liveMarks` y PISA los precios
  // editados a mano en las especies que tienen cotización (los overrides de
  // especies no mapeadas se preservan: no hay live con qué reemplazarlos).
  const refreshMarks = async () => {
    if (!resultado || refreshing) return;
    const especies = Array.from(new Set(resultado.posiciones.map((p) => p.especie)));
    if (!especies.length) return;
    setRefreshing(true);
    try {
      const r = await fetch("/api/operaciones/intraday/marks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ especies }),
      });
      if (r.ok) {
        const data = (await r.json()) as { marks: Record<string, { last: number; updated_at: string | null }> };
        const marks = data.marks || {};
        setLiveMarks(marks);
        // "↻ Cotizaciones" es autoritativo: descarta el precio editado a mano en las
        // especies que ahora tienen cotización live, así el refresh SÍ actualiza el
        // mark (antes el override manual quedaba pegado y el botón "no funcionaba").
        // Los overrides de especies sin live (no mapeadas) se preservan.
        setMarkOv((prev) => {
          const next: Record<string, number> = {};
          for (const [k, v] of Object.entries(prev)) {
            if (marks[k.split("|")[0]] === undefined) next[k] = v;
          }
          return next;
        });
        setLastRefresh(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } catch {
      /* transitorio */
    } finally {
      setRefreshing(false);
    }
  };

  const cuentas = useMemo(() => {
    const s = new Set<string>();
    (resultado?.posiciones ?? []).forEach((p) => s.add(p.cuenta));
    return Array.from(s).sort();
  }, [resultado]);

  const posiciones = useMemo(() => {
    const all = resultado?.posiciones ?? [];
    return cuentaFiltro === "todas" ? all : all.filter((p) => p.cuenta === cuentaFiltro);
  }, [resultado, cuentaFiltro]);

  // Prioridad: override manual > mark live refrescado (por especie) > mark del CSV.
  const effMark = (p: Posicion) => markOv[keyOf(p)] ?? liveMarks[p.especie]?.last ?? p.mark;
  const effMult = (p: Posicion) => multOv[p.especie] ?? 1;
  const hasLive = (p: Posicion) => liveMarks[p.especie] !== undefined || p.mark_source === "live";

  const abiertas = useMemo(
    () =>
      posiciones
        .map((p) => effPos(p))
        .filter((p): p is Posicion => !!p && p.estado !== "CERRADA"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posiciones, excluidas, excTrades, recomp],
  );

  // Totales (sobre lo tildado, con marks efectivos y FIFO recalculado por-trade).
  const totales = useMemo(() => {
    let real = 0, noreal = 0, fees = 0, neto = 0, costoBook = 0;
    for (const p of posiciones) {
      const ep = effPos(p);
      if (!ep) continue; // destildada (especie o todos los trades fuera)
      const d = derive(ep, effMark(ep), effMult(ep));
      real += d.real;
      noreal += d.noreal;
      fees += ep.intereses + ep.iva;
      neto += d.neto;
      if (ep.estado !== "CERRADA") costoBook += d.costo;
    }
    return { real, noreal, fees, neto, costoBook };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posiciones, markOv, liveMarks, multOv, excluidas, excTrades, recomp]);

  // Simulador con mark efectivo.
  const simData = useMemo(() => {
    if (!abiertas.length) return null;
    const ladder = PASOS.flatMap((p) => [p, -p]).concat([0]).sort((a, b) => b - a);
    if (simSel === "__todas__") {
      const filas = ladder.map((pct) => ({
        pct,
        precio: null as number | null,
        delta: abiertas.reduce((acc, pos) => acc + pos.qty_neta * effMark(pos) * (pct / 100) * effMult(pos), 0),
      }));
      return { filas, mark: null as number | null };
    }
    const pos = abiertas.find((p) => keyOf(p) === simSel);
    if (!pos) return null;
    const m = effMark(pos);
    const mult = effMult(pos);
    const filas = ladder.map((pct) => {
      const precio = m * (1 + pct / 100);
      return { pct, precio, delta: pos.qty_neta * (precio - m) * mult };
    });
    return { filas, mark: m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertas, simSel, markOv, liveMarks, multOv]);

  const toggleExpand = (p: Posicion) => {
    const k = keyOf(p);
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    if (p.estado !== "CERRADA") setSimSel(k);
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2 overflow-hidden">
      {/* Barra sobria: una línea */}
      <div className="flex items-center gap-3 shrink-0 text-[11px]">
        <label className="px-2.5 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] cursor-pointer transition-colors">
          {cargando ? "…" : "Examinar"}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} disabled={cargando} />
        </label>
        {resultado && (
          <>
            <span className="text-[10px] text-[var(--t-text-muted)] font-mono truncate max-w-[180px]">{resultado.archivo}</span>
            <span className="text-[10px] text-[var(--t-text-muted)] font-mono">
              {resultado.filas_validas} trades · {posiciones.filter((p) => p.estado !== "CERRADA").length} abiertas
            </span>
            {cuentas.length > 0 && (
              <select
                value={cuentaFiltro}
                onChange={(e) => setCuentaFiltro(e.target.value)}
                className="bg-[var(--t-surface-2)] border border-[var(--t-border-2)] text-[10px] px-1.5 py-0.5 text-[var(--t-text)]"
              >
                <option value="todas">Todas las cuentas</option>
                {cuentas.map((c) => (
                  <option key={c} value={c}>Cuenta {c}</option>
                ))}
              </select>
            )}
            <button
              onClick={refreshMarks}
              disabled={refreshing}
              className="ml-auto px-2.5 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-pos)] hover:text-[var(--t-pos)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Traer los precios de mercado actuales (sin re-subir el CSV)"
            >
              {refreshing ? "Actualizando…" : "↻ Cotizaciones"}
            </button>
            {lastRefresh && (
              <span className="text-[9px] text-[var(--t-text-muted)] font-mono" title="Último refresco de cotizaciones">
                {lastRefresh}
              </span>
            )}
            <button
              onClick={() => setSimOpen((v) => !v)}
              disabled={!abiertas.length}
              className={`px-2.5 py-1 text-[10px] font-semibold tracking-wide border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                simOpen
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              }`}
              title={abiertas.length ? "Abrir/cerrar simulador de precio" : "Sin posiciones abiertas para simular"}
            >
              Simulador
            </button>
            <button onClick={limpiar} className="text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] underline">
              limpiar
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[var(--t-neg)] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {!resultado && !error && (
        <div className="flex-1 flex items-center justify-center text-[var(--t-text-muted)] text-[12px] text-center px-6">
          Cargá el CSV de boletos del día (Especie, Lado, Precio, Cantidad, Cuenta, Monto).
          Las cauciones (PESOS/DOLARES) se excluyen automáticamente.
        </div>
      )}

      {resultado && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-2 shrink-0">
            <KpiBox label="Costo en book" val={totales.costoBook} neutral />
            <KpiBox label="Realizado" val={totales.real} />
            <KpiBox label="No realizado" val={totales.noreal} />
            <KpiBox label="Int. + IVA" val={-totales.fees} />
            <KpiBox label="PnL Neto" val={totales.neto} big />
          </div>

          {/* tabla a ancho completo; el simulador vive en un drawer lateral */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-auto border border-[var(--t-border)] bg-[var(--t-panel)]">
              <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-wide text-[var(--t-accent)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className="!px-1 !py-1.5 text-center" title="Contar como daytrade">✓</th>
                    <th className="!px-2 !py-1.5 text-left">Especie</th>
                    {cuentaFiltro === "todas" && <th className="!px-2 !py-1.5 text-center">Cta</th>}
                    <th className="!px-2 !py-1.5 text-center">Estado</th>
                    <th className="!px-2 !py-1.5 text-right">Qty</th>
                    <th className="!px-1 !py-1.5 text-center" title="Multiplicador de contrato (100 = derivado x100)">×</th>
                    <th className="!px-2 !py-1.5 text-right">Costo</th>
                    <th className="!px-2 !py-1.5 text-right">Ponder.</th>
                    <th className="!px-2 !py-1.5 text-right">Mark</th>
                    <th className="!px-2 !py-1.5 text-right">Realiz.</th>
                    <th className="!px-2 !py-1.5 text-right">No real.</th>
                    <th className="!px-2 !py-1.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {posiciones.map((p) => {
                    const k = keyOf(p);
                    const eff = effPos(p);          // efectiva (recalculada) o null si no cuenta
                    const dp = eff ?? p;
                    const m = effMark(dp);
                    const mult = effMult(dp);
                    const d = derive(dp, m, mult);
                    const off = !eff;               // no cuenta (especie o todos los trades fuera)
                    const hasTradeExc = excCount(p) > 0;
                    const recalc = !!eff && hasTradeExc; // exclusión por-trade parcial
                    const sel = !off && k === simSel && dp.estado !== "CERRADA";
                    const isOpen = expanded.has(k);
                    const colSpan = cuentaFiltro === "todas" ? 12 : 11;
                    return (
                      <FragmentRow key={k}>
                        <tr
                          onClick={() => toggleExpand(p)}
                          className={`border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-accent)]/5 ${
                            sel ? "bg-[var(--t-accent)]/15" : ""
                          } ${p.estado === "CERRADA" ? "opacity-75" : ""} ${off ? "opacity-40" : ""}`}
                        >
                          <td className="!px-1 !py-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={!excluidas.has(k)}
                              onChange={() => toggleIncl(p)}
                              className="cursor-pointer accent-[var(--t-accent)]"
                              title={excluidas.has(k) ? "No cuenta — clic para incluir" : "Cuenta como daytrade — clic para sacar"}
                            />
                          </td>
                          <td className="!px-2 !py-1 text-[var(--t-text)] font-semibold">
                            <span className="text-[8px] text-[var(--t-text-muted)] mr-1">{isOpen ? "▾" : "▸"}</span>
                            {p.especie}
                            {recalc && <span className="ml-1 text-[8px] text-[var(--t-accent)]" title="recalculado: hay trades sacados">✎</span>}
                          </td>
                          {cuentaFiltro === "todas" && <td className="!px-2 !py-1 text-center text-[var(--t-text-dim)]">{p.cuenta}</td>}
                          <td className="!px-2 !py-1 text-center font-semibold" style={{ color: estadoColor(dp.estado) }}>{eff ? eff.estado : "—"}</td>
                          <td className="!px-2 !py-1 text-right">{eff ? fmtNum(eff.qty_neta, 0) : "—"}</td>
                          <td className="!px-1 !py-1 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              step="1"
                              min="1"
                              value={mult}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setMultOv((prev) => ({ ...prev, [p.especie]: !v || v <= 0 ? 1 : v }));
                              }}
                              className={`w-10 bg-transparent text-center text-[11px] border-b border-dashed focus:outline-none ${
                                mult !== 1
                                  ? "text-[var(--t-accent)] border-[var(--t-accent)]"
                                  : "text-[var(--t-text-dim)] border-[var(--t-border-2)] focus:border-[var(--t-accent)]"
                              }`}
                              title="Multiplicador de contrato: 1 = acción/CEDEAR, 100 = derivado x100"
                            />
                          </td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{eff && eff.estado !== "CERRADA" ? fmtNum(d.costo, 0) : "—"}</td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{eff && eff.precio_ponderado != null ? fmtNum(eff.precio_ponderado, 2) : "—"}</td>
                          <td className="!px-2 !py-1 text-right" onClick={(e) => e.stopPropagation()}>
                            <span className="inline-flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="1"
                                value={Number.isFinite(m) ? m : ""}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  setMarkOv((prev) => ({ ...prev, [k]: isNaN(v) ? 0 : v }));
                                }}
                                className="w-16 bg-transparent text-right text-[11px] text-[var(--t-text)] border-b border-dashed border-[var(--t-border-2)] focus:border-[var(--t-accent)] focus:outline-none"
                                title={hasLive(dp) ? "precio de mercado (editable) — ↻ Cotizaciones lo refresca" : "no mapeado — escribilo a mano"}
                              />
                              <span className="text-[8px]" style={{ color: markOv[k] !== undefined ? "var(--t-accent)" : hasLive(dp) ? "var(--t-pos)" : "var(--t-text-muted)" }}>
                                {markOv[k] !== undefined ? "✎" : hasLive(dp) ? "●" : "○"}
                              </span>
                            </span>
                          </td>
                          <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(eff ? d.real : 0) }}>{eff ? fmtNum(d.real, 0) : "—"}</td>
                          <td className="!px-2 !py-1 text-right" style={{ color: pnlColor(eff ? d.noreal : 0) }}>{eff && eff.estado !== "CERRADA" ? fmtNum(d.noreal, 0) : "—"}</td>
                          <td className="!px-2 !py-1 text-right font-semibold" style={{ color: pnlColor(eff ? d.neto : 0) }}>{eff ? fmtNum(d.neto, 0) : "—"}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[var(--t-bg)]">
                            <td colSpan={colSpan} className="!px-2 !py-2">
                              <div className="text-[8px] uppercase tracking-widest text-[var(--t-text-muted)] mb-1">
                                {p.n_ops} operaciones · int.+IVA {fmtNum(p.intereses + p.iva, 0)}
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="text-[8px] uppercase tracking-wide text-[var(--t-text-muted)]">
                                  <tr>
                                    <th className="!py-0.5 text-center" title="Contar este trade">✓</th>
                                    <th className="!py-0.5 text-left">Hora</th>
                                    <th className="!py-0.5 text-left">Lado</th>
                                    <th className="!py-0.5 text-right">Precio</th>
                                    <th className="!py-0.5 text-right">Cantidad</th>
                                    <th className="!py-0.5 text-right">Monto</th>
                                    <th className="!py-0.5 text-right">Pos. acum.</th>
                                    <th className="!py-0.5 text-right">Ponder.</th>
                                    <th className="!py-0.5 text-right">Int.+IVA</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.trades.map((tr, i) => {
                                    const tExc = excTrades.has(tradeKey(p, i));
                                    return (
                                      <tr key={i} className={`border-t border-[var(--t-border)] ${tExc ? "opacity-40" : ""}`}>
                                        <td className="!py-0.5 text-center">
                                          <input
                                            type="checkbox"
                                            checked={!tExc}
                                            onChange={() => toggleTrade(p, i)}
                                            className="cursor-pointer accent-[var(--t-accent)]"
                                            title={tExc ? "No cuenta — clic para incluir" : "Cuenta — clic para sacar este trade"}
                                          />
                                        </td>
                                        <td className="!py-0.5 text-[var(--t-text-dim)]">{tr.hora}</td>
                                        <td className="!py-0.5 font-semibold" style={{ color: tr.lado === "Compra" ? "var(--t-pos)" : "var(--t-neg)" }}>{tr.lado}</td>
                                        <td className="!py-0.5 text-right">{fmtNum(tr.precio, 2)}</td>
                                        <td className="!py-0.5 text-right text-[var(--t-text-dim)]">{fmtNum(tr.cantidad, 0)}</td>
                                        <td className="!py-0.5 text-right">{fmtNum(tr.monto, 0)}</td>
                                        {/* con trades sacados, el acumulado por-fila ya no aplica (ver totales recalculados arriba) */}
                                        <td className="!py-0.5 text-right font-semibold" style={{ color: hasTradeExc ? "#888" : Math.abs(tr.pos_acum) < 1e-9 ? "#888" : tr.pos_acum > 0 ? "var(--t-pos)" : "var(--t-neg)" }}>{hasTradeExc ? "—" : fmtNum(tr.pos_acum, 0)}</td>
                                        <td className="!py-0.5 text-right text-[var(--t-text-dim)]">{hasTradeExc || Math.abs(tr.pos_acum) < 1e-9 ? "—" : fmtNum(tr.ponderado_acum, 2)}</td>
                                        <td className="!py-0.5 text-right text-[var(--t-neg)]">{fmtNum(tr.interes + tr.iva, 0)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                  {!posiciones.length && (
                    <tr><td colSpan={12} className="!px-2 !py-3 text-[var(--t-text-muted)]">sin posiciones para esta cuenta</td></tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* Simulador — drawer lateral, se abre con el botón */}
          {simOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setSimOpen(false)}>
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="absolute top-0 right-0 h-full w-[380px] max-w-[90vw] flex flex-col gap-2 overflow-hidden border-l border-[var(--t-border)] bg-[var(--t-panel)] p-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between shrink-0">
                  <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">Simulador de precio</span>
                  <button onClick={() => setSimOpen(false)} className="text-[var(--t-text-muted)] hover:text-[var(--t-text)] text-[14px] leading-none px-1" title="Cerrar">
                    ✕
                  </button>
                </div>
              {!abiertas.length ? (
                <div className="flex-1 flex items-center justify-center text-[11px] text-[var(--t-text-muted)] text-center">
                  No hay posiciones abiertas para simular.
                </div>
              ) : (
                <>
                  <select
                    value={simSel}
                    onChange={(e) => setSimSel(e.target.value)}
                    className="bg-[var(--t-surface-2)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] shrink-0"
                  >
                    <option value="__todas__">TODAS (abiertas)</option>
                    {abiertas.map((p) => (
                      <option key={keyOf(p)} value={keyOf(p)}>{p.especie} · {p.estado} {fmtNum(p.qty_neta, 0)}</option>
                    ))}
                  </select>
                  {simData?.mark != null && (
                    <div className="text-[10px] text-[var(--t-text-dim)] font-mono shrink-0">
                      Mark: <span className="text-[var(--t-text)]">{fmtNum(simData.mark, 2)}</span>
                    </div>
                  )}
                  <div className="flex-1 overflow-auto">
                    <table className="w-full text-[11px] font-mono tabular-nums">
                      <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                        <tr>
                          <th className="!py-1 text-left">Mov.</th>
                          {simData?.mark != null && <th className="!py-1 text-right">Precio</th>}
                          <th className="!py-1 text-right">P&amp;L Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simData?.filas.map((f) => {
                          const isMark = f.pct === 0;
                          return (
                            <tr key={f.pct} className={`border-t border-[var(--t-border)] ${isMark ? "bg-[var(--t-surface-2)]" : ""}`}>
                              <td className={`!py-1 ${isMark ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text-dim)]"}`}>
                                {isMark ? "actual" : `${fmtSigned(f.pct, 2)}%`}
                              </td>
                              {simData?.mark != null && <td className="!py-1 text-right text-[var(--t-text)]">{fmtNum(f.precio, 2)}</td>}
                              <td className="!py-1 text-right font-semibold" style={{ color: isMark ? "#888" : pnlColor(f.delta) }}>
                                {isMark ? "—" : fmtSigned(f.delta, 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[9px] text-[var(--t-text-muted)] leading-relaxed shrink-0 pt-1 border-t border-[var(--t-border)]">
                    Impacto sobre el mark si el precio se mueve ese %. Short: suba = pérdida.
                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

// Wrapper para devolver dos <tr> (fila + detalle) con una sola key.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function KpiBox({ label, val, big, neutral }: { label: string; val: number; big?: boolean; neutral?: boolean }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</div>
      <div className={`font-mono font-bold ${big ? "text-[17px]" : "text-[13px]"}`} style={{ color: neutral ? "var(--t-text)" : pnlColor(val) }}>
        {neutral ? fmtNum(val, 0) : fmtSigned(val, 0)}
      </div>
    </div>
  );
}
