"use client";

// LAB — EL INVESTIGADOR. Doc del backend: `lab/langgraph/README.md`.
//
// El agente detecta y frena: **16 de sus 24 habilidades son avisos sin botón**.
// Sus filas dicen «Relanzar jobs.interbanking_sync» y no lo hace nadie. Acá se
// pide que averigüe POR QUÉ pasó y proponga qué hacer.
//
// TRES DECISIONES DE PANTALLA, LAS TRES POR UN DEFECTO REAL
// =========================================================
//
// 1. **EL CASO SE ELIGE, NO SE ESCRIBE.** Había un campo de texto libre donde
//    no se entendía qué poner. Ahora el desplegable trae lo que está REALMENTE
//    abierto —las reincidencias vivas y los hallazgos que sabemos investigar—,
//    derivado del estado del agente: lo nuevo aparece solo y lo resuelto
//    desaparece solo.
//
// 2. **EL VEREDICTO SE LEE PRIMERO.** El título arriba, después las viñetas.
//    Los campos vienen como LISTAS desde el backend, así que acá no hay que
//    cortar nada: si fuera un párrafo, el arreglo estaría en el lugar
//    equivocado.
//
// 3. **LOS PASOS VAN PLEGADOS.** Son 25 líneas que tapaban el resultado. Se
//    abren si querés auditar cómo llegó — y hay que poder, porque es lo único
//    que deja distinguir si eligió mal la herramienta, si la herramienta trajo
//    basura, o si tenía todo y razonó mal.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ICONO_PASO, fechaHora,
  type CasoInvestigable, type Lab, type Pedido,
} from "@/components/agente/tipos";

const CADA_MS = 4000;   // mientras corre. La investigación tarda minutos.

const COLOR_ESTADO: Record<string, string> = {
  pendiente: "var(--t-text-dim)",
  corriendo: "var(--t-accent)",
  listo: "var(--t-pos)",
  error: "var(--t-neg)",
};

// De quién es el problema. Se colorea porque es la respuesta que más se busca.
const COLOR_CULPA: Record<string, string> = {
  nuestro: "var(--t-neg)",
  dato: "var(--t-accent)",
  proveedor: "var(--t-text-muted)",
  no_se: "var(--t-text-dim)",
};

function clave(c: { tipo: string; sujeto: string }) {
  return `${c.tipo}${c.sujeto}`;
}

export function TabLab({ leer, investigar, casoInicial }: {
  leer: <T>(url: string) => Promise<T>;
  investigar: (tipo: string, caso: string) => Promise<{ ok: boolean; id?: number; error?: string }>;
  // El SUJETO que traía la fila desde la que se apretó «investigar». Sólo eso:
  // qué investigación le corresponde lo resuelve esta tab con su propia lista,
  // que viene del backend.
  //
  // ⚠️ No se copia al estado con un efecto: se DERIVA abajo. Sincronizar una
  // prop hacia el estado es la fuente clásica de pantallas que se pisan solas
  // mientras alguien está mirando.
  casoInicial?: { caso: string } | null;
}) {
  const [lab, setLab] = useState<Lab | null>(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [elegido, setElegido] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const cargar = useCallback(async () => {
    try {
      const d = await leer<Lab>("/api/agente/lab");
      if (!vivo.current) return;
      setLab(d);
      // ⚠️ `ok` y `error` vienen aparte de la lista: una lista vacía y una
      // lectura fallida NO se pueden dibujar iguales.
      setError(d.ok ? "" : d.error);
    } catch (e) {
      if (vivo.current) setError(String(e));
    }
  }, [leer]);

  // Diferida, igual que en `tab-historial`: llamar algo que hace `setState` en
  // el cuerpo del efecto dispara renders en cascada y el lint lo prohíbe.
  useEffect(() => {
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [cargar]);

  // Mientras el pedido abierto corre, se pregunta cómo va.
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
    const id0 = setTimeout(() => void preguntar(), 0);
    const id = setInterval(() => void preguntar(), CADA_MS);
    return () => { cancelado = true; clearTimeout(id0); clearInterval(id); };
  }, [abierto, leer, cargar]);

  const casos: CasoInvestigable[] = lab?.casos ?? [];
  // ⚠️ SE DERIVA, no se sincroniza: mientras nadie eligió nada a mano, vale el
  // sujeto que traía la fila. Apenas se toca el desplegable, manda la elección.
  // Así el preseleccionado funciona aunque la lista llegue después.
  const caso = elegido
    ? casos.find((c) => clave(c) === elegido)
    : casos.find((c) => c.sujeto === (casoInicial?.caso ?? ""));

  async function pedir() {
    if (!caso || pidiendo) return;
    setPidiendo(true);
    try {
      const r = await investigar(caso.tipo, caso.sujeto);
      if (r.ok && r.id) { setAbierto(r.id); setPedido(null); await cargar(); }
      else setError(r.error || "no pude encolar la investigación");
    } catch (e) { setError(String(e)); } finally { setPidiendo(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-[var(--t-text-dim)]">
        El agente <b>detecta y frena</b>. Acá se le pide que averigüe <b>por qué</b> y
        proponga qué hacer. <b>No ejecuta nada.</b> Tarda uno o dos minutos.
      </p>

      {/* ── ELEGIR EL CASO ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border border-[var(--t-border)] p-2">
        <select value={caso ? clave(caso) : ""}
                onChange={(e) => setElegido(e.target.value)}
                className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-2 py-1 flex-1 min-w-[260px] text-[var(--t-text)]">
          <option value="">
            {casos.length ? `— elegí qué investigar (${casos.length}) —`
                          : "— no hay nada abierto para investigar —"}
          </option>
          {/* Las reincidencias primero: es la tabla que debería estar vacía. */}
          {(["reincidencia", "hallazgo"] as const).map((origen) => {
            const grupo = casos.filter((c) => c.origen === origen);
            if (!grupo.length) return null;
            return (
              <optgroup key={origen}
                        label={origen === "reincidencia"
                          ? "volvieron después de un arreglo"
                          : "abiertos"}>
                {grupo.map((c) => (
                  <option key={clave(c)} value={clave(c)}>
                    {c.sujeto} · {c.habilidad} · {c.regla}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <button disabled={pidiendo || !caso} onClick={() => void pedir()}
                className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40">
          {pidiendo ? "pidiendo…" : "investigar"}
        </button>
        {caso && (
          <p className="w-full text-[9px] text-[var(--t-text-dim)]">
            {caso.que} · desde {caso.cuando}
          </p>
        )}
      </div>

      {error && <p className="text-[10px] text-[var(--t-neg)]">{error}</p>}
      {lab?.casos_error && (
        <p className="text-[10px] text-[var(--t-neg)]">
          No pude leer qué hay para investigar: {lab.casos_error}
        </p>
      )}

      {abierto != null && pedido && <VerPedido p={pedido} />}

      {/* ── LAS ANTERIORES ───────────────────────────────────────────── */}
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
              <span className="text-[var(--t-text-dim)]">· {p.estado}</span>
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


// ── UN PEDIDO: EL RESULTADO PRIMERO, EL CÓMO LLEGÓ PLEGADO ───────────────
function VerPedido({ p }: { p: Pedido }) {
  const [verPasos, setVerPasos] = useState(false);
  const corriendo = p.estado === "pendiente" || p.estado === "corriendo";
  const listo = Boolean(p.investigacion_id);

  return (
    <div className="border border-[var(--t-border)] p-2 flex flex-col gap-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span style={{ color: COLOR_ESTADO[p.estado] }}>●</span>
        <b className="text-[11px] text-[var(--t-text)]">{p.tipo} {p.caso}</b>
        <span className="text-[9px] text-[var(--t-text-dim)]">
          pedido {fechaHora(p.at)}
          {p.terminado_at ? ` · terminó ${fechaHora(p.terminado_at)}` : ""}
        </span>
      </div>

      {p.error && <p className="text-[10px] text-[var(--t-neg)]">{p.error}</p>}

      {corriendo && (
        <p className="text-[10px] text-[var(--t-accent)]">
          {p.estado === "pendiente"
            ? "en la cola — el agente la levanta en su próxima pasada…"
            : `investigando… ${p.pasos?.length ?? 0} pasos`}
        </p>
      )}

      {/* EL RESULTADO. Primero el título, que se entiende solo. */}
      {listo && (
        <div className="flex flex-col gap-2">
          {p.titulo && (
            <p className="text-[12px] font-bold text-[var(--t-text)] leading-snug">
              {p.titulo}
            </p>
          )}
          {p.de_quien_es && (
            <p className="text-[9px] uppercase tracking-widest"
               style={{ color: COLOR_CULPA[p.de_quien_es] ?? "var(--t-text-dim)" }}>
              es {p.de_quien_es === "no_se" ? "no se sabe de quién" : p.de_quien_es}
            </p>
          )}
          {/* QUÉ HARÍA va ARRIBA de la cronología: es lo accionable, y lo que
              pasó ya lo resume el título. */}
          <Campo titulo="qué haría" items={p.que_haria} destacado />
          <Campo titulo="por qué" items={p.por_que} />
          <Campo titulo="qué pasó" items={p.que_paso} />
          {/* «Lo que no sé» NO es un pie de página: separa una conclusión de
              una afirmación sobre lo que no se miró. */}
          <Campo titulo="lo que no sé" items={p.lo_que_no_se} />
          <Campo titulo="de dónde lo saqué" items={p.de_donde} tenue />
        </div>
      )}

      {/* EL CÓMO LLEGÓ. Plegado: 25 líneas tapaban el resultado. */}
      {p.pasos?.length > 0 && (
        <div>
          <button onClick={() => setVerPasos(!verPasos)}
                  className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">
            {verPasos ? "cerrar" : "ver"} cómo llegó · {p.pasos.length} pasos
          </button>
          {verPasos && (
            <div className="bg-[var(--t-surface)] p-1.5 mt-1 max-h-64 overflow-y-auto">
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
        </div>
      )}
    </div>
  );
}


function Campo({ titulo, items, destacado, tenue }: {
  titulo: string;
  items?: string[] | null;
  destacado?: boolean;
  tenue?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] mb-0.5">
        {titulo}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((x, i) => (
          <li key={i} className={`text-[10px] leading-snug pl-3 -indent-3 ${
            tenue ? "text-[var(--t-text-dim)]"
                  : destacado ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)]"}`}>
            <span className="text-[var(--t-text-dim)]">· </span>{x}
          </li>
        ))}
      </ul>
    </div>
  );
}
