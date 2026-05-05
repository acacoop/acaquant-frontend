"use client";

import { useEffect, useMemo, useState } from "react";

interface Cuenta {
  id_cuenta: string;
  cuenta: string;
}

interface ResumeData {
  cuentas: Cuenta[];
  mes_actual: Record<string, number>;
  mes_anterior: Record<string, number>;
}

interface Posicion {
  unidad: string;
  ticker: string;
  emisor: string;
  clase_activo: string;
  cartera: string;
  calificacion: string;
  vencimiento: string | null;
  cantidad: number;
  precio: number;
  valuacion: number;
  pct: number;
}

interface DetalleData {
  posiciones: Posicion[];
  total: number;
}

interface Props {
  mep: number;
  a3500: number;
}

const CARTERA_COLORS: Record<string, string> = {
  "CARTERA ARS": "#4a9eff",
  "CARTERA DL":  "#00cc66",
  "CARTERA HD":  "#ff9900",
  "CARTERA FCI": "#bb66ff",
};

function colorFor(cartera: string): string {
  return CARTERA_COLORS[cartera] ?? "#808080";
}

function fmtARS(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFull(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtVto(v: string | null): string {
  if (!v) return "-";
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${String(y).slice(-2)}`;
}

export function PortfolioView({ mep, a3500 }: Props) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [resumen, setResumen] = useState<ResumeData | null>(null);
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [carteraFiltro, setCarteraFiltro] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<"ticker" | "valuacion">("valuacion");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Cargar lista de cuentas
  useEffect(() => {
    fetch("/api/portfolio/resumen")
      .then((r) => r.json())
      .then((d: ResumeData) => {
        if (d.cuentas?.length) {
          setCuentas(d.cuentas);
          setSelectedId(d.cuentas[0].id_cuenta);
        }
      })
      .catch(console.error);
  }, []);

  // Cargar datos al cambiar cuenta
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setCarteraFiltro(null);
    Promise.all([
      fetch(`/api/portfolio/resumen?id_cuenta=${encodeURIComponent(selectedId)}`).then((r) => r.json()),
      fetch(`/api/portfolio/detalle?id_cuenta=${encodeURIComponent(selectedId)}`).then((r) => r.json()),
    ])
      .then(([res, det]: [ResumeData, DetalleData]) => {
        setResumen(res);
        if (res.cuentas?.length) setCuentas(res.cuentas);
        setDetalle(det);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const mesActual   = resumen?.mes_actual ?? {};
  const mesAnterior = resumen?.mes_anterior ?? {};
  const totalActual   = Object.values(mesActual).reduce((a, b) => a + b, 0);
  const totalAnterior = Object.values(mesAnterior).reduce((a, b) => a + b, 0);
  const posiciones = detalle?.posiciones ?? [];
  const posFiltradas = useMemo(() => {
    const base = carteraFiltro
      ? posiciones.filter((p) => p.cartera === carteraFiltro)
      : posiciones;
    return [...base].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      return dir * (a.valuacion - b.valuacion);
    });
  }, [posiciones, carteraFiltro, sortCol, sortDir]);

  const toggleSort = (col: "ticker" | "valuacion") => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "valuacion" ? "desc" : "asc"); }
  };

  // Total dinámico según filtro activo
  const totalVisible = carteraFiltro
    ? posFiltradas.reduce((a, p) => a + p.valuacion, 0)
    : totalActual;

  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const kpis = [
    { label: "DÓLAR MEP",    value: mep > 0 ? `$${fmtFull(mep)}` : "--",    highlight: true },
    { label: "DÓLAR A3500",  value: a3500 > 0 ? `$${fmtFull(a3500)}` : "--", highlight: true },
    { label: "VALUACIÓN ARS", value: totalVisible > 0 ? fmtARS(totalVisible) : "--" },
    { label: "VAL A3500",    value: totalVisible > 0 && a3500 > 0 ? fmtARS(totalVisible / a3500) : "--" },
    { label: "VAL USD MEP",  value: totalVisible > 0 && mep > 0 ? fmtARS(totalVisible / mep) : "--" },
    { label: "MES ANTERIOR", value: totalAnterior > 0 ? fmtARS(totalAnterior) : "--" },
  ];

  const carteras = Object.entries(mesActual).filter(([, v]) => v > 0);

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[10px] text-[#555555] tracking-wide">CUENTA</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
        >
          {cuentas.map((c) => (
            <option key={c.id_cuenta} value={c.id_cuenta}>
              {c.cuenta || c.id_cuenta}
            </option>
          ))}
        </select>
        {loading && <span className="text-[10px] text-[#555555]">cargando…</span>}
        <span className="ml-auto text-[10px] text-[#555555]">{hoy}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-2 shrink-0">
        {kpis.map(({ label, value, highlight }) => (
          <div
            key={label}
            className={`bg-[#080808] px-3 py-2 border ${highlight ? "border-[#ff9900]/40" : "border-[#1a1a1a]"}`}
          >
            <div className={`text-[9px] tracking-wide uppercase mb-1 ${highlight ? "text-[#ff9900]/60" : "text-[#555555]"}`}>{label}</div>
            <div className="text-[15px] font-semibold text-[#d0d0d0] font-mono leading-tight">{value}</div>
          </div>
        ))}
      </div>

      {/* Main: filtro cartera (izq) + tabla posiciones (der) */}
      <div className="flex-1 min-h-0 grid grid-cols-[180px_1fr] gap-3">

        {/* Panel izquierdo: resumen por cartera + filtro */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">MES ACTUAL</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            <button
              onClick={() => setCarteraFiltro(null)}
              className={`w-full text-left px-2 py-1.5 text-[10px] font-mono border transition-colors ${
                carteraFiltro === null
                  ? "border-[#ff9900]/50 bg-[#ff9900]/10 text-[#ff9900]"
                  : "border-[#1a1a1a] text-[#808080] hover:border-[#2a2a2a] hover:text-[#d0d0d0]"
              }`}
            >
              <div className="font-semibold">TODAS</div>
              <div className="text-[11px] mt-0.5">{fmtARS(totalActual)}</div>
            </button>

            {carteras.map(([cartera, monto]) => (
              <button
                key={cartera}
                onClick={() => setCarteraFiltro(carteraFiltro === cartera ? null : cartera)}
                className={`w-full text-left px-2 py-1.5 text-[10px] font-mono border transition-colors ${
                  carteraFiltro === cartera
                    ? "border-transparent"
                    : "border-[#1a1a1a] text-[#808080] hover:border-[#2a2a2a] hover:text-[#d0d0d0]"
                }`}
                style={
                  carteraFiltro === cartera
                    ? { backgroundColor: `${colorFor(cartera)}18`, borderColor: colorFor(cartera), color: colorFor(cartera) }
                    : undefined
                }
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorFor(cartera) }} />
                  {cartera.replace("CARTERA ", "")}
                </div>
                <div className="text-[11px] mt-0.5 ml-3.5">{fmtARS(monto)}</div>
                <div className="text-[9px] mt-0.5 ml-3.5 opacity-60">
                  {totalActual > 0 ? `${((monto / totalActual) * 100).toFixed(1)}%` : ""}
                </div>
              </button>
            ))}

            {totalAnterior > 0 && (
              <div className="mt-2 pt-2 border-t border-[#1a1a1a]">
                <div className="text-[9px] text-[#555555] tracking-wide uppercase px-1 mb-1">MES ANTERIOR</div>
                {Object.entries(mesAnterior).filter(([, v]) => v > 0).map(([cartera, monto]) => (
                  <div key={cartera} className="px-1 py-0.5 text-[10px] font-mono text-[#555555] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-50" style={{ backgroundColor: colorFor(cartera) }} />
                    <span>{cartera.replace("CARTERA ", "")}</span>
                    <span className="ml-auto">{fmtARS(monto)}</span>
                  </div>
                ))}
                <div className="px-1 py-0.5 text-[10px] font-mono text-[#808080] border-t border-[#1a1a1a] mt-0.5 flex justify-between">
                  <span className="font-semibold">TOTAL</span>
                  <span>{fmtARS(totalAnterior)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: tabla de posiciones */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              COMPOSICIÓN
              {carteraFiltro && (
                <span className="ml-2 text-[#808080] font-normal normal-case">
                  — {carteraFiltro.replace("CARTERA ", "")}
                </span>
              )}
            </span>
            <span className="ml-auto text-[10px] text-[#555555]">
              {posFiltradas.length} posición{posFiltradas.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {posFiltradas.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("ticker")} className="cursor-pointer hover:text-[#ff9900] select-none">
                      TICKER {sortCol === "ticker" ? (sortDir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                    </th>
                    <th>EMISOR</th>
                    <th>CLASE</th>
                    {!carteraFiltro && <th>CARTERA</th>}
                    <th>CALIF.</th>
                    <th>VTO.</th>
                    <th className="text-right">CANTIDAD</th>
                    <th className="text-right">PRECIO</th>
                    <th onClick={() => toggleSort("valuacion")} className="text-right cursor-pointer hover:text-[#ff9900] select-none">
                      VALUACIÓN {sortCol === "valuacion" ? (sortDir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                    </th>
                    <th className="text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {posFiltradas.map((p, i) => (
                    <tr key={i}>
                      <td className="text-[#ff9900] font-semibold">{p.ticker}</td>
                      <td className="text-[#808080]">{p.emisor}</td>
                      <td>{p.clase_activo}</td>
                      {!carteraFiltro && (
                        <td>
                          <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ backgroundColor: colorFor(p.cartera) }} />
                          {p.cartera.replace("CARTERA ", "")}
                        </td>
                      )}
                      <td className="text-[#808080]">{p.calificacion}</td>
                      <td className="text-[#808080]">{fmtVto(p.vencimiento)}</td>
                      <td className="text-right font-mono">{p.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                      <td className="text-right font-mono">{p.precio.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</td>
                      <td className="text-right font-mono">{p.valuacion.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                      <td className="text-right text-[#808080]">{p.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[#555555] text-xs py-4 text-center">
                {loading ? "Cargando…" : "SIN DATOS"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
