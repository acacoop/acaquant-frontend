"use client";

// MANAGER → ACA (módulo `manager`, admin). Gestión de la vista /aca.
//
// Dos cosas viven acá y no en la vista, a propósito:
//
//   1. HISTÓRICO — la planilla mensual de rendimientos. Se carga el MENSUAL de
//      cada serie y el ACUMULADO lo calcula el backend encadenando
//      (1 + acum_anterior) × (1 + mensual) − 1. La celda acumulada no se puede
//      escribir: es un resultado, y dejarlo editable permitiría que contradiga
//      a sus propios insumos.
//   2. CONFIGURACIÓN — la regla de moneda que parte Total Dolarizado / Total
//      Pesos, qué emisores y clases muestran siempre las métricas (aunque den
//      cero) y el catálogo de series. Es lo que hace que la vista sea "un Excel
//      con las fórmulas puestas" en vez de tener las categorías hardcodeadas.
//
// ESCRIBIR acá lo gobierna la misma allowlist que escribe en la vista (Mesa de
// Dinero), server-side: la configuración mueve números del informe, así que no
// puede ser un permiso más flojo que cargarlo.
//
// Consume /api/manager/aca/* y /api/aca/historico. Todo cambio queda en aca.audit.

import { useCallback, useEffect, useState } from "react";

import { fetchJson, getJSON } from "@/lib/fetch-json";

const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 " +
  "text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";
const BTN =
  "px-3 py-1 text-[10px] font-semibold bg-[var(--t-accent)] text-[var(--t-on-accent)] disabled:opacity-40";

type Serie = {
  codigo: string; nombre: string; grupo: string; fuente: string; escala: number;
  graficos: string[]; color: string; orden: number; activo: boolean;
};
type Catalogos = {
  moneda_reglas: { scope: string; clave: string; moneda: string }[];
  emisores: { bloque: string; emisor: string; orden: number }[];
  clases: { cartera: string; clase: string; orden: number }[];
  series: Serie[];
  bloques_emisor: { bloque: string; label: string }[];
  carteras: { cartera: string; label: string }[];
  carteras_por_clase: string[];
  graficos: string[];
  clases_conocidas: string[];
  emisores_conocidos: string[];
};
type CeldaHist = {
  periodo: string; mensual: number | null; acumulado: number | null;
  origen: string | null; monto: number | null; ingreso_retiro: number | null;
};
type Historico = {
  periodos: string[];
  series: { codigo: string; nombre: string; grupo: string; fuente: string }[];
  valores: Record<string, Record<string, CeldaHist>>;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtPeriodo = (p: string) => {
  const [y, m] = p.split("-");
  return `${MESES[Number(m) - 1] ?? m}-${y.slice(2)}`;
};
const fmtPct = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : (n * 100).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%";

/** El usuario tipea PORCENTAJE (2,45) y el backend guarda FRACCIÓN (0,0245).
 *  La conversión vive acá y en un solo lugar: pedirle a alguien que cargue
 *  0,0245 en una planilla de rendimientos es pedir un error de tipeo. */
const pctAFraccion = (s: string): number | null => {
  const t = (s ?? "").trim().replace(/\s|%/g, "").replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v / 100 : null;
};
const fraccionAPct = (n: number | null | undefined): string =>
  n == null ? "" : String(Number((n * 100).toFixed(6))).replace(".", ",");

function Card({ titulo, detalle, children }: {
  titulo: string; detalle?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{titulo}</span>
        {detalle && <div className="text-[9px] text-[var(--t-text-muted)] mt-0.5">{detalle}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

export function TabAca() {
  const [sub, setSub] = useState<"historico" | "config">("historico");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 flex gap-1 px-3 py-2 border-b border-[var(--t-border)]">
        {([["historico", "HISTÓRICO"], ["config", "CONFIGURACIÓN"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
                  className={`px-3 py-1 text-[11px] border ${
                    sub === id
                      ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                      : "border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {sub === "historico" ? <PanelHistorico /> : <PanelConfig />}
      </div>
    </div>
  );
}

// ── HISTÓRICO ──────────────────────────────────────────────────────────────
function PanelHistorico() {
  const [hist, setHist] = useState<Historico | null>(null);
  const [nuevoPeriodo, setNuevoPeriodo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getJSON<Historico>("/api/aca/historico").then((d) => setHist(d)).catch(() => setHist(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!hist) return <div className="text-[11px] text-[var(--t-text-muted)]">Cargando histórico…</div>;

  // Un período nuevo se "crea" cargando la primera celda; para que la fila
  // exista antes de tener datos, se agrega al eje local.
  const periodos = nuevoPeriodo && !hist.periodos.includes(nuevoPeriodo)
    ? [...hist.periodos, nuevoPeriodo].sort()
    : hist.periodos;

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-[var(--t-text-muted)]">Agregar mes:</span>
        <input type="month" value={nuevoPeriodo} onChange={(e) => setNuevoPeriodo(e.target.value)}
               className={INPUT} />
        <span className="text-[9px] text-[var(--t-text-muted)] max-w-2xl">
          Se carga el rendimiento MENSUAL en % (2,45 = 2,45%). El ACUMULADO no se
          escribe: lo encadena el backend con (1 + acumulado anterior) × (1 + mensual) − 1.
          Un mes vacío no rompe la serie — arrastra el acumulado anterior.
        </span>
        {error && <span className="text-[10px] text-[var(--t-neg)]">{error}</span>}
      </div>

      <Card titulo="HISTÓRICO — rendimiento mensual por serie"
            detalle="Las celdas marcadas ·a se completan solas desde una serie macro. Lo que tipees SIEMPRE gana sobre el automático.">
        <div className="overflow-auto">
          <table className="text-[11px] min-w-max">
            <thead className="sticky top-0 z-10 bg-[var(--t-surface)]">
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
                <th className="text-left px-2 py-1 font-medium sticky left-0 bg-[var(--t-surface)]">Período</th>
                {hist.series.map((s) => (
                  <th key={s.codigo} colSpan={2}
                      className="text-center px-2 py-1 font-medium border-l border-[var(--t-border)]"
                      title={`fuente: ${s.fuente}`}>
                    {s.nombre}
                  </th>
                ))}
              </tr>
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
                <th className="sticky left-0 bg-[var(--t-surface)]" />
                {hist.series.map((s) => (
                  <>
                    <th key={s.codigo + "m"} className="text-right px-2 py-0.5 font-normal border-l border-[var(--t-border)]">
                      Mensual %
                    </th>
                    <th key={s.codigo + "a"} className="text-right px-2 py-0.5 font-normal">Acum.</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {periodos.map((p) => (
                <tr key={p} className="border-t border-[var(--t-border)]">
                  <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)]">
                    {fmtPeriodo(p)}
                  </td>
                  {hist.series.map((s) => (
                    <>
                      <td key={s.codigo + p + "m"} className="px-1 py-0.5 border-l border-[var(--t-border)]">
                        <CeldaMensual periodo={p} serie={s.codigo}
                                      celda={hist.valores[s.codigo]?.[p]}
                                      onGuardado={load} onError={setError} />
                      </td>
                      <td key={s.codigo + p + "a"} className="px-2 py-1 text-right text-[var(--t-text)]">
                        {fmtPct(hist.valores[s.codigo]?.[p]?.acumulado ?? null)}
                      </td>
                    </>
                  ))}
                </tr>
              ))}
              {periodos.length === 0 && (
                <tr><td colSpan={99} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  Sin períodos. Agregá un mes arriba.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CeldaMensual({ periodo, serie, celda, onGuardado, onError }: {
  periodo: string; serie: string; celda?: CeldaHist;
  onGuardado: () => void; onError: (m: string | null) => void;
}) {
  // El valor AUTO se muestra pero no se pre-carga en el input: si se copiara al
  // campo, el primer guardado lo convertiría en manual y la serie dejaría de
  // actualizarse sola sin que nadie lo haya pedido.
  const esAuto = celda?.origen === "auto";
  const [v, setV] = useState(esAuto ? "" : fraccionAPct(celda?.mensual));
  const [busy, setBusy] = useState(false);

  // Re-sincronizar con el servidor durante el render (patrón oficial de React
  // para ajustar estado ante props nuevas). Un useEffect acá encadenaría un
  // render extra por CADA celda de la planilla, que son cientos.
  const [ultimaDelServidor, setUltimaDelServidor] = useState(celda);
  if (ultimaDelServidor !== celda) {
    setUltimaDelServidor(celda);
    setV(celda?.origen === "auto" ? "" : fraccionAPct(celda?.mensual));
  }

  const guardar = async () => {
    const anterior = celda?.origen === "auto" ? "" : fraccionAPct(celda?.mensual);
    if (v === anterior) return;
    setBusy(true);
    onError(null);
    try {
      if (!v.trim()) {
        await fetchJson(
          `/api/aca/historico?periodo=${encodeURIComponent(periodo)}&serie=${encodeURIComponent(serie)}`,
          { method: "DELETE" });
      } else {
        await fetchJson("/api/aca/historico", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodo, serie, mensual: pctAFraccion(v),
            monto: celda?.monto ?? null, ingreso_retiro: celda?.ingreso_retiro ?? null,
          }),
        });
      }
      onGuardado();
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  return (
    <div className="relative">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        disabled={busy}
        placeholder={esAuto ? fraccionAPct(celda?.mensual) : ""}
        title={esAuto
          ? `Calculado automático (${fmtPct(celda?.mensual)}). Escribí un valor para fijarlo a mano.`
          : undefined}
        className={`w-20 text-right bg-transparent border border-transparent hover:border-[var(--t-border-2)] ` +
          `focus:border-[var(--t-accent)] focus:bg-[var(--t-surface)] focus:outline-none text-[11px] px-1 py-0.5 ` +
          (esAuto ? "text-[var(--t-text-muted)] placeholder:text-[var(--t-text-dim)]" : "text-[var(--t-text)]")}
      />
      {esAuto && <span className="absolute -right-1 top-0 text-[8px] text-[var(--t-text-muted)]">a</span>}
    </div>
  );
}

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────
function PanelConfig() {
  const [cat, setCat] = useState<Catalogos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getJSON<Catalogos>("/api/manager/aca/catalogos").then(setCat).catch(() => setCat(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const llamar = async (url: string, init: RequestInit) => {
    setError(null);
    try { await fetchJson(url, init); load(); }
    catch (e) { setError(String(e instanceof Error ? e.message : e)); }
  };

  if (!cat) return <div className="text-[11px] text-[var(--t-text-muted)]">Cargando catálogos…</div>;

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-[10px] text-[var(--t-neg)]">{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        <ReglaMoneda cat={cat} llamar={llamar} />
        <EmisoresDestacados cat={cat} llamar={llamar} />
        <ClasesDestacadas cat={cat} llamar={llamar} />
      </div>
      <SeriesConfig cat={cat} llamar={llamar} />
    </div>
  );
}

type Llamar = (url: string, init: RequestInit) => Promise<void>;

function ReglaMoneda({ cat, llamar }: { cat: Catalogos; llamar: Llamar }) {
  const [scope, setScope] = useState<"clase" | "cartera">("clase");
  const [clave, setClave] = useState("");
  const [moneda, setMoneda] = useState<"usd" | "ars">("usd");

  // Clases del catálogo de títulos que TODAVÍA no tienen regla: son las que van
  // a caer en "sin clasificar" en el informe. Mostrarlas es el punto — si hay
  // que buscarlas, nadie las busca.
  const conRegla = new Set(cat.moneda_reglas.filter((r) => r.scope === "clase")
    .map((r) => r.clave.toUpperCase()));
  const faltantes = cat.clases_conocidas.filter((c) => !conRegla.has(c.toUpperCase()));

  return (
    <Card titulo="REGLA DE MONEDA"
          detalle="Decide qué suma a TOTAL DOLARIZADO y qué a TOTAL PESOS. La regla por CLASE gana sobre la de CARTERA: así el FCI se parte por moneda sin dejar de ser su propia cartera.">
      <div className="p-3 flex flex-col gap-2">
        <div className="flex gap-1">
          <select value={scope} onChange={(e) => setScope(e.target.value as "clase" | "cartera")} className={INPUT}>
            <option value="clase">clase</option>
            <option value="cartera">cartera</option>
          </select>
          <input value={clave} onChange={(e) => setClave(e.target.value)}
                 list="aca-claves" placeholder={scope === "clase" ? "MM USD" : "HD"}
                 className={INPUT + " flex-1"} />
          <datalist id="aca-claves">
            {(scope === "clase" ? cat.clases_conocidas : cat.carteras.map((c) => c.cartera))
              .map((c) => <option key={c} value={c} />)}
          </datalist>
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "usd" | "ars")} className={INPUT}>
            <option value="usd">→ dolarizado</option>
            <option value="ars">→ pesos</option>
          </select>
          <button className={BTN} disabled={!clave.trim()}
                  onClick={() => { void llamar("/api/manager/aca/moneda-regla", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scope, clave, moneda }),
                  }); setClave(""); }}>
            +
          </button>
        </div>

        {faltantes.length > 0 && (
          <div className="text-[9px] text-[var(--t-accent)]">
            Sin regla (caen en «sin clasificar»): {faltantes.join(", ")}
          </div>
        )}

        <table className="w-full text-[11px]">
          <tbody>
            {cat.moneda_reglas.map((r) => (
              <tr key={r.scope + r.clave} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-1 text-[9px] uppercase text-[var(--t-text-muted)] w-16">{r.scope}</td>
                <td className="px-2 py-1 text-[var(--t-text)]">{r.clave}</td>
                <td className="px-2 py-1 text-[var(--t-text-dim)]">
                  {r.moneda === "usd" ? "dolarizado" : "pesos"}
                </td>
                <td className="text-right pr-2">
                  <button className="text-[10px] text-[var(--t-neg)] hover:underline"
                          onClick={() => void llamar(
                            `/api/manager/aca/moneda-regla?scope=${encodeURIComponent(r.scope)}&clave=${encodeURIComponent(r.clave)}`,
                            { method: "DELETE" })}>
                    quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EmisoresDestacados({ cat, llamar }: { cat: Catalogos; llamar: Llamar }) {
  const [bloque, setBloque] = useState(cat.bloques_emisor[0]?.bloque ?? "hd");
  const [emisor, setEmisor] = useState("");
  return (
    <Card titulo="EMISORES DE LAS MÉTRICAS"
          detalle="Los que aparecen SIEMPRE en Métricas Generales, aunque el mes cierre en cero (que YPF valga 0 es información). Lo que no está en la lista igual se muestra, marcado — el catálogo agrega filas, nunca esconde plata. Excepción: CRÉDITOS PRIVADOS es una selección curada y muestra SOLO esta lista.">
      <div className="p-3 flex flex-col gap-2">
        <div className="flex gap-1">
          <select value={bloque} onChange={(e) => setBloque(e.target.value)} className={INPUT}>
            {cat.bloques_emisor.map((b) => <option key={b.bloque} value={b.bloque}>{b.label}</option>)}
          </select>
          <input value={emisor} onChange={(e) => setEmisor(e.target.value)} list="aca-emisores"
                 placeholder="TESORO" className={INPUT + " flex-1"} />
          <datalist id="aca-emisores">
            {cat.emisores_conocidos.map((e) => <option key={e} value={e} />)}
          </datalist>
          <button className={BTN} disabled={!emisor.trim()}
                  onClick={() => { void llamar("/api/manager/aca/emisor", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ bloque, emisor, orden: cat.emisores.filter((x) => x.bloque === bloque).length + 1 }),
                  }); setEmisor(""); }}>
            +
          </button>
        </div>
        <table className="w-full text-[11px]">
          <tbody>
            {cat.emisores.map((e) => (
              <tr key={e.bloque + e.emisor} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-1 text-[9px] uppercase text-[var(--t-text-muted)] w-16">{e.bloque}</td>
                <td className="px-2 py-1 text-[var(--t-text)]">{e.emisor}</td>
                <td className="text-right pr-2">
                  <button className="text-[10px] text-[var(--t-neg)] hover:underline"
                          onClick={() => void llamar(
                            `/api/manager/aca/emisor?bloque=${encodeURIComponent(e.bloque)}&emisor=${encodeURIComponent(e.emisor)}`,
                            { method: "DELETE" })}>
                    quitar
                  </button>
                </td>
              </tr>
            ))}
            {cat.emisores.length === 0 && (
              <tr><td colSpan={3} className="px-2 py-2 text-[10px] text-[var(--t-text-muted)]">
                Sin emisores. Las métricas van a mostrar solo lo que aparezca en el período.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ClasesDestacadas({ cat, llamar }: { cat: Catalogos; llamar: Llamar }) {
  const [cartera, setCartera] = useState(cat.carteras_por_clase[0] ?? "FCI");
  const [clase, setClase] = useState("");
  return (
    <Card titulo="CLASES DE ACTIVO DE LAS MÉTRICAS"
          detalle="Los renglones fijos de los bloques CARTERA FCI y CARTERA ARS de Métricas Generales.">
      <div className="p-3 flex flex-col gap-2">
        <div className="flex gap-1">
          <select value={cartera} onChange={(e) => setCartera(e.target.value)} className={INPUT}>
            {cat.carteras_por_clase.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={clase} onChange={(e) => setClase(e.target.value)} list="aca-claves-todas"
                 placeholder="MM USD" className={INPUT + " flex-1"} />
          <datalist id="aca-claves-todas">
            {cat.clases_conocidas.map((c) => <option key={c} value={c} />)}
          </datalist>
          <button className={BTN} disabled={!clase.trim()}
                  onClick={() => { void llamar("/api/manager/aca/clase", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cartera, clase, orden: cat.clases.filter((x) => x.cartera === cartera).length + 1 }),
                  }); setClase(""); }}>
            +
          </button>
        </div>
        <table className="w-full text-[11px]">
          <tbody>
            {cat.clases.map((c) => (
              <tr key={c.cartera + c.clase} className="border-t border-[var(--t-border)]">
                <td className="px-2 py-1 text-[9px] uppercase text-[var(--t-text-muted)] w-14">{c.cartera}</td>
                <td className="px-2 py-1 text-[var(--t-text)]">{c.clase}</td>
                <td className="text-right pr-2">
                  <button className="text-[10px] text-[var(--t-neg)] hover:underline"
                          onClick={() => void llamar(
                            `/api/manager/aca/clase?cartera=${encodeURIComponent(c.cartera)}&clase=${encodeURIComponent(c.clase)}`,
                            { method: "DELETE" })}>
                    quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SeriesConfig({ cat, llamar }: { cat: Catalogos; llamar: Llamar }) {
  const vacia: Serie = {
    codigo: "", nombre: "", grupo: "cartera", fuente: "manual", escala: 100,
    graficos: [], color: "", orden: (cat.series.at(-1)?.orden ?? 0) + 1, activo: true,
  };
  const [edit, setEdit] = useState<Serie | null>(null);
  const s = edit ?? vacia;
  const set = (p: Partial<Serie>) => setEdit({ ...s, ...p });

  return (
    <Card titulo="SERIES DEL HISTÓRICO"
          detalle="Cada serie es una columna de la planilla histórica y, si se le tilda un gráfico, una línea de «Detalle de las carteras vs benchmarks». La fuente `macro_var:<SERIE>` calcula la variación mes contra mes de una serie macro (es un cociente: no depende de la unidad). `macro_pct:<SERIE>` toma el valor del mes como rendimiento y SÍ depende de la unidad — medila antes con `python -m scripts.diag_aca_benchmarks`.">
      <div className="p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2 border border-[var(--t-border)] p-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Código</span>
            <input value={s.codigo} onChange={(e) => set({ codigo: e.target.value })}
                   className={INPUT + " w-28"} placeholder="total_ars" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Nombre</span>
            <input value={s.nombre} onChange={(e) => set({ nombre: e.target.value })}
                   className={INPUT + " w-52"} placeholder="Cartera Total ACA en ARS" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Grupo</span>
            <select value={s.grupo} onChange={(e) => set({ grupo: e.target.value })} className={INPUT}>
              <option value="cartera">cartera (línea sólida)</option>
              <option value="benchmark">benchmark (punteada)</option>
              <option value="externo">externo</option>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Fuente</span>
            <input value={s.fuente} onChange={(e) => set({ fuente: e.target.value })}
                   className={INPUT + " w-40"} placeholder="manual" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Escala</span>
            <input value={String(s.escala)} onChange={(e) => set({ escala: Number(e.target.value) || 100 })}
                   className={INPUT + " w-16"} />
          </label>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase text-[var(--t-text-muted)]">Gráficos</span>
            <div className="flex gap-2">
              {cat.graficos.map((g) => (
                <label key={g} className="flex items-center gap-1 text-[10px] text-[var(--t-text-dim)]">
                  <input type="checkbox" checked={s.graficos.includes(g)}
                         onChange={(e) => set({
                           graficos: e.target.checked
                             ? [...s.graficos, g]
                             : s.graficos.filter((x) => x !== g),
                         })} />
                  {g}
                </label>
              ))}
            </div>
          </div>
          <button className={BTN} disabled={!s.codigo.trim() || !s.nombre.trim()}
                  onClick={() => { void llamar("/api/manager/aca/serie", {
                    method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(s),
                  }); setEdit(null); }}>
            GUARDAR
          </button>
          {edit && (
            <button className="px-2 py-1 text-[10px] border border-[var(--t-border)] text-[var(--t-text-muted)]"
                    onClick={() => setEdit(null)}>
              cancelar
            </button>
          )}
        </div>

        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
              <th className="text-left px-2 py-1 font-medium">Código</th>
              <th className="text-left px-2 py-1 font-medium">Nombre</th>
              <th className="text-left px-2 py-1 font-medium">Grupo</th>
              <th className="text-left px-2 py-1 font-medium">Fuente</th>
              <th className="text-left px-2 py-1 font-medium">Gráficos</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {cat.series.map((x) => (
              <tr key={x.codigo}
                  className={`border-t border-[var(--t-border)] ${x.activo ? "" : "opacity-50 line-through"}`}>
                <td className="px-2 py-1 text-[var(--t-text)]">{x.codigo}</td>
                <td className="px-2 py-1 text-[var(--t-text-dim)]">{x.nombre}</td>
                <td className="px-2 py-1 text-[var(--t-text-dim)]">{x.grupo}</td>
                <td className="px-2 py-1 text-[var(--t-text-dim)]">{x.fuente}</td>
                <td className="px-2 py-1 text-[var(--t-text-dim)]">{x.graficos.join(", ") || "—"}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  <button className="text-[10px] text-[var(--t-accent)] hover:underline"
                          onClick={() => setEdit(x)}>editar</button>
                  {x.activo && (
                    <button className="ml-2 text-[10px] text-[var(--t-neg)] hover:underline"
                            title="Baja lógica: la serie deja de mostrarse pero sus valores históricos se conservan"
                            onClick={() => void llamar(
                              `/api/manager/aca/serie?codigo=${encodeURIComponent(x.codigo)}`,
                              { method: "DELETE" })}>
                      desactivar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
