"use client";

// Tab HISTORIAL: lo que hizo, lo que mandó, lo ya decidido. Solo lectura.
import { Mensaje, Accion, Pendiente, Vista, haceCuanto,
         ACCION_LABEL, fechaHora, TITULO, SUB } from "@/components/av-agent/tipos";

// LO QUE EL AGENTE MANDÓ. Minimalista y completo, que es lo que pidió el user:
// *«seguir viendo todo en AV AGENT de manera minimalista pero todo registrado»*.
//
// Va aparte de AVISOS porque son dos cosas distintas que compartían tabla: un
// aviso de bono se COMPLETA en el agente (tiene su campo para tipear); un
// mensaje se MANDÓ y lo resuelve otra persona en su pantalla. Mezclarlos hacía
// que el aviso de saldos apareciera bajo la columna BONO pidiendo «cargá el
// dato», que no significa nada.
//
// Lo único que importa por fila: a quién, qué, y **si lo atendieron**.
export function TabMando({ mensajes }: { mensajes: Mensaje[] }) {
  if (mensajes.length === 0) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        Todavía no mandé ningún mensaje.
      </p>
    );
  }
  return (
    <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
      {mensajes.map((m) => {
        const vencido = m.vence_at ? new Date(m.vence_at) < new Date() : false;
        return (
          <div key={m.id}
               className="grid grid-cols-[200px_1fr_auto_auto] items-baseline gap-2 px-2 py-1">
            <span className="text-[10px] text-[var(--t-text-muted)] truncate"
                  title={m.para}>
              {m.para}
            </span>
            <span className="text-[11px] text-[var(--t-text)] truncate"
                  title={m.asunto}>
              {m.asunto}
            </span>
            {/* CUÁNTAS FILAS RESOLVIÓ. Es lo que dice si el mensaje sirvió o
                quedó sin abrir — y sin esto «mandado» y «atendido» se ven
                igual. */}
            <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
              {m.filas > 0 ? `${m.hechas}/${m.filas}` : ""}
            </span>
            <span className="text-[8px] uppercase tracking-widest whitespace-nowrap"
                  style={{ color: m.resuelto ? "var(--t-pos)"
                    : vencido ? "var(--t-text-dim)" : "#f59e0b" }}
                  title={m.resuelto ? `cerrado ${m.resuelto_at}`
                    : vencido ? "venció sin cerrarse" : "abierto"}>
              {m.resuelto ? "hecho" : vencido ? "venció" : "abierto"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TabHizo({ acciones }: { acciones: Accion[] }) {
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
      {/* Acá había un párrafo explicando que el libro incluye los intentos que
          fallaron. Es cierto y no le sirve a nadie que ya lo tiene delante: la
          tabla se explica sola, y el renglón se lo comía la pantalla. */}
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

export function TabDecidido({ data, designorar }: {
  data: Vista;
  designorar: (ticker: string) => void;
}) {
  // Lo contestado que todavía NO surtió efecto va PRIMERO y a lo ancho: es la
  // pregunta que el user se hace al volver ("¿qué pasó con las altas que
  // contesté?"), y estaba solo como una línea gris en el historial.
  const pend = data.pendientes ?? [];
  const porResp: Record<string, Pendiente[]> = {};
  for (const p of pend) (porResp[p.respuesta ?? "?"] ??= []).push(p);
  const votos = data.votos ?? [];
  return (
    <div className="flex flex-col gap-5">
      {/* LO VOTADO deja huella ACÁ (user, 2026-08-22: «voy tachando cosas y
          nada pasa a historial… ni siquiera queda registrado en ningún
          lado»). El voto apaga la fila en ENCONTRÓ; sin esta lista, el rastro
          de qué contestaste no vivía en ninguna pantalla. */}
      {votos.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className={TITULO}>VOTASTE</h3>
            <span className={SUB}>{votos.length} · lo que contestaste sobre el agente</span>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {votos.map((v, i) => (
                <tr key={i} className="border-b border-[var(--t-border)]/40">
                  <td className="py-0.5 pr-2 font-mono text-[var(--t-text)]">{v.caso}</td>
                  <td className="py-0.5 pr-2 text-[var(--t-text-muted)]">
                    {v.causa.replaceAll("_", " ")}
                  </td>
                  <td className="py-0.5 pr-2 whitespace-nowrap"
                      style={{ color: v.acierta ? "var(--t-pos)" : "var(--t-neg)" }}>
                    {v.origen === "utilidad"
                      ? (v.acierta ? "✔ te sirve" : "✖ es ruido")
                      : (v.acierta ? "✔ acertó" : "✖ no acertó")}
                  </td>
                  <td className="py-0.5 pr-2 text-[var(--t-text-dim)] truncate max-w-[24ch]"
                      title={v.nota}>{v.nota}</td>
                  <td className="py-0.5 text-right text-[var(--t-text-dim)] whitespace-nowrap">
                    {fechaHora(v.creado_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
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
                {/* `w-16` eran 4rem para un ticker de 4 letras, pero acá también
                    entran ids de chequeo («JOB:MERCADO_1816_SERIES»): el texto se
                    salía de la caja y se montaba sobre el motivo de al lado. Ancho
                    mayor + `truncate` para que corte en vez de desbordar. */}
                <span className="text-[11px] font-bold text-[var(--t-text)] tabular-nums w-40 shrink-0 truncate"
                      title={ig.ticker}>
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
