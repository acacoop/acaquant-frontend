"use client";

// Tab SKILLS: el catálogo de habilidades + la medición del eval set.
import { useState } from "react";
import { useDatos, useRecurso } from "@/components/av-agent/datos";
import { Chequeos } from "@/components/av-agent/piezas";
import { Sabe, Skill, SkillsVista, SUB,
         EvalResumen, Paso } from "@/components/av-agent/tipos";

export function TabSkills() {
  // El catálogo y LA MEDICIÓN son recursos de la capa: se cargan la primera
  // vez y sobreviven al cambio de tab (antes cada visita los volvía a pedir y
  // el desmontaje los tiraba). Si una lectura falla la tab queda vacía, no
  // rota — la capa conserva el error aparte.
  //
  // La medición va al lado del catálogo y no en una tab nueva a propósito:
  // SKILLS es «lo que el agente sabe hacer», y **cuánto acierta es un atributo
  // de eso**, no un tablero aparte. Separarlos dejaría el catálogo prometiendo
  // capacidades sin decir cuáles funcionan.
  const { dato: v } = useRecurso<SkillsVista>("skills");
  const { dato: ev } = useRecurso<EvalResumen>("evaluacion");
  const [dom, setDom] = useState<string>("");

  // ── LA JERARQUÍA ────────────────────────────────────────────────────────
  //
  // Pedido del user: *«necesito que en SKILLS haya jerarquías de habilidades:
  // MERCADO, ADMINISTRATIVO, SEGURIDAD…»*.
  //
  // **El DOMINIO es el nivel 1 y el tipo pasa a ser una etiqueta de la fila.**
  // El tipo (detecta / explica / resuelve) dice CÓMO trabaja; el dominio dice
  // SOBRE QUÉ — y esa es la pregunta que uno se hace primero. Agrupado por tipo,
  // para saber qué sabe el agente de seguridad había que leer las 37 filas.
  const TIPO_CHIP: Record<string, string> = {
    detectar: "DETECTA", explicar: "EXPLICA", resolver: "RESUELVE",
  };
  const TIPO_TITLE: Record<string, string> = {
    detectar: "corre sin que nadie lo pida y aparece en ENCONTRÓ",
    explicar: "reproduce el cálculo paso a paso, con la fuente a la vista",
    resolver: "propone el arreglo, lo aplica con tu OK y lo verifica",
  };
  const grupos: [string, Skill[]][] = (v?.dominios ?? []).map(
    (d) => [d, v?.por_dominio?.[d] ?? []] as [string, Skill[]]);
  // El dominio elegido. Cae al primero solo si el guardado ya no existe — un
  // dominio que desaparece dejaría la lista vacía sin motivo aparente.
  const domOk = dom && grupos.some(([d]) => d === dom) ? dom : (grupos[0]?.[0] ?? "");

  // QUÉ REGLAS emite cada skill, para poder cruzarla con su medición. Sale del
  // `extra` que ya manda el backend; si no lo trae, no se inventa: la fila
  // muestra «—» y eso es honesto.
  const reglasDe = (sk: Skill): string[] => {
    const r = sk.extra?.reglas;
    if (Array.isArray(r)) return r.map(String);
    const c = sk.extra?.control;
    return typeof c === "string" ? [c] : [];
  };

  // La medición AGREGADA por dominio, para el número que va debajo de cada
  // pestaña. Se calcula acá y no en el backend porque el dominio de una skill y
  // el dominio de un voto son la misma taxonomía pero viven en dos registros —
  // cruzarlos server-side pediría una tabla más para un número de display.
  const medPorDominio: Record<string, { votos: number; aciertos: number;
                                        humanos: number }> = {};
  for (const [d, items] of grupos) {
    const reglas = new Set(items.flatMap(reglasDe));
    const cs = (ev?.causas ?? []).filter((c) => reglas.has(c.causa));
    if (!cs.length) continue;
    medPorDominio[d] = {
      votos: cs.reduce((a, c) => a + c.votos, 0),
      aciertos: cs.reduce((a, c) => a + c.aciertos, 0),
      humanos: cs.reduce((a, c) => a + c.humanos, 0),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      {/* EL RECUENTO DE IA. Es el número que contesta «¿cuánto de esto es IA de
          verdad?» sin discutir — contarlas todas como IA infla lo que el modelo
          hace, contarlas como no-IA esconde dónde hay que mirar. */}
      {v && (
        <div className="flex flex-wrap items-baseline gap-3 border border-[var(--t-border)] px-2.5 py-1.5">
          <span className="text-[11px] text-[var(--t-text)]">
            <strong className="tabular-nums">{v.total}</strong> habilidades
          </span>
          <span className={SUB}>
            <span className="text-[var(--t-pos)]">{v.ia.no}</span> sin IA ·{" "}
            <span style={{ color: "#f59e0b" }}>{v.ia.opcional}</span> con IA
            opcional ·{" "}
            <span style={{ color: "#f59e0b" }}>{v.ia.si}</span> dependen del modelo
          </span>
          <span className={`${SUB} ml-auto`}>
            lo que encuentro lo encuentra una función, no el modelo
          </span>
        </div>
      )}

      {/* ── LOS DOMINIOS, COMO MENÚ HORIZONTAL ─────────────────────────────
          Pedido del user: *«quiero las skills main una al lado de la otra a
          nivel horizontal como si fuesen el menú de opciones, así quedan
          fácilmente visibles, y abajo se muestran las funciones dentro de cada
          una»*.

          Antes eran cinco secciones apiladas: para saber qué sabe el agente de
          SEGURIDAD había que scrollear las 40 filas. Con el menú, los cinco
          dominios se ven de una y **se mira uno por vez**, que es como uno
          consulta un catálogo. */}
      {grupos.length > 0 && (
        <div className="flex items-stretch flex-wrap border-b border-[var(--t-border)] -mt-1">
          {grupos.map(([d, items]) => {
            const m = medPorDominio[d];
            return (
              <button
                key={d}
                onClick={() => setDom(d)}
                className={`px-3 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px transition-colors ${
                  domOk === d
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
              >
                {d}
                <span className="ml-1.5 tabular-nums opacity-60">{items.length}</span>
                {/* LOS ACIERTOS, DEBAJO DEL TÍTULO. El user lo pidió así y tiene
                    sentido: la precisión es un atributo del dominio, no una
                    tabla aparte que hay que ir a cruzar a mano. */}
                <span className="block text-[8px] font-normal tracking-normal tabular-nums"
                      style={{ color: m && m.humanos >= (ev?.min_votos ?? 10)
                        ? "var(--t-pos)" : m ? "#f59e0b" : "var(--t-text-dim)" }}>
                  {m ? `${m.aciertos}/${m.votos}${m.humanos ? "" : " ·d"}` : "sin votos"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Las funciones del dominio elegido. Una línea por skill: nombre, qué
          hace, si usa IA y su medición. **Sin títulos ni párrafos repetidos** —
          el user: *«evitar títulos constantes, texto por todo»*. */}
      <ul className="border border-[var(--t-border)] divide-y divide-[var(--t-border)] -mt-3">
        {(v?.por_dominio?.[domOk] ?? []).map((s) => {
          const m = ev?.causas.filter((c) => reglasDe(s).includes(c.causa)) ?? [];
          const votos = m.reduce((a, c) => a + c.votos, 0);
          const ok = m.reduce((a, c) => a + c.aciertos, 0);
          return (
            <li key={s.id}
                className="grid grid-cols-[64px_minmax(0,1fr)_auto_58px] items-baseline gap-2 px-2 py-1">
              <span className="text-[8px] font-semibold tracking-widest text-[var(--t-text-dim)]"
                    title={TIPO_TITLE[s.tipo ?? ""] ?? ""}>
                {TIPO_CHIP[s.tipo ?? ""] ?? s.tipo}
              </span>
              <span className="min-w-0">
                <span className="text-[11px] font-semibold text-[var(--t-text)]">
                  {s.nombre}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)]"
                      title={typeof s.extra?.cada === "string" ? s.extra.cada : ""}>
                  {" — "}{s.que_hace}
                </span>
              </span>
              {/* IA por FEATURE, como pidió el user: en cada fila y no en una
                  leyenda. Si hay que ir a buscar qué significa un color, no se
                  mira. */}
              <span className="text-[8px] uppercase tracking-widest whitespace-nowrap"
                    style={{ color: s.usa_ia === "no"
                      ? "var(--t-text-dim)" : "#f59e0b" }}
                    title={s.para_que_la_ia || "no usa el modelo"}>
                {s.usa_ia === "no" ? "función"
                  : s.usa_ia === "opcional" ? "IA opc" : "IA"}
              </span>
              <span className="text-[9px] tabular-nums text-right"
                    style={{ color: votos ? "var(--t-text-muted)" : "var(--t-text-dim)" }}
                    title={votos ? `${ok} de ${votos} votos` : "todavía sin votar"}>
                {votos ? `${ok}/${votos}` : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* DÓNDE SE EQUIVOCA. Es la mitad del valor del eval set y la que se suele
          tirar: un ✖ con motivo dice qué regla hay que reescribir. Va al final y
          solo si hay algo. */}
      {ev?.ok && ev.fallos.length > 0 && (
        <div>
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-neg)]">
            se equivocó ({ev.fallos.length})
          </span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {ev.fallos.slice(0, 6).map((f, i) => (
              <li key={i} className="text-[10px] text-[var(--t-text-muted)]">
                <span className="font-semibold text-[var(--t-text)]">{f.caso}</span>
                {" · dijo "}{f.causa_dicha}
                {f.causa_correcta ? ` · era ${f.causa_correcta}` : ""}
                {f.nota ? ` · ${f.nota}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ev && !ev.ok && (
        <span className="text-[10px] text-[var(--t-neg)]">
          No pude leer la medición — <strong>no es que no haya votos</strong>, es
          que no se pudo preguntar.
        </span>
      )}

      {/* PREGUNTARLE. Vive abajo del registro a propósito: primero se ve TODO lo
          que sabe, y después se usa la parte que hoy es interactiva. */}
      <div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
            PREGUNTALE
          </span>
          <span className={SUB}>
            los números los calculo yo, de la misma fuente que usa la app
          </span>
        </div>
        <Preguntale />
      </div>
    </div>
  );
}

export function Preguntale() {
  // El catálogo es un recurso de la capa (sobrevive al cambio de tab); lo
  // elegido, el sujeto y la respuesta son estado de PANTALLA y quedan acá.
  const { leer, llamar } = useDatos();
  const { dato: sabe } = useRecurso<{ catalogo?: Sabe[] }>("sabe");
  const cat = sabe?.catalogo ?? [];
  const [elegido, setElegido] = useState<Sabe | null>(null);
  const [sujeto, setSujeto] = useState("");
  const [opciones, setOpciones] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<{
    ok: boolean; error?: string; frase?: string; discrepancia?: string;
    pasos?: Paso[]; pregunta?: string;
  } | null>(null);

  const elegir = async (e: Sabe) => {
    setElegido(e);
    setRes(null);
    setSujeto("");
    setOpciones([]);
    if (!e.necesita) return;
    try {
      const r = await leer<{ sugerencias?: string[] }>(
        `/api/ia/av-agent/explicar?explicador=${encodeURIComponent(e.id)}`);
      setOpciones(r.sugerencias ?? []);
    } catch { /* sin sugerencias se escribe a mano */ }
  };

  const preguntar = async () => {
    if (!elegido) return;
    setCargando(true);
    setRes(null);
    try {
      // `llamar` y no `escribir`: explicar CALCULA, no muta nada.
      setRes(await llamar("/api/ia/av-agent/explicar",
                          { explicador: elegido.id, sujeto }));
    } catch (e) {
      setRes({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    setCargando(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {cat.map((e) => (
          <button
            key={e.id}
            onClick={() => void elegir(e)}
            className={`text-left px-2.5 py-1.5 border transition-colors ${
              elegido?.id === e.id
                ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10"
                : "border-[var(--t-border)] hover:border-[var(--t-accent)]"
            }`}
          >
            <span className="text-[11px] text-[var(--t-text)]">{e.pregunta}</span>
            <span className="block text-[9px] text-[var(--t-text-dim)]">
              {e.de_donde}
            </span>
          </button>
        ))}
      </div>

      {elegido && (
        <div className="flex flex-wrap items-center gap-1.5">
          {elegido.necesita === "ticker" && (
            <input
              value={sujeto}
              onChange={(ev) => setSujeto(ev.target.value.toUpperCase())}
              list="av-sabe-opciones"
              placeholder="ticker (ej. AL30)"
              className="text-[10px] bg-transparent border border-[var(--t-border)] px-1.5 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none w-[150px]"
            />
          )}
          <datalist id="av-sabe-opciones">
            {opciones.map((o) => <option key={o} value={o} />)}
          </datalist>
          <button
            disabled={cargando || (!!elegido.necesita && !sujeto.trim())}
            onClick={() => void preguntar()}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
          >
            {cargando ? "calculando…" : "contestame"}
          </button>
        </div>
      )}

      {res && !res.ok && (
        <p className="text-[10px] text-[var(--t-neg)]">{res.error ?? "no pude"}</p>
      )}

      {res?.ok && (
        <div className="flex flex-col gap-2">
          {/* LA FRASE. La escribe el modelo sobre números que ya salieron del
              cálculo — si no hay modelo, no aparece y los pasos siguen ahí. */}
          {res.frase && (
            <p className="text-[12px] leading-snug text-[var(--t-text)] border-l-2 border-[var(--t-accent)] pl-2">
              {res.frase}
            </p>
          )}
          {/* LA DISCREPANCIA va SEPARADA y en rojo: es lo único de acá que no es
              una explicación sino un aviso, y la frase no la puede tapar. */}
          {res.discrepancia && (
            <p className="text-[11px] leading-snug text-[var(--t-neg)] border border-[var(--t-neg)] px-2 py-1">
              {res.discrepancia}
            </p>
          )}
          <Chequeos pasos={res.pasos ?? []} />
        </div>
      )}
    </div>
  );
}
