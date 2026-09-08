"use client";

// MAPA — la misma tabla de HABILIDADES, leída como estructura. Doc: `docs/AGENT.md` §6.
//
// Pedido del user (2026-09-08): *«no hay nada de lo que tengo que yo pueda ver
// así»*, mirando el grafo que dibuja Google ADK de un agente.
//
// ⚠️ **NO ES UN GRAFO, y no puede serlo.** El dibujo de ADK es un árbol con
// flechas porque ahí hay FLUJO: un agente le pasa la posta al siguiente. Las
// habilidades del AV AGENT **no se hablan entre sí** — no comparten estado, no
// se llaman, no hay orden entre ellas. Dibujarles flechas sería una mentira
// linda. Lo que hay acá es otra cosa: un catálogo con atributos categóricos
// (dominio, ventana, tiene arreglo) y una dimensión temporal (cada cuánto).
// Por eso son dos lecturas de una tabla y no un diagrama.
//
// LA PREGUNTA QUE CONTESTA, y que el listado no: **qué NO se está mirando.**
// Con 27 filas en una lista los huecos son invisibles; en la grilla de
// cobertura una celda vacía se ve de un golpe.
//
// El COLOR significa UNA sola cosa en todo el mapa: **salud**. El dominio se
// codifica por posición (vista DOMINIO) o por etiqueta (vista RITMO), nunca
// por color — dos escalas de color en el mismo dibujo no se leen.
import { ritmo, saludDe, type Habilidad } from "@/components/agente/tipos";

export type ModoMapa = "dominio" | "ritmo";

// El orden en que se leen las ventanas. Lo que no esté acá se agrega al final:
// una ventana nueva en el backend aparece igual, aunque este archivo no la
// conozca. Si el mapa tuviera la lista cerrada, una habilidad declarada podría
// no salir dibujada — que es justo lo contrario de para qué existe (REGLA #10).
const ORDEN_VENTANA = ["rueda", "cierre", "habil", "siempre"];

function ordenar(valores: string[], preferido: string[]): string[] {
  const conocidos = preferido.filter((v) => valores.includes(v));
  const resto = valores.filter((v) => !preferido.includes(v)).sort();
  return [...conocidos, ...resto];
}

function agrupar<T>(filas: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    const actual = m.get(k);
    if (actual) actual.push(f);
    else m.set(k, [f]);
  }
  return m;
}

function tituloDe(h: Habilidad): string {
  const s = saludDe(h);
  return [
    h.que_mira,
    `cada ${ritmo(h.cada_segundos)}${h.ventana !== "siempre" ? ` · solo en ${h.ventana}` : ""}`,
    h.clase === "trabajo" ? "tiene arreglo" : "solo avisa",
    s.txt,
  ].join(" — ");
}

// El cuadradito: RELLENO = tiene botón · CONTORNO = solo avisa. La forma dice
// la clase y el color dice la salud, así que las dos se leen a la vez.
function Marca({ h }: { h: Habilidad }) {
  const s = saludDe(h);
  return (
    <span
      className="w-[7px] h-[7px] shrink-0"
      title={s.txt}
      style={
        h.clase === "trabajo"
          ? { background: s.color }
          : { border: `1px solid ${s.color}`, opacity: 0.75 }
      }
    />
  );
}

export function MapaHabilidades({ habilidades, modo }: {
  habilidades: Habilidad[];
  modo: ModoMapa;
}) {
  if (habilidades.length === 0) {
    return (
      <p className="text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border)] px-2 py-3">
        No llegó ninguna habilidad. No es «no hay ninguna»: es que no se pudo leer.
      </p>
    );
  }

  // ⚠️ **ESTO NO ES «DERIVAR» EN EL SENTIDO QUE PROHÍBE EL CLAUDE.md.** La
  // regla existe para que el front no invente un contador que pueda discrepar
  // con el backend. Acá no hay una segunda fuente: es un PIVOT del mismo array
  // que se está dibujando dos centímetros más arriba, en el mismo render. No
  // puede decir algo distinto de la lista porque es la lista.
  const ventanas = ordenar([...new Set(habilidades.map((h) => h.ventana))], ORDEN_VENTANA);
  // Los dominios se ordenan por TAMAÑO: así la altura de cada columna es el
  // dato —se ve de un vistazo que uno pesa el doble que otro— sin leer números.
  const porDominio = agrupar(habilidades, (h) => h.dominio);
  const dominiosPorPeso = [...porDominio.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const porRitmo = [...agrupar(habilidades, (h) => String(h.cada_segundos)).entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="flex flex-col gap-3">

      {modo === "dominio" ? (
        <div className="grid gap-2 items-start"
             style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {dominiosPorPeso.map(([dom, filas]) => (
            <section key={dom} className="border border-[var(--t-border)]">
              <header className="flex items-baseline justify-between gap-2 px-2 py-1 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
                <h4 className="text-[10px] uppercase tracking-widest font-bold text-[var(--t-text)]">
                  {dom}
                </h4>
                <span className="text-[11px] tabular-nums text-[var(--t-text-muted)]">
                  {filas.length}
                </span>
              </header>
              {[...filas]
                .sort((a, b) => a.cada_segundos - b.cada_segundos
                             || a.nombre.localeCompare(b.nombre))
                .map((h) => (
                  <div key={h.nombre}
                       title={tituloDe(h)}
                       className="flex items-center gap-2 px-2 py-1 border-t border-[var(--t-border)] first:border-t-0">
                    <Marca h={h} />
                    <span className="text-[10px] text-[var(--t-text)] break-all">
                      {h.nombre}
                    </span>
                    <span className="ml-auto shrink-0 text-[9px] tabular-nums text-[var(--t-text-dim)]">
                      {ritmo(h.cada_segundos)}
                      {h.ventana !== "siempre" && (
                        <span className="ml-1 px-1 text-[var(--t-accent)] border border-[var(--t-accent)]">
                          {h.ventana}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
          {porRitmo.map(([segs, filas]) => (
            <div key={segs} className="grid gap-3 px-2 py-1.5"
                 style={{ gridTemplateColumns: "62px 1fr" }}>
              <div className="text-right">
                <div className="text-[11px] tabular-nums text-[var(--t-text)]">
                  {ritmo(Number(segs))}
                </div>
                {/* ⚠️ Acá había un «×N/día» sacado del ritmo. Es MENTIRA para
                    todo lo que tiene ventana: `cada 12h` con ventana `cierre`
                    corre UNA vez, no dos. El ritmo es un techo, no una
                    frecuencia — y un número que dice algo falso es peor que
                    ningún número. Queda cuántas habilidades hay en el carril,
                    que sí es cierto. */}
                <div className="text-[8px] text-[var(--t-text-dim)] tabular-nums">
                  {filas.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {[...filas]
                  .sort((a, b) => a.dominio.localeCompare(b.dominio)
                               || a.nombre.localeCompare(b.nombre))
                  .map((h) => (
                    <span key={h.nombre}
                          title={tituloDe(h)}
                          className="flex items-center gap-1.5 px-1.5 py-0.5 border border-[var(--t-border)] text-[9px] text-[var(--t-text)]">
                      <Marca h={h} />
                      {h.nombre}
                      <span className="text-[8px] uppercase tracking-wider text-[var(--t-text-dim)]">
                        {h.dominio.slice(0, 3)}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COBERTURA ────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] text-[var(--t-text-dim)] mb-1">
          <b className="text-[var(--t-text-muted)]">Cobertura</b> — dominio × ventana.
          Lo que una lista no contesta: <b>qué no se está mirando</b>. Cada celda
          vacía es una combinación que hoy no cubre nadie.
        </p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-[10px] tabular-nums">
            <thead>
              <tr>
                <th className="border border-[var(--t-border)] px-2 py-1" />
                {ventanas.map((v) => (
                  <th key={v}
                      className="border border-[var(--t-border)] px-2 py-1 uppercase tracking-widest text-[8px] font-normal text-[var(--t-text-dim)] bg-[var(--t-surface)]">
                    {v}
                  </th>
                ))}
                <th className="border border-[var(--t-border)] px-2 py-1 uppercase tracking-widest text-[8px] font-normal text-[var(--t-text-dim)] bg-[var(--t-surface)]">
                  total
                </th>
              </tr>
            </thead>
            <tbody>
              {dominiosPorPeso.map(([dom, filas]) => (
                <tr key={dom}>
                  <td className="border border-[var(--t-border)] px-2 py-1 uppercase tracking-widest text-[9px] text-[var(--t-text-muted)] bg-[var(--t-surface)]">
                    {dom}
                  </td>
                  {ventanas.map((v) => {
                    const n = filas.filter((h) => h.ventana === v).length;
                    return (
                      <td key={v}
                          className={`border border-[var(--t-border)] px-2 py-1 text-center ${
                            n ? "text-[var(--t-text)]" : "text-[var(--t-border)]"}`}>
                        {n || "—"}
                      </td>
                    );
                  })}
                  <td className="border border-[var(--t-border)] px-2 py-1 text-center text-[var(--t-text-muted)]">
                    {filas.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── LEYENDA ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[var(--t-text-dim)]">
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] bg-[var(--t-text-muted)]" /> relleno: tiene arreglo
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] border border-[var(--t-text-muted)]" /> contorno: solo avisa
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] bg-[var(--t-pos)]" /> miró bien
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] bg-[var(--t-accent)]" /> no pudo mirar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] bg-[var(--t-neg)]" /> reventó
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-[7px] h-[7px] bg-[var(--t-text-dim)]" /> todavía no le tocó
        </span>
        <span className="ml-auto">
          Todo sale de <b className="text-[var(--t-text-muted)]">HABILIDADES</b>: lo que no
          está declarado no aparece acá.
        </span>
      </div>
    </div>
  );
}
