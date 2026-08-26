"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";
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

type ItemImportan = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null;
  tipo: "nucleo" | "grande_irregular" | "habitual" | "ocasional";
  meses_operados: number; meses_ventana: number;
  arancel_mes: number; pct_arancel: number;
};
type ItemApaga = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null;
  ritmo_dias: number; dias_sin_operar: number; veces_su_ritmo: number;
  dias_operados_12m: number; ultima_op: string | null;
  deja_por_mes: number; retiro: number | null;
};
type ItemPerdio = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null;
  aum_antes: number; aum_hoy: number; caida_pct: number;
  retiro: number | null; que_paso: string; alerta: boolean;
};
type Resp = {
  mes: string; label: string; ini: string; fin: string; moneda: string;
  cortes: Record<string, number>;
  cortes_def: Record<string, CorteDef>;
  contexto: {
    n_clientes: number; n_operaron: number; arancel_total: number;
    mediana: number; promedio: number; top10_pct: number | null; cuantos_80: number;
  };
  cuadrante: { nucleo: number; grande_irregular: number; habitual: number; ocasional: number };
  quienes_importan: Lista<ItemImportan>;
  se_apagan: Lista<ItemApaga>;
  perdieron_aum: Lista<ItemPerdio>;
  foto_aum: {
    snapshot_hoy: string | null; snapshot_antes: string | null; fin_antes: string | null;
    libro_pct: number | null; aum_libro_antes: number; aum_libro_hoy: number;
  };
  avisos: string[];
};

type Solapa = "importan" | "apagan" | "perdieron";

// Los cortes que la pantalla deja mover, por solapa. El default y el rango los
// manda el backend (`cortes_def`) — acá solo se dice cuál va en cada frase.
const CORTES_DE: Record<Solapa, string[]> = {
  importan: ["pct_arancel", "meses_seguido"],
  apagan: ["multiplo", "min_dias_op"],
  perdieron: ["caida_pct", "meses_atras", "piso_aum"],
};
const DEF: Record<string, number> = {
  pct_arancel: 80, meses_seguido: 8, multiplo: 3, min_dias_op: 6,
  caida_pct: 75, meses_atras: 3, piso_aum: 10_000_000,
};

// Las cuatro celdas del cuadrante. `eje` es lo que se perdió al aplanarlo a una
// línea y por eso viaja en el tooltip de cada chip.
const CUADRANTE = [
  { k: "nucleo" as const, t: "Núcleo", color: "var(--t-pos)",
    eje: "Deja mucho y viene seguido", dice: "El negocio. No los podés perder." },
  { k: "grande_irregular" as const, t: "Grande irregular", color: "var(--t-neg)",
    eje: "Deja mucho pero viene salteado",
    dice: "Mucha plata, cero previsibilidad. Cuando se van, su silencio parece normal." },
  { k: "habitual" as const, t: "Habitual", color: "var(--t-accent)",
    eje: "Deja poco pero viene seguido", dice: "Fieles y chicos. ¿Se pueden hacer crecer?" },
  { k: "ocasional" as const, t: "Ocasional", color: "var(--t-text-muted)",
    eje: "Deja poco y viene salteado", dice: "La cola." },
];

const TIPO_LABEL: Record<string, string> = {
  nucleo: "Núcleo", grande_irregular: "Grande irregular",
  habitual: "Habitual", ocasional: "Ocasional",
};
const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-AR");
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
  const [solapa, setSolapa] = usePersistedState<Solapa>("cuanti.solapa", "importan");
  // Filtro por celda del cuadrante: los chips de arriba ACOTAN la tabla en vez de
  // ser una ilustración. Así el cuadrado se gana su lugar ocupando una línea.
  const [tipo, setTipo] = useState<string | null>(null);
  // Click en una fila → la ficha operativa del cliente. Vive en el shell y no en
  // cada tabla: así una sola pieza sabe abrirlo y las tres listas pueden usarlo.
  const [ficha, setFicha] = useState<string | null>(null);
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
    { k: "importan", t: "Quiénes importan", sub: `los que hacen el ${cortes.pct_arancel ?? 80}%`,
      n: d?.quienes_importan.n ?? null },
    { k: "apagan", t: "Se están apagando", sub: "rompieron su propio ritmo",
      n: d?.se_apagan.n ?? null },
    { k: "perdieron", t: "Perdieron AuM", sub: `cayeron más del ${cortes.caida_pct ?? 75}%`,
      n: d?.perdieron_aum.n ?? null },
  ];

  const EXPLICA: Record<Solapa, React.ReactNode> = {
    importan: <>Los que juntan el <B>{cortes.pct_arancel ?? 80}%</B> del arancel de {d?.label ?? "el mes"}. Dos preguntas los ordenan: <B>cuánto dejan</B> y <B>cada cuánto aparecen</B>.</>,
    apagan: <>Cada cliente tiene <B>su propio ritmo</B>. Entra el que lleva más del <B>{cortes.multiplo ?? 3}×</B> de lo que suele tardar. Quien opera poco no tiene ritmo medible y no entra.</>,
    perdieron: <>Tienen mucho menos que hace <B>{cortes.meses_atras ?? 3} meses</B>.{d?.foto_aum.libro_pct != null && <> En el mismo período el AuM del libro {d.foto_aum.libro_pct < 0 ? "bajó" : "subió"} <B>{Math.abs(d.foto_aum.libro_pct)}%</B>.</>}</>,
  };

  const exportar = () => {
    if (!d) return;
    const hoja = solapa === "importan"
      ? { name: "Quiénes importan", rows: d.quienes_importan.items, columns: [
          { header: "Cuenta", key: "id_cuenta", format: "text" as const, width: 12 },
          { header: "Cliente", key: "denominacion", format: "text" as const, width: 34 },
          { header: "Tipo", key: "tipo", format: "text" as const, width: 18 },
          { header: "Operador", key: "operador_nombre", format: "text" as const, width: 22 },
          { header: "Nivel 3", key: "nivel_3", format: "text" as const, width: 20 },
          { header: "Meses operados", key: "meses_operados", format: "integer" as const },
          { header: "Deja por mes", key: "arancel_mes", format: "currency" as const, width: 18 },
          { header: "% del arancel", key: "pct_arancel", format: "percent" as const },
        ] }
      : solapa === "apagan"
      ? { name: "Se están apagando", rows: d.se_apagan.items, columns: [
          { header: "Cuenta", key: "id_cuenta", format: "text" as const, width: 12 },
          { header: "Cliente", key: "denominacion", format: "text" as const, width: 34 },
          { header: "Operador", key: "operador_nombre", format: "text" as const, width: 22 },
          { header: "Suele operar cada (días)", key: "ritmo_dias", format: "number" as const, width: 16 },
          { header: "Lleva sin operar (días)", key: "dias_sin_operar", format: "integer" as const, width: 16 },
          { header: "Veces su ritmo", key: "veces_su_ritmo", format: "number" as const },
          { header: "Retiró", key: "retiro", format: "currency" as const, width: 18 },
          { header: "Deja por mes", key: "deja_por_mes", format: "currency" as const, width: 18 },
          { header: "Última op", key: "ultima_op", format: "date" as const, width: 12 },
        ] }
      : { name: "Perdieron AuM", rows: d.perdieron_aum.items, columns: [
          { header: "Cuenta", key: "id_cuenta", format: "text" as const, width: 12 },
          { header: "Cliente", key: "denominacion", format: "text" as const, width: 34 },
          { header: "Operador", key: "operador_nombre", format: "text" as const, width: 22 },
          { header: "Tenía", key: "aum_antes", format: "currency" as const, width: 20 },
          { header: "Tiene", key: "aum_hoy", format: "currency" as const, width: 20 },
          { header: "Caída %", key: "caida_pct", format: "percent" as const },
          { header: "Retiró", key: "retiro", format: "currency" as const, width: 20 },
          { header: "Qué pasó", key: "que_paso", format: "text" as const, width: 22 },
        ] };
    void exportToXlsx({
      filename: `cuantitativo-${solapa}-${d.mes}-${timestampSuffix()}.xlsx`,
      sheets: [{ ...hoja,
        title: `${d.label} · ${d.moneda} · cortes: ${Object.entries(d.cortes)
          .map(([k, v]) => `${k}=${v}`).join(" · ")}` }],
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
          <label className="inline-flex items-center gap-1.5 border border-[var(--t-border-2)] px-2 py-1">
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Mes</span>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="bg-transparent text-[11px] tabular-nums text-[var(--t-text)] outline-none" />
          </label>
          <button onClick={exportar} disabled={!d}
            className="text-[10px] px-2 py-1 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40">
            ↓ XLSX
          </button>
        </div>
      </div>

      {/* ── UNA franja: la frase explica Y configura. Nunca envuelve. ──────── */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[var(--t-border)] shrink-0
                      overflow-x-auto whitespace-nowrap text-[12px] text-[var(--t-text-dim)]">
        <span>{EXPLICA[solapa]}</span>
        <span className="opacity-30">·</span>
        {CORTES_DE[solapa].map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 shrink-0"
            title={d?.cortes_def?.[k]?.que}>
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              {ETIQUETA[k]}
            </span>
            <input inputMode="numeric" value={fmtCorte(k, cortes[k] ?? DEF[k])}
              onChange={(e) => setCorte(k, e.target.value)}
              aria-label={d?.cortes_def?.[k]?.que ?? k}
              className={"tabular-nums text-right text-[12px] font-semibold px-1.5 py-0.5 border bg-[var(--t-surface)] outline-none " +
                (k === "piso_aum" ? "w-[104px] " : "w-[54px] ") +
                (cortes[k] !== DEF[k]
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border-2)] text-[var(--t-text)]")} />
            <span className="text-[10px] text-[var(--t-text-muted)]">{UNIDAD[k]}</span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {cargando && <span className="text-[9px] text-[var(--t-text-muted)]">cargando…</span>}
          {err && <span className="text-[9px] text-[var(--t-neg)]">{err}</span>}
          {modificados.length > 0 && (
            <button onClick={() => setCortes(DEF)}
              className="text-[10px] px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)]">
              modificado · volver a los de la mesa
            </button>
          )}
        </span>
      </div>

      {/* ── El cuadrante, en UNA línea y como FILTRO ──────────────────────── */}
      {/* Los dos ejes (deja mucho/poco × viene seguido/salteado) siguen ahí: cada
          chip los lleva en su tooltip. Lo que se fue es el bloque de 200 px que
          empujaba la tabla fuera de la pantalla siendo sólo una ilustración. */}
      {solapa === "importan" && d && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[var(--t-border)]
                        shrink-0 overflow-x-auto whitespace-nowrap">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">
            Qué tan cliente es
          </span>
          {CUADRANTE.map((c) => {
            const on = tipo === c.k;
            return (
              <button key={c.k} onClick={() => setTipo(on ? null : c.k)}
                title={`${c.eje}. ${c.dice}`}
                className={"inline-flex items-center gap-1.5 px-2 py-0.5 border text-[11px] " +
                  (on ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-text)]"
                      : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)]")}>
                <span className="inline-block w-2 h-2 shrink-0" style={{ background: c.color }} />
                <span className="uppercase tracking-wider text-[9.5px]">{c.t}</span>
                <span className="tabular-nums font-semibold text-[12px]">
                  {d.cuadrante[c.k]}
                </span>
              </button>
            );
          })}
          {tipo && (
            <button onClick={() => setTipo(null)}
              className="ml-1 text-[10px] text-[var(--t-accent)] hover:underline">
              ver todos
            </button>
          )}
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] pl-3">
            deja mucho = entra en el {d.cortes.pct_arancel}% · viene seguido = {d.cortes.meses_seguido} de 12 meses
          </span>
        </div>
      )}

      {/* ── Contexto: en las TRES solapas, nunca escondido en una ─────────── */}
      <div className="flex items-baseline gap-2 px-4 py-1.5 border-b border-[var(--t-border)]
                      bg-[var(--t-surface)] shrink-0 overflow-x-auto whitespace-nowrap
                      text-[11px] text-[var(--t-text-muted)]">
        <span className="uppercase tracking-widest text-[var(--t-text-dim)] font-semibold">
          {d?.label ?? "…"}
        </span>
        <Sep />
        <span>operaron <N>{fmtInt(d?.contexto.n_operaron)}</N> de <N>{fmtInt(d?.contexto.n_clientes)}</N></span>
        <Sep />
        {/* La mediana y el promedio PEGADOS: si el promedio es 6 veces el del
            medio, cualquiera entiende que hay una ballena adentro sin que haya
            que explicarle qué es una distribución sesgada. */}
        <span>el del medio deja <N>{d ? fmtMoneyFull(d.contexto.mediana) : "…"}</N>, el promedio <N>{d ? fmtMoneyFull(d.contexto.promedio) : "…"}</N></span>
        <Sep />
        <span><N>{fmtInt(d?.contexto.cuantos_80)}</N> hacen el <N>80%</N></span>
        {d?.contexto.top10_pct != null && <><Sep /><span>los 10 más grandes, el <N>{d.contexto.top10_pct}%</N></span></>}
      </div>

      {/* ── Cuerpo ────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {solapa === "importan" && <Importan d={d} tipo={tipo} abrir={setFicha} />}
        {solapa === "apagan" && <Apagan d={d} abrir={setFicha} />}
        {solapa === "perdieron" && <Perdieron d={d} abrir={setFicha} />}
        {!d && !err && <div className="px-4 py-6 text-[11px] text-[var(--t-text-muted)]">cargando…</div>}
      </div>

      {ficha && (
        <PerfilClienteModal key={ficha} idCuenta={ficha} moneda={moneda}
          hasta={d?.fin} onCerrar={() => setFicha(null)} />
      )}

      {/* ── Pie: lo que las listas NO pueden saber ─────────────────────────── */}
      {d && (
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
};
const UNIDAD: Record<string, string> = {
  pct_arancel: "% del arancel", meses_seguido: "de los últimos 12 meses",
  multiplo: "× su ritmo", min_dias_op: "días operados en 12 meses",
  caida_pct: "%", meses_atras: "meses", piso_aum: "$ de AuM",
};
const fmtCorte = (k: string, v: number) =>
  k === "piso_aum" ? Math.round(v).toLocaleString("es-AR") : String(v);

function B({ children }: { children: React.ReactNode }) {
  return <b className="text-[var(--t-text)] font-semibold">{children}</b>;
}
function N({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--t-accent)] font-semibold tabular-nums">{children}</span>;
}
function Sep() { return <span className="opacity-40">·</span>; }
function Tag({ tipo }: { tipo: string }) {
  // Tokens del tema, no hex: en modo claro un #ff6b6b sobre blanco es ilegible.
  const color = tipo === "nucleo" ? "var(--t-pos)"
    : tipo === "grande_irregular" ? "var(--t-neg)"
    : tipo === "habitual" ? "var(--t-accent)" : "var(--t-text-muted)";
  return (
    <span className="ml-2 text-[8.5px] tracking-wider px-1 py-px border align-middle"
      style={{ color, borderColor: color }}>{TIPO_LABEL[tipo] ?? tipo}</span>
  );
}

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

// ── QUIÉNES IMPORTAN ────────────────────────────────────────────────────────
// La tabla de QUIÉNES IMPORTAN. El cuadrante NO vive acá: es la fila de chips de
// arriba, que además ACOTA esta tabla. Un cuadrado de 200 px de alto arriba de la
// lista empujaba la lista fuera de la pantalla — y era una ilustración, no un
// control.
function Importan({ d, tipo, abrir }: { d: Resp | null; tipo: string | null; abrir: (id: string) => void }) {
  if (!d) return null;
  const items = tipo
    ? d.quienes_importan.items.filter((i) => i.tipo === tipo)
    : d.quienes_importan.items;
  if (!items.length) {
    return <Vacio que={tipo
      ? "ninguna cuenta de este tipo llega al corte de arancel."
      : "nadie llega al corte de arancel en este mes."} />;
  }
  return (
    <>
      <table className="w-full">
        <thead><tr>
          <th className={TH + " text-left"}>Cuenta</th>
          <th className={TH + " text-left"}>Cliente</th>
          <th className={TH + " text-left"}>Operador</th>
          <th className={TH + " text-left"}>Nivel 3</th>
          <th className={TH + " text-right"}>Apareció</th>
          <th className={TH + " text-right"}>Deja por mes</th>
          <th className={TH + " text-right"}>% del arancel</th>
        </tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id_cuenta} onClick={() => abrir(i.id_cuenta)}
              title="Ver la ficha operativa del cliente"
              className={"cursor-pointer hover:bg-[var(--t-surface)] " +
              (i.tipo === "grande_irregular" ? "bg-[var(--t-tint-red)]" : "")}>
              <td className={TD + " text-left text-[var(--t-text-muted)]"}>[{i.id_cuenta}]</td>
              <td className={TDN}>{i.denominacion}<Tag tipo={i.tipo} /></td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.operador_nombre || "—"}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.nivel_3 || "—"}</td>
              <td className={TD + " text-right " +
                (i.tipo === "grande_irregular" ? "text-[var(--t-neg)]" : "")}>
                {i.meses_operados} de {i.meses_ventana}
              </td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.arancel_mes)}</td>
              <td className={TD + " text-right"}>{i.pct_arancel}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pie l={{ ...d.quienes_importan, items }} />
    </>
  );
}

// ── SE ESTÁN APAGANDO ───────────────────────────────────────────────────────
function Apagan({ d, abrir }: { d: Resp | null; abrir: (id: string) => void }) {
  if (!d) return null;
  if (!d.se_apagan.items.length) {
    return <Vacio que="ningún cliente con ritmo medible rompió su patrón con este corte." />;
  }
  return (
    <>
      <table className="w-full">
        <thead><tr>
          <th className={TH + " text-left"}>Cuenta</th>
          <th className={TH + " text-left"}>Cliente</th>
          <th className={TH + " text-left"}>Operador</th>
          <th className={TH + " text-right"}>Suele operar cada</th>
          <th className={TH + " text-right"}>Lleva sin operar</th>
          <th className={TH + " text-right"}>Veces su ritmo</th>
          <th className={TH + " text-right"}>Retiró</th>
          <th className={TH + " text-right"}>Deja por mes</th>
          <th className={TH + " text-left"}>Última op</th>
        </tr></thead>
        <tbody>
          {d.se_apagan.items.map((i) => (
            <tr key={i.id_cuenta} onClick={() => abrir(i.id_cuenta)}
              title="Ver la ficha operativa del cliente"
              className={"cursor-pointer hover:bg-[var(--t-surface)] " +
              (i.retiro ? "bg-[var(--t-tint-red)]" : "")}>
              <td className={TD + " text-left text-[var(--t-text-muted)]"}>[{i.id_cuenta}]</td>
              <td className={TDN}>{i.denominacion}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.operador_nombre || "—"}</td>
              <td className={TD + " text-right"}>{i.ritmo_dias} días</td>
              <td className={TD + " text-right text-[var(--t-neg)]"}>{i.dias_sin_operar} días</td>
              <td className={TD + " text-right"}>{i.veces_su_ritmo}×</td>
              {/* La plata se va ANTES que el cliente: si además retiró, la fila lo grita. */}
              <td className={TD + " text-right " + (i.retiro ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]")}>
                {i.retiro ? fmtMoneyFull(i.retiro) : "—"}
              </td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.deja_por_mes)}</td>
              <td className={TD + " text-left text-[var(--t-text-dim)]"}>{fmtFecha(i.ultima_op)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pie l={d.se_apagan} />
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
      <table className="w-full">
        <thead><tr>
          <th className={TH + " text-left"}>Cuenta</th>
          <th className={TH + " text-left"}>Cliente</th>
          <th className={TH + " text-left"}>Operador</th>
          <th className={TH + " text-right"}>Tenía ({fmtFecha(f.snapshot_antes)})</th>
          <th className={TH + " text-right"}>Tiene ({fmtFecha(f.snapshot_hoy)})</th>
          <th className={TH + " text-right"}>Caída</th>
          <th className={TH + " text-right"}>Retiró</th>
          <th className={TH + " text-left"}>Qué pasó</th>
        </tr></thead>
        <tbody>
          {d.perdieron_aum.items.map((i) => (
            <tr key={i.id_cuenta} onClick={() => abrir(i.id_cuenta)}
              title="Ver la ficha operativa del cliente"
              className={"cursor-pointer hover:bg-[var(--t-surface)] " +
              (i.alerta ? "bg-[var(--t-tint-red)]" : "")}>
              <td className={TD + " text-left text-[var(--t-text-muted)]"}>[{i.id_cuenta}]</td>
              <td className={TDN}>{i.denominacion}</td>
              <td className={TDN + " text-[var(--t-text-dim)] text-[12px]"}>{i.operador_nombre || "—"}</td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.aum_antes)}</td>
              <td className={TD + " text-right"}>{fmtMoneyFull(i.aum_hoy)}</td>
              <td className={TD + " text-right text-[var(--t-neg)]"}>−{i.caida_pct}%</td>
              <td className={TD + " text-right " + (i.retiro ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]")}>
                {i.retiro ? fmtMoneyFull(i.retiro) : "nada"}
              </td>
              {/* El veredicto no es un modelo: sale de dos hechos (cuánto cayó y si
                  retiró). Cayó a cero sin retirar = se llevó los títulos a otro
                  agente, que es lo peor y hoy no se ve en ningún lado. */}
              <td className={TDN + " text-[12px] " +
                (i.que_paso === "Se llevó los títulos" ? "text-[var(--t-neg)] font-semibold"
                  : i.alerta ? "text-[var(--t-text)]" : "text-[var(--t-text-dim)]")}>
                {i.que_paso}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pie l={d.perdieron_aum} />
    </>
  );
}
