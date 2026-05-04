"use client";

import { InfoIcon } from "@/components/info-icon";
import { useFetchOnce } from "./use-poll";
import { fmt } from "./fmt";
import { tips } from "./tips";
import type { ImpactResp } from "./types";

interface Props {
  ticker: string;
}

export function ImpactPanel({ ticker }: Props) {
  const url = `/api/mm/impact?ticker=${encodeURIComponent(ticker)}&dias=5&bucket_min=1`;
  const { data, error, loading } = useFetchOnce<ImpactResp>(url);

  if (loading) return <div className="text-[12px] text-zinc-500">cargando…</div>;
  if (error) return <div className="text-[12px] text-rose-400">{error}</div>;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Card title="Permanent impact (b)" tip={tips.impactB}>
        <Equation>{`ΔS_n = b · π_n + ε`}</Equation>
        <Big>{data.permanent_impact.b != null ? fmt(data.permanent_impact.b, 6) : "—"}</Big>
        <Detail>
          R² = {data.permanent_impact.r2 != null ? fmt(data.permanent_impact.r2, 3) : "—"} ·{" "}
          n = {data.permanent_impact.n_buckets} buckets · {data.dias} días
        </Detail>
        <Note>
          Causa: <span className="text-zinc-300">selección adversa</span>. Es la versión multi-tick del
          λ de Kyle. Mayor b → mercado menos líquido / más informacional.
        </Note>
      </Card>

      <Card title="Temporary impact (k)" tip={tips.impactK}>
        <Equation>{`|S^exec − mid| = k · Q + ε`}</Equation>
        <Big>{data.temporary_impact.k != null ? fmt(data.temporary_impact.k, 6) : "—"}</Big>
        <Detail>
          R² = {data.temporary_impact.r2 != null ? fmt(data.temporary_impact.r2, 3) : "—"} ·{" "}
          n = {data.temporary_impact.n_trades} trades
        </Detail>
        <Note>
          Causa: <span className="text-zinc-300">consumo de liquidez</span>. El book se re-puebla.
          Mayor k → menor profundidad disponible. Es lo que ves al &ldquo;walking the book&rdquo;.
        </Note>
      </Card>
    </div>
  );
}

function Card({
  title,
  children,
  tip,
}: {
  title: string;
  children: React.ReactNode;
  tip?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-400">
        {title}
        {tip && <InfoIcon tip={tip} width="380px" />}
      </div>
      {children}
    </div>
  );
}

function Equation({ children }: { children: string }) {
  return (
    <div className="mb-2 rounded bg-zinc-900 px-2 py-1 font-mono text-[12px] text-zinc-300">{children}</div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-[24px] font-semibold tabular-nums text-amber-400">{children}</div>;
}

function Detail({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] text-zinc-500">{children}</div>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] leading-relaxed text-zinc-400">{children}</div>;
}
