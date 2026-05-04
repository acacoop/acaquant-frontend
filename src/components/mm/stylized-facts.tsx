"use client";

import { InfoIcon } from "@/components/info-icon";
import { useFetchOnce } from "./use-poll";
import { fmt } from "./fmt";
import { tips } from "./tips";
import type { StylizedFactsResp } from "./types";

interface Props {
  ticker: string;
}

export function StylizedFactsPanel({ ticker }: Props) {
  const url = `/api/mm/stylized-facts?ticker=${encodeURIComponent(ticker)}&dias=5&bucket_min=1`;
  const { data, error, loading } = useFetchOnce<StylizedFactsResp>(url);

  if (loading) return <div className="text-[12px] text-zinc-500">cargando…</div>;
  if (error) return <div className="text-[12px] text-rose-400">{error}</div>;
  if (!data) return null;

  if (data.error) {
    return <div className="text-[12px] text-zinc-400">{data.error}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-zinc-400">
        Retornos de buckets de {data.bucket_min} min sobre los últimos {data.dias} días ·{" "}
        <span className="text-zinc-200">{data.n_obs}</span> observaciones.
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="μ (bps)" value={data.mu != null ? fmt(data.mu, 2) : "—"} />
        <Stat label="σ (bps)" value={data.sigma != null ? fmt(data.sigma, 2) : "—"} />
        <Stat
          label="Skewness"
          value={data.skewness != null ? fmt(data.skewness, 3) : "—"}
          tone={Math.abs(data.skewness ?? 0) > 0.5 ? "amber" : "default"}
          tip={tips.skewness}
        />
        <Stat
          label="Kurtosis"
          value={data.kurtosis != null ? fmt(data.kurtosis, 2) : "—"}
          sub={data.exceso_kurt != null ? `exceso ${fmt(data.exceso_kurt, 2)}` : undefined}
          tone={(data.kurtosis ?? 0) > 4 ? "amber" : "default"}
          tip={tips.kurtosis}
        />
        <Stat
          label="ACF(1) mid"
          value={data.acf1_mid != null ? fmt(data.acf1_mid, 3) : "—"}
          sub="≈ 0 esperado (eficiencia direccional)"
          tip={tips.acf1}
        />
        <Stat
          label="ACF(1) last"
          value={data.acf1_last != null ? fmt(data.acf1_last, 3) : "—"}
          sub="< 0 = bid-ask bounce"
          tone={(data.acf1_last ?? 0) < -0.05 ? "amber" : "default"}
          tip={tips.acf1}
        />
        <Stat
          label="Persist. ACF|r|"
          value={data.acf_abs_persistencia != null ? `${data.acf_abs_persistencia}/20` : "—"}
          sub="lags > 0.05 → vol clustering"
          tone={(data.acf_abs_persistencia ?? 0) >= 5 ? "amber" : "default"}
          tip={tips.acfAbs}
        />
        <Stat
          label="Jarque-Bera"
          value={data.jarque_bera != null ? fmt(data.jarque_bera, 1) : "—"}
          sub={data.jb_p != null ? `p = ${fmt(data.jb_p, 4)}` : undefined}
          tone={(data.jb_p ?? 1) < 0.05 ? "amber" : "default"}
          tip={tips.jarqueBera}
        />
      </div>

      {data.acf_abs && (
        <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
            ACF de |r| · lags 1-20 (volatility clustering)
            <InfoIcon tip={tips.acfAbs} width="380px" />
          </div>
          <div className="flex h-16 items-end gap-1">
            {data.acf_abs.map((v, i) => {
              const h = v != null ? Math.max(0, Math.min(1, v)) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1"
                  title={`lag ${i + 1} · ${v != null ? fmt(v, 3) : "—"}`}
                  style={{ height: `${h}%`, background: (v ?? 0) > 0.05 ? "rgba(245,158,11,0.6)" : "rgba(82,82,91,0.4)" }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
            <span>1</span>
            <span>20</span>
          </div>
        </div>
      )}

      {data.interpretacion && data.interpretacion.length > 0 && (
        <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Lectura</div>
          <ul className="space-y-1 text-[12px] text-zinc-300">
            {data.interpretacion.map((msg, i) => (
              <li key={i} className="leading-relaxed">
                · {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "amber";
  tip?: React.ReactNode;
}) {
  const valColor = tone === "amber" ? "text-amber-400" : "text-zinc-100";
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
        {tip && <InfoIcon tip={tip} width="380px" />}
      </div>
      <div className={`text-[16px] font-semibold tabular-nums ${valColor}`}>{value}</div>
      {sub && <div className="text-[9px] text-zinc-500">{sub}</div>}
    </div>
  );
}
