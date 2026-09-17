"use client";

// Cada paso del ciclo en una línea. Lo comparten la conversación del LAB y la
// traza de un diagnóstico: un evento se dibuja igual venga de donde venga. El
// resultado de una herramienta se muestra como JSON crudo a propósito: es
// EXACTAMENTE lo que vio el modelo, y resumirlo acá sería mirar otra cosa que
// la que él miró.
import { ICONO_EVENTO, type EventoLab } from "@/components/agente/tipos";

export function VerEvento({ e }: { e: EventoLab }) {
  const icono = ICONO_EVENTO[e.tipo] ?? "·";
  const quien = e.agente ? <span className="text-[var(--t-text-dim)] mr-1">[{e.agente}]</span> : null;
  const linea = (cuerpo: React.ReactNode, tono = "text-[var(--t-text-muted)]") => (
    <p className={`text-[9px] leading-relaxed ${tono}`}>
      <span className="mr-1">{icono}</span>{quien}{cuerpo}
    </p>
  );

  switch (e.tipo) {
    case "pregunta":
      return linea(<>herramientas: <b className="text-[var(--t-text)]">{e.herramientas.join(", ")}</b></>);
    case "ruteo":
      return linea(<>agentes: <b className="text-[var(--t-text)]">{e.elegidos.join(", ") || "ninguno"}</b>{" "}
        <span className="text-[var(--t-text-dim)]">({e.motivo})</span></>, "text-[var(--t-accent)]");
    case "junta":
      return linea(<>cruza {e.agentes.join(" + ")}</>, "text-[var(--t-accent)]");
    case "vuelta":
      return linea(<>vuelta {e.n}</>, "text-[var(--t-text-dim)] mt-1");
    case "pide":
      return linea(
        <><b className="text-[var(--t-text)]">pide {e.herramienta}</b>{" "}
          {JSON.stringify(e.argumentos)}</>,
        "text-[var(--t-accent)]");
    case "resultado":
      return (
        <pre className="text-[9px] text-[var(--t-text-muted)] whitespace-pre-wrap break-all max-h-40 overflow-y-auto pl-4">
          {JSON.stringify(e.resultado, null, 1)}
        </pre>
      );
    case "texto":
      return linea(<>contestó</>, "text-[var(--t-pos)]");
    case "corte":
      return linea(<>{e.motivo}</>, "text-[var(--t-neg)]");
    case "achicado":
      return linea(<>achicado: {e.chars.toLocaleString("es-AR")} caracteres de resultados viejos</>,
                   "text-[var(--t-text-dim)]");
    case "podado":
      return linea(<>podado: {e.turnos} turno(s) viejo(s), {e.mensajes} mensaje(s)</>,
                   "text-[var(--t-text-dim)]");
    case "estado":
      return linea(
        <>en foco: {Object.entries(e.estado).map(([k, v]) => `${k} = ${v}`).join(", ")}
          {Object.keys(e.antes).length > 0 && (
            <span className="text-[var(--t-text-dim)]">
              {" "}(antes {Object.entries(e.antes).map(([k, v]) => `${k} = ${v}`).join(", ")})
            </span>
          )}</>,
        "text-[var(--t-accent)]");
    case "modelo":
      return (
        <div className="pl-4">
          {linea(
            <>dijo · <span className="tabular-nums">{e.tokens_in.toLocaleString("es-AR")}</span> in /{" "}
              <span className="tabular-nums">{e.tokens_out.toLocaleString("es-AR")}</span> out
              {e.pide.length > 0 && <span className="text-[var(--t-text-dim)]"> · pide {e.pide.join(", ")}</span>}
            </>,
            "text-[var(--t-text-dim)]")}
          {e.texto ? (
            <pre className="text-[9px] text-[var(--t-text)] whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {e.texto}
            </pre>
          ) : (
            <p className="text-[9px] text-[var(--t-neg)]">(sin texto: el modelo no dijo nada en esta vuelta)</p>
          )}
        </div>
      );
    case "diagnostico_dosier":
      return linea(<>dosier del hallazgo #{e.hallazgo_id} · {e.episodios} episodio(s) en 30 días
        {e.cronico && <b className="text-[var(--t-neg)]"> · crónico</b>}</>, "text-[var(--t-accent)]");
    case "diagnostico_concluir":
      return (
        <div>
          {linea(
            <>concluir · <span className="tabular-nums">{e.tokens_in.toLocaleString("es-AR")}</span> in /{" "}
              <span className="tabular-nums">{e.tokens_out.toLocaleString("es-AR")}</span> out
              {!e.parseo && <b className="text-[var(--t-neg)]"> · no parseó</b>}</>,
            "text-[var(--t-accent)]")}
          {e.texto ? (
            <pre className="text-[9px] text-[var(--t-text)] whitespace-pre-wrap break-words max-h-60 overflow-y-auto pl-4">
              {e.texto}
            </pre>
          ) : (
            <p className="text-[9px] text-[var(--t-neg)] pl-4">(sin texto: el modelo devolvió vacío)</p>
          )}
        </div>
      );
    case "diagnostico_conclusion":
      return linea(<><b className="text-[var(--t-text)]">{e.causa} → {e.accion}</b>
        {e.cambios.length > 0 && <span className="text-[var(--t-text-dim)]"> · el validador ajustó: {e.cambios.join(" · ")}</span>}</>,
        "text-[var(--t-pos)]");
    case "final":
      return linea(<>terminó</>, "text-[var(--t-text-dim)]");
    case "run_error":
      return linea(<>error: {e.error}</>, "text-[var(--t-neg)]");
    case "timed_out":
      return linea(<>se acabó el tiempo: {e.error}</>, "text-[var(--t-neg)]");
    case "cancelled":
      return linea(<>cancelado</>, "text-[var(--t-neg)]");
  }
}
