"use client";

// EL PANEL DEL LAB — qué gastamos y con qué modelo corremos.
//
// Va arriba del chat, plegado. Dos bloques:
//
//   GASTO   — el libro de llamadas al modelo (`ia.llamadas`). Existía desde
//             hace meses y no lo miraba nadie: cada llamada quedaba anotada con
//             sus tokens, su latencia y cuánto pegó en el caché.
//   TAREAS  — con qué proveedor y modelo corre CADA COSA que usa IA: el chat
//             del LAB, el texto de los avisos del agente, el botón explicámelo.
//             Se guarda en la base y aplica sin deploy.
//
// ⚠️ **UNA FILA ES UNA TAREA, no un `proveedor × rol`.** Antes era lo segundo y
// el resultado fue un desplegable que no hacía nada: se configuraba «deepseek ·
// pro» y el asistente seguía andando con openai, porque a esa tarea nunca le
// tocaba esa combinación. No fallaba — simplemente no tenía efecto, y no había
// forma de saberlo desde la pantalla.
//
// ⚠️ **NINGÚN NÚMERO SE CALCULA ACÁ.** Los totales, el % de caché y el modelo
// en uso vienen del backend, de la misma consulta que dibuja cada lista. Es la
// regla del repo, y acá importa el doble: "con qué modelo corro" tiene una
// precedencia (elección > env > default) que vive en `core/ai.py`. Replicarla
// en el navegador daría dos respuestas que se desincronizan sin que nada falle.
import { useCallback, useEffect, useState } from "react";

import type { PanelLab, ProveedorLab, TareaLab, TarifaLab } from "@/components/agente/tipos";

const miles = (n: number) => n.toLocaleString("es-AR");

export function PanelLabIA({ leer, guardar }: {
  leer: <T>(url: string) => Promise<T>;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState<PanelLab | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setP(await leer<PanelLab>("/api/agente/lab/panel"));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCargando(false);
    }
  }, [leer]);

  // Se pide recién al abrir: el panel es información de fondo, y pedirla al
  // montar la tab retrasaría el chat, que es para lo que se entra.
  useEffect(() => {
    if (!abierto || p || cargando) return;
    const id = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(id);
  }, [abierto, p, cargando, cargar]);

  const g = p?.gasto;

  return (
    <div className="border border-[var(--t-border)]">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full text-left px-2 py-1 flex items-baseline gap-2 flex-wrap hover:bg-[var(--t-surface)]"
      >
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
          {abierto ? "▾" : "▸"} modelo y gasto
        </span>
        {p && (
          <span className="text-[9px] text-[var(--t-text-muted)]">
            {/* El chat corre con lo que diga la tarea `asistente`. El nombre
                sale del backend: buscarlo por string acá sería una segunda
                lista que queda vieja sin que nada falle. */}
            {(() => {
              const a = p.tareas.find((t) => t.tarea === "asistente");
              return a ? (
                <>este chat corre con <b className="text-[var(--t-accent)]">{a.modelo}</b>
                  {" · "}{a.proveedor}</>
              ) : null;
            })()}
            {g && !g.error && (
              <> · hoy {miles(g.hoy.llamadas)} llamada(s), {miles(g.hoy.tokens)} tokens</>
            )}
          </span>
        )}
      </button>

      {abierto && (
        <div className="border-t border-[var(--t-border)] p-2 flex flex-col gap-3">
          {cargando && !p && (
            <p className="text-[10px] text-[var(--t-text-muted)]">cargando…</p>
          )}
          {error && <p className="text-[10px] text-[var(--t-neg)]">{error}</p>}
          {g?.error && <p className="text-[10px] text-[var(--t-neg)]">{g.error}</p>}

          {g && !g.error && <Gasto g={g} />}
          {g && !g.error && g.tarifas.length > 0 && (
            <Tarifas tarifas={g.tarifas} guardar={guardar} refrescar={cargar} />
          )}
          {p && (
            <div className="flex flex-col gap-2">
              <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                con qué corre cada cosa
              </p>
              {p.tareas.map((t) => (
                <Tarea key={t.tarea} t={t} proveedores={p.proveedores}
                       guardar={guardar} refrescar={cargar} />
              ))}
              {/* El aviso del proveedor va UNA vez abajo, no repetido en cada
                  fila: es una propiedad del proveedor, no de la tarea. */}
              {p.proveedores.filter((pr) => pr.aviso).map((pr) => (
                <p key={pr.proveedor}
                   className="text-[9px] text-[var(--t-neg)] leading-snug">
                  ⚠ <b>{pr.proveedor}</b>: {pr.aviso}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── EL GASTO ──────────────────────────────────────────────────────────────
function Gasto({ g }: { g: NonNullable<PanelLab["gasto"]> }) {
  const t = g.total;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
        últimos {g.dias} días
      </p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        <Dato k="llamadas" v={miles(t.llamadas)} />
        <Dato k="tokens in" v={miles(t.tokens_in)} />
        <Dato k="tokens out" v={miles(t.tokens_out)} />
        {/* ⚠️ El hit rate del caché. El caché cuesta una fracción del precio
            normal, así que este número es la palanca más barata que hay: subirlo
            no cambia ni una respuesta y baja la factura. */}
        <Dato k="del caché"
              v={g.cache_pct === null ? "—" : `${g.cache_pct}%`}
              destacado={g.cache_pct !== null && g.cache_pct > 0} />
        <Dato k="usd" v={t.usd === null ? "sin tarifa" : `$${t.usd}`} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--t-text-dim)] text-left">
              <th className="font-normal pr-3">tarea</th>
              <th className="font-normal pr-3">modelo</th>
              <th className="font-normal pr-3 text-right">llam.</th>
              <th className="font-normal pr-3 text-right">in</th>
              <th className="font-normal pr-3 text-right">out</th>
              <th className="font-normal pr-3 text-right">caché</th>
              <th className="font-normal text-right">usd</th>
            </tr>
          </thead>
          <tbody>
            {g.por_tarea.map((f) => (
              <tr key={`${f.tarea}/${f.modelo}`} className="border-t border-[var(--t-border)]">
                <td className="pr-3 text-[var(--t-text)]">{f.tarea}</td>
                <td className="pr-3 text-[var(--t-text-muted)]">{f.modelo}</td>
                <td className="pr-3 text-right tabular-nums">
                  {miles(f.llamadas)}
                  {/* Las fallidas se muestran al lado y no sumadas adentro: son
                      gasto que no produjo nada, y es lo que hay que mirar. */}
                  {f.fallidas > 0 && (
                    <span className="text-[var(--t-neg)]"> ✕{f.fallidas}</span>
                  )}
                </td>
                <td className="pr-3 text-right tabular-nums">{miles(f.tokens_in)}</td>
                <td className="pr-3 text-right tabular-nums">{miles(f.tokens_out)}</td>
                <td className="pr-3 text-right tabular-nums text-[var(--t-text-dim)]">
                  {miles(f.cache_hit)}
                </td>
                <td className="text-right tabular-nums">
                  {f.usd === null ? "—" : `$${f.usd}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ⚠️ Sin este renglón, un "—" en la columna usd se lee como "no gastó". */}
      {g.sin_precio.length > 0 && (
        <p className="text-[9px] text-[var(--t-text-dim)]">
          Sin tarifa cargada: <b>{g.sin_precio.join(", ")}</b> — su gasto en dólares
          no se muestra. No se estima: una tarifa inventada no falla, miente.
        </p>
      )}
    </div>
  );
}

function Dato({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <span>
      <span className="text-[var(--t-text-dim)]">{k} </span>
      <b className={`tabular-nums ${destacado ? "text-[var(--t-pos)]" : "text-[var(--t-text)]"}`}>
        {v}
      </b>
    </span>
  );
}


// ── UNA TAREA: con qué corre, y con qué la podés hacer correr ─────────────
//
// ⚠️ Una fila = una cosa que corre. Antes esto era `proveedor × rol` y el
// resultado fue un desplegable que no hacía nada: se elegía «deepseek · pro» y
// el asistente seguía andando con openai, porque a esa tarea nunca le tocaba
// esa combinación. No fallaba — simplemente no tenía efecto.
function Tarea({ t, proveedores, guardar, refrescar }: {
  t: TareaLab;
  proveedores: ProveedorLab[];
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
  refrescar: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // `proveedor/modelo` en un solo valor, igual que lo guarda el backend: dos
  // desplegables separados dejarían elegir un modelo de un proveedor con otro
  // seleccionado, que es un pedido que nadie entiende.
  const actual = `${t.proveedor}/${t.modelo}`;

  async function elegir(valor: string) {
    setGuardando(true);
    setMsg(null);
    const [proveedor, modelo] = valor ? valor.split("/") : ["", ""];
    try {
      // ⚠️ El backend PRUEBA el modelo antes de guardarlo, y qué le exige
      // depende de la tarea: si ofrece herramientas, tiene que pedir una.
      // Por eso la prueba no es un botón acá: es parte de guardar, allá.
      const r = await guardar<{ ok: boolean; error?: string; modelo?: string }>(
        "/api/agente/lab/modelo", { tarea: t.tarea, proveedor, modelo });
      setMsg(r.ok
        ? { ok: true, texto: modelo ? `${r.modelo} probado y guardado` : "vuelve al default" }
        : { ok: false, texto: r.error || "no se pudo guardar" });
      if (r.ok) await refrescar();
    } catch (e) {
      setMsg({ ok: false, texto: String(e) });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-[var(--t-border)] pl-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="text-[10px] text-[var(--t-text)]">{t.tarea}</b>
        <span className="text-[9px] text-[var(--t-text-dim)]">{t.para_que}</span>
        {t.usa_herramientas && (
          <span className="text-[9px] text-[var(--t-text-dim)]">· usa herramientas</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={actual}
          disabled={guardando}
          onChange={(e) => void elegir(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-2 py-1 flex-1 min-w-[240px] text-[var(--t-text)] disabled:opacity-40"
        >
          {/* Volver al default es una opción del mismo desplegable: «elegí mal»
              no se arregla eligiendo otra cosa. */}
          <option value="">
            — default del código: {t.declarado.proveedor} · {t.declarado.tier} —
          </option>
          {proveedores.map((pr) => (
            <optgroup key={pr.proveedor}
                      label={pr.proveedor + (pr.configurado ? "" : " (sin API key)")
                             + (pr.usable ? "" : " (no habilitado)")}>
              {/* Lo que corre hoy aparece aunque el proveedor no liste sus
                  modelos: si no, el desplegable mostraría vacío el valor
                  seleccionado y parecería que no hay nada configurado. */}
              {(pr.modelos.includes(t.modelo) || pr.proveedor !== t.proveedor
                ? pr.modelos : [t.modelo, ...pr.modelos]).map((m) => (
                <option key={m} value={`${pr.proveedor}/${m}`}
                        disabled={!pr.usable || !pr.configurado}>
                  {pr.proveedor} · {m}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {guardando && (
          <span className="text-[9px] text-[var(--t-accent)]">probando…</span>
        )}
        {!t.elegido && (
          <span className="text-[9px] text-[var(--t-text-dim)]">del código</span>
        )}
      </div>

      {msg && (
        <p className={`text-[9px] leading-snug ${
          msg.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
          {msg.ok ? "✔" : "✕"} {msg.texto}
        </p>
      )}
    </div>
  );
}


// ── LAS TARIFAS ───────────────────────────────────────────────────────────
//
// ⚠️ TRES precios por modelo, y van JUNTOS. Una tarifa a medias —entrada
// cargada, caché en blanco— calcula un costo equivocado sin fallar, y encima
// al revés de lo que uno espera: sobrecobra justo la parte más barata.
//
// Lo que el número NO modela, y conviene saberlo antes de creerle: las
// escrituras de caché cuestan un poco más que la entrada normal (y el libro no
// las distingue), el contexto largo cuesta el doble a partir de cierto tamaño,
// y DeepSeek cobra distinto en horario pico. El total es un piso.
function Tarifas({ tarifas, guardar, refrescar }: {
  tarifas: TarifaLab[];
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
  refrescar: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAbierto(!abierto)}
        className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
      >
        {abierto ? "▾" : "▸"} tarifas · usd por millón de tokens
      </button>
      {abierto && (
        <div className="flex flex-col gap-1 mt-1">
          <p className="text-[9px] text-[var(--t-text-dim)]">
            Los tres van juntos. El del <b>caché</b> es el que más cambia el
            total: esa entrada cuesta una fracción, y sin él se sobrecobra justo
            la parte que venimos optimizando.
          </p>
          {tarifas.map((t) => (
            <FilaTarifa key={t.modelo} t={t} guardar={guardar} refrescar={refrescar} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaTarifa({ t, guardar, refrescar }: {
  t: TarifaLab;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
  refrescar: () => Promise<void>;
}) {
  const n = (v: number | null) => (v === null ? "" : String(v));
  const [entrada, setEntrada] = useState(n(t.entrada));
  const [cache, setCache] = useState(n(t.cache));
  const [salida, setSalida] = useState(n(t.salida));
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  const completo = entrada !== "" && cache !== "" && salida !== "";

  async function enviar() {
    if (!completo || guardando) return;
    setGuardando(true);
    setMsg("");
    try {
      const r = await guardar<{ ok: boolean; error?: string }>(
        "/api/agente/lab/precio", {
          modelo: t.modelo, entrada: Number(entrada),
          cache: Number(cache), salida: Number(salida),
        });
      setMsg(r.ok ? "✔ guardada" : `✕ ${r.error || "no se pudo"}`);
      if (r.ok) await refrescar();
    } catch (e) {
      setMsg(`✕ ${String(e)}`);
    } finally {
      setGuardando(false);
    }
  }

  const input = (v: string, set: (s: string) => void, ph: string) => (
    <input
      value={v}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") void enviar(); }}
      placeholder={ph}
      inputMode="decimal"
      className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[10px] px-1 py-0.5 w-20 text-right tabular-nums text-[var(--t-text)] placeholder:text-[var(--t-text-dim)]"
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px]">
      <span className="text-[var(--t-text)] min-w-[150px]">{t.modelo}</span>
      <span className="text-[var(--t-text-dim)] text-[9px]">entrada</span>
      {input(entrada, setEntrada, "0.20")}
      <span className="text-[var(--t-text-dim)] text-[9px]">caché</span>
      {input(cache, setCache, "0.02")}
      <span className="text-[var(--t-text-dim)] text-[9px]">salida</span>
      {input(salida, setSalida, "1.20")}
      <button
        onClick={() => void enviar()}
        disabled={!completo || guardando}
        className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-30"
      >
        {guardando ? "…" : "guardar"}
      </button>
      {msg && (
        <span className={msg.startsWith("✔")
          ? "text-[9px] text-[var(--t-pos)]" : "text-[9px] text-[var(--t-neg)]"}>
          {msg}
        </span>
      )}
    </div>
  );
}
