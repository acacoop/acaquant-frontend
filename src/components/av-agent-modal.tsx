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
  // QUÉ puede hacer el agente con este hallazgo. **Lo decide el backend** —
  // el front tenía la condición escrita a mano y comparaba contra la REGLA
  // (`flujos_vacios`) creyendo que era el TIPO (`sin_flujo`): el botón no
  // aparecía, sin error y sin nada que mirar.
  accion?: "alta" | "flujos" | "arreglo" | null;
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
type Accion = {
  id: number; ts: string | null; accion: string; destino: string; objetivo: string;
  detalle: Record<string, unknown> | null; antes: Record<string, unknown> | null;
  origen: string; pregunta_id: number | null; por: string | null;
  ok: boolean; error: string | null;
};
type Pendiente = {
  id: number; clave: string; ticker: string; respuesta: string | null;
  nota: string | null; respondida_por: string | null; respondida_at: string | null;
};
// Un AVISO es trabajo MANUAL pendiente: el agente hizo todo salvo un dato que
// solo puede poner una persona. No es un error — es la parte que ninguna fuente
// tiene. Se DERIVA en el backend, así que desaparece solo al cargar el dato.
type Aviso = {
  id: number; ticker: string; clave: string; que_hacer: string;
  por_que: string; donde: string; creado_at: string | null;
  resuelto: boolean; resuelto_por: string | null; resuelto_at: string | null;
  // Cruce contra el master EN VIVO. `null` = no se sabe verificar. Es lo que
  // hace seguro el cierre manual: marcado hecho + dato ausente se canta.
  ya_cargado: boolean | null;
  // Si el dato se puede CARGAR desde acá mismo, el backend manda cómo pedirlo.
  // `null` = no hay recetario para esa clave → hay que ir a Manager.
  campo: { label: string; tipo: string; ayuda: string } | null;
};
type Vista = {
  corrida_at: string | null;
  avisos: Aviso[];
  hallazgos: Hallazgo[];
  por_tipo: Record<string, number>;
  por_regla: Record<string, number>;
  preguntas: Pregunta[];
  decisiones: Pregunta[];
  decididas: Decidida[];
  ignorados: Ignorado[];
  pendientes: Pendiente[];
  acciones: Accion[];
  capacidades: { puede_ignorar: boolean; puede_dar_de_alta: boolean; motivo_alta: string };
};

const TIPO_LABEL: Record<string, string> = {
  hueco_de_curva: "Le falta al sistema (no es un dato mal cargado)",
  falta_en_base: "Están en 1816 y no en tu base",
  sin_flujo: "Tuyos sin cronograma de flujos",
  tasa_sospechosa: "Tasas que pueden estar mal",
};

// Los huecos van PRIMEROS: un ajuste sin curva deja bonos invisibles, y arreglar
// un dato de un bono que igual no se ve es trabajo perdido.
const ORDEN_TIPO = ["hueco_de_curva", "falta_en_base", "sin_flujo", "tasa_sospechosa"];

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

type Tab = "preguntas" | "avisos" | "hallazgos" | "hizo" | "decidido";

// Qué hizo cada acción, en castellano. El nombre técnico (`ignorar_ticker`) va
// igual en la fila: el libro tiene que servir para auditar, y para eso hace falta
// el nombre exacto que se busca en la base.
const ACCION_LABEL: Record<string, string> = {
  ignorar_ticker: "Marcó como «no nos interesa»",
  designorar: "Deshizo un «no nos interesa»",
  crear_curva: "Creó la curva",
  alta_bono: "Dio de alta el bono",
  completar_flujo: "Completó el cuadro de flujos",
  sembrar_especies: "Sembró las patas del papel",
  sembrar_tasa_1816: "Cargó la tasa y el margen de 1816",
};

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Hora de Buenos Aires: el libro se lee para reconstruir qué pasó a tal hora,
  // y esa hora es la del que operó, no la del servidor.
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const TITULO = "text-[10px] font-semibold tracking-widest text-[var(--t-accent)]";
const SUB = "text-[10px] text-[var(--t-text-dim)]";

export function AvAgentModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Vista | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("preguntas");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [notas, setNotas] = useState<Record<number, string>>({});
  // Simulaciones por ticker. `null` = corriendo. El resultado se guarda para que
  // uno pueda mirar el número antes de aplicar — que es todo el punto de E2.
  const [sims, setSims] = useState<Record<string, Record<string, unknown> | null>>({});

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

  const resolverAviso = useCallback(async (id: number, deshacer: boolean) => {
    try {
      await fetchJson("/api/ia/av-agent/aviso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, deshacer }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  const completarAviso = useCallback(async (id: number, valor: string) => {
    try {
      await fetchJson("/api/ia/av-agent/aviso/completar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, valor }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

  // «No me interesa» desde CUALQUIER hallazgo. Antes solo se podía ignorar
  // contestando una pregunta del agente, y solo valía para los faltantes.
  const ignorar = useCallback(async (ticker: string) => {
    try {
      await fetchJson("/api/ia/av-agent/ignorar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cargar]);

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

  // `extra` lleva los datos que el user tipeó EN la cadena (hoy: el CER de
  // emisión). Viajan igual a SIMULAR y a APLICAR, así que lo que se aplica es
  // exactamente lo que se vio simulado — no una segunda cuenta con otros
  // insumos.
  const simular = useCallback(async (ticker: string, curva1816: string,
                                     aplicar = false,
                                     extra: Record<string, unknown> = {},
                                     modo: "alta" | "flujos" | "arreglo" = "alta") => {
    setSims((s) => ({ ...s, [ticker]: null }));
    // Dos rutas porque son dos escrituras DISTINTAS: el alta crea el bono entero;
    // `flujos` completa el cronograma de uno que ya existe y no toca nada más.
    // Tres puertas, tres escrituras DISTINTAS: el alta crea el bono entero,
    // `flujos` completa un cronograma vacío y `arreglo` PISA un insumo que ya
    // está. Compartir ruta las haría indistinguibles en el libro de acciones.
    const ruta = modo === "flujos"
      ? (aplicar ? "aplicar-flujos" : "simular-flujos")
      : modo === "arreglo"
      ? (aplicar ? "aplicar-arreglo" : "simular-arreglo")
      : (aplicar ? "aplicar-alta" : "simular");
    try {
      const r = await fetchJson<Record<string, unknown>>(
        `/api/ia/av-agent/${ruta}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, curva_1816: curva1816, ...extra }),
        });
      setSims((s) => ({ ...s, [ticker]: r }));
      if (aplicar) await cargar();
    } catch (e) {
      setSims((s) => ({ ...s, [ticker]: { ok: false, error: String(e) } }));
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
                ["avisos", "AVISOS", (data.avisos ?? []).filter((a) => !a.resuelto).length],
                ["hallazgos", "ENCONTRÓ", data.hallazgos.length],
                ["hizo", "HIZO", (data.acciones ?? []).length],
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
                  setTab={setTab}
                />
              )}
              {tab === "avisos" && <TabAvisos avisos={data.avisos ?? []} resolver={resolverAviso} completar={completarAviso} />}
              {tab === "hallazgos" && (
                <TabHallazgos porTipo={porTipo} data={data} sims={sims} simular={simular} ignorar={ignorar} />
              )}
              {tab === "hizo" && <TabHizo acciones={data.acciones ?? []} />}
              {tab === "decidido" && <TabDecidido data={data} designorar={designorar} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── TAB 1: las preguntas ───────────────────────────────────────────────────

function TabPreguntas({ data, enviando, notas, setNota, responder, setTab }: {
  data: Vista;
  enviando: number | null;
  notas: Record<number, string>;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
  setTab: (t: Tab) => void;
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
    // "No tengo preguntas" NO es "no pasa nada". Con 0 preguntas y 38 hallazgos
    // de severidad alta, un tab vacío hace creer que el agente no encontró nada
    // — y el trabajo que SÍ hizo queda a un click que nadie da.
    const urgentes = data.hallazgos.filter((h) => h.severidad === "alta").length;
    return (
      <div className="text-[11px] text-[var(--t-text-muted)]">
        <p>
          No tengo nada que preguntarte: contestaste todo. Cuando encuentre un bono
          nuevo y no sepa si te interesa, te lo voy a preguntar acá.
        </p>
        {urgentes > 0 && (
          <p className="mt-2">
            Eso sí — <strong className="text-[var(--t-text)]">encontré {urgentes} cosa(s)
            de severidad alta</strong> que no son preguntas para vos, son trabajo
            pendiente. Están en el tab{" "}
            <button
              onClick={() => setTab("hallazgos")}
              className="underline text-[var(--t-accent)] hover:opacity-80"
            >
              ENCONTRÓ
            </button>
            .
          </p>
        )}
      </div>
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
  // Darlo de alta NO alcanza para verlo si su ajuste no tiene curva.
  const sinCurva = ctx?.ajuste_sin_curva === true;
  const ajuste = String((ctx?.ejes_sugeridos as Record<string, unknown> | undefined)
    ?.ajuste ?? "").toUpperCase();
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
            {/* Sin pill no hay curva, y sin curva el bono queda cargado y no
                aparece en ninguna pantalla. Decirlo ANTES del alta es la
                diferencia entre una decisión informada y cargar diez bonos que
                no se van a poder mirar. */}
            {sinCurva && (
              <span
                className="px-1 text-[9px] font-bold tracking-widest text-[var(--t-tint-amber)] border border-[var(--t-tint-amber)]"
                title={`El ajuste ${ajuste} todavía no tiene tabla en la app: si lo das de alta, no va a aparecer en ninguna vista.`}
              >
                {ajuste} SIN CURVA
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

function TabHallazgos({ porTipo, data, sims, simular, ignorar }: {
  porTipo: Record<string, Hallazgo[]>;
  data: Vista;
  sims: Record<string, Record<string, unknown> | null>;
  simular: (ticker: string, curva1816: string, aplicar?: boolean,
            extra?: Record<string, unknown>, modo?: "alta" | "flujos") => void;
  ignorar: (ticker: string) => void;
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
      {Object.entries(porTipo)
        .sort(([a], [b]) => (ORDEN_TIPO.indexOf(a) + 1 || 99) - (ORDEN_TIPO.indexOf(b) + 1 || 99))
        .map(([tipo, hs]) => (
        <section key={tipo}>
          <div className="flex items-baseline gap-2 mb-1.5">
            <h3 className={TITULO}>{(TIPO_LABEL[tipo] ?? tipo).toUpperCase()}</h3>
            <span className={SUB}>{hs.length}</span>
          </div>
          {/* Tabla y no lista: son filas homogéneas (ticker · regla · motivo) y
              alinearlas deja comparar de un vistazo, que es justo lo que uno hace
              con 38 tasas sospechosas. */}
          {/* **Un BONO, un diagnóstico.** Un mismo ticker puede disparar VARIAS
              reglas —CO3D7 sale por `sin_tea_con_precio` Y por
              `paridad_fuera_de_rango`, y son 5 de los 38— pero el bono es uno
              solo y la propuesta de arreglo también. Sin esto la cadena entera
              se renderiza dos veces para el mismo instrumento, y como el estado
              de la simulación se guarda POR TICKER las dos filas mostrarían
              exactamente el mismo resultado: el que mira cree que son dos cosas
              distintas y son la misma. La acción va en la PRIMERA aparición; las
              otras siguen mostrando su motivo, que es lo que las distingue. */}
          <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
            {(() => { const vistos = new Set<string>(); return hs.map((h, i) => {
              const primera = !vistos.has(h.ticker);
              vistos.add(h.ticker);
              return (
              <div
                key={`${h.ticker}-${h.regla}-${i}`}
                className="grid grid-cols-[3px_72px_150px_1fr_auto] items-baseline gap-2 px-2 py-1 hover:bg-[var(--t-surface)]"
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
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--t-text-muted)] leading-snug">
                    {h.motivo}
                  </span>
                  {/* ENCONTRÓ deja de ser solo un comentario: donde hay algo que
                      el agente PUEDE hacer, el botón está en la misma fila. Un
                      hallazgo accionable que obliga a irse a otra pantalla es un
                      hallazgo que no se acciona. */}
                  {/* ENCONTRÓ deja de ser solo un comentario: donde el agente
                      PUEDE hacer algo, el botón está en la misma fila. **Qué
                      puede hacer lo dice el backend** (`h.accion`) — replicar
                      acá la lista de tipos accionables es cómo se consigue un
                      botón que no aparece y no avisa por qué. */}
                  {primera && (h.accion === "alta" || h.accion === "flujos"
                    || h.accion === "arreglo") && (
                    <AccionCadena h={h} sim={sims[h.ticker]} simular={simular}
                                  modo={h.accion} />
                  )}
                </div>
                {/* IGNORAR vive en TODA fila, no solo donde hay una acción: el
                    valor de la lista depende de poder sacarle lo que no importa.
                    Reversible desde la tab DECIDIDO. */}
                <button
                  onClick={() => ignorar(h.ticker)}
                  title="No me interesa: no vuelve a aparecer (reversible en DECIDIDO)"
                  className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 self-center border border-transparent text-[var(--t-text-dim)] hover:border-[var(--t-neg)] hover:text-[var(--t-neg)]"
                >
                  Ignorar
                </button>
              </div>
            ); }); })()}
          </div>
        </section>
      ))}
    </div>
  );
}

// LA CADENA ACCIONABLE — **una sola** para las dos puertas del agente.
//
// Acá vivían DOS componentes casi idénticos (`AccionAlta` y `AccionFlujos`) que
// se diferenciaban en tres strings. El costo de esa copia se cobró enseguida: el
// bloque que PIDE el dato faltante (el CER de emisión, tipeado en la propia
// cadena) se escribió solo en el alta, así que en COMPLETAR CRONOGRAMA el paso
// llegaba con su `pide` y **no se renderizaba nada** — misma familia de bug que
// el botón que no aparecía por comparar la REGLA en vez del TIPO: en silencio.
//
// Lo que cambia entre las dos puertas son las ETIQUETAS y de dónde sale la curva
// de 1816; todo el resto —el veredicto que habilita aplicar, los datos tipeados
// que viajan igual a simular y a aplicar, el paso a paso— es el mismo criterio y
// ahora está escrito una sola vez.
const COPY = {
  alta: {
    simular: "Simular", aplicar: "Aplicar", hecho: "✔ DADO DE ALTA · ",
    // Un alta INFIERE el CER de emisión de la serie macro; un completar lo lee
    // del master. Decir cuál de las dos cosas pasó es la diferencia entre un
    // número que se puede auditar y uno que hay que creer.
    cer: "inferido",
  },
  flujos: {
    simular: "Simular flujos", aplicar: "Completar cronograma",
    hecho: "✔ CRONOGRAMA ESCRITO · ", cer: "del master",
  },
  // La ÚNICA que pisa un dato existente — por eso el verbo es «arreglar» y no
  // «aplicar»: lo que se hace acá es distinto y el botón tiene que decirlo.
  arreglo: {
    simular: "Diagnosticar", aplicar: "Arreglar",
    hecho: "✔ ARREGLADO · ", cer: "del master",
  },
} as const;

function AccionCadena({ h, sim, simular, modo }: {
  h: Hallazgo;
  sim: Record<string, unknown> | null | undefined;
  simular: (ticker: string, curva1816: string, aplicar?: boolean,
            extra?: Record<string, unknown>, modo?: "alta" | "flujos" | "arreglo") => void;
  modo: "alta" | "flujos" | "arreglo";
}) {
  // Lo que el user tipeó EN la cadena. Vive acá —y no en el padre— porque es de
  // ESTE hallazgo: un estado compartido haría que el CER de un bono se filtrara
  // al siguiente que se simule.
  const [pedido, setPedido] = useState<Record<string, string>>({});
  const copy = COPY[modo];
  // El alta necesita la curva de 1816 (el bono todavía no existe, así que no hay
  // de dónde deducirla); el completar NO — el bono ya está y su rama sale del
  // doc que cargó la mesa.
  const curva = modo === "alta" ? String((h.evidencia ?? {}).curva_1816 ?? "") : "";
  if (modo === "alta" && !curva) return null;
  const corriendo = sim === null;
  const r = sim as Record<string, unknown> | undefined;
  const ok = r?.ok === true;
  const aplicable = r?.aplicable === true;
  const aplicado = r?.aplicado === true;
  const tea = typeof r?.tea === "number" ? (r.tea as number) : null;
  const pasos: Paso[] = Array.isArray(r?.chequeos) ? (r.chequeos as Paso[]) : [];
  const veredicto = r?.veredicto as Veredicto | undefined;
  // **UNA sola fuente decide si se puede aplicar: el veredicto del backend.**
  // Acá convivían dos condiciones distintas (`aplicable`, que miraba la rama, y
  // `bloqueado`, que miraba los pasos) y se contradecían entre sí: GD46 mostraba
  // APLICAR con el cronograma probadamente equivocado, y TMG27 escondía el botón
  // con la cadena entera en verde. Y sumarle un AND «por las dudas» es lo que
  // escondió el botón en TZXA7 — el gate real pasa a ser el más restrictivo, que
  // nadie está mirando. El fallback local es solo para un deploy desparejo.
  const puedeAplicar = veredicto
    ? veredicto.puede_aplicar !== false
    : !pasos.some((p) => p.estado === "bloquea");

  // Los datos tipeados viajan IGUAL a SIMULAR y a APLICAR: lo que se aplica es
  // exactamente lo que se vio simulado. Si fueran dos payloads distintos, el
  // bono podría escribirse con insumos que nadie miró.
  const extra: Record<string, unknown> = {};
  for (const k of Object.keys(pedido)) {
    // Coma decimal: se tipea «12,3456» y el backend espera un número.
    const crudo = (pedido[k] ?? "").trim();
    const n = Number(crudo.replace(",", "."));
    if (crudo && Number.isFinite(n) && n > 0) extra[k] = n;
  }
  // Los pasos que PIDEN un dato. **Se listan por `pide`, NO por si ya se tipeó
  // algo** — y esa diferencia era un bug que hacía la función inusable: el filtro
  // era `p.pide && !extra[p.pide.campo]`, así que al escribir el PRIMER carácter
  // `extra` se llenaba, la lista quedaba vacía y **el input se desmontaba a mitad
  // del tipeo**. Solo se podía pegar el valor entero de una sola vez, que es
  // exactamente lo que había pasado las veces que "funcionó".
  //
  // Quién pide el dato es el BACKEND (el paso trae su `pide`); que el user haya
  // empezado a escribir no es una respuesta a esa pregunta.
  const piden = pasos.filter((p) => p.pide);
  const faltan = piden.filter((p) => !extra[p.pide!.campo]);
  const cerNota = r?.cer_manual === true ? "cargado a mano" : copy.cer;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {!aplicado && (
        <button
          disabled={corriendo}
          onClick={() => simular(h.ticker, curva, false, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {corriendo ? "…" : copy.simular}
        </button>
      )}
      {ok && puedeAplicar && !aplicado && (
        <button
          onClick={() => simular(h.ticker, curva, true, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]"
        >
          {copy.aplicar}
        </button>
      )}
      {/* Un botón que DESAPARECE no explica nada: el que mira no sabe si falta
          cargar algo o si el agente lo frenó. Cuando la cadena bloquea, en su
          lugar va el motivo. */}
      {ok && !puedeAplicar && !aplicado && (
        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-neg)] text-[var(--t-neg)]">
          ✘ Bloqueado
        </span>
      )}
      {r && (
        <span className={`text-[9px] ${r.ok === false ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>
          {r.ok === false && String(r.error ?? "falló")}
          {ok && (
            <>
              {aplicado ? copy.hecho : ""}
              {/* En el ARREGLO lo que importa es el ANTES → DESPUÉS: ver solo el
                  resultado no dice si mejoró algo, que es toda la pregunta. */}
              {modo === "arreglo" && r.antes ? (() => {
                const a = r.antes as Record<string, unknown>;
                const t0 = typeof a.tea === "number" ? `${(a.tea as number * 100).toFixed(2)}%` : "sin TEA";
                const p0 = typeof a.paridad === "number" ? `${(a.paridad as number).toFixed(1)}%` : "—";
                return `HOY: TEA ${t0} · paridad ${p0} → `;
              })() : ""}
              {`${r.cupones ?? 0} cupones`}
              {/* Los YA PAGADOS, separados. 1816 manda el cronograma completo
                  desde la emisión, así que un bono de 2004 trae 60 cupones y de
                  los 60 se valúan 6: sin partir el número, el cuadro parece
                  otro bono. */}
              {typeof r.cupones_pagados === "number" && (r.cupones_pagados as number) > 0
                ? ` (${String(r.cupones_pagados)} ya pagados · ${String(r.cupones_futuros ?? 0)} futuros)`
                : ""}
              {` · vence ${String(r.vencimiento ?? "—")} · escala ${String(r.escala ?? "—")}`}
              {typeof r.cer_emision === "number"
                ? ` · CER emisión ${(r.cer_emision as number).toFixed(4)} (${cerNota})`
                : ""}
              {r.nota_cer ? ` · ${String(r.nota_cer)}` : ""}
              {tea !== null ? ` · TEA simulada ${(tea * 100).toFixed(2)}%` : ""}
              {/* De dónde salió el precio con el que se calculó esa TEA. Un bono
                  nuevo nunca tiene snapshot, así que sin decirlo el número se
                  leería como si viniera del mercado. */}
              {r.precio_fuente === "1816" ? " (precio de referencia 1816)" : ""}
              {r.nota_tasa ? ` · ${String(r.nota_tasa)}` : ""}
              {modo === "alta" && !aplicable && r.motivo_no_aplicable
                ? ` · ${String(r.motivo_no_aplicable)}`
                : ""}
              {aplicado && r.aviso ? ` · ${String(r.aviso)}` : ""}
            </>
          )}
        </span>
      )}
      {/* EL DATO QUE FALTA, PEDIDO ACÁ MISMO (user, 2026-08-17): «no podría ser
          acá mismo interactivo y que me pida el CER de emisión para continuar, y
          que rehaga la simulación con ese dato y si va todo bien ya lo aplique
          con eso». Antes había que aplicar a ciegas, ir a AVISOS, cargar el
          número y recién ahí enterarse de si la tasa cerraba. */}
      {ok && !aplicado && piden.length > 0 && (
        <div className="w-full mt-1 flex flex-wrap items-center gap-1.5 border-l-2 border-[#f59e0b] pl-2 py-1">
          {piden.map((p) => (
            <div key={p.clave} className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-widest text-[#f59e0b]">
                {p.pide!.label}
              </span>
              <input
                value={pedido[p.pide!.campo] ?? ""}
                onChange={(e) => setPedido((v) => ({ ...v, [p.pide!.campo]: e.target.value }))}
                onKeyDown={(e) => {
                  const n = Number(String((e.target as HTMLInputElement).value).replace(",", "."));
                  if (e.key === "Enter" && Number.isFinite(n) && n > 0) {
                    simular(h.ticker, curva, false, { [p.pide!.campo]: n }, modo);
                  }
                }}
                placeholder="0,0000"
                title={p.pide!.ayuda}
                inputMode={p.pide!.tipo === "numero" ? "decimal" : "text"}
                className="w-24 bg-transparent border border-[#f59e0b] px-1 py-0.5 text-[10px] text-[var(--t-text)] outline-none"
              />
              <span className="text-[9px] text-[var(--t-text-dim)]">{p.pide!.ayuda}</span>
              {faltan.includes(p) && (
                <span className="text-[9px] text-[#f59e0b]">← falta</span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Con el dato ya escrito, el botón deja de ser «simular» a secas: dice
          que va a rehacer la cuenta CON ese número. */}
      {ok && !aplicado && Object.keys(extra).length > 0 && (
        <button
          disabled={corriendo}
          onClick={() => simular(h.ticker, curva, false, extra, modo)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b] hover:text-black disabled:opacity-40"
        >
          {corriendo ? "…" : faltan.length ? "Simular con lo cargado" : "Simular con este dato"}
        </button>
      )}
      {/* El PASO A PASO. Aplicar sin ver la cadena entera es firmar a ciegas: el
          bono queda escrito y el síntoma de que algo faltó es una celda vacía
          tres días después. */}
      {ok && pasos.length > 0 && (
        <Chequeos
          pasos={pasos}
          veredicto={veredicto}
          calculo={Array.isArray(r?.calculo) ? (r.calculo as Insumo[]) : []}
        />
      )}
    </div>
  );
}

// ── El PRE-FLIGHT: la cadena completa antes de escribir ────────────────────
//
// Se muestran TODOS los pasos, también los que están en verde. Mostrar solo lo
// que falla obliga a confiar en que el resto se chequeó, que es exactamente lo
// que este cuadro viene a reemplazar.

type Paso = {
  n: number; clave: string; titulo: string; estado: string;
  detalle: string; tabla?: string; accion?: string;
  // Resueltos por el backend: `frena` = no se puede aplicar ni a mano;
  // `frena_auto` = no puede aplicarse SOLO. El front no reimplementa el criterio.
  frena?: boolean; frena_auto?: boolean;
  // Trabajo MANUAL que queda pendiente después de aplicar. No es un error.
  aviso?: string;
  // El dato se puede TIPEAR en la propia cadena y volver a simular con él, en
  // vez de aplicar a ciegas e ir a cargarlo a otra pantalla.
  pide?: { campo: string; label: string; tipo: string; ayuda: string } | null;
};

// El veredicto trae la DECISIÓN ya tomada, no los insumos para tomarla.
// `puede_aplicar` es para el humano; `puede_auto` es lo que va a leer la lane
// automática el día que exista — dos preguntas distintas y por eso dos campos.
type Veredicto = {
  estado: string; texto: string;
  puede_aplicar?: boolean; puede_auto?: boolean;
  conteo?: { ok: number; info: number; revisar: number; bloquea: number; no_se: number };
};

// Un insumo del cálculo: el número Y de dónde salió. El "de dónde" pesa tanto
// como el valor — cuando dos cuentas no coinciden, lo que hay que mirar es
// justamente el insumo que difiere.
type Insumo = { campo: string; valor: unknown; fuente: string };

// LOS CINCO ESTADOS, y cada uno significa UNA cosa (rediseño 2026-08-17). El
// modelo viejo metía en el mismo ámbar «la paridad se contradice» y «el alta va
// a sembrar la especie» — una prueba de que el bono está mal y un aviso de
// rutina, con el mismo triángulo. Ahora `info` es GRIS y deliberadamente
// apagado: no es un aviso, es contexto, y no debe competir por la atención con
// lo que sí decide.
const PASO_ICONO: Record<string, string> = {
  ok: "✔", bloquea: "✘", revisar: "▲", info: "○", no_se_puede_saber: "?",
};
const PASO_COLOR: Record<string, string> = {
  ok: "var(--t-pos)", bloquea: "var(--t-neg)", revisar: "#f59e0b",
  info: "var(--t-text-dim)", no_se_puede_saber: "var(--t-text-dim)",
};

function Chequeos({ pasos, veredicto, calculo }: {
  pasos: Paso[];
  veredicto?: Veredicto;
  calculo?: Insumo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [verCalculo, setVerCalculo] = useState(false);
  // El RESUMEN lo cuenta el backend (`veredicto.conteo`) — contarlo acá otra vez
  // sería la tercera copia del mismo criterio, que es cómo nacieron las dos
  // contradicciones que este rediseño arregla. El fallback local existe solo por
  // si el front queda deployado antes que el backend.
  const c = veredicto?.conteo ?? {
    ok: pasos.filter((p) => p.estado === "ok").length,
    info: pasos.filter((p) => p.estado === "info").length,
    revisar: pasos.filter((p) => p.estado === "revisar").length,
    bloquea: pasos.filter((p) => p.estado === "bloquea").length,
    no_se: pasos.filter((p) => p.estado === "no_se_puede_saber").length,
  };

  return (
    <div className="basis-full mt-1">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-baseline gap-1.5 text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
      >
        <span>{abierto ? "▾" : "▸"} Cadena completa</span>
        <span className="tabular-nums normal-case tracking-normal">
          <span style={{ color: "var(--t-pos)" }}>{c.ok} ok</span>
          {c.bloquea > 0 && <span className="text-[var(--t-neg)]"> · {c.bloquea} bloquea</span>}
          {c.revisar > 0 && <span style={{ color: "#f59e0b" }}> · {c.revisar} a revisar</span>}
          {c.no_se > 0 && <span className="text-[var(--t-text-dim)]"> · {c.no_se} sin verificar</span>}
          {c.info > 0 && <span className="text-[var(--t-text-dim)]"> · {c.info} informativos</span>}
        </span>
      </button>

      {veredicto && (
        <p className="text-[10px] leading-snug mt-0.5"
           style={{ color: PASO_COLOR[veredicto.estado] ?? "var(--t-text-muted)" }}>
          {veredicto.texto}
        </p>
      )}

      {/* CÓMO SE CALCULÓ. Una tasa sin su memoria de cálculo no se puede
          auditar: solo se puede creer o no creer. Acá está cada insumo con su
          fuente — que es lo que permite explicar una divergencia en vez de
          quedarse con "202 bps y no sé por qué". */}
      {(calculo?.length ?? 0) > 0 && (
        <div className="mt-0.5">
          <button
            onClick={() => setVerCalculo((v) => !v)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verCalculo ? "▾" : "▸"} Cómo se calculó
          </button>
          {verCalculo && (
            <div className="mt-1 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
              {calculo!.map((i) => (
                <div key={i.campo} className="grid grid-cols-[110px_1fr] gap-2 px-2 py-1 items-baseline">
                  <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">
                    {i.campo}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[10px] text-[var(--t-text)] tabular-nums">
                      {typeof i.valor === "number" ? i.valor.toLocaleString("es-AR", {
                        maximumFractionDigits: 6 }) : String(i.valor ?? "—")}
                    </span>
                    <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                      {i.fuente}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {abierto && (
        <ol className="mt-1 border-l border-[var(--t-border)] pl-2 space-y-1">
          {pasos.map((p) => (
            <li key={p.clave} className="grid grid-cols-[14px_1fr] gap-1.5 items-baseline">
              <span className="text-[10px] font-bold" style={{ color: PASO_COLOR[p.estado] }}>
                {PASO_ICONO[p.estado] ?? "·"}
              </span>
              <div className="min-w-0">
                <span className="text-[10px] text-[var(--t-text)]">{p.titulo}</span>
                {p.tabla && (
                  <span className="ml-1.5 text-[9px] font-mono text-[var(--t-text-dim)]">
                    {p.tabla}
                  </span>
                )}
                <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                  {p.detalle}
                </p>
                {p.accion && (
                  <p className="text-[10px] leading-snug" style={{ color: "#f59e0b" }}>
                    → {p.accion}
                  </p>
                )}
                {/* El aviso se distingue de la acción a propósito: la acción es
                    algo que hay que resolver ANTES, el aviso queda pendiente
                    DESPUÉS y se sigue desde la tab AVISOS. */}
                {p.aviso && (
                  <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                    ✎ queda en AVISOS: {p.aviso}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── TAB 3: el LIBRO — qué escribió, cuándo y dónde ─────────────────────────

// AVISOS — la contrapartida de "el agente hace el 95% y te deja el 5%".
//
// **Por qué esta tab existe** (user, 2026-08-17): el CER de emisión BLOQUEABA el
// alta. Era la decisión equivocada — el agente igual baja los flujos, resuelve
// los ejes, completa la ficha y siembra las especies; negarse a todo eso porque
// falta un número que ninguna fuente publica es tirar el trabajo hecho. *«A los
// CER les perdonamos: me lo deja sencillo, solo poner el CER de emisión y nada
// más.»*
//
// La lista se DERIVA en el backend contra el estado actual del master: cargás el
// dato y la fila se va sola. Sin botón de "resuelto", que es lo que convierte a
// toda lista de pendientes en un cementerio.
function TabAvisos({ avisos, resolver, completar }: {
  avisos: Aviso[];
  resolver: (id: number, deshacer: boolean) => void;
  completar: (id: number, valor: string) => void;
}) {
  const abiertos = avisos.filter((a) => !a.resuelto);
  const hechos = avisos.filter((a) => a.resuelto);

  if (avisos.length === 0) {
    return (
      <p className={SUB}>
        No hay nada pendiente de carga manual. Los avisos aparecen cuando doy de
        alta un bono al que le falta un dato que no puedo sacar de ningún lado.
      </p>
    );
  }

  const fila = (a: Aviso) => (
    <FilaAviso key={a.id} a={a} resolver={resolver} completar={completar} />
  );

  return (
    <div className="space-y-2">
      <p className={SUB}>
        Di de alta estos bonos, pero les falta un dato que ninguna fuente publica.
        <strong className="text-[var(--t-text)]"> Cargalo acá mismo</strong> y el
        aviso se cierra solo — el valor va al master y queda listo para simular.
      </p>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
            <th className="py-1 pr-3">Bono</th>
            <th className="py-1 pr-3">Qué hacer</th>
            <th className="py-1 pr-3">Cargar el dato</th>
            <th className="py-1 pr-3">Por qué importa</th>
            <th />
          </tr>
        </thead>
        <tbody>{abiertos.map(fila)}</tbody>
      </table>
      {hechos.length > 0 && (
        <>
          <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] pt-2">
            Ya hechos ({hechos.length})
          </p>
          <table className="w-full text-[10px]"><tbody>{hechos.map(fila)}</tbody></table>
        </>
      )}
    </div>
  );
}

// UNA fila = un pendiente + su formulario. El input vive acá y no en el padre
// para que cada aviso tenga su propio estado: un solo `valor` compartido haría
// que escribir en uno pisara lo tipeado en otro.
function FilaAviso({ a, resolver, completar }: {
  a: Aviso;
  resolver: (id: number, deshacer: boolean) => void;
  completar: (id: number, valor: string) => void;
}) {
  const [valor, setValor] = useState("");
  return (
    <tr className={`border-t border-[var(--t-border)] ${a.resuelto ? "opacity-45" : ""}`}>
      <td className="py-1 pr-3 font-semibold text-[var(--t-text)]">{a.ticker}</td>
      <td className="py-1 pr-3" style={{ color: a.resuelto ? undefined : "#f59e0b" }}>
        {a.que_hacer}
        {/* El contraste con el master. Marcar hecho es una afirmación del user;
            esto dice si el dato REALMENTE está. Sin este cruce, un aviso cerrado
            sobre un dato ausente mentiría en silencio — que es exactamente el
            riesgo de dejar que el cierre sea manual. */}
        {a.resuelto && a.ya_cargado === false && (
          <span className="ml-1.5 text-[var(--t-neg)]">⚠ el dato sigue faltando</span>
        )}
        {!a.resuelto && a.ya_cargado === true && (
          <span className="ml-1.5" style={{ color: "var(--t-pos)" }}>
            ✔ ya está cargado — podés marcarlo
          </span>
        )}
      </td>
      <td className="py-1 pr-3 text-[var(--t-text-muted)]">
        {/* El dato se escribe DONDE se lee el aviso. Antes esta celda decía
            «Manager → Títulos» y te mandaba a otra pantalla a buscar el bono:
            el agente hacía el 95% y el 5% quedaba a tres clics de distancia. */}
        {a.campo && !a.resuelto ? (
          <div className="flex items-center gap-1">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valor.trim()) completar(a.id, valor.trim());
              }}
              placeholder={a.campo.label}
              title={a.campo.ayuda}
              inputMode={a.campo.tipo === "numero" ? "decimal" : "text"}
              className="w-28 bg-transparent border border-[var(--t-border)] px-1 py-0.5 text-[10px] text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
            />
            <button
              disabled={!valor.trim()}
              onClick={() => completar(a.id, valor.trim())}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] disabled:opacity-30 disabled:border-[var(--t-border)] disabled:text-[var(--t-text-dim)]"
            >
              Guardar
            </button>
          </div>
        ) : (
          a.donde
        )}
      </td>
      <td className="py-1 pr-3 text-[var(--t-text-dim)]">{a.por_que}</td>
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onClick={() => resolver(a.id, a.resuelto)}
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        >
          {a.resuelto ? "Reabrir" : "Marcar hecho"}
        </button>
      </td>
    </tr>
  );
}

function TabHizo({ acciones }: { acciones: Accion[] }) {
  if (acciones.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        Todavía no escribí nada. Acá va a quedar cada cosa que toque, con la fecha,
        la hora, la tabla y quién me lo pidió.
      </p>
    );
  }
  return (
    <div>
      <p className={`${SUB} mb-1.5`}>
        Todo lo que escribí, lo más reciente primero. Incluye los intentos que
        fallaron — un libro que solo anota los éxitos esconde justo lo que uno
        quiere investigar.
      </p>
      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        <div className="grid grid-cols-[110px_170px_90px_1fr] gap-2 px-2 py-1 bg-[var(--t-surface)] text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          <span>Cuándo</span><span>Qué hizo</span><span>Sobre</span><span>Dónde escribió</span>
        </div>
        {acciones.map((a) => (
          <div
            key={a.id}
            className={`grid grid-cols-[110px_170px_90px_1fr] gap-2 px-2 py-1 items-baseline ${
              a.ok ? "" : "bg-[var(--t-surface)]"}`}
          >
            <span className="text-[10px] tabular-nums text-[var(--t-text-muted)]">
              {fechaHora(a.ts)}
            </span>
            <span className="text-[10px] text-[var(--t-text)]">
              {!a.ok && <span className="text-[var(--t-neg)] font-bold">✘ </span>}
              {ACCION_LABEL[a.accion] ?? a.accion}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-[var(--t-text)]">
              {a.objetivo}
            </span>
            <div className="min-w-0">
              {/* La TABLA que se tocó, en crudo: es lo que uno necesita para ir a
                  mirarla, y traducirla a lenguaje humano la haría inservible
                  para eso. */}
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
                {a.destino}
              </span>
              <div className="text-[9px] text-[var(--t-text-dim)] truncate"
                   title={JSON.stringify(a.detalle ?? {})}>
                {a.por || "—"}
                {a.pregunta_id ? ` · pregunta #${a.pregunta_id}` : ""}
                {a.error ? ` · ${a.error}` : ""}
                {a.detalle && Object.keys(a.detalle).length > 0
                  ? ` · ${JSON.stringify(a.detalle)}`
                  : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TAB 4: lo ya decidido (y cómo deshacerlo) ──────────────────────────────

function TabDecidido({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  // Lo contestado que todavía NO surtió efecto va PRIMERO y a lo ancho: es la
  // pregunta que el user se hace al volver ("¿qué pasó con las altas que
  // contesté?"), y estaba solo como una línea gris en el historial.
  const pend = data.pendientes ?? [];
  const porResp: Record<string, Pendiente[]> = {};
  for (const p of pend) (porResp[p.respuesta ?? "?"] ??= []).push(p);
  return (
    <div className="flex flex-col gap-5">
      {pend.length > 0 && (
        <section className="border border-[var(--t-tint-amber)] bg-[var(--t-surface)] px-3 py-2">
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={TITULO}>ESPERANDO QUE PUEDA APLICARLAS</h3>
            <span className={SUB}>{pend.length} · ya las contestaste</span>
          </div>
          {Object.entries(porResp).map(([resp, filas]) => (
            <div key={resp} className="mt-1">
              <div className="text-[10px] text-[var(--t-text)]">
                <strong className="uppercase tracking-widest">{resp}</strong>
                <span className="text-[var(--t-text-dim)]"> ({filas.length}): </span>
                <span className="tabular-nums">
                  {filas.map((f) => f.ticker).sort().join(", ")}
                </span>
              </div>
              {resp === "alta" && (
                <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
                  Falta E2: dar de alta necesita bajar el cuadro de flujos de 1816 y
                  simular la TEA antes de escribir. Estas son las que va a procesar.
                </p>
              )}
            </div>
          ))}
        </section>
      )}
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
    </div>
  );
}
