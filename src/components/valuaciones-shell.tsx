"use client";

import { useEffect, useState } from "react";
import { ValuacionesView } from "@/components/valuaciones-view";
import { PnLTitulosView } from "@/components/pnl-titulos-view";
import { PnLTotalesView } from "@/components/pnl-totales-view";
import { CuentaCombobox, type CuentaDoc } from "@/components/aum-view";

// Sub-vistas dentro de VALUACIONES (igual orden que tenía la sub-tab
// dentro de /aum antes del refactor). Persistimos `sub` y `cuenta` en la
// URL para no perder la posición al refrescar.
const _VAL_SUBTABS = ["portafolio", "pnl_titulos", "totales"] as const;
type ValSubtab = (typeof _VAL_SUBTABS)[number];

function _readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
function _writeUrlParams(params: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, "", url.toString());
}

export function ValuacionesShell() {
  const [cuentas, setCuentas] = useState<CuentaDoc[]>([]);
  const [valCuenta, setValCuenta] = useState<string>(
    () => _readUrlParam("cuenta") || "",
  );
  const [valSubtab, setValSubtab] = useState<ValSubtab>(() => {
    const v = _readUrlParam("sub");
    return (_VAL_SUBTABS as readonly string[]).includes(v || "")
      ? (v as ValSubtab)
      : "portafolio";
  });

  // Sync subtab + cuenta a la URL (replaceState para no llenar el history).
  useEffect(() => {
    _writeUrlParams({
      sub: valSubtab !== "portafolio" ? valSubtab : null,
      cuenta: valCuenta || null,
    });
  }, [valSubtab, valCuenta]);

  // Lista de cuentas — mismo fetch que tenía AumView. Si no había selección
  // previa (ni desde URL) defaulteamos a [100] ACA VALORES S.A. (la cuenta propia);
  // fallback a la primera de la lista si por algún motivo no estuviera.
  useEffect(() => {
    fetch("/api/portfolio-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { cuentas: CuentaDoc[] }) => {
        const list = d.cuentas || [];
        setCuentas(list);
        if (list.length && !valCuenta) {
          const def = list.find((c) => c.id_cuenta === "100") || list[0];
          setValCuenta(def.id_cuenta);
        }
      })
      .catch(() => {
        /* sin lista — el selector queda vacío */
      });
  }, [valCuenta]);

  const idx = cuentas.findIndex((c) => c.id_cuenta === valCuenta);
  const prev = idx > 0 ? cuentas[idx - 1].id_cuenta : null;
  const next =
    idx >= 0 && idx < cuentas.length - 1 ? cuentas[idx + 1].id_cuenta : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CUENTA</span>
          <button
            onClick={() => prev && setValCuenta(prev)}
            disabled={!prev}
            title="Cuenta anterior"
            className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
          >
            ◀
          </button>
          <CuentaCombobox
            cuentas={cuentas}
            value={valCuenta}
            onChange={setValCuenta}
          />
          <button
            onClick={() => next && setValCuenta(next)}
            disabled={!next}
            title="Cuenta siguiente"
            className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
          >
            ▶
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {_VAL_SUBTABS.map((s) => (
            <button
              key={s}
              onClick={() => setValSubtab(s)}
              className={`px-3 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                valSubtab === s
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}
            >
              {s === "portafolio"
                ? "PORTAFOLIO"
                : s === "pnl_titulos"
                  ? "PNL TÍTULOS"
                  : "TOTALES"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {valSubtab === "totales" ? (
          // TOTALES no depende de una cuenta específica — agrega TODAS.
          <PnLTotalesView />
        ) : valCuenta ? (
          valSubtab === "portafolio" ? (
            <ValuacionesView
              idCuenta={valCuenta}
              nombreCuenta={
                cuentas.find((c) => c.id_cuenta === valCuenta)?.cuenta
              }
            />
          ) : (
            <PnLTitulosView idCuenta={valCuenta} />
          )
        ) : (
          <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
            Cargando cuentas…
          </div>
        )}
      </div>
    </div>
  );
}
