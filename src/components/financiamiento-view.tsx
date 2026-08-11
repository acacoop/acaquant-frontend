"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchJson } from "@/lib/fetch-json";
import { fmtFechaCorta, MESES_CORTOS as MESES } from "@/lib/fmt";

/**
 * FINANCIAMIENTO (tab de /operaciones, dentro de NEGOCIO).
 *
 * Libro VIVO de pagarés / cheques: los instrumentos con cartera FINANCIAMIENTO
 * cuyo vencimiento es HOY o posterior. Lo vencido ya cobró y no se muestra.
 *
 * SE MIRA LA CANTIDAD, NO EL BRUTO (decisión del user). Estos papeles se compran
 * con descuento y la mayoría son dólar-linked liquidados en pesos, así que el
 * importe pagado no es comparable entre filas. Lo relevante es el NOMINAL (la
 * operación real) y la TASA. Por eso no hay ninguna columna de plata acá.
 *
 * Layout 2×2, 50% cada panel:
 *   ┌ CUENTAS (cantidad por comitente) ┬ INSTRUMENTOS (cantidad + tasa) ┐
 *   ├ VENCIMIENTOS (cantidad por fecha)┴ (reservado)                    ┤
 *
 * TODO cruza: elegir una cuenta deja ver sus instrumentos y redibuja el gráfico;
 * elegir un instrumento deja ver quién lo tiene; clickear una barra acota a esa
 * fecha. Cada panel agrega sobre las filas filtradas por los OTROS dos, que es lo
 * que hace que el cruce se sienta como un tablero y no como tres tablas sueltas.
 *
 * El endpoint manda el GRANO (cuenta × instrumento) de una sola vez → el cruce es
 * instantáneo, sin refetch por click.
 */

type Fila = {
  id_cuenta: string;
  cuenta: string;
  unidad: string;
  ticker: string;
  emisor: string;
  clase: string;            // 'HD' | 'DL' | '' (todavía sin clasificar)
  vencimiento: string;
  dias: number;
  cantidad: number;
  moneda: string;
  tasa: number | null;
  tasa_min: number | null;
  tasa_max: number | null;
  n_boletos: number;
};

type Resp = {
  fecha: string | null;
  hoy: string;
  filas: Fila[];
  n: number;
  con_tasa: number;
  truncado: boolean;
};

type Agg = "DIA" | "SEM" | "MES";
const AGGS: [Agg, string][] = [["DIA", "Día"], ["SEM", "Sem"], ["MES", "Mes"]];

// Orden fijo de las clases. HD (hard dollar) y DL (dólar linked) son ESCALAS
// distintas — un HD de 5.000 y un DL de 27.000.000 no se pueden sumar ni
// graficar juntos, así que la vista muestra UNA por vez. El orden es fijo (no
// "la más grande") para que la pantalla no cambie de default sola.
const CLASES: [string, string][] = [["HD", "HD"], ["DL", "DL"], ["", "SIN CLASIFICAR"]];

/** Nominal compacto. NO lleva "$": es cantidad, no plata (ver el header del archivo). */
function fmtCant(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const f = (x: number, d: number) => x.toLocaleString("es-AR", { maximumFractionDigits: d });
  if (a >= 1e12) return `${sign}${f(a / 1e12, 2)} B`;
  if (a >= 1e9) return `${sign}${f(a / 1e9, 2)} MM`;
  if (a >= 1e6) return `${sign}${f(a / 1e6, 2)} M`;
  if (a >= 1e3) return `${sign}${f(a / 1e3, 1)} k`;
  return `${sign}${f(a, 0)}`;
}
const fmtCantFull = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtTasa = (t: number | null) => (t == null ? "—" : `${t.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`);

function lunesDeSemana(fechaIso: string): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  const dow = d.getUTCDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10);
}
function bucketKey(fecha: string, agg: Agg): string {
  if (agg === "MES") return fecha.slice(0, 7);
  if (agg === "SEM") return lunesDeSemana(fecha);
  return fecha;
}
function bucketLabel(key: string, agg: Agg): string {
  if (agg === "MES") {
    const [y, m] = key.split("-");
    return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
  }
  return fmtFechaCorta(key);
}

/** Promedio de tasa PONDERADO POR NOMINAL. Las filas sin tasa no pesan (no valen 0%). */
function tasaPond(filas: Fila[]): number | null {
  let num = 0;
  let den = 0;
  for (const f of filas) {
    if (f.tasa == null) continue;
    const w = Math.abs(f.cantidad);
    num += f.tasa * w;
    den += w;
  }
  return den ? num / den : null;
}

export function FinanciamientoView() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filtros de barra. `clase` arranca en null = "la que el orden fijo elija" —
  // no se puede fijar un default antes de saber qué clases trajo el payload.
  const [clase, setClase] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agg, setAgg] = useState<Agg>("MES");

  // Selección cruzada (los tres se combinan).
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [selUnidad, setSelUnidad] = useState<string | null>(null);
  const [selBucket, setSelBucket] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const d = await fetchJson<Resp>("/api/operaciones/financiamiento");
        if (!cancel) setData(d);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Cambiar la agregación cambia los buckets → la barra elegida deja de existir.
  // Se limpia en el handler (no en un effect): es consecuencia directa del click.
  const cambiarAgg = (a: Agg) => {
    setAgg(a);
    setSelBucket(null);
  };

  // Clases presentes en el payload, en el orden fijo de CLASES + su conteo.
  const clases = useMemo(() => {
    const n = new Map<string, number>();
    for (const f of data?.filas ?? []) n.set(f.clase, (n.get(f.clase) ?? 0) + 1);
    return CLASES.filter(([k]) => n.has(k)).map(([k, label]) => ({
      k, label, n: n.get(k) ?? 0,
    }));
  }, [data]);

  // La clase EFECTIVA se deriva (no se guarda con un effect): la elegida si
  // sigue existiendo, si no la primera del orden fijo. Así nunca queda una
  // pantalla vacía porque el default apuntaba a una clase sin datos.
  const claseAct = clases.some((c) => c.k === clase) ? clase! : (clases[0]?.k ?? "");

  // BASE: lo que pasa los filtros de la barra. Las tres vistas parten de acá y
  // cada una se saca a sí misma del cruce (así elegir en una no la vacía).
  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.filas ?? []).filter(
      (f) =>
        f.clase === claseAct &&
        (!term ||
          f.cuenta.toLowerCase().includes(term) ||
          f.id_cuenta.toLowerCase().includes(term) ||
          f.ticker.toLowerCase().includes(term) ||
          f.emisor.toLowerCase().includes(term)),
    );
  }, [data, claseAct, q]);

  // 1) CUENTAS — sumatoria de cantidad por comitente (cruzada por instrumento + fecha).
  const cuentas = useMemo(() => {
    const okUnidad = (f: Fila) => !selUnidad || f.unidad === selUnidad;
    const okBucket = (f: Fila) => !selBucket || bucketKey(f.vencimiento, agg) === selBucket;
    const m = new Map<string, { id_cuenta: string; cuenta: string; filas: Fila[] }>();
    for (const f of base) {
      if (!okUnidad(f) || !okBucket(f)) continue;
      const e = m.get(f.id_cuenta) ?? { id_cuenta: f.id_cuenta, cuenta: f.cuenta, filas: [] };
      e.filas.push(f);
      m.set(f.id_cuenta, e);
    }
    return [...m.values()]
      .map((e) => ({
        id_cuenta: e.id_cuenta,
        cuenta: e.cuenta,
        cantidad: e.filas.reduce((s, f) => s + f.cantidad, 0),
        tasa: tasaPond(e.filas),
        n: new Set(e.filas.map((f) => f.unidad)).size,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [base, selUnidad, selBucket, agg]);

  // 2) INSTRUMENTOS — cantidad + tasa por papel (cruzado por cuenta + fecha).
  const instrumentos = useMemo(() => {
    const okCuenta = (f: Fila) => !selCuenta || f.id_cuenta === selCuenta;
    const okBucket = (f: Fila) => !selBucket || bucketKey(f.vencimiento, agg) === selBucket;
    const m = new Map<string, { f0: Fila; filas: Fila[] }>();
    for (const f of base) {
      if (!okCuenta(f) || !okBucket(f)) continue;
      const e = m.get(f.unidad) ?? { f0: f, filas: [] };
      e.filas.push(f);
      m.set(f.unidad, e);
    }
    return [...m.values()]
      .map((e) => ({
        unidad: e.f0.unidad,
        ticker: e.f0.ticker,
        emisor: e.f0.emisor,
        vencimiento: e.f0.vencimiento,
        dias: e.f0.dias,
        moneda: e.f0.moneda,
        cantidad: e.filas.reduce((s, f) => s + f.cantidad, 0),
        tasa: tasaPond(e.filas),
        // El promedio esconde dispersión cuando el mismo papel se compró a tasas
        // distintas. Se marca en la fila en vez de mostrar un número que no pasó.
        dispersa: e.filas.some(
          (f) => f.tasa_min != null && f.tasa_max != null && f.tasa_max - f.tasa_min > 0.001,
        ),
        n: new Set(e.filas.map((f) => f.id_cuenta)).size,
      }))
      .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || b.cantidad - a.cantidad);
  }, [base, selCuenta, selBucket, agg]);

  // 3) CHART — sumatoria de cantidad por fecha de vencimiento (cruzado por cuenta + papel).
  const chart = useMemo(() => {
    const okCuenta = (f: Fila) => !selCuenta || f.id_cuenta === selCuenta;
    const okUnidad = (f: Fila) => !selUnidad || f.unidad === selUnidad;
    const m = new Map<string, number>();
    for (const f of base) {
      if (!okCuenta(f) || !okUnidad(f)) continue;
      const k = bucketKey(f.vencimiento, agg);
      m.set(k, (m.get(k) ?? 0) + f.cantidad);
    }
    return [...m.entries()]
      .map(([bucket, cantidad]) => ({ bucket, cantidad }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [base, selCuenta, selUnidad, agg]);

  // Total de lo que hay a la vista con TODAS las selecciones aplicadas.
  const visibles = useMemo(
    () =>
      base.filter(
        (f) =>
          (!selCuenta || f.id_cuenta === selCuenta) &&
          (!selUnidad || f.unidad === selUnidad) &&
          (!selBucket || bucketKey(f.vencimiento, agg) === selBucket),
      ),
    [base, selCuenta, selUnidad, selBucket, agg],
  );
  const totalCant = visibles.reduce((s, f) => s + f.cantidad, 0);
  const totalTasa = tasaPond(visibles);
  const haySeleccion = Boolean(selCuenta || selUnidad || selBucket);

  const limpiar = () => {
    setSelCuenta(null);
    setSelUnidad(null);
    setSelBucket(null);
  };

  if (loading) return <Aviso texto="cargando…" />;
  if (err) return <Aviso texto={err} error />;
  if (!data || data.n === 0) {
    return (
      <Aviso texto="No hay instrumentos de FINANCIAMIENTO con vencimiento de hoy en adelante." />
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* BARRA */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
          Financiamiento
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          vigentes al {fmtFechaCorta(data.hoy)}
        </span>

        <label
          className={
            "inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] " +
            (q ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)]")
          }
          title="Buscar por cliente, cuenta, ticker o emisor"
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="buscar cliente / ticker / emisor"
            className="w-[190px] bg-transparent text-[10px] text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-muted)]"
          />
          {q && (
            <button onClick={() => setQ("")} title="Limpiar" className="text-[9px] text-[var(--t-accent)] hover:underline">
              ✕
            </button>
          )}
        </label>

        {/* CLASE — una por vez, nunca sumadas: son escalas distintas. */}
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {clases.map((c) => (
            <button
              key={c.k || "sin"}
              onClick={() => {
                setClase(c.k);
                limpiar();
              }}
              title={
                c.k === "HD" ? "Hard dollar — nominal en dólares"
                  : c.k === "DL" ? "Dólar linked — nominal en la escala grande"
                    : "Sin CLASE_ACTIVO cargada. Los completa jobs/assets_autofill "
                      + "(regla financiamiento_clase) y se corrigen en Manager → ASSETS."
              }
              className={
                "px-2 py-0.5 text-[9px] font-semibold " +
                (claseAct === c.k
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                  : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
              }
            >
              {c.label} <span className="opacity-60">{c.n}</span>
            </button>
          ))}
        </div>

        {haySeleccion && (
          <button
            onClick={limpiar}
            className="px-1.5 py-0.5 text-[9px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
          >
            LIMPIAR SELECCIÓN
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {claseAct === "" && (
            <span
              className="text-[9px] text-[#e0a33a]"
              title="Estos assets no tienen CLASE_ACTIVO. Hasta que se clasifiquen no se sabe si su nominal es HD o DL, así que su total mezcla escalas. Los completa jobs/assets_autofill (regla financiamiento_clase); se corrigen a mano en Manager → ASSETS."
            >
              ⚠ sin clasificar
            </span>
          )}
          {data.truncado && (
            <span className="text-[9px] text-[#e0a33a]" title="El libro superó el tope del payload — la vista está incompleta.">
              ⚠ truncado
            </span>
          )}
          <span className="text-[9px] text-[var(--t-text-muted)]" title="Filas con tasa resuelta desde el boleto MAV">
            tasa {data.con_tasa}/{data.n}
          </span>
          <span className="text-[10px] font-mono" title={fmtCantFull(totalCant)}>
            {fmtCant(totalCant)} nominal · {fmtTasa(totalTasa)}
          </span>
        </div>
      </div>

      {/* 2×2 — 50% cada panel */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2 p-2 overflow-hidden">
        {/* 1) CUENTAS */}
        <Panel
          titulo="Cantidad por cuenta comitente"
          extra={`${cuentas.length} cuentas`}
          derecha={fmtCant(cuentas.reduce((s, c) => s + c.cantidad, 0))}
        >
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)] [&_th]:border-b [&_th]:border-[var(--t-border)] [&_th]:py-1">
              <tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Comitente</th>
                <th className="text-right !px-2">Instr.</th>
                <th className="text-right !px-2">Cantidad</th>
                <th className="text-right !px-2">Tasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--t-border)]">
              {cuentas.map((c) => {
                const on = c.id_cuenta === selCuenta;
                return (
                  <tr
                    key={c.id_cuenta}
                    onClick={() => setSelCuenta(on ? null : c.id_cuenta)}
                    className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}
                  >
                    <td className="!px-2 truncate max-w-[240px]" title={c.cuenta}>{c.cuenta}</td>
                    <td className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{c.n}</td>
                    <td className="!px-2 text-right tabular-nums font-semibold" title={fmtCantFull(c.cantidad)}>
                      {fmtCant(c.cantidad)}
                    </td>
                    <td className="!px-2 text-right tabular-nums">{fmtTasa(c.tasa)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* 2) INSTRUMENTOS */}
        <Panel
          titulo="Cantidad y tasa por instrumento"
          extra={
            selCuenta
              ? cuentas.find((c) => c.id_cuenta === selCuenta)?.cuenta ?? selCuenta
              : `${instrumentos.length} instrumentos`
          }
          derecha={fmtCant(instrumentos.reduce((s, i) => s + i.cantidad, 0))}
        >
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)] [&_th]:border-b [&_th]:border-[var(--t-border)] [&_th]:py-1">
              <tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Ticker</th>
                <th className="text-left !px-2">Emisor</th>
                <th className="text-right !px-2">Vto</th>
                <th className="text-right !px-2">Días</th>
                <th className="text-right !px-2">Cant.</th>
                <th className="text-right !px-2">Tasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--t-border)]">
              {instrumentos.map((i) => {
                const on = i.unidad === selUnidad;
                return (
                  <tr
                    key={i.unidad}
                    onClick={() => setSelUnidad(on ? null : i.unidad)}
                    className={`cursor-pointer ${on ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-border)]"}`}
                  >
                    <td className="!px-2 font-mono truncate max-w-[120px]" title={i.unidad}>{i.ticker}</td>
                    <td className="!px-2 truncate max-w-[110px] text-[var(--t-text-dim)]" title={i.emisor}>
                      {i.emisor || "—"}
                    </td>
                    <td className="!px-2 text-right tabular-nums">{fmtFechaCorta(i.vencimiento)}</td>
                    <td className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{i.dias}</td>
                    <td className="!px-2 text-right tabular-nums font-semibold" title={`${fmtCantFull(i.cantidad)} ${i.moneda} · ${i.n} cuenta(s)`}>
                      {fmtCant(i.cantidad)}
                    </td>
                    <td
                      className="!px-2 text-right tabular-nums"
                      title={i.dispersa ? "Promedio ponderado: el papel se compró a tasas distintas" : undefined}
                    >
                      {fmtTasa(i.tasa)}
                      {i.dispersa && <span className="text-[#e0a33a]"> *</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* 3) CHART — cantidad por fecha de vencimiento */}
        <Panel
          titulo="Cantidad por fecha de vencimiento"
          extra={
            [
              selCuenta ? cuentas.find((c) => c.id_cuenta === selCuenta)?.cuenta ?? selCuenta : null,
              selUnidad ? instrumentos.find((i) => i.unidad === selUnidad)?.ticker ?? selUnidad : null,
            ]
              .filter(Boolean)
              .join(" · ") || "todo el libro"
          }
          scroll={false}
          acciones={
            <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {AGGS.map(([a, label]) => (
                <button
                  key={a}
                  onClick={() => cambiarAgg(a)}
                  className={
                    "px-1.5 py-0.5 text-[9px] font-semibold " +
                    (agg === a
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {chart.length === 0 ? (
            <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin datos.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(k) => bucketLabel(String(k), agg)}
                  tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(v) => fmtCant(v as number)}
                  tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--t-panel)",
                    border: "1px solid var(--t-border)",
                    fontSize: 11,
                  }}
                  labelFormatter={(k) => bucketLabel(String(k), agg)}
                  formatter={(v) => [fmtCantFull(v as number), "Nominal"]}
                />
                <Bar
                  dataKey="cantidad"
                  maxBarSize={72}
                  onClick={(d) => {
                    // recharts tipa el payload del click como BarRectangleItem; el
                    // dato original viaja igual en el objeto (mismo cast que en
                    // cobros-futuros-view).
                    const k = (d as { bucket?: string })?.bucket ?? null;
                    setSelBucket((prev) => (prev === k ? null : k));
                  }}
                  cursor="pointer"
                >
                  {chart.map((d) => (
                    <Cell
                      key={d.bucket}
                      fill={
                        selBucket && selBucket !== d.bucket
                          ? "var(--t-border-2)"
                          : "var(--t-accent)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* 4) reservado — el user lo define más adelante */}
        <Panel titulo="—" extra="reservado">
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">
            Panel libre. A definir qué va acá.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  titulo,
  extra,
  derecha,
  acciones,
  scroll = true,
  children,
}: {
  titulo: string;
  extra?: string;
  derecha?: string;
  acciones?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    // `bg-[var(--t-panel)]` NO es cosmético: en modo claro el fondo de página es
    // gris y los paneles son BLANCOS — ese contraste es lo único que delimita
    // dónde empieza y termina cada tabla. Sin el fondo, los cuatro paneles se
    // funden en una sola mancha (en oscuro no se notaba: bg #000 y panel #080808
    // son casi el mismo color).
    <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] shrink-0">
          {titulo}
        </span>
        {extra && (
          <span className="text-[9px] text-[var(--t-text-muted)] truncate">{extra}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {acciones}
          {derecha && <span className="text-[10px] font-mono">{derecha}</span>}
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${scroll ? "overflow-auto" : "p-1"}`}>{children}</div>
    </div>
  );
}

function Aviso({ texto, error = false }: { texto: string; error?: boolean }) {
  return (
    <p className={`p-3 text-[11px] ${error ? "text-[#ff7777]" : "text-[var(--t-text-dim)]"}`}>
      {texto}
    </p>
  );
}
