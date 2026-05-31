"use client";

import { useState } from "react";

// ─── Shape de GET /api/manager/aum ──────────────────────────────────────

interface PosicionAum {
  unidad: string | null;
  cuenta: string | null;
  tipo: string | null;
  moneda: string | null;
  cantidad: number;
  precio: number;
  valuacion: number;
  valuacion_esperada: number;   // cantidad × precio (sin /100 por tipo)
  desvio: number;
}

interface AumResp {
  id_cuenta: string;
  fecha: string | null;
  fechas_disponibles: string[];
  posiciones: PosicionAum[];
  total: number;
  n: number;
}

function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─── Panel ──────────────────────────────────────────────────────────────

export function AunesaAumPanel() {
  const [idCuenta, setIdCuenta] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [data, setData] = useState<AumResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consultar = (fechaArg?: string) => {
    const cta = idCuenta.trim();
    if (!cta) {
      setError("Ingresá un id de cuenta");
      return;
    }
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ id_cuenta: cta });
    // fechaArg explícito (cambio de selector) vs el de estado.
    const f = fechaArg !== undefined ? fechaArg : fecha;
    if (f) q.set("fecha", f);
    fetch(`/api/manager/aum?${q}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        return r.json();
      })
      .then((d: AumResp) => {
        setData(d);
        setFecha(d.fecha ?? "");
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[10px] tracking-widest text-[var(--t-text-dim)]">AUM · CUENTA</span>
        <input
          value={idCuenta}
          onChange={(e) => setIdCuenta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") consultar(); }}
          placeholder="ej: 805"
          className="bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono w-[120px] focus:border-[var(--t-accent)] focus:outline-none"
        />
        {data && data.fechas_disponibles.length > 0 && (
          <>
            <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">FECHA</span>
            <select
              value={fecha}
              onChange={(e) => { setFecha(e.target.value); consultar(e.target.value); }}
              className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
            >
              {data.fechas_disponibles.slice().reverse().map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </>
        )}
        <button
          onClick={() => consultar()}
          disabled={loading}
          className="text-[10px] tracking-widest px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "CARGANDO…" : "CONSULTAR"}
        </button>
        {data && (
          <div className="ml-auto flex items-center gap-4 text-[10px] font-mono">
            <span>
              <span className="text-[var(--t-text-dim)]">POSICIONES: </span>
              <span className="text-[var(--t-text)]">{data.n}</span>
            </span>
            <span>
              <span className="text-[var(--t-text-dim)]">TOTAL AuM: </span>
              <span className="text-[var(--t-text)]">{fmtNum(data.total)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <div className="px-3 py-2 text-[11px] text-[#f87171] font-mono">{error}</div>
        )}

        {!data && !loading && !error && (
          <div className="p-4 text-[11px] text-[var(--t-text-muted)] font-mono">
            Ingresá una cuenta y dale CONSULTAR. Vas a ver los docs crudos de
            Valuaciones.AuM — unidad, cantidad, precio, valuación — para validar
            que los precios estén bien. La columna CANT×PRECIO es la referencia:
            para acciones/FCI la valuación debería coincidir; para renta fija
            (Títulos, Letras, ONs) la valuación va dividida por 100.
          </div>
        )}

        {data && data.posiciones.length === 0 && (
          <div className="p-4 text-[11px] text-[var(--t-text-muted)] font-mono">
            Sin posiciones para esta cuenta / fecha.
          </div>
        )}

        {data && data.posiciones.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[var(--t-border-2)]">
              <tr className="text-[var(--t-text-muted)] tracking-widest">
                <th className="text-left px-2 py-1">UNIDAD</th>
                <th className="text-left px-2 py-1">TIPO</th>
                <th className="text-left px-2 py-1">MON</th>
                <th className="text-right px-2 py-1">CANTIDAD</th>
                <th className="text-right px-2 py-1">PRECIO</th>
                <th className="text-right px-2 py-1">VALUACIÓN</th>
                <th className="text-right px-2 py-1">CANT×PRECIO</th>
              </tr>
            </thead>
            <tbody>
              {data.posiciones.map((p, i) => (
                <tr key={i} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-2 py-1 text-[var(--t-text)] truncate max-w-[340px]" title={p.unidad ?? ""}>
                    {p.unidad ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{p.tipo ?? "—"}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{p.moneda ?? "—"}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmtNum(p.cantidad, 4)}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text)]">{fmtNum(p.precio, 4)}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">{fmtNum(p.valuacion)}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text-muted)]">{fmtNum(p.valuacion_esperada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
