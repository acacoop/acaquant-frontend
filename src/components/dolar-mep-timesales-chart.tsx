"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Rueda } from "./dolar-mep-shared";

// Chart de la serie MEP por minuto (last close). Toda la lógica vive en
// el backend (api/operativa/mep/timesales) — acá solo dibujamos.
interface Punto {
  ts: string;
  mep: number;
  hora: string; // HH:MM derivado del ts para el eje X
}

interface Resp {
  rueda: Rueda;
  points: { ts: string; mep: number }[];
}

const POLL_MS = 5000;

export function DolarMepTimeSalesChart({ rueda }: { rueda: Rueda }) {
  const [data, setData] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function fetchSerie() {
      try {
        const r = await fetch(`/api/operativa/mep/timesales?rueda=${rueda}`, {
          cache: "no-store",
        });
        if (!alive) return;
        if (!r.ok) {
          setLoading(false);
          return;
        }
        const json: Resp = await r.json();
        const points: Punto[] = (json.points ?? []).map((p) => ({
          ts: p.ts,
          mep: p.mep,
          hora: hhmm(p.ts),
        }));
        if (alive) {
          setData(points);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }
    setLoading(true);
    fetchSerie();
    const id = setInterval(fetchSerie, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [rueda]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
        cargando…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
        sin datos para MEP {rueda}
      </div>
    );
  }

  // Eje Y: ajusto el dominio para que la serie no quede aplastada contra el
  // borde — agrego un 0.5% de padding arriba/abajo del rango visto.
  const meps = data.map((p) => p.mep);
  const lo = Math.min(...meps);
  const hi = Math.max(...meps);
  const pad = (hi - lo) * 0.005 || 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
        <XAxis
          dataKey="hora"
          stroke="#666"
          tick={{ fontSize: 9, fill: "#888" }}
          minTickGap={24}
        />
        <YAxis
          stroke="#666"
          tick={{ fontSize: 9, fill: "#888" }}
          domain={[lo - pad, hi + pad]}
          tickFormatter={(v) => v.toFixed(2)}
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: "#0a0a0a",
            border: "1px solid #333",
            fontSize: 11,
          }}
          labelStyle={{ color: "#888" }}
          formatter={(v) => [`$${Number(v).toFixed(2)}`, "MEP"]}
        />
        <Line
          type="monotone"
          dataKey="mep"
          stroke="#ff9900"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Hora ART explícita — el backend devuelve UTC real con tz, acá lo
// localizamos a Buenos Aires sin depender de la timezone del browser.
const HORA_ART = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return HORA_ART.format(d);
}
