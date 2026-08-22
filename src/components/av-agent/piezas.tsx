"use client";

// Piezas COMPARTIDAS entre tabs del AV Agent (Chequeos la usan SKILLS y
// ENCONTRÓ). Nada acá toca la red por su cuenta: todo pasa por la capa.
import { useState } from "react";
import { useDatos } from "@/components/av-agent/datos";
import { SUB, Paso, Propuesta, Veredicto, Insumo,
         PASO_ICONO, PASO_COLOR, Respuesta, cuando } from "@/components/av-agent/tipos";

export function PanelHacer({ h }: { h: NonNullable<Paso["hacer"]> }) {
  const { leer, llamar, escribir } = useDatos();
  const [props, setProps] = useState<Propuesta[] | null>(null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [marcadas, setMarcadas] = useState<Record<number, boolean>>({});
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState("");
  const [resultados, setResultados] = useState<
    { id: number; sujeto: string; ok: boolean; detalle?: string; error?: string }[]
  >([]);

  const cargar = async (proponer: boolean) => {
    setOcupado(proponer ? "proponiendo" : "cargando");
    setMsg("");
    try {
      // Un solo tipo para las dos rutas: PROPONER agrega `ok`/`error`, LISTAR no
      // los manda. Tipar la unión obligaba a estrechar por `"ok" in r`, y ahí
      // TypeScript pierde `error` — un tipo con los dos campos opcionales dice
      // lo mismo y se lee.
      // PROPONER escribe filas de propuesta (pero nada que la vista dibuje:
      // se relee acá abajo con `setProps`); LISTAR es una lectura.
      const r = await (proponer
        ? llamar<Respuesta>("/api/ia/av-agent/hacer/proponer",
                            { accion: h.accion })
        : leer<Respuesta>(
            `/api/ia/av-agent/hacer?accion=${encodeURIComponent(h.accion)}`));
      // El mensaje se arma en una variable LOCAL y se setea una sola vez al
      // final: `msg` leído acá dentro sería el del render anterior (el estado no
      // se actualiza en el medio de la función), y con eso un error viejo tapaba
      // el «no encontré nada» del pedido nuevo.
      let aviso = r.ok === false ? `✘ ${r.error ?? "falló"}` : "";
      const lista = r.pendientes ?? [];
      setProps(lista);
      // Todas marcadas por default: el caso normal es aceptar lo que propuso, y
      // obligar a tildar veinte casillas convierte una acción de un clic en
      // trabajo manual — justo lo que esto vino a sacar.
      setMarcadas(Object.fromEntries(lista.map((p) => [p.id, true])));
      setValores(Object.fromEntries(lista.map((p) => [p.id, p.propuesto])));
      if (proponer && lista.length === 0 && !aviso) {
        aviso = "no encontré nada que pueda proponer con certeza.";
      }
      setMsg(aviso);
    } catch (e) {
      setMsg(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setOcupado("");
  };

  const elegidas = (props ?? []).filter((p) => marcadas[p.id]);

  const mandar = async (ruta: "aplicar" | "rechazar") => {
    setOcupado(ruta);
    setMsg("");
    try {
      const body: Record<string, unknown> = { ids: elegidas.map((p) => p.id) };
      if (ruta === "aplicar") {
        body.valores = Object.fromEntries(
          elegidas.map((p) => [String(p.id), (valores[p.id] ?? "").trim()]));
      }
      // APLICAR muta datos que ENCONTRÓ dibuja → relee la vista por contrato;
      // rechazar solo cambia la lista local de propuestas.
      const r = await escribir<{
        ok: boolean; error?: string; texto?: string;
        resultados?: { id: number; sujeto: string; ok: boolean;
                       detalle?: string; error?: string }[];
      }>(`/api/ia/av-agent/hacer/${ruta}`, body,
         ruta === "aplicar" ? ["vista"] : []);
      setMsg(r.ok ? (r.texto ?? "listo") : `✘ ${r.error ?? "falló"}`);
      setResultados(r.resultados ?? []);
      if (r.ok) await cargar(false);   // la lista se relee: lo aplicado ya no espera OK
    } catch (e) {
      setMsg(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setOcupado("");
  };

  // ⚠️ **LO YA AVISADO CAMBIA EL BOTÓN, NO SOLO EL TEXTO.** El user (2026-08-22):
  // *«yo antes ya le mandé el mail pero no me dice AVISADO A LA PERSONA… dice IR
  // A ARREGLARLO, esperando… no es claro»*. Con el mensaje esperando en la
  // bandeja del otro, un botón que dice «qué proponés» invita a mandar de nuevo
  // exactamente lo mismo — y un mensaje repetido informa MENOS. Se sigue
  // pudiendo re-avisar (a veces hace falta), pero el botón lo dice.
  const avisado = h.avisado ?? [];

  return (
    <div className="mt-1">
      {avisado.length > 0 && (
        <div className="mb-1 flex flex-wrap items-baseline gap-2 border-l-2 pl-2"
             style={{ borderColor: "var(--t-pos)" }}>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--t-pos)]">
            ya avisado
          </span>
          {avisado.map((a) => (
            <span key={a.para} className="text-[10px] text-[var(--t-text)]">
              {a.para}
              <span className={`ml-1 ${SUB}`}>{cuando(a.creado_at)}</span>
            </span>
          ))}
          <span className={SUB}>sigue abierto en su bandeja</span>
        </div>
      )}
      {avisado.length === 0 && (h.avisado_cerrado ?? 0) > 0 && (
        <p className="mb-1 text-[10px]" style={{ color: "#f59e0b" }}>
          Se avisó {h.avisado_cerrado} vez/veces y lo dieron por cerrado, pero
          el control sigue marcando casos.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          disabled={!!ocupado}
          onClick={() => void cargar(true)}
          className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border disabled:opacity-40 ${
            avisado.length
              ? "border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              : "border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]"}`}
        >
          {ocupado === "proponiendo" ? "pensando…"
            : avisado.length ? "volver a avisar" : "qué proponés"}
        </button>
        {h.pendientes > 0 && props === null && (
          <button
            disabled={!!ocupado}
            onClick={() => void cargar(false)}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            ver las {h.pendientes} de antes
          </button>
        )}
        {msg && (
          <span className={`text-[9px] ${msg.startsWith("✘")
            ? "text-[var(--t-neg)]" : "text-[var(--t-accent)]"}`}>{msg}</span>
        )}
      </div>

      {props !== null && props.length > 0 && (
        <div className="mt-1 border border-[var(--t-border)]">
          {props.map((p) => (
            <div key={p.id}
                 className="grid grid-cols-[16px_1fr_130px] gap-1.5 px-1.5 py-1 items-baseline border-b border-[var(--t-border)] last:border-b-0">
              <input type="checkbox" checked={!!marcadas[p.id]}
                     onChange={(e) => setMarcadas((m) => ({ ...m, [p.id]: e.target.checked }))}
                     className="translate-y-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] text-[var(--t-text)] break-words">
                  {p.sujeto}
                </span>
                {/* De dónde salió. **Cambia cuánto hay que mirarla**: una regla
                    se audita leyendo el código una vez, una del modelo hay que
                    mirarla caso por caso. */}
                {p.fuente === "ia" && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-widest"
                        style={{ color: "#f59e0b" }}>lo dedujo la IA</span>
                )}
                <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                  {p.porque}
                </p>
              </div>
              <input
                value={valores[p.id] ?? ""}
                placeholder={p.extra?.elige_destinatario ? "email@aca" : p.campo}
                onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))}
                className="text-[10px] bg-transparent border border-[var(--t-border)] px-1 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
            <button
              disabled={!!ocupado || elegidas.length === 0}
              onClick={() => void mandar("aplicar")}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
            >
              {ocupado === "aplicar" ? "aplicando…" : `aplicar ${elegidas.length}`}
            </button>
            <button
              disabled={!!ocupado || elegidas.length === 0}
              onClick={() => void mandar("rechazar")}
              className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-neg)] hover:text-[var(--t-neg)] disabled:opacity-40"
            >
              descartar
            </button>
            {/* Escribir y verificar es UN paso: decirlo acá es lo que hace que
                apretar el botón no sea un acto de fe. */}
            <span className={SUB}>
              escribo en {h.titulo.toLowerCase()} y releo para confirmar
            </span>
          </div>
        </div>
      )}

      {/* El resultado, uno por uno. Un «10 aplicadas» sin detalle obliga a ir a
          Manager a comprobar — que es exactamente el viaje que esto elimina. */}
      {resultados.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {resultados.map((r) => (
            <li key={r.id} className="text-[10px] leading-snug"
                style={{ color: r.ok ? "var(--t-pos)" : "var(--t-neg)" }}>
              {r.ok ? "✔" : "✘"} {r.sujeto} — {r.ok ? r.detalle : (r.error ?? "falló")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Los `**` del backend, en negrita de verdad.
//
// ⚠️ Se veían CRUDOS: la pantalla mostraba «Σ de las amortizaciones futuras =
// **100.00** en 3 cupón/es» con los asteriscos puestos. El backend viene
// marcando lo importante desde siempre —es justo el número que hay que mirar—
// y el front lo tiraba como texto plano, así que el énfasis no solo no ayudaba:
// agregaba ruido a un renglón que ya era denso.
//
// Sin `dangerouslySetInnerHTML` y sin librería: se parte por `**` y los tramos
// impares van en negrita. Nada de lo que llega puede convertirse en markup, que
// es la única propiedad que importa acá — parte de este texto viene de errores
// y de nombres de instrumento.
export function Marcado({ t }: { t: string }) {
  if (!t) return null;
  const partes = t.split("**");
  return (
    <>
      {partes.map((x, i) => i % 2
        ? <strong key={i} className="font-semibold text-[var(--t-text)]">{x}</strong>
        : <span key={i}>{x}</span>)}
    </>
  );
}

export function Chequeos({ pasos, veredicto, calculo }: {
  pasos: Paso[];
  veredicto?: Veredicto;
  calculo?: Insumo[];
}) {
  const [ver, setVer] = useState<"" | "prueba" | "contexto" | "aprender">("");
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

  // ── LAS CUATRO CAPAS (§0.bx) ──────────────────────────────────────────────
  //
  // El user, mirando 20 pasos de BPOD7: *«es demasiado complicado entender qué
  // es lo que pasa, es como que no tiene un CICLO… uno debería dar paso a otro
  // y que quede marcado DÓNDE QUEDÓ TRABADO. Pero tampoco que el user vea
  // absolutamente todo… yo que lo estoy entrenando quiero ver más fácil el
  // problema»*.
  //
  // El problema no era la cantidad: era que **cuatro naturalezas distintas se
  // dibujaban iguales**. Una prueba que decide, un dato de contexto, una
  // lección de OTRO caso y la conclusión, todas al mismo peso — así que para
  // encontrar el problema había que leer las veinte. La capa la manda el
  // backend; acá solo se agrupa. Los pasos viejos (sin `capa`) caen en
  // `prueba`, que es donde estaban antes: un deploy desparejo no esconde nada.
  const capaDe = (p: Paso) =>
    p.capa ?? (p.estado === "info" ? "contexto" : "prueba");
  const pruebas = pasos.filter((p) => capaDe(p) === "prueba");
  const contexto = pasos.filter((p) => capaDe(p) === "contexto");
  const aprender = pasos.filter((p) => capaDe(p) === "aprender");
  const conclusion = pasos.find((p) => capaDe(p) === "veredicto");

  const d = veredicto?.desenlace;
  // DÓNDE SE TRABÓ. El backend nombra la clave; acá se busca el paso para poder
  // mostrarlo entero SIN desplegar nada. Es lo único que se ve por default,
  // porque es literalmente lo que el user pidió ver primero.
  const traba = d?.traba ? pasos.find((p) => p.clave === d.traba) : undefined;

  // El color y el ícono del desenlace. `viejo` es POSITIVO (el bono está bien)
  // aunque venga de un paso que bloquea: pintarlo rojo fue el bug.
  const DES: Record<string, { color: string; icono: string }> = {
    roto:  { color: "var(--t-neg)",  icono: "✘" },
    no_se: { color: "var(--t-text-dim)", icono: "?" },
    viejo: { color: "var(--t-pos)",  icono: "✔" },
    mirar: { color: "#f59e0b",       icono: "▲" },
    listo: { color: "var(--t-pos)",  icono: "✔" },
  };
  const des = DES[d?.clase ?? ""] ?? { color: "var(--t-text-muted)", icono: "·" };

  return (
    <div className="basis-full mt-1">
      {/* ── 1. QUÉ PASA. Una línea, arriba de todo. ─────────────────────────
          Antes lo primero que se leía era «✘ BLOQUEADO — 1 paso lo bloquea», que
          contesta *«¿puedo escribir?»*. La pregunta que uno se hace primero es
          *«¿qué le pasa?»*, y la respuesta estaba doce renglones más abajo
          diciendo lo contrario. */}
      {d && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-bold" style={{ color: des.color }}>
            {des.icono}
          </span>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold" style={{ color: des.color }}>
              {d.titulo}
            </span>
            <span className="ml-1.5 text-[10px] text-[var(--t-text-muted)]">
              <Marcado t={d.que_hacer} />
            </span>
          </div>
        </div>
      )}

      {/* ── 2. EL PASO EXACTO DONDE SE TRABÓ, abierto y sin pedir permiso. ──
          «Que quede marcado dónde quedó trabado» — textual. Los otros pasos que
          tampoco pasan pueden ser consecuencia de éste; el primero es el que hay
          que leer, y por eso es el único que se abre solo. */}
      {traba && (
        <div className="mt-1 border-l-2 pl-2 py-0.5" style={{ borderColor: des.color }}>
          <span className="text-[10px] font-semibold text-[var(--t-text)]">
            {traba.titulo}
          </span>
          {traba.tabla && (
            <span className="ml-1.5 text-[9px] font-mono text-[var(--t-text-dim)]">
              {traba.tabla}
            </span>
          )}
          <p className="text-[10px] leading-snug text-[var(--t-text-muted)] whitespace-pre-wrap">
            <Marcado t={traba.detalle} />
          </p>
          {traba.hacer && <PanelHacer h={traba.hacer} />}
        </div>
      )}

      {/* ── 3. LA CONCLUSIÓN del diagnóstico local, si la hay. ──────────────
          Va acá y no perdida en la lista: es la frase que resume el análisis. */}
      {conclusion && (
        <p className="mt-1 text-[10px] leading-snug text-[var(--t-text-muted)] whitespace-pre-wrap">
          <Marcado t={conclusion.detalle} />
        </p>
      )}

      {/* ── 4. LO DEMÁS, PLEGADO Y SEPARADO POR NATURALEZA. ─────────────────
          Nada se esconde: se deja de competir por el lugar. Una por vez, como
          el menú de SKILLS. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {([["prueba", "los pasos", pruebas.length],
           ["contexto", "contexto", contexto.length],
           ["aprender", "para aprender", aprender.length]] as
           ["prueba" | "contexto" | "aprender", string, number][])
          .filter(([, , n]) => n > 0)
          .map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setVer((v) => (v === k ? "" : k))}
              className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                ver === k
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
            >
              {label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
          <span style={{ color: "var(--t-pos)" }}>{c.ok} ok</span>
          {c.bloquea > 0 && <span className="text-[var(--t-neg)]"> · {c.bloquea} bloquea</span>}
          {c.revisar > 0 && <span style={{ color: "#f59e0b" }}> · {c.revisar} a revisar</span>}
          {c.no_se > 0 && <span> · {c.no_se} sin verificar</span>}
        </span>
        {(calculo?.length ?? 0) > 0 && (
          <button
            onClick={() => setVerCalculo((v) => !v)}
            className="ml-auto text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verCalculo ? "▾" : "▸"} cómo se calculó
          </button>
        )}
      </div>

      {/* CÓMO SE CALCULÓ. Una tasa sin su memoria de cálculo no se puede
          auditar: solo se puede creer o no creer. */}
      {verCalculo && (calculo?.length ?? 0) > 0 && (
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

      {ver !== "" && (
        <ol className="mt-1 border-l border-[var(--t-border)] pl-2 space-y-1">
          {(ver === "prueba" ? pruebas : ver === "contexto" ? contexto : aprender)
            .map((p) => {
            const esTraba = !!d?.traba && p.clave === d.traba;
            return (
            <li key={p.clave}
                className={`grid grid-cols-[14px_1fr] gap-1.5 items-baseline ${
                  esTraba ? "bg-[var(--t-surface)] -ml-2 pl-2" : ""}`}>
              <span className="text-[10px] font-bold" style={{ color: PASO_COLOR[p.estado] }}>
                {PASO_ICONO[p.estado] ?? "·"}
              </span>
              <div className="min-w-0">
                <span className="text-[10px] text-[var(--t-text)]">{p.titulo}</span>
                {/* ⚠️ **ACÁ SE TRABÓ**, también adentro de la lista. Ver la
                    cadena entera y tener que volver arriba a recordar cuál era
                    el paso malo es la mitad del trabajo que esto vino a sacar. */}
                {esTraba && (
                  <span className="ml-1.5 text-[8px] uppercase tracking-widest font-semibold"
                        style={{ color: des.color }}>
                    ← acá se trabó
                  </span>
                )}
                {p.tabla && (
                  <span className="ml-1.5 text-[9px] font-mono text-[var(--t-text-dim)]">
                    {p.tabla}
                  </span>
                )}
                {/* `whitespace-pre-wrap`: el backend manda los casos UNO POR
                    LÍNEA y el CSS los estaba colapsando en un párrafo separado
                    por «·». Los 8 casos eran una lista y se veían como un
                    chorizo — el user: «necesito que estén en modo listado, no
                    tirados así uno al lado del otro que no entiendo nada». */}
                <p className="text-[10px] leading-snug text-[var(--t-text-muted)] whitespace-pre-wrap">
                  <Marcado t={p.detalle} />
                </p>
                {/* `accion` en un paso de SALUD es una URL: el ATAJO para ir a
                    arreglarlo. Decir «se corrige en Manager → TÍTULOS» y hacer
                    que el otro navegue a mano es media solución. */}
                {p.accion && (p.accion.startsWith("/") ? (
                  <a href={p.accion}
                     className="inline-block mt-0.5 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)]">
                    ir a arreglarlo →
                  </a>
                ) : (
                  <p className="text-[10px] leading-snug" style={{ color: "#f59e0b" }}>
                    → {p.accion}
                  </p>
                ))}
                {/* El aviso se distingue de la acción a propósito: la acción es
                    algo que hay que resolver ANTES, el aviso queda pendiente
                    DESPUÉS y se sigue desde la tab AVISOS. */}
                {p.aviso && (
                  <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                    ✎ queda en AVISOS: {p.aviso}
                  </p>
                )}
                {/* El panel de acción NO se repite si ya está arriba en la
                    traba: dos botones idénticos en la misma pantalla es la
                    duda de «¿cuál aprieto?» que no tiene por qué existir. */}
                {p.hacer && !esTraba && <PanelHacer h={p.hacer} />}
              </div>
            </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
