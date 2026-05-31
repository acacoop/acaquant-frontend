"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface ProcessInfo {
  label: string;
  pid: number | null;
  rss_mb: number;
  cpu_percent: number;
  count: number;
}

interface Snapshot {
  ts: number;
  system: {
    cpu_percent: number;
    cpu_count: number;
    load_avg: { "1m": number; "5m": number; "15m": number };
    memory: { total_mb: number; used_mb: number; available_mb: number; percent: number };
    swap: { total_mb: number; used_mb: number; percent: number };
    disk: { total_gb: number; used_gb: number; percent: number };
    uptime_s: number;
  };
  processes: ProcessInfo[];
}

interface HistoryResponse {
  samples: Snapshot[];
  maxlen: number;
  started_at: number;
}

const POLL_MS = 60_000;

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function colorFor(percent: number): string {
  if (percent >= 85) return "#ff3333";
  if (percent >= 65) return "#ff9900";
  return "#00cc66";
}

function Gauge({
  title,
  percent,
  subtitle,
}: {
  title: string;
  percent: number;
  subtitle: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = colorFor(clamped);
  return (
    <div className="bg-[#0a0a0a] border border-[var(--t-border)] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-white/50">{title}</span>
        <span className="text-[11px] font-bold" style={{ color }}>
          {clamped.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-[#1f1f1f] overflow-hidden">
        <div
          className="h-full transition-[width] duration-500"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <div className="text-[10px] text-white/50">{subtitle}</div>
    </div>
  );
}

function ProcessRow({ p, maxRss }: { p: ProcessInfo; maxRss: number }) {
  const barPct = maxRss > 0 ? (p.rss_mb / maxRss) * 100 : 0;
  const alive = p.pid !== null;
  return (
    <div
      className={`grid grid-cols-[150px_1fr_80px_70px] items-center gap-3 px-3 py-1.5 text-[11px] border-b border-[#151515] ${
        alive ? "" : "opacity-40"
      }`}
    >
      <div className="text-white/80 font-mono">{p.label}</div>
      <div className="h-1 bg-[#1f1f1f] relative overflow-hidden">
        <div className="h-full bg-[var(--t-accent)]" style={{ width: `${barPct}%` }} />
      </div>
      <div className="text-right text-white/70 tabular-nums">
        {alive ? `${p.rss_mb.toFixed(0)} MB` : "—"}
      </div>
      <div className="text-right text-white/70 tabular-nums">
        {alive ? `${p.cpu_percent.toFixed(1)}%` : "—"}
      </div>
    </div>
  );
}

export function RecursosPanel() {
  const [now, setNow] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [liveRes, histRes] = await Promise.all([
          fetch("/api/manager/resources", { cache: "no-store" }),
          fetch("/api/manager/resources/history?limit=60", { cache: "no-store" }),
        ]);
        if (!liveRes.ok || !histRes.ok) {
          throw new Error(`HTTP ${liveRes.status}/${histRes.status}`);
        }
        const live: Snapshot = await liveRes.json();
        const hist: HistoryResponse = await histRes.json();
        if (!cancelled) {
          setNow(live);
          setHistory(hist.samples || []);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (err && !now) {
    return (
      <div className="p-6 text-[11px] text-[#ff3333]">
        Error cargando recursos: {err}
      </div>
    );
  }

  if (!now) {
    return <div className="p-6 text-[11px] text-white/50">Cargando…</div>;
  }

  const sys = now.system;
  const maxRss = Math.max(...now.processes.map((p) => p.rss_mb), 1);

  const chartData = history.map((s) => ({
    t: new Date(s.ts * 1000).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    ram: s.system.memory.percent,
    swap: s.system.swap.percent,
    cpu: s.system.cpu_percent,
  }));

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      {/* Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Gauge
          title="CPU"
          percent={sys.cpu_percent}
          subtitle={`${sys.cpu_count} cores · load ${sys.load_avg["1m"].toFixed(
            2
          )} / ${sys.load_avg["5m"].toFixed(2)} / ${sys.load_avg["15m"].toFixed(2)}`}
        />
        <Gauge
          title="RAM"
          percent={sys.memory.percent}
          subtitle={`${sys.memory.used_mb.toFixed(0)} / ${sys.memory.total_mb.toFixed(
            0
          )} MB · disp ${sys.memory.available_mb.toFixed(0)}`}
        />
        <Gauge
          title="SWAP"
          percent={sys.swap.percent}
          subtitle={
            sys.swap.total_mb > 0
              ? `${sys.swap.used_mb.toFixed(0)} / ${sys.swap.total_mb.toFixed(0)} MB`
              : "sin swap configurado"
          }
        />
        <Gauge
          title="DISK /"
          percent={sys.disk.percent}
          subtitle={`${sys.disk.used_gb.toFixed(1)} / ${sys.disk.total_gb.toFixed(
            1
          )} GB · uptime ${fmtUptime(sys.uptime_s)}`}
        />
      </div>

      {/* Procesos */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
            PROCESOS
          </span>
        </div>
        <div className="grid grid-cols-[150px_1fr_80px_70px] gap-3 px-3 py-1 text-[10px] text-white/40 tracking-[0.15em] border-b border-[#151515]">
          <div>SERVICIO</div>
          <div>MEMORIA RESIDENTE</div>
          <div className="text-right">RSS</div>
          <div className="text-right">CPU%</div>
        </div>
        {now.processes.map((p) => (
          <ProcessRow key={p.label} p={p} maxRss={maxRss} />
        ))}
      </div>

      {/* Histórico */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
            HISTÓRICO ({history.length} muestras · 1/min)
          </span>
          <span className="text-[10px] text-white/40">% uso</span>
        </div>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart
              data={chartData}
              margin={{ top: 6, right: 12, bottom: 0, left: -20 }}
            >
              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: "#777" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#777" }} />
              <Tooltip
                contentStyle={{
                  background: "#0a0a0a",
                  border: "1px solid #1a1a1a",
                  fontSize: 11,
                }}
                labelStyle={{ color: "#aaa" }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area
                type="monotone"
                dataKey="ram"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.15}
                name="RAM %"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="swap"
                stroke="#ff9900"
                fill="#ff9900"
                fillOpacity={0.1}
                name="Swap %"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="cpu"
                stroke="#00cc66"
                fill="#00cc66"
                fillOpacity={0.1}
                name="CPU %"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {err && (
        <div className="text-[10px] text-[var(--t-accent)]">
          Última actualización falló: {err}
        </div>
      )}
    </div>
  );
}
