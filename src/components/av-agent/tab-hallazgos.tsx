"use client";

// Tab ENCONTRÓ: la cocina — lista, prioridad, seguimiento, vigilancia y masivo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDatos } from "@/components/av-agent/datos";
import { Chequeos } from "@/components/av-agent/piezas";
import { Modo, Simular, Hallazgo, Vista, FilaInforme,
         RunMasivo, Centinela, TIPO_LABEL, SUJETO_LARGO, TIPO_CHIP,
         ORDEN_TIPO, SEV_TINT, fechaHora, TITULO, SUB,
         Paso, Veredicto, Insumo, EST_MASIVO, ORDEN_MASIVO,
         edad, SEV_COLOR, BANDA_TXT, BANDA_COLOR, cuando } from "@/components/av-agent/tipos";

// ── TAB 2: lo que encontró ─────────────────────────────────────────────────

// EL BACKLOG DEL CENTINELA, que antes ERA la tab AHORA.
//
// Sigue siendo trabajo real —131 cosas abiertas— y por eso no se borró: se
// mudó a la cocina y se plegó. Acá adentro conviven los tres grupos que antes
// competían por la pantalla principal: lo que no viste, lo que ya viste (sigue
// abierto) y lo que se arregló solo.
// LO QUE YA ATENDISTE. Salió de la lista de trabajo (§0.bq) y vive en
// ¿AGUANTAN?, que es donde se mira si volvió a romperse.
//
// La distinción `aplicado` / `votado` importa y la hace el BACKEND: aplicar un
// arreglo cambia el dato, votar solo dice que lo miraste. Si las mostráramos
// igual, «17 hechos» incluiría diecisiete cosas que siguen rotas.
export function Hechos({ filas }: { filas: Hallazgo[] }) {
  if (!filas.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[10px] font-semibold tracking-widest text-[var(--t-text)]">
          YA LO ATENDISTE
        </h3>
        <span className={SUB}>{filas.length}</span>
        <span className="text-[9px] text-[var(--t-text-dim)]">
          esperando que el detector confirme
        </span>
      </div>
      <div className="mt-1 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {filas.map((h, i) => (
          <div key={`${h.ticker}-${h.regla}-${i}`}
               className="grid grid-cols-[190px_150px_1fr_auto] items-baseline gap-2 px-2 py-1">
            <span className="text-[11px] font-bold text-[var(--t-text)] leading-tight"
                  title={h.ticker}>
              {h.nombre || h.ticker}
            </span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                  title={h.regla}>
              {h.regla.replace(/_/g, " ")}
            </span>
            <span className="text-[10px] text-[var(--t-text-muted)] leading-snug min-w-0 truncate"
                  title={h.motivo}>
              {h.motivo}
            </span>
            <span className="text-[9px] uppercase tracking-widest whitespace-nowrap"
                  style={{ color: h.atendido === "aplicado"
                    ? "var(--t-pos)" : "var(--t-text-dim)" }}
                  title={h.atendido === "aplicado"
                    ? "Se aplicó el arreglo: el dato cambió."
                    : "Lo votaste, pero el dato no se tocó — no había botón o no lo apretaste."}>
              {h.atendido === "aplicado" ? "✔ arreglado" : "votado"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function VigilanciaAbierta({ cent, marcarVisto }: {
  cent: Centinela;
  marcarVisto: (claves: string[]) => Promise<void>;
}) {
  const abierto = true;   // es una sub-tab: ya la elegiste, no la pliegues
  const [verVistos, setVerVistos] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);
  const sinVer = cent.abiertos.filter((f) => !f.visto_at);
  const yaVistos = cent.abiertos.filter((f) => f.visto_at);
  if (!cent.abiertos.length && !cent.resueltos.length) return null;

  const enLista = verVistos ? [...sinVer, ...yaVistos] : sinVer;
  return (
    <div className="flex flex-col gap-2">
    {/* QUÉ ES esta sub-tab (user, 2026-08-22: «en VIGILANCIA no se entiende
        tampoco por qué 130»). Es OTRA fuente que LA LISTA, con otro reloj:
        por eso los números no coinciden ni tienen por qué. */}
    <p className="text-[10px] text-[var(--t-text-dim)]">
      Esto lo ve el <b>monitor en vivo</b> (late cada 30s en rueda: precios ·
      tasas · salud) y es <b>acumulado</b> — cada fila queda abierta hasta que
      el monitor deja de verla, y ahí pasa sola a «se arregló solo». No es LA
      LISTA (esa es la relevada nocturna contra 1816): un mismo bono puede
      estar en las dos, y acá se suman cosas que la relevada no mira (jobs,
      frescura). «Visto» solo lo saca de <i>sin ver</i>; no lo cierra.
    </p>
    <div className="border border-[var(--t-border)] px-3 py-2">
      <div
        className="w-full flex flex-wrap items-baseline gap-2 text-left"
        title="Lo que la vigilancia en vivo tiene abierto. Es acumulado, no del día: por eso vive acá y no en AHORA."
      >
        <span className="text-[10px] text-[var(--t-text)]">
          {cent.abiertos.length} abiertos
        </span>
        {sinVer.length > 0 && (
          <span className="text-[9px] text-[var(--t-neg)]">
            {sinVer.length} sin ver
          </span>
        )}
      </div>

      {abierto && (
        <div className="mt-2 flex flex-col gap-2">
          {sinVer.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                sin ver
              </span>
              <span className={SUB}>{sinVer.length}</span>
              {/* Marcar todo de una: revisar 30 casillas es la forma más rápida
                  de que nadie marque nada. NO los resuelve ni los esconde. */}
              <button
                onClick={() => void marcarVisto(sinVer.map((f) => f.clave))}
                className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                marcar los {sinVer.length} como vistos
              </button>
            </div>
          )}
          {yaVistos.length > 0 && (
            <button
              onClick={() => setVerVistos((v) => !v)}
              className="self-start text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
              title="Siguen abiertos: los marcaste vistos, así que dejaron de esperar una decisión."
            >
              {verVistos ? "▾" : "▸"} {yaVistos.length} ya vistos (siguen abiertos)
            </button>
          )}
          {enLista.length > 0 && (
            <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
              {enLista.map((f) => (
                <div key={f.clave}
                     className={`grid grid-cols-[3px_130px_170px_1fr_auto] items-baseline gap-2 px-2 py-1 ${
                       f.visto_at ? "opacity-60" : ""}`}>
                  <span className="self-stretch" style={{ background: SEV_COLOR[f.severidad] }} />
                  <span className="text-[11px] font-bold text-[var(--t-text)] truncate"
                        title={f.sujeto}>
                    {!f.visto_at && <span className="text-[var(--t-neg)]">• </span>}
                    {f.sujeto}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                        title={f.regla}>
                    {f.regla.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-[var(--t-text-muted)] leading-snug min-w-0">
                    {f.motivo}
                  </span>
                  <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap self-center"
                        title={`confirmado ${f.ultimo_at} · apareció ${f.abierto_at}`}>
                    <span className="text-[var(--t-text-muted)]">
                      confirmado hace {edad(f.ultimo_at)}
                    </span>
                    {" · desde hace "}
                    {f.dias_abierto != null && f.dias_abierto >= 1
                      ? `${Math.round(f.dias_abierto)}d`
                      : edad(f.abierto_at)}
                    {" · ×"}{f.veces}
                  </span>
                </div>
              ))}
            </div>
          )}
          {cent.resueltos.length > 0 && (
            <div>
              <button
                onClick={() => setVerResueltos((v) => !v)}
                className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
              >
                {verResueltos ? "▾" : "▸"} se arreglaron solos ({cent.resueltos.length})
              </button>
              {/* No se borran a propósito: «se arregló solo» es información, y
                  ver los que van y vienen es cómo se detecta un intermitente. */}
              {verResueltos && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {cent.resueltos.map((f) => (
                    <div key={f.clave} className="text-[10px] text-[var(--t-text-dim)]">
                      <span className="text-[var(--t-pos)]">✔</span> {f.sujeto}
                      {" · "}{f.regla.replace(/_/g, " ")}
                      {" · duró "}{edad(f.abierto_at)}{" · ×"}{f.veces}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}


export function TabHallazgos({ porTipo, data, sims, simular, ignorar,
                       cent, marcarVisto }: {
  porTipo: Record<string, Hallazgo[]>;
  data: Vista;
  sims: Record<string, Record<string, unknown> | null>;
  simular: Simular;
  ignorar: (ticker: string) => void;
  // ⚠️ **BAJARON DE AHORA** (§0.bo). No se borraron: AHORA es informativo y del
  // día, así que la priorización, el seguimiento de arreglos y el backlog del
  // centinela viven acá — que es la cocina. Sacarlos de la app habría dejado
  // 131 cosas abiertas sin ninguna pantalla, que es peor que el desorden.
  cent: Centinela | null;
  marcarVisto: (claves: string[]) => Promise<void>;
}) {
  const { leer, llamar, escribir } = useDatos();
  // EL FILTRO. Con 84 hallazgos apilados en cinco secciones, la pantalla era un
  // scroll infinito donde para llegar a `tasa_sospechosa` había que pasar por
  // todo lo demás — y una vez abajo se perdía el contexto de cuánto quedaba.
  // Con un tipo por vez, la vista entra en una pantalla y el resto sigue contado
  // arriba: nada se esconde, solo deja de competir por el lugar.
  // ── LA SUB-TAB (§0.bp) ──────────────────────────────────────────────────
  //
  // Pedido del user, mirando ENCONTRÓ con tres cajas colapsables apiladas
  // arriba de la lista: *«queda horrible… quiero que quede como lo de SKILLS,
  // las mains horizontales y las opciones abajo. Es fundamental la UX/UI porque
  // si no es inentendible»*.
  //
  // Tenía razón y es el mismo error que ya había en SKILLS antes de su menú:
  // **apilar secciones obliga a scrollear para saber qué hay**, y encima acá
  // cada una arrancaba plegada — o sea que la pantalla mostraba tres títulos y
  // ningún contenido. Un menú horizontal muestra las cuatro de una y se mira
  // UNA por vez, que es como se consulta.
  const [sub, setSub] = useState<"lista" | "importa" | "aguantan" | "vigilancia">("lista");
  const [filtro, setFiltro] = useState<string>("todos");
  // La BÚSQUEDA es el otro camino: cuando uno ya sabe el ticker, filtrar por tipo
  // es el paso de más. Matchea sujeto, regla y motivo — los tres son cosas que
  // uno recuerda de un hallazgo.
  const [q, setQ] = useState("");
  // SEGUNDO NIVEL: la REGLA, o sea QUÉ error encontró dentro del tipo. El tipo
  // dice de qué familia es el problema («tasas que pueden estar mal»); la regla
  // dice cuál es —`moneda_flujo_contradice` no se parece en nada a `sin_ejes` y
  // se arreglan distinto—. Con 68 tasas mezcladas, filtrar por tipo dejaba
  // igual una lista que no se puede trabajar de corrido: **uno trabaja por
  // CAUSA, no por familia.**
  const [regla, setRegla] = useState<string>("todas");
  // ⚠️ **LO DEL MERCADO NO ES TRABAJO** (user, 2026-08-19: *«los que el sistema
  // detecta que no tienen punta es porque no tienen liquidez, no es un problema.
  // Está bien que los marque como ilíquidos pero por defecto mostremos otra
  // cosa»*).
  //
  // Con 29 `sin_punta` arriba de todo, la lista de trabajo empezaba con 29 filas
  // que no se trabajan. **No se borran** —que un bono no opere es información y
  // el día que uno lo busca tiene que estar— pero dejan de ser lo primero que se
  // ve. El criterio lo declara el backend (`de_quien`), no un `regla === …`
  // escrito acá: esa es justo la copia que ya nos costó que un botón no
  // apareciera nunca.
  const [verMercado, setVerMercado] = useState(false);
  // ⚠️ **POR DEFECTO, LO QUE FALTA HACER** (user, 2026-08-21: *«¿podemos que
  // ENCONTRÓ muestre por defecto lo que NO hice? Que estos queden en ENCONTRÓ
  // pero marcados como ya hechos»*).
  //
  // Con 107 filas de las que la mayoría ya pasaron por sus manos, la lista de
  // trabajo dejó de ser una lista de trabajo: para encontrar lo que faltaba
  // había que ir leyendo cuál tenía el ✔ y cuál no, fila por fila.
  //
  // **Lo atendido NO se borra**: se esconde con el número a la vista y vuelve a
  // un clic — la misma regla que el corte del mercado. Y quién está atendido lo
  // decide el BACKEND (`h.atendido`), que es el único que sabe distinguir
  // «voté» de «apliqué»: votar no arregla nada, y si el voto marcara la fila
  // como hecha los 17 BOPREALes desaparecían de la vista estando rotos.
  // Lo que dijiste que no querías ver. Aparte de «ya hechos» a propósito:
  // «lo atendí» y «no me lo muestres» son dos decisiones distintas y
  // mezclarlas haría que destapar una destape la otra.
  const [verRuido, setVerRuido] = useState(false);

  const tipos = useMemo(
    () => Object.keys(porTipo).sort(
      (a, b) => (ORDEN_TIPO.indexOf(a) + 1 || 99) - (ORDEN_TIPO.indexOf(b) + 1 || 99)),
    [porTipo]);

  // Los hallazgos que pasan TIPO + BÚSQUEDA. Es el paso previo a la regla, y se
  // calcula aparte a propósito: las chips de regla tienen que contar sobre ESTO
  // y no sobre el total, o mostrarían opciones que no van a devolver nada.
  // Cuántos hay del lado del mercado. Se cuenta SIEMPRE (aunque estén ocultos):
  // un filtro que esconde sin decir cuánto esconde es lo mismo que truncar en
  // silencio, y acá eso ya tiene nombre propio.
  const nMercado = useMemo(
    () => data.hallazgos.filter((h) => h.de_quien === "mercado").length,
    [data.hallazgos]);
  const nHechos = useMemo(
    () => data.hallazgos.filter((h) => h.atendido).length,
    [data.hallazgos]);
  const nRuido = useMemo(
    () => data.hallazgos.filter((h) => h.es_ruido).length,
    [data.hallazgos]);

  const preFiltrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out: [string, Hallazgo[]][] = [];
    for (const tipo of tipos) {
      if (filtro !== "todos" && filtro !== tipo) continue;
      let hs = porTipo[tipo];
      // El corte va ANTES de la búsqueda: si uno tipea un ticker ilíquido lo
      // quiere encontrar igual, así que buscar destapa lo oculto.
      if (!verMercado && !t) hs = hs.filter((h) => h.de_quien !== "mercado");
      // Igual que el corte del mercado, va ANTES de la búsqueda: si uno tipea el
      // ticker de algo que ya arregló, lo quiere encontrar igual.
      // ⚠️ **LO HECHO NO ESTÁ EN LA LISTA, NI DESTAPABLE.** Antes era un toggle
      // y lo hecho seguía ocupando la lista de trabajo, en gris. El user: *«si
      // algo ya está hecho tiene que salir de acá y en todo caso pasar a esto
      // de que se controla si se volvió a romper»*. Vive en ¿AGUANTAN?.
      //
      // La BÚSQUEDA sí lo encuentra: tipear el ticker de algo que arreglaste y
      // que no aparezca sería esconderlo, no ordenarlo.
      if (!t) hs = hs.filter((h) => !h.atendido);
      // Igual que los otros dos cortes, ANTES de la búsqueda: si tipeás el
      // ticker de algo que descartaste, lo encontrás igual — que es lo que
      // hace reversible la decisión desde la app.
      if (!verRuido && !t) hs = hs.filter((h) => !h.es_ruido);
      if (t) {
        hs = hs.filter((h) =>
          h.ticker.toLowerCase().includes(t) ||
          h.regla.toLowerCase().includes(t) ||
          h.motivo.toLowerCase().includes(t));
      }
      // ⚠️ **MÁS RECIENTE PRIMERO** (§0.br). Pedido del user, y no es gusto:
      // dentro de un tipo las filas venían en el orden que las devolvió la
      // query —o sea ninguno— así que lo que apareció recién quedaba enterrado
      // entre lo de la semana pasada. Sin `abierto_at` (un hallazgo que
      // todavía no se espejó como objeto) va al final: no se inventa una fecha
      // para poder ordenarlo.
      if (hs.length) {
        out.push([tipo, [...hs].sort((a, b) => {
          const ta = a.abierto_at ? Date.parse(a.abierto_at) : 0;
          const tb = b.abierto_at ? Date.parse(b.abierto_at) : 0;
          return tb - ta;
        })]);
      }
    }
    return out;
  }, [porTipo, tipos, filtro, q, verMercado, verRuido]);

  // Las reglas presentes, con su cuenta, **ordenadas por cantidad**: la causa
  // que más aparece es la que conviene atacar primero, y es la que uno busca.
  const reglas = useMemo(() => {
    const n: Record<string, number> = {};
    for (const [, hs] of preFiltrados) for (const h of hs) n[h.regla] = (n[h.regla] ?? 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [preFiltrados]);

  // Una regla elegida que ya no existe en lo visible dejaría la lista vacía sin
  // motivo aparente (pasa al cambiar de tipo). Se cae sola a «todas».
  const reglaOk = regla !== "todas" && reglas.some(([r]) => r === regla) ? regla : "todas";

  const visibles = useMemo(() => {
    if (reglaOk === "todas") return preFiltrados;
    const out: [string, Hallazgo[]][] = [];
    for (const [tipo, hs] of preFiltrados) {
      const f = hs.filter((h) => h.regla === reglaOk);
      if (f.length) out.push([tipo, f]);
    }
    return out;
  }, [preFiltrados, reglaOk]);

  const nVisibles = visibles.reduce((a, [, hs]) => a + hs.length, 0);
  const nVisiblesPre = preFiltrados.reduce((a, [, hs]) => a + hs.length, 0);
  // Lo que TODAVÍA pide trabajo, sin importar el filtro puesto: ni atendido ni
  // descartado. Va en el recuento y en la submétrica de LA LISTA — el número
  // del menú tiene que decir por qué entrarías, no cuántas filas hay.
  const nPorHacer = data.hallazgos.filter(
    (h) => !h.atendido && !h.es_ruido).length;
  // ⚠️ **EL DESPLEGABLE CUENTA LO MISMO QUE EL MENÚ** (user, 2026-08-22: *«LA
  // LISTA dice 58 pero en el filtro tiene 89… no tienen lógica, no hay
  // relación»*). El menú dice «por resolver» y el desplegable contaba TODO
  // (atendidos y descartados incluidos): dos números para la misma lista, sin
  // decir por qué difieren. Ahora los dos cuentan el mismo universo — lo
  // atendido vive en ¿AGUANTAN? y lo descartado tiene su propio contador.
  const nPorHacerPorTipo = useMemo(() => {
    const n: Record<string, number> = {};
    for (const t of tipos)
      n[t] = porTipo[t].filter((h) => !h.atendido && !h.es_ruido).length;
    return n;
  }, [porTipo, tipos]);
  // Los SUJETOS cuyo arreglo ya se APLICÓ (no solo votado): es lo que hace que
  // el informe masivo no vuelva a ofrecer lo que ya hiciste, ni siquiera
  // después de recargar. Sale del objeto, vía `hallazgos[].atendido`.
  const yaHecho = useMemo(
    () => new Set(data.hallazgos
      .filter((h) => h.atendido === "aplicado")
      .map((h) => h.ticker.trim().toUpperCase())),
    [data.hallazgos]);

  // ── EL DIAGNÓSTICO MASIVO ─────────────────────────────────────────────────
  // Corre sobre LO FILTRADO, no sobre los 84: «diagnosticá los 30 de
  // moneda_flujo» es la operación real, y respetar el filtro es lo que la hace
  // posible sin un segundo selector.
  const [run, setRun] = useState<RunMasivo | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  // CERRAR EL INFORME (user, 2026-08-22: «no se puede cerrar, está 100%
  // estático»). La marca vive en el BACKEND (`visto_at`): cerrar acá y
  // recargar la página no lo revive. `verCerrado` es solo el «ver de nuevo»
  // de esta sesión de pantalla.
  const [verCerrado, setVerCerrado] = useState(false);
  // ⚠️ **EL ERROR SE MUESTRA, no se traga** (user, 2026-08-22: *«el botón de
  // cerrar tampoco hace algo»*). El catch silencioso convertía un backend sin
  // la columna `visto_at` (deploy sin schema) en un botón que "no hace nada":
  // el peor bug posible, porque no deja ni una pista de dónde buscar.
  const [errCerrar, setErrCerrar] = useState("");
  const cerrarInforme = useCallback(async () => {
    if (!run) return;
    try {
      // El backend puede rechazar con HTTP 200 + `ok:false` (run corriendo,
      // id inexistente): también es un error para la pantalla.
      const res = await escribir<{ ok: boolean; error?: string }>(
        `/api/ia/av-agent/masivo/visto?run_id=${run.id}`, undefined, []);
      if (!res?.ok) {
        setErrCerrar(`no pude cerrar el informe: ${res?.error || "sin motivo"}`);
        return;
      }
      const r = await leer<RunMasivo>("/api/ia/av-agent/masivo");
      if (r?.id) setRun(r);
      setVerCerrado(false);
      setErrCerrar("");
    } catch (e) {
      // El informe se queda (mejor de más), pero el porqué queda A LA VISTA.
      setErrCerrar(`no pude cerrar el informe: ${
        e instanceof Error ? e.message : String(e)}`);
    }
  }, [run, escribir, leer]);

  const planos = useMemo(
    () => visibles.flatMap(([, hs]) => hs), [visibles]);

  const lanzar = useCallback(async (sinRed: boolean) => {
    setCorriendo(true);
    setVerCerrado(false);
    try {
      // `llamar`: lanza un CÁLCULO en background; el estado que muta (el run)
      // se sigue por el poll de abajo, no por relectura de un recurso.
      const r = await llamar<{ ok: boolean; run_id?: number; error?: string }>(
        "/api/ia/av-agent/masivo", {
          // Se manda el hallazgo entero: el backend necesita la acción (qué
          // puerta abrir) y la evidencia (la curva de 1816, para un alta).
          casos: planos.map((h) => ({
            ticker: h.ticker, tipo: h.tipo, regla: h.regla,
            accion: h.accion, motivo: h.motivo, evidencia: h.evidencia,
          })),
          filtro: { tipo: filtro, regla: reglaOk, busqueda: q.trim() },
          sin_red: sinRed,
        });
      if (!r.ok) { setRun(null); setCorriendo(false); return; }
    } catch {
      setCorriendo(false);
    }
  }, [llamar, planos, filtro, reglaOk, q]);

  // ⚠️⚠️ **EL INFORME SE RECUPERA AL VOLVER A LA TAB.** El user: *«literal,
  // cuando estás en una vista, si hacés algo y te vas a otra desaparece todo.
  // Estaba haciendo el diagnóstico, me pasé de ENCONTRÓ a AVISOS, cuando volví
  // se borró todo»*.
  //
  // Y no se borraba nada: el informe vive en el BACKEND (`GET /masivo` devuelve
  // la última corrida). Lo que se perdía era el `useState` de este componente,
  // que React desmonta al cambiar de tab. O sea que una corrida de 4 minutos y
  // 92 casos desaparecía de la pantalla por tocar otra solapa, y la única forma
  // de recuperarla era volver a correrla.
  //
  // Se lee UNA vez al montar. Sin `corriendo`, así que no arranca ningún poll:
  // es una lectura y listo.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await leer<RunMasivo>("/api/ia/av-agent/masivo");
        if (!vivo || !r?.id) return;
        setRun(r);
        // Si quedó corriendo (se cerró el modal a mitad), el poll se reengancha
        // solo — que es lo que uno espera al volver.
        if (r.estado === "corriendo") setCorriendo(true);
      } catch { /* sin informe previo no hay nada que recuperar */ }
    })();
    return () => { vivo = false; };
  }, [leer]);

  // El POLL. Arranca cuando hay una corrida y se apaga sola al terminar — un
  // poll que sigue después del final es tráfico que nadie mira.
  useEffect(() => {
    if (!corriendo) return;
    let vivo = true;
    const tick = async () => {
      try {
        const r = await leer<RunMasivo>("/api/ia/av-agent/masivo");
        if (!vivo) return;
        setRun(r);
        if (r.estado !== "corriendo") setCorriendo(false);
      } catch { /* un poll que falla no puede romper la pantalla */ }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => { vivo = false; clearInterval(id); };
  }, [corriendo, leer]);

  // ⚠️⚠️ **LA SALIDA TEMPRANA VA ACÁ, DESPUÉS DE TODOS LOS HOOKS — y no es
  // estilo, es un cuelgue.** Estaba arriba, en el medio de la lista de hooks, y
  // React exige que la CANTIDAD de hooks sea la misma en cada render: con la
  // lista vacía se ejecutaban 12 y con un hallazgo 18. O sea que **abrir
  // ENCONTRÓ sin nada y esperar a que el poll trajera el primer hallazgo tiraba
  // «Rendered more hooks than during the previous render» y la pantalla se iba
  // a blanco** — justo en la transición que más pasa. `eslint` lo marcaba
  // (`react-hooks/rules-of-hooks`) y estaba enterrado entre los errores que ya
  // venían de antes.
  if (data.hallazgos.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        No encontré nada. Si todavía no corrí, la lista está vacía porque no miré —
        no porque esté todo bien.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ⚠️ Acá vivía un cuadro con «132 hallazgos · 115 por resolver · 17 ya
          hechos» y «acá se arregla — lo que pasó hoy está en AHORA». El user:
          *«sacar esa parte del cuadro con esos textos que ocupan un lugar
          tremendo»*. Y tiene razón: **el menú de abajo ya dice los cuatro
          números**, así que era un renglón entero repitiendo lo que se lee dos
          centímetros más abajo. La frase explicativa se dice UNA vez, cuando
          se aprende la pantalla; no todos los días. */}

      {/* ── EL MENÚ HORIZONTAL ─────────────────────────────────────────────
          Cuatro entradas, cada una con su número y su submétrica debajo, igual
          que los dominios de SKILLS. La submétrica no es decoración: es lo que
          deja elegir a dónde ir SIN entrar. */}
      <div className="flex items-stretch flex-wrap border-b border-[var(--t-border)] -mt-1">
        {([
          // ⚠️ **EL NÚMERO ES LO QUE FALTA HACER, no el total.** Decía 132 y
          // adentro 17 ya estaban hechos: el contador prometía más trabajo del
          // que había. La lista de trabajo cuenta trabajo.
          ["lista", "LA LISTA", nPorHacer, "para resolver"],
          // ⚠️ «de N abiertos» son PROBLEMAS abiertos en la memoria del agente
          // (todas las fuentes: relevada, controles, monitor en vivo) — por eso
          // puede ser más grande que LA LISTA, que es solo la última relevada.
          // Los avisos y preguntas ya NO cuentan acá (user: «¿256 QUÉ???»).
          ["importa", "QUÉ PIDE ALGO", data.que_importa?.piden_algo ?? 0,
           data.que_importa
             ? `de ${data.que_importa.abiertos} problemas abiertos` : "sin datos"],
          // ⚠️ **LO YA HECHO VIVE ACÁ** (§0.bq). El user: *«si algo ya está
          // hecho tiene que salir de acá y en todo caso pasar a esto de que se
          // controla si se volvió a romper»*. Exacto: lo que atendiste no es
          // trabajo pendiente, es un arreglo esperando confirmación — que es
          // literalmente lo que esta sub-tab mide.
          // ⚠️ El número son CAUSAS en prueba, no casos (user: «¿213?? no
          // tiene lógica»): el lote que arregló 133 patas es UN arreglo con
          // un solo reloj. Los casos van en el pie, que es contexto.
          ["aguantan", "¿AGUANTAN?",
           (data.seguimiento?.por_causa?.length
             ?? data.seguimiento?.en_prueba ?? 0) + (data.atendidos ?? 0),
           `${data.seguimiento?.en_prueba ?? 0} casos en prueba`],
          ["vigilancia", "VIGILANCIA", cent?.abiertos.length ?? 0,
           (cent?.sin_ver ?? 0) > 0 ? `${cent?.sin_ver} sin ver` : "todo visto"],
        ] as [typeof sub, string, number, string][]).map(([k, label, n, pie]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`px-3 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px transition-colors ${
              sub === k
                ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}
          >
            {label}
            <span className="ml-1.5 tabular-nums opacity-60">{n}</span>
            <span className="block text-[8px] font-normal tracking-normal text-[var(--t-text-dim)]">
              {pie}
            </span>
          </button>
        ))}
      </div>

      {sub === "importa" && (data.que_importa
        ? <QueImporta q={data.que_importa}
                      irALista={(rg, suj) => {
                        // EL PUENTE: de la prioridad al banco de trabajo. Una
                        // causa te deja en LA LISTA filtrada por esa regla; un
                        // sujeto, buscado — que es donde están los botones.
                        setSub("lista");
                        setFiltro("todos");
                        setRegla(rg || "todas");
                        setQ(suj || "");
                      }} />
        : <p className="text-[11px] text-[var(--t-text-muted)]">Sin datos todavía.</p>)}
      {sub === "aguantan" && (
        <div className="flex flex-col gap-4">
          {/* QUÉ ES esta sub-tab, dicho arriba de todo (user, 2026-08-22: «no
              está claro para qué es esta vista»). Es la sala de espera de lo
              que YA se tocó: nada de acá pide trabajo. */}
          <p className="text-[10px] text-[var(--t-text-dim)]">
            Acá espera lo que ya se tocó, hasta que se confirme solo:
            <b> EN PRUEBA</b> son arreglos aplicados que el agente vigila con
            hitos (1·2·3·7·14·30 <b>días hábiles</b> — el finde y los feriados
            no cuentan: nada corre que pueda contradecir al arreglo; si no
            vuelve en 30 hábiles, cuenta como acierto verificado);{" "}
            <b>YA LO ATENDISTE</b> es lo que votaste o aplicaste, hasta que el
            detector confirme que ya no está. Lo confirmado desaparece solo;
            lo que VUELVE salta primero en AHORA.
          </p>
          {data.seguimiento && <Seguimiento s={data.seguimiento} />}
          {/* LO QUE ATENDISTE, esperando confirmación. Está acá y no en la
              lista porque ya no es trabajo: es un arreglo del que todavía no
              sabemos si aguantó. Sin esta tabla, el número del menú apuntaría
              a nada — que es el defecto que este proyecto se comió tres veces. */}
          <Hechos filas={data.hallazgos.filter((h) => h.atendido)} />
          {!data.seguimiento && !data.hallazgos.some((h) => h.atendido) && (
            <p className="text-[11px] text-[var(--t-text-muted)]">
              Todavía no arreglaste nada: cuando apliques un arreglo o votes un
              hallazgo, aparece acá hasta que el detector confirme.
            </p>
          )}
        </div>
      )}
      {sub === "vigilancia" && (cent
        ? <VigilanciaAbierta cent={cent} marcarVisto={marcarVisto} />
        : <p className="text-[11px] text-[var(--t-text-muted)]">Sin datos todavía.</p>)}

      {/* ── LA LISTA ─────────────────────────────────────────────────
          Todo lo de abajo —la barra de filtros, el diagnóstico masivo y
          las secciones por tipo— es UNA de las cuatro sub-tabs. Sin este
          corte la barra quedaba a la vista mientras mirabas el
          seguimiento, filtrando algo que no estaba en pantalla. */}
      {sub === "lista" && (
        <>
        {/* ── LA BARRA ─────────────────────────────────────────────────────
            Antes eran TRES renglones: chips de tipo, chips de regla, y una línea
            de texto explicando el throttle de 1816. Para 75 hallazgos, la mitad
            de la pantalla era el filtro.

            Ahora es UNO: dos desplegables (el tipo y el error), la búsqueda, y el
            botón. Un `select` con 9 opciones ocupa lo mismo que un chip y no
            crece con los datos — que es exactamente lo que hacía que la fila de
            reglas se fuera a dos líneas apenas aparecía una regla nueva. */}
        {/* ⚠️ El `-mt-4` se fue: tiraba la barra hacia arriba para pegarla al borde
            del panel, y eso valía cuando era el PRIMER elemento de la tab. Ahora
            abajo del menú horizontal, ese tirón la montaba encima de las
            sub-tabs. Sigue sticky —que la barra se vaya de pantalla con 130
            filas es peor— pero ya no se sube a nada. */}
        <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2 bg-[var(--t-panel)] border-b border-[var(--t-border)] flex flex-wrap items-center gap-2">
          <select
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value); setRegla("todas"); }}
            className="bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          >
            <option value="todos">Todo ({nPorHacer} por resolver)</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {TIPO_CHIP[t] ?? t.replace(/_/g, " ")} ({nPorHacerPorTipo[t] ?? 0})
              </option>
            ))}
          </select>

          {/* El segundo nivel solo existe si hay más de una regla: con una sola no
              ofrece ninguna decisión y sería un desplegable de un solo ítem. */}
          {reglas.length > 1 && (
            <select
              value={reglaOk}
              onChange={(e) => setRegla(e.target.value)}
              className="bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
            >
              <option value="todas">Cualquier error ({nVisiblesPre})</option>
              {reglas.map(([rg, n]) => (
                <option key={rg} value={rg}>{rg.replace(/_/g, " ")} ({n})</option>
              ))}
            </select>
          )}

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="buscar…"
            className="w-40 bg-transparent border border-[var(--t-border)] px-2 py-1 text-[10px] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] outline-none focus:border-[var(--t-accent)]"
          />

          {/* EL MERCADO, contado aunque esté oculto. **Un filtro que esconde sin
              decir cuánto esconde es truncar en silencio** — la misma regla que
              obliga a los workflows a loguear lo que dejaron afuera. Acá el número
              está siempre a la vista y el clic lo destapa. */}
          {nMercado > 0 && (
            <button
              onClick={() => setVerMercado((v) => !v)}
              title={"Iliquidez: el símbolo está suscripto y el mercado no le puso "
                     + "punta. No hay nada que arreglar de este lado — por eso no "
                     + "encabeza la lista de trabajo."}
              className={`text-[9px] uppercase tracking-widest px-2 py-1 border ${
                verMercado
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"}`}
            >
              {verMercado ? "▾" : "▸"} {nMercado} del mercado
            </button>
          )}

          {/* ⚠️ Acá estaba el toggle «17 YA HECHOS». Se fue con ellos: lo que ya
              atendiste no es trabajo pendiente y no tiene por qué competir por
              esta lista. Vive en ¿AGUANTAN?, con su número en el menú. */}

          {/* LO QUE DIJISTE QUE ES RUIDO. Mismo criterio que los otros dos
              cortes: el número SIEMPRE a la vista y el clic lo destapa. Esconder
              un problema real sin dejar cómo volver es el riesgo entero de este
              botón — por eso se cuenta, se destapa y la búsqueda lo encuentra. */}
          {nRuido > 0 && (
            <button
              onClick={() => setVerRuido((v) => !v)}
              title={"Dijiste «es ruido»: no querés ver esto. Sigue en la lista y "
                     + "se destapa acá; para volver atrás, abrilo y tocá «cambiar» "
                     + "en el voto."}
              className={`text-[9px] uppercase tracking-widest px-2 py-1 border ${
                verRuido
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"}`}
            >
              {verRuido ? "▾" : "▸"} {nRuido} dijiste que es ruido
            </button>
          )}

          {(q.trim() || filtro !== "todos" || reglaOk !== "todas") && (
            <button
              onClick={() => { setFiltro("todos"); setQ(""); setRegla("todas"); }}
              className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
            >
              {nVisibles} de {data.hallazgos.length} ✕
            </button>
          )}

          {/* El botón, a la derecha y con el número adentro. La explicación del
              throttle («con 1816 son ~2 min, 1 pedido por segundo, es el límite
              del plan») ocupaba un renglón entero para decir algo que solo
              importa una vez: pasa al `title`. */}
          <button
            disabled={corriendo || nVisibles === 0}
            onClick={() => void lanzar(false)}
            title={`Diagnostica los ${nVisibles} contra 1816. Tarda ~${Math.ceil(nVisibles * 1.4 / 60)} min: el plan permite 1 pedido por segundo.`}
            className="ml-auto text-[9px] font-semibold uppercase tracking-widest px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--t-accent)]"
          >
            {corriendo ? "diagnosticando…" : `⚑ Diagnosticar ${nVisibles}`}
          </button>
          {/* «SIN RED» no le decía nada a nadie: nombraba la IMPLEMENTACIÓN (que
              no sale a internet) en vez de lo que uno gana (que vuelve en
              segundos). Ahora dice RÁPIDO, que es la razón para elegirlo. */}
          <button
            disabled={corriendo || nVisibles === 0}
            onClick={() => void lanzar(true)}
            title="Solo lo que se puede saber sin consultar a 1816: vuelve en segundos y no gasta créditos. Algunos casos quedan sin diagnosticar."
            className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-30"
          >
            rápido
          </button>
        </div>

        {run && run.visto_at && !corriendo && !verCerrado ? (
          // El informe CERRADO no desaparece: queda en una línea, reabrible.
          // Borrarlo del todo haría irrecuperable una corrida de minutos.
          <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--t-border)] text-[10px] text-[var(--t-text-dim)]">
            <span>INFORME #{run.id} · cerrado</span>
            <button
              onClick={() => setVerCerrado(true)}
              className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
            >
              ver de nuevo
            </button>
          </div>
        ) : run && (
          <InformeMasivo run={run} simular={simular} sims={sims}
                         yaHecho={yaHecho}
                         cerrar={run.estado !== "corriendo" ? cerrarInforme : undefined} />
        )}
        {errCerrar && (
          <p className="text-[10px] text-[var(--t-neg)]">
            ⚠ {errCerrar} — probable deploy sin el schema: correr el deploy
            completo (sin --sin-schema) y reintentar.
          </p>
        )}

        {visibles.length === 0 && (
          <p className="text-[11px] text-[var(--t-text-muted)]">
            {/* Si lo que vació la lista es que YA ESTÁ TODO ATENDIDO, decirlo así
                y no como «ningún hallazgo coincide con el filtro»: son dos cosas
                muy distintas y una de las dos es una buena noticia. */}
            {nHechos > 0 && nHechos === data.hallazgos.length ? (
              <>
                No queda nada por hacer: los {nHechos} hallazgos ya pasaron por
                tus manos. Están en ¿AGUANTAN?, esperando confirmación.
              </>
            ) : nVisiblesPre > 0 ? (
              // El filtro SÍ matchea filas — pero todas ya pasaron por tus
              // manos. Decir «no coincide nada» acá sería mentira: coincide
              // todo, y ya lo atendiste (user, 2026-08-22: «filtro por salud y
              // queda todo en blanco… está bien que no haya nada porque ya
              // toqué todo, pero decilo»).
              <>
                Los {nVisiblesPre} de este filtro ya pasaron por tus manos —
                están en ¿AGUANTAN?, esperando que el detector confirme.
              </>
            ) : (
              <>
                Ningún hallazgo coincide con {q.trim() ? `«${q}»` : "el filtro puesto"}.
                Los {data.hallazgos.length} siguen ahí — es el filtro, no la lista.
              </>
            )}
          </p>
        )}

        {visibles.map(([tipo, hs]) => (
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
                // El SUJETO de un hallazgo del SISTEMA no es un ticker de 4
                // letras sino el id del chequeo (`job:mercado_1816_series`), un
                // path o una tabla: en la columna de 72px entraba «job:merc» y
                // las filas quedaban indistinguibles. Misma tabla, primera
                // columna más ancha.
                // ⚠️ **SE DERIVA DEL DATO, no de una lista de tipos** (user,
                // 2026-08-22: «los títulos cortados a la mitad, no se
                // entienden» — `dato_partido` mostraba «simbolo_m…» porque no
                // estaba en la lista a mano, y cada tipo nuevo volvía a caer
                // en la columna angosta). Un ticker es corto y sin separadores;
                // todo lo demás es un nombre y necesita el ancho.
                const sujetoLargo = SUJETO_LARGO.has(h.tipo)
                  || h.ticker.length > 8 || /[_:.]/.test(h.ticker);
                return (
                /* La COLUMNA DE HORA (§0.br) entra al final, angosta y con
                   ancho fijo: así las horas quedan alineadas y se puede barrer
                   la columna de un vistazo. Y el `py` baja de 1 a 0.5 — con 130
                   filas, cada 4px de alto son media pantalla. */
                <div
                  key={`${h.ticker}-${h.regla}-${i}`}
                  className={`grid ${sujetoLargo
                    ? "grid-cols-[3px_190px_150px_1fr_auto_46px]"
                    : "grid-cols-[3px_72px_150px_1fr_auto_46px]"} items-baseline gap-2 px-2 py-0.5 hover:bg-[var(--t-surface)]${
                    // YA HECHO: apagada, pero legible. Se ve solo con «ya hechos»
                    // destapado; ahí la marca es lo que distingue lo que uno ya
                    // tocó de lo que todavía no.
                    h.atendido ? " opacity-45" : ""}`}
                >
                  <span className="self-stretch" style={{ background: SEV_TINT[h.severidad] }}
                        title={`severidad ${h.severidad}`} />
                  {/* ⚠️ `truncate` se fue de los sujetos LARGOS: cortar el
                      nombre de un chequeo a la mitad —«control:comitentes_sin_
                      nive…»— deja la fila sin decir qué es, que es todo lo que
                      esa columna tiene que hacer. Los tickers siguen truncados:
                      ahí el texto entra siempre. */}
                  <span className={`text-[11px] font-bold text-[var(--t-text)] ${
                          sujetoLargo ? "leading-tight" : "tabular-nums truncate"}`}
                        title={h.ticker}>
                    {h.nombre || h.ticker}
                    {/* VOLVIÓ primero: gana sobre cualquier otra marca. */}
                    {h.volvio && (
                      <span className="ml-1 text-[8px] font-normal uppercase tracking-widest text-[var(--t-neg)]"
                            title="Esto ya se había resuelto y volvió a aparecer. El arreglo no aguantó.">
                        ↩ volvió
                      </span>
                    )}
                    {/* DESDE CUÁNDO. Un problema crónico y uno de recién se
                        atienden distinto y hasta hoy se veían igual. Se muestra
                        solo a partir del día: «hace 4 h» no cambia ninguna
                        decisión y ocupa lugar. */}
                    {(h.dias_abierto ?? 0) >= 1 && (
                      <span className="ml-1 text-[8px] font-normal text-[var(--t-text-dim)]"
                            title={`Abierto hace ${h.dias_abierto} días · visto ${h.veces ?? 1} veces`}>
                        {Math.round(h.dias_abierto ?? 0)}d
                        {(h.veces ?? 0) > 1 ? ` ×${h.veces}` : ""}
                      </span>
                    )}
                    {/* CUÁNTOS QUEDAN · CUÁNTOS ERAN. El verde es la única
                        señal de que lo que hiciste sirvió. */}
                    {typeof h.n_casos === "number" && (
                      <span className="ml-1 text-[8px] font-normal tabular-nums text-[var(--t-text-dim)]"
                            title={typeof h.n_casos_foto === "number"
                              ? `Quedan ${h.n_casos} casos. Cuando se sacó la foto eran ${h.n_casos_foto}.`
                              : `${h.n_casos} casos abiertos en este control`}>
                        {h.n_casos} caso{h.n_casos === 1 ? "" : "s"}
                        {typeof h.n_casos_foto === "number" && (
                          <span className={h.n_casos < h.n_casos_foto
                            ? "ml-1 text-[var(--t-pos)]" : "ml-1 text-[var(--t-neg)]"}>
                            {h.n_casos < h.n_casos_foto ? "▼" : "▲"} eran {h.n_casos_foto}
                          </span>
                        )}
                      </span>
                    )}
                    {h.atendido && (
                      <span className="ml-1 text-[8px] font-normal uppercase tracking-widest text-[var(--t-accent)]"
                            title={h.atendido === "aplicado"
                              ? "ya aplicaste su arreglo"
                              : "ya lo votaste, y esta fila no tiene nada más que apretar"}>
                        ✔ {h.atendido}
                      </span>
                    )}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)] truncate"
                        title={h.regla}>
                    {h.regla.replace(/_/g, " ")}
                    {/* ── LA CONFIANZA MEDIDA ──────────────────────────────
                        Sin esto, los 20 hallazgos se leen todos igual aunque el
                        sistema ya sepa que una causa acertó 10/10 y otra nunca se
                        votó. Con esto dejás de revisar 20 cosas con el mismo
                        cuidado y mirás las que el agente todavía no demostró que
                        entiende.

                        Se muestra SOLO cuando hay votos humanos: un «0/0» en cada
                        fila sería ruido en las 20 y no informa nada que la propia
                        ausencia no diga. */}
                    <Confianza c={h.confianza} />
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
                      || h.accion === "arreglo" || h.accion === "salud"
                      || h.accion === "sin_precio" || h.accion === "pata"
                      || h.accion === "espejo"
                      || h.accion === "apuntar") && (
                      <AccionCadena h={h} sim={sims[h.ticker]} simular={simular}
                                    modo={h.accion} />
                    )}
                    {/* EL VOTO va en TODA fila, tenga acción o no. Lo que se está
                        midiendo es si el DIAGNÓSTICO acertó, y eso aplica igual a
                        un hallazgo que solo se mira. Restringirlo a los accionables
                        dejaría sin medir justo a los que todavía no sabemos si
                        valen la pena automatizar. */}
                    {primera && <Voto h={h} />}
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
                  {/* ── LA HORA (§0.br) ────────────────────────────────────
                      **Desde cuándo está abierto, en hora ARGENTINA.** El
                      motivo ya traía un `· 12:25` pegado al final del texto,
                      pero ahí no se puede barrer ni ordenar: hay que leer la
                      frase entera de cada fila para ubicarla en el tiempo.
                      Como columna, el ojo la recorre de una.

                      De HOY muestra la hora; de otro día, la fecha — repetir
                      «22/08» ciento treinta veces gasta ancho sin informar. El
                      `title` siempre trae las dos cosas. */}
                  <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums self-center text-right"
                        title={h.abierto_at
                          ? `abierto desde ${fechaHora(h.abierto_at)}`
                          : "sin registrar"}>
                    {cuando(h.abierto_at)}
                  </span>
                </div>
              ); }); })()}
            </div>
          </section>
        ))}
        </>
      )}
    </div>
  );
}

// LA CONFIANZA MEDIDA, en la fila del hallazgo.
//
// Es lo que hace que el eval set se pague solo: si votar no cambia nada visible,
// nadie vota, y la medición tarda un mes en servir. Acá los votos de hoy mejoran
// la lista de mañana.
//
// **Tres estados y no dos**, que es todo el punto:
//   · con respaldo   ≥ MIN_VOTOS humanos → el % significa algo
//   · sin evidencia  hay votos pero pocos → 2 de 2 NO es «100% de acierto»
//   · nada           nunca se votó → no se muestra, la ausencia ya lo dice
// Y si la medición no se pudo LEER, se marca distinto: «no pude preguntar» no es
// «no hay votos».
export function Confianza({ c }: { c: Hallazgo["confianza"] }) {
  if (c === null) {
    return (
      <span className="ml-1 text-[8px] normal-case text-[var(--t-neg)]"
            title="No se pudo leer la medición — no es que no haya votos.">
        ?
      </span>
    );
  }
  if (!c || !c.humanos) return null;
  const pct = c.precision !== null ? Math.round(c.precision * 100) : null;
  return (
    <span
      className="ml-1 text-[8px] normal-case tabular-nums"
      style={{ color: !c.suficiente ? "#f59e0b"
        : pct === 100 ? "var(--t-pos)"
        : (pct ?? 0) >= 70 ? "var(--t-text-dim)" : "var(--t-neg)" }}
      title={c.suficiente
        ? `Esta causa acertó ${c.aciertos} de ${c.humanos} veces que la votaste.`
        : `Solo ${c.humanos} voto(s): el porcentaje todavía no significa nada.`}
    >
      {c.aciertos}/{c.humanos}{pct !== null && !c.suficiente ? "?" : ""}
    </span>
  );
}

// ── EL VOTO — el insumo del EVAL SET ────────────────────────────────────────
//
// **La capa 1 del roadmap, y la que traba las cinco que siguen.** La tabla y los
// dos endpoints existían desde el 2026-08-17 y **nadie los llamaba**: cero
// fetches en el front, cero llamadas desde jobs. O sea que la compuerta de toda
// la autonomía era una tabla a la que no había por dónde escribir, y por eso
// ninguna decisión de automatizar podía tomarse con un número.
//
// POR QUÉ EL BOTÓN VA ACÁ Y NO EN UNA PANTALLA APARTE
// ====================================================
//
// El juicio ya se emite: cada vez que alguien lee un diagnóstico y decide, está
// diciendo si la causa era la correcta. Lo que faltaba era GUARDARLO. Una
// pantalla de votación separada pide que alguien se acuerde de ir, y lo que no
// está en el camino no se hace — el dataset se seguiría tirando igual, solo que
// con una tab más.
//
// TRES COSAS QUE NO SON OBVIAS
// =============================
//
//  · **Un ✖ sin motivo se rechaza** (lo hace el backend, no este componente): de
//    «está mal» no se aprende nada. Por eso el ✖ abre el campo en vez de votar.
//  · **Votar NO cambia nada del sistema.** No re-clasifica el hallazgo ni corrige
//    el dato: es una anotación sobre el AGENTE, no sobre el bono. Mezclarlas
//    haría que corregir el diagnóstico parezca arreglar el problema.
//  · **UNA VEZ POR PAR (caso, causa), no una por rueda.** El user, con los
//    BOPREALes en 17/17 y los botones ahí otra vez: *«¡otra vez lo mismo, ya lo
//    completé 40 veces y sigue apareciendo!»*. El HALLAZGO reaparece cada rueda
//    y eso está bien —el problema sigue— pero el VOTO mide al AGENTE, no al día:
//    repetirlo no agrega un dato y convierte la pantalla en un formulario que
//    hay que volver a llenar todas las mañanas. El backend manda `ya_votado` y
//    acá se muestra el voto en vez de volver a preguntar. Si el agente cambia de
//    CAUSA es un par nuevo y sí se pregunta; y CAMBIAR el voto sigue estando a
//    un click, porque un voto que no se puede corregir queda mal para siempre.
export function Voto({ h }: { h: Hallazgo }) {
  // Arranca cerrado también cuando la CAUSA ya está probada, no solo cuando este
  // caso ya se votó. Se puede abrir igual desde «cambiar»: una causa probada que
  // empieza a fallar es justo lo que hay que poder registrar, y el ✖ la baja del
  // umbral sola en la próxima lectura.
  const probada = h.confianza?.probada === true;
  // ⚠️ **A UNA OBSERVACIÓN NO SE LE PREGUNTA «¿ACERTÓ?».** El user, mirando tres
  // filas de motores: *«es inentendible si acertó o no, o sea ¿acertó QUÉ? Algunos
  // son siempre SÍ claramente… pero ¿qué hacemos con eso?»*. Cuando el hallazgo
  // es un ERROR copiado del log, no hay nada que acertar — y esos «siempre sí»
  // llegaban a 10/10 y marcaban la causa como lista para automatizar con
  // evidencia que no mide nada. La pregunta útil es otra: **¿te sirve verla?**,
  // que es exactamente el «¿qué hacemos con eso?».
  const observacion = h.pregunta === "observacion";
  // Una observación NO se calla por «causa probada»: probada mide aciertos y acá
  // no se está midiendo eso.
  const [estado, setEstado] = useState<"" | "si" | "no" | "listo" | "error">(
    h.ya_votado || (probada && !observacion) ? "listo" : "");
  const [motivo, setMotivo] = useState("");
  const [causa, setCausa] = useState("");
  const [msg, setMsg] = useState(
    h.ya_votado
      ? (h.pregunta === "observacion"
          ? (h.voto ? "✔ dijiste que te sirve" : "✖ dijiste que es ruido")
          : (h.voto ? "✔ ya votaste: acertó" : "✖ ya votaste: no acertó"))
      : probada
      ? `✔ causa probada (${h.confianza?.aciertos}/${h.confianza?.humanos})`
      : "");

  const { escribir } = useDatos();
  const enviar = useCallback(async (acierta: boolean) => {
    setMsg("");
    try {
      // ⚠️ `escribir` con `relee: ["vista"]` es lo que hace que el voto DEJE
      // HUELLA. La versión anterior olvidaba recargar y el «✔ te sirve» vivía
      // en un `useState` que muere al cambiar de tab: al volver, `h.ya_votado`
      // venía del `data` viejo y los botones reaparecían («me voy de ENCONTRÓ
      // a AHORA, vuelvo, y NO HACE NADA, es clickear al pedo»). Con la capa,
      // una escritura no puede olvidarse de releer: la relectura es el
      // contrato del verbo, no una convención del que llama. Y de yapa es lo
      // que hace que «✖ es ruido» SAQUE la fila: el backend la marca
      // `es_ruido` y la vista la filtra al releer.
      const r = await escribir<{ ok: boolean; error?: string;
                                 duplicado?: boolean }>(
        "/api/ia/av-agent/eval", {
          caso: h.ticker,
          // **El dominio lo dice el BACKEND** (`dominio_eval`), no se deduce
          // del tipo acá: una segunda tabla de dominios se separa de la
          // primera sin dar ningún error (REGLA #9).
          dominio: h.dominio_eval ?? "bono",
          // La CAUSA es la regla: es la unidad que después se automatiza o no.
          causa: h.regla,
          // El TIPO viaja para que el BACKEND decida si esto es un juicio o
          // una observación. El front NO manda el `origen`: si lo mandara,
          // podría anotar un «¿te sirve?» como si moviera la compuerta de
          // autonomía.
          tipo: h.tipo,
          acierta,
          nota: acierta ? "" : motivo.trim(),
          causa_correcta: acierta ? "" : causa.trim(),
        }, ["vista"]);
      if (r.ok) {
        setEstado("listo");
        // ⚠️ **EL DUPLICADO SE DICE** (user, 2026-08-22: «les di que sí y el
        // 17/17 sigue igual»). El backend deduplica el MISMO juicio sobre el
        // MISMO caso (repetirlo no agrega evidencia) — pero devolverlo en
        // silencio hacía que el voto pareciera perdido. El contador solo se
        // mueve con casos NUEVOS o con una corrección (cambiar el veredicto).
        setMsg(r.duplicado
          ? "ya lo habías votado igual — el contador no suma de nuevo"
          : observacion
            ? (acierta ? "✔ te sirve" : "✖ anotado: es ruido")
            : (acierta ? "✔ acertó" : "✖ registrado"));
      }
      else { setEstado("error"); setMsg(r.error ?? "no se pudo guardar"); }
    } catch (e) {
      setEstado("error");
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [h.ticker, h.regla, h.tipo, h.dominio_eval, observacion, motivo, causa,
      escribir]);

  if (estado === "listo") {
    return (
      <span className="mt-1 inline-flex items-center gap-2 text-[9px] text-[var(--t-text-dim)]">
        <span className="text-[var(--t-accent)]">{msg}</span>
        {/* Se puede volver a votar: el servicio guarda TODOS los juicios y la
            historia es el dato. Un voto que no se puede corregir se vota mal
            una vez y queda mal para siempre. */}
        <button onClick={() => { setEstado(""); setMsg(""); }}
                className="uppercase tracking-widest hover:text-[var(--t-accent)]">
          cambiar
        </button>
      </span>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]"
            title={observacion
              ? "Esto no es un diagnóstico: el agente copió un hecho (una línea de ERROR del log, un 500 del proveedor). No hay nada que acertar. Lo que sirve saber es si querés seguir viéndolo."
              : "¿La causa que dio el agente es la correcta? Tu voto no cambia nada del sistema: mide al agente."}>
        {observacion ? "¿te sirve verlo?" : "¿acertó el diagnóstico?"}
      </span>
      {!observacion && (
        <span className="text-[8px] text-[var(--t-text-dim)]">
          entrena al agente — no toca el bono
        </span>
      )}
      <button
        onClick={() => void enviar(true)}
        className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-pos)] hover:text-[var(--t-pos)]"
      >
        {observacion ? "✔ sirve" : "✔ sí"}
      </button>
      <button
        onClick={() => {
          // «No me sirve verla» ES la explicación entera: pedirle una nota es
          // fricción sobre la única respuesta que se puede dar sin investigar.
          if (observacion) { void enviar(false); return; }
          setEstado(estado === "no" ? "" : "no");
        }}
        className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
          estado === "no"
            ? "border-[var(--t-neg)] text-[var(--t-neg)]"
            : "border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-neg)] hover:text-[var(--t-neg)]"}`}
      >
        {observacion ? "✖ es ruido" : "✖ no"}
      </button>
      {/* El ✖ PIDE el motivo antes de mandarse. No es fricción: un «está mal»
          suelto no se puede usar para arreglar la regla, así que sería un voto
          que ocupa lugar y no enseña nada. */}
      {estado === "no" && (
        <div className="w-full flex flex-wrap items-center gap-1.5 border-l-2 border-[var(--t-neg)] pl-2 py-1">
          <input
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
            placeholder="¿cuál era la causa real?"
            className="w-52 bg-transparent border border-[var(--t-border)] px-2 py-0.5 text-[10px] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] outline-none focus:border-[var(--t-accent)]"
          />
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="o una nota explicando por qué"
            className="flex-1 min-w-[180px] bg-transparent border border-[var(--t-border)] px-2 py-0.5 text-[10px] text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] outline-none focus:border-[var(--t-accent)]"
          />
          <button
            disabled={!causa.trim() && !motivo.trim()}
            onClick={() => void enviar(false)}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
          >
            registrar
          </button>
        </div>
      )}
      {estado === "error" && (
        <span className="text-[9px] text-[var(--t-neg)]">{msg}</span>
      )}
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
export const COPY = {
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
  // SOLO LECTURA: no hay `aplicar` porque el agente todavía no toca SALUD —
  // relanzar un job tiene efectos afuera de `mercado.curvas` y se habilita cuando
  // el eval set diga que el diagnóstico acierta.
  salud: {
    simular: "Analizar", aplicar: "", hecho: "", cer: "",
  },
  // SOLO LECTURA, igual que SALUD: el agente explica POR QUÉ no hay precio
  // —sin símbolo · fuera de Primary · pata equivocada · nunca operó· sin
  // actividad hoy— y no toca nada. Dos de esas cinco ni siquiera son nuestras.
  sin_precio: {
    simular: "¿Por qué?", aplicar: "", hecho: "", cer: "",
  },
  // SOLO LECTURA. Tres causas que se arreglan distinto —falta la ficha · la
  // ficha existe SIN ticker · la ficha tiene OTRO ticker— y la segunda es la que
  // más importa distinguir: mandar a dar de alta un título que ya está dado de
  // alta crea un duplicado. El arreglo se hace en Manager → TÍTULOS y por eso el
  // agente no escribe: pisar el catálogo maestro no es una acción de un click.
  espejo: {
    simular: "¿Por qué falta?", aplicar: "", hecho: "", cer: "",
  },
  // LA ÚNICA de rueda que además ESCRIBE. Busca la pata en dólares en las dos
  // fuentes (`mercado.especies` y el catálogo de Primary) y, si hay algo que
  // pedir, la siembra y la suscribe: el motor la levanta en 5s, sin reiniciar.
  // No toca el master — eso exige reiniciar y no se vería hasta la noche.
  pata: {
    simular: "Buscar la pata USD", aplicar: "Pedirla", hecho: "✔ pedida", cer: "",
  },
  // EL ARREGLO de `pata_equivocada`, que es un problema DISTINTO al de arriba
  // aunque compartan tipo: acá la pata existe y cotiza — lo que está mal es a
  // cuál apunta el master. Corrige el campo y de paso la pide, así se ve en el
  // acto. Es la fila que el user votó 17 veces sin que nada la resolviera.
  apuntar: {
    simular: "¿A qué pata apunta?", aplicar: "Apuntar el master",
    hecho: "✔ apuntado", cer: "",
  },
} as const;

export function AccionCadena({ h, sim, simular, modo }: {
  h: Hallazgo;
  sim: Record<string, unknown> | null | undefined;
  simular: Simular;
  modo: Modo;
}) {
  const { escribir } = useDatos();
  // Lo que el user tipeó EN la cadena. Vive acá —y no en el padre— porque es de
  // ESTE hallazgo: un estado compartido haría que el CER de un bono se filtrara
  // al siguiente que se simule.
  const [pedido, setPedido] = useState<Record<string, string>>({});
  const [rechequeando, setRechequeando] = useState(false);
  const [rechequeo, setRechequeo] = useState("");
  // El diagnóstico RECIÉN corrido. Pisa al que vino con la vista: si no, la
  // tarjeta muestra el conteo nuevo arriba de la cadena vieja.
  const [simLocal, setSimLocal] = useState<Record<string, unknown> | null>(null);
  const [resuelto, setResuelto] = useState(false);

  // ⚠️⚠️ **EL RE-CHEQUEO PINTABA EL CONTEO NUEVO ARRIBA DE LA CADENA VIEJA.** El
  // user (2026-08-21), después de dar de alta las 4 contrapartes:
  //
  //     ↻ CHEQUEAR AHORA  →  «0 siguen · 4 se resolvieron»
  //     ...y abajo seguían los 4 casos listados, con «hace 7 d»
  //
  // > *«El volver a chequear dice que sí pero no corta el resto del mensaje ni
  // > nada, mantiene todo en vez de decir que ya está resuelto. No tiene memoria
  // > de los cambios.»*
  //
  // Y sí tenía memoria: el backend los había cerrado. Lo que faltaba era pisar
  // la tarjeta con el diagnóstico recalculado. **Dos verdades contradiciéndose
  // en la misma tarjeta se leen como que el sistema no se enteró** — peor que no
  // haber puesto el botón.
  const rechequear = async (chequeoId: string) => {
    setRechequeando(true);
    setRechequeo("");
    try {
      // `escribir` con relee de la vista: recontrolar MUTA `controles_datos`
      // (cierra los resueltos), y la lista de ENCONTRÓ tiene que enterarse en
      // el momento — no en el próximo poll.
      const r = await escribir<{
        ok: boolean; texto?: string; error?: string; resuelto?: boolean;
        diagnostico?: Record<string, unknown>;
      }>(
        `/api/ia/av-agent/salud/recontrolar?control_id=${encodeURIComponent(chequeoId)}`,
        undefined, ["vista"]);
      setRechequeo(r.ok ? (r.texto ?? "listo") : `✘ ${r.error ?? "falló"}`);
      // La cadena se REEMPLAZA por la recién corrida. Si el backend no la pudo
      // rehacer, se deja la vieja: mejor una foto de hace un rato que ninguna.
      if (r.ok && r.diagnostico) {
        setSimLocal(r.diagnostico);
      }
      // Y si no queda ninguno, la lista de la vista tiene que enterarse: si no,
      // el chequeo sigue en rojo hasta el próximo poll.
      if (r.ok) setResuelto(r.resuelto === true);
    } catch (e) {
      setRechequeo(`✘ ${e instanceof Error ? e.message : String(e)}`);
    }
    setRechequeando(false);
  };
  const copy = COPY[modo];
  // El alta necesita la curva de 1816 (el bono todavía no existe, así que no hay
  // de dónde deducirla); el completar NO — el bono ya está y su rama sale del
  // doc que cargó la mesa.
  const curva = modo === "alta" ? String((h.evidencia ?? {}).curva_1816 ?? "") : "";
  if (modo === "alta" && !curva) return null;
  const corriendo = sim === null && !simLocal;
  const r = (simLocal ?? sim) as Record<string, unknown> | undefined;
  const ok = r?.ok === true;
  const aplicable = r?.aplicable === true;
  const aplicado = r?.aplicado === true;
  const tea = typeof r?.tea === "number" ? (r.tea as number) : null;
  // `chequeos` en las puertas de bonos, `pasos` en las de rueda. Se aceptan las
  // dos y no se renombra ninguna: el nombre lo elige quien arma la cadena, y
  // forzar uno solo obligaría a tocar cuatro services por un campo de display.
  const pasos: Paso[] = Array.isArray(r?.chequeos)
    ? (r.chequeos as Paso[])
    : Array.isArray(r?.pasos) ? (r.pasos as Paso[]) : [];
  const veredicto = r?.veredicto as Veredicto | undefined;
  // **UNA sola fuente decide si se puede aplicar: el veredicto del backend.**
  // Acá convivían dos condiciones distintas (`aplicable`, que miraba la rama, y
  // `bloqueado`, que miraba los pasos) y se contradecían entre sí: GD46 mostraba
  // APLICAR con el cronograma probadamente equivocado, y TMG27 escondía el botón
  // con la cadena entera en verde. Y sumarle un AND «por las dudas» es lo que
  // escondió el botón en TZXA7 — el gate real pasa a ser el más restrictivo, que
  // nadie está mirando. El fallback local es solo para un deploy desparejo.
  // En SALUD **no hay nada que aplicar**: la puerta es de solo lectura. No es un
  // permiso que falta, es que el agente todavía no escribe de ese lado.
  // En `pata` lo decide el BACKEND con un campo explícito: `pedible` trae el
  // símbolo exacto cuando hay algo que pedir, y viene vacío cuando ya está
  // pedida y con precio, cuando no hay pata, o cuando no se pudo leer el
  // catálogo. Las tres son razones distintas para no ofrecer el botón y ninguna
  // se puede deducir de los pasos sin volver a escribir el criterio acá.
  const puedeAplicar = modo === "apuntar"
    // El backend simula devolviendo la PROPUESTA. Sin propuesta no hay nada que
    // apretar: o el caso ya se resolvió solo, o la regla no supo un valor seguro
    // (y adivinar la pata por sufijo es justo lo que REGLA #9 prohíbe).
    ? Boolean((r?.propuesta as Record<string, unknown> | undefined))
    : modo === "pata"
    ? Boolean(r?.pedible)
    : (modo === "salud" || modo === "sin_precio" || modo === "espejo")
    ? false
    : veredicto
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
  // El ANTES → DESPUÉS del arreglo, como texto plano y FUERA del JSX. En el
  // ARREGLO lo que importa es la comparación —ver solo el resultado no dice si
  // mejoró algo, que es toda la pregunta de esa puerta— y armarla acá evita un
  // ternario sobre `unknown` embebido en el markup, que se lee peor y es justo
  // donde el compilador se pone quisquilloso.
  const a0 = (r?.antes ?? null) as { tea?: unknown; paridad?: unknown } | null;
  const antesTxt = modo === "arreglo" && a0
    ? `HOY: TEA ${typeof a0.tea === "number" ? `${(a0.tea * 100).toFixed(2)}%` : "sin TEA"}`
      + ` · paridad ${typeof a0.paridad === "number" ? `${a0.paridad.toFixed(1)}%` : "—"} → `
    : "";

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
      {/* En SALUD no va: ahí `puedeAplicar` es false porque la puerta es de solo
          lectura, no porque el agente haya frenado nada. Pintarlo en rojo diría
          que el chequeo está trabado cuando el diagnóstico salió bien. */}
      {ok && !puedeAplicar && !aplicado && modo !== "salud"
        && modo !== "sin_precio" && modo !== "pata" && modo !== "espejo" && (
        <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-neg)] text-[var(--t-neg)]">
          ✘ Bloqueado
        </span>
      )}
      {/* VOLVER A CHEQUEAR — corre ESE control en el momento. Un tablero que
          dice «la última comprobación fue hace 1 día» y no ofrece rehacerla
          deja al que mira sin saber si el problema sigue existiendo. */}
      {modo === "salud" && h.ticker.startsWith("control:") && (
        <button
          disabled={rechequeando}
          onClick={() => void rechequear(h.ticker)}
          title="Corre este control ahora y dice cuántos siguen"
          className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
        >
          {rechequeando ? "chequeando…" : "↻ chequear ahora"}
        </button>
      )}
      {rechequeo && (
        <span className={`text-[9px] ${resuelto
          ? "text-[var(--t-pos)] font-bold" : "text-[var(--t-accent)]"}`}>
          {rechequeo}
        </span>
      )}
      {/* RESUELTO se dice fuerte y una sola vez. La fila de arriba sigue
          diciendo «4 anomalías sin resolver» hasta el próximo poll —el título
          viene de la corrida guardada— así que sin este cartel la tarjeta se
          contradice sola. */}
      {resuelto && (
        <span className="w-full text-[10px] text-[var(--t-pos)]">
          ✔ Ya no queda ninguno. El título de arriba se actualiza en la próxima
          pasada del agente.
        </span>
      )}
      {r && (
        <span className={`text-[9px] ${r.ok === false ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>
          {r.ok === false && String(r.error ?? "falló")}
          {/* Acá se repetía «assets sin cartera · 8 anomalías sin resolver»,
              que es LITERAL lo que ya dice la fila dos centímetros arriba. Tres
              veces el mismo texto en la misma tarjeta (fila, resumen, veredicto)
              no informa: cansa y hace dudar de si son cosas distintas. */}
          {ok && modo === "espejo" && (
            // LA CAUSA en una frase, y si es UN CAMPO o falta la ficha entera.
            // Es la diferencia entre completar y dar de alta — y dar de alta lo
            // que ya existe crea un duplicado.
            <>
              {String((r.causa as string) ?? "")}
              {r.un_campo === true ? " · falta UN campo, no la ficha" : ""}
            </>
          )}
          {ok && modo === "sin_precio" && (
            // La CAUSA y de quién es. «No es un bug nuestro» es la mitad del
            // valor del diagnóstico: evita perseguir un problema que no existe.
            <>
              {String(r.titulo ?? "")}
              {r.nuestro === false ? " · no es un bug nuestro" : ""}
              {r.simbolo ? ` · pide «${String(r.simbolo).split(" - ")[2] ?? r.simbolo}»` : ""}
            </>
          )}
          {ok && modo === "pata" && (
            // El VEREDICTO en una frase. Los cuatro desenlaces se atienden
            // distinto y por eso se nombran distinto: dos son nuestros (falta
            // pedirla / falta sembrarla y pedirla), uno es del mercado (no hay
            // pata) y el cuarto es «no pude mirar», que JAMÁS puede leerse como
            // los otros tres.
            <>
              {aplicado || r.hecho
                ? `${copy.hecho} · ${String(r.detalle ?? "")}`
                : r.veredicto === "sin_pata"
                ? "no hay pata en dólares — ni sembrada ni en Primary"
                : r.veredicto === "no_pude_mirar"
                ? "no pude leer el catálogo de Primary: no sé si existe"
                : r.veredicto === "con_precio"
                ? `«${String(r.pedible ?? "").split(" - ")[2] ?? ""}» ya se pide y tiene precio`
                : r.pedible
                ? `${r.sembrar ? "hay que sembrarla y pedirla" : "hay que pedirla"}`
                  + `: «${String(r.pedible).split(" - ")[2] ?? ""}»`
                : ""}
            </>
          )}
          {ok && modo === "apuntar" && (
            // **DE dónde A dónde**, cortito y con los dos símbolos a la vista.
            // Es toda la decisión: si la propuesta no es la pata que uno
            // esperaba, no se aprieta. Un «listo para aplicar» sin decir qué se
            // escribe es pedir un OK a ciegas.
            <>
              {r.ya_no_esta
                ? "ya no aparece: se resolvió solo"
                : r.sin_propuesta
                ? "no puedo proponer una pata segura para este caso"
                : (r.aplicadas as number) > 0
                ? `${copy.hecho} · ${String(r.texto ?? "")}`
                : (r.fallidas as number) > 0
                ? `no quedó: ${String(r.texto ?? "")}`
                : (() => {
                    const pr = r.propuesta as Record<string, string> | undefined;
                    const corto = (s: string) => s?.split(" - ")[2] ?? s ?? "";
                    return pr
                      ? `el master dice «${corto(pr.antes)}» y la pata que cotiza `
                        + `es «${corto(pr.propuesto)}»`
                      : "";
                  })()}
            </>
          )}
          {ok && modo !== "salud" && modo !== "sin_precio" && modo !== "pata"
            && modo !== "espejo" && modo !== "apuntar" && (
            <>
              {aplicado ? copy.hecho : ""}
              {/* En el ARREGLO lo que importa es el ANTES → DESPUÉS: ver solo el
                  resultado no dice si mejoró algo, que es toda la pregunta. */}
              {antesTxt}
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

export function InformeMasivo({ run, simular, sims, yaHecho, cerrar }: {
  run: RunMasivo;
  simular: Simular;
  sims: Record<string, Record<string, unknown> | null>;
  /** Cierra el informe en pantalla (marca `visto_at` en el backend). Solo
   *  llega cuando el run NO está corriendo — uno en curso se frena, no se
   *  cierra. */
  cerrar?: () => void | Promise<void>;
  // ⚠️⚠️ **LO APLICADO SALE DEL OBJETO, NO DE UN MAPA EN MEMORIA** (§0.bw).
  //
  // El panel decía «✔ 5 aplicados» y el botón seguía ofreciendo «APLICAR LOS 5
  // LISTOS». Dos motivos, y el segundo es el grave:
  //
  //   · `listos` se calculaba sobre `run.informe`, que es una FOTO congelada:
  //     aplicar no la cambia, así que el botón volvía a ofrecer lo mismo.
  //   · y la marca por fila salía de `sims`, un `useState` — o sea que **al
  //     recargar la página se perdía** y los cinco volvían a figurar sin hacer.
  //
  // Para eso existen los objetos: el estado de un problema no puede vivir en la
  // memoria del navegador. Esto viene de `hallazgos[].atendido`, que lo calcula
  // el backend desde `av_agent_items` y sobrevive al reload.
  yaHecho: Set<string>;
}) {
  const { llamar } = useDatos();
  const [copiado, setCopiado] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  // El PROGRESO del lote. Sin esto el botón aplicaba los 10 —y funcionaba— pero
  // el panel no decía nada: el resultado aparecía en las filas de abajo, fuera
  // de la vista. Una acción que no confirma en el lugar donde se apretó se lee
  // como que no pasó nada, y se vuelve a apretar.
  const [lote, setLote] = useState<{ i: number; ticker: string } | null>(null);
  const [hechoLote, setHechoLote] = useState<{ ok: number; mal: string[] } | null>(null);
  // EL ANÁLISIS con la IA propia. Es una capa ARRIBA del informe determinista,
  // nunca un reemplazo: si el LLM no está, el informe queda igual de completo.
  const [ia, setIa] = useState<string>("");
  const [pensando, setPensando] = useState(false);

  const analizar = async () => {
    setPensando(true);
    try {
      // `llamar`: el análisis con IA CALCULA una lectura del informe, no muta
      // nada que la pantalla dibuje por otro lado.
      const r = await llamar<{ ok: boolean; analisis?: string; error?: string }>(
        `/api/ia/av-agent/masivo/analizar?run_id=${run.id}`);
      setIa(r.ok ? (r.analisis ?? "") : `⚠ ${r.error ?? "no se pudo analizar"}`);
    } catch (e) {
      setIa(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    }
    setPensando(false);
  };

  // Se mira el OBJETO primero y la sesión después: lo segundo cubre el rato
  // entre que aplicás y que la vista se recarga, lo primero cubre todo lo demás.
  const hecho = (f: FilaInforme) =>
    yaHecho.has(f.sujeto.trim().toUpperCase())
    || (sims[f.sujeto] as Record<string, unknown> | undefined)?.aplicado === true;
  const listos = run.informe.filter(
    (f) => f.estado === "listo" && f.accion && !hecho(f));
  // Cuántos de los que el informe dio por listos ya están hechos. Va a la
  // vista SIEMPRE: un botón que pasa de «5 listos» a no estar, sin decir por
  // qué, se lee como que algo se rompió.
  const yaAplicados = run.informe.filter(
    (f) => f.estado === "listo" && f.accion && hecho(f)).length;

  // SECUENCIAL y no en paralelo: cada aplicación escribe en `mercado.curvas` y
  // vuelve a leer la vista. En paralelo se pisan entre sí y el error de uno se
  // pierde entre los otros nueve.
  const aplicarLote = async () => {
    setHechoLote(null);
    const mal: string[] = [];
    let ok = 0;
    for (let i = 0; i < listos.length; i++) {
      const f = listos[i];
      setLote({ i: i + 1, ticker: f.sujeto });
      const r = await simular(f.sujeto, "", true, {}, f.accion as Modo);
      // El RESULTADO de cada uno se cuenta acá y no se deduce de `sims`: el
      // estado de React se actualiza asincrónico y leerlo dentro del loop
      // devolvía el valor viejo — el resumen habría contado mal.
      if (r?.aplicado) ok++;
      else mal.push(f.sujeto);
    }
    setLote(null);
    setHechoLote({ ok, mal });
  };
  const corriendo = run.estado === "corriendo";
  const pct = run.total ? Math.round((run.hechos / run.total) * 100) : 0;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(run.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: queda el <pre> para seleccionar */ }
  };

  return (
    <div className="border border-[var(--t-border)] p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={TITULO}>INFORME #{run.id}</h3>
        <span className={SUB}>
          {run.hechos}/{run.total}
          {corriendo ? ` · ${pct}%` : ` · ${run.estado}`}
          {run.sin_red ? " · sin red" : ""}
          {run.creditos !== null ? ` · ${run.creditos} créditos` : ""}
          {run.resumen?.segundos ? ` · ${run.resumen.segundos}s` : ""}
        </span>
        {/* EL LOTE. Aplicar de a uno los 10 que el informe ya declaró listos es
            trabajo que el informe vino a evitar. No saltea nada: cada uno pasa
            por su propia cadena server-side, uno detrás de otro. */}
        {yaAplicados > 0 && (
          <span className="text-[9px] text-[var(--t-pos)]">
            ✔ {yaAplicados} ya aplicado{yaAplicados === 1 ? "" : "s"}
          </span>
        )}
        {listos.length > 0 && (
          <button
            disabled={!!lote}
            onClick={() => void aplicarLote()}
            className="ml-auto text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
          >
            {lote
              ? `aplicando ${lote.i}/${listos.length} · ${lote.ticker}`
              : `aplicar los ${listos.length} listos`}
          </button>
        )}
        {/* ANALIZAR CON IA — para no tener que sacar el informe de la app. Lo que
            se le pide es el PATRÓN: qué causas dominan, qué huele a bug del
            agente, en qué orden atacar. Los diagnósticos ya están hechos y son
            deterministas; la IA no los toca ni inventa números. */}
        {run.estado !== "corriendo" && (
          <button
            disabled={pensando}
            onClick={() => void analizar()}
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            {pensando ? "analizando…" : "◆ analizar con IA"}
          </button>
        )}
        <button
          onClick={() => void copiar()}
          className={`${listos.length ? "" : "ml-auto "}text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]`}
        >
          {copiado ? "✔ copiado" : "copiar informe"}
        </button>
        {cerrar && (
          <button
            onClick={() => void cerrar()}
            title="Cierra el informe: queda en una línea, reabrible. No borra nada."
            className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            ✕ cerrar
          </button>
        )}
      </div>

      {/* La BARRA de progreso. Con 2-3 minutos de corrida, un spinner sin número
          no distingue «avanzando despacio» de «colgado». */}
      {corriendo && (
        <div className="h-[3px] bg-[var(--t-surface)]">
          <div className="h-full bg-[var(--t-accent)] transition-all"
               style={{ width: `${pct}%` }} />
        </div>
      )}

      {run.error && (
        <span className="text-[10px] text-[var(--t-neg)]">⚠ {run.error}</span>
      )}

      {/* EL RESULTADO DEL LOTE, en el panel donde se apretó. Y NOMBRA a los que
          fallaron: «8 de 10» sin decir cuáles dos obliga a leer las 16 filas de
          abajo para encontrarlos. */}
      {hechoLote && (
        <div className={`border-l-2 pl-3 py-1 ${
          hechoLote.mal.length ? "border-[#f59e0b]" : "border-[var(--t-pos)]"}`}>
          <span className="text-[11px] text-[var(--t-text)]">
            <span className="text-[var(--t-pos)]">✔ {hechoLote.ok} aplicados</span>
            {hechoLote.mal.length > 0 && (
              <span className="text-[#f59e0b]">
                {" · "}{hechoLote.mal.length} no: {hechoLote.mal.join(", ")}
              </span>
            )}
          </span>
          {/* Los motores leen `mercado.curvas` AL ARRANCAR: escribir el dato no
              alcanza para que la mesa vea el número nuevo. Decirlo acá evita la
              conclusión equivocada de que el arreglo no funcionó. */}
          {hechoLote.ok > 0 && (
            <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
              Los motores leen `mercado.curvas` al arrancar: la tasa nueva llega a
              la vista cuando se reinicie `motor_curvas` (fuera de rueda).
            </div>
          )}
        </div>
      )}

      {/* ── EL AGREGADO ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {ORDEN_MASIVO.filter((e) => run.resumen?.por_estado?.[e]).map((e) => (
          <button
            key={e}
            onClick={() => setAbierto(abierto === e ? null : e)}
            className={`text-[9px] uppercase tracking-widest px-2 py-1 border transition-colors ${
              abierto === e ? "border-[var(--t-accent)]" : "border-[var(--t-border)]"}`}
            style={{ color: EST_MASIVO[e].color }}
          >
            {run.resumen.por_estado[e]} {EST_MASIVO[e].label}
          </button>
        ))}
      </div>

      {/* EL ANÁLISIS. Va ARRIBA de los agregados: si uno pidió que la IA lea el
          informe, lo que quiere leer primero es la conclusión. */}
      {ia && (
        <div className="border-l-2 border-[var(--t-accent)] pl-3 py-1">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
            ◆ análisis
          </span>
          {/* `whitespace-pre-wrap`: el modelo devuelve texto plano con saltos, y
              renderizarlo sin respetarlos lo convierte en un párrafo ilegible. */}
          <p className="mt-1 text-[11px] text-[var(--t-text-muted)] leading-relaxed whitespace-pre-wrap">
            {ia}
          </p>
        </div>
      )}

      {/* POR CAUSA — el número que contesta «cuánto trabajo hay de verdad». */}
      {run.resumen?.por_causa && Object.keys(run.resumen.por_causa).length > 0 && (
        <div>
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
            {Object.keys(run.resumen.por_causa).length} causas para {run.hechos} casos
          </span>
          <div className="mt-1 flex flex-col gap-0.5">
            {Object.entries(run.resumen.por_causa).map(([c, n]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-[var(--t-text)] w-8 text-right">
                  {n}
                </span>
                {/* Barra proporcional: qué causa domina se ve antes de leer. */}
                <span className="h-[6px] bg-[var(--t-accent)] opacity-60"
                      style={{ width: `${(n / Math.max(1, run.hechos)) * 200}px` }} />
                <span className="text-[10px] text-[var(--t-text-muted)]">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* El DETALLE del grupo abierto. Cerrado por default: el informe entero es
          para copiar, la pantalla es para decidir dónde mirar. */}
      {abierto && (
        <div className="border-t border-[var(--t-border)] pt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
          {run.informe.filter((f) => f.estado === abierto).map((f, i) => (
            <div key={`${f.sujeto}-${i}`} className="text-[10px] leading-snug">
              <span className="font-bold text-[var(--t-text)]">{f.sujeto}</span>
              <span className="text-[var(--t-text-dim)]"> · {f.regla ?? f.tipo}</span>
              {f.causa && <span className="text-[var(--t-accent)]"> → {f.causa}</span>}
              {/* APLICAR desde el informe. El backend RE-SIMULA y vuelve a correr
                  la cadena entera antes de escribir, así que esto no es un
                  atajo que saltea el pre-flight: es el mismo camino, sin
                  obligar a volver a buscar el bono en la lista. */}
              {/* El botón desaparece cuando ya se hizo: dejarlo puesto al lado
                  de un «✔ aplicado» es la contradicción que el user marcó. */}
              {f.estado === "listo" && f.accion && !hecho(f) && (
                <button
                  disabled={sims[f.sujeto] === null}
                  onClick={() => simular(f.sujeto, "", true, {}, f.accion as Modo)}
                  className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40"
                >
                  {sims[f.sujeto] === null ? "…" : "aplicar"}
                </button>
              )}
              {hecho(f) && (
                <span className="ml-2 text-[9px] text-[var(--t-pos)]">✔ aplicado</span>
              )}
              {(sims[f.sujeto] as Record<string, unknown> | undefined)?.ok === false && (
                <span className="ml-2 text-[9px] text-[var(--t-neg)]">
                  ✘ {String((sims[f.sujeto] as Record<string, unknown>).error ?? "")}
                </span>
              )}
              {f.detalle && (
                <div className="text-[var(--t-text-muted)] pl-3">{f.detalle}</div>
              )}
              {(f.trabas ?? []).slice(0, 3).map((t, j) => (
                <div key={j} className="text-[var(--t-text-dim)] pl-3">
                  · {t.paso}: {t.detalle}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QueImporta({ q, irALista }: {
  q: NonNullable<Vista["que_importa"]>;
  // EL PUENTE al banco de trabajo: (regla, sujeto) → LA LISTA filtrada.
  // Esta sub-tab NO tiene botones propios A PROPÓSITO: es la priorización;
  // el trabajo se hace en LA LISTA, y sin este salto eran dos mundos.
  irALista: (regla: string, sujeto: string) => void;
}) {
  // ⚠️ **SIN PLIEGUE PROPIO.** Antes era una caja colapsable apilada arriba de
  // la lista; ahora es el contenido de una sub-tab, y una sub-tab que además
  // hay que desplegar son dos clics para ver lo que ya elegiste ver.
  const abierto = true;
  // Las bandas se muestran en el orden de la prioridad, no en el del objeto:
  // que `volvio` aparezca tercero porque JSON lo puso ahí sería raro de leer.
  const orden = ["volvio", "estancado", "arrastra", "nuevo"];
  const hay = orden.filter((b) => (q.por_banda[b] ?? 0) > 0);
  return (
    <div className="border border-[var(--t-border)] px-3 py-2">
      <div
        className="w-full flex flex-wrap items-baseline gap-2 text-left"
        title="Un problema que volvió después de arreglarse informa más que uno nuevo: alguien ya lo dio por resuelto y volvió igual."
      >
        <span className="text-[10px] text-[var(--t-text)]">
          de {q.abiertos} problemas abiertos, <b>{q.piden_algo}</b> piden algo
        </span>
        {hay.map((b) => (
          <span key={b} className="text-[9px] tabular-nums"
                style={{ color: BANDA_COLOR[b] }}>
            {q.por_banda[b]} {BANDA_TXT[b]}
          </span>
        ))}
      </div>
      {/* QUÉ UNIVERSO cuenta este número (user, 2026-08-22: «58 de 256?? ¿256
          qué???»). Es la MEMORIA del agente completa —relevada nocturna,
          controles, monitor en vivo— así que es más grande que LA LISTA, que
          es solo la foto de la última relevada. Y lo que el agente DIJO
          (avisos, preguntas) ya no cuenta como problema: se concilia acá. */}
      <p className="mt-1 text-[9px] text-[var(--t-text-dim)]">
        Cuenta TODO lo que el agente recuerda abierto (relevada + controles +
        monitor en vivo), por eso es más que LA LISTA, que es solo la última
        relevada. <b>Acá no se trabaja: se elige por dónde empezar</b> — clic
        en una causa y quedás en LA LISTA filtrada, con los botones. Una fila
        sale de acá cuando su detector deja de verla (pasa a ¿AGUANTAN?) o
        cuando la descartás.
        {(q.comunicaciones ?? 0) > 0 && (
          <> Aparte hay {q.comunicaciones} avisos y preguntas del agente sin
          atender — no son problemas de la base y viven en AHORA y en la
          cabecera.</>
        )}
      </p>
      {/* ── EL RESUMEN POR CAUSA — es el que manda ──────────────────────────
          54 filas donde 30 son la misma causa no son 54 decisiones (user:
          «un número altísimo y no se puede hacer nada»). El grupo dice cuánto
          pesa cada causa Y es el puente al lugar donde se arregla. */}
      {abierto && (q.por_causa?.length ?? 0) > 0 && (
        <div className="mt-2 border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {q.por_causa!.map((g) => (
            <button key={g.regla}
                    onClick={() => irALista(g.regla, "")}
                    title="Abre LA LISTA filtrada por esta causa"
                    className="w-full grid grid-cols-[220px_60px_1fr_auto] gap-2 items-baseline px-2 py-1 text-left hover:bg-[var(--t-surface)]">
              <span className="text-[10px] font-semibold text-[var(--t-text)] truncate">
                {g.regla.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] tabular-nums text-[var(--t-text-muted)]">
                ×{g.n}
              </span>
              <span className="text-[9px] text-[var(--t-text-dim)] truncate">
                {g.sujetos.slice(0, 3).join(" · ")}{g.n > 3 ? " …" : ""}
              </span>
              <span className="text-[9px] tabular-nums whitespace-nowrap"
                    style={{ color: BANDA_COLOR[g.peor_banda] }}>
                {g.piden > 0 ? `${g.piden} piden algo` : BANDA_TXT[g.peor_banda] ?? g.peor_banda}
                {" · hasta "}{Math.round(g.dias_max)}d →
              </span>
            </button>
          ))}
        </div>
      )}
      {abierto && q.filas.length > 0 && q.filas.length < q.abiertos && (
        <p className="mt-2 text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          las {q.filas.length} filas más urgentes (de {q.abiertos}) — el resumen
          de arriba sí está completo
        </p>
      )}
      {abierto && (
        <div className="mt-1 flex flex-col gap-0.5">
          {q.filas.map((f) => (
            <div key={f.clave}
                 className="grid grid-cols-[110px_150px_1fr_auto] gap-2 items-baseline text-[10px]">
              <button onClick={() => irALista("", f.sujeto)}
                      title="Buscarlo en LA LISTA"
                      className="text-left text-[var(--t-text)] truncate hover:text-[var(--t-accent)]">
                {f.sujeto}
              </button>
              <span className="text-[var(--t-text-dim)] truncate uppercase tracking-wide text-[9px]"
                    title={f.regla}>
                {f.regla.replace(/_/g, " ")}
              </span>
              <span className="text-[var(--t-text-muted)] truncate" title={f.titulo}>
                {f.titulo}
              </span>
              <span className="tabular-nums whitespace-nowrap text-[9px]"
                    style={{ color: BANDA_COLOR[f.banda] }}>
                {BANDA_TXT[f.banda] ?? f.banda}
                {" · "}{Math.round(f.dias_abierto)}d
                {f.veces > 1 ? ` ×${f.veces}` : ""}
              </span>
            </div>
          ))}
          {/* ⚠️ **«SIGUE ROTO» Y «NADIE LO MIRÓ» NO SON LO MISMO**, y hasta acá
              se veían idénticos: los dos son una fila abierta. Si el detector
              volvió a correr y a éste no lo refrescó, es que no lo evaluó. */}
          {q.sin_mirar.length > 0 && (
            <div className="mt-2 pt-2 border-t border-[var(--t-border)]">
              <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                sigue abierto pero nadie lo volvió a mirar ({q.sin_mirar.length})
              </span>
              {q.sin_mirar.map((x) => (
                <div key={x.clave} className="text-[10px] text-[var(--t-text-muted)]">
                  {x.sujeto} · {x.regla.replace(/_/g, " ")}
                  {" · "}<span className="text-[var(--t-text-dim)]">
                    {x.origen} no lo re-evalúa hace {Math.round(x.horas_sin_reevaluar)}h
                  </span>
                </div>
              ))}
            </div>
          )}
          {q.filas.length === 0 && (
            <p className="text-[10px] text-[var(--t-text-dim)]">
              Nada abierto.
            </p>
          )}
        </div>
      )}
    </div>
  );
}


export function Seguimiento({ s }: { s: NonNullable<Vista["seguimiento"]> }) {
  const abierto = true;   // es una sub-tab: ya la elegiste, no la pliegues
  return (
    <div className="border border-[var(--t-border)] px-3 py-2">
      <div
        className="w-full flex flex-wrap items-baseline gap-2 text-left"
        title="Un arreglo se da por bueno cuando el problema no vuelve, no cuando se escribe. Cada hito que pasa suma confianza."
      >
        {s.en_prueba > 0 && (
          <span className="text-[10px] text-[var(--t-text)]">
            {s.en_prueba} en prueba
          </span>
        )}
        {s.aguantaron > 0 && (
          <span className="text-[10px] text-[var(--t-pos)]">
            ✔ {s.aguantaron} aguantaron
          </span>
        )}
      </div>
      {/* ⚠️ **UNA FILA POR CAUSA, no una por caso** (user, 2026-08-22: «¿168
          en prueba?? no tiene lógica»). Un lote que arregló 133 patas es UN
          arreglo con un solo reloj: mostrarlo 133 veces tapa a los arreglos
          distintos. El agrupado lo hace el BACKEND (`por_causa`) — el mismo
          criterio para cualquier pantalla que lo lea. */}
      {abierto && (s.por_causa?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {s.por_causa!.map((g) => (
            <div key={g.regla}
                 className="grid grid-cols-[190px_1fr_auto] gap-2 items-baseline text-[10px]">
              <span className="text-[var(--t-text)] truncate" title={g.regla}>
                {g.regla.replace(/_/g, " ")}
                {g.n > 1 && <b className="text-[var(--t-text-muted)]"> ×{g.n}</b>}
              </span>
              <span className="text-[var(--t-text-dim)] truncate"
                    title={g.sujetos.join(", ")}>
                {g.sujetos.slice(0, 4).join(" · ")}{g.n > 4 ? " …" : ""}
              </span>
              <span className="text-[var(--t-text-muted)] tabular-nums">
                {/* Los hitos cumplidos, y CUÁNDO es el próximo control: sin
                    eso, «2/6» no dice si la novedad llega mañana o en tres
                    semanas. */}
                {g.hitos}/{g.de}
                {g.proximo_hito_en_dias !== null
                  ? ` · próximo a los ${g.proximo_hito_en_dias}d`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* El detalle caso por caso solo si el backend todavía no manda el
          agrupado (deploy desparejo): mejor la lista vieja que nada. */}
      {abierto && !(s.por_causa?.length) && s.proximos.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {s.proximos.map((x) => (
            <div key={x.clave}
                 className="grid grid-cols-[110px_1fr_auto] gap-2 items-baseline text-[10px]">
              <span className="text-[var(--t-text)] truncate" title={x.sujeto}>
                {x.sujeto}
              </span>
              <span className="text-[var(--t-text-dim)] truncate" title={x.titulo}>
                {x.regla.replace(/_/g, " ")}
              </span>
              <span className="text-[var(--t-text-muted)] tabular-nums">
                {x.hitos}/{x.de}
                {x.proximo_hito_en_dias !== null
                  ? ` · próximo a los ${x.proximo_hito_en_dias}d`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {abierto && s.proximos.length === 0 && (
        <p className="mt-2 text-[10px] text-[var(--t-text-dim)]">
          Ningún arreglo con el reloj corriendo todavía.
        </p>
      )}
    </div>
  );
}
