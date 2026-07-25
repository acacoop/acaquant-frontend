"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortfolioAlquilerView } from "./portfolio-alquiler-view";

/**
 * Back Office → Títulos en Alquiler. Cuentas propias 100/255/256. Dos tabs:
 *   MARCAS      — lista TODOS los (título, cuenta) en posición; por cada uno el
 *                 user marca SI/NO, nominales y período. Netea Tenencia Valorizada.
 *   PORTFOLIO ALQUILER — tabla tipo Tenencia Valorizada pero SOLO con títulos
 *                 elegidos a mano (fila "+" con buscador). Pedido mesa 2026-07-14.
 * Persiste vía POST /api/back-office/tenencia-hd/alquiler (marcas) y
 * /tenencia-hd/portfolio-alquiler (lista del portfolio).
 */

type PosRow = {
  id_cuenta: string;
  unidad: string;
  cartera: string | null;
  cantidad: number;
  precio: number | null;
  valuacion: number;
  ultimo_dia: string | null;
  en_alquiler: boolean;
  alq_cant: number | null;
  alq_valor: number | null;
  desde: string | null;
  hasta: string | null;
};
type Resp = { ultima_fecha: string | null; desde: string; cuentas: string[]; posiciones: PosRow[] };

// Arranque del proceso legal — default del filtro DESDE.
const DESDE_DEFAULT = "2026-06-01";

const HDR = "px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap";
const fmtNum = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtFull = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v).toLocaleString("es-AR");

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export function TitulosEnAlquilerView() {
  const [subTab, setSubTab] = useState<"portfolio" | "marcas">("portfolio");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex items-center gap-1">
        {([["portfolio", "Portfolio Alquiler"], ["marcas", "Marcas por cuenta"]] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setSubTab(k)}
            className={`text-[10px] tracking-wide uppercase px-3 py-1.5 border-b-2 ${
              subTab === k
                ? "text-[var(--t-accent)] border-[var(--t-accent)]"
                : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {subTab === "portfolio" ? <PortfolioAlquilerView /> : <MarcasAlquilerView />}
      </div>
    </div>
  );
}

function MarcasAlquilerView() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [soloAlq, setSoloAlq] = useState(false);
  // Rango: DESDE (default arranque del proceso legal) → HOY (fijo). Trae todos los
  // títulos tenidos en ese rango, aunque hoy ya no estén.
  const [desde, setDesde] = useState(DESDE_DEFAULT);

  const reload = useCallback(async () => {
    const d = await getJson<Resp>(
      `/api/back-office/tenencia-hd/en-alquiler?desde=${encodeURIComponent(desde)}`,
    );
    setData(d);
    setLoading(false);
  }, [desde]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pos = data?.posiciones ?? [];
  const rows = pos.filter(
    (r) =>
      (!q || r.unidad.toLowerCase().includes(q.toLowerCase())) &&
      (!soloAlq || r.en_alquiler),
  );
  const nAlq = pos.filter((r) => r.en_alquiler).length;
  const totalAlqValor = pos.reduce((a, r) => a + (r.en_alquiler ? r.alq_valor ?? 0 : 0), 0);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      <div className="shrink-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className={HDR}>
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
            Títulos en Alquiler
          </span>
          <label className="flex items-center gap-1 text-[9px] text-[var(--t-text-muted)]">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value || DESDE_DEFAULT)}
              title="Trae todos los títulos tenidos desde esta fecha hasta hoy (aunque hoy ya no estén)"
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] text-[var(--t-text)] [color-scheme:dark] outline-none focus:border-[var(--t-accent)]"
            />
            <span>hasta hoy · cuentas 100 / 255 / 256</span>
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título…"
            className="ml-auto bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          />
          <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-dim)] cursor-pointer">
            <input type="checkbox" checked={soloAlq} onChange={(e) => setSoloAlq(e.target.checked)} />
            Solo en alquiler
          </label>
        </div>
        <div className="px-3 py-1 text-[9px] font-mono text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
          {nAlq} título(s) en alquiler · Valor en alquiler{" "}
          <span className="font-semibold text-amber-400">{fmtFull(totalAlqValor)}</span>{" "}
          (moneda de cada cartera). Se descuenta de Tenencia Valorizada desde la fecha marcada.
        </div>
      </div>

      <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-auto">
        {loading ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">
            {pos.length === 0 ? "Sin posiciones. ¿Corrió el backfill diario?" : "Sin resultados para el filtro."}
          </p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">Título</th>
                <th className="text-left !px-2">Cuenta</th>
                <th className="text-left !px-2">Cartera</th>
                <th className="text-right !px-2">Nominal</th>
                <th className="text-center !px-2">En alq.</th>
                <th className="text-right !px-2 text-amber-400">Cantidad</th>
                <th className="text-center !px-2 text-amber-400">Desde</th>
                <th className="text-center !px-2 text-amber-400">Hasta</th>
                <th className="text-right !px-2 text-amber-400">Valor alq.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <AlquilerRow key={`${r.id_cuenta}-${r.unidad}`} row={r} onSaved={reload} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AlquilerRow({ row, onSaved }: { row: PosRow; onSaved: () => void }) {
  const [en, setEn] = useState(row.en_alquiler);
  const [cant, setCant] = useState(row.alq_cant != null ? String(row.alq_cant) : "");
  const [desde, setDesde] = useState(row.desde ?? "");
  const [hasta, setHasta] = useState(row.hasta ?? "");
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<null | boolean>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopta el estado remoto tras un reload, sin pisar lo que estoy tipeando.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEn(row.en_alquiler);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCant(row.alq_cant != null ? String(row.alq_cant) : "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesde(row.desde ?? "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasta(row.hasta ?? "");
  }, [row.en_alquiler, row.alq_cant, row.desde, row.hasta]);

  const save = (nextEn: boolean, nextCant: string, nextDesde: string, nextHasta: string, reloadAfter: boolean) => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setSaving(true);
      setOk(null);
      const cantNum = nextCant.trim() === "" ? null : Number(nextCant.replace(",", "."));
      try {
        const r = await fetch("/api/back-office/tenencia-hd/alquiler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_cuenta: row.id_cuenta,
            unidad: row.unidad,
            en_alquiler: nextEn,
            cantidad: cantNum,
            desde: nextDesde || null,
            hasta: nextHasta || null,
          }),
        });
        setOk(r.ok);
        // Recargo solo al togglear (cambia qué filas cuentan); tipear no recarga.
        if (r.ok && reloadAfter) onSaved();
      } catch {
        setOk(false);
      } finally {
        setSaving(false);
        setTimeout(() => setOk(null), 1500);
      }
    }, reloadAfter ? 150 : 700);
  };

  const onToggle = (v: boolean) => {
    setEn(v);
    save(v, cant, desde, hasta, true);
  };
  const onCant = (v: string) => {
    setCant(v);
    save(en, v, desde, hasta, false);
  };
  const onDesde = (v: string) => {
    setDesde(v);
    save(en, cant, v, hasta, false);
  };
  const onHasta = (v: string) => {
    setHasta(v);
    save(en, cant, desde, v, false);
  };

  return (
    <tr className={"hover:bg-[var(--t-border)] " + (en ? "bg-amber-400/5" : "")}>
      <td className="!px-2">{row.unidad}</td>
      <td className="!px-2 text-[var(--t-text-dim)]">{row.id_cuenta}</td>
      <td className="!px-2 text-[var(--t-text-muted)]">{row.cartera ?? "—"}</td>
      <td className="!px-2 text-right tabular-nums text-[var(--t-text-dim)]">{fmtNum(row.cantidad)}</td>
      <td className="!px-2 text-center">
        <input type="checkbox" checked={en} onChange={(e) => onToggle(e.target.checked)} />
      </td>
      <td className="!px-1 text-right">
        <input
          value={cant}
          onChange={(e) => onCant(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          disabled={!en}
          className={
            "w-24 bg-[var(--t-surface)] border px-1 py-0.5 text-right font-mono text-[10px] tabular-nums outline-none focus:border-[var(--t-accent)] disabled:opacity-40 " +
            (saving ? "border-amber-400" : "border-[var(--t-border-2)]")
          }
        />
      </td>
      <td className="!px-1 text-center">
        <input
          type="date"
          value={desde}
          onChange={(e) => onDesde(e.target.value)}
          disabled={!en}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] text-[var(--t-text)] [color-scheme:dark] outline-none focus:border-[var(--t-accent)] disabled:opacity-40"
        />
      </td>
      <td className="!px-1 text-center">
        <input
          type="date"
          value={hasta}
          onChange={(e) => onHasta(e.target.value)}
          disabled={!en}
          title="Vacío = sigue en alquiler"
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] text-[var(--t-text)] [color-scheme:dark] outline-none focus:border-[var(--t-accent)] disabled:opacity-40"
        />
      </td>
      <td className="!px-2 text-right tabular-nums text-amber-400">
        {en && row.alq_valor != null ? fmtFull(row.alq_valor) : "—"}
        {ok === true && <span className="ml-1 text-[var(--t-pos)]">✓</span>}
        {ok === false && <span className="ml-1 text-[var(--t-neg)]">✗</span>}
      </td>
    </tr>
  );
}
