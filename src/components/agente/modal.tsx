"use client";

// EL MODAL DEL AV AGENT. Doc: `docs/AGENT.md` §6.
//
// TRES pantallas y no siete:
//
//   AHORA      lo que apareció HOY. Informativo. Un solo botón: «leído».
//   ENCONTRÓ   lo abierto que TIENE ARREGLO. Acá se trabaja.
//   HISTORIAL  el libro: qué escribió el agente, de qué valor a qué valor.
//
// Se fueron VIGILANCIA (era un segundo depósito de los mismos problemas, con
// otro reloj y otra tabla — la propia pantalla se lo explicaba al usuario) y
// ¿AGUANTAN? (su número sumaba dos cosas que no se tocan). Y con ellas todo el
// sistema de votos y eval set: *«generó demasiada complejidad en algo que no
// funcionaba»*.
//
// ⚠️ **Ningún contador se suma acá.** Todos vienen del backend, de la misma
// query que dibuja su lista, así que no pueden decir cosas distintas.
import { useState } from "react";

import { useAgente } from "@/components/agente/datos";
import { TabAhora } from "@/components/agente/tab-ahora";
import { TabEncontro } from "@/components/agente/tab-encontro";
import { TabCronicos } from "./tab-cronicos";
import { TabHistorial } from "@/components/agente/tab-historial";
import { PanelHabilidades } from "@/components/agente/panel-habilidades";
import { TabLab } from "@/components/agente/tab-lab";
import { fechaHora, hace } from "@/components/agente/tipos";

type Tab = "ahora" | "encontro" | "patrones" | "historial" | "habilidades" | "lab";


export default function AgenteModal() {
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<Tab>("ahora");
  // Lo que el botón «investigar» de una fila le pasa a la tab LAB.
  const [aInvestigar, setAInvestigar] = useState<{ caso: string } | null>(null);

  // ⚠️ El TIPO lo decide el BACKEND: la fila viene con `investigable` y la tab
  // LAB elige el caso de su propia lista. Acá no hay ninguna copia de qué se
  // puede investigar — tenerla sería la REGLA #9 otra vez: dos verdades sin
  // árbitro, donde agregar una investigación no mostraría el botón y sacar una
  // dejaría uno que falla, sin que nada avise.
  function investigarFila(sujeto: string) {
    setAInvestigar({ caso: sujeto });
    setTab("lab");
  }
  const d = useAgente(abierto);
  const v = d.vista;

  // El resultado de «mirar ahora». Sale ENTERO del backend: cuántas corrieron y
  // cuántas quedaron afuera porque la rueda está cerrada. Acá no se suma nada.
  const [mirando, setMirando] = useState(false);
  const [pasada, setPasada] = useState("");

  async function mirarAhora() {
    setMirando(true);
    setPasada("");
    try {
      const r = await d.escribir<{
        corridas?: unknown[]; fuera_de_ventana?: { nombre: string }[];
      }>("/api/agente/correr", {}, ["vista"]);
      const n = r.corridas?.length ?? 0;
      const fuera = r.fuera_de_ventana?.length ?? 0;
      setPasada(
        `miró ${n}` +
        (fuera ? ` · ${fuera} esperan a que abra la rueda` : "") +
        (!n && !fuera ? " — no había nada que mirar" : ""));
    } catch {
      setPasada("no pude correr la pasada");
    } finally { setMirando(false); }
  }

  const nAhora = v?.ahora.total ?? 0;
  const nEncontro = v?.encontro.total ?? 0;
  const nVolvio = v?.reincidencias.total ?? 0;
  const vivo = v?.latido.vivo ?? false;

  // ⚠️ **TRES estados, no dos.** «No pude leer al agente» NO se puede dibujar
  // igual que «el agente está tranquilo»: son la misma imagen y significan lo
  // contrario. Es la misma regla que rige adentro (una corrida que no pudo
  // mirar no cierra nada), aplicada al botón.
  const roto = Boolean(d.error.vista);
  const color = roto ? "var(--t-neg)"
    : vivo ? "var(--t-pos)"
    : "var(--t-text-dim)";

  return (
    <>
      {/* ⚠️⚠️ **ESTE BOTÓN SE DIBUJA SIEMPRE.** No hay ninguna condición que lo
          esconda, y eso es a propósito: el modal viejo hacía `return null`
          cuando `/vista` fallaba, así que el agente **desaparecía de la barra
          justo cuando algo andaba mal** — y no volvía, porque nadie podía
          apretarlo para reintentar. Un monitor que se esconde cuando se rompe
          es indistinguible de un monitor que no existe. */}
      <button
        onClick={() => setAbierto(true)}
        title={roto ? `No pude leer al agente: ${d.error.vista}`
          : vivo ? `El agente está mirando (última pasada hace ${hace(v?.latido.hace_s ?? null)})`
          : "El agente NO está mirando"}
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
      >
        {/* El círculo se apaga SOLO cuando el latido envejece: nadie tiene que
            acordarse de apagarlo. */}
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        AV AGENT
        {nAhora > 0 && (
          <span className="tabular-nums text-[var(--t-accent)]">{nAhora}</span>
        )}
        {nVolvio > 0 && (
          <span className="tabular-nums text-[var(--t-neg)]" title="reincidencias">
            ⚠{nVolvio}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4"
             onClick={() => setAbierto(false)}>
          <div className="w-full max-w-5xl bg-[var(--t-panel)] border border-[var(--t-border)] mt-10"
               onClick={(e) => e.stopPropagation()}>
            {/* ── Cabecera ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--t-border)] flex-wrap">
              <span className="text-[11px] font-bold tracking-widest text-[var(--t-accent)]">
                AV AGENT
              </span>
              <span className="text-[9px] text-[var(--t-text-dim)]">
                {vivo ? "mirando" : "detenido"} · última pasada{" "}
                {fechaHora(v?.latido.at ?? null)}
              </span>
              {/* ⚠️ **EL BOTÓN QUE NO HACÍA NADA** (AGENT.md §0.dz). Disparaba
                  la pasada y TIRABA el resultado, así que «corrieron 12» y «no
                  le tocaba a ninguna» se veían idénticos: un botón mudo. Ahora
                  el backend fuerza el ritmo (nunca la ventana) y devuelve quién
                  corrió y quién quedó afuera por la rueda — y eso se dice acá,
                  sin sumar nada en el navegador. */}
              <button
                disabled={mirando}
                onClick={() => void mirarAhora()}
                className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
              >
                {mirando ? "mirando…" : "↻ mirar ahora"}
              </button>
              {pasada && !mirando && (
                <span className="text-[9px] text-[var(--t-text-dim)]">{pasada}</span>
              )}
              <button onClick={() => setAbierto(false)}
                      className="ml-auto text-[11px] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
                ✕
              </button>
            </div>

            {/* ── LA ALARMA. Va arriba de todo porque la tabla que la
                   alimenta DEBE estar vacía: si tiene filas, algo que dimos
                   por arreglado se rompió de nuevo. ──────────────────────── */}
            {nVolvio > 0 && (
              <div className="px-4 py-2 border-b border-[var(--t-neg)] bg-[var(--t-surface)]">
                <p className="text-[10px] font-bold text-[var(--t-neg)]">
                  ⚠ {nVolvio} REINCIDENCIA(S) — un arreglo que aplicamos no sirvió
                  {/* Las apagadas se nombran acá y no se esconden: sin esto, un
                      cartel que ayer decía 1 y hoy no está se lee como «lo
                      borraron». La fila sigue en la tabla y en HISTORIAL. */}
                  {Boolean(v?.reincidencias.historicas) && (
                    <span className="ml-2 font-normal text-[var(--t-text-muted)]">
                      · {v?.reincidencias.historicas} ya cerrada(s), en el historial
                    </span>
                  )}
                </p>
                {v?.reincidencias.filas.slice(0, 5).map((r) => (
                  <p key={r.id} className="text-[9px] text-[var(--t-text-muted)]">
                    {r.sujeto} · {r.regla} · aguantó {Number(r.dias_aguanto).toFixed(1)} días
                    {" "}(arreglo «{r.arreglo_aplicado || "?"}») · volvió {fechaHora(r.volvio_at)}
                  </p>
                ))}
              </div>
            )}

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div className="flex gap-1 px-4 border-b border-[var(--t-border)]">
              {([
                ["ahora", "AHORA", nAhora, "lo de hoy · informativo"],
                ["encontro", "ENCONTRÓ", nEncontro, "lo que tiene arreglo"],
                // ⚠️ PATRONES contesta una pregunta que ninguna otra tab hace:
                // «qué pasa SIEMPRE». Un job que no escribió hoy y uno que no
                // escribe todos los días se ven idénticos en AHORA — y al
                // primero se lo relanza, al segundo relanzarlo lo TAPA.
                // El badge cuenta los ACTIVOS: lo que ya se cortó no es trabajo.
                ["patrones", "PATRONES", v?.cronicos?.total ?? null,
                 "lo que pasa siempre → mejorar"],
                ["historial", "HISTORIAL", null, "lo que el agente escribió"],
                // HABILIDADES es una tab PROPIA, no un panel pegado al costado
                // de las otras: lo que el agente sabe hacer y cuándo miró cada
                // cosa no es un accesorio de la lista de hoy.
                ["habilidades", "HABILIDADES", v?.habilidades.length ?? null,
                 "qué sabe hacer y cuándo miró"],
                // LAB: donde el agente frena, esto sigue.
                ["lab", "LAB", null, "investigá por qué pasó"],
              ] as [Tab, string, number | null, string][]).map(([k, label, n, pie]) => (
                <button key={k} onClick={() => setTab(k)}
                        className={`px-3 py-1.5 text-[10px] font-semibold tracking-widest border-b-2 -mb-px transition-colors ${
                          tab === k ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                                    : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]"}`}>
                  {label}
                  {n !== null && <span className="ml-1.5 tabular-nums opacity-60">{n}</span>}
                  <span className="block text-[8px] font-normal tracking-normal text-[var(--t-text-dim)]">
                    {pie}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Cuerpo ───────────────────────────────────────────────── */}
            <div className="overflow-y-auto max-h-[74vh] p-4">
              {d.error.vista && (
                <p className="text-[10px] text-[var(--t-neg)] mb-2">
                  No pude leer el agente: {d.error.vista}
                </p>
              )}
              {!v && d.cargando && (
                <p className="text-[11px] text-[var(--t-text-muted)]">cargando…</p>
              )}
              {v && tab === "ahora" && (
                <TabAhora
                  filas={v.ahora.filas}
                  investigar={investigarFila}
                  marcarLeidos={async (ids) => {
                    await d.escribir("/api/agente/leidos", { ids }, ["vista"]);
                  }}
                  ignorar={async (id) => {
                    await d.escribir("/api/agente/ignorar", { id }, ["vista"]);
                  }}
                />
              )}
              {v && tab === "encontro" && (
                <TabEncontro
                  filas={v.encontro.filas}
                  porHabilidad={v.encontro.por_habilidad}
                  preview={(id) => d.calcular("/api/agente/preview", { id })}
                  aplicar={(id, datos) =>
                    d.escribir("/api/agente/aplicar", { id, datos }, ["vista"])}
                  ignorar={async (id) => {
                    await d.escribir("/api/agente/ignorar", { id }, ["vista"]);
                  }}
                />
              )}
              {v && tab === "patrones" && <TabCronicos v={v} />}
              {tab === "historial" && <TabHistorial leer={d.leer} />}
              {tab === "lab" && (
                <TabLab
                  // La `key` remonta la tab cuando se llega desde otra fila:
                  // así el caso nuevo entra como valor inicial y no hay que
                  // sincronizar una prop hacia el estado.
                  key={aInvestigar?.caso ?? "libre"}
                  leer={d.leer}
                  casoInicial={aInvestigar}
                  investigar={(tipo, caso) => d.calcular(
                    "/api/agente/lab/investigar", { tipo, caso })} />
              )}
              {v && tab === "habilidades" && (
                <PanelHabilidades habilidades={v.habilidades}
                                  correr={(n) => d.escribir(
                                    "/api/agente/correr", { habilidad: n },
                                    ["vista"])}
                                  explicar={(n) => d.calcular(
                                    "/api/agente/explicar", { habilidad: n })} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
