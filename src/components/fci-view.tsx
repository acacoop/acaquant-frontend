"use client";

import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { usePersistedState } from "@/lib/use-persisted-state";
import { conTecho, fetchJson } from "@/lib/fetch-json";
import { fmtFechaCorta } from "@/lib/fmt";
import { FilterBtn, Panel } from "@/components/ui";
import { MultiSelect } from "@/components/ui/multi-select";
import { FciTable, SIN_CLASE } from "@/components/fci-table";
import { FciFichaPanel } from "@/components/fci-ficha";
import type { FciFicha, FciFila, FciTabla } from "@/lib/types-fci";

/**
 * Vista FONDOS COMUNES DE INVERSIÓN — toda la pantalla de /fci (docs/FCI.md
 * del backend).
 *
 *   - ARRIBA, a lo ancho: UNA barra de filtros para toda la vista (la clase de
 *     activo de Manager → ASSETS como pills, ARS/USD, gerente, buscador) y la
 *     fecha del último VCP a la derecha.
 *   - ABAJO, 50/50: FONDOS (la tabla, agrupada por clase de activo y rankeada
 *     adentro) y FICHA (el fondo elegido).
 *
 * El vocabulario es el de la mesa: la CLASE es `assets.clase_activo` (MM ARS,
 * ARS T1, MM USD, HD T1, RENTA VARIABLE), no una clasificación propia. Nada se
 * calcula acá: los rendimientos vienen del backend con UNA convención de anclas.
 * Los fondos sin VCP todavía no se listan (se cuentan al lado del título).
 */
const POLL_MS = 300_000;        // el VCP es diario; 5 min alcanza para una pestaña abierta
const TECHO_FICHA_MS = 15_000;

export function FciView({ initial }: { initial: FciTabla }) {
  const { data: tabla, error } = usePoll<FciTabla>("/api/fci/tabla", initial, POLL_MS);

  const [clase, setClase] = usePersistedState<string | null>("fci.clase", null);
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD" | null>("fci.moneda", null);
  const [gerentes, setGerentes] = usePersistedState<string[]>("fci.gerentes", []);
  const [query, setQuery] = useState("");
  const [fciId, setFciId] = useState<number | null>(null);

  const conVcp = useMemo(() => tabla.fondos.filter((r) => r.vcp != null), [tabla.fondos]);
  const sinVcp = tabla.fondos.length - conVcp.length;

  const filas = useMemo<FciFila[]>(() => {
    const q = query.trim().toLowerCase();
    return conVcp.filter((r) => {
      if (clase === SIN_CLASE ? r.categoria != null : (clase && r.categoria !== clase)) return false;
      if (moneda && r.moneda !== moneda) return false;
      if (gerentes.length && !gerentes.includes(r.gerente ?? "")) return false;
      if (q && !(`${r.nombre} ${r.gerente ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [conVcp, clase, moneda, gerentes, query]);

  const activa = useMemo<FciFila | null>(() => {
    if (fciId != null) {
      const f = filas.find((r) => r.fci_id === fciId);
      if (f) return f;
    }
    return filas[0] ?? null;
  }, [filas, fciId]);

  // La ficha se pide al elegir. El estado se guarda CON el id del fondo al que
  // pertenece y se deriva al render: el efecto solo dispara el fetch (setState
  // únicamente en los callbacks) y una respuesta vieja nunca se pinta sobre el
  // fondo nuevo. Con techo: es una lectura que se repite.
  const [ficha, setFicha] = useState<FciFicha | null>(null);
  const [fichaFallo, setFichaFallo] = useState<{ id: number; msg: string } | null>(null);
  const activaId = activa?.fci_id ?? null;
  useEffect(() => {
    if (activaId == null) return;
    let vivo = true;
    fetchJson<FciFicha>(`/api/fci/fondo/${activaId}`, { signal: conTecho(TECHO_FICHA_MS) })
      .then((f) => { if (vivo) setFicha(f); })
      .catch((e) => { if (vivo) setFichaFallo({ id: activaId, msg: e instanceof Error ? e.message : String(e) }); });
    return () => { vivo = false; };
  }, [activaId]);
  const fichaActiva = ficha && ficha.fci_id === activaId ? ficha : null;
  const fichaError = fichaFallo && fichaFallo.id === activaId ? fichaFallo.msg : null;
  const fichaCargando = activaId != null && !fichaActiva && !fichaError;

  // Los catálogos de la barra salen de lo que SE MUESTRA (fondos con VCP), no
  // del universo entero: una pill que no filtra nada confunde.
  const clases = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of conVcp) n.set(r.categoria ?? SIN_CLASE, (n.get(r.categoria ?? SIN_CLASE) ?? 0) + 1);
    const orden = tabla.categorias.map((c) => c.nombre ?? SIN_CLASE);
    return orden.filter((k) => n.has(k)).map((k) => ({ nombre: k, n: n.get(k)! }));
  }, [conVcp, tabla.categorias]);
  const opcionesGerente = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of conVcp) if (r.gerente) n.set(r.gerente, (n.get(r.gerente) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ value: g, label: g, n: c }));
  }, [conVcp]);

  const sub = tabla.fecha_max ? `VCP AL ${fmtFechaCorta(tabla.fecha_max)}` : "SIN VCP CARGADO";

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      {/* ── LA barra de filtros, una sola, a lo ancho ── */}
      <div className="flex items-center gap-1 shrink-0 text-xs flex-wrap">
        <FilterBtn active={clase === null} onClick={() => setClase(null)}>TODOS</FilterBtn>
        {clases.map((c) => (
          <FilterBtn key={c.nombre} active={clase === c.nombre} onClick={() => setClase(c.nombre)}
            title={`${c.n} fondos · clase de activo de Manager → ASSETS`}>
            {c.nombre}
          </FilterBtn>
        ))}
        <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
        {(["ARS", "USD"] as const).map((m) => (
          <FilterBtn key={m} active={moneda === m} onClick={() => setMoneda(moneda === m ? null : m)}>{m}</FilterBtn>
        ))}
        <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
        <MultiSelect label="GERENTE" options={opcionesGerente} selected={gerentes} onChange={setGerentes} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar fondo…"
          className="w-[150px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
        />
        <span className={`ml-auto text-[10px] tracking-wide ${error ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]"}`}
          title={error ?? "Fecha del último valor de cuotaparte guardado"}>
          {error ? "SIN ACTUALIZAR" : sub}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <Panel
          title="FONDOS"
          count={filas.length}
          sub={sinVcp ? `${sinVcp} sin VCP todavía` : undefined}
          fill
        >
          {tabla.n === 0 ? (
            <p className="text-[var(--t-text-muted)] text-xs py-6 text-center leading-5">
              Todavía no hay fondos en el universo.<br />
              Backend: <code>jobs.fci_universo</code> y después <code>jobs.fci_vcp</code>
            </p>
          ) : (
            <FciTable filas={filas} agrupar={clase === null}
              seleccionada={activa?.fci_id ?? null} onSelect={setFciId} />
          )}
        </Panel>

        <Panel title={activa ? `FICHA · ${activa.nombre}` : "FICHA"} fill>
          <FciFichaPanel fila={activa} ficha={fichaActiva} cargando={fichaCargando} error={fichaError} />
        </Panel>
      </div>
    </div>
  );
}
