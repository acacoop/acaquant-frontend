"use client";

import { useState } from "react";

// ─── Shape de GET /api/manager/aunesa/posicion ──────────────────────────
// Los items son los dicts CRUDOS de Aunesa (informacion == "Acumulado").
// Campos conocidos abajo; puede traer más — el índice los acepta.

interface PosicionAunesa {
  unidad?: string;
  tipoTitulo?: string;
  cantidad?: number | string;
  precio?: number | string;
  informacion?: string;
  cuenta?: string;
  [k: string]: unknown;
}

interface PosicionResp {
  id_cuenta: string;
  desde: string;
  n_total: number;
  n_acumulado: number;
  posiciones: PosicionAunesa[];
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmtNum(v: number | null, dec = 2): string {
  if (v == null) return "—";
  return v.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─── Panel ──────────────────────────────────────────────────────────────

export function AunesaPosicionPanel() {
  const [idCuenta, setIdCuenta] = useState<string>("");
  const [data, setData] = useState<PosicionResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consultar = () => {
    const cta = idCuenta.trim();
    if (!cta) {
      setError("Ingresá un id de cuenta");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/manager/aunesa/posicion?id_cuenta=${encodeURIComponent(cta)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        return r.json();
      })
      .then((d: PosicionResp) => setData(d))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] tracking-widest text-[#888]">POSICIÓN AUNESA · CUENTA</span>
        <input
          value={idCuenta}
          onChange={(e) => setIdCuenta(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") consultar(); }}
          placeholder="ej: 805"
          className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#d0d0d0] font-mono w-[120px] focus:border-[#ff9900] focus:outline-none"
        />
        <button
          onClick={consultar}
          disabled={loading}
          className="text-[10px] tracking-widest px-3 py-1 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900]/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "CONSULTANDO AUNESA…" : "CONSULTAR AUNESA"}
        </button>
        {data && (
          <div className="ml-auto flex items-center gap-4 text-[10px] font-mono">
            <span><span className="text-[#888]">DESDE: </span><span className="text-[#d0d0d0]">{data.desde}</span></span>
            <span><span className="text-[#888]">ACUMULADO: </span><span className="text-[#d0d0d0]">{data.n_acumulado}</span></span>
            <span><span className="text-[#888]">RAW: </span><span className="text-[#d0d0d0]">{data.n_total}</span></span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <div className="px-3 py-2 text-[11px] text-[#f87171] font-mono">{error}</div>
        )}

        {!data && !loading && !error && (
          <div className="p-4 text-[11px] text-[#666] font-mono">
            Ingresá una cuenta y dale CONSULTAR. Pega EN VIVO a Aunesa
            (posicionValuada) y muestra la posición cruda — sin pasar por la
            base. Útil para comparar precio/cantidad de Aunesa contra lo que
            terminó en AUM. Ojo: la cantidad viene con el signo nativo de
            Aunesa (el job lo invierte al persistir). Puede tardar unos
            segundos.
          </div>
        )}

        {data && data.posiciones.length === 0 && (
          <div className="p-4 text-[11px] text-[#666] font-mono">
            Aunesa no devolvió posiciones &quot;Acumulado&quot; para esta cuenta.
          </div>
        )}

        {data && data.posiciones.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#0a0a0a] border-b border-[#2a2a2a]">
              <tr className="text-[#666] tracking-widest">
                <th className="text-left px-2 py-1">UNIDAD</th>
                <th className="text-left px-2 py-1">TIPO TÍTULO</th>
                <th className="text-right px-2 py-1">CANTIDAD</th>
                <th className="text-right px-2 py-1">PRECIO</th>
                <th className="text-right px-2 py-1">CANT×PRECIO</th>
              </tr>
            </thead>
            <tbody>
              {data.posiciones.map((p, i) => {
                const cant = toNum(p.cantidad);
                const precio = toNum(p.precio);
                const prod = cant != null && precio != null ? cant * precio : null;
                return (
                  <tr key={i} className="border-b border-[#141414] hover:bg-[#0e0e0e]">
                    <td className="px-2 py-1 text-[#d0d0d0] truncate max-w-[340px]" title={p.unidad ?? ""}>
                      {p.unidad ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-[#888]">{p.tipoTitulo ?? "—"}</td>
                    <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtNum(cant, 4)}</td>
                    <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtNum(precio, 4)}</td>
                    <td className="px-2 py-1 text-right text-[#666]">{fmtNum(prod)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
