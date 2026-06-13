"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DownloadButton } from "@/components/download-button";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

interface SeriePoint {
  fecha: string;
  total: number;
  por_emisor: Record<string, number>;
}

interface SnapshotRow {
  unidad: string;
  emisor: string;
  ticker: string;
  cuenta: string;
  id_cuenta: string;
  valuacion: number;
  cantidad: number;
}

const BRAND_BLUE = "#094293";

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFull(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFecha(k: string): string {
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

// Eje X: las fechas de snapshot son irregulares (06/25, 28/02/26, 03/04/26…) →
// quedan "raras". Mostramos solo mes-año abreviado (ej. "may 26"). El día completo
// queda en el tooltip (fmtFecha).
const _MES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtMesAnioX(k: string): string {
  const [y, m] = k.split("-");
  const mi = Number(m) - 1;
  return `${_MES_ABBR[mi] ?? m} ${y.slice(-2)}`;
}

function niceScale(
  min: number,
  max: number,
  maxTicks = 5
): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const d = Math.abs(min) || 1;
    return { min: min - d, max: max + d, ticks: [min - d, min, min + d] };
  }
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep =
    normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step)
    ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
}

type AumTab = "total" | "fci" | "analisis_dinero";

// Exportado para que ValuacionesShell (módulo top-level) lo reuse — VALUACIONES
// salió de /aum y ahora vive en /valuaciones, pero comparte el modelo de cuenta
// y el combobox.
export type CuentaDoc = { id_cuenta: string; cuenta: string };

type CuentaFilter = "todas" | "accionistas" | "sin_accionistas" | "cooperativas" | "productores";
const CUENTA_FILTER_OPTS: { value: CuentaFilter; label: string }[] = [
  { value: "todas",           label: "TODAS" },
  { value: "accionistas",     label: "ACCIONISTAS" },
  { value: "sin_accionistas", label: "SIN ACCIONISTAS" },
  { value: "cooperativas",    label: "COOPERATIVAS" },
  { value: "productores",     label: "PRODUCTORES" },
];

type Moneda = "ARS" | "USD";

// Persiste tab/sub-tab/cuenta en la URL para que el refresh no te
// expulse a la vista por default. Usamos un parser tolerante: si el
// valor de la query no es uno de los esperados, cae al default.
function _readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function _writeUrlParams(params: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.toString());
}

const _AUM_TABS: AumTab[] = ["total", "fci", "analisis_dinero"];

export function AumView() {
  const [tab, setTab] = useState<AumTab>(() => {
    const v = _readUrlParam("tab") as AumTab | null;
    return v && _AUM_TABS.includes(v) ? v : "total";
  });
  const [cuentaFilter, setCuentaFilter] = useState<CuentaFilter>("todas");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  // Filtro MADRE: si hay operador elegido, TODA la vista (y todas las tabs) se
  // scopea a sus cuentas. "" = todos. Se pasa como `operador=` a cada endpoint;
  // el backend (scope_aum) estrecha el scope → no hay lógica por tab.
  const [operador, setOperador] = useState<string>("");
  const [operadores, setOperadores] = useState<
    { operador_email: string; operador_nombre: string | null; n_cuentas: number }[]
  >([]);
  // Selecciones del drill-down de TOTAL — independientes del emisorSel
  // (cartera) del leaderboard izquierdo. Los tres se combinan con AND.
  const [cuentaSel, setCuentaSel] = useState<string | null>(null);
  const [unidadSel, setUnidadSel] = useState<string | null>(null);
  // Búsqueda libre por cuenta / asset. Substring (puede matchear varios).
  // El click pinea uno solo (cuentaSel/unidadSel); el buscador filtra por
  // texto y afecta al resto de los paneles igual que la selección. Si hay
  // selección de ese eje, la selección manda (es más específica que el texto).
  const [cuentaQuery, setCuentaQuery] = useState("");
  const [unidadQuery, setUnidadQuery] = useState("");
  // Indicadores de MEP faltante para el banner.
  const [fechasSinMep, setFechasSinMep] = useState<string[]>([]);
  const [mepMissingSnap, setMepMissingSnap] = useState<boolean>(false);

  // VALUACIONES salió de /aum como tab — ahora vive en /valuaciones (módulo
  // top-level). El state (cuenta, sub-tab) y el fetch de /api/portfolio-cuentas
  // se mudaron a `valuaciones-shell.tsx`.

  // Sync de la tab a la URL. replaceState para no ensuciar el history.
  useEffect(() => {
    _writeUrlParams({
      tab: tab === "total" ? null : tab,  // default = sin param
    });
  }, [tab]);

  // Operadores para el filtro madre (una vez). Si el usuario logueado está
  // registrado como operador, el filtro arranca scopeado a SUS cuentas; si no
  // (manager/admin/trader), queda en "TODOS" como antes.
  useEffect(() => {
    (async () => {
      try {
        const [rOps, rMe] = await Promise.all([
          fetch("/api/portfolio/operadores", { cache: "no-store" }),
          fetch("/api/me", { cache: "no-store" }),
        ]);
        if (!rOps.ok) return;
        const d: { operador_email: string; operador_nombre: string | null; n_cuentas: number }[] =
          await rOps.json();
        setOperadores(d);

        let miEmail: string | null = null;
        if (rMe.ok) {
          try {
            miEmail = ((await rMe.json())?.email ?? null) as string | null;
          } catch {
            /* body no-JSON — ignoramos */
          }
        }
        const mio = miEmail
          ? d.find((o) => o.operador_email?.toLowerCase() === miEmail.toLowerCase())
          : undefined;
        if (mio) setOperador((s) => s || mio.operador_email);
      } catch {
        // silencioso — sin operadores el selector queda en "TODOS".
      }
    })();
  }, []);

  const [loadingSerie, setLoadingSerie] = useState(true);
  const [serieErr, setSerieErr] = useState<string | null>(null);
  const [serie, setSerie] = useState<SeriePoint[]>([]);

  const [loadingSnap, setLoadingSnap] = useState(false);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRow[]>([]);
  const [fechaSel, setFechaSel] = useState<string>("");
  const [emisorSel, setEmisorSel] = useState<string | null>(null);

  // Serie histórica — depende de tab / moneda / cuentaFilter.
  // El chart se re-fetch cuando cambiás el filtro de cuentas (TODAS,
  // ACCIONISTAS, etc) para que la evolución refleje sólo ese subset.
  // Los rangos 1M/3M/6M/YTD/ALL son filtros client-side sobre la base.
  useEffect(() => {
    // ANÁLISIS DE DINERO también necesita la lista de fechas (la serie),
    // aunque no use el chart — lo aprovechamos para alimentar los presets
    // de plazo (Día anterior, MTD, etc).
    if (tab !== "fci" && tab !== "total" && tab !== "analisis_dinero") return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSerie(true);
        const base = tab === "fci" ? "/api/aum-fci/serie" : "/api/aum-total/serie";
        const q = new URLSearchParams({ moneda });
        if (cuentaFilter !== "todas") q.set("cuenta_filter", cuentaFilter);
        if (operador) q.set("operador", operador);
        const res = await fetch(`${base}?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const rawSerie = Array.isArray(json.serie) ? json.serie : [];
        const arr: SeriePoint[] = rawSerie.map((p: { fecha: string; total: number; por_emisor?: Record<string, number>; por_cartera?: Record<string, number> }) => ({
          fecha:      p.fecha,
          total:      p.total,
          por_emisor: p.por_emisor ?? p.por_cartera ?? {},
        }));
        setSerie(arr);
        setFechasSinMep(Array.isArray(json.fechas_sin_mep) ? json.fechas_sin_mep : []);
        // Preservar fechaSel si la nueva serie la contiene (cambió moneda
        // pero las fechas son las mismas). Sólo cae al último cuando es la
        // primera carga o cambió la tab (que sí puede traer fechas distintas).
        if (arr.length) {
          setFechaSel((prev) => {
            if (prev && arr.some((p) => p.fecha === prev)) return prev;
            return arr[arr.length - 1].fecha;
          });
        }
        setSerieErr(null);
      } catch (e) {
        if (!cancelled) setSerieErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, moneda, cuentaFilter, operador]);

  // Snapshot — depende de fecha + cuentaFilter + moneda. Es lo que cambia
  // cuando el usuario juega con los filtros; el chart de evolución se queda
  // quieto.
  useEffect(() => {
    if (tab !== "fci" && tab !== "total") return;
    if (!fechaSel) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSnap(true);
        const base = tab === "total" ? "/api/aum-total/snapshot" : "/api/aum-fci/snapshot";
        const q = new URLSearchParams({ fecha: fechaSel, moneda });
        if (cuentaFilter !== "todas") q.set("cuenta_filter", cuentaFilter);
        if (operador) q.set("operador", operador);
        const res = await fetch(`${base}?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const rawDocs = Array.isArray(json.docs) ? json.docs : [];
        const rows: SnapshotRow[] = rawDocs.map((d: { unidad: string; emisor?: string; cartera?: string; ticker?: string; cuenta: string; id_cuenta: string; valuacion: number; cantidad: number }) => ({
          unidad:    d.unidad,
          emisor:    d.emisor ?? d.cartera ?? "—",
          ticker:    d.ticker ?? d.unidad,
          cuenta:    d.cuenta,
          id_cuenta: d.id_cuenta,
          valuacion: d.valuacion,
          cantidad:  d.cantidad,
        }));
        setSnapshot(rows);
        setMepMissingSnap(Boolean(json.mep_missing));
        setSnapErr(null);
      } catch (e) {
        if (!cancelled) setSnapErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingSnap(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, fechaSel, cuentaFilter, moneda, operador]);

  const fechasAll = useMemo(() => serie.map((s) => s.fecha), [serie]);

  type RangoKey = "1M" | "3M" | "6M" | "YTD" | "ALL";
  const [rangoKey, setRangoKey] = useState<RangoKey>("ALL");

  const chartData = useMemo(() => {
    if (!serie.length || rangoKey === "ALL") return serie;
    const hoy = new Date();
    let corte: Date;
    if (rangoKey === "YTD") {
      corte = new Date(hoy.getFullYear(), 0, 1);
    } else {
      const meses = rangoKey === "1M" ? 1 : rangoKey === "3M" ? 3 : 6;
      corte = new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate());
    }
    const corteStr = corte.toISOString().slice(0, 10);
    return serie.filter((s) => s.fecha >= corteStr);
  }, [serie, rangoKey]);

  // snapshot: total, por emisor, por ticker/cuenta
  const snapshotTotal = useMemo(
    () => snapshot.reduce((s, r) => s + r.valuacion, 0),
    [snapshot]
  );

  const porEmisor = useMemo(() => {
    // POR CARTERA también se filtra cruzado con cuentaSel / unidadSel
    // (mismo pattern que porCuenta y porUnidad). Si el user selecciona
    // una cuenta, porEmisor muestra cómo está distribuida esa cuenta
    // entre carteras (split por emisor). Si selecciona un asset, las
    // carteras donde ese asset existe. NO se filtra por emisorSel —
    // emisorSel es contexto de drill-down, no se aplica a su propio eje.
    const cq = cuentaQuery.trim().toLowerCase();
    const uq = unidadQuery.trim().toLowerCase();
    let base = snapshot;
    // Eje cuenta: la selección pinea una; sin selección, el buscador filtra
    // por substring (puede dejar varias). Idem eje asset.
    if (cuentaSel) base = base.filter((r) => r.cuenta === cuentaSel);
    else if (cq) base = base.filter((r) => r.cuenta.toLowerCase().includes(cq));
    if (unidadSel) base = base.filter((r) => r.ticker === unidadSel || r.unidad === unidadSel);
    else if (uq) base = base.filter((r) => (r.ticker || r.unidad).toLowerCase().includes(uq));
    const agg: Record<string, number> = {};
    for (const r of base) agg[r.emisor] = (agg[r.emisor] || 0) + r.valuacion;
    const totalCtx = Object.values(agg).reduce((s, v) => s + v, 0);
    return Object.entries(agg)
      .map(([emisor, val]) => ({
        emisor,
        valuacion: val,
        share: totalCtx ? (val / totalCtx) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshot, cuentaSel, unidadSel, cuentaQuery, unidadQuery]);

  // ── Drill-down para TOTAL ──────────────────────────────────────────────
  // Snapshot filtrado por la cartera seleccionada en el leaderboard izquierdo
  // (emisorSel cumple ambos roles: emisor para FCI, cartera para TOTAL).
  const snapshotByCartera = useMemo(
    () => (emisorSel ? snapshot.filter((r) => r.emisor === emisorSel) : snapshot),
    [snapshot, emisorSel]
  );

  // Lista POR CUENTA: respeta cartera + cruce con el asset (sel o buscado).
  // La búsqueda de cuenta filtra las filas mostradas acá (post-agregación,
  // para que el share siga siendo % del contexto completo).
  const porCuenta = useMemo(() => {
    const cq = cuentaQuery.trim().toLowerCase();
    const uq = unidadQuery.trim().toLowerCase();
    let base = snapshotByCartera;
    if (unidadSel) base = base.filter((r) => r.ticker === unidadSel || r.unidad === unidadSel);
    else if (uq) base = base.filter((r) => (r.ticker || r.unidad).toLowerCase().includes(uq));
    const agg: Record<string, number> = {};
    for (const r of base) agg[r.cuenta] = (agg[r.cuenta] || 0) + r.valuacion;
    const totalCtx = Object.values(agg).reduce((s, v) => s + v, 0);
    let rows = Object.entries(agg)
      .map(([cuenta, val]) => ({
        cuenta,
        valuacion: val,
        share: totalCtx ? (val / totalCtx) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
    if (cq && !cuentaSel) rows = rows.filter((r) => r.cuenta.toLowerCase().includes(cq));
    // Cuenta seleccionada → la lista se aísla a esa sola (el share sigue
    // siendo % del contexto completo). Click de nuevo sobre ella la
    // deselecciona y vuelven todas. Evita el "marqué una pero siguen todas".
    if (cuentaSel) rows = rows.filter((r) => r.cuenta === cuentaSel);
    return rows;
  }, [snapshotByCartera, unidadSel, cuentaSel, cuentaQuery, unidadQuery]);

  // Lista POR ASSET (unidad/ticker): respeta cartera + cruce con la cuenta
  // (sel o buscada). La búsqueda de asset filtra las filas mostradas acá.
  const porUnidad = useMemo(() => {
    const cq = cuentaQuery.trim().toLowerCase();
    const uq = unidadQuery.trim().toLowerCase();
    let base = snapshotByCartera;
    if (cuentaSel) base = base.filter((r) => r.cuenta === cuentaSel);
    else if (cq) base = base.filter((r) => r.cuenta.toLowerCase().includes(cq));
    const agg: Record<string, number> = {};
    for (const r of base) {
      const k = r.ticker || r.unidad;
      agg[k] = (agg[k] || 0) + r.valuacion;
    }
    const totalCtx = Object.values(agg).reduce((s, v) => s + v, 0);
    let rows = Object.entries(agg)
      .map(([ticker, val]) => ({
        ticker,
        valuacion: val,
        share: totalCtx ? (val / totalCtx) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
    if (uq && !unidadSel) rows = rows.filter((r) => r.ticker.toLowerCase().includes(uq));
    // Simétrico a POR CUENTA: asset seleccionado → la lista se aísla a ese.
    if (unidadSel) rows = rows.filter((r) => r.ticker === unidadSel);
    return rows;
  }, [snapshotByCartera, cuentaSel, unidadSel, cuentaQuery, unidadQuery]);

  // Reset selecciones de drill-down sólo cuando cambia la tab (FCI ↔ TOTAL
  // tienen shape distinto). Cambiar moneda, fecha o cartera preserva las
  // selecciones — la lista de cuentas/assets sigue siendo la misma. Si la
  // selección ya no existe en el dataset filtrado, las tablas se ven
  // vacías y el botón "↺ limpiar" del panel resetea.
  // Reset de drill-downs al cambiar de tab O de operador (filtro madre): la
  // selección vieja ya no aplica al nuevo scope.
  useEffect(() => {
    setEmisorSel(null);
    setCuentaSel(null);
    setUnidadSel(null);
    setCuentaQuery("");
    setUnidadQuery("");
  }, [tab, operador]);

  const detalleEmisor = useMemo(() => {
    if (!emisorSel) return [];
    const sub = snapshot.filter((r) => r.emisor === emisorSel);
    const porTicker: Record<
      string,
      { ticker: string; valuacion: number; cuentas: Record<string, number> }
    > = {};
    for (const r of sub) {
      if (!porTicker[r.ticker])
        porTicker[r.ticker] = { ticker: r.ticker, valuacion: 0, cuentas: {} };
      porTicker[r.ticker].valuacion += r.valuacion;
      porTicker[r.ticker].cuentas[r.cuenta] =
        (porTicker[r.ticker].cuentas[r.cuenta] || 0) + r.valuacion;
    }
    return Object.values(porTicker)
      .map((t) => ({
        ticker: t.ticker,
        valuacion: t.valuacion,
        cuentas: Object.entries(t.cuentas)
          .map(([cuenta, val]) => ({ cuenta, valuacion: val }))
          .sort((a, b) => b.valuacion - a.valuacion),
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshot, emisorSel]);

  const tabBar = (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
      {(["total", "fci", "analisis_dinero"] as AumTab[]).map((t) => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-3 py-0.5 text-[11px] font-semibold tracking-wide border transition-colors ${
            tab === t ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          }`}>
          {t === "fci" ? "FCI"
           : t === "total" ? "TOTAL"
           : "ANÁLISIS DE DINERO"}
        </button>
      ))}
      {/* OPERADOR — filtro MADRE: scopea TODA la vista (todas las tabs) a las
          cuentas del operador. Afuera del condicional fci/total → siempre visible. */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">OPERADOR</span>
        <select
          value={operador}
          onChange={(e) => setOperador(e.target.value)}
          className={`bg-[var(--t-panel)] border text-[10px] px-2 py-0.5 font-mono focus:outline-none ${
            operador ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text)] focus:border-[var(--t-accent)]"
          }`}
          title="Filtra toda la vista AUM a las cuentas de un operador"
        >
          <option value="">TODOS</option>
          {operadores.map((o) => (
            <option key={o.operador_email} value={o.operador_email}>
              {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
            </option>
          ))}
        </select>
      </div>
      {(tab === "fci" || tab === "total") && (
        <div className="flex items-center gap-3">
          {tab === "total" && (
            <>
              {/* FECHA + TOTAL inline para que el chart use todo el espacio
                  vertical y no haya bounce al cargar (los KPIs y el card
                  SNAPSHOT salen del grid principal). */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">FECHA</span>
                <select
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
                >
                  {fechasAll.length === 0 && <option value="">—</option>}
                  {fechasAll.slice().reverse().map((f) => (
                    <option key={f} value={f}>{fmtFecha(f)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">TOTAL</span>
                <span className="text-[12px] font-semibold font-mono" style={{ color: BRAND_BLUE }}>
                  {fmtCompact(snapshotTotal || 0)}
                </span>
                {mepMissingSnap && moneda === "USD" && (
                  <span className="text-[9px] tracking-widest text-[var(--t-accent)]" title="Sin cotización MEP para esta fecha">
                    ⚠ MEP
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">MONEDA</span>
                {(["ARS", "USD"] as Moneda[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMoneda(m)}
                    className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                      moneda === m
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CUENTAS</span>
            <select
              value={cuentaFilter}
              onChange={(e) => setCuentaFilter(e.target.value as CuentaFilter)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
            >
              {CUENTA_FILTER_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  if (tab === "analisis_dinero") {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 min-h-0">
          <AnalisisDinero fechasAll={fechasAll} operador={operador} />
        </div>
      </div>
    );
  }

  if (loadingSerie) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[var(--t-text-muted)] text-sm">Cargando…</div>
      </div>
    );
  }
  if (serieErr) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[var(--t-neg)] text-sm">Error: {serieErr}</div>
      </div>
    );
  }
  if (serie.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[var(--t-text-muted)] text-sm">Sin datos FCI.</div>
      </div>
    );
  }

  const vals = chartData.map((d) => d.total);
  const yScale =
    vals.length > 1
      ? niceScale(Math.min(...vals), Math.max(...vals), 4)
      : { min: 0, max: Math.max(1, vals[0] || 1), ticks: [0, vals[0] || 1] };

  return (
    <div className="h-full flex flex-col min-h-0">
      {tabBar}
      <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col gap-2">
      {moneda === "USD" && fechasSinMep.length > 0 && (
        <div className="border border-[var(--t-accent)]/40 bg-[var(--t-accent)]/5 px-3 py-1.5 text-[10px] text-[var(--t-accent)]">
          ⚠ Sin cotización MEP para {fechasSinMep.length} fecha{fechasSinMep.length > 1 ? "s" : ""} de la serie
          {fechasSinMep.length <= 5 ? `: ${fechasSinMep.join(", ")}` : `. Ej: ${fechasSinMep.slice(0, 5).join(", ")}…`}.
          Esos puntos quedan en ARS sin convertir; revisar feed `Valuaciones.Dolar` para esas fechas.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* COLUMNA IZQUIERDA — evolución + stats.
            En TOTAL: chart toma todo el espacio sobrante (1fr), KPI single,
            leaderboard "POR CARTERA" content-based con max-height (suelen
            ser pocas carteras, no llena la pantalla). */}
        <div className={`min-h-0 grid gap-3 ${
          tab === "total" ? "grid-rows-[1fr_28vh]" : "grid-rows-[auto_1fr]"
        }`}>
          {/* Chart evolución */}
          <div className={`border border-[var(--t-border)] bg-[var(--t-panel)] ${
            tab === "total" ? "flex flex-col min-h-0" : ""
          }`}>
            <PanelHeader
              title={tab === "total" ? "EVOLUCIÓN AUM" : "EVOLUCIÓN FCI"}
              sub={
                chartData.length
                  ? `${fmtFecha(chartData[0].fecha)} → ${fmtFecha(
                      chartData[chartData.length - 1].fecha
                    )}`
                  : ""
              }
            />
            <div className={`p-2 ${tab === "total" ? "flex-1 min-h-0 flex flex-col" : ""}`}>
              <div className={`cursor-pointer ${tab === "total" ? "flex-1 min-h-0" : "h-[220px]"}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 10, bottom: 22, left: 0 }}
                    onClick={(e) => {
                      // Click en un punto del chart = seleccionar ese
                      // snapshot. Evita abrir el selector de fecha.
                      const f = (e as { activeLabel?: string } | null)?.activeLabel;
                      if (f) setFechaSel(f);
                    }}
                  >
                    <defs>
                      <linearGradient id="grad-fci" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={BRAND_BLUE}
                          stopOpacity={0.5}
                        />
                        <stop
                          offset="100%"
                          stopColor={BRAND_BLUE}
                          stopOpacity={0.03}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="fecha"
                      tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                      axisLine={{ stroke: "var(--t-border-2)" }}
                      tickLine={false}
                      tickFormatter={(v: string) => fmtMesAnioX(v)}
                      minTickGap={28}
                      tickMargin={6}
                      angle={0}
                      textAnchor="middle"
                      height={20}
                    />
                    <YAxis
                      domain={[yScale.min, yScale.max]}
                      ticks={yScale.ticks}
                      tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
                      axisLine={{ stroke: "var(--t-border-2)" }}
                      tickLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--t-surface)",
                        border: "1px solid var(--t-border-2)",
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                      labelStyle={{ color: "var(--t-text-dim)" }}
                      labelFormatter={(v) => fmtFecha(String(v))}
                      formatter={(v) => [fmtCompact(Number(v)), tab === "total" ? "Total AUM" : "Total FCI"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={BRAND_BLUE}
                      strokeWidth={2}
                      fill="url(#grad-fci)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {fechasAll.length > 1 && (
                <div className="px-2 pt-1 pb-0 flex items-center justify-center gap-1">
                  {(["1M", "3M", "6M", "YTD", "ALL"] as RangoKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRangoKey(k)}
                      className={`px-2 h-[22px] text-[10px] font-semibold tracking-wide border transition-colors ${
                        rangoKey === k
                          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard del snapshot — por emisor (FCI) o por cartera (TOTAL).
              En TOTAL: la grid principal le asigna 28vh fijo para que
              el chart no rebote al cargar el snapshot (antes arrancaba
              "auto" y el chart agarraba todo el espacio mientras llegaba
              la data, después se comprimía cuando aparecía la tabla). */}
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Stale-while-revalidate: mantenemos las filas previas mientras
                  carga el nuevo snapshot — evita el "bounce" del chart al
                  colapsar la tabla al text "Cargando…" y volver a expandirla. */}
              {snapshot.length === 0 && loadingSnap ? (
                <div className="py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                  Cargando snapshot…
                </div>
              ) : snapshot.length === 0 ? (
                <div className="py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                  Sin datos para esta fecha.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono">
                  {/* Una sola franja de encabezado: el nombre de la 1ª columna ES
                      el título (CARTERA / SOC. GERENTE), sin banda extra arriba. */}
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="!px-2 !py-1.5 text-left text-[var(--t-accent)] bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">
                        {tab === "total" ? "CARTERA" : "SOC. GERENTE"}
                      </th>
                      <th className="!px-2 !py-1.5 text-right text-[var(--t-accent)] bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">VALUACIÓN</th>
                      <th className="!px-2 !py-1.5 text-right text-[var(--t-accent)] bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEmisor.map((r) => {
                      const active = emisorSel === r.emisor;
                      return (
                        <tr
                          key={r.emisor}
                          onClick={() =>
                            setEmisorSel(active ? null : r.emisor)
                          }
                          className={`cursor-pointer border-b border-[var(--t-border)] transition-colors ${
                            active
                              ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]"
                              : "hover:bg-[var(--t-accent)]/5"
                          }`}
                        >
                          <td className="!px-2 !py-1 text-[var(--t-text)]">
                            {r.emisor}
                          </td>
                          <td className="!px-2 !py-1 text-right">
                            {fmtCompact(r.valuacion)}
                          </td>
                          <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">
                            {r.share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA — drill-down. En TOTAL la fecha y el total
            están en el tabBar de arriba, así que el panel de SNAPSHOT
            se oculta y el detalle ocupa toda la columna. En FCI se
            mantiene el card de SNAPSHOT como antes. */}
        <div className="min-h-0 grid gap-3 grid-rows-[1fr]">
          {tab === "total" ? (
            // ── DETALLE TOTAL: dos sub-tablas (CUENTA + ASSET) con
            //     filtro cruzado y reactivo a la cartera del leaderboard.
            <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col min-h-0">
              <PanelHeader
                title="DETALLE"
                sub={(() => {
                  const parts: string[] = [];
                  if (emisorSel) parts.push(`cartera: ${emisorSel}`);
                  if (cuentaSel) parts.push(`cuenta: ${cuentaSel}`);
                  if (unidadSel) parts.push(`asset: ${unidadSel}`);
                  return parts.length ? parts.join(" · ") : "todos los assets y cuentas";
                })()}
                actions={
                  <DownloadButton
                    title="Descargar Excel (Por Cuenta + Por Asset, refleja filtros activos)"
                    onClick={async () => {
                      await exportToXlsx({
                        sheets: [
                          {
                            name: "Por Cuenta",
                            rows: porCuenta,
                            columns: [
                              { header: "CUENTA",    key: "cuenta",    format: "text",     width: 36 },
                              { header: "VALUACIÓN", key: "valuacion", format: "currency", width: 18 },
                              { header: "SHARE %",   key: "share",     format: "percent",  width: 12 },
                            ],
                          },
                          {
                            name: "Por Asset",
                            rows: porUnidad,
                            columns: [
                              { header: "ASSET",     key: "ticker",    format: "text",     width: 36 },
                              { header: "VALUACIÓN", key: "valuacion", format: "currency", width: 18 },
                              { header: "SHARE %",   key: "share",     format: "percent",  width: 12 },
                            ],
                          },
                        ],
                        filename: `aum-detalle-${fechaSel || "snapshot"}-${timestampSuffix()}.xlsx`,
                      });
                    }}
                  />
                }
              />
              <div className="flex-1 min-h-0 overflow-y-auto p-2 grid grid-rows-2 gap-2">
                {/* POR CUENTA */}
                <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0">
                  <div className="px-3 py-1.5 text-[10px] tracking-widest text-[var(--t-text-dim)] flex items-center gap-2 border-b border-[var(--t-border)]">
                    <span>POR CUENTA</span>
                    <span className="text-[var(--t-text-muted)]">{porCuenta.length}</span>
                    <input
                      value={cuentaQuery}
                      onChange={(e) => setCuentaQuery(e.target.value)}
                      placeholder="buscar cuenta…"
                      className="ml-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] tracking-normal w-[150px] text-[var(--t-text)] placeholder:text-[var(--t-text-muted)] focus:border-[var(--t-accent)] outline-none"
                    />
                    {(cuentaSel || unidadSel || cuentaQuery || unidadQuery) && (
                      <button
                        onClick={() => { setCuentaSel(null); setUnidadSel(null); setCuentaQuery(""); setUnidadQuery(""); }}
                        className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px] leading-none"
                        title="Limpiar selección y búsqueda"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {porCuenta.length === 0 ? (
                      <div className="py-6 text-center text-[var(--t-text-muted)] text-[10px]">Sin datos.</div>
                    ) : (
                      porCuenta.map((c) => {
                        const sel = cuentaSel === c.cuenta;
                        return (
                          <button
                            key={c.cuenta}
                            onClick={() => setCuentaSel(sel ? null : c.cuenta)}
                            className={`w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1 text-[11px] border-b border-[var(--t-border)] last:border-b-0 transition-colors ${
                              sel ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]" : "text-[var(--t-text)] hover:bg-[var(--t-accent)]/5"
                            }`}
                          >
                            <span className="text-left truncate" title={c.cuenta}>{c.cuenta}</span>
                            <span className="font-mono">{fmtCompact(c.valuacion)}</span>
                            <span className="text-[9px] text-[var(--t-text-muted)] w-10 text-right">{c.share.toFixed(1)}%</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                {/* POR ASSET */}
                <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0">
                  <div className="px-3 py-1.5 text-[10px] tracking-widest text-[var(--t-text-dim)] flex items-center gap-2 border-b border-[var(--t-border)]">
                    <span>POR ASSET</span>
                    <span className="text-[var(--t-text-muted)]">{porUnidad.length}</span>
                    <input
                      value={unidadQuery}
                      onChange={(e) => setUnidadQuery(e.target.value)}
                      placeholder="buscar asset…"
                      className="ml-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] tracking-normal w-[150px] text-[var(--t-text)] placeholder:text-[var(--t-text-muted)] focus:border-[var(--t-accent)] outline-none"
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {porUnidad.length === 0 ? (
                      <div className="py-6 text-center text-[var(--t-text-muted)] text-[10px]">Sin datos.</div>
                    ) : (
                      porUnidad.map((u) => {
                        const sel = unidadSel === u.ticker;
                        return (
                          <button
                            key={u.ticker}
                            onClick={() => setUnidadSel(sel ? null : u.ticker)}
                            className={`w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1 text-[11px] border-b border-[var(--t-border)] last:border-b-0 transition-colors ${
                              sel ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]" : "text-[var(--t-text)] hover:bg-[var(--t-accent)]/5"
                            }`}
                          >
                            <span className="text-left truncate" title={u.ticker}>{u.ticker}</span>
                            <span className="font-mono">{fmtCompact(u.valuacion)}</span>
                            <span className="text-[9px] text-[var(--t-text-muted)] w-10 text-right">{u.share.toFixed(1)}%</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col min-h-0">
              <PanelHeader
                title={`DETALLE · ${fmtFull(snapshotTotal)}`}
                sub={
                  emisorSel
                    ? `${emisorSel} · ${fmtCompact(
                        porEmisor.find((p) => p.emisor === emisorSel)
                          ?.valuacion || 0
                      )}`
                    : "Seleccioná un emisor"
                }
                actions={<DateStepper fechas={fechasAll} value={fechaSel} onChange={setFechaSel} />}
              />
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                {snapErr ? (
                  <div className="text-[var(--t-neg)] text-[11px] p-2">
                    Error: {snapErr}
                  </div>
                ) : !emisorSel ? (
                  <div className="py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                    Seleccioná una sociedad gerente para ver sus fondos y cuentas.
                  </div>
                ) : detalleEmisor.length === 0 ? (
                  <div className="py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                    Sin detalle.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detalleEmisor.map((t) => (
                      <TickerCard
                        key={t.ticker}
                        ticker={t.ticker}
                        valuacion={t.valuacion}
                        cuentas={t.cuentas}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AnalisisDinero — sub-tab de /aum: compara el saldo de cada cuenta entre
// dos fechas snapshot, lista diferencias ordenadas por |diff|, marca
// cuentas nuevas / cerradas, y muestra cards con totales.
// ─────────────────────────────────────────────────────────────────────────

type DiffPlazo = "previo" | "semana" | "mes" | "mtd" | "ytd" | "custom";
type DiffMoneda = "ARS" | "USD";
type DiffSortKey = "diff" | "actual" | "anterior" | "cuenta";

interface DiffRow {
  id_cuenta: string;
  cuenta: string;
  saldo_actual: number | null;
  saldo_anterior: number | null;
  diff: number;
  es_nueva: boolean;
  es_cerrada: boolean;
}

interface DiffResp {
  fecha_actual_resuelta:   string;
  fecha_anterior_resuelta: string;
  moneda:                  DiffMoneda;
  mep_missing_actual:      boolean;
  mep_missing_anterior:    boolean;
  filas:                   DiffRow[];
  total_diff:              number;
  n_total:                 number;
  n_nuevas:                number;
  n_cerradas:              number;
}

function AnalisisDinero({ fechasAll, operador }: { fechasAll: string[]; operador: string }) {
  const [plazo, setPlazo] = useState<DiffPlazo>("previo");
  const [moneda, setMoneda] = useState<DiffMoneda>("ARS");
  const [customActual, setCustomActual] = useState<string>("");
  const [customAnterior, setCustomAnterior] = useState<string>("");
  const [data, setData] = useState<DiffResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<DiffSortKey>("diff");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Resolver fecha actual y anterior según el preset elegido. Para presets
  // tipo "−1 mes" buscamos la fecha disponible más cercana <= target.
  const { fechaActual, fechaAnterior } = useMemo(() => {
    if (!fechasAll.length) return { fechaActual: "", fechaAnterior: "" };
    if (plazo === "custom") {
      return { fechaActual: customActual, fechaAnterior: customAnterior };
    }
    const ultima = fechasAll[fechasAll.length - 1];
    if (plazo === "previo") {
      const prev = fechasAll.length >= 2 ? fechasAll[fechasAll.length - 2] : ultima;
      return { fechaActual: ultima, fechaAnterior: prev };
    }
    const ultimaDt = new Date(ultima + "T00:00:00");
    let target: Date;
    if (plazo === "semana") {
      target = new Date(ultimaDt); target.setDate(target.getDate() - 7);
    } else if (plazo === "mes") {
      target = new Date(ultimaDt); target.setMonth(target.getMonth() - 1);
    } else if (plazo === "mtd") {
      target = new Date(ultimaDt.getFullYear(), ultimaDt.getMonth(), 1);
    } else { // ytd
      target = new Date(ultimaDt.getFullYear(), 0, 1);
    }
    const targetStr = target.toISOString().slice(0, 10);
    const candidatos = fechasAll.filter(f => f <= targetStr);
    const prev = candidatos.length ? candidatos[candidatos.length - 1] : fechasAll[0];
    return { fechaActual: ultima, fechaAnterior: prev };
  }, [fechasAll, plazo, customActual, customAnterior]);

  useEffect(() => {
    if (!fechaActual || !fechaAnterior) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const q = new URLSearchParams({
          fecha_actual:    fechaActual,
          fecha_anterior:  fechaAnterior,
          moneda,
        });
        if (operador) q.set("operador", operador);
        const res = await fetch(`/api/aum-diff?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fechaActual, fechaAnterior, moneda, operador]);

  const filasOrdenadas = useMemo(() => {
    if (!data) return [];
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...data.filas].sort((a, b) => {
      if (sortKey === "cuenta") {
        return (a.cuenta || "").localeCompare(b.cuenta || "") * sgn;
      }
      const av = sortKey === "actual"   ? (a.saldo_actual   ?? Number.NEGATIVE_INFINITY)
               : sortKey === "anterior" ? (a.saldo_anterior ?? Number.NEGATIVE_INFINITY)
               : a.diff;
      const bv = sortKey === "actual"   ? (b.saldo_actual   ?? Number.NEGATIVE_INFINITY)
               : sortKey === "anterior" ? (b.saldo_anterior ?? Number.NEGATIVE_INFINITY)
               : b.diff;
      return (av - bv) * sgn;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (k: DiffSortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const arrow = (k: DiffSortKey) => sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  return (
    <div className="h-full grid grid-cols-[200px_1fr] gap-3 p-3 overflow-hidden">
      {/* Sidebar */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 flex flex-col gap-1.5 min-h-0 overflow-auto">
        <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-widest mb-1">Plazo</div>
        {(["previo", "semana", "mes", "mtd", "ytd", "custom"] as DiffPlazo[]).map(p => (
          <button key={p} onClick={() => setPlazo(p)}
            className={`text-left px-2 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${
              plazo === p
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}>
            {p === "previo" ? "DÍA ANTERIOR"
             : p === "semana" ? "−7 DÍAS"
             : p === "mes" ? "−1 MES"
             : p === "mtd" ? "MTD"
             : p === "ytd" ? "YTD"
             : "CUSTOM"}
          </button>
        ))}

        {plazo === "custom" && (
          <>
            <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-widest mt-3 mb-1">Fecha actual</div>
            <select value={customActual} onChange={e => setCustomActual(e.target.value)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
              <option value="">—</option>
              {[...fechasAll].reverse().map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-widest mb-1">Fecha anterior</div>
            <select value={customAnterior} onChange={e => setCustomAnterior(e.target.value)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
              <option value="">—</option>
              {[...fechasAll].reverse().map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </>
        )}

        <div className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-widest mt-3 mb-1">Moneda</div>
        <div className="flex gap-1">
          {(["ARS", "USD"] as DiffMoneda[]).map(m => (
            <button key={m} onClick={() => setMoneda(m)}
              className={`flex-1 px-2 py-1 text-[10px] font-semibold border transition-colors ${
                moneda === m
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}>
              {m}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-[var(--t-border)] text-[9px] text-[var(--t-text-muted)] font-mono leading-tight">
          {data ? (
            <>
              <div>actual: <span className="text-[var(--t-text-dim)]">{data.fecha_actual_resuelta}</span></div>
              <div>anterior: <span className="text-[var(--t-text-dim)]">{data.fecha_anterior_resuelta}</span></div>
              {(data.mep_missing_actual || data.mep_missing_anterior) && (
                <div className="mt-1 text-[var(--t-accent)]">⚠ MEP missing en una fecha</div>
              )}
            </>
          ) : <span className="text-[var(--t-text-muted)]">—</span>}
        </div>
      </div>

      {/* Main */}
      <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Kpi
            label={`TOTAL DIFERENCIA · ${moneda}`}
            value={data ? (data.total_diff > 0 ? "+" : "") + fmtCompact(data.total_diff) : "—"}
            accent={data ? (data.total_diff >= 0 ? "var(--t-pos)" : "#ff4d4d") : BRAND_BLUE}
          />
          <Kpi label="CUENTAS NUEVAS" value={data ? String(data.n_nuevas) : "—"}
               sub={data ? `de ${data.n_total} totales` : ""} />
          <Kpi label="CUENTAS CERRADAS" value={data ? String(data.n_cerradas) : "—"} />
        </div>

        {/* Tabla */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex-1 min-h-0 flex flex-col overflow-hidden">
          {err ? (
            <div className="p-3 text-[var(--t-neg)] text-[11px]">Error: {err}</div>
          ) : loading && !data ? (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-[11px]">Cargando…</div>
          ) : data && data.filas.length === 0 ? (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-[11px]">Sin diferencias.</div>
          ) : data ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
                  <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                    <th onClick={() => toggleSort("cuenta")}
                        className="px-3 py-2 text-left cursor-pointer hover:text-[var(--t-accent)] select-none">
                      CUENTA {arrow("cuenta")}
                    </th>
                    <th onClick={() => toggleSort("actual")}
                        className="px-3 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      SALDO ACTUAL {arrow("actual")}
                    </th>
                    <th onClick={() => toggleSort("anterior")}
                        className="px-3 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      SALDO ANTERIOR {arrow("anterior")}
                    </th>
                    <th onClick={() => toggleSort("diff")}
                        className="px-3 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      DIFERENCIA {arrow("diff")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((r) => {
                    const tagNueva   = r.es_nueva && !r.es_cerrada;
                    const tagCerrada = r.es_cerrada;
                    return (
                      <tr key={r.id_cuenta} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                        <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[480px]" title={r.cuenta}>
                          <span className="text-[var(--t-text-muted)] mr-1">[{r.id_cuenta}]</span>
                          {r.cuenta.replace(/^\[\d+\]\s*/, "")}
                          {tagNueva && (
                            <span className="ml-2 px-1 py-0.5 text-[9px] bg-[#00cc66]/15 text-[var(--t-pos)] tracking-widest">
                              NUEVA
                            </span>
                          )}
                          {tagCerrada && (
                            <span className="ml-2 px-1 py-0.5 text-[9px] bg-[#ff4d4d]/15 text-[var(--t-neg)] tracking-widest">
                              CERRADA
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--t-text)]">
                          {r.saldo_actual !== null ? fmtCompact(r.saldo_actual) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--t-text)]">
                          {r.saldo_anterior !== null ? fmtCompact(r.saldo_anterior) : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${
                          r.diff > 0 ? "text-[var(--t-pos)]" : r.diff < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
                        }`}>
                          {r.diff > 0 ? "+" : ""}{fmtCompact(r.diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-[11px]">Esperando fechas…</div>
          )}
        </div>
      </div>
    </div>
  );
}


// Combobox tipeable — input con dropdown filtrable. UX: al hacer focus abre la
// lista; al tipear filtra por id_cuenta o denominación; click en opción
// selecciona; ESC o click afuera cierra.
export function CuentaCombobox({
  cuentas,
  value,
  onChange,
}: {
  cuentas: CuentaDoc[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const selected = cuentas.find((c) => c.id_cuenta === value);
  const display = selected
    ? `[${selected.id_cuenta}] ${selected.cuenta.replace(/^\[\d+\]\s*/, "")}`
    : "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter(
      (c) =>
        c.id_cuenta.toLowerCase().includes(q) ||
        c.cuenta.toLowerCase().includes(q),
    );
  }, [cuentas, search]);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Al abrir, scrolleamos la cuenta seleccionada al centro del dropdown
  // para que el user la vea sin tener que buscar en una lista larga.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const sel = listRef.current.querySelector('[data-selected="true"]');
    if (sel) sel.scrollIntoView({ block: "center" });
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted].id_cuenta);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-[320px]">
      <input
        type="text"
        // Si el dropdown está abierto, mostramos lo que el user tipea
        // (puede estar vacío); si está cerrado, mostramos la cuenta
        // seleccionada como label.
        value={open ? search : display}
        onFocus={() => {
          // Abrimos con la lista COMPLETA visible (search vacío).
          // Pre-highlight de la cuenta actual para que ArrowUp/Down
          // arranquen desde ahí, y el efecto de scrollIntoView la
          // centra automáticamente.
          setSearch("");
          setOpen(true);
          const idx = cuentas.findIndex((c) => c.id_cuenta === value);
          setHighlighted(idx >= 0 ? idx : 0);
        }}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={handleKey}
        placeholder={
          cuentas.length === 0
            ? "— sin cuentas —"
            : open
              ? "Tipeá para filtrar o scrolleá la lista…"
              : "Seleccionar cuenta"
        }
        className="w-full bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-0.5 z-50 max-h-[280px] overflow-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-lg"
        >
          {filtered.map((c, i) => {
            const isSel = c.id_cuenta === value;
            const isHi = i === highlighted;
            return (
              <li
                key={c.id_cuenta}
                data-selected={isSel || undefined}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => { e.preventDefault(); select(c.id_cuenta); }}
                className={`px-2 py-1 text-[10px] font-mono cursor-pointer ${
                  isSel
                    ? "text-[var(--t-accent)] bg-[var(--t-accent)]/10"
                    : isHi
                      ? "bg-[var(--t-accent)]/10 text-[var(--t-text)]"
                      : "text-[var(--t-text)] hover:bg-[var(--t-accent)]/5"
                }`}
              >
                <span className="text-[var(--t-text-dim)]">[{c.id_cuenta}]</span>{" "}
                {c.cuenta.replace(/^\[\d+\]\s*/, "")}
              </li>
            );
          })}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-2 text-[10px] text-[var(--t-text-muted)]">
          Sin resultados
        </div>
      )}
    </div>
  );
}

function TickerCard({
  ticker,
  valuacion,
  cuentas,
}: {
  ticker: string;
  valuacion: number;
  cuentas: { cuenta: string; valuacion: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center px-3 py-2 hover:bg-[var(--t-accent)]/5 transition-colors"
      >
        <span className="text-[11px] font-semibold text-[var(--t-text)] tracking-wide">
          {ticker}
        </span>
        <span
          className="ml-auto text-[12px] font-semibold"
          style={{ color: "#094293" }}
        >
          {fmtFull(valuacion)}
        </span>
        <span className="ml-3 text-[10px] text-[var(--t-text-muted)]">
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--t-border)] bg-[var(--t-panel)]">
          {cuentas.map((c) => (
            <div
              key={c.cuenta}
              className="flex items-center px-3 py-1 text-[11px] border-b border-[var(--t-border)] last:border-b-0"
            >
              <span className="text-[var(--t-text-dim)] truncate">{c.cuenta}</span>
              <span className="ml-auto font-semibold text-[var(--t-text)]">
                {fmtFull(c.valuacion)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
      <div className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wide">
        {label}
      </div>
      <div
        className="text-[18px] font-semibold truncate"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--t-text-muted)]">{sub}</div>}
    </div>
  );
}

function PanelHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
      <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
        {title}
      </span>
      {sub && (
        <span className="ml-auto text-[10px] text-[var(--t-text-dim)] truncate max-w-[60%]">
          {sub}
        </span>
      )}
      {actions && (
        <span className={`flex items-center gap-1 ${sub ? "ml-2" : "ml-auto"}`}>
          {actions}
        </span>
      )}
    </div>
  );
}

// Navegador de fecha horizontal: ◀ fecha ▶. `fechas` ascendente; ◀ va a la
// anterior, ▶ a la siguiente. Reemplaza el dropdown de fecha del snapshot FCI.
function DateStepper({
  fechas,
  value,
  onChange,
}: {
  fechas: string[];
  value: string;
  onChange: (f: string) => void;
}) {
  const idx = fechas.indexOf(value);
  const go = (d: number) => {
    const ni = idx + d;
    if (ni >= 0 && ni < fechas.length) onChange(fechas[ni]);
  };
  const btn =
    "px-1.5 h-[20px] text-[11px] leading-none border border-[var(--t-border-2)] text-[var(--t-text-dim)] " +
    "hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <span className="inline-flex items-center gap-1 font-mono">
      <button type="button" onClick={() => go(-1)} disabled={idx <= 0} className={btn} title="Fecha anterior">◀</button>
      <span className="text-[11px] text-[var(--t-text)] min-w-[58px] text-center tabular-nums">
        {value ? fmtFecha(value) : "—"}
      </span>
      <button type="button" onClick={() => go(1)} disabled={idx < 0 || idx >= fechas.length - 1} className={btn} title="Fecha siguiente">▶</button>
    </span>
  );
}

