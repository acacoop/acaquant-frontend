"use client";

// AV AGENT (/av-agent) — la cara del primer agente de ACAquant.
//
// Doc madre: docs/AV_AGENT.md (backend). El agente compara `mercado.curvas`
// contra 1816, encuentra huecos y errores, y PREGUNTA lo que no puede decidir
// solo. Esta vista es donde esa conversación pasa.
//
// Tres decisiones de diseño, y ninguna es cosmética:
//
// 1. LAS PREGUNTAS VAN PRIMERO Y SON EL DEFAULT. Los hallazgos son informativos;
//    las preguntas son lo único que el agente NO puede resolver sin la mesa. Una
//    pantalla que abre en la lista de 64 problemas hace que las 27 preguntas
//    queden abajo y sin contestar — y sin respuestas el agente no aprende nada.
//
// 2. EL AGENTE HABLA EN PRIMERA PERSONA. No es cosmética: un tablero de métricas
//    no se contesta, una pregunta sí. La diferencia entre "hallazgos: 24" y
//    "encontré 24 bonos que no tenés, ¿cuáles te interesan?" es si el usuario
//    entiende que le toca hacer algo.
//
// 3. DICE LO QUE NO PUEDE HACER. `capacidades.puede_dar_de_alta` viene del
//    backend: hoy responder "alta" GUARDA la decisión pero no da de alta nada
//    (eso es E2). Sin decirlo, el botón se lee como roto.
//
// El front NO calcula nada: severidades, agrupaciones, motivos y capacidades
// vienen resueltos del backend. Backend: /api/ia/av-agent/* (lectura módulo
// `ia`; responder y deshacer, admin).

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "@/lib/fetch-json";

// ── Contrato /api/ia/av-agent/vista ────────────────────────────────────────
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

const SEV_COLOR: Record<string, string> = {
  alta: "var(--t-neg)",
  media: "var(--t-warn, #b45309)",
  baja: "var(--t-text-muted)",
};

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

type Tab = "preguntas" | "hallazgos" | "decidido";

export function AvAgentView() {
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
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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
      // POST y no DELETE: el proxy catch-all de /api/ia expone solo GET y POST,
      // y agregarle DELETE lo habilitaría para TODOS los endpoints de IA a
      // cambio de la elegancia REST de uno solo.
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

  if (error && !data) return <div className="p-6 text-[12px] text-[var(--t-neg)]">{error}</div>;
  if (!data) return <div className="p-6 text-[12px] text-[var(--t-text-muted)]">Cargando…</div>;

  const nPreg = data.preguntas.length + data.decisiones.length;
  const nHall = data.hallazgos.length;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Barra: qué hizo y cuándo. Un dato de una foto SIN su fecha es un dato
          que miente en silencio. */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-brand)]">
        <span className="text-[12px] font-semibold text-white tracking-wide">AV AGENT</span>
        <span className="text-[10px] text-white/70">
          Última revisión {haceCuanto(data.corrida_at)} · {nHall} hallazgos · {nPreg} preguntas
        </span>
        <button
          onClick={() => void cargar()}
          className="ml-auto text-[10px] px-2 py-1 border border-white/30 text-white/90 hover:bg-white/10"
        >
          ACTUALIZAR
        </button>
      </div>

      {error && (
        <div className="shrink-0 px-3 py-1.5 text-[11px] text-[var(--t-neg)] border-b border-[var(--t-border)]">
          {error}
        </div>
      )}

      <div className="shrink-0 flex gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)]">
        {([
          ["preguntas", `ME PREGUNTA (${nPreg})`],
          ["hallazgos", `ENCONTRÓ (${nHall})`],
          ["decidido", `YA DECIDIDO (${data.decididas.length})`],
        ] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-[10px] px-2.5 py-1 border tracking-wide ${
              tab === k
                ? "border-[var(--t-brand)] bg-[var(--t-brand)] text-white"
                : "border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {tab === "preguntas" && (
          <Preguntas
            data={data} enviando={enviando} notas={notas}
            setNota={(id, v) => setNotas((n) => ({ ...n, [id]: v }))}
            responder={responder}
          />
        )}

        {tab === "hallazgos" && (
          <div className="flex flex-col gap-4">
            {nHall === 0 && (
              <p className="text-[12px] text-[var(--t-text-muted)]">
                No encontré nada. Si nunca corrí, la lista está vacía porque no miré —
                no porque esté todo bien.
              </p>
            )}
            {Object.entries(porTipo).map(([tipo, hs]) => (
              <section key={tipo}>
                <h3 className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
                  {TIPO_LABEL[tipo] ?? tipo} ({hs.length})
                </h3>
                <div className="border border-[var(--t-border)] bg-[var(--t-panel)] divide-y divide-[var(--t-border)]">
                  {hs.map((h, i) => (
                    <div key={`${h.ticker}-${h.regla}-${i}`} className="px-2.5 py-1.5 flex gap-2.5">
                      <span
                        className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: SEV_COLOR[h.severidad] ?? "var(--t-text-muted)" }}
                        title={h.severidad}
                      />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12px] font-semibold text-[var(--t-text)] tabular-nums">
                            {h.ticker}
                          </span>
                          <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                            {h.regla}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--t-text-muted)]">{h.motivo}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === "decidido" && (
          <Decidido data={data} designorar={designorar} />
        )}
      </div>
    </div>
  );
}

// ── Las preguntas ──────────────────────────────────────────────────────────

function Preguntas({ data, enviando, notas, setNota, responder }: {
  data: Vista;
  enviando: number | null;
  notas: Record<number, string>;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
}) {
  const nada = data.preguntas.length === 0 && data.decisiones.length === 0;
  if (nada) {
    return (
      <p className="text-[12px] text-[var(--t-text-muted)]">
        No tengo nada que preguntarte. Cuando encuentre un bono nuevo que no sepa
        si te interesa, te lo voy a preguntar acá.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {data.decisiones.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
            Cómo querés que trabaje ({data.decisiones.length})
          </h3>
          <p className="text-[10px] text-[var(--t-text-muted)] mb-1.5">
            Estas definen mi comportamiento. No corren apuro — pero mientras no las
            contestes uso el default y te lo aviso.
          </p>
          <div className="flex flex-col gap-1.5">
            {data.decisiones.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} />
            ))}
          </div>
        </section>
      )}

      {data.preguntas.length > 0 && (
        <section>
          <h3 className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
            Sobre lo que encontré ({data.preguntas.length})
          </h3>
          <p className="text-[10px] text-[var(--t-text-muted)] mb-1.5">
            Lo que no contestes queda abierto y <strong>no te lo vuelvo a preguntar</strong>.
            {!data.capacidades.puede_dar_de_alta && (
              <> Ojo: <strong>«alta» todavía no da de alta nada</strong> — {data.capacidades.motivo_alta}</>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            {data.preguntas.map((p) => (
              <Tarjeta key={p.id} p={p} enviando={enviando} nota={notas[p.id] ?? ""}
                       setNota={setNota} responder={responder} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Tarjeta({ p, enviando, nota, setNota, responder }: {
  p: Pregunta;
  enviando: number | null;
  nota: string;
  setNota: (id: number, v: string) => void;
  responder: (id: number, respuesta: string) => void;
}) {
  const ocupado = enviando === p.id;
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2.5 py-2">
      <p className="text-[12px] text-[var(--t-text)] leading-snug">{p.pregunta}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {p.opciones.map((o) => (
          <button
            key={o}
            disabled={ocupado}
            onClick={() => responder(p.id, o)}
            className="text-[10px] uppercase tracking-wide px-2.5 py-1 border border-[var(--t-border)] text-[var(--t-text)] hover:border-[var(--t-brand)] hover:text-[var(--t-brand)] disabled:opacity-40"
          >
            {o}
          </button>
        ))}
        {/* El POR QUÉ no es burocracia: es lo que el agente va a usar para dejar
            de proponer cosas parecidas. Por eso está al lado de los botones y no
            escondido detrás de un "agregar nota". */}
        <input
          value={nota}
          onChange={(e) => setNota(p.id, e.target.value)}
          placeholder="¿por qué? (opcional, pero me sirve para aprender)"
          className="flex-1 min-w-[200px] text-[10px] px-2 py-1 bg-transparent border border-[var(--t-border)] text-[var(--t-text)] placeholder:text-[var(--t-text-muted)]"
        />
      </div>
    </div>
  );
}

// ── Lo ya decidido (y cómo deshacerlo) ─────────────────────────────────────

function Decidido({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
          Los que dijiste que no te interesan ({data.ignorados.length})
        </h3>
        <p className="text-[10px] text-[var(--t-text-muted)] mb-1.5">
          No los vuelvo a proponer. Si te arrepentís, DESHACER los devuelve a la lista.
        </p>
        {data.ignorados.length === 0 ? (
          <p className="text-[11px] text-[var(--t-text-muted)]">Ninguno todavía.</p>
        ) : (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] divide-y divide-[var(--t-border)]">
            {data.ignorados.map((ig) => (
              <div key={ig.ticker} className="px-2.5 py-1.5 flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--t-text)] tabular-nums w-20">
                  {ig.ticker}
                </span>
                <span className="text-[11px] text-[var(--t-text-muted)] flex-1 min-w-0 truncate"
                      title={ig.motivo}>
                  {ig.motivo}
                </span>
                <button
                  onClick={() => designorar(ig.ticker)}
                  className="text-[9px] uppercase tracking-wide px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                >
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-wide text-[var(--t-text-muted)] mb-1">
          Historial de respuestas ({data.decididas.length})
        </h3>
        {data.decididas.length === 0 ? (
          <p className="text-[11px] text-[var(--t-text-muted)]">Todavía no contestaste nada.</p>
        ) : (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] divide-y divide-[var(--t-border)]">
            {data.decididas.map((d) => (
              <div key={d.id} className="px-2.5 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--t-text)]">
                    {d.respuesta}
                  </span>
                  <span className="text-[11px] text-[var(--t-text-muted)] truncate">
                    {d.pregunta}
                  </span>
                </div>
                <div className="text-[9px] text-[var(--t-text-muted)]">
                  {d.respondida_por || "—"} · {haceCuanto(d.respondida_at)}
                  {/* aplicada_at NULL = la respuesta se guardó pero no surtió
                      efecto todavía. Decirlo es lo que evita que el usuario crea
                      que un bono ya está dado de alta cuando no lo está. */}
                  {!d.aplicada_at && " · guardado, todavía sin aplicar"}
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
