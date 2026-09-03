"use client";

// LAB — EL INVESTIGADOR. Doc del backend: `lab/langgraph/README.md`.
//
// El agente detecta y frena: **16 de sus 24 habilidades son avisos sin botón**.
// Sus filas dicen «Relanzar jobs.interbanking_sync» y no lo hace nadie. Acá se
// pide que averigüe POR QUÉ y proponga qué hacer.
//
// ⚠️ **SE PIDE Y SE PREGUNTA, NO SE ESPERA.** Una investigación son uno o dos
// minutos y el proxy corta a los 30 s — ese corte se ve en pantalla idéntico a
// un backend caído. Así que el POST devuelve un id en milisegundos y esta tab
// pollea el pedido mientras el daemon lo corre.
//
// ⚠️ **LOS PASOS SE MUESTRAN, no se esconden detrás de un spinner.** Es lo que
// deja distinguir si eligió mal la herramienta, si la herramienta trajo basura,
// o si tenía todo y razonó mal — tres problemas distintos con arreglos
// distintos. Un spinner los hace ver iguales.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ICONO_PASO, fechaHora,
  type Lab, type Pedido, type TipoInvestigacion,
} from "@/components/agente/tipos";

const CADA_MS = 4000;   // mientras corre. La investigación tarda minutos.

const COLOR_ESTADO: Record<string, string> = {
  pendiente: "var(--t-text-dim)",
  corriendo: "var(--t-accent)",
  listo: "var(--t-pos)",
  error: "var(--t-neg)",
};

export function TabLab({ leer, investigar, casoInicial }: {
  leer: <T>(url: string) => Promise<T>;
  investigar: (tipo: string, caso: string) => Promise<{ ok: boolean; id?: number; error?: string }>;
  // Cuando se llega acá desde el botón de una fila, ya viene elegido.
  //
  // ⚠️ Se usa SÓLO como valor inicial: el modal le pone una `key` distinta a
  // esta tab cuando cambia, así React la remonta con el caso nuevo. Sincronizar
  // una prop hacia el estado con un efecto es la fuente clásica de pantallas
  // que se pisan solas mientras alguien está escribiendo.
  casoInicial?: { tipo: string; caso: string } | null;
}) {
  const [lab, setLab] = useState<Lab | null>(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [tipo, setTipo] = useState(casoInicial?.tipo ?? "");
  const [caso, setCaso] = useState(casoInicial?.caso ?? "");
  const [pidiendo, setPidiendo] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const cargar = useCallback(async () => {
    try {
      const d = await leer<Lab>("/api/agente/lab");
      if (!vivo.current) return;
      setLab(d);
      // ⚠️ El backend manda `ok` y `error` aparte de la lista: una lista vacía
      // y una lectura fallida NO se pueden dibujar iguales.
      setError(d.ok ? "" : d.error);
    } catch (e) {
      if (vivo.current) setError(String(e));
    }
  }, [leer]);

  // ⚠️ La carga va DIFERIDA, igual que en `tab-historial`. Llamar algo que
  // hace `setState` en el cuerpo del efecto dispara renders en cascada, y el
  // lint del repo lo prohíbe: es la regla la que sostiene el patrón, no la
  // memoria de quien escribe la próxima tab.
  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  // Mientras el pedido abierto está corriendo, se pregunta cómo va.
  useEffect(() => {
    if (abierto == null) return;
    let cancelado = false;
    const preguntar = async () => {
      try {
        const p = await leer<Pedido>(`/api/agente/lab/pedido/${abierto}`);
        if (cancelado || !vivo.current) return;
        setPedido(p);
        if (p.estado === "listo" || p.estado === "error") void cargar();
      } catch { /* un poll fallido conserva lo que había */ }
    };
    void preguntar();
    const id = setInterval(preguntar, CADA_MS);
    return () => { cancelado = true; clearInterval(id); };
  }, [abierto, leer, cargar]);

  async function pedir() {
    if (!tipo || !caso.trim() || pidiendo) return;
    setPidiendo(true);
    try {
      const r = await investigar(tipo, caso.trim());
      if (r.ok && r.id) { setAbierto(r.id); setPedido(null); await cargar(); }
      else setError(r.error || "no pude encolar la investigación");
    } catch (e) { setError(String(e)); } finally { setPidiendo(false); }
  }

  const tipos: TipoInvestigacion[] = lab?.tipos ?? [];
  const elegido = tipos.find((t) => t.nombre === tipo);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-[var(--t-text-dim)]">
        El agente <b>detecta y frena</b>. Acá se le pide que averigüe <b>por qué</b> y
        proponga qué hacer. Tarda uno o dos minutos: se pide y se sigue por los pasos.
      </p>

      {/* ── PEDIR ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border border-[var(--t-border)] p-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-2 py-1 text-[var(--t-text)]">
          <option value="">— qué investigar —</option>
          {tipos.map((t) => (
            <option key={t.nombre} value={t.nombre}>{t.nombre} · {t.que_es}</option>
          ))}
        </select>
        <input value={caso} onChange={(e) => setCaso(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter") void pedir(); }}
               placeholder="el caso: un ticker, un job, una tabla…"
               className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-2 py-1 flex-1 min-w-[180px] text-[var(--t-text)]" />
        <button disabled={pidiendo || !tipo || !caso.trim()} onClick={() => void pedir()}
                className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40">
          {pidiendo ? "pidiendo…" : "🔍 investigar"}
        </button>
        {elegido && (
          // El PISO se muestra porque es lo que distingue «se le ocurrió mirar
          // eso» de «tuvo que mirarlo».
          <p className="w-full text-[9px] text-[var(--t-text-dim)]">
            mínimo que va a mirar: {elegido.piso.join(" · ") || "(sin mínimo)"}
          </p>
        )}
      </div>

      {error && <p className="text-[10px] text-[var(--t-neg)]">{error}</p>}

      {/* ── EL PEDIDO ABIERTO ────────────────────────────────────────── */}
      {abierto != null && pedido && <VerPedido p={pedido} />}

      {/* ── LOS ÚLTIMOS ──────────────────────────────────────────────── */}
      <div className="flex flex-col">
        <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] mb-1">
          investigaciones
        </p>
        {!lab?.pedidos.length && !error && (
          <p className="text-[10px] text-[var(--t-text-muted)]">
            Todavía no se pidió ninguna.
          </p>
        )}
        {lab?.pedidos.map((p) => (
          <button key={p.id} onClick={() => { setAbierto(p.id); setPedido(null); }}
                  className={`text-left px-2 py-1 border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] ${
                    abierto === p.id ? "bg-[var(--t-surface)]" : ""}`}>
            <span className="text-[10px]">
              <span style={{ color: COLOR_ESTADO[p.estado] }}>●</span>{" "}
              <span className="text-[var(--t-text-dim)]">{fechaHora(p.at)}</span>{" "}
              <b className="text-[var(--t-text)]">{p.tipo}</b>{" "}
              <span className="text-[var(--t-accent)]">{p.caso}</span>{" "}
              <span className="text-[var(--t-text-dim)]">
                · {p.estado}{p.por ? ` · ${p.por}` : ""}
              </span>
            </span>
            {p.error && (
              <span className="block text-[9px] text-[var(--t-neg)]">{p.error}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}


// ── UN PEDIDO, CON SUS PASOS Y SU VEREDICTO ──────────────────────────────
function VerPedido({ p }: { p: Pedido }) {
  const corriendo = p.estado === "pendiente" || p.estado === "corriendo";
  return (
    <div className="border border-[var(--t-border)] p-2 flex flex-col gap-2">
      <p className="text-[10px]">
        <span style={{ color: COLOR_ESTADO[p.estado] }}>●</span>{" "}
        <b>{p.tipo} {p.caso}</b>{" "}
        <span className="text-[var(--t-text-dim)]">
          · pedido {fechaHora(p.at)}
          {p.terminado_at ? ` · terminó ${fechaHora(p.terminado_at)}` : ""}
        </span>
      </p>

      {p.error && <p className="text-[10px] text-[var(--t-neg)]">⚠ {p.error}</p>}

      {/* Los pasos. Se ven SIEMPRE, no sólo al final. */}
      {p.pasos?.length > 0 && (
        <div className="bg-[var(--t-surface)] p-1.5 max-h-52 overflow-y-auto">
          {p.pasos.map((paso, i) => (
            <p key={i} className="text-[9px] text-[var(--t-text-muted)] leading-relaxed">
              <span className="mr-1">{ICONO_PASO[paso.clase] ?? "·"}</span>
              {paso.que && <b className="text-[var(--t-text)]">{paso.que} </b>}
              <span className={paso.clase === "freno" || paso.clase === "repetido"
                ? "text-[var(--t-accent)]" : ""}>{paso.detalle}</span>
            </p>
          ))}
        </div>
      )}

      {corriendo && (
        <p className="text-[10px] text-[var(--t-accent)]">
          {p.estado === "pendiente"
            ? "en la cola — el agente la levanta en su próxima pasada…"
            : "investigando…"}
        </p>
      )}

      {/* El veredicto. Los seis campos vienen del backend, sin derivar nada. */}
      {p.investigacion_id && (
        <div className="flex flex-col gap-1.5">
          <Campo titulo="QUÉ PASÓ" texto={p.que_paso} />
          <Campo titulo="POR QUÉ" texto={p.por_que} />
          <Campo titulo="DE QUIÉN ES" texto={p.de_quien_es} destacado />
          <Campo titulo="QUÉ HARÍA" texto={p.que_haria} destacado />
          {/* ⚠️ «Lo que no sé» NO es un pie de página: es lo que separa una
              conclusión de una afirmación sobre lo que no se miró. */}
          <Campo titulo="LO QUE NO SÉ" texto={p.lo_que_no_se} />
          {p.de_donde?.length ? (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                de dónde lo saqué
              </p>
              {p.de_donde.map((f, i) => (
                <p key={i} className="text-[9px] text-[var(--t-text-muted)]">· {f}</p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Campo({ titulo, texto, destacado }: {
  titulo: string; texto?: string | null; destacado?: boolean;
}) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
        {titulo}
      </p>
      <p className={`text-[10px] whitespace-pre-wrap ${
        destacado ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)]"}`}>
        {texto}
      </p>
    </div>
  );
}
