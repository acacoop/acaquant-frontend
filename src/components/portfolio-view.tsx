"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface Cuenta {
  id_cuenta: string;
  cuenta: string;
}

interface ResumeData {
  cuentas: Cuenta[];
  mes_actual: Record<string, number>;
  mes_anterior: Record<string, number>;
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

export function PortfolioView({ mep, a3500 }: Props) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/portfolio/resumen?id_cuenta=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((d: ResumeData) => {
        setData(d);
        if (d.cuentas?.length) setCuentas(d.cuentas);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const mesActual   = data?.mes_actual ?? {};
  const mesAnterior = data?.mes_anterior ?? {};
  const totalActual   = Object.values(mesActual).reduce((a, b) => a + b, 0);
  const totalAnterior = Object.values(mesAnterior).reduce((a, b) => a + b, 0);

  const donutData = Object.entries(mesActual)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const kpis = [
    { label: "DÓLAR MEP",    value: mep > 0 ? `$${fmtFull(mep)}` : "--" },
    { label: "DÓLAR A3500",  value: a3500 > 0 ? `$${fmtFull(a3500)}` : "--" },
    { label: "VALUACIÓN ARS", value: totalActual > 0 ? fmtARS(totalActual) : "--" },
    { label: "VAL A3500",    value: totalActual > 0 && a3500 > 0 ? fmtARS(totalActual / a3500) : "--" },
    { label: "VAL USD MEP",  value: totalActual > 0 && mep > 0 ? fmtARS(totalActual / mep) : "--" },
    { label: "MES ANTERIOR", value: totalAnterior > 0 ? fmtARS(totalAnterior) : "--" },
  ];

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
        {kpis.map(({ label, value }) => (
          <div key={label} className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
            <div className="text-[9px] text-[#555555] tracking-wide uppercase mb-1">{label}</div>
            <div className="text-[15px] font-semibold text-[#d0d0d0] font-mono leading-tight">{value}</div>
          </div>
        ))}
      </div>

      {/* Donut + Tablas */}
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_1fr] gap-3">
        {/* Donut */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">COMPOSICIÓN</span>
          </div>
          <div className="flex-1 min-h-0">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="70%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={colorFor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                    formatter={(v, name) => [
                      `${fmtARS(Number(v))}  (${totalActual > 0 ? ((Number(v) / totalActual) * 100).toFixed(1) : 0}%)`,
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[#555555] text-xs py-4 text-center">SIN DATOS</p>
            )}
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-x-5 gap-y-1 shrink-0">
            {donutData.map(({ name, value }) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFor(name) }} />
                <span className="text-[10px] text-[#808080] font-mono">
                  {name.replace("CARTERA ", "")}
                  {totalActual > 0 ? ` ${((value / totalActual) * 100).toFixed(1)}%` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tablas */}
        <div className="flex flex-col gap-3 min-h-0">
          <CartTable title="MES ACTUAL"   breakdown={mesActual}   total={totalActual} />
          <CartTable title="MES ANTERIOR" breakdown={mesAnterior} total={totalAnterior} />
        </div>
      </div>
    </div>
  );
}

function CartTable({
  title, breakdown, total,
}: {
  title: string;
  breakdown: Record<string, number>;
  total: number;
}) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);

  return (
    <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">{title}</span>
      </div>
      <div className="overflow-y-auto flex-1">
        <table>
          <thead>
            <tr>
              <th>CARTERA</th>
              <th className="text-right">MONTO ARS</th>
              <th className="text-right">POND.</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([cartera, monto]) => (
              <tr key={cartera}>
                <td>
                  <span
                    className="w-2 h-2 rounded-full inline-block mr-2"
                    style={{ backgroundColor: colorFor(cartera) }}
                  />
                  {cartera.replace("CARTERA ", "")}
                </td>
                <td className="text-right font-mono">
                  {monto.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </td>
                <td className="text-right text-[#808080]">
                  {total > 0 ? `${((monto / total) * 100).toFixed(1)}%` : "--"}
                </td>
              </tr>
            ))}
            {entries.length > 0 && (
              <tr className="border-t border-[#2a2a2a]">
                <td className="text-[#ff9900] font-semibold">TOTAL</td>
                <td className="text-right font-mono font-semibold text-[#d0d0d0]">
                  {total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                </td>
                <td className="text-right text-[#808080]">100%</td>
              </tr>
            )}
            {entries.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-[#555555] py-4">SIN DATOS</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
