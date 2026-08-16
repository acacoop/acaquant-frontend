"use client";

// AV AGENT — botón en la barra inferior + MODAL (docs/AV_AGENT.md en el backend).
//
// El agente compara `mercado.curvas` contra 1816, encuentra huecos y errores, y
// PREGUNTA lo que no puede decidir solo. Acá pasa esa conversación.
//
// **Por qué modal y no vista** (decisión del user 2026-08-16): el AV Agent no es
// una vista de datos que se consulta, es algo que INTERRUMPE cuando tiene algo
// que preguntar. Una vista en el nav compite con RENTA FIJA y TRADING —
// pantallas que se abren para trabajar— y pierde: nadie navega a un agente. Un
// botón en la barra de estado, al lado de BRIEFING y SALUD, dice lo que es: un
// canal siempre presente que no ocupa lugar hasta que lo abrís.
//
// **ADMIN-ONLY, decidido en el server** (layout.tsx, igual que SALUD): sin el
// módulo el componente NO EXISTE en el HTML, no pollea y no puede mostrar nada.
// El gate real es el backend (require_admin); esto es defensa en profundidad.
//
// Tres decisiones del contenido, ninguna cosmética:
//
// 1. LAS PREGUNTAS SON EL TAB DEFAULT. Los hallazgos son informativos; las
//    preguntas son lo único que el agente no puede resolver solo. Abrir en la
//    lista de 64 problemas deja las 27 preguntas sin contestar, y sin respuestas
//    el agente no aprende.
// 2. EL AGENTE HABLA EN PRIMERA PERSONA. La diferencia entre "hallazgos: 24" y
//    "encontré 24 bonos que no tenés, ¿cuáles te interesan?" es si se entiende
//    que a uno le toca hacer algo. Un tablero no se contesta; una pregunta sí.
// 3. DICE LO QUE NO PUEDE HACER. `capacidades.puede_dar_de_alta` viene del
//    backend: hoy «alta» GUARDA la decisión pero no da de alta nada (eso es E2).
//    Sin decirlo, el botón se lee como roto.

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";

// ── Contrato GET /api/ia/av-agent/vista ────────────────────────────────────
type Hallazgo = {
  tipo: string; ticker: string; regla: string; severidad: string;
  motivo: string; evidencia: Record<string, unknown> | null;
};
type Pregunta = {
  id: number; clave: string; tipo: string; pregunta: string; opciones: string[];
  contexto: Record<string, unknown> | null;
};
type Decidida = {
  id: number; clave: string; tipo: string; pregunta: string;
  respuesta: string | null; nota: string | null; respondida_por: string | null;
  respondida_at: string | null; aplicada_at: string | null;
};
type Ignorado = { ticker: string; motivo: string; por: string | null; creado_at: string | null };
type Vista = {
  corrida_at: string | null;
  hallazgos: Hallazgo[];
  por_tipo: Record<string, number>;
  por_regla: Record<string, number>;
  preguntas: Pregunta[];
  decisiones: Pregunta[];
  decididas: Decidida[];
  ignorados: Ignorado[];
  capacidades: { puede_ignorar: boolean; puede_dar_de_alta: boolean; motivo_alta: string };
};

const TIPO_LABEL: Record<string, string> = {
  falta_en_base: "Están en 1816 y no en tu base",
  sin_flujo: "Tuyos sin cronograma de flujos",
  tasa_sospechosa: "Tasas que pueden estar mal",
};

const SEV_TINT: Record<string, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-tint-amber)",
  baja: "var(--t-text-dim)",
};

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca corrió";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

type Tab = "preguntas" | "hallazgos" | "decidido";

const TITULO = "text-[10px] font-semibold tracking-widest text-[var(--t-accent)]";
const SUB = "text-[10px] text-[var(--t-text-dim)]";

export function AvAgentModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("preguntas");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});

  const cargar = useCallback(async () => {
    try {
      setData(await fetchJson<Vista>("/api/ia/av-agent/vista"));
      setError("");
    } catch (e) {
      // 403 = no es admin → el botón se apaga solo (gate estructural, mismo
      // criterio que el briefing: si el backend dice que no, no hay UI).
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Una sola carga al montar, para tener el contador en la barra sin abrir nada.
  useEffect(() => { void cargar(); }, [cargar]);

  const responder = useCallback(async (id: number, respuesta: string) => {
    setEnviando(id);
    try {
      await fetchJson("/api/ia/av-agent/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, respuesta, nota: notas[id] || "" }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(null);
    }
  }, [cargar, notas]);

  const designorar = useCallback(async (ticker: string) => {
    try {
      // POST y no DELETE: el proxy catch-all de /api/ia expone solo GET y POST.
      await fetchJson("/api/ia/av-agent/designorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  const porTipo = useMemo(() => {
    const g: Record<string, Hallazgo[]> = {};
    for (const h of data?.hallazgos ?? []) (g[h.tipo] ??= []).push(h);
    return g;
  }, [data]);

  // Sin datos (403 del backend / API caída) el botón NO se monta: un botón que
  // abre un modal vacío es peor que no tenerlo.
  if (!data && error) return null;

  const nPreg = (data?.preguntas.length ?? 0) + (data?.decisiones.length ?? 0);

  return (
    <>
      <button
        onClick={() => { void cargar(); setOpen(true); }}
        title="AV Agent — integridad de renta fija"
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
      >
        <span>◆</span>
        <span className="tracking-widest">AV AGENT</span>
        {/* El contador es la única señal proactiva: si tiene preguntas, se ve
            desde cualquier pantalla sin abrir nada. */}
        {nPreg > 0 && (
          <span className="px-1 rounded-sm bg-[var(--t-accent)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
            {nPreg}
          </span>
        )}
      </button>

      {open && data && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl bg-[var(--t-panel)] border border-[var(--t-accent)] flex flex-col overflow-hidden"
          >
            {/* ── Header: identidad + estado de la última revisión ────────── */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--t-border)]">
              <span className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                ◆ AV AGENT
              </span>
              <span className="text-[10px] text-[var(--t-text-dim)]">
                integridad de renta fija · 1816 ↔ mercado.curvas
              </span>
              {/* Una foto SIN su fecha es una foto que miente en silencio. */}
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
                última revisión {haceCuanto(data.corrida_at)}
              </span>
              <button
                onClick={() => void cargar()}
                title="Releer (no vuelve a censar 1816)"
                className="text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
              >
                ↻
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* ── Tabs ───────────────────────────────────────────────────── */}
            <div className="flex items-stretch border-b border-[var(--t-border)] bg-[var(--t-surface)]">
              {([
                ["preguntas", "ME PREGUNTA", nPreg],
                ["hallazgos", "ENCONTRÓ", data.hallazgos.length],
                ["decidido", "YA DECIDIDO", data.decididas.length],
              ] as [Tab, string, number][]).map(([k, label, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-4 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px transition-colors ${
                    tab === k
                      ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                      : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                  }`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums opacity-70">{n}</span>
                </button>
              ))}
              {error && (
                <span className="ml-auto self-center px-3 text-[10px] text-[var(--t-neg)] truncate max-w-[40%]">
                  {error}
                </span>
              )}
            </div>

            {/* ── Cuerpo ─────────────────────────────────────────────────── */}
            <div className="overflow-y-auto max-h-[74vh] p-4">
              {tab === "preguntas" && (
                <TabPreguntas
                  data={data} enviando={enviando} notas={notas}
                  setNota={(id, v) => setNotas((n) => ({ ...n, [id]: v }))}
                  responder={responder}
                />
              )}
              {tab === "hallazgos" && <TabHallazgos porTipo={porTipo} data={data} />}
              {tab === "decidido" && <TabDecidido data={data} designorar={designorar} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── TAB 1: las preguntas ───────────────────────────────────────────────────

function TabPreguntas({ data, enviando, notas, setNota, responder }: {
  data: Vista;
  enviando: number | null;
  notas: Record<number, string>;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
}) {
  // Los que la casa YA TIENE van primero: son los únicos donde no contestar
  // tiene un costo hoy (esa posición no valúa). Marcarlos y dejarlos en la
  // tarjeta 18 es lo mismo que no marcarlos.
  const ordenadas = [...data.preguntas].sort((a, b) => {
    const ca = a.contexto?.en_cartera === true ? 0 : 1;
    const cb = b.contexto?.en_cartera === true ? 0 : 1;
    return ca - cb || a.id - b.id;
  });

  if (data.preguntas.length === 0 && data.decisiones.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        No tengo nada que preguntarte. Cuando encuentre un bono nuevo y no sepa si
        te interesa, te lo voy a preguntar acá.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {data.decisiones.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className={TITULO}>CÓMO QUERÉS QUE TRABAJE</h3>
            <span className={SUB}>
              definen mi comportamiento · sin respuesta uso el default
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {data.decisiones.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} />
            ))}
          </div>
        </section>
      )}

      {data.preguntas.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={TITULO}>SOBRE LO QUE ENCONTRÉ</h3>
            <span className={SUB}>
              lo que no contestes queda abierto — no te lo vuelvo a preguntar
            </span>
          </div>
          {!data.capacidades.puede_dar_de_alta && (
            <p className="mb-2 px-2 py-1 text-[10px] text-[var(--t-text-muted)] border-l-2 border-[var(--t-tint-amber)] bg-[var(--t-surface)]">
              <strong className="text-[var(--t-text)]">«Alta» todavía no da de alta nada.</strong>{" "}
              {data.capacidades.motivo_alta}
            </p>
          )}
          {/* Dos columnas: son 24 preguntas cortas y todas iguales. En una sola
              columna hay que scrollear tres pantallas para verlas; en dos entran
              de a doce y se contestan de arriba abajo. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {ordenadas.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} compacta />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Los campos de la ficha que el backend manda en `contexto`. El front NO los
// deriva ni los completa: si 1816 no mandó el emisor, la fila no aparece — una
// celda vacía es honesta, un "—" inventado no.
function fichaDe(ctx: Record<string, unknown> | null): [string, string][] {
  if (!ctx) return [];
  const s = (k: string) => (typeof ctx[k] === "string" ? (ctx[k] as string).trim() : "");
  const filas: [string, string][] = [];
  if (s("emisor")) filas.push(["Emisor", s("emisor")]);
  if (s("denominacion")) filas.push(["Instrumento", s("denominacion")]);
  const cur = s("curva_1816");
  if (cur) filas.push(["Curva 1816", cur + (s("moneda") ? ` · ${s("moneda")}` : "")]);
  const vto = s("vencimiento_1816");
  if (vto) filas.push(["Vence", vto.slice(0, 10)]);
  return filas;
}

function Tarjeta({ p, enviando, nota, setNota, responder, compacta = false }: {
  p: Pregunta;
  enviando: number | null;
  nota: string;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
  compacta?: boolean;
}) {
  const ocupado = enviando === p.id;
  const ctx = p.contexto ?? null;
  const ficha = fichaDe(ctx);
  const enCartera = ctx?.en_cartera === true;
  // El TICKER se separa del resto de la pregunta: es lo que uno busca con la
  // vista cuando recorre 21 tarjetas, y perdido dentro de un párrafo no se
  // encuentra.
  const ticker = (p.clave || "").startsWith("falta:") ? p.clave.slice(6) : "";
  return (
    <div className={`border bg-[var(--t-surface)] px-3 py-2 ${
      enCartera ? "border-[var(--t-neg)]" : "border-[var(--t-border)]"} ${
      ocupado ? "opacity-50" : ""}`}>
      {ticker ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold tracking-wide text-[var(--t-text)] tabular-nums">
              {ticker}
            </span>
            {/* Un bono en la tenencia que no está en mercado.curvas NO VALÚA:
                eso no es una preferencia, es un arreglo pendiente, y tiene que
                verse antes que el resto. */}
            {enCartera && (
              <span className="px-1 text-[9px] font-bold tracking-widest text-[var(--t-neg)] border border-[var(--t-neg)]">
                EN CARTERA · NO VALÚA
              </span>
            )}
          </div>
          {/* La ficha en filas etiquetadas y no en prosa: con 21 tarjetas
              iguales, alinear "Emisor" a la misma altura deja barrer la columna
              con la vista en vez de leer 21 oraciones. */}
          <dl className="mt-1 grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5">
            {ficha.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] pt-px">
                  {k}
                </dt>
                <dd className="text-[10px] text-[var(--t-text)] leading-snug truncate" title={v}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className={`${compacta ? "text-[11px]" : "text-[12px]"} text-[var(--t-text)] leading-snug`}>
          {p.pregunta}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.opciones.map((o) => (
          <button
            key={o}
            disabled={ocupado}
            onClick={() => responder(p.id, o)}
            className="text-[9px] font-semibold uppercase tracking-widest px-2.5 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40 transition-colors"
          >
            {o}
          </button>
        ))}
        {/* El POR QUÉ no es burocracia: es lo que el agente usa para dejar de
            proponer cosas parecidas. Por eso está al lado de los botones y no
            escondido detrás de un "agregar nota". */}
        <input
          value={nota}
          onChange={(e) => setNota(p.id, e.target.value)}
          placeholder="¿por qué? (me sirve para aprender)"
          className="flex-1 min-w-[140px] text-[10px] px-2 py-1 bg-transparent border border-[var(--t-border)] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] focus:border-[var(--t-accent)] outline-none"
        />
      </div>
    </div>
  );
}

// ── TAB 2: lo que encontró ─────────────────────────────────────────────────

function TabHallazgos({ porTipo, data }: {
  porTipo: Record<string, Hallazgo[]>;
  data: Vista;
}) {
  if (data.hallazgos.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        No encontré nada. Si todavía no corrí, la lista está vacía porque no miré —
        no porque esté todo bien.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {Object.entries(porTipo).map(([tipo, hs]) => (
        <section key={tipo}>
          <div className="flex items-baseline gap-2 mb-1.5">
            <h3 className={TITULO}>{(TIPO_LABEL[tipo] ?? tipo).toUpperCase()}</h3>
            <span className={SUB}>{hs.length}</span>
          </div>
          {/* Tabla y no lista: son filas homogéneas (ticker · regla · motivo) y
              alinearlas deja comparar de un vistazo, que es justo lo que uno hace
              con 38 tasas sospechosas. */}
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {hs.map((h, i) => (
              <div
                key={`${h.ticker}-${h.regla}-${i}`}
                className="grid grid-cols-[3px_72px_150px_1fr] items-baseline gap-2 px-2 py-1 hover:bg-[var(--t-surface)]"
              >
                <span className="self-stretch" style={{ background: SEV_TINT[h.severidad] }}
                      title={`severidad ${h.severidad}`} />
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums">
                  {h.ticker}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                      title={h.regla}>
                  {h.regla.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] leading-snug">
                  {h.motivo}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── TAB 3: lo ya decidido (y cómo deshacerlo) ──────────────────────────────

function TabDecidido({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className={TITULO}>NO TE INTERESAN</h3>
          <span className={SUB}>{data.ignorados.length} · no los vuelvo a proponer</span>
        </div>
        {data.ignorados.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Ninguno todavía.</p>
        ) : (
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {data.ignorados.map((ig) => (
              <div key={ig.ticker} className="flex items-center gap-2 px-2 py-1">
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums w-16 shrink-0">
                  {ig.ticker}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] flex-1 min-w-0 truncate"
                      title={ig.motivo}>
                  {ig.motivo}
                </span>
                {/* Sin este botón, `ignorar` es irreversible desde la app → la
                    respuesta segura pasa a ser no contestar nada, y el canal de
                    preguntas entero deja de usarse. */}
                <button
                  onClick={() => designorar(ig.ticker)}
                  className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors shrink-0"
                >
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className={TITULO}>HISTORIAL</h3>
          <span className={SUB}>{data.decididas.length} respuestas</span>
        </div>
        {data.decididas.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Todavía no contestaste nada.</p>
        ) : (
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {data.decididas.map((d) => (
              <div key={d.id} className="px-2 py-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--t-accent)] w-16 shrink-0">
                    {d.respuesta}
                  </span>
                  <span className="text-[10px] text-[var(--t-text-muted)] truncate">
                    {d.pregunta}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--t-text-dim)] pl-[72px]">
                  {d.respondida_por || "—"} · {haceCuanto(d.respondida_at)}
                  {/* aplicada_at NULL = se guardó pero no surtió efecto todavía.
                      Decirlo evita que uno crea que un bono ya está dado de alta
                      cuando no lo está. */}
                  {!d.aplicada_at && " · guardado, sin aplicar"}
                  {d.nota && ` · «${d.nota}»`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
