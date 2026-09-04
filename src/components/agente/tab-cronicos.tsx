/** TAB «PATRONES» — LO QUE PASA SIEMPRE.
 *
 *  ⚠️ **Es una pregunta distinta de las otras tres, y por eso es una tab y no
 *  un filtro.** AHORA contesta «qué pasa hoy», ENCONTRÓ «qué tiene arreglo» e
 *  HISTORIAL «qué hizo el agente». Esta contesta **«qué pasa siempre»**, y es
 *  la única que lleva a MEJORAR algo en vez de arreglarlo de nuevo.
 *
 *  Un job que no escribió hoy y uno que no escribe todos los días se ven
 *  idénticos mirando un hallazgo por vez. Sólo el patrón los separa — y la
 *  diferencia no es de grado: al primero se lo relanza, al segundo relanzarlo
 *  lo TAPA.
 *
 *  El front NO deriva nada acá: el conteo, la mediana, la separación entre
 *  activo e histórico y hasta los umbrales de la leyenda vienen del backend
 *  (`agente/vista.cronicos`), en la misma query que dibuja la lista.
 */
"use client";

import { fechaHora, type Cronico, type Vista } from "@/components/agente/tipos";

/** Una duración legible. Un `3600` no se lee; `1,0h` sí — y la diferencia
 *  entre 3 minutos y 2 horas es TODA la conclusión. */
function dur(s?: number | null): string {
  const n = Number(s ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 90) return `${Math.round(n)}s`;
  if (n < 5400) return `${Math.round(n / 60)}m`;
  if (n < 86400) return `${(n / 3600).toFixed(1)}h`;
  return `${(n / 86400).toFixed(1)}d`;
}

/** ⚠️ FUERA del render, a propósito: un componente declarado adentro se vuelve
 *  a crear en cada dibujo y React lo trata como otro componente — pierde estado
 *  y remonta la tabla entera en cada poll. Lo caza el lint (React 19). */
function Fila({ f, apagado }: { f: Cronico; apagado?: boolean }) {
  return (
    <tr className={`border-t border-[var(--t-border)] ${apagado ? "opacity-50" : ""}`}>
      <td className="py-1 pr-3 text-right tabular-nums font-bold"
          style={{ color: apagado ? undefined : "var(--t-neg)" }}>
        {f.episodios}×
      </td>
      <td className="py-1 pr-2">{f.abiertos ? "●" : ""}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{dur(f.mediana_s)}</td>
      <td className="py-1 pr-4 text-right tabular-nums text-[var(--t-text-dim)]">
        {dur(f.peor_s)}
      </td>
      <td className="py-1 pr-3 text-[var(--t-text)]">{f.sujeto}</td>
      <td className="py-1 pr-3 text-[var(--t-text-muted)]">{f.regla}</td>
      <td className="py-1 pr-3 text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
        {f.habilidad}
      </td>
      <td className="py-1 tabular-nums text-[var(--t-text-dim)] whitespace-nowrap">
        {fechaHora(f.ultima)}
      </td>
    </tr>
  );
}

function Cabecera() {
  return (
    <thead>
      <tr className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
        <th className="text-right pr-3 pb-1">veces</th>
        <th className="pr-2 pb-1" />
        <th className="text-right pr-3 pb-1" title="mediana de cuánto duró cada episodio">
          media
        </th>
        <th className="text-right pr-4 pb-1">peor</th>
        <th className="text-left pr-3 pb-1">qué</th>
        <th className="text-left pr-3 pb-1">regla</th>
        <th className="text-left pr-3 pb-1">habilidad</th>
        <th className="text-left pb-1">última</th>
      </tr>
    </thead>
  );
}

export function TabCronicos({ v }: { v: Vista }) {
  const c = v.cronicos;
  if (!c) return <p className="text-[10px] text-[var(--t-text-dim)]">sin datos</p>;

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-[var(--t-text-muted)]">
        Un <b>episodio</b> es una vez que el problema <b>nació</b> — no las veces
        que se lo vio. Desde <b>{c.desde_episodios}</b> episodios en{" "}
        {c.ventana_dias} días ya no es un incidente: es una configuración mal
        puesta, y arreglarla otra vez la <b>tapa</b>.
      </p>

      {c.activos.length === 0 ? (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Nada crónico. Todo lo que apareció en {c.ventana_dias} días es puntual.
        </p>
      ) : (
        <div>
          <h3 className="text-[10px] font-bold tracking-widest text-[var(--t-neg)]">
            SIGUEN PASANDO
            <span className="ml-2 font-normal text-[var(--t-text-dim)]">
              · última vez en {c.dias_activo} días · ● = abierto ahora
            </span>
          </h3>
          {/* La tabla scrollea SOLA: el modal no puede scrollear horizontal. */}
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-[10px] tabular-nums">
              <Cabecera />
              <tbody>{c.activos.map((f) => (
                <Fila key={`${f.habilidad}/${f.sujeto}/${f.regla}`} f={f} />
              ))}</tbody>
            </table>
          </div>
          <div className="mt-3 text-[9px] text-[var(--t-text-muted)] leading-relaxed
                          border-l-2 border-[var(--t-border)] pl-3">
            <p>
              <b>La columna que decide es MEDIA.</b> Cuarenta episodios de tres
              minutos no son «se cae seguido»: son un umbral demasiado sensible,
              y se arregla cambiando un número. Cuarenta de dos horas sí son un
              problema de verdad, y hay que hablar con quien lo rompe.
            </p>
            <p className="mt-1">
              ⚠️ La duración mide cuánto vivió el <b>hallazgo</b>, no cuánto
              estuvo roto el mundo: tiene un piso puesto por la ventana del
              propio detector.
            </p>
          </div>
        </div>
      )}

      {c.historicos.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold tracking-widest text-[var(--t-text-dim)]">
            YA NO PASAN
            <span className="ml-2 font-normal">
              · fueron crónicos y se cortaron — no compiten por tu atención
            </span>
          </h3>
          <div className="overflow-x-auto mt-1">
            <table className="w-full text-[10px] tabular-nums">
              <Cabecera />
              <tbody>{c.historicos.map((f) => (
                <Fila key={`${f.habilidad}/${f.sujeto}/${f.regla}`} f={f} apagado />
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
