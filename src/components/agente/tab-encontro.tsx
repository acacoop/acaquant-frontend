"use client";

// ENCONTRÓ — SOLO LO QUE TIENE ARREGLO. Doc: `docs/AGENT_2.0.md` §6.2.
//
//     ENCONTRÓ = hallazgos abiertos CON arreglo
//
// Un AVISO no entra acá. En el agente viejo `salud` declaraba una acción y caía
// en la lista de trabajo, pero su puerta era de solo lectura: lo único que
// ofrecía era «↻ chequear ahora». **Un aviso con forma de trabajo** — y por eso
// la lista tenía 96 filas de las que casi ninguna se podía apretar.
//
// El ciclo de un botón es siempre el mismo: VER (preview, calcula y no muta) →
// APLICAR (escribe) → releer. Nunca se aplica desde una propuesta guardada: se
// recalcula al aplicar, así lo que se escribe es lo cierto AHORA.
import { useState } from "react";

import { COLOR, fechaHora, type Hallazgo } from "@/components/agente/tipos";

type Paso = { titulo?: string; estado?: string; detalle?: string;
              tabla?: string; aviso?: string };
type Flujo = { fecha?: string; amortizacion?: number | null;
               cupon?: number | null; residual?: number | null };
type Preview = {
  ok: boolean; error?: string; que_escribe?: string; donde?: string;
  porque?: string; antes?: unknown; veredicto?: string;
  puede_aplicar?: boolean; pasos?: Paso[]; flujos?: Flujo[];
  escala?: string; rama?: string; vencimiento?: string; simbolo?: string;
  tea?: number | null; precio?: number | null;
  ejes?: Record<string, string>;
};

const n2 = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : v.toLocaleString("es-AR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

// El estado de cada eslabón de la cadena, con su color. Viene RESUELTO del
// backend: el front no decide qué estado bloquea qué.
const PASO: Record<string, string> = {
  ok: "var(--t-pos)",
  info: "var(--t-text-muted)",
  revisar: "var(--t-accent)",
  bloquea: "var(--t-neg)",
  no_se_puede_saber: "var(--t-text-dim)",
};

export function TabEncontro({ filas, porHabilidad, preview, aplicar, ignorar }: {
  filas: Hallazgo[];
  porHabilidad: Record<string, number>;
  preview: (id: number) => Promise<Preview>;
  aplicar: (id: number) => Promise<{ ok: boolean; error?: string; detalle?: string; aviso?: string }>;
  ignorar: (id: number) => Promise<void>;
}) {
  const [filtro, setFiltro] = useState("");
  const [previews, setPreviews] = useState<Record<number, Preview>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [resultado, setResultado] = useState<Record<number, string>>({});

  const vistos = filtro ? filas.filter((f) => f.habilidad === filtro) : filas;

  async function ver(id: number) {
    setOcupado(id);
    try {
      // El `await` va ANTES del setState: adentro del updater la función es
      // sincrónica y Turbopack lo rechaza al parsear.
      const p = await preview(id);
      setPreviews((prev) => ({ ...prev, [id]: p }));
    } finally { setOcupado(null); }
  }

  async function hacer(id: number) {
    setOcupado(id);
    try {
      const r = await aplicar(id);
      setResultado((x) => ({
        ...x,
        [id]: r.ok ? (r.aviso || r.detalle || "aplicado") : (r.error || "falló"),
      }));
    } finally { setOcupado(null); }
  }

  if (!filas.length) {
    return (
      <p className="text-[11px] text-[var(--t-text-muted)]">
        <b>No hay nada que apretar.</b> Lo que el agente encontró y no tiene
        arreglo vive en AHORA — es un aviso, no trabajo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* El número se ABRE: cada fila trae su habilidad, así que el total se
          descompone solo. En el agente viejo «96» no se podía descomponer. */}
      <div className="flex flex-wrap gap-1 items-baseline">
        <button
          onClick={() => setFiltro("")}
          className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
            !filtro ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-[var(--t-border)] text-[var(--t-text-dim)]"}`}
        >
          todo {filas.length}
        </button>
        {Object.entries(porHabilidad).sort((a, b) => b[1] - a[1]).map(([h, n]) => (
          <button
            key={h}
            onClick={() => setFiltro(filtro === h ? "" : h)}
            className={`text-[9px] uppercase tracking-widest px-2 py-0.5 border ${
              filtro === h ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                           : "border-[var(--t-border)] text-[var(--t-text-dim)]"}`}
          >
            {h} {n}
          </button>
        ))}
      </div>

      <div className="border border-[var(--t-border)] divide-y divide-[var(--t-border)]">
        {vistos.map((f) => {
          const p = previews[f.id];
          const res = resultado[f.id];
          return (
            <div key={f.id} className="px-2 py-1.5">
              <div className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full"
                      style={{ background: COLOR[f.severidad] }} title={f.severidad} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-bold text-[var(--t-text)] truncate">
                      {f.nombre || f.sujeto}
                    </span>
                    <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                      {f.habilidad} · {f.regla}
                    </span>
                    <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
                      desde {fechaHora(f.detectado_at)}
                    </span>
                    {f.estado === "en_curso" && (
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-accent)]">
                        aplicado · esperando que el detector confirme
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">
                    {f.problema}
                  </p>
                  {f.detalle && (
                    <pre className="text-[9px] text-[var(--t-text)] mt-0.5 px-1.5 py-1 border-l-2 border-[var(--t-accent)] bg-[var(--t-surface)] whitespace-pre-wrap break-all font-mono">
                      {f.detalle}
                    </pre>
                  )}
                  <p className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
                    {f.que_hacer}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-1 pl-3.5">
                <button
                  disabled={ocupado === f.id}
                  onClick={() => void ver(f.id)}
                  title="Calcula qué escribiría. No cambia nada."
                  className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
                >
                  ver qué haría
                </button>
                <button
                  disabled={ocupado === f.id || f.estado === "en_curso"}
                  onClick={() => void hacer(f.id)}
                  title={f.arreglo_donde || ""}
                  className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
                >
                  {ocupado === f.id ? "…" : (f.arreglo_titulo || f.arreglo)}
                </button>
                <button
                  disabled={ocupado === f.id}
                  onClick={() => void ignorar(f.id)}
                  title="Esconde, no resuelve. Reversible."
                  className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)] disabled:opacity-40"
                >
                  no me interesa
                </button>
                {res && (
                  <span className="text-[9px] text-[var(--t-accent)]">{res}</span>
                )}
              </div>

              {p && (
                <div className="mt-1 ml-3.5 border-l-2 border-[var(--t-border)] pl-2 text-[9px] text-[var(--t-text-muted)]">
                  {p.ok ? (
                    <div className="flex flex-col gap-2">
                      {/* LA FICHA: qué bono es, en datos y no en una frase. */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {([
                          ["dónde escribe", p.donde || f.arreglo_donde],
                          ["rama", p.rama],
                          ["ejes", p.ejes
                            ? `${p.ejes.emisor_tipo} · ${p.ejes.moneda_eje} · ${p.ejes.ajuste}`
                            : null],
                          ["símbolo", p.simbolo],
                          ["vence", p.vencimiento],
                          ["cupones", p.flujos?.length],
                          ["precio", p.precio != null ? n2(p.precio) : null],
                          ["TEA que daría", p.tea != null
                            ? `${(p.tea * 100).toFixed(2)}%` : null],
                        ] as [string, string | number | null | undefined][])
                          .filter(([, v]) => v != null && v !== "")
                          .map(([k, v]) => (
                            <span key={k}>
                              <span className="text-[var(--t-text-dim)]">{k}: </span>
                              <b className="text-[var(--t-text)]">{v}</b>
                            </span>
                          ))}
                      </div>

                      {p.puede_aplicar === false && (
                        <div className="text-[var(--t-neg)]">
                          ✘ {p.veredicto || "la cadena FRENA: aplicar no va a escribir"}
                        </div>
                      )}

                      {/* EL CUADRO. Es lo que el bono va a pagar, y verlo
                          contesta «¿es este el bono?» aunque la cadena frene. */}
                      {(p.flujos ?? []).length > 0 && (
                        <div>
                          <div className="text-[var(--t-text-dim)] mb-0.5">
                            EL CRONOGRAMA que se escribiría
                            {p.escala ? ` · escala ${p.escala}` : ""}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="tabular-nums text-[9px]">
                              <thead className="text-[var(--t-text-dim)]">
                                <tr>
                                  <th className="text-left pr-3">fecha</th>
                                  <th className="text-right pr-3">amortiza</th>
                                  <th className="text-right pr-3">cupón</th>
                                  <th className="text-right">residual</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.flujos!.map((fl, i) => (
                                  <tr key={i} className="text-[var(--t-text)]">
                                    <td className="pr-3">{fl.fecha}</td>
                                    <td className="text-right pr-3">{n2(fl.amortizacion, 4)}</td>
                                    <td className="text-right pr-3">{n2(fl.cupon, 6)}</td>
                                    <td className="text-right text-[var(--t-text-muted)]">
                                      {n2(fl.residual)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* LA CADENA. Ver dónde frena es la mitad del valor de
                          simular: sin esto, «no se puede» no dice por qué. */}
                      {(p.pasos ?? []).length > 0 && (
                        <div className="flex flex-col gap-1">
                          <div className="text-[var(--t-text-dim)]">
                            LA CADENA que va a recorrer al aplicar
                          </div>
                          {p.pasos!.map((s, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                                    style={{ background: PASO[s.estado ?? ""]
                                             ?? "var(--t-text-dim)" }}
                                    title={s.estado} />
                              <div className="min-w-0">
                                <span className="text-[var(--t-text)]">{s.titulo}</span>
                                {s.tabla && (
                                  <span className="text-[var(--t-text-dim)]"> · {s.tabla}</span>
                                )}
                                {s.detalle && (
                                  <p className="text-[var(--t-text-muted)] whitespace-pre-wrap">
                                    {s.detalle}
                                  </p>
                                )}
                                {s.aviso && (
                                  <p className="text-[var(--t-accent)]">⚠ {s.aviso}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--t-neg)]">{p.error}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
