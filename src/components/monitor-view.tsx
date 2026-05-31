"use client";

import { useState } from "react";

/**
 * Vista MONITOR — Módulo 2 de la Mesa de Estrategia (Renta Variable).
 *
 * Cargás un book (lista de posiciones) y devuelve exposición, concentración,
 * riesgo agregado y contribución de riesgo. Consume GET /api/scanner/book-analysis.
 * Spec: docs/wip_mesa_estrategia_rv.md (repo TradingAV).
 */

interface Grupo {
  grupo: string;
  neto: number;
  bruto: number;
  pct_bruto: number;
}

interface BookAnalysis {
  book: {
    posiciones: { ticker: string; notional: number; direccion: string; sector: string; region: string }[];
    gross: number;
    net: number;
    n: number;
  };
  exposicion: { por_sector: Grupo[]; por_region: Grupo[] };
  concentracion: { pct_top5?: number; hhi?: number };
  riesgo: {
    vol_anual_book_pct?: number | null;
    var_1d_95?: number;
    exposicion_mercado_usd?: { spy: number; qqq: number };
    n_obs?: number;
  };
  contribucion_riesgo: { ticker: string; notional: number; contrib_pct: number }[];
  excluidos: string[];
  nota: string;
}

interface Pos {
  ticker: string;
  notional: number;
}

const fmtUsd = (n: number | null | undefined): string =>
  n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-1.5">
      <div className="text-[8px] text-[var(--t-text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-[13px] font-mono text-[var(--t-text)]">{value}</div>
      {hint && <div className="text-[8px] text-[var(--t-text-muted)]">{hint}</div>}
    </div>
  );
}

function ExposicionTabla({ titulo, filas }: { titulo: string; filas: Grupo[] }) {
  return (
    <div>
      <div className="text-[9px] text-[#ff9900] tracking-widest mb-1">{titulo}</div>
      <table className="w-full font-mono">
        <thead className="text-[var(--t-text-muted)] text-[8px]">
          <tr>
            <th className="text-left px-1">GRUPO</th>
            <th className="text-right px-1">NETO</th>
            <th className="text-right px-1">BRUTO</th>
            <th className="text-right px-1">% BRUTO</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.grupo} className="border-b border-[var(--t-border)]">
              <td className="text-[var(--t-text)] px-1">{f.grupo}</td>
              <td className="text-right px-1 text-[var(--t-text-dim)]">{fmtUsd(f.neto)}</td>
              <td className="text-right px-1 text-[var(--t-text)]">{fmtUsd(f.bruto)}</td>
              <td className="text-right px-1 text-[#ff9900]">{f.pct_bruto}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonitorView() {
  const [posiciones, setPosiciones] = useState<Pos[]>([]);
  const [tk, setTk] = useState("");
  const [monto, setMonto] = useState("1000000");
  const [direccion, setDireccion] = useState<"long" | "short">("long");
  const [data, setData] = useState<BookAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agregar = () => {
    const t = tk.trim().toUpperCase();
    const m = Number(monto) || 0;
    if (!t || !m) return;
    const signed = direccion === "long" ? m : -m;
    setPosiciones((p) => [...p.filter((x) => x.ticker !== t), { ticker: t, notional: signed }]);
    setTk("");
  };
  const quitar = (t: string) =>
    setPosiciones((p) => p.filter((x) => x.ticker !== t));

  const analizar = () => {
    if (!posiciones.length) return;
    setLoading(true);
    setError(null);
    const csv = posiciones.map((p) => `${p.ticker}:${p.notional}`).join(",");
    fetch(`/api/scanner/book-analysis?posiciones=${encodeURIComponent(csv)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setData(j as BookAnalysis))
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-3 text-[10px]">
      {/* Editor de posiciones */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <div className="text-[8px] text-[var(--t-text-muted)] uppercase mb-0.5">Ticker</div>
          <input
            value={tk}
            onChange={(e) => setTk(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            placeholder="NVDA"
            className="w-24 bg-black border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] font-mono focus:border-[#ff9900] focus:outline-none"
          />
        </div>
        <div>
          <div className="text-[8px] text-[var(--t-text-muted)] uppercase mb-0.5">Monto USD</div>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            className="w-28 bg-black border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] font-mono focus:border-[#ff9900] focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(["long", "short"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDireccion(d)}
              className={`px-2 py-1 text-[10px] font-semibold border transition-colors ${
                direccion === d
                  ? d === "long"
                    ? "bg-[#00cc66] text-black border-[#00cc66]"
                    : "bg-[#ff3333] text-black border-[#ff3333]"
                  : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)]"
              }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={agregar}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors"
        >
          + Agregar
        </button>
        <button
          onClick={analizar}
          disabled={loading || !posiciones.length}
          className="px-3 py-1 text-[10px] font-semibold border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black transition-colors disabled:opacity-40"
        >
          {loading ? "Analizando…" : "▶ Analizar book"}
        </button>
      </div>

      {/* Posiciones cargadas */}
      {posiciones.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {posiciones.map((p) => (
            <span
              key={p.ticker}
              className="inline-flex items-center gap-1 border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-0.5 font-mono"
            >
              <span className={p.notional >= 0 ? "text-[#3fbf6f]" : "text-[#ff7f7f]"}>
                {p.notional >= 0 ? "L" : "S"}
              </span>
              <span className="text-[#ff9900]">{p.ticker}</span>
              <span className="text-[var(--t-text-dim)]">{fmtUsd(Math.abs(p.notional))}</span>
              <button
                onClick={() => quitar(p.ticker)}
                className="text-[var(--t-text-muted)] hover:text-[#ff3333]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <div className="text-[#ff7f7f] italic">{error}</div>}
      {!data && !error && (
        <p className="text-[var(--t-text-muted)] py-4">Agregá posiciones y analizá el book.</p>
      )}

      {data && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-1">
            <Metric label="Posiciones" value={String(data.book.n)} />
            <Metric label="Bruto" value={fmtUsd(data.book.gross)} />
            <Metric label="Neto" value={fmtUsd(data.book.net)} />
            <Metric
              label="Vol book"
              value={data.riesgo.vol_anual_book_pct != null ? `${data.riesgo.vol_anual_book_pct}%` : "—"}
            />
            <Metric label="VaR 1d 95%" value={fmtUsd(data.riesgo.var_1d_95)} />
            <Metric
              label="Expo. mercado"
              value={fmtUsd(data.riesgo.exposicion_mercado_usd?.qqq)}
              hint="vs QQQ"
            />
          </div>

          {/* Exposición */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ExposicionTabla titulo="EXPOSICIÓN POR SECTOR" filas={data.exposicion.por_sector} />
            <ExposicionTabla titulo="EXPOSICIÓN POR REGIÓN" filas={data.exposicion.por_region} />
          </div>

          {/* Concentración */}
          <div className="text-[10px] text-[var(--t-text-dim)] font-mono">
            Concentración — top 5: <span className="text-[var(--t-text)]">{data.concentracion.pct_top5 ?? "—"}%</span>
            {"  ·  "}HHI: <span className="text-[var(--t-text)]">{data.concentracion.hhi ?? "—"}</span>
            <span className="text-[var(--t-text-muted)]"> (más alto = más concentrado)</span>
          </div>

          {/* Contribución de riesgo */}
          {data.contribucion_riesgo.length > 0 && (
            <div>
              <div className="text-[9px] text-[#ff9900] tracking-widest mb-1">
                CONTRIBUCIÓN DE RIESGO — quién aporta el riesgo (no la plata)
              </div>
              <table className="w-full font-mono">
                <thead className="text-[var(--t-text-muted)] text-[8px]">
                  <tr>
                    <th className="text-left px-1">TICKER</th>
                    <th className="text-right px-1">NOTIONAL</th>
                    <th className="text-right px-1">% DEL RIESGO</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contribucion_riesgo.map((c) => (
                    <tr key={c.ticker} className="border-b border-[var(--t-border)]">
                      <td className="text-[#ff9900] px-1">{c.ticker}</td>
                      <td className="text-right px-1 text-[var(--t-text-dim)]">{fmtUsd(c.notional)}</td>
                      <td className={`text-right px-1 ${c.contrib_pct < 0 ? "text-[#3fbf6f]" : "text-[var(--t-text)]"}`}>
                        {c.contrib_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[8px] text-[var(--t-text-muted)] mt-1">
                Verde = la posición <span className="text-[#3fbf6f]">resta</span> riesgo (hedge natural del book).
              </div>
            </div>
          )}

          {data.excluidos.length > 0 && (
            <div className="text-[8px] text-[#ff7f7f]">
              Sin datos de precio: {data.excluidos.join(", ")} — quedan fuera del riesgo.
            </div>
          )}
          <div className="text-[8px] text-[var(--t-text-muted)] italic">{data.nota}</div>
        </>
      )}
    </div>
  );
}
