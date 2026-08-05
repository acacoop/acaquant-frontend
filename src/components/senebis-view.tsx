"use client";

// SENEBIS (Back Office → SENEBIS) — órdenes que cargan los TRADERS para que
// el BACK OFFICE las procese en el sistema externo (Quantex) y las marque
// COMPLETADA. Dos sub-tabs:
//   ÓRDENES      → carga/edición (form estilo Mesa de Dinero) + toggle estado.
//   EXCEL QUANTEX→ espejo EN VIVO del archivo destino (las filas salen del
//                  backend vía /excel con las MISMAS reglas que el .xlsx —
//                  acá no se recalcula nada) + botón GENERAR EXCEL.
// Presencia: el poll de la lista marca "estoy en la vista" y trae quiénes
// más están (para no pisarse al completar). Derivados (monto, liquidación,
// plazo, número de agente, denominación) los resuelve el backend.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { fetchJson, getJSON as getJson } from "@/lib/fetch-json";
import { NumeroInput } from "./numero-input";

// ── Types (contrato /api/back-office/senebis) ──────────────────────────────
type Orden = {
  id: number;
  operacion: string;
  concertacion: string;
  liquidacion: string | null;
  plazo: string | null;
  especie: string;
  vn: number | null; px: number | null; monto: number | null;
  cp: string | null; cc: string | null; cc_denominacion: string | null;
  contraparte: string | null; nro_contraparte: string | null;
  mercado: string | null;
  cargan_ellos: string | null; tipo: string | null;
  tipo_contraparte: "interno" | "externo";
  agente: string | null; agente_numero: string | null;
  es_mae: boolean;
  // Marcas de edición persistentes (reemplazan al amarillo que se pintaba a
  // mano en la planilla vieja): qué campos se tocaron post-alta (→ *) y si el
  // cambio se hizo sobre una orden YA completada (→ fila amarilla).
  campos_editados: string[];
  editada_completada: boolean;
  estado: "pendiente" | "completada";
  completada_por: string | null; completada_at: string | null;
  creado_por: string | null; creado_at: string | null;
  actualizado_por: string | null;
};
type Conectado = { email: string; visto_at: string };
type OpsResp = { total: number; pendientes: number; ordenes: Orden[]; conectados: Conectado[] };
type Agente = { nombre: string; numero: string };
type Opciones = {
  agentes: Agente[]; tipos_contraparte: string[]; plazos: string[];
  conectados: Conectado[];
  // Cargar/editar/borrar: MISMA allowlist que Mesa de Dinero (+ admin).
  // El front esconde la edición; el enforcement real es server-side.
  puede_escribir: boolean;
  es_admin: boolean;
};
type ExcelFila = { id: number; estado: string; valores: (string | number | null)[] };
type ExcelResp = {
  headers: string[]; filas: ExcelFila[]; conectados: Conectado[];
  // Próximo ID de la secuencia — mientras conviva el Excel viejo hay que
  // alinearlo a mano (último ID de allá + 1) antes de arrancar a cargar.
  proximo_id: number;
};
type Comitente = { id_cuenta: string; denominacion: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────
const INPUT =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 " +
  "text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none";

const fmtNum = (n: number | null | undefined, dec = 2) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const hoyIso = () => new Date().toISOString().slice(0, 10);

// Inputs numéricos: coma O punto = decimal (mismo criterio que Mesa de Dinero).
const normalizarNumeroInput = (s: string) => {
  const src = (s ?? "").replace(/\s/g, "");
  if (!src) return "";
  const neg = src.startsWith("-");
  const clean = src.replace(/[^\d.,]/g, "");
  const sepIdx = clean.search(/[.,]/);
  if (sepIdx < 0) return (neg ? "-" : "") + clean.replace(/\D/g, "");
  const ints = clean.slice(0, sepIdx).replace(/\D/g, "");
  const decs = clean.slice(sepIdx + 1).replace(/\D/g, "");
  return (neg ? "-" : "") + ints + "," + decs;
};
const num = (s: string): number | null => {
  const raw = normalizarNumeroInput(s);
  if (raw === "" || raw === "-" || raw === "," || raw === "-,") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const aCrudo = (n: number | null) => (n != null ? String(n).replace(".", ",") : "");

// Nombres lindos de los campos para el tooltip de las marcas de edición.
const LABEL_CAMPO: Record<string, string> = {
  operacion: "operación", concertacion: "concertación", liquidacion: "liquidación",
  plazo: "plazo", especie: "especie", vn: "VN", px: "PX", monto: "monto",
  cp: "CP", cc: "cuenta comitente", contraparte: "contraparte",
  nro_contraparte: "nro contraparte", mercado: "mercado",
  cargan_ellos: "cargan ellos", tipo: "tipo",
  tipo_contraparte: "tipo de contraparte", agente: "agente", es_mae: "MAE",
};

// Marca de edición de un campo: * ámbar al lado del valor que se tocó después
// del alta. `campos` es una lista porque una columna puede mapear a varios
// campos (ej. CONTRAPARTE = cc | agente | tipo_contraparte).
function Ed({ o, campos }: { o: Orden; campos: string[] }) {
  const tocados = campos.filter((c) => o.campos_editados?.includes(c));
  if (!tocados.length) return null;
  return (
    <span
      title={`editado después del alta: ${tocados.map((c) => LABEL_CAMPO[c] ?? c).join(", ")}`}
      className="text-[#e0a800] font-bold ml-0.5"
    >
      *
    </span>
  );
}

// ── Presencia (avatares de quién tiene la vista abierta) ───────────────────
function Presencia({ conectados }: { conectados: Conectado[] }) {
  if (!conectados.length) return null;
  return (
    <div className="flex items-center gap-1" title={conectados.map((c) => c.email).join("\n")}>
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-pos)] animate-pulse" />
      <span className="text-[9px] text-[var(--t-text-muted)] uppercase">En vista:</span>
      {conectados.map((c) => (
        <span
          key={c.email}
          title={c.email}
          className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] bg-[var(--t-panel)] text-[var(--t-text)] uppercase"
        >
          {c.email.split("@")[0]}
        </span>
      ))}
    </div>
  );
}

// ── Formulario de alta/edición (modal, compartido por las 2 tabs) ──────────
type FormState = {
  operacion: string; concertacion: string; plazo: string;
  especie: string; vn: string; px: string;
  tipo_contraparte: "interno" | "externo";
  agente: string; cc: string;
  cp: string; mercado: string; cargan_ellos: string; tipo: string;
  es_mae: boolean;
};
const FORM_VACIO: FormState = {
  operacion: "COMPRA", concertacion: hoyIso(), plazo: "CI",
  especie: "", vn: "", px: "",
  tipo_contraparte: "interno", agente: "", cc: "",
  cp: "255", mercado: "", cargan_ellos: "", tipo: "",
  es_mae: false,
};

function ordenAForm(o: Orden): FormState {
  return {
    operacion: o.operacion, concertacion: o.concertacion, plazo: o.plazo ?? "CI",
    especie: o.especie, vn: aCrudo(o.vn), px: aCrudo(o.px),
    tipo_contraparte: o.tipo_contraparte,
    agente: o.agente ?? "", cc: o.cc ?? "",
    cp: o.cp ?? "255", mercado: o.mercado ?? "",
    cargan_ellos: o.cargan_ellos ?? "", tipo: o.tipo ?? "",
    es_mae: o.es_mae,
  };
}

function OrdenForm({ opciones, editando, onGuardado, onCerrar, onBorrar }: {
  opciones: Opciones | null;
  editando: Orden | null;
  onGuardado: () => void;
  onCerrar: () => void;
  onBorrar: (o: Orden) => Promise<void>;
}) {
  const [f, setF] = useState<FormState>(editando ? ordenAForm(editando) : FORM_VACIO);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Autocomplete de comitentes (interno): busca por número o denominación.
  // El dropdown SIEMPRE muestra su estado (buscando / sin coincidencias /
  // error) — un fallo silencioso se ve idéntico a "no hay desplegable" y ya
  // nos pasó (ver lib/use-poll.ts): mejor decir qué está pasando.
  const [sug, setSug] = useState<Comitente[]>([]);
  const [sugEstado, setSugEstado] =
    useState<"cerrado" | "buscando" | "ok" | "error">("cerrado");
  const [sugErr, setSugErr] = useState<string>("");
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Agente externo: se escribe para filtrar, pero el valor tiene que salir del
  // catálogo (el backend rechaza cualquier nombre que no esté cargado).
  const [agenteAbierto, setAgenteAbierto] = useState(false);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setF((p) => ({ ...p, [k]: e.target.value }));
  // Números: NumeroInput muestra miles en vivo y entrega el crudo "123,45".
  const setNum = (k: keyof FormState) => (raw: string) =>
    setF((p) => ({ ...p, [k]: raw }));

  const buscarCC = (q: string, actualizarForm = true) => {
    if (actualizarForm) setF((p) => ({ ...p, cc: q }));
    if (sugTimer.current) clearTimeout(sugTimer.current);
    const term = q.trim();
    if (!term) { setSug([]); setSugEstado("cerrado"); return; }
    setSugEstado("buscando");
    sugTimer.current = setTimeout(async () => {
      try {
        const r = await fetchJson<{ comitentes: Comitente[] }>(
          `/api/back-office/senebis/comitentes?q=${encodeURIComponent(term)}`);
        setSug(r.comitentes ?? []);
        setSugEstado("ok");
      } catch (e) {
        setSug([]);
        setSugErr(e instanceof Error ? e.message : String(e));
        setSugEstado("error");
      }
    }, 250);
  };

  // Preview de derivados (informativo — la fuente de verdad es el backend).
  const monto = num(f.vn) != null && num(f.px) != null
    ? (num(f.vn)! * num(f.px)!) / 100 : null;

  const guardar = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {
        operacion: f.operacion,
        concertacion: f.concertacion || null,
        plazo: f.plazo || null,
        especie: f.especie,
        vn: num(f.vn), px: num(f.px),
        cp: f.cp || null,
        mercado: f.mercado || null,
        cargan_ellos: f.cargan_ellos || null,
        tipo: f.tipo || null,
        tipo_contraparte: f.tipo_contraparte,
        agente: f.tipo_contraparte === "externo" ? f.agente || null : null,
        cc: f.tipo_contraparte === "interno" ? f.cc || null : null,
        es_mae: f.es_mae,
      };
      const r = await fetch(
        editando ? `/api/back-office/senebis/ops/${editando.id}` : "/api/back-office/senebis/ops",
        {
          method: editando ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try {
          const j = (await r.json()) as { detail?: string };
          if (typeof j?.detail === "string") msg = j.detail;
        } catch { /* body no era JSON */ }
        throw new Error(msg);
      }
      onGuardado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const agentes = opciones?.agentes ?? [];
  const agenteQ = f.agente.trim().toUpperCase();
  const agentesFiltrados = agenteQ
    ? agentes.filter((a) => `${a.nombre} ${a.numero}`.toUpperCase().includes(agenteQ))
    : agentes;
  const agenteValido = agentes.some((a) => a.nombre.toUpperCase() === agenteQ);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCerrar}>
      <div
        className="w-[520px] max-w-[95vw] border border-[var(--t-border)] bg-[var(--t-surface)] p-3 flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">
            {editando ? `EDITAR ORDEN #${editando.id}` : "NUEVA ORDEN SENEBIS"}
          </span>
          <button onClick={onCerrar} className="text-[var(--t-text-dim)] hover:text-[var(--t-text)] text-[12px]">✕</button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Campo label="OPERACIÓN">
            <select className={INPUT} value={f.operacion} onChange={set("operacion")}>
              <option>COMPRA</option>
              <option>VENTA</option>
            </select>
          </Campo>
          <Campo label="CONCERTACIÓN">
            <input type="date" className={INPUT} value={f.concertacion} onChange={set("concertacion")} />
          </Campo>
          <Campo label="PLAZO" hint="CI liquida hoy · 24 el próximo hábil">
            <select className={INPUT} value={f.plazo} onChange={set("plazo")}>
              <option value="CI">CI</option>
              <option value="24">24</option>
            </select>
          </Campo>

          <Campo label="ESPECIE">
            <input
              className={`${INPUT} uppercase`} placeholder="TZXM7" value={f.especie}
              onChange={(e) => setF((p) => ({ ...p, especie: e.target.value.toUpperCase() }))}
            />
          </Campo>
          <Campo label="VN">
            <NumeroInput className={`${INPUT} text-right`} value={f.vn} onChange={setNum("vn")} />
          </Campo>
          <Campo label="PX (cada 100 VN)">
            <NumeroInput className={`${INPUT} text-right`} value={f.px} onChange={setNum("px")} />
          </Campo>
        </div>

        {/* MAE: se carga en el MAE, no en Quantex → no sale en el Excel. */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--t-text-muted)] uppercase">¿MAE?</span>
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setF((p) => ({ ...p, es_mae: v }))}
              className={`text-[10px] uppercase px-2 py-0.5 border ${
                f.es_mae === v
                  ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
              }`}
            >
              {v ? "SÍ" : "NO"}
            </button>
          ))}
          {f.es_mae && (
            <span className="text-[9px] text-[#7fa6d9]">
              se carga por MAE — NO sale en el Excel Quantex · tipo = MAE automático
            </span>
          )}
        </div>

        {/* Contraparte: interno (cliente ALyC) vs externo (agente) */}
        <div className="border border-[var(--t-border-2)] p-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[var(--t-text-muted)] uppercase">Contraparte</span>
            {(["interno", "externo"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setF((p) => ({ ...p, tipo_contraparte: t }))}
                className={`text-[10px] uppercase px-2 py-0.5 border ${
                  f.tipo_contraparte === t
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
                }`}
              >
                {t === "interno" ? "INTERNO (cliente)" : "EXTERNO (agente)"}
              </button>
            ))}
          </div>

          {f.tipo_contraparte === "externo" ? (
            <Campo label="AGENTE" hint="escribí para filtrar · el número del catálogo va al Excel">
              <div className="relative">
                <input
                  className={`${INPUT} w-full uppercase ${
                    agenteQ && !agenteValido ? "border-[var(--t-neg)]" : ""
                  }`}
                  placeholder="escribí el agente…"
                  value={f.agente}
                  onChange={(e) => {
                    setF((p) => ({ ...p, agente: e.target.value.toUpperCase() }));
                    setAgenteAbierto(true);
                  }}
                  onFocus={() => setAgenteAbierto(true)}
                  onBlur={() => setTimeout(() => setAgenteAbierto(false), 200)}
                />
                {agenteAbierto && (
                  <div className="absolute z-20 top-full left-0 right-0 max-h-40 overflow-y-auto border border-[var(--t-accent)] bg-[var(--t-panel)] shadow-lg">
                    {!agentes.length && (
                      <div className="px-2 py-1 text-[10px] text-[var(--t-neg)]">
                        catálogo vacío — cargarlo desde el botón AGENTES de la vista
                      </div>
                    )}
                    {!!agentes.length && !agentesFiltrados.length && (
                      <div className="px-2 py-1 text-[10px] text-[var(--t-neg)]">
                        ningún agente coincide — tiene que estar en el catálogo
                      </div>
                    )}
                    {agentesFiltrados.map((a) => (
                      <button
                        key={a.nombre}
                        type="button"
                        className="block w-full text-left px-2 py-1 text-[10px] text-[var(--t-text)] hover:bg-[var(--t-surface)]"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setF((p) => ({ ...p, agente: a.nombre }));
                          setAgenteAbierto(false);
                        }}
                      >
                        <span className="text-[var(--t-accent)]">{a.nombre}</span>
                        <span className="text-[var(--t-text-dim)]"> · {a.numero}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {agenteQ && !agenteValido && (
                <span className="text-[9px] text-[var(--t-neg)]">
                  elegilo del desplegable — el nombre tiene que existir en el catálogo
                </span>
              )}
            </Campo>
          ) : (
            <Campo label="CUENTA COMITENTE (número o nombre)" hint="se normaliza al número">
              <div className="relative">
                <input
                  className={`${INPUT} w-full`} placeholder="escribí número o nombre…" value={f.cc}
                  onChange={(e) => buscarCC(e.target.value)}
                  onFocus={() => { if (f.cc.trim()) buscarCC(f.cc, false); }}
                  onBlur={() => setTimeout(() => setSugEstado("cerrado"), 200)}
                />
                {sugEstado !== "cerrado" && (
                  <div className="absolute z-20 top-full left-0 right-0 max-h-40 overflow-y-auto border border-[var(--t-accent)] bg-[var(--t-panel)] shadow-lg">
                    {sugEstado === "buscando" && (
                      <div className="px-2 py-1 text-[10px] text-[var(--t-text-dim)]">buscando…</div>
                    )}
                    {sugEstado === "error" && (
                      <div className="px-2 py-1 text-[10px] text-[var(--t-neg)]">
                        no se pudo buscar ({sugErr}) — ¿backend actualizado?
                      </div>
                    )}
                    {sugEstado === "ok" && !sug.length && (
                      <div className="px-2 py-1 text-[10px] text-[var(--t-text-dim)]">
                        sin coincidencias — queda como texto libre
                      </div>
                    )}
                    {sugEstado === "ok" && sug.map((c) => (
                      <button
                        key={c.id_cuenta}
                        type="button"
                        className="block w-full text-left px-2 py-1 text-[10px] text-[var(--t-text)] hover:bg-[var(--t-surface)]"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setF((p) => ({ ...p, cc: c.id_cuenta }));
                          setSugEstado("cerrado");
                        }}
                      >
                        <span className="text-[var(--t-accent)]">{c.id_cuenta}</span>
                        {c.denominacion ? ` — ${c.denominacion}` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Campo>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Campo label="CP (cartera propia)">
            <input className={`${INPUT} text-right`} value={f.cp} onChange={set("cp")} />
          </Campo>
          <Campo label="MERCADO">
            <select className={INPUT} value={f.mercado} onChange={set("mercado")}>
              <option value="">—</option>
              <option value="GARANTIZADO">GARANTIZADO</option>
              <option value="NO GARANTIZADO">NO GARANTIZADO</option>
            </select>
          </Campo>
          <Campo label="CARGAN ELLOS (obs)">
            <input className={INPUT} value={f.cargan_ellos} onChange={set("cargan_ellos")} />
          </Campo>
          <Campo label="TIPO (obs)">
            <input
              className={`${INPUT} disabled:opacity-60`}
              placeholder="pasada"
              value={f.es_mae ? "MAE" : f.tipo}
              onChange={set("tipo")}
              disabled={f.es_mae}
              title={f.es_mae ? "orden MAE: el tipo queda MAE automático" : undefined}
            />
          </Campo>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--t-text-muted)]">
            MONTO (vn×px/100): <span className="text-[var(--t-text)]">{fmtNum(monto)}</span>
          </span>
          <div className="flex items-center gap-2">
            {err && <span className="text-[9px] text-[var(--t-neg)] max-w-[240px] truncate" title={err}>{err}</span>}
            {editando && (
              // Eliminar SOLO desde acá (decisión 2026-08-05: nada de ✕ en la
              // tabla — borrar es una acción consciente dentro de la edición).
              <button
                onClick={async () => { setBusy(true); await onBorrar(editando); }}
                disabled={busy}
                className="text-[10px] uppercase px-3 py-1 border border-[var(--t-neg)] text-[var(--t-neg)] hover:bg-[var(--t-neg)] hover:text-black disabled:opacity-40"
              >
                Eliminar
              </button>
            )}
            <button
              onClick={guardar}
              disabled={busy || !f.especie}
              className="text-[10px] uppercase px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black disabled:opacity-40"
            >
              {busy ? "…" : editando ? "Guardar cambios" : "Cargar orden"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[9px] text-[var(--t-text-muted)] uppercase" title={hint}>
      {label}
      {children}
    </label>
  );
}

// ── Gestión del catálogo de agentes (modal) ────────────────────────────────
function AgentesModal({ agentes, onCambio, onCerrar }: {
  agentes: Agente[];
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [numero, setNumero] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const agregar = async () => {
    setErr(null);
    const r = await fetch("/api/back-office/senebis/agentes", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, numero }),
    });
    if (!r.ok) { setErr(`HTTP ${r.status}`); return; }
    setNombre(""); setNumero("");
    onCambio();
  };
  const borrar = async (n: string) => {
    if (!window.confirm(`¿Quitar el agente ${n} del catálogo? Queda auditado.`)) return;
    await fetch(`/api/back-office/senebis/agentes/${encodeURIComponent(n)}`, { method: "DELETE" });
    onCambio();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCerrar}>
      <div
        className="w-[420px] max-w-[95vw] border border-[var(--t-border)] bg-[var(--t-surface)] p-3 flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">AGENTES EXTERNOS</span>
          <button onClick={onCerrar} className="text-[var(--t-text-dim)] hover:text-[var(--t-text)] text-[12px]">✕</button>
        </div>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          Nombre (lo elige el trader) → número (lo que va a CONTRAPARTE en el Excel Quantex).
        </span>
        <div className="flex gap-2">
          <input className={`${INPUT} flex-1 uppercase`} placeholder="COCOS"
            value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} />
          <input className={`${INPUT} w-24 text-right`} placeholder="733"
            value={numero} onChange={(e) => setNumero(e.target.value)} />
          <button
            onClick={agregar}
            disabled={!nombre.trim() || !numero.trim()}
            className="text-[10px] uppercase px-2 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black disabled:opacity-40"
          >
            +
          </button>
        </div>
        {err && <span className="text-[9px] text-[var(--t-neg)]">{err}</span>}
        <div className="max-h-56 overflow-y-auto flex flex-col">
          {agentes.map((a) => (
            <div key={a.nombre} className="flex items-center justify-between px-1 py-1 border-b border-[var(--t-border-2)] text-[11px]">
              <span className="text-[var(--t-text)]">{a.nombre}</span>
              <span className="flex items-center gap-2">
                <span className="text-[var(--t-accent)]">{a.numero}</span>
                <button onClick={() => borrar(a.nombre)} className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)] text-[10px]">✕</button>
              </span>
            </div>
          ))}
          {!agentes.length && <span className="text-[10px] text-[var(--t-text-dim)] py-2">Sin agentes cargados todavía.</span>}
        </div>
      </div>
    </div>
  );
}

// ── Vista principal ────────────────────────────────────────────────────────
export function SenebisView() {
  const [tab, setTab] = usePersistedState<"ordenes" | "quantex">("senebis.tab", "ordenes");
  const [rango, setRango] = usePersistedState<"hoy" | "todo">("senebis.rango", "hoy");
  const [fEstado, setFEstado] = useState<"" | "pendiente" | "completada">("");
  // MAE: "" = todas (con MAE) · "sin" = excluir MAE · "solo" = solo MAE.
  const [fMae, setFMae] = usePersistedState<"" | "sin" | "solo">("senebis.mae", "");

  const [data, setData] = useState<OpsResp | null>(null);
  const [excel, setExcel] = useState<ExcelResp | null>(null);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Orden | null>(null);
  const [showAgentes, setShowAgentes] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (rango === "hoy") p.set("desde", hoyIso());
    if (fEstado) p.set("estado", fEstado);
    if (fMae) p.set("mae", fMae);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [rango, fEstado, fMae]);
  // El Excel Quantex NO recibe filtro de estado: el backend ya manda solo
  // pendientes no-MAE (lo completado ya se cargó en Quantex).
  const qsExcel = useMemo(
    () => (rango === "hoy" ? `?desde=${hoyIso()}` : ""), [rango]);

  const cargar = useCallback(async () => {
    // /ops marca presencia y trae conectados; /excel es el espejo del archivo.
    const [o, x] = await Promise.all([
      getJson<OpsResp>(`/api/back-office/senebis/ops${qs}`),
      getJson<ExcelResp>(`/api/back-office/senebis/excel${qsExcel}`),
    ]);
    if (o) { setData(o); setErr(null); } else { setErr("no se pudo actualizar la lista"); }
    if (x) setExcel(x);
  }, [qs, qsExcel]);

  const cargarOpciones = useCallback(async () => {
    const op = await getJson<Opciones>("/api/back-office/senebis/opciones");
    if (op) setOpciones(op);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarOpciones(); }, [cargarOpciones]);
  // Poll 10s: mantiene la lista + el espejo Quantex + la presencia en vivo.
  useEffect(() => {
    const t = setInterval(cargar, 10_000);
    return () => clearInterval(t);
  }, [cargar]);

  const toggleEstado = async (o: Orden) => {
    setBusyId(o.id);
    try {
      const nuevo = o.estado === "pendiente" ? "completada" : "pendiente";
      const r = await fetch(`/api/back-office/senebis/ops/${o.id}/estado`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevo }),
      });
      if (r.ok) await cargar();
    } finally { setBusyId(null); }
  };

  const puedeEscribir = opciones?.puede_escribir ?? false;
  const esAdmin = opciones?.es_admin ?? false;

  // Quantex ya consumió el número aunque la orden después falle por mercado:
  // al reintentar hay que mandarla con uno nuevo.
  const reasignarId = async (o: Orden) => {
    if (!window.confirm(
      `¿Darle un ID NUEVO a la orden #${o.id} (${o.especie})?\n\n` +
      `Usalo cuando Quantex ya se quedó con el ${o.id} y la carga falló: el ` +
      `${o.id} queda quemado y la orden pasa al siguiente número libre. ` +
      "El resto de las órdenes NO se renumera. Queda auditado.")) return;
    setBusyId(o.id);
    try {
      const r = await fetch(`/api/back-office/senebis/ops/${o.id}/reasignar-id`, { method: "POST" });
      if (!r.ok) setErr(`no se pudo reasignar el ID (HTTP ${r.status})`);
      await cargar();
    } finally { setBusyId(null); }
  };

  // "Visto": baja el * y el amarillo de una orden ya revisada en Quantex.
  const marcarVisto = async (o: Orden) => {
    setBusyId(o.id);
    try {
      const r = await fetch(`/api/back-office/senebis/ops/${o.id}/visto`, { method: "POST" });
      if (r.ok) await cargar();
    } finally { setBusyId(null); }
  };

  // Borrar: SOLO desde el modal de edición (no hay ✕ en la tabla).
  const borrar = async (o: Orden) => {
    if (!window.confirm(`¿Eliminar la orden #${o.id} (${o.especie})? Queda auditado.`)) return;
    await fetch(`/api/back-office/senebis/ops/${o.id}`, { method: "DELETE" });
    setShowForm(false); setEditando(null);
    cargar();
  };

  const abrirEdicion = (o: Orden) => {
    if (!puedeEscribir) return;
    setEditando(o); setShowForm(true);
  };

  const ajustarProximoId = async () => {
    const actual = excel?.proximo_id;
    const v = window.prompt(
      "PRÓXIMO ID que va a asignar la app.\n" +
      "Mientras se use el Excel viejo: mirar el último ID de allá y poner ese + 1.",
      actual != null ? String(actual) : "");
    if (!v) return;
    const n = Number(v.trim());
    if (!Number.isInteger(n) || n <= 0) { setErr("el próximo ID tiene que ser un entero positivo"); return; }
    const r = await fetch("/api/back-office/senebis/proximo-id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siguiente: n }),
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = (await r.json()) as { detail?: string };
        if (typeof j?.detail === "string") msg = j.detail;
      } catch { /* body no era JSON */ }
      setErr(msg);
      return;
    }
    setErr(null);
    cargar();
  };

  const generarExcel = async () => {
    const r = await fetch(`/api/back-office/senebis/export${qsExcel}`);
    if (!r.ok) { setErr(`export falló (HTTP ${r.status})`); return; }
    const blob = await r.blob();
    const disp = r.headers.get("content-disposition") || "";
    const m = /filename="?([^";]+)"?/.exec(disp);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m?.[1] ?? `senebis_${hoyIso().replaceAll("-", "")}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const conectados = data?.conectados ?? [];
  const ordenes = data?.ordenes ?? [];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header: sub-tabs + filtros + presencia + acciones */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">SENEBIS</span>
        <div className="flex gap-1">
          <SubTab active={tab === "ordenes"} onClick={() => setTab("ordenes")}>Órdenes</SubTab>
          <SubTab active={tab === "quantex"} onClick={() => setTab("quantex")}>Excel Quantex</SubTab>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <FiltroGrupo label="Fecha">
            <Chip active={rango === "hoy"} onClick={() => setRango("hoy")}>HOY</Chip>
            <Chip active={rango === "todo"} onClick={() => setRango("todo")}>TODO</Chip>
          </FiltroGrupo>
          <FiltroGrupo label="Estado">
            <Chip active={fEstado === ""} onClick={() => setFEstado("")}>TODAS</Chip>
            <Chip active={fEstado === "pendiente"} onClick={() => setFEstado("pendiente")}>
              PENDIENTES{data ? ` (${data.pendientes})` : ""}
            </Chip>
            <Chip active={fEstado === "completada"} onClick={() => setFEstado("completada")}>COMPLETADAS</Chip>
          </FiltroGrupo>
          {/* MAE: las órdenes que se cargan en el MAE y NO van al Excel Quantex. */}
          <FiltroGrupo label="MAE">
            <Chip active={fMae === ""} onClick={() => setFMae("")}>CON</Chip>
            <Chip active={fMae === "sin"} onClick={() => setFMae("sin")}>SIN</Chip>
            <Chip active={fMae === "solo"} onClick={() => setFMae("solo")}>SOLO</Chip>
          </FiltroGrupo>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {err && <span className="text-[9px] text-[var(--t-neg)]">{err}</span>}
          {excel && (
            <button
              onClick={esAdmin ? ajustarProximoId : undefined}
              title={esAdmin
                ? "El próximo ID que asigna la app. Mientras se use el Excel viejo, alinearlo acá: último ID de allá + 1. Click para ajustar."
                : "El próximo ID que asigna la app (lo alinea un admin — la secuencia es global)."}
              className={`text-[9px] uppercase px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text)] ${
                esAdmin ? "hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]" : "cursor-default"
              }`}
            >
              Próximo ID: <span className="text-[var(--t-accent)]">{excel.proximo_id}</span>
            </button>
          )}
          <Presencia conectados={conectados} />
          <button
            onClick={() => setShowAgentes(true)}
            className="text-[10px] uppercase px-2 py-1 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
          >
            Agentes
          </button>
          <button
            onClick={generarExcel}
            className="text-[10px] uppercase px-2 py-1 border border-[var(--t-border-2)] text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
          >
            ⬇ Generar Excel
          </button>
          {puedeEscribir && (
            <button
              onClick={() => { setEditando(null); setShowForm(true); }}
              className="text-[10px] uppercase px-2 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black"
            >
              + Nueva orden
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "ordenes" ? (
          <TablaOrdenes
            ordenes={ordenes} busyId={busyId} puedeEscribir={puedeEscribir}
            onEstado={toggleEstado} onEditar={abrirEdicion} onVisto={marcarVisto}
          />
        ) : (
          <TablaQuantex
            excel={excel} ordenes={ordenes} busyId={busyId}
            onEditar={abrirEdicion} onReasignar={reasignarId}
          />
        )}
      </div>

      {showForm && (
        <OrdenForm
          opciones={opciones}
          editando={editando}
          onGuardado={() => { setShowForm(false); setEditando(null); cargar(); }}
          onCerrar={() => { setShowForm(false); setEditando(null); }}
          onBorrar={borrar}
        />
      )}
      {showAgentes && (
        <AgentesModal
          agentes={opciones?.agentes ?? []}
          onCambio={cargarOpciones}
          onCerrar={() => setShowAgentes(false)}
        />
      )}
    </div>
  );
}

// ── Tab ÓRDENES ────────────────────────────────────────────────────────────
function TablaOrdenes({ ordenes, busyId, puedeEscribir, onEstado, onEditar, onVisto }: {
  ordenes: Orden[];
  busyId: number | null;
  puedeEscribir: boolean;
  onEstado: (o: Orden) => void;
  onEditar: (o: Orden) => void;
  onVisto: (o: Orden) => void;
}) {
  const TH = "text-left text-[9px] uppercase text-[var(--t-text-muted)] px-2 py-1 whitespace-nowrap";
  const TD = "px-2 py-1 text-[11px] whitespace-nowrap";
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
        <tr className="border-b border-[var(--t-border)]">
          <th className={TH}>Estado</th>
          <th className={TH}>ID</th>
          <th className={TH}>Operación</th>
          <th className={TH}>Concert.</th>
          <th className={TH}>Liquid.</th>
          <th className={TH}>Plazo</th>
          <th className={TH}>Especie</th>
          <th className={`${TH} text-right`}>VN</th>
          <th className={`${TH} text-right`}>PX</th>
          <th className={`${TH} text-right`}>Monto</th>
          <th className={TH}>Contraparte</th>
          <th className={TH}>CP</th>
          <th className={TH}>Mercado</th>
          <th className={TH}>Obs</th>
          <th className={TH}>Cargó</th>
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {ordenes.map((o) => {
          const pend = o.estado === "pendiente";
          // El AMARILLO significa UNA sola cosa: se editó algo que ya estaba
          // completada → el back office la cargó en Quantex con datos viejos.
          // Pendiente NO se pinta (ya lo dice el botón de estado), así el
          // amarillo no pierde significado. MAE → azul sobrio (no va a Quantex).
          const tinte = o.editada_completada
            ? "bg-[rgba(224,168,0,0.22)]"
            : !pend
              ? "opacity-60"
              : o.es_mae
                ? "bg-[rgba(90,130,190,0.10)]"
                : "";
          return (
            <tr
              key={o.id}
              className={`border-b border-[var(--t-border-2)] hover:bg-[var(--t-surface)] ${tinte}`}
            >
              <td className={TD}>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEstado(o)}
                    disabled={busyId === o.id}
                    title={pend
                      ? "Marcar COMPLETADA (procesada en Quantex)"
                      : `Completada por ${o.completada_por ?? "—"} — click para volver a pendiente`}
                    className={`text-[9px] uppercase px-1.5 py-0.5 border ${
                      pend
                        ? "border-[var(--t-warn,#b8860b)] text-[var(--t-warn,#e0a800)]"
                        : "border-[var(--t-pos)] text-[var(--t-pos)]"
                    } disabled:opacity-40`}
                  >
                    {busyId === o.id ? "…" : pend ? "PENDIENTE" : "✓ COMPLETADA"}
                  </button>
                  {o.editada_completada && (
                    <button
                      onClick={() => onVisto(o)}
                      disabled={busyId === o.id}
                      title={"Se editó DESPUÉS de haberse completado — ya está cargada en " +
                        "Quantex con los datos viejos. Click para marcar VISTO y bajar el amarillo."}
                      className="text-[9px] uppercase px-1.5 py-0.5 border border-[#e0a800] bg-[#e0a800] text-black font-semibold disabled:opacity-40"
                    >
                      ⚠ EDITADA
                    </button>
                  )}
                </div>
              </td>
              <td className={`${TD} text-[var(--t-text-dim)]`}>{o.id}</td>
              <td className={TD}>{o.operacion}<Ed o={o} campos={["operacion"]} /></td>
              <td className={TD}>{fmtFecha(o.concertacion)}<Ed o={o} campos={["concertacion"]} /></td>
              <td className={TD}>{fmtFecha(o.liquidacion)}<Ed o={o} campos={["liquidacion"]} /></td>
              <td className={TD}>{o.plazo ?? "—"}<Ed o={o} campos={["plazo"]} /></td>
              <td className={`${TD} text-[var(--t-accent)]`}>{o.especie}<Ed o={o} campos={["especie"]} /></td>
              <td className={`${TD} text-right`}>{fmtNum(o.vn, 0)}<Ed o={o} campos={["vn"]} /></td>
              <td className={`${TD} text-right`}>{fmtNum(o.px, 3)}<Ed o={o} campos={["px"]} /></td>
              <td className={`${TD} text-right`}>{fmtNum(o.monto)}<Ed o={o} campos={["monto"]} /></td>
              <td className={TD}>
                {o.tipo_contraparte === "externo" ? (
                  <span title={`agente nº ${o.agente_numero ?? "?"}`}>
                    <span className="text-[9px] text-[var(--t-text-muted)] uppercase mr-1">AGT</span>
                    {o.agente ?? "—"}
                  </span>
                ) : (
                  <span title={o.cc_denominacion ?? undefined}>
                    {o.cc ?? "—"}
                    {o.cc_denominacion ? (
                      <span className="text-[var(--t-text-dim)]"> · {o.cc_denominacion}</span>
                    ) : null}
                  </span>
                )}
                <Ed o={o} campos={["tipo_contraparte", "agente", "cc", "contraparte", "nro_contraparte"]} />
              </td>
              <td className={TD}>{o.cp ?? "—"}<Ed o={o} campos={["cp"]} /></td>
              <td className={`${TD} text-[10px]`}>{o.mercado ?? "—"}<Ed o={o} campos={["mercado"]} /></td>
              <td className={`${TD} text-[10px] text-[var(--t-text-dim)]`}>
                {o.es_mae && (
                  <span
                    title="se carga por MAE — no sale en el Excel Quantex"
                    className="text-[9px] uppercase px-1 py-0.5 border border-[#5a82be] text-[#7fa6d9] mr-1"
                  >
                    MAE
                  </span>
                )}
                {[o.cargan_ellos, !o.es_mae ? o.tipo : null].filter(Boolean).join(" · ")
                  || (o.es_mae ? "" : "—")}
                <Ed o={o} campos={["cargan_ellos", "tipo", "es_mae"]} />
              </td>
              <td className={`${TD} text-[9px] text-[var(--t-text-dim)]`}>
                {o.creado_por?.split("@")[0] ?? "—"}
              </td>
              <td className={`${TD} text-right`}>
                {/* Eliminar vive DENTRO de editar (como en la mesa) — sin ✕ suelta. */}
                {puedeEscribir && (
                  <button onClick={() => onEditar(o)} className="text-[9px] uppercase text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">
                    editar
                  </button>
                )}
              </td>
            </tr>
          );
        })}
        {!ordenes.length && (
          <tr><td colSpan={16} className="px-3 py-4 text-[11px] text-[var(--t-text-dim)]">
            Sin órdenes en el filtro actual.
          </td></tr>
        )}
      </tbody>
    </table>
  );
}

// ── Tab EXCEL QUANTEX (espejo en vivo del archivo destino) ─────────────────
function TablaQuantex({ excel, ordenes, busyId, onEditar, onReasignar }: {
  excel: ExcelResp | null;
  ordenes: Orden[];
  busyId: number | null;
  onEditar: (o: Orden) => void;
  onReasignar: (o: Orden) => void;
}) {
  const porId = useMemo(() => new Map(ordenes.map((o) => [o.id, o])), [ordenes]);
  // Todo CENTRADO (header y valores): la mezcla de headers a la izquierda con
  // números a la derecha dejaba el valor lejos de su columna y confundía.
  const TH = "text-center text-[9px] uppercase px-3 py-1 whitespace-nowrap bg-[#1F4E79] text-white";
  const TD = "px-3 py-1 text-[11px] whitespace-nowrap text-center border-b border-[var(--t-border-2)]";
  if (!excel) return <div className="p-3 text-[11px] text-[var(--t-text-dim)]">Cargando…</div>;
  return (
    <div className="p-2">
      <div className="text-[9px] text-[var(--t-text-muted)] uppercase mb-1">
        Solo lo PENDIENTE (no MAE): al marcar completada la orden sale de acá —
        el archivo se sube varias veces por día y lo completado ya está cargado en Quantex.
        Click en una fila para editar. “Generar Excel” descarga exactamente esto.
      </div>
      <table className="border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            {excel.headers.map((h) => <th key={h} className={TH}>{h}</th>)}
            <th className="bg-[var(--t-panel)]" />
          </tr>
        </thead>
        <tbody>
          {excel.filas.map((f) => {
            const o = porId.get(f.id);
            const editada = o?.editada_completada ?? false;
            return (
              <tr
                key={f.id}
                onClick={() => o && onEditar(o)}
                title={editada
                  ? "editada después de haberse completado — revisar contra Quantex"
                  : "pendiente — click para editar"}
                className={`cursor-pointer hover:bg-[var(--t-surface)] ${
                  editada ? "bg-[rgba(224,168,0,0.22)]" : ""
                }`}
              >
                {f.valores.map((v, i) => (
                  <td key={i} className={TD}>
                    {v == null ? "" : typeof v === "number" && i >= 4 && i <= 5 ? fmtNum(v, 3) : String(v)}
                  </td>
                ))}
                <td className="px-2 py-1 border-b border-[var(--t-border-2)]">
                  {o && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onReasignar(o); }}
                      disabled={busyId === o.id}
                      title={`Quantex se quedó con el ${f.id} y la carga falló → darle el siguiente número libre`}
                      className="text-[9px] uppercase px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
                    >
                      {busyId === o.id ? "…" : "ID nuevo"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {!excel.filas.length && (
            <tr><td colSpan={excel.headers.length + 1} className="px-3 py-4 text-[11px] text-[var(--t-text-dim)]">
              Sin filas en el filtro actual — el Excel saldría vacío.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function SubTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] tracking-wide uppercase px-2 py-1 border ${
        active
          ? "border-[var(--t-accent)] text-[var(--t-accent)]"
          : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}

/** Filtros agrupados por criterio: etiqueta + botonera segmentada, para que se
 *  vea qué chips pertenecen al mismo filtro y que son clickeables. */
function FiltroGrupo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</span>
      <div className="flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
        {children}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] uppercase px-2 py-0.5 ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-bg)] font-semibold"
          : "text-[var(--t-text-dim)] hover:bg-[var(--t-surface)] hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}
