"use client";

// Tab CONTROL (agenda): qué está monitoreando hoy, con su ritmo real.
import { useState } from "react";
import { haceCuanto, AgendaVista, cuandoCorre, SUB, cuando } from "@/components/av-agent/tipos";

// ── TAB CONTROL — QUÉ ESTÁ HACIENDO EL AGENTE, HOY ──────────────────────────
//
// Pedido del user (2026-08-22): *«que figure todo lo que el agente está
// monitoreando durante el día, actualización de la última vez y eso… es como si
// viniera mi jefe y me diga qué estás haciendo y vea desglosado todo lo que
// hago. De esa manera alguien puede ver fácil si hay algo que NO está
// haciendo»*.
//
// **La última frase manda el diseño.** SKILLS ya contesta *qué sé hacer*; lo que
// faltaba es *¿lo estoy haciendo?*, y eso solo sale de cruzar el catálogo con
// las corridas reales. Por eso el eje de la pantalla es **la RUTINA que corre**
// (el job), no el dominio: si un job está caído, las doce piezas que viven
// adentro están ciegas al mismo tiempo — agrupado por dominio se verían doce
// problemas distintos en vez de una sola causa.
//
// El front NO calcula nada: los cuatro números y el veredicto de atraso los
// arma `api/services/av_agent_agenda.py`. Recalcular acá sería la falla que ya
// nos costó tres incidentes: dos copias del mismo criterio que se contradicen.
export function TabAgenda({ v, recargar }: {
  v: AgendaVista | null;
  recargar: () => void | Promise<void>;
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [todo, setTodo] = useState(false);

  if (!v) {
    return <p className="text-[11px] text-[var(--t-text-muted)]">Cargando…</p>;
  }
  if (!v.filas.length) {
    return (
      <p className="text-[11px] text-[var(--t-neg)]">
        No pude armar la agenda. Esto NO quiere decir que el agente esté
        parado — quiere decir que no puedo verlo, que es peor.
      </p>
    );
  }

  const abrir = (k: string) => setAbiertas((s) => {
    const n = new Set(s);
    if (n.has(k)) { n.delete(k); } else { n.add(k); }
    return n;
  });

  // El nombre del job en legible. `jobs.controles_datos` → `controles datos`.
  // El nombre técnico igual viaja en el `title`: la pantalla se lee, pero
  // después alguien tiene que ir a buscar ese job al Droplet.
  const legible = (j: string) => j.replace(/^jobs\./, "").replace(/_/g, " ");

  // El color del renglón. Tres estados, no dos: **`null` no es verde**. Un job
  // que no pude juzgar (sin schedule legible o sin ninguna corrida registrada)
  // pintado de verde sería exactamente la mentira que esta tab vino a impedir.
  const color = (a: boolean | null) =>
    a === true ? "var(--t-neg)" : a === false ? "var(--t-pos)" : "#f59e0b";

  return (
    <div className="flex flex-col gap-3">
      {/* LOS CUATRO NÚMEROS. `sin juzgar` va SIEMPRE, aunque sea 0: sin él,
          «0 atrasadas» se lee como «todo al día» cuando puede ser «no pude
          mirar tres». */}
      <div className="flex flex-wrap items-baseline gap-3 border border-[var(--t-border)] px-2.5 py-1.5">
        <span className="text-[11px] text-[var(--t-text)]">
          <strong className="tabular-nums">{v.piezas}</strong> cosas monitoreadas
          {" "}en <strong className="tabular-nums">{v.filas.length}</strong> rutinas
        </span>
        <span className={SUB}>
          <span className="text-[var(--t-pos)]">{v.al_dia}</span> al día ·{" "}
          <span style={{ color: v.atrasados ? "var(--t-neg)" : undefined }}>
            {v.atrasados}
          </span> atrasadas ·{" "}
          <span style={{ color: v.sin_juzgar ? "#f59e0b" : undefined }}>
            {v.sin_juzgar}
          </span> sin poder juzgar
        </span>
        <button
          onClick={() => { setTodo((t) => !t); setAbiertas(new Set()); }}
          className="ml-auto text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] hover:text-[var(--t-accent)]"
        >
          {todo ? "plegar" : "ver todo"}
        </button>
        <button onClick={() => void recargar()}
                className="text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)]">
          ↻
        </button>
      </div>

      {/* UNA FILA POR RUTINA. Poco texto y la hora bien: cada cuánto debería
          correr, cuándo corrió de verdad, cómo salió y qué dejó abierto. */}
      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {v.filas.map((f) => {
          const ab = todo || abiertas.has(f.job);
          return (
            <div key={f.job}>
              <button
                onClick={() => abrir(f.job)}
                className="w-full grid grid-cols-[3px_minmax(0,1fr)_120px_92px_56px_46px] items-baseline gap-2 px-2 py-1 text-left hover:bg-[var(--t-surface)]"
              >
                <span className="self-stretch" style={{ background: color(f.atrasado) }} />
                <span className="min-w-0">
                  <span className="text-[11px] font-semibold text-[var(--t-text)]" title={f.job}>
                    {legible(f.job)}
                  </span>
                  {f.resumen && (
                    <span className="ml-2 text-[9px] text-[var(--t-text-dim)] truncate">
                      {f.resumen}
                    </span>
                  )}
                </span>
                {/* CADA CUÁNTO DEBERÍA. Sale del crontab real, no de una lista
                    en el front: un horario copiado a mano se desincroniza el
                    día que se cambia el cron y nadie se entera. */}
                <span className="text-[9px] text-[var(--t-text-muted)] truncate"
                      title={f.cada}>
                  {cuandoCorre(f.cada)}
                </span>
                {/* CUÁNDO CORRIÓ DE VERDAD, en hora argentina. */}
                <span className="text-[9px] tabular-nums whitespace-nowrap"
                      style={{ color: color(f.atrasado) }}
                      title={f.hace_s === null ? "sin corridas registradas"
                                               : haceCuanto(f.ultima)}>
                  {f.ultima ? cuando(f.ultima) : "nunca"}
                </span>
                {/* QUÉ ENCONTRÓ Y SIGUE ABIERTO. Es lo que separa «corrió» de
                    «sirvió»: un job verde que hace un mes no encuentra nada
                    puede estar mirando una tabla vacía. */}
                <span className="text-[9px] tabular-nums text-right"
                      style={{ color: f.encontrados ? "#f59e0b" : "var(--t-text-dim)" }}
                      title="hallazgos suyos todavía abiertos">
                  {f.encontrados || "—"}
                </span>
                <span className="text-[9px] tabular-nums text-right text-[var(--t-text-dim)]">
                  {ab ? "▾" : "▸"} {f.piezas.length}
                </span>
              </button>
              {ab && (
                <ul className="bg-[var(--t-surface)] border-t border-[var(--t-border)]">
                  {f.piezas.map((pz) => (
                    <li key={pz.nombre}
                        className="grid grid-cols-[14px_170px_minmax(0,1fr)] items-baseline gap-2 pl-4 pr-2 py-0.5">
                      {/* Quién lo hace: una función o el modelo. Es el dato que
                          decide cuánto confiar en el resultado. */}
                      <span className="text-[8px] text-[var(--t-text-dim)]"
                            title={pz.usa_ia === "no" ? "lo hace una función, sin IA"
                              : pz.usa_ia === "si" ? "depende del modelo"
                              : "usa IA solo para redactar"}>
                        {pz.usa_ia === "no" ? "ƒ" : "IA"}
                      </span>
                      <span className="text-[10px] text-[var(--t-text)] truncate"
                            title={pz.nombre}>
                        {pz.nombre}
                      </span>
                      <span className="text-[9px] text-[var(--t-text-muted)] truncate"
                            title={pz.que_hace}>
                        {pz.que_hace}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className={SUB}>
        el ritmo sale del crontab y la corrida de <span className="font-mono">job_runs</span>
        {" "}— nada de esto está escrito a mano acá, así que una rutina nueva
        aparece sola
        {(v.a_pedido ?? 0) > 0 && (
          <> · otras <strong className="tabular-nums">{v.a_pedido}</strong>{" "}
          habilidades no corren solas, se usan a pedido (SKILLS)</>
        )}
      </p>
    </div>
  );
}
