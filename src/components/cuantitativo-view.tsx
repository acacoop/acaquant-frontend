"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";
import { ModalAyuda } from "./cuantitativo-ayuda";
import { PerfilClienteModal } from "./perfil-cliente-modal";
import { fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

// Tab ANÁLISIS CUANTITATIVO (dentro de OPERADORES).
//
// NO es un tablero: son TRES LISTAS DE LLAMADAS. Cada fila es un nombre, un motivo
// en castellano y cuánta plata hay en juego — y las tres van ordenadas por plata,
// no por gravedad de la señal (un cliente que se muere y deja $2.000 al mes va
// abajo de todo).
//
// Reglas de esta pantalla, y las tres vienen de decisiones, no de gusto:
//
//  1. **Ningún puntaje del 1 al 100.** El motivo se muestra crudo ("suele operar
//     cada 4 días, lleva 19"). Un score esconde la razón, y la razón es lo que
//     hace saber qué decir por teléfono.
//  2. **Los cortes se editan acá y son de CADA USUARIO** (`usePersistedState`).
//     Si el 75% viniera de fábrica, el primero que no está de acuerdo deja de
//     abrir la pantalla; pudiéndolo mover, discute el número y no la herramienta.
//  3. **La franja de contexto está en las tres solapas.** "SE ESTÁN APAGANDO 5"
//     no significa nada si no sabés que 17 clientes hacen el 80% de la
//     facturación: si tres de esos cinco son del núcleo es una urgencia, si son
//     de la cola es ruido. Es la misma lección del panel de HABILIDADES del AV
//     AGENT — un contador sin su contexto es un verde que no significa nada.
//
// Y una que se ve rara la primera vez: **la misma cuenta puede estar en las tres
// listas**. No es repetición — es la misma historia desde tres ángulos, y es
// justo el cliente al que hay que llamar primero. Por eso los contadores NO se
// suman entre sí.

type CorteDef = { def: number; min: number; max: number; que: string };
type Lista<T> = { n: number; items: T[]; limite: number };

export type ItemConoce = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; segmento: string | null;
  arancel: number; aum: number | null; aum_hoy: number;
  roa_bps: number | null; roa_pesos_millon: number | null; roa_motivo: string | null;
  cupo: number | null; sow_pct: number | null;
  operacion_fav: string | null; operacion_fav_arancel: number | null;
  n_tipos: number;
};
export type RespConoce = {
  segmento: string | null;
  segmentos: { valor: string; label: string; n: number }[];
  desde?: string; hasta?: string; meses?: number; moneda?: string;
  piso_aum?: number; orden?: string;
  n: number; limite?: number; items: ItemConoce[];
  aviso?: string;
  contexto?: {
    n_clientes: number; roa_promedio: number | null; roa_mediana: number | null;
    roa_promedio_pesos: number | null; roa_mediana_pesos: number | null;
    n_con_roa: number; sow_mediana: number | null; n_con_cupo: number;
    aum_mediana: number | null; arancel_total: number; n_sin_arancel: number;
  };
  foto_aum?: { ultima: string | null; n_fotos: number };
  fuentes?: Record<string, string>;
};
type ItemPerdio = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null;
  aum_antes: number; aum_hoy: number; caida_pct: number;
  retiro: number | null;
};
type Resp = {
  mes: string; label: string; ini: string; fin: string; moneda: string;
  cortes: Record<string, number>;
  cortes_def: Record<string, CorteDef>;
  perdieron_aum: Lista<ItemPerdio>;
  foto_aum: {
    snapshot_hoy: string | null; snapshot_antes: string | null; fin_antes: string | null;
    libro_pct: number | null; aum_libro_antes: number; aum_libro_hoy: number;
  };
  avisos: string[];
};

type Solapa = "conoce" | "perdieron";

// Los cortes que la pantalla deja mover, por solapa. El default y el rango los
// manda el backend (`cortes_def`) — acá solo se dice cuál va en cada frase.
const CORTES_DE: Record<Solapa, string[]> = {
  conoce: ["piso_roa"],
  perdieron: ["caida_pct", "meses_atras", "piso_aum"],
};
// ⚠️ `piso_roa` y `piso_aum` son DOS cortes, no uno con dos nombres. En PERDIERON
// AuM el piso decide QUIÉN ENTRA a la lista (cuentas que tenían más de X); acá
// decide DESDE CUÁNDO el ROA significa algo. Compartir la clave haría que mover
// uno cambie la otra lista en silencio.
const DEF: Record<string, number> = {
  caida_pct: 75, meses_atras: 3, piso_aum: 10_000_000,
  piso_roa: 1_000_000,
};

const fmtFecha = (iso: string | null | undefined) =>
  !iso ? "—" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const arrQS = (k: string, vs: string[]) =>
  (vs ?? []).map((v) => `&${k}=${encodeURIComponent(v)}`).join("");

export type FiltrosMadre = {
  operador: string[]; nivel1: string[]; nivel2: string[]; nivel3: string[];
  nivel4: string[]; nivel5: string[]; referido: string[]; division: string[];
};

export function CuantitativoView(
  { moneda = "ARS", conmutador, ...f }:
  { moneda?: "ARS" | "USD"; conmutador?: React.ReactNode } & FiltrosMadre,
) {
  const [solapa, setSolapa] = usePersistedState<Solapa>("cuanti.solapa", "conoce");
  // El segmento NO es un filtro más: es el EJE de CONOCÉ A TU CLIENTE. Vacío, la
  // tabla no se dibuja — el ROA de un institucional y el de un retail no son
  // comparables, y mezclados la vista recomienda lo contrario de lo que hay que
  // hacer (medido: PJ MEDIANA rinde 58 bps y PJ GRANDE 28).
  const [segmento, setSegmento] = usePersistedState<string>("cuanti.segmento", "");
  const [ordenC, setOrdenC] = usePersistedState<string>("cuanti.orden", "aum");
  // Click en una fila → la ficha operativa del cliente. Vive en el shell y no en
  // cada tabla: así una sola pieza sabe abrirlo y las tres listas pueden usarlo.
  const [ficha, setFicha] = useState<string | null>(null);
  // La ayuda sale en MODAL, encima de todo: no le come alto a la tabla y no hace
  // falta cerrarla para seguir. Por eso NO se recuerda abierta — un overlay que
  // aparece solo cada vez que entrás a la vista se cierra sin leerse.
  const [ayuda, setAyuda] = useState(false);
  const [mes, setMes] = usePersistedState<string>("cuanti.mes", "");
  // Los cortes son DE CADA USUARIO: se guardan en la sesión, no en la base. Cada
  // uno explora sin moverle la lista al de al lado.
  const [cortes, setCortes] = usePersistedState<Record<string, number>>("cuanti.cortes", DEF);
  // Lo que se tipea no dispara un request por tecla: la url usa una copia con
  // retardo. Sin esto, escribir "10000000" son ocho consultas.
  const [cortesFirmes, setCortesFirmes] = useState<Record<string, number>>(cortes);
  useEffect(() => {
    const t = setTimeout(() => setCortesFirmes(cortes), 450);
    return () => clearTimeout(t);
  }, [cortes]);

  const qsMadre = arrQS("operador", f.operador) + arrQS("nivel_1", f.nivel1)
    + arrQS("nivel_2", f.nivel2) + arrQS("nivel_3", f.nivel3)
    + arrQS("nivel_4", f.nivel4) + arrQS("nivel_5", f.nivel5)
    + arrQS("referido", f.referido) + arrQS("division", f.division);
  const qsCortes = Object.entries(cortesFirmes)
    .filter(([, v]) => Number.isFinite(v))
    .map(([k, v]) => `&${k}=${v}`).join("");
  const url = `/api/operaciones/comercial/cuantitativo?moneda=${moneda}`
    + (mes ? `&mes=${mes}` : "") + qsMadre + qsCortes;

  // CONOCÉ A TU CLIENTE tiene su propio endpoint: es otra pregunta y otro grano
  // (una fila por cliente, no una lista de llamadas). Se pide SIEMPRE —aunque la
  // solapa activa sea la otra— porque su contador vive en la sub-nav, y un
  // contador que sólo se llena al entrar no sirve para decidir si entrar.
  const urlC = `/api/operaciones/comercial/conoce-cliente?moneda=${moneda}`
    + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "")
    + `&orden=${ordenC}&piso_aum=${cortesFirmes.piso_roa ?? DEF.piso_roa}` + qsMadre;
  const [resC, setResC] = useState<{ url: string; d: RespConoce | null; err: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchJson<RespConoce>(urlC);
        if (vivo) setResC({ url: urlC, d: r, err: null });
      } catch (e) {
        if (vivo) setResC({ url: urlC, d: null, err: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [urlC]);
  const dc = resC?.url === urlC ? resC.d : null;
  const errC = resC?.url === urlC ? resC.err : null;

  // La respuesta viaja con la url que la produjo → "cargando" se DERIVA.
  const [res, setRes] = useState<{ url: string; d: Resp | null; err: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchJson<Resp>(url);
        if (vivo) setRes({ url, d: r, err: null });
      } catch (e) {
        if (vivo) setRes({ url, d: null, err: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [url]);
  const fresco = res?.url === url ? res : null;
  const d = fresco?.d ?? null;
  const err = fresco?.err ?? null;
  const cargando = fresco === null;

  const modificados = useMemo(
    () => Object.keys(DEF).filter((k) => cortes[k] !== DEF[k]), [cortes]);

  const setCorte = (k: string, v: string) => {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    setCortes((c) => ({ ...c, [k]: Number.isFinite(n) ? n : DEF[k] }));
  };

  const MAINS: { k: Solapa; t: string; sub: string; n: number | null }[] = [
    { k: "conoce", t: "Conocé a tu cliente",
      sub: segmento ? `${segmento.toLowerCase()} · qué deja y qué le falta`
                    : "elegí un segmento",
      n: segmento ? (dc?.n ?? null) : null },
    { k: "perdieron", t: "Perdieron AuM", sub: `cayeron más del ${cortes.caida_pct ?? 75}%`,
      n: d?.perdieron_aum.n ?? null },
  ];

  const exportar = () => {
    if (solapa === "conoce") {
      if (!dc?.items.length) return;
      void exportToXlsx({
        filename: `conoce-cliente-${(segmento || "sin-segmento").toLowerCase().replace(/\s+/g, "-")}-${timestampSuffix()}.xlsx`,
        sheets: [{
          name: "Conocé a tu cliente", rows: dc.items,
          title: `${segmento} · ${dc.moneda} · ${dc.desde} → ${dc.hasta}`,
          columns: [
            { header: "Cuenta", key: "id_cuenta", format: "text" as const, width: 12 },
            { header: "Cliente", key: "denominacion", format: "text" as const, width: 34 },
            { header: "Operador", key: "operador_nombre", format: "text" as const, width: 22 },
            { header: "Arancel 12m", key: "arancel", format: "currency" as const, width: 18 },
            { header: "Tiene (prom. 12m)", key: "aum", format: "currency" as const, width: 20 },
            { header: "ROA ($ por millón)", key: "roa_pesos_millon", format: "currency" as const, width: 18 },
            { header: "ROA (bps)", key: "roa_bps", format: "number" as const },
            { header: "Cupo", key: "cupo", format: "currency" as const, width: 20 },
            { header: "SOW %", key: "sow_pct", format: "percent" as const },
            { header: "Operación favorita", key: "operacion_fav", format: "text" as const, width: 22 },
          ],
        }],
      });
      return;
    }
    if (!d) return;
    void exportToXlsx({
      filename: `cuantitativo-${solapa}-${d.mes}-${timestampSuffix()}.xlsx`,
      sheets: [{
        name: "Perdieron AuM", rows: d.perdieron_aum.items,
        title: `${d.label} · ${d.moneda} · cortes: ${Object.entries(d.cortes)
          .map(([k, v]) => `${k}=${v}`).join(" · ")}`,
        columns: [
          { header: "Cuenta", key: "id_cuenta", format: "text" as const, width: 12 },
          { header: "Cliente", key: "denominacion", format: "text" as const, width: 34 },
          { header: "Operador", key: "operador_nombre", format: "text" as const, width: 22 },
          { header: "Tenía", key: "aum_antes", format: "currency" as const, width: 20 },
          { header: "Tiene", key: "aum_hoy", format: "currency" as const, width: 20 },
          { header: "Caída %", key: "caida_pct", format: "percent" as const },
          { header: "Retiró", key: "retiro", format: "currency" as const, width: 20 },
        ],
      }],
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Sub-nav estilo AV AGENT: nombre, contador y bajada ────────────── */}
      <div className="flex items-stretch gap-0 border-b border-[var(--t-border-2)] px-1 shrink-0 overflow-x-auto">
        {conmutador && <div className="flex items-center pr-3 pl-1">{conmutador}</div>}
        {MAINS.map((m) => (
          <button key={m.k} onClick={() => setSolapa(m.k)}
            className={"px-5 pt-3 pb-2 text-left whitespace-nowrap border-b-[3px] " +
              (solapa === m.k ? "border-[var(--t-accent)]" : "border-transparent")}>
            <div className={"text-[13px] font-bold uppercase tracking-[.13em] " +
              (solapa === m.k ? "text-[var(--t-accent)]" : "text-[var(--t-text-muted)]")}>
              {m.t}
              <span className="ml-1.5 font-normal opacity-60">
                {m.n == null ? "·" : m.n}
              </span>
            </div>
            <div className={"text-[10px] " +
              (solapa === m.k ? "text-[var(--t-text-dim)]" : "text-[var(--t-text-muted)]")}>
              {m.sub}
            </div>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-2">
          {solapa === "perdieron" && (
            <label className="inline-flex items-center gap-1.5 border border-[var(--t-border-2)] px-2 py-1">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Mes</span>
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                className="bg-transparent text-[11px] tabular-nums text-[var(--t-text)] outline-none" />
            </label>
          )}
          <button onClick={exportar} disabled={solapa === "conoce" ? !dc?.items.length : !d}
            className="text-[10px] px-2 py-1 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40">
            ↓ XLSX
          </button>
        </div>
      </div>

      {/* ── UNA franja: la frase explica Y configura. Nunca envuelve. ──────── */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[var(--t-border)] shrink-0
                      overflow-x-auto whitespace-nowrap text-[12px] text-[var(--t-text-dim)]">
        {solapa === "conoce" && (
          <>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                Segmento
              </span>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
                className={"text-[12px] font-semibold px-1.5 py-0.5 border bg-[var(--t-surface)] outline-none "
                  + (segmento ? "border-[var(--t-border-2)] text-[var(--t-text)]"
                              : "border-[var(--t-accent)] text-[var(--t-accent)]")}>
                <option value="">elegí uno…</option>
                {(dc?.segmentos ?? []).map((sg) => (
                  <option key={sg.valor} value={sg.valor}>{sg.label} ({sg.n})</option>
                ))}
              </select>
            </span>
            <span className="opacity-30">·</span>
          </>
        )}
        {(solapa === "conoce" && !segmento ? [] : CORTES_DE[solapa]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 shrink-0"
            title={d?.cortes_def?.[k]?.que}>
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              {ETIQUETA[k]}
            </span>
            <input inputMode="numeric" value={fmtCorte(k, cortes[k] ?? DEF[k])}
              onChange={(e) => setCorte(k, e.target.value)}
              aria-label={d?.cortes_def?.[k]?.que ?? k}
              className={"tabular-nums text-right text-[12px] font-semibold px-1.5 py-0.5 border bg-[var(--t-surface)] outline-none " +
                (k.startsWith("piso") ? "w-[104px] " : "w-[54px] ") +
                (cortes[k] !== DEF[k]
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border-2)] text-[var(--t-text)]")} />
            <span className="text-[10px] text-[var(--t-text-muted)]">{UNIDAD[k]}</span>
          </span>
        ))}
        {/* Pegado al corte que lo cambia: subir el piso saca cuentas del cálculo
            y el número se mueve en el acto. Separados, nadie ata una cosa con la otra. */}
        {solapa === "conoce" && segmento && dc?.contexto && (
          <span className="inline-flex items-baseline gap-1.5 shrink-0"
            title={`Promedio simple de los ${dc.contexto.n_con_roa} clientes con ROA medible`
              + (dc.contexto.roa_promedio != null ? ` (${dc.contexto.roa_promedio} bps)` : "")
              + "."
              + (dc.contexto.roa_mediana_pesos != null
                 ? ` El del medio deja $${dc.contexto.roa_mediana_pesos.toLocaleString("es-AR")} — si están lejos uno del otro, hay pocas cuentas tirando del promedio.`
                 : "")}>
            <span className="opacity-30">·</span>
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              ROA promedio
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-[var(--t-accent)]">
              {dc.contexto.roa_promedio_pesos != null
                ? fmtMoneyFull(dc.contexto.roa_promedio_pesos) : "—"}
            </span>
            <span className="text-[9px] text-[var(--t-text-muted)]">por cada millón</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={() => setAyuda(true)} aria-haspopup="dialog"
            className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)]
                       text-[var(--t-text-muted)] hover:text-[var(--t-accent)]
                       hover:border-[var(--t-accent)]">
            ¿Cómo se interpretan los datos?
          </button>
          {(solapa === "conoce" ? resC === null : cargando)
            && <span className="text-[9px] text-[var(--t-text-muted)]">cargando…</span>}
          {(solapa === "conoce" ? errC : err)
            && <span className="text-[9px] text-[var(--t-neg)]">{solapa === "conoce" ? errC : err}</span>}
          {modificados.length > 0 && (
            <button onClick={() => setCortes(DEF)}
              className="text-[10px] px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)]">
              modificado · volver a los de la mesa
            </button>
          )}
        </span>
      </div>

      {/* ── Cuerpo ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {solapa === "conoce"
          ? <Conoce d={dc} segmento={segmento} orden={ordenC} setOrden={setOrdenC}
              abrir={setFicha} />
          : <>
              <Perdieron d={d} abrir={setFicha} />
              {!d && !err && <div className="px-4 py-6 text-[11px] text-[var(--t-text-muted)]">cargando…</div>}
            </>}
      </div>

      {ayuda && (
        <ModalAyuda clave={solapa} cortes={cortes} onCerrar={() => setAyuda(false)} />
      )}

      {ficha && (
        <PerfilClienteModal key={ficha} idCuenta={ficha} moneda={moneda}
          hasta={d?.fin} onCerrar={() => setFicha(null)} />
      )}

      {/* ── Pie: lo que las listas NO pueden saber ─────────────────────────── */}
      {solapa === "perdieron" && d && (
        <div className="px-4 py-1.5 border-t border-[var(--t-border-2)] bg-[var(--t-surface)]
                        text-[9px] text-[var(--t-text-muted)] shrink-0 space-y-0.5">
          {d.avisos.map((a) => <div key={a}>⚠ {a}</div>)}
        </div>
      )}
    </div>
  );
}

const ETIQUETA: Record<string, string> = {
  pct_arancel: "deja mucho =", meses_seguido: "viene seguido =",
  multiplo: "avisar a las", min_dias_op: "mínimo",
  caida_pct: "cayó más de", meses_atras: "contra hace", piso_aum: "piso",
  piso_roa: "sin ROA debajo de",
};
const UNIDAD: Record<string, string> = {
  pct_arancel: "% del arancel", meses_seguido: "de los últimos 12 meses",
  multiplo: "× su ritmo", min_dias_op: "días operados en 12 meses",
  caida_pct: "%", meses_atras: "meses", piso_aum: "$ de AuM",
  piso_roa: "$ de AuM promedio",
};
const fmtCorte = (k: string, v: number) =>
  k.startsWith("piso") ? Math.round(v).toLocaleString("es-AR") : String(v);

const TH = "px-3 py-2 text-[9px] uppercase tracking-wide font-normal text-[var(--t-text-muted)] whitespace-nowrap border-b border-[var(--t-border-2)] bg-[var(--t-panel)] sticky top-0";
const TD = "px-3 py-1.5 text-[12.5px] tabular-nums whitespace-nowrap border-b border-[var(--t-border)]";
const TDN = "px-3 py-1.5 text-[13px] border-b border-[var(--t-border)]";

function Vacio({ que }: { que: string }) {
  return <div className="px-4 py-6 text-[11px] text-[var(--t-text-muted)]">{que}</div>;
}
function Pie({ l }: { l: Lista<unknown> }) {
  return (
    <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)]">
      {l.items.length === l.n
        ? `${l.n} cuentas`
        : `mostrando ${l.items.length} de ${l.n} (tope ${l.limite}) — el contador se cuenta sobre todas`}
      {" · ordenado por plata en juego, no por gravedad de la señal · click en una fila = la ficha del cliente"}
    </div>
  );
}

// ── CONOCÉ A TU CLIENTE ─────────────────────────────────────────────────────
// Una fila por cliente del segmento. La regla que ordena la tabla entera:
// **toda columna derivada se puede verificar con las dos de al lado.**
//
//     ROA = ARANCEL 12M ÷ TIENE          SOW = TIENE ÷ CUPO
//
// Por eso TIENE es el AuM PROMEDIO de la ventana y no la foto de hoy: si
// mostrara la foto y el ROA dividiera por el promedio, el primero que saca la
// calculadora deja de creerle a la pantalla, y con razón.
function Conoce(
  { d, segmento, orden, setOrden, abrir }:
  { d: RespConoce | null; segmento: string; orden: string;
    setOrden: (v: string) => void; abrir: (id: string) => void },
) {
  if (!segmento) {
    return (
      <div className="px-4 py-10 text-center text-[12px] text-[var(--t-text-muted)]">
        <div className="text-[13px] text-[var(--t-text-dim)] mb-1.5">
          Elegí un segmento arriba.
        </div>
        {/* No es un paso de más: es la única forma de que el ROA signifique algo. */}
        Un institucional y un cliente de retail rinden distinto por estructura, no
        por estar desaprovechados. Mezclados en una sola lista, los institucionales
        caen todos juntos al fondo y la tabla marca como oportunidad lo que no lo es.
      </div>
    );
  }
  if (!d) return <div className="px-4 py-6 text-[11px] text-[var(--t-text-muted)]">cargando…</div>;
  if (!d.items.length) return <Vacio que={d.aviso || "no hay clientes en este segmento."} />;

  const col = (k: string, t: string, ayuda: string, der = true) => (
    <th className={TH + (der ? " text-right" : " text-left") + " cursor-pointer select-none"}
      title={`${ayuda}\n(click para ordenar)`} onClick={() => setOrden(k)}>
      {t}{orden === k && <span className="text-[var(--t-accent)] ml-0.5">▾</span>}
    </th>
  );

  return (
    <>
      <table className="w-full">
        <thead><tr>
          <th className={TH + " text-left"}>Cuenta</th>
          <th className={TH + " text-left cursor-pointer select-none"}
            onClick={() => setOrden("denominacion")}>
            Cliente{orden === "denominacion" && <span className="text-[var(--t-accent)] ml-0.5">▾</span>}
          </th>
          <th className={TH + " text-left"}>Operador</th>
          {col("arancel", `Arancel ${d.meses ?? 12}m`,
            `Lo que la cuenta dejó de arancel en los últimos ${d.meses ?? 12} meses.`)}
          {col("aum", `Tiene (prom. ${d.meses ?? 12}m)`,
            `El AuM PROMEDIO de los últimos ${d.meses ?? 12} meses (una foto de tenencia por fin de mes), NO la foto de hoy. Es el divisor del ROA, así que el ROA se verifica dividiendo estas dos columnas.`)}
          {col("roa", `ROA (${d.moneda === "USD" ? "US$" : "$"} por millón)`,
            `De cada millón que el cliente tiene guardado, cuántos ${d.moneda === "USD" ? "dólares" : "pesos"} nos deja por año. Es el arancel de 12 meses dividido el promedio de lo que tuvo, llevado a esa escala. Debajo del piso no se calcula: dividir por casi nada da un número que no significa nada.`)}
          {col("cupo", "Cupo", "Cupo transaccional del custodio. Carga manual por Excel, sin fecha de carga registrada.")}
          {col("sow", "SOW", "Tiene ÷ Cupo. Qué parte de la plata que el custodio le reconoce está acá.")}
          <th className={TH + " text-left"}>Operación favorita</th>
        </tr></thead>
        <tbody>
          {d.items.map((i) => (
            <tr key={i.id_cuenta} onClick={() => abrir(i.id_cuenta)}
              title="Ver la ficha operativa del cliente"
              className={"cursor-pointer hover:bg-[var(--t-surface)] " +
                // Se tinta la que tiene plata y NO deja un peso. Medido en el libro:
                // 18 cuentas concentran el 96% de la plata quieta, y hoy no aparecen
                // en ninguna lista porque justamente no operan.
                (i.arancel <= 0 && (i.aum ?? 0) > 0 ? "bg-[var(--t-tint-red)]" : "")}>
              <td className={TD + " text-left text-[var(--t-text-muted)]"}>[{i.id_cuenta}]</td>
              <td className={TDN}>{i.denominacion}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.operador_nombre || "—"}</td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.arancel)}</td>
              <td className={TD + " text-right"}
                title={`hoy ${fmtMoneyFull(i.aum_hoy)}`}>
                {i.aum != null ? fmtMoneyFull(i.aum) : "—"}
              </td>
              <td className={TD + " text-right " +
                (i.roa_bps != null && d.contexto?.roa_mediana != null
                  && i.roa_bps < d.contexto.roa_mediana ? "text-[var(--t-neg)]" : "")}
                title={i.roa_motivo ?? (i.roa_bps != null ? `${i.roa_bps} bps` : "")}>
                {i.roa_pesos_millon != null ? fmtMoneyFull(i.roa_pesos_millon) : "—"}
              </td>
              <td className={TD + " text-right text-[var(--t-text-dim)]"}>
                {i.cupo != null ? fmtMoneyFull(i.cupo) : "—"}
              </td>
              <td className={TD + " text-right"}>
                {i.sow_pct != null ? `${i.sow_pct}%` : "—"}
              </td>
              <td className={TDN + " text-[12px] text-[var(--t-text-dim)]"}
                title={i.operacion_fav_arancel != null
                  ? `${fmtMoneyFull(i.operacion_fav_arancel)} de arancel · usa ${i.n_tipos} tipos`
                  : "no dejó arancel en la ventana"}>
                {i.operacion_fav || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)]">
        {d.items.length} de {d.n} · ventana {d.desde} → {d.hasta} ·
        {" "}AuM = promedio de {d.foto_aum?.n_fotos ?? 0} fotos, la última del{" "}
        {fmtFecha(d.foto_aum?.ultima)} · el ROA es lo que deja por año por cada
        millón guardado, y en rojo está por debajo del cliente del medio del segmento.
      </div>
    </>
  );
}


// ── PERDIERON AuM ───────────────────────────────────────────────────────────
function Perdieron({ d, abrir }: { d: Resp | null; abrir: (id: string) => void }) {
  if (!d) return null;
  const f = d.foto_aum;
  if (!d.perdieron_aum.items.length) {
    return <Vacio que="ninguna cuenta por encima del piso cayó tanto en este período." />;
  }
  return (
    <>
      {/* El único contexto que sirve acá, pegado a la tabla: sin saber cuánto bajó
          el libro entero no se puede decir si una caída es del cliente o del
          mercado. Es un HECHO, no un veredicto por fila. */}
      {f.libro_pct != null && (
        <div className="px-4 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]
                        text-[11px] text-[var(--t-text-muted)]">
          En el mismo período el AuM de TODO el libro{" "}
          {f.libro_pct < 0 ? "bajó" : "subió"}{" "}
          <span className="tabular-nums font-semibold text-[var(--t-text-dim)]">
            {Math.abs(f.libro_pct)}%
          </span>
          {" — comparalo contra la caída de cada fila."}
        </div>
      )}
      <table className="w-full">
        <thead><tr>
          <th className={TH + " text-left"}>Cuenta</th>
          <th className={TH + " text-left"}>Cliente</th>
          <th className={TH + " text-left"}>Operador</th>
          <th className={TH + " text-left"}>Nivel 3</th>
          <th className={TH + " text-right"}>Tenía ({fmtFecha(f.snapshot_antes)})</th>
          <th className={TH + " text-right"}>Tiene ({fmtFecha(f.snapshot_hoy)})</th>
          <th className={TH + " text-right"}>Caída</th>
          <th className={TH + " text-right"}>Retiró</th>
        </tr></thead>
        <tbody>
          {d.perdieron_aum.items.map((i) => (
            // Se tinta por un HECHO (retiró plata), no por un rótulo: acá había
            // una columna "QUÉ PASÓ" que etiquetaba cada fila y se sacó — eran
            // inferencias con el mismo aspecto que los datos de al lado.
            <tr key={i.id_cuenta} onClick={() => abrir(i.id_cuenta)}
              title="Ver la ficha operativa del cliente"
              className={"cursor-pointer hover:bg-[var(--t-surface)] " +
                (i.retiro ? "bg-[var(--t-tint-red)]" : "")}>
              <td className={TD + " text-left text-[var(--t-text-muted)]"}>[{i.id_cuenta}]</td>
              <td className={TDN}>{i.denominacion}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.operador_nombre || "—"}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.nivel_3 || "—"}</td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.aum_antes)}</td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.aum_hoy)}</td>
              <td className={TD + " text-right text-[var(--t-neg)]"}>−{i.caida_pct}%</td>
              <td className={TD + " text-right " +
                (i.retiro ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]")}>
                {i.retiro ? fmtMoneyFull(i.retiro) : "nada"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pie l={d.perdieron_aum} />
    </>
  );
}

