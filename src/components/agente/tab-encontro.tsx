"use client";

// ENCONTRÓ — SOLO LO QUE TIENE ARREGLO. Doc: `docs/AGENT.md` §6.2.
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

import { ListadoCedears, type FilaCedear } from "@/components/agente/listado-cedears";
import { ListadoOns, type FilaON } from "@/components/agente/listado-ons";
import { ListadoFicha, type FilaFicha } from "@/components/agente/listado-ficha";
import { COLOR, fechaHora, type Hallazgo } from "@/components/agente/tipos";
import { Recurrencia, Confirmado, Evidencia } from "./evidencia";

type Paso = { titulo?: string; estado?: string; detalle?: string;
              tabla?: string; aviso?: string };
type Flujo = { fecha?: string; amortizacion?: number | null;
               cupon?: number | null; residual?: number | null };
type Preview = {
  ok: boolean; error?: string; que_escribe?: string; donde?: string;
  porque?: string; antes?: unknown; veredicto?: string;
  puede_aplicar?: boolean; pasos?: Paso[]; flujos?: Flujo[];
  escala?: string; rama?: string; vencimiento?: string; simbolo?: string;
  tea?: number | null; tna?: number | null; precio?: number | null;
  dolar?: string; dolar_valor?: number | null;
  ejes?: Record<string, string>;
  // Solo los arreglos que PIDEN DATOS: el listado que se despliega. Cuál se
  // dibuja lo dice el backend (`listado`), no una lista de ids acá.
  //   `completar_ficha` → `filas` para completar a mano + `opciones`
  //   `alta_cedear`     → `cedears` para tildar (AGENT.md §0.dl)
  //   `alta_on`         → `ons` para tildar (AGENT.md §0.dv)
  listado?: string;
  campo?: string; filas?: FilaFicha[]; opciones?: string[];
  cedears?: FilaCedear[]; motor?: { estado?: string; detalle?: string } | null;
  ons?: FilaON[];
};

type Datos = { unidad: string; valor: string }[];

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
  aplicar: (id: number, datos?: Datos)
    => Promise<{ ok: boolean; error?: string; detalle?: string; aviso?: string;
                 pasos?: Paso[] }>;
  ignorar: (id: number) => Promise<void>;
}) {
  const [filtro, setFiltro] = useState("");
  const [previews, setPreviews] = useState<Record<number, Preview>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [resultado, setResultado] = useState<Record<number, string>>({});
  // ⚠️ **EL RASTRO DE LO QUE HIZO.** Un alta hace siete cosas y antes el botón
  // se ponía gris y después aparecía una frase: había que confiar. Cada paso
  // viene del BACKEND con lo que de verdad pasó (`pasos`), incluido el que
  // salió mal sin tumbar a los demás. Acá no se inventa ninguno.
  const [rastro, setRastro] = useState<Record<number, Paso[]>>({});

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

  async function hacer(id: number, datos?: Datos) {
    setOcupado(id);
    try {
      setRastro((x) => ({ ...x, [id]: [] }));
      const r = await aplicar(id, datos);
      setResultado((x) => ({
        ...x,
        [id]: r.ok ? (r.aviso || r.detalle || "aplicado") : (r.error || "falló"),
      }));
      setRastro((x) => ({ ...x, [id]: r.pasos ?? [] }));
      // ⚠️ **SE RECALCULA EL LISTADO DESPUÉS DE ESCRIBIR.** Es lo que hace que
      // lo completado desaparezca. No se filtra en el navegador: la lista viva
      // la arma el backend, así que lo que sale es lo que dejó de faltar de
      // verdad — y si una escritura falló, esa fila SIGUE ahí.
      if (datos) {
        const p = await preview(id);
        setPreviews((prev) => ({ ...prev, [id]: p }));
      }
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
          const tr = rastro[f.id];
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
                    {/* ⚠️ **ACÁ NO VA `habilidad · regla`, y en AHORA SÍ.**
                        No es una inconsistencia: contestan preguntas distintas.

                        El trío `habilidad + sujeto + regla` es la IDENTIDAD del
                        problema en el modelo (el índice único de `hallazgos`, y
                        lo que silencia «no me interesa»). Pero en ESTA tab la
                        habilidad ya está arriba, en un chip que además FILTRA:
                        si apretaste `ficha_incompleta`, cada fila te repetía el
                        chip que acabás de apretar. Y la regla, o repite el
                        sujeto (`sin_emisor` sobre un título que dice EMISOR), o
                        ya está dicha en castellano en el `problema`
                        (`job_sin_dato` → «el día 04/09 no está en
                        portafolio.tenencia y nadie lo va a escribir solo»).

                        En AHORA no hay chips y hay un badge con un número: ahí
                        el nombre de la habilidad es lo ÚNICO que deja abrirlo,
                        y por eso se dibuja. */}
                    <span className="text-[9px] tabular-nums text-[var(--t-text-dim)]">
                      desde {fechaHora(f.detectado_at)}
                    </span>
                    <Confirmado desde={f.detectado_at} ultima={f.visto_ultima_vez} />
                    <Recurrencia episodios={f.episodios} cronico={f.cronico} />
                    {f.estado === "en_curso" && (
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-accent)]">
                        aplicado · esperando que el detector confirme
                      </span>
                    )}
                    {f.estado === "reincidio" && (
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-neg)]">
                        ⚠ volvió después de un arreglo
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
                  {/* ⚠️ **EL `que_hacer` NO SE DIBUJA ACÁ: el botón lo dice.**
                      En ENCONTRÓ todo tiene arreglo (es la definición de la
                      tab), así que el texto y el botón contestan la misma
                      pregunta — y el botón además la ejecuta. «Abrir el listado
                      y completar el campo» arriba de un botón que dice
                      COMPLETAR LA FICHA es el mismo choclo que el backend ya
                      evita al no redactar lo que tiene botón
                      (`registro.pendientes_de_texto` filtra `arreglo = ''`).
                      En AHORA sí se dibuja: ahí no hay botón que lo diga. */}
                  <Evidencia ev={f.evidencia} />
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
                {/* Los que PIDEN DATOS no tienen botón de aplicar acá: su
                    escritura sale del listado, que no puede guardar nada hasta
                    que se cargue un valor. Un botón «aplicar» al lado de un
                    listado vacío promete escribir sin tener qué. */}
                {!p?.filas && !p?.cedears && !p?.ons && (
                  <button
                    disabled={ocupado === f.id || f.estado === "en_curso"}
                    onClick={() => void hacer(f.id)}
                    title={f.arreglo_donde || ""}
                    className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40"
                  >
                    {ocupado === f.id ? "…" : (f.arreglo_titulo || f.arreglo)}
                  </button>
                )}
                <button
                  disabled={ocupado === f.id}
                  onClick={() => void ignorar(f.id)}
                  title="Esconde, no resuelve. Reversible."
                  className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)] disabled:opacity-40"
                >
                  no me interesa
                </button>
                {ocupado === f.id && (
                  <span className="text-[9px] text-[var(--t-text-dim)]">
                    trabajando…
                  </span>
                )}
                {res && ocupado !== f.id && (
                  <span className="text-[9px] text-[var(--t-accent)]">{res}</span>
                )}
              </div>

              {/* ⚠️ **LO QUE HIZO, PASO POR PASO.** El botón se ponía gris y
                  después aparecía una frase: había que confiar. Cada línea la
                  manda el BACKEND con lo que de verdad pasó (`pasos`), así que
                  un paso que salió mal sin tumbar a los demás se VE — antes iba
                  metido en una subordinada y se leía como éxito. */}
              {tr && tr.length > 0 && (
                <div className="mt-1 ml-3.5 border-l-2 border-[var(--t-accent)] pl-2
                                flex flex-col gap-0.5">
                  {tr.map((s2, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[9px]">
                      <span className="shrink-0 w-3"
                            style={{ color: s2.estado === "ok" ? "var(--t-pos)"
                                     : s2.estado === "falló" ? "var(--t-neg)"
                                     : "var(--t-text-dim)" }}>
                        {s2.estado === "ok" ? "✔" : s2.estado === "falló" ? "✖" : "·"}
                      </span>
                      <span>
                        <b className="text-[var(--t-text)]">{s2.titulo}</b>
                        {s2.detalle ? (
                          <span className="text-[var(--t-text-dim)]"> — {s2.detalle}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}

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
                          // ⚠️ **LA TASA VIENE CON SU DÓLAR, Y NO ES ADORNO.**
                          // El motor divide el precio en pesos por MEP y 1816
                          // por CCL: 4,2% de diferencia que entra entera en la
                          // tasa. Un «TEA 8,59%» sin decir en qué dólar está no
                          // es un número (AGENT.md §0.ec). Y la TNA es la que
                          // mira la mesa — la calcula el backend, acá no se
                          // deriva nada.
                          ["TEA que daría", p.tea != null
                            ? `${(p.tea * 100).toFixed(2)}%` : null],
                          ["TNA", p.tna != null
                            ? `${(p.tna * 100).toFixed(2)}%` : null],
                          ["dólar usado", p.dolar
                            ? `${p.dolar}${p.dolar_valor != null
                                ? ` ${n2(p.dolar_valor)}` : ""}` : null],
                        ] as [string, string | number | null | undefined][])
                          .filter(([, v]) => v != null && v !== "")
                          .map(([k, v]) => (
                            <span key={k}>
                              <span className="text-[var(--t-text-dim)]">{k}: </span>
                              <b className="text-[var(--t-text)]">{v}</b>
                            </span>
                          ))}
                      </div>

                      {/* EL LISTADO EDITABLE. Solo `completar_ficha` lo trae:
                          es el único arreglo cuyo valor no lo calcula el
                          sistema, así que su pantalla no es un botón. */}
                      {p.filas && (
                        <ListadoFicha
                          campo={p.campo || ""}
                          filas={p.filas}
                          opciones={p.opciones ?? []}
                          ocupado={ocupado === f.id}
                          onAplicar={(datos) => hacer(f.id, datos)}
                        />
                      )}

                      {/* EL LISTADO PARA TILDAR de `alta_cedear`: el sistema
                          sabe escribirlo todo, lo que no decide es cuáles. */}
                      {p.cedears && (
                        <ListadoCedears
                          filas={p.cedears}
                          motor={p.motor}
                          ocupado={ocupado === f.id}
                          onAplicar={(datos) => hacer(f.id, datos)}
                        />
                      )}

                      {/* EL LISTADO PARA TILDAR de `alta_on`: mismo caso que
                          los CEDEARs — 1816 publica muchas más de las que la
                          mesa sigue, y cuáles no lo decide el sistema. */}
                      {p.ons && (
                        <ListadoOns
                          filas={p.ons}
                          ocupado={ocupado === f.id}
                          onAplicar={(datos) => hacer(f.id, datos)}
                        />
                      )}

                      {p.puede_aplicar === false && !p.filas && !p.cedears
                        && !p.ons && (
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
