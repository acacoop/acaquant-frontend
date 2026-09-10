"use client";

import { useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { usePersistedState } from "@/lib/use-persisted-state";
import { conTecho, fetchJson } from "@/lib/fetch-json";
import { fmtFechaCorta } from "@/lib/fmt";
import { FilterBtn, Panel } from "@/components/ui";
import { MultiSelect } from "@/components/ui/multi-select";
import { FciTable, SIN_CATEGORIA, type Ventanas } from "@/components/fci-table";
import { FciFichaPanel } from "@/components/fci-ficha";
import type { FciFicha, FciFila, FciTabla } from "@/lib/types-fci";

/**
 * Vista FONDOS COMUNES DE INVERSIÓN — toda la pantalla de /fci (docs/FCI.md
 * del backend). Layout 50/50, el mismo de /renta-variable:
 *   - IZQUIERDA: panel FONDOS = los fondos de las gerentes con las que opera la
 *     mesa (y SOLO esas: el filtro es del backend), con VCP y rendimientos,
 *     agrupados por ESTANTE y rankeados adentro por la columna elegida.
 *   - DERECHA: panel FICHA = el fondo elegido: datos, los ocho rendimientos, la
 *     curva del VCP y de qué fuente salió cada tramo.
 *
 * Nada se calcula acá: los rendimientos vienen del backend con UNA convención
 * de anclas. El front elige, ordena y pinta.
 */
const POLL_MS = 300_000;        // el VCP es diario; 5 min alcanza para una pestaña abierta
const TECHO_FICHA_MS = 15_000;

export function FciView({ initial }: { initial: FciTabla }) {
  const { data: tabla, lastAt, error } = usePoll<FciTabla>("/api/fci/tabla", initial, POLL_MS);

  const [categoria, setCategoria] = usePersistedState<string | null>("fci.categoria", null);
  const [moneda, setMoneda] = usePersistedState<"ARS" | "USD" | null>("fci.moneda", null);
  const [gerentes, setGerentes] = usePersistedState<string[]>("fci.gerentes", []);
  const [ventanas, setVentanas] = usePersistedState<Ventanas>("fci.ventanas", "calendario");
  const [soloConVcp, setSoloConVcp] = usePersistedState<boolean>("fci.soloConVcp", true);
  const [query, setQuery] = useState("");
  const [fciId, setFciId] = useState<number | null>(null);

  const filas = useMemo<FciFila[]>(() => {
    const q = query.trim().toLowerCase();
    return tabla.fondos.filter((r) => {
      if (categoria === SIN_CATEGORIA ? r.categoria != null : (categoria && r.categoria !== categoria)) return false;
      if (moneda && r.moneda !== moneda) return false;
      if (gerentes.length && !gerentes.includes(r.gerente ?? "")) return false;
      if (soloConVcp && r.vcp == null) return false;
      if (q && !(`${r.nombre} ${r.gerente ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tabla.fondos, categoria, moneda, gerentes, soloConVcp, query]);

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

  const opcionesGerente = useMemo(
    () => tabla.gerentes.filter((g) => g.nombre).map((g) => ({ value: g.nombre!, label: g.nombre!, n: g.n })),
    [tabla.gerentes],
  );
  const sinVcp = tabla.fondos.filter((r) => r.vcp == null).length;

  const filtros = (
    <>
      <FilterBtn active={categoria === null} onClick={() => setCategoria(null)}>TODOS</FilterBtn>
      {tabla.categorias.map((c) => {
        const key = c.nombre ?? SIN_CATEGORIA;
        return (
          <FilterBtn key={key} active={categoria === key} onClick={() => setCategoria(key)} title={`${c.n} fondos`}>
            {key}
          </FilterBtn>
        );
      })}
      <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
      {(["ARS", "USD"] as const).map((m) => (
        <FilterBtn key={m} active={moneda === m} onClick={() => setMoneda(moneda === m ? null : m)}>{m}</FilterBtn>
      ))}
      <MultiSelect label="GERENTE" options={opcionesGerente} selected={gerentes} onChange={setGerentes} />
      <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
      <FilterBtn active={ventanas === "calendario"} onClick={() => setVentanas("calendario")}
        title="1D · WTD · MTD · YTD (anclas de calendario)">CALENDARIO</FilterBtn>
      <FilterBtn active={ventanas === "corridas"} onClick={() => setVentanas("corridas")}
        title="7D · 30D · 90D · 365D (días corridos)">CORRIDAS</FilterBtn>
      <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
      <FilterBtn active={soloConVcp} onClick={() => setSoloConVcp(!soloConVcp)}
        title={`Esconder los fondos que todavía no tienen VCP cargado (${sinVcp})`}>
        CON VCP{sinVcp ? ` (−${sinVcp})` : ""}
      </FilterBtn>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar fondo…"
        className="w-[130px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
      />
    </>
  );

  const sub = tabla.fecha_max ? `VCP al ${fmtFechaCorta(tabla.fecha_max)}` : "sin VCP cargado";
  const subTitle = lastAt > 0 ? "Fecha del último VCP (tabla al día)" : "Fecha del último VCP";

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <Panel
          title="FONDOS"
          count={filas.length}
          actions={<div className="flex flex-wrap items-center gap-1">{filtros}</div>}
          rightActions={
            <span className={`text-[10px] uppercase tracking-wide ${error ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]"}`}
              title={error ?? subTitle}>
              {error ? "SIN ACTUALIZAR" : sub}
            </span>
          }
          fill
        >
          {tabla.n === 0 ? (
            <p className="text-[var(--t-text-muted)] text-xs py-6 text-center leading-5">
              Todavía no hay fondos en el universo.<br />
              Backend: <code>jobs.fci_universo</code> y después <code>jobs.fci_vcp</code>
            </p>
          ) : (
            <FciTable filas={filas} ventanas={ventanas} agrupar={categoria === null}
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
