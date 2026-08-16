"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { readSheetTsv } from "@/lib/xlsx-read";
import { TabAssets, type RowState } from "./manager-assets-panel";
import { CheckPanel, GROUP_HEADER, GROUP_TITLE, Pill, RunBtn, StatusBadge, d10 } from "./manager-shared";

// Vista dedicada del catálogo de instrumentos pyRofex agrupado por CFI code.
// Reemplaza al panel discovery que vivía dentro de Validaciones — acá hay más
// espacio + búsqueda para identificar productos antes de extender el motor.

interface CfiInstrument {
  ticker: string; maturity: string; underlying: string;
  currency?: string; tickSize?: number;
  contractMultiplier?: number;
  putOrCall?: string; strikePrice?: number;
  minTradeVol?: number; maxTradeVol?: number;
  lowLimitPrice?: number; highLimitPrice?: number;
}

function TabInstrumentos() {
  const [discLoading, setDiscLoading] = useState(false);
  const [discData, setDiscData] = useState<{
    ok: boolean;
    message?: string;
    total_instruments: number;
    by_cficode: {
      cficode: string;
      count: number;
      underlyings: string[];
      samples: { ticker: string; maturity: string; underlying: string }[];
    }[];
    generated_at: string | null;
    stale_h: number | null;
  } | null>(null);

  // CFI seleccionado + drill-down de sus instruments.
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [selectedUnderlying, setSelectedUnderlying] = useState<string>("__ALL__");
  const [instruments, setInstruments] = useState<CfiInstrument[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [search, setSearch] = useState("");

  const runDisc = () => {
    setDiscLoading(true);
    fetch("/api/manager/checks/discovery-pyrofex")
      .then(r => r.json()).then(setDiscData).finally(() => setDiscLoading(false));
  };

  // Auto-cargar summary al montar.
  useEffect(() => { runDisc(); }, []);

  // Cuando llega el summary y no hay CFI seleccionado, default = primero
  // (el que tiene más count, vienen ordenados desc).
  useEffect(() => {
    if (discData?.ok && discData.by_cficode.length > 0 && !selectedCfi) {
      setSelectedCfi(discData.by_cficode[0].cficode);
    }
  }, [discData, selectedCfi]);

  // Fetch instruments cuando cambia el CFI seleccionado.
  useEffect(() => {
    if (!selectedCfi) {
      setInstruments([]);
      return;
    }
    setInstLoading(true);
    setSearch("");
    setSelectedUnderlying("__ALL__");
    fetch(`/api/manager/checks/instruments-by-cfi?cficode=${encodeURIComponent(selectedCfi)}`)
      .then((r) => r.json())
      .then((d: { instruments?: CfiInstrument[] }) => setInstruments(d.instruments ?? []))
      .finally(() => setInstLoading(false));
  }, [selectedCfi]);

  // Underlyings ordenados desde los instruments cargados (para tener
  // counts por underlying en el dropdown). discData.by_cficode trae solo
  // el set de nombres sin counts.
  const underlyingsConCount = (() => {
    const counts: Record<string, number> = {};
    for (const inst of instruments) {
      counts[inst.underlying] = (counts[inst.underlying] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const filteredInst = (() => {
    let list = instruments;
    if (selectedUnderlying !== "__ALL__") {
      list = list.filter((inst) => inst.underlying === selectedUnderlying);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (inst) =>
          inst.ticker.toLowerCase().includes(q) ||
          inst.maturity.includes(q),
      );
    }
    return list;
  })();

  return (
    <div className="space-y-3">
      {/* Header con selector + refresh */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runDisc}
            disabled={discLoading}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {discLoading ? "Cargando…" : "↻ Recargar"}
          </button>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CFI</span>
          <select
            value={selectedCfi}
            onChange={(e) => setSelectedCfi(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-accent)] font-mono min-w-[180px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!discData?.ok}
          >
            {!discData?.ok && <option value="">— sin data —</option>}
            {discData?.ok && discData.by_cficode.map((g) => (
              <option key={g.cficode} value={g.cficode}>
                {g.cficode}  ({g.count})
              </option>
            ))}
          </select>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">UNDERLYING</span>
          <select
            value={selectedUnderlying}
            onChange={(e) => setSelectedUnderlying(e.target.value)}
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono min-w-[300px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={instruments.length === 0}
          >
            <option value="__ALL__">
              — todos ({instruments.length}) —
            </option>
            {underlyingsConCount.map(([u, n]) => (
              <option key={u} value={u}>
                {u} ({n})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ticker o maturity"
            className="flex-1 min-w-[200px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!instruments.length}
          />

          {discData?.ok && (
            <div className="text-[10px] text-[var(--t-text-dim)]">
              <span className="font-mono text-[var(--t-text)]">{discData.total_instruments}</span> total
              {" · "}
              <span className="font-mono text-[var(--t-text)]">{discData.by_cficode.length}</span> CFI
            </div>
          )}
        </div>
        {discData?.generated_at && (
          <div className="text-[9px] text-[var(--t-text-muted)] mt-2">
            Actualizado {new Date(discData.generated_at).toLocaleString("es-AR")}
            {discData.stale_h !== null && ` (hace ${discData.stale_h}h)`}
          </div>
        )}
      </div>

      {/* Banner si no hay data */}
      {discData && !discData.ok && (
        <div className="border border-[#ff7f7f]/40 bg-[var(--t-tint-red)] p-3 text-[10px] text-[var(--t-neg)] italic">
          {discData.message}
        </div>
      )}

      {/* Tabla única de instruments */}
      {selectedCfi && (
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
          <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2 text-[10px]">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">INSTRUMENTS</span>
            <span className="font-mono text-[var(--t-text)]">{filteredInst.length}</span>
            {search && filteredInst.length !== instruments.length && (
              <span className="text-[var(--t-text-muted)]">de {instruments.length}</span>
            )}
            {instLoading && <span className="text-[var(--t-text-muted)] italic ml-2">Cargando…</span>}
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[var(--t-text-muted)] text-[9px] tracking-widest sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
                <tr>
                  <th className="text-left px-3 py-2">TICKER</th>
                  <th className="text-left px-3 py-2">MATURITY</th>
                  <th className="text-left px-3 py-2">UNDERLYING</th>
                  <th className="text-right px-3 py-2">CCY</th>
                  <th className="text-right px-3 py-2">TICK</th>
                  <th className="text-right px-3 py-2">MULT</th>
                  <th className="text-right px-3 py-2">STRIKE</th>
                  <th className="text-right px-3 py-2">P/C</th>
                </tr>
              </thead>
              <tbody>
                {filteredInst.map((inst, i) => (
                  <tr key={`${inst.ticker}-${i}`} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[var(--t-pos)]">{inst.ticker}</td>
                    <td className="px-3 py-1 text-[var(--t-text-dim)]">{inst.maturity}</td>
                    <td className="px-3 py-1 text-[var(--t-text)]">{inst.underlying}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.currency ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.tickSize ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.contractMultiplier ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.strikePrice ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.putOrCall ?? "—"}</td>
                  </tr>
                ))}
                {!instLoading && filteredInst.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-[var(--t-text-muted)]">
                      {instruments.length === 0
                        ? "Sin instruments para este CFI. ¿Corriste scripts.discovery_pyrofex tras el último deploy?"
                        : `Sin matches para "${search}"`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ONs (Trading.BondsMaster) — segmentar + alta/edición con flujos ──
interface ONFlujo { fecha: string; amortizacion: number; interes: number; valor_residual: number }
interface ONMaster {
  asset: string;
  emisor?: string | null;
  moneda_flujo?: string | null;
  tasa_cupon?: number | null;
  vencimiento?: string | null;
  sector?: string | null;
  tickers?: { ARS?: string | null; USD?: string | null } | null;
  flujos?: ONFlujo[] | null;
}

// Espejo de `core/curvas_ejes.py`. Si divergen, el backend rechaza con 400 —
// el front no puede colar un valor fuera del dominio, solo ofrecer uno de menos.
const EJE_EMISORES = ["soberano", "provincial", "corporativo", "bcra"] as const;
const EJE_MONEDAS = ["ARS", "USD", "EUR"] as const;
const EJE_AJUSTES = ["fija", "cer", "tamar", "badlar", "dolar_linked", "tpm", "caucion"] as const;

const ON_SECTORES = ["energia", "finanzas", "otros"];

function _onNum(s: string): number {
  let t = (s || "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); // formato es-AR
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
const _onInput =
  "bg-[var(--t-surface-2)] border border-[var(--t-border)] px-1.5 py-0.5 text-[11px] w-full";

// Tickers ROFEX: el usuario tipea SOLO el código (ej. 'YM40O'); el
// 'MERV - XMEV - … - 24hs' se arma solo alrededor.
function wrapTicker(code: string): string | undefined {
  const c = (code || "").trim().toUpperCase();
  return c ? `MERV - XMEV - ${c} - 24hs` : undefined;
}
function unwrapTicker(full?: string | null): string {
  if (!full) return "";
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

function OnField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">{label}</span>
      {children}
    </label>
  );
}

interface ONPrefill { asset?: string; emisor?: string; moneda_flujo?: string }

function TabOnsAlta({ prefill, onSaved }: { prefill?: ONPrefill | null; onSaved?: () => void }) {
  const empty = { asset: "", emisor: "", moneda_flujo: "USD", tasa_cupon: "", vencimiento: "", sector: "otros", tkARS: "", tkUSD: "" };
  // prefill viene del conciliador (botón "dar de alta"); el padre fuerza remount
  // con key, así el initializer lo toma sin efectos.
  const [form, setForm] = useState({
    ...empty,
    ...(prefill ? { asset: prefill.asset || "", emisor: prefill.emisor || "", moneda_flujo: prefill.moneda_flujo || "USD", tkARS: prefill.asset || "" } : {}),
  });
  const [flujosText, setFlujosText] = useState("");
  const [flujos, setFlujos] = useState<ONFlujo[]>([]);
  const [formato, setFormato] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [existentes, setExistentes] = useState<ONMaster[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/manager/ons").then((r) => r.json())
      .then((d: { ons: ONMaster[] }) => { if (alive) setExistentes(d.ons || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sumAmort = flujos.reduce((s, f) => s + f.amortizacion, 0);

  // Parsea el texto pegado en el server (entiende el formato oficial BYMA/IAMC).
  const parsear = async (texto: string) => {
    if (!texto.trim()) { setFlujos([]); setFormato(""); return; }
    try {
      const r = await fetch("/api/manager/ons/parse-flujos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
      });
      const d = await r.json();
      setFlujos(d.flujos || []);
      setFormato(d.formato || "");
      // Auto-completa tasa/vto si vinieron en la descarga y el form está vacío.
      setForm((f) => ({
        ...f,
        tasa_cupon: f.tasa_cupon || (d.tasa_cupon != null ? String(d.tasa_cupon) : ""),
        vencimiento: f.vencimiento || (d.vencimiento || ""),
      }));
    } catch { /* deja el preview vacío */ }
  };

  // Subir el archivo de la descarga (CSV/Excel-guardado-como-csv) y previsualizar.
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setFlujosText(text);
      parsear(text);
    };
    reader.readAsText(file);
  };

  const cargarExistente = (asset: string) => {
    const o = existentes.find((x) => x.asset === asset);
    if (!o) { setForm({ ...empty }); setFlujosText(""); setFlujos([]); return; }
    setForm({
      asset: o.asset, emisor: o.emisor || "", moneda_flujo: (o.moneda_flujo || "USD").toUpperCase(),
      tasa_cupon: o.tasa_cupon != null ? String(o.tasa_cupon) : "", vencimiento: (o.vencimiento || "").slice(0, 10),
      sector: (o.sector || "otros").toLowerCase(), tkARS: unwrapTicker(o.tickers?.ARS), tkUSD: unwrapTicker(o.tickers?.USD),
    });
    const txt = (o.flujos || []).map((f) => `${f.fecha}\t${f.amortizacion ?? 0}\t${f.interes ?? 0}\t${f.valor_residual ?? 100}`).join("\n");
    setFlujosText(txt);
    setFlujos((o.flujos || []).map((f) => ({ fecha: f.fecha, amortizacion: f.amortizacion ?? 0, interes: f.interes ?? 0, valor_residual: f.valor_residual ?? 100 })));
    setFormato("");
    setMsg(null);
  };

  const guardar = async () => {
    if (!form.asset.trim()) { setMsg({ kind: "err", text: "Falta el asset (ticker corto)" }); return; }
    setSaving(true); setMsg(null);
    const body = {
      asset: form.asset.trim(),
      emisor: form.emisor.trim() || undefined,
      moneda_flujo: form.moneda_flujo,
      tasa_cupon: form.tasa_cupon ? _onNum(form.tasa_cupon) : undefined,
      vencimiento: form.vencimiento || undefined,
      sector: form.sector,
      tickers: { ARS: wrapTicker(form.tkARS), USD: wrapTicker(form.tkUSD) },
      flujos: flujos.length ? flujos : undefined,
    };
    try {
      const r = await fetch("/api/manager/ons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const txt = await r.text();
      let d: { detail?: string } = {};
      try { d = JSON.parse(txt); } catch { /* respuesta no-JSON (ej. 500 HTML) */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Guardada en Curvas (on_*)." });
      fetch("/api/manager/ons").then((x) => x.json()).then((d2: { ons: ONMaster[] }) => setExistentes(d2.ons || [])).catch(() => {});
      onSaved?.();  // avisa al padre → refresca el conciliador (el bono ya no falta)
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Editar existente</span>
        <select className={_onInput + " w-auto"} value={form.asset} onChange={(e) => cargarExistente(e.target.value)}>
          <option value="">— nueva ON —</option>
          {existentes.map((o) => <option key={o.asset} value={o.asset}>{o.asset} · {o.emisor}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <OnField label="Asset (ticker corto)"><input className={_onInput} value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} placeholder="YM40O" /></OnField>
        <OnField label="Emisor"><input className={_onInput} value={form.emisor} onChange={(e) => setForm({ ...form, emisor: e.target.value })} placeholder="YPF" /></OnField>
        <OnField label="Moneda flujo"><select className={_onInput} value={form.moneda_flujo} onChange={(e) => setForm({ ...form, moneda_flujo: e.target.value })}><option value="USD">USD (hard dollar)</option><option value="DL">DL (dólar linked)</option><option value="ARS">ARS (peso)</option></select></OnField>
        <OnField label="Sector"><select className={_onInput} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>{ON_SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}</select></OnField>
        <OnField label="Tasa cupón (ej 0.075)"><input className={_onInput} value={form.tasa_cupon} onChange={(e) => setForm({ ...form, tasa_cupon: e.target.value })} placeholder="0.075" /></OnField>
        <OnField label="Vencimiento"><input type="date" className={_onInput} value={form.vencimiento} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} /></OnField>
      </div>

      {/* Tickers ROFEX: el usuario pone SOLO el código; el MERV-XMEV-…-24hs va fijo. */}
      <div className="grid grid-cols-2 gap-2">
        <OnField label="Ticker ARS (solo el código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkARS}
              onChange={(e) => setForm({ ...form, tkARS: e.target.value.toUpperCase() })} placeholder="YM40O" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
        <OnField label="Ticker USD (solo el código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkUSD}
              onChange={(e) => setForm({ ...form, tkUSD: e.target.value.toUpperCase() })} placeholder="YM40D" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
      </div>

      <div>
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">
          Flujos del bono — subí el archivo de la descarga (BYMA/IAMC)
        </span>
        <div className="flex items-center gap-3 mt-1">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-[#094293] text-white cursor-pointer hover:opacity-90">
            📁 EXAMINAR ARCHIVO
            <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </label>
          {fileName
            ? <span className="text-[11px] text-[var(--t-text)] truncate max-w-[240px]" title={fileName}>{fileName}</span>
            : <span className="text-[11px] text-[var(--t-text-dim)]">ningún archivo seleccionado</span>}
          <button type="button" onClick={() => setShowPaste((s) => !s)} className={_onInput + " w-auto"}>
            {showPaste ? "ocultar" : "o pegar texto"}
          </button>
          {(flujos.length > 0 || flujosText) && (
            <button type="button"
              onClick={() => { setFlujos([]); setFlujosText(""); setFileName(""); setFormato(""); }}
              className="px-2 py-0.5 text-[11px] text-red-500 border border-[var(--t-border)] hover:bg-red-500/10">
              limpiar flujos
            </button>
          )}
        </div>
        {showPaste && (
          <textarea
            className={_onInput + " font-mono h-24 mt-1"}
            value={flujosText}
            onChange={(e) => setFlujosText(e.target.value)}
            onBlur={() => parsear(flujosText)}
            placeholder={"Pegá la descarga (con encabezados) o: fecha\tamort\tinterés\tresidual"}
          />
        )}
        {flujos.length > 0 && (
          <div className="mt-1.5">
            <div className="text-[10px] text-[var(--t-text-dim)] mb-1">
              {flujos.length} flujos{formato ? ` · ${formato}` : ""} · Σ amort {sumAmort.toFixed(0)}
              {sumAmort < 95 || sumAmort > 105 ? <span className="text-amber-500"> ⚠ ~100</span> : <span className="text-emerald-500"> ✓</span>}
              {" · vto "}{flujos[flujos.length - 1].fecha}
            </div>
            <div className="max-h-40 overflow-auto border border-[var(--t-border)]">
              <table>
                <thead>
                  <tr><th>#</th><th>Fecha</th><th className="text-right">Amort.</th><th className="text-right">Interés</th><th className="text-right">Residual</th><th></th></tr>
                </thead>
                <tbody>
                  {flujos.map((f, i) => (
                    <tr key={i}>
                      <td className="text-[var(--t-text-dim)]">{i + 1}</td>
                      <td className="tabular-nums">{f.fecha}</td>
                      <td className="text-right tabular-nums">{f.amortizacion}</td>
                      <td className="text-right tabular-nums">{f.interes}</td>
                      <td className="text-right tabular-nums">{f.valor_residual}</td>
                      <td className="text-center">
                        <button type="button" title="borrar este flujo"
                          onClick={() => setFlujos((fs) => fs.filter((_, j) => j !== i))}
                          className="text-red-500 hover:bg-red-500/10 px-1">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving}
          className="px-3 py-1 text-[11px] font-semibold bg-[#094293] text-white disabled:opacity-50">
          {saving ? "Guardando…" : "GUARDAR ON"}
        </button>
        {msg && <span className={"text-[11px] " + (msg.kind === "ok" ? "text-emerald-500" : "text-red-500")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-[var(--t-text-muted)]">
        Al guardar, la ON aparece en la vista. Puede tardar unos minutos en cotizar
        en vivo (precio/TEA).
      </p>
    </div>
  );
}

// ── BONOS (tasa_fija / CER / soberanos) — editor directo a Trading.Curvas ──
// Gemelo de ONs pero para bonos que viven directo en Curvas (sin BondsMaster).
// Tipos de bono de Trading.Curvas — cada uno habilita sus campos y la shape de flujo
// (replica EXACTA de Curvas, no se inventa). bullet = solo flujo_vencimiento (sin array).
const BONO_TIPOS: { tipo: string; label: string; curva: string; bullet?: boolean; cols?: { k: string; label: string }[]; cer?: boolean; cupon?: boolean; tasaRef?: boolean }[] = [
  { tipo: "lecap",    label: "Lecap (bullet)",     curva: "tasa_fija", bullet: true },
  { tipo: "boncap",   label: "Boncap (bullet)",    curva: "tasa_fija", bullet: true },
  { tipo: "bono",     label: "Tasa fija c/ cupón", curva: "tasa_fija", cols: [{ k: "amortizacion", label: "Amort." }, { k: "interes", label: "Interés" }] },
  { tipo: "cer",      label: "CER",                curva: "cer",       cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }, { k: "residual_previo_pct", label: "Resid. previo %" }], cer: true, cupon: true },
  { tipo: "dual",     label: "Dual / TAMAR",       curva: "tamar",     cols: [{ k: "amortizacion_pct", label: "Amort. %" }], tasaRef: true },
  { tipo: "soberano", label: "Soberano (USD)",     curva: "soberanos", cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }] },
  { tipo: "dolar_linked", label: "Dólar Linked",   curva: "dolar_linked", cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }] },
];

interface BonoSinFlujo { unidad: string; ticker: string | null; cartera: string; emisor: string | null; fuente: string; accion: string; motivo: string; en_cartera: boolean }
interface BonoMaster { ticker_corto: string; ticker?: string; curva?: string; tipo?: string; moneda_flujo?: string; fecha_emision?: string; fecha_vencimiento?: string; valor_nominal?: number; cer_emision?: number; cupon_anual?: number; tasa_referencia?: string; flujo_vencimiento?: number; flujos?: Record<string, unknown>[];
  // Estos SEIS no vienen del blob `data` como el resto: son COLUMNAS, y el
  // backend los mergea encima en `list_bonos`. Sin ellos el form cargaría la
  // clasificación vacía y guardar un bono se la borraría, sacándolo de su tabla
  // sin un solo error.
  emisor?: string; emisor_tipo?: string; moneda_eje?: string; ajuste?: string; ajuste_alt?: string; ley?: string }
interface BonoPrefill { ticker_corto: string; ticker?: string; curva?: string; editTicker?: string }

interface ConcilResp { total: number; en_cartera: number; ok: boolean; por_fuente?: { curvas: number; on: number; ninguna: number }; titulos: BonoSinFlujo[] }

function TabBonosControl({ onDarDeAlta }: { onDarDeAlta: (b: BonoSinFlujo) => void }) {
  const [data, setData] = useState<ConcilResp | null>(null);
  const [loading, setLoading] = useState(false);
  // Bonos ignorados (ocultados del gap) — para poder revertir un ignore por error.
  const [ignoradas, setIgnoradas] = useState<{ ticker: string; ignorado_por?: string; at?: string }[]>([]);
  // Solapa: el gap (sin flujo) o los ignorados — separados para que la lista de
  // ignorados no crezca hacia abajo empujando el conciliador (pedido del user).
  const [vista, setVista] = useState<"gap" | "ignorados">("gap");
  const cargarIgnoradas = () => fetch("/api/manager/ons/ignoradas").then(r => r.json()).then(d => setIgnoradas(d.ignoradas || [])).catch(() => {});
  const cargar = () => { setLoading(true); fetch("/api/manager/bonos/sin-flujo").then(r => r.json()).then(setData).finally(() => setLoading(false)); cargarIgnoradas(); };
  useEffect(() => { let alive = true; fetch("/api/manager/bonos/sin-flujo").then(r => r.json()).then(d => { if (alive) setData(d); }).catch(() => {}); cargarIgnoradas(); return () => { alive = false; }; }, []);
  const ignorar = async (ticker: string | null) => {
    if (!ticker) return;
    await fetch("/api/manager/ons/ignorar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }) }).catch(() => {});
    cargar();
  };
  const restaurar = async (ticker: string) => {
    await fetch(`/api/manager/ons/ignorar?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" }).catch(() => {});
    cargar();
  };
  const pf = data?.por_fuente;
  return (
    <div className="h-full overflow-auto p-3">
      {/* Solapas: Sin flujo (el gap) · Ignorados (en su propia vista) */}
      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => setVista("gap")}
          className={"px-2 py-0.5 text-[10px] font-semibold " + (vista === "gap" ? "bg-[#094293] text-white" : "border border-[var(--t-border)] text-[var(--t-text-muted)]")}>
          Sin flujo{data ? ` (${data.total})` : ""}
        </button>
        <button type="button" onClick={() => setVista("ignorados")}
          className={"px-2 py-0.5 text-[10px] font-semibold " + (vista === "ignorados" ? "bg-[#094293] text-white" : "border border-[var(--t-border)] text-[var(--t-text-muted)]")}>
          Ignorados ({ignoradas.length})
        </button>
        <button type="button" onClick={cargar} className={_onInput + " w-auto ml-1"}>↻</button>
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">…</span>}
      </div>

      {vista === "gap" && (<>
      <div className="flex items-center gap-3 mb-2 text-[11px]">
        <span className="text-[var(--t-text-dim)]">
          {data ? <>Faltan/incompletos: <span className="text-amber-500 font-semibold">{data.total}</span> · en cartera: <span className="text-red-500 font-semibold">{data.en_cartera}</span>{pf ? <> · Renta Fija {pf.curvas} · ONs {pf.on} · nuevos {pf.ninguna}</> : null}</> : "cargando…"}
        </span>
      </div>
      <table>
        <thead><tr><th>Cart</th><th>Unidad</th><th>Ticker</th><th>Hoy</th><th>Fuente</th><th>Motivo</th><th></th></tr></thead>
        <tbody>
          {(data?.titulos || []).map((t) => (
            <tr key={t.unidad}>
              <td>{t.cartera}</td>
              <td className="text-[var(--t-accent)]">{t.unidad}</td>
              <td className="font-mono">{t.ticker ?? "—"}</td>
              <td className="text-center">{t.en_cartera ? "🔴" : "·"}</td>
              <td className="text-[10px] uppercase text-[var(--t-text-dim)]">{t.fuente}</td>
              <td className="text-[10px] text-[var(--t-text-dim)]">{t.motivo}</td>
              <td className="whitespace-nowrap">
                <button type="button" onClick={() => onDarDeAlta(t)} className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#094293] text-white mr-1">{t.fuente === "ninguna" ? "dar de alta" : "editar"}</button>
                <button type="button" onClick={() => ignorar(t.ticker)} className="px-1.5 py-0.5 text-[10px] text-[var(--t-text-muted)] border border-[var(--t-border)]">ignorar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.ok && <p className="text-[11px] text-emerald-500 mt-2">✓ Todo lo de cartera ARS/DL/HD tiene flujo cargado.</p>}
      </>)}

      {/* Ignorados — su propia solapa. "restaurar" los vuelve a mostrar en el conciliador. */}
      {vista === "ignorados" && (
        ignoradas.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Ninguno ignorado. Los que saques del conciliador con “ignorar” aparecen acá para poder restaurarlos.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 content-start">
            {ignoradas.map((g) => (
              <span key={g.ticker} className="inline-flex items-center gap-1.5 border border-[var(--t-border-2)] px-2 py-0.5 text-[10px]">
                <span className="font-mono text-[var(--t-text)]">{g.ticker}</span>
                {g.at && <span className="text-[var(--t-text-muted)]">{g.at.slice(0, 10)}</span>}
                <button type="button" onClick={() => restaurar(g.ticker)} title="Volver a mostrar en el conciliador"
                  className="text-[var(--t-accent)] hover:underline">restaurar</button>
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function TabBonosAlta({ prefill, onSaved }: { prefill?: BonoPrefill | null; onSaved?: () => void }) {
  const tipoFromCurva = (c?: string) => c === "cer" ? "cer" : c === "soberanos" ? "soberano" : c === "tamar" ? "dual" : c === "dolar_linked" ? "dolar_linked" : "lecap";
  const [tipo, setTipo] = useState(prefill ? tipoFromCurva(prefill.curva) : "lecap");
  const cfg = BONO_TIPOS.find((t) => t.tipo === tipo) || BONO_TIPOS[0];
  const empty = { ticker_corto: "", tkCode: "", moneda_flujo: "ARS", fecha_emision: "", fecha_vencimiento: "", valor_nominal: "100", cer_emision: "", cupon_anual: "0", tasa_referencia: "TAMAR", flujo_vencimiento: "",
    // EJES — deciden en QUÉ TABLA de /renta-fija cae el bono. Hasta que fueron
    // editables (2026-08-16) los escribía solo un script, así que un bono cargado
    // desde acá nacía invisible para la vista. Vacío = sin clasificar, que es un
    // estado válido y que la vista MUESTRA como pendiente (no lo esconde).
    emisor: "", emisor_tipo: "", moneda_eje: "", ajuste: "", ajuste_alt: "", ley: "" };
  const [form, setForm] = useState({ ...empty, ...(prefill ? { ticker_corto: prefill.ticker_corto || "", tkCode: prefill.ticker ? unwrapTicker(prefill.ticker) : (prefill.ticker_corto || "") } : {}) });
  const [flujos, setFlujos] = useState<Record<string, string>[]>([]);
  const [existentes, setExistentes] = useState<BonoMaster[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Subir/pegar Excel de flujos (reusa el parser de ONs; el backend devuelve la shape del tipo)
  const [flujosText, setFlujosText] = useState("");
  const [fileName, setFileName] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const puedePegar = !cfg.bullet && (tipo === "soberano" || tipo === "bono");

  useEffect(() => { let alive = true; fetch("/api/manager/bonos").then(r => r.json()).then((d: { bonos: BonoMaster[] }) => { if (alive) setExistentes(d.bonos || []); }).catch(() => {}); return () => { alive = false; }; }, []);

  const cargarExistente = (tc: string) => {
    const b = existentes.find((x) => x.ticker_corto === tc);
    if (!b) { setForm({ ...empty }); setFlujos([]); return; }
    setTipo(b.tipo && BONO_TIPOS.some((x) => x.tipo === b.tipo) ? b.tipo : tipoFromCurva(b.curva));
    setForm({
      ticker_corto: b.ticker_corto, tkCode: b.ticker ? unwrapTicker(b.ticker) : b.ticker_corto,
      moneda_flujo: (b.moneda_flujo || "ARS").toUpperCase(),
      fecha_emision: (b.fecha_emision || "").slice(0, 10), fecha_vencimiento: (b.fecha_vencimiento || "").slice(0, 10),
      valor_nominal: String(b.valor_nominal ?? 100), cer_emision: b.cer_emision != null ? String(b.cer_emision) : "",
      cupon_anual: b.cupon_anual != null ? String(b.cupon_anual) : "0", tasa_referencia: b.tasa_referencia || "TAMAR",
      emisor: b.emisor || "", emisor_tipo: b.emisor_tipo || "", moneda_eje: b.moneda_eje || "",
      ajuste: b.ajuste || "", ajuste_alt: b.ajuste_alt || "", ley: b.ley || "",
      flujo_vencimiento: b.flujo_vencimiento != null ? String(b.flujo_vencimiento) : "",
    });
    setFlujos((b.flujos || []).map((f) => {
      const row: Record<string, string> = { fecha: String(f.fecha ?? "") };
      ["amortizacion", "interes", "valor_residual", "amortizacion_pct", "cupon_sobre_residual", "residual_previo_pct", "cupon_anual"]
        .forEach((k) => { if (f[k] != null) row[k] = String(f[k]); });
      return row;
    }));
    setMsg(null);
  };
  const setCell = (i: number, k: string, v: string) => setFlujos((fs) => fs.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Auto-carga al llegar desde el LISTADO con "editar": una vez que están los
  // existentes, cargo ese bono en el form (una sola vez, vía ref). setTimeout(0)
  // para no setear estado sincrónicamente dentro del effect.
  const editLoadedRef = useRef(false);
  useEffect(() => {
    const et = prefill?.editTicker;
    if (!et || editLoadedRef.current || !existentes.some((b) => b.ticker_corto === et)) return;
    editLoadedRef.current = true;
    const id = setTimeout(() => cargarExistente(et), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existentes, prefill]);

  const guardar = async () => {
    if (!form.ticker_corto.trim()) { setMsg({ kind: "err", text: "Falta el ticker corto" }); return; }
    setSaving(true); setMsg(null);
    const body: Record<string, unknown> = {
      ticker_corto: form.ticker_corto.trim(),
      ticker: wrapTicker(form.tkCode || form.ticker_corto),
      curva: cfg.curva, tipo,
      moneda_flujo: form.moneda_flujo || undefined,
      fecha_emision: form.fecha_emision || undefined,
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      valor_nominal: form.valor_nominal ? _onNum(form.valor_nominal) : undefined,
      emisor: form.emisor.trim() || undefined,
      // Los ejes viajan SIEMPRE, incluso vacíos: `undefined` los saca del JSON y
      // el backend no los tocaría, así que no habría forma de LIMPIAR uno mal
      // cargado. `""` es la señal explícita de borrar.
      emisor_tipo: form.emisor_tipo, moneda_eje: form.moneda_eje,
      ajuste: form.ajuste, ajuste_alt: form.ajuste_alt, ley: form.ley,
    };
    if (cfg.cer) body.cer_emision = form.cer_emision ? _onNum(form.cer_emision) : undefined;
    if (cfg.cupon) body.cupon_anual = form.cupon_anual !== "" ? _onNum(form.cupon_anual) : undefined;
    if (cfg.tasaRef) body.tasa_referencia = form.tasa_referencia || undefined;
    if (cfg.bullet) {
      body.flujo_vencimiento = form.flujo_vencimiento ? _onNum(form.flujo_vencimiento) : undefined;
    } else {
      const rows = flujos.filter((r) => r.fecha).map((r) => {
        const o: Record<string, unknown> = { fecha: r.fecha };
        (cfg.cols || []).forEach((c) => { if (r[c.k] != null && r[c.k] !== "") o[c.k] = _onNum(r[c.k]); });
        return o;
      });
      body.flujos = rows.length ? rows : undefined;
    }
    try {
      const r = await fetch("/api/manager/bonos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const txt = await r.text(); let d: { detail?: string } = {}; try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Guardado en Curvas." });
      fetch("/api/manager/bonos").then((x) => x.json()).then((d2: { bonos: BonoMaster[] }) => setExistentes(d2.bonos || [])).catch(() => {});
      onSaved?.();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  const borrar = async () => {
    const tc = form.ticker_corto.trim();
    if (!tc) return;
    if (!window.confirm(`¿Dar de baja ${tc}? Se elimina de Curvas → deja de figurar en Renta Fija.`)) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/manager/bonos?ticker_corto=${encodeURIComponent(tc)}`, { method: "DELETE" });
      const txt = await r.text(); let d: { detail?: string } = {}; try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: `${tc} dado de baja.` });
      setForm({ ...empty }); setFlujos([]);
      fetch("/api/manager/bonos").then((x) => x.json()).then((d2: { bonos: BonoMaster[] }) => setExistentes(d2.bonos || [])).catch(() => {});
      onSaved?.();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  // Pega las filas del Excel → el backend las devuelve en la shape del tipo → tabla.
  const parsearFlujos = async (texto: string) => {
    if (!texto.trim()) return;
    try {
      const r = await fetch("/api/manager/bonos/parse-flujos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, tipo }),
      });
      const d: { flujos?: Record<string, unknown>[]; vencimiento?: string | null; formato?: string; error?: string } = await r.json();
      const rows = (d.flujos || []).map((f) => {
        const row: Record<string, string> = { fecha: String(f.fecha ?? "") };
        (cfg.cols || []).forEach((c) => { if (f[c.k] != null) row[c.k] = String(f[c.k]); });
        return row;
      });
      setFlujos(rows);
      if (d.vencimiento && !form.fecha_vencimiento) setForm((s) => ({ ...s, fecha_vencimiento: d.vencimiento as string }));
      setParseMsg(d.error ? `error: ${d.error}` : rows.length ? `${rows.length} flujos · ${d.formato || ""}` : "no se detectaron flujos");
    } catch (e) { setParseMsg(e instanceof Error ? e.message : "error al parsear"); }
  };

  // "Examinar archivo": lee el .xlsx/.xls/.csv REAL (SheetJS lazy) → lo pasa a
  // texto tabulado y lo manda al parser (mismo flujo que "pegar", pero desde archivo).
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const tsv = await readSheetTsv(file);
      setFlujosText(tsv);
      await parsearFlujos(tsv);
    } catch (err) { setParseMsg(err instanceof Error ? err.message : "no pude leer el archivo"); }
    e.target.value = "";  // permite volver a elegir el mismo archivo
  };

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Editar existente</span>
        <select className={_onInput + " w-auto"} value={form.ticker_corto} onChange={(e) => cargarExistente(e.target.value)}>
          <option value="">— nuevo bono —</option>
          {existentes.map((b) => <option key={b.ticker_corto} value={b.ticker_corto}>{b.ticker_corto} · {b.tipo || b.curva}</option>)}
        </select>
        {form.ticker_corto.trim() && (
          <button type="button" onClick={borrar} disabled={saving} className="px-2 py-1 text-[10px] font-semibold bg-red-600 text-white disabled:opacity-50" title="Eliminar este bono de Curvas">
            DAR DE BAJA
          </button>
        )}
      </div>

      <OnField label="Tipo de bono — define los campos y la shape del flujo">
        <select className={_onInput} value={tipo} onChange={(e) => { setTipo(e.target.value); setFlujos([]); setFlujosText(""); setParseMsg(null); }}>
          {BONO_TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
        </select>
      </OnField>

      <div className="grid grid-cols-4 gap-2">
        <OnField label="Ticker corto"><input className={_onInput} value={form.ticker_corto} onChange={(e) => setForm({ ...form, ticker_corto: e.target.value.toUpperCase() })} placeholder="TX26" /></OnField>
        <OnField label="Ticker ROFEX (código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkCode} onChange={(e) => setForm({ ...form, tkCode: e.target.value.toUpperCase() })} placeholder="TX26" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
        <OnField label="Moneda flujo"><select className={_onInput} value={form.moneda_flujo} onChange={(e) => setForm({ ...form, moneda_flujo: e.target.value })}><option value="ARS">ARS</option><option value="USD">USD</option></select></OnField>
        <OnField label="Valor nominal"><input className={_onInput} value={form.valor_nominal} onChange={(e) => setForm({ ...form, valor_nominal: e.target.value })} placeholder="100" /></OnField>
        <OnField label="Fecha emisión"><input type="date" className={_onInput} value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} /></OnField>
        <OnField label="Vencimiento"><input type="date" className={_onInput} value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} /></OnField>
        {cfg.cer && <OnField label="CER emisión"><input className={_onInput} value={form.cer_emision} onChange={(e) => setForm({ ...form, cer_emision: e.target.value })} placeholder="659.6789" /></OnField>}
        {cfg.cupon && <OnField label="Cupón anual"><input className={_onInput} value={form.cupon_anual} onChange={(e) => setForm({ ...form, cupon_anual: e.target.value })} placeholder="0" /></OnField>}
        {cfg.tasaRef && <OnField label="Tasa referencia"><input className={_onInput} value={form.tasa_referencia} onChange={(e) => setForm({ ...form, tasa_referencia: e.target.value })} placeholder="TAMAR" /></OnField>}
      </div>

      {/* EJES — es lo que decide en qué TABLA de /renta-fija aparece el bono.
          Van aparte y rotulados porque son la parte que se olvidaba: sin ellos el
          bono se guarda bien y no se ve en ningún lado. */}
      <div className="mt-2 pt-2 border-t border-[var(--t-border)]">
        <div className="text-[10px] uppercase tracking-wide text-[var(--t-text-2)] mb-1">
          Clasificación — decide en qué tabla de RENTA FIJA aparece
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <OnField label="Emisor"><input className={_onInput} value={form.emisor} onChange={(e) => setForm({ ...form, emisor: e.target.value })} placeholder="Argentina" /></OnField>
          <OnField label="Tipo de emisor">
            <select className={_onInput} value={form.emisor_tipo} onChange={(e) => setForm({ ...form, emisor_tipo: e.target.value })}>
              <option value="">— sin clasificar —</option>
              {EJE_EMISORES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </OnField>
          <OnField label="Moneda">
            <select className={_onInput} value={form.moneda_eje} onChange={(e) => setForm({ ...form, moneda_eje: e.target.value })}>
              <option value="">— sin clasificar —</option>
              {EJE_MONEDAS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </OnField>
          <OnField label="Ajuste">
            <select className={_onInput} value={form.ajuste} onChange={(e) => setForm({ ...form, ajuste: e.target.value })}>
              <option value="">— sin clasificar —</option>
              {EJE_AJUSTES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </OnField>
          <OnField label="2ª pata (solo duales)">
            <select className={_onInput} value={form.ajuste_alt} onChange={(e) => setForm({ ...form, ajuste_alt: e.target.value })}>
              <option value="">— no es dual —</option>
              {EJE_AJUSTES.filter((v) => v !== form.ajuste).map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </OnField>
          <OnField label="Ley">
            <select className={_onInput} value={form.ley} onChange={(e) => setForm({ ...form, ley: e.target.value })}>
              <option value="">— sin dato —</option>
              <option value="local">local (Bonar)</option>
              <option value="ny">ny (Global)</option>
            </select>
          </OnField>
        </div>
        <div className="text-[10px] text-[var(--t-text-2)] mt-1">
          {form.ajuste_alt
            ? `Dual: va a aparecer en la tabla de ${form.ajuste} Y en la de ${form.ajuste_alt}.`
            : "Un dual tiene DOS patas: cargá la segunda y el bono aparece en las dos tablas."}
        </div>
      </div>

      {cfg.bullet ? (
        <OnField label="Flujo de vencimiento (por 100 VN, pago único al vto — Lecap/Boncap)">
          <input className={_onInput} value={form.flujo_vencimiento} onChange={(e) => setForm({ ...form, flujo_vencimiento: e.target.value })} placeholder="135.278" />
        </OnField>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">Flujos{puedePegar ? " — subí el Excel (BYMA/IAMC) o cargá a mano" : ` (carga manual, shape ${tipo})`}</span>
            <button type="button" onClick={() => setFlujos((fs) => [...fs, { fecha: "" }])} className="px-2 py-0.5 text-[10px] font-semibold bg-[#094293] text-white">+ fila</button>
            {puedePegar && (
              <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-[#094293] text-white cursor-pointer hover:opacity-90">
                📁 examinar archivo
                <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} className="hidden" />
              </label>
            )}
            {puedePegar && fileName && <span className="text-[10px] text-[var(--t-text)] truncate max-w-[200px]" title={fileName}>{fileName}</span>}
            {puedePegar && (
              <button type="button" onClick={() => setShowPaste((v) => !v)} className="px-2 py-0.5 text-[10px] border border-[var(--t-border)]">
                {showPaste ? "ocultar" : "o pegar"}
              </button>
            )}
            {(flujos.length > 0 || flujosText) && (
              <button type="button" onClick={() => { setFlujos([]); setFlujosText(""); setFileName(""); setParseMsg(null); }} className="px-2 py-0.5 text-[10px] text-red-500 border border-[var(--t-border)]">limpiar</button>
            )}
          </div>
          {puedePegar && showPaste && (
            <textarea
              className={_onInput + " h-20 font-mono text-[10px] mb-1"}
              placeholder="Pegá las filas del Excel (BYMA/IAMC 'Flujo de fondos c/100 vn', o simple: fecha ⭾ amort ⭾ interés/cupón ⭾ residual)."
              value={flujosText}
              onChange={(e) => setFlujosText(e.target.value)}
              onBlur={() => parsearFlujos(flujosText)}
            />
          )}
          {puedePegar && parseMsg && <div className="text-[10px] text-[var(--t-text-muted)] mb-1">{parseMsg}</div>}
          <div className="max-h-52 overflow-auto border border-[var(--t-border)]">
            <table>
              <thead><tr><th>Fecha</th>{(cfg.cols || []).map((c) => <th key={c.k} className="text-right">{c.label}</th>)}<th></th></tr></thead>
              <tbody>
                {flujos.map((r, i) => (
                  <tr key={i}>
                    <td><input type="date" className={_onInput} value={r.fecha || ""} onChange={(e) => setCell(i, "fecha", e.target.value)} /></td>
                    {(cfg.cols || []).map((c) => <td key={c.k}><input className={_onInput + " text-right"} value={r[c.k] || ""} onChange={(e) => setCell(i, c.k, e.target.value)} placeholder="0" /></td>)}
                    <td className="text-center"><button type="button" onClick={() => setFlujos((fs) => fs.filter((_, j) => j !== i))} className="text-red-500 px-1">×</button></td>
                  </tr>
                ))}
                {flujos.length === 0 && <tr><td colSpan={(cfg.cols?.length || 0) + 2} className="text-[10px] text-[var(--t-text-dim)] p-2">Sin flujos — agregá filas con &quot;+ fila&quot;.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving} className="px-3 py-1 text-[11px] font-semibold bg-[#094293] text-white disabled:opacity-50">{saving ? "Guardando…" : "GUARDAR BONO"}</button>
        {msg && <span className={"text-[11px] " + (msg.kind === "ok" ? "text-emerald-500" : "text-red-500")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-[var(--t-text-muted)]">Guarda el bono con la estructura del tipo elegido. Puede tardar unos minutos en cotizar en vivo (precio/TEA).</p>
    </div>
  );
}

interface TituloPrefill { codigo: string; ticker?: string | null; destino: "curvas" | "ons"; curva?: string; emisor?: string | null; moneda?: string; edit?: boolean }

// Editor UNIFICADO: elegís el TIPO de título (Renta Fija = soberano/CER/tasa fija · ONs).
// AMBOS viven en la MISMA base SQL `mercado.curvas` (BondsMaster fue retirado); solo
// cambian los campos del form y el endpoint. Te marca si ya está cargado. El conciliador
// entra acá directo con el tipo preseleccionado (Renta Fija si ya está como bono; ONs si
// es ON/nuevo).
function TabAltaTitulo({ prefill, onSaved }: { prefill?: TituloPrefill | null; onSaved?: () => void }) {
  const [destino, setDestino] = useState<"curvas" | "ons">(prefill?.destino ?? "curvas");
  const [bonos, setBonos] = useState<BonoMaster[]>([]);
  const [ons, setOns] = useState<ONMaster[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/bonos").then((r) => r.json()).then((d: { bonos: BonoMaster[] }) => { if (alive) setBonos(d.bonos || []); }).catch(() => {});
    fetch("/api/manager/ons").then((r) => r.json()).then((d: { ons: ONMaster[] }) => { if (alive) setOns(d.ons || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const code = (prefill?.codigo || "").toUpperCase();
  const enCurvas = !!code && bonos.some((b) => (b.ticker_corto || "").toUpperCase() === code);
  const enBm = !!code && ons.some((o) => (o.asset || "").toUpperCase() === code);
  const bonoPrefill: BonoPrefill | null = prefill ? { ticker_corto: prefill.codigo, ticker: prefill.ticker ?? undefined, curva: prefill.curva || "tasa_fija", editTicker: prefill.edit ? prefill.codigo : undefined } : null;
  const onPrefill: ONPrefill | null = prefill ? { asset: prefill.codigo, emisor: prefill.emisor ?? "", moneda_flujo: prefill.moneda === "DL" ? "DL" : (prefill.moneda || "USD") } : null;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex-wrap">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Tipo de título</span>
        <Pill label="Renta Fija" active={destino === "curvas"} onClick={() => setDestino("curvas")} />
        <Pill label="ONs" active={destino === "ons"} onClick={() => setDestino("ons")} />
        {code && (
          <span className="text-[10px] ml-2 text-[var(--t-text-dim)]">
            {code}:{" "}
            {enCurvas ? <span className="text-emerald-500 font-semibold">✓ ya cargado (Renta Fija) </span> : null}
            {enBm ? <span className="text-emerald-500 font-semibold">✓ ya cargado (ON) </span> : null}
            {!enCurvas && !enBm ? <span className="text-amber-500 font-semibold">nuevo (no está cargado)</span> : null}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {destino === "curvas"
          ? <TabBonosAlta prefill={bonoPrefill} onSaved={onSaved} />
          : <TabOnsAlta prefill={onPrefill} onSaved={onSaved} />}
      </div>
    </div>
  );
}

// LISTADO: toda la base de bonos (mercado.curvas no-ON) como grilla buscable, con
// sus flujos expandibles y detección de incompletos (sin flujo / sin vto). Es "ver
// la base de datos" desde el front: buscar, revisar qué falta, editar o dar de baja.
function bonoFlujoResumen(b: BonoMaster): { txt: string; falta: boolean } {
  if (b.flujo_vencimiento != null) return { txt: `bullet ${b.flujo_vencimiento}`, falta: false };
  const n = b.flujos?.length || 0;
  if (n > 0) return { txt: `${n} flujos`, falta: false };
  return { txt: "sin flujo", falta: true };
}

function FlujosMini({ flujos }: { flujos: Record<string, unknown>[] }) {
  const cols = Array.from(new Set(flujos.flatMap((f) => Object.keys(f)))).filter((k) => k !== "fecha");
  return (
    <table className="w-full">
      <thead><tr><th>Fecha</th>{cols.map((c) => <th key={c} className="text-right">{c}</th>)}</tr></thead>
      <tbody>
        {flujos.map((f, i) => (
          <tr key={i}>
            <td className="tabular-nums">{String(f.fecha ?? "").slice(0, 10)}</td>
            {cols.map((c) => <td key={c} className="tabular-nums text-right">{f[c] != null ? String(f[c]) : ""}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabBonosListado({ onEditar }: { onEditar: (tc: string) => void }) {
  const [bonos, setBonos] = useState<BonoMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [curvaF, setCurvaF] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchBonos = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/bonos").then((r) => r.json())
      .then((d: { bonos: BonoMaster[] }) => setBonos(d.bonos || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/bonos").then((r) => r.json())
      .then((d: { bonos: BonoMaster[] }) => { if (alive) setBonos(d.bonos || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const borrar = async (tc: string) => {
    if (!window.confirm(`¿Dar de baja ${tc}? Se elimina de Curvas → deja de figurar en Renta Fija.`)) return;
    setBusy((b) => ({ ...b, [tc]: true }));
    try {
      const r = await fetch(`/api/manager/bonos?ticker_corto=${encodeURIComponent(tc)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBonos((prev) => prev.filter((x) => x.ticker_corto !== tc));
    } catch { /* noop */ } finally { setBusy((b) => ({ ...b, [tc]: false })); }
  };

  const ql = q.trim().toLowerCase();
  const filtered = bonos
    .filter((b) => (!curvaF || b.curva === curvaF)
      && (!ql || [b.ticker_corto, b.ticker, b.tipo, b.curva].some((v) => (v || "").toLowerCase().includes(ql))))
    .sort((a, b) => (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999"));
  const curvasSet = Array.from(new Set(bonos.map((b) => b.curva).filter(Boolean))) as string[];
  const nFalta = filtered.filter((b) => bonoFlujoResumen(b).falta || !b.fecha_vencimiento).length;

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input className={_onInput + " w-48"} placeholder="buscar ticker / tipo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={_onInput + " w-auto"} value={curvaF} onChange={(e) => setCurvaF(e.target.value)}>
          <option value="">todas las curvas</option>
          {curvasSet.sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-[var(--t-text-dim)]">{filtered.length} bonos · {nFalta} incompletos</span>
        <button type="button" onClick={fetchBonos} className={_onInput + " w-auto"}>↻</button>
      </div>
      <table>
        <thead><tr><th>Ticker</th><th>ROFEX</th><th>Curva</th><th>Tipo</th><th>Vto</th><th>Mon</th><th className="text-right">VN</th><th className="text-right">Cupón</th><th>Flujo</th><th></th></tr></thead>
        <tbody>
          {filtered.map((b) => {
            const fl = bonoFlujoResumen(b);
            const sinVto = !b.fecha_vencimiento;
            const open = expanded === b.ticker_corto;
            return (
              <Fragment key={b.ticker_corto}>
                <tr className={fl.falta || sinVto ? "bg-red-500/10" : ""}>
                  <td className="font-semibold">{b.ticker_corto}</td>
                  <td className="text-[10px] text-[var(--t-text-dim)]">{b.ticker ? unwrapTicker(b.ticker) : "--"}</td>
                  <td>{b.curva || "--"}</td>
                  <td>{b.tipo || "--"}</td>
                  <td className={"tabular-nums " + (sinVto ? "text-red-500 font-semibold" : "")}>{sinVto ? "⚠️ sin vto" : (b.fecha_vencimiento || "").slice(0, 10)}</td>
                  <td>{b.moneda_flujo || "--"}</td>
                  <td className="tabular-nums text-right">{b.valor_nominal ?? "--"}</td>
                  <td className="tabular-nums text-right">{b.cupon_anual ?? "--"}</td>
                  <td>
                    <button type="button" onClick={() => setExpanded(open ? null : b.ticker_corto)} className={fl.falta ? "text-red-500 font-semibold" : "text-[var(--t-accent)]"} title="Ver flujos">
                      {fl.falta ? "⚠️ sin flujo" : `${fl.txt} ${open ? "▴" : "▾"}`}
                    </button>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => onEditar(b.ticker_corto)} className={_onInput + " w-auto text-[10px] mr-1"}>editar</button>
                    <button type="button" disabled={busy[b.ticker_corto]} onClick={() => borrar(b.ticker_corto)} className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white disabled:opacity-50">baja</button>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={10} className="bg-[var(--t-panel)] p-2">
                      {b.flujos?.length
                        ? <FlujosMini flujos={b.flujos} />
                        : <span className="text-[10px] text-[var(--t-text-dim)]">{b.flujo_vencimiento != null ? `Bullet: paga ${b.flujo_vencimiento} por 100 VN al vencimiento.` : "Sin flujos cargados."}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {loading && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">cargando…</p>}
      {!loading && filtered.length === 0 && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">Sin bonos para ese filtro.</p>}
    </div>
  );
}

// Un cuadrante del panel unificado de bonos: header + cuerpo con scroll propio.
function QuadPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] text-[10px] font-semibold tracking-widest text-[var(--t-text-muted)] uppercase bg-[var(--t-surface)]">
        {title}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

// Cuadrante "errores de tasa": bonos con precio pero sin TEA (los "--"). Lista +
// botón para recalcular (job backfill_tasas) y refrescar. El "por qué" de cada uno
// se ve en VALIDACIONES → DEBUG TEA.
function BonosErroresPanel({ reloadKey }: { reloadKey: number }) {
  interface Fila { ticker_corto: string; ticker: string; curva: string; fecha_vencimiento: string; last_price: number }
  const [data, setData] = useState<{ total: number; ok: boolean; bonos: Fila[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalc, setRecalc] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/bonos/sin-tasa", { cache: "no-store" })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  const recalcular = async () => {
    setRecalc("Recalculando…");
    try {
      const start = await fetch("/api/manager/jobs/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "backfill_tasas" }),
      }).then(r => r.json());
      const jobId = start?.job_id;
      if (!jobId) { setRecalc("No se pudo lanzar (¿sin permiso?)."); return; }
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 2000));
        const job = await fetch(`/api/manager/jobs/${jobId}`, { cache: "no-store" }).then(r => r.json());
        if (job?.status && job.status !== "running") {
          setRecalc(job.result || `status=${job.status}`); load(); return;
        }
      }
      setRecalc("Timeout (ver JOBS).");
    } catch (e) { setRecalc(`Error: ${String(e)}`); }
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={load} disabled={loading}
          className="px-2 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "…" : "↻ Refrescar"}
        </button>
        <button onClick={recalcular}
          className="px-2 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors">
          ▶ Recalcular tasas
        </button>
        {data && <StatusBadge ok={data.ok} label={data.ok ? "Todos con tasa" : `${data.total} sin TEA`} />}
      </div>
      {data && data.bonos.length > 0 && (
        <table className="w-full text-[10px]">
          <thead><tr className="text-[var(--t-text-muted)] text-left">
            <th className="py-0.5">TICKER</th><th>CURVA</th><th>VTO</th><th className="text-right">PRECIO</th>
          </tr></thead>
          <tbody>
            {data.bonos.map(b => (
              <tr key={b.ticker_corto} className="border-t border-[var(--t-border)]">
                <td className="py-0.5 text-[var(--t-text)] font-semibold">{b.ticker_corto}</td>
                <td className="text-[var(--t-text-muted)]">{b.curva}</td>
                <td className="text-[var(--t-text-muted)]">{d10(b.fecha_vencimiento)}</td>
                <td className="text-right text-[var(--t-text)]">{b.last_price?.toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {recalc && (
        <pre className="text-[9px] text-[var(--t-text-muted)] whitespace-pre-wrap bg-[var(--t-surface)] border border-[var(--t-border)] p-2 mt-2 max-h-32 overflow-y-auto">{recalc}</pre>
      )}
      <div className="text-[9px] text-[var(--t-text-muted)] mt-2 leading-relaxed">
        El detalle del porqué de cada &quot;--&quot; está en VALIDACIONES → DEBUG TEA (por ticker).
      </div>
    </div>
  );
}

// Vista unificada de bonos: 4 cuadrantes (ver/editar · agregar · conciliar · errores).
function TabBonos() {
  const [prefill, setPrefill] = useState<TituloPrefill | null>(null);
  const [prefillKey, setPrefillKey] = useState(0);
  const [dataKey, setDataKey] = useState(0);   // remonta listado/conciliador/errores tras guardar

  const darDeAlta = (b: BonoSinFlujo) => {
    const destino = b.accion === "editar_on" ? "ons" : "curvas";
    setPrefill({
      codigo: b.ticker || b.unidad, ticker: b.ticker, destino,
      curva: b.cartera === "ARS" ? "tasa_fija" : "soberanos",
      emisor: b.emisor, moneda: b.cartera,
    });
    setPrefillKey((k) => k + 1);
  };
  const editarBono = (tc: string) => {
    setPrefill({ codigo: tc, destino: "curvas", edit: true });
    setPrefillKey((k) => k + 1);
  };
  const onSaved = () => { setDataKey((k) => k + 1); };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2 p-2 min-h-0">
      <QuadPanel title="Ver / editar bonos">
        <TabBonosListado key={`list-${dataKey}`} onEditar={editarBono} />
      </QuadPanel>
      <QuadPanel title="Agregar / editar">
        <TabAltaTitulo key={`alta-${prefillKey}`} prefill={prefill} onSaved={onSaved} />
      </QuadPanel>
      <QuadPanel title="Conciliar — títulos sin flujo">
        <TabBonosControl key={`conc-${dataKey}`} onDarDeAlta={darDeAlta} />
      </QuadPanel>
      <QuadPanel title="Errores de tasa — bonos sin TEA">
        <BonosErroresPanel reloadKey={dataKey} />
      </QuadPanel>
    </div>
  );
}

// ── Sub-tab: Renta Variable (CEDEARs — rubro + es_ia) ─────────────────────────
// Editor en grilla del catálogo de clasificación de CEDEARs. Espejo de la
// segmentación de clientes: el `rubro` NO se escribe libre — se elige del
// catálogo (/rubros) o se crea con POST /rubro. PATCH inmediato por fila.
// Endpoints (SQL-native, gate manager_titulos):
//   GET   /api/manager/renta-variable          → grid de CEDEARs
//   GET   /api/manager/renta-variable/rubros    → catálogo de rubros (dropdown)
//   POST  /api/manager/renta-variable/rubro     → crear rubro
//   PATCH /api/manager/renta-variable           → setear rubro/es_ia de un CEDEAR
interface CedearRow {
  ticker: string;            // ticker BYMA completo (PK)
  ticker_corto: string;
  underlying: string | null;
  activo: boolean | null;
  rubro: string | null;
  es_ia: boolean | null;
  ric: string | null;        // identidad Refinitiv del subyacente (ej. AAPL.O)
  ratio: number | null;      // CEDEARs por acción (ej. AAPL 10:1 → 10), para el CCL implícito
  nombre: string | null;
}
interface RubroRow { rubro: string; es_ia_def: boolean }

function TabRentaVariable() {
  const [rows, setRows] = useState<CedearRow[]>([]);
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [q, setQ] = useState("");
  // Alta de rubro nuevo (input inline → POST /rubro)
  const [nuevoRubro, setNuevoRubro] = useState("");
  const [nuevoRubroIa, setNuevoRubroIa] = useState(false);
  const [creandoRubro, setCreandoRubro] = useState(false);
  const [rubroMsg, setRubroMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Borradores de los inputs RIC/RATIO por fila (se guardan al salir del campo / Enter).
  const [ricDrafts, setRicDrafts] = useState<Record<string, string>>({});
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({});

  const fetchCedears = () => {
    setLoading(true);
    setError(null);
    fetch("/api/manager/renta-variable", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: CedearRow[]) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const fetchRubros = () => {
    fetch("/api/manager/renta-variable/rubros", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: RubroRow[]) => setRubros(Array.isArray(d) ? d : []))
      .catch(() => { /* silencioso */ });
  };

  useEffect(() => { fetchCedears(); fetchRubros(); }, []);

  // Filtro en cliente por ticker / nombre / rubro (lista de ~70-160 filas).
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((c) =>
      (c.ticker_corto ?? "").toLowerCase().includes(t) ||
      (c.nombre ?? "").toLowerCase().includes(t) ||
      (c.underlying ?? "").toLowerCase().includes(t) ||
      (c.rubro ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  // PATCH inmediato (optimista) de un campo de la fila.
  const patchRow = async (c: CedearRow, patch: { rubro?: string | null; es_ia?: boolean; ric?: string | null; ratio?: number | null }) => {
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    // Optimista: aplicar local antes de la respuesta.
    setRows((prev) => prev.map((x) => (x.ticker === c.ticker ? { ...x, ...patch } : x)));
    try {
      const r = await fetch("/api/manager/renta-variable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: c.ticker, ...patch }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.ticker]: { kind: "idle" } })), 1500);
    } catch (e) {
      // Revertir el optimismo recargando del backend (estado real).
      fetchCedears();
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Borrar un CEDEAR del universo (deja de suscribirse). DELETE master Mongo + SQL.
  const borrarCedear = async (c: CedearRow) => {
    if (!window.confirm(
      `¿Sacar ${c.ticker_corto} del universo de Renta Variable?\n\n` +
      `Deja de suscribirse en el motor y se borra del master. ` +
      `Reversible solo volviéndolo a dar de alta.`)) return;
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/renta-variable?ticker=${encodeURIComponent(c.ticker)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRows((prev) => prev.filter((x) => x.ticker !== c.ticker));
    } catch (e) {
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const crearRubro = async () => {
    const rub = nuevoRubro.trim();
    if (!rub) return;
    setCreandoRubro(true);
    setRubroMsg(null);
    try {
      const r = await fetch("/api/manager/renta-variable/rubro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro: rub, es_ia_def: nuevoRubroIa }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setNuevoRubro("");
      setNuevoRubroIa(false);
      setRubroMsg({ ok: true, text: `Rubro "${rub}" creado.` });
      fetchRubros();
    } catch (e) {
      setRubroMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreandoRubro(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">RENTA VARIABLE</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{filtered.length} de {rows.length} CEDEARs</span>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar ticker, nombre o rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[210px]"
        />

        {/* Alta de rubro nuevo (igual que la segmentación: catálogo controlado). */}
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)] ml-2">+ CREAR RUBRO</span>
        <input
          value={nuevoRubro}
          onChange={(e) => setNuevoRubro(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") crearRubro(); }}
          placeholder="nombre del rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[150px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-muted)] cursor-pointer" title="Default es_ia del rubro nuevo">
          <input type="checkbox" checked={nuevoRubroIa} onChange={(e) => setNuevoRubroIa(e.target.checked)} />
          IA
        </label>
        <button onClick={crearRubro} disabled={creandoRubro || !nuevoRubro.trim()}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {creandoRubro ? "Creando…" : "+ Crear"}
        </button>

        <button onClick={fetchCedears} disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {rubroMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${rubroMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {rubroMsg.text}
          <button onClick={() => setRubroMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && filtered.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados.</div>}
        {filtered.length > 0 && (
          <table className="text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">TICKER</th>
                <th className="px-2 py-2">NOMBRE</th>
                <th className="px-2 py-2">UNDERLYING</th>
                <th className="px-2 py-2">RUBRO</th>
                <th className="px-2 py-2 text-center">ES IA</th>
                <th className="px-2 py-2" title="Identidad Refinitiv del subyacente (ej. AAPL.O) — la usan Research y el feed de precios en vivo">RIC</th>
                <th className="px-2 py-2" title="Ratio de conversión: cuántos CEDEARs equivalen a 1 acción (ej. 10). Insumo del CCL implícito.">RATIO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const state: RowState = rowState[c.ticker] || { kind: "idle" };
                return (
                  <tr key={c.ticker} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.ticker_corto}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[240px] truncate" title={c.nombre ?? ""}>{c.nombre ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)] whitespace-nowrap">{c.underlying ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.rubro ?? ""}
                        onChange={(e) => patchRow(c, { rubro: e.target.value || null })}
                        title={c.rubro ?? "sin rubro"}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[150px]"
                      >
                        <option value="">— sin rubro —</option>
                        {/* Si la fila tiene un rubro que ya no está en el catálogo, igual lo mostramos. */}
                        {c.rubro && !rubros.some((r) => r.rubro === c.rubro) && (
                          <option value={c.rubro}>{c.rubro}</option>
                        )}
                        {rubros.map((r) => (
                          <option key={r.rubro} value={r.rubro}>{r.rubro}{r.es_ia_def ? " (IA)" : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => patchRow(c, { es_ia: !c.es_ia })}
                        className={`px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                          c.es_ia
                            ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                            : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                        }`}
                      >
                        {c.es_ia ? "SÍ" : "NO"}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ricDrafts[c.ticker] ?? c.ric ?? ""}
                        onChange={(e) => setRicDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ricDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRicDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const val = draft.trim() || null;
                          if (val !== (c.ric ?? null)) patchRow(c, { ric: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="AAPL.O"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[90px]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ratioDrafts[c.ticker] ?? (c.ratio === null ? "" : String(c.ratio))}
                        onChange={(e) => setRatioDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ratioDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRatioDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const txt = draft.trim().replace(",", ".");
                          const val = txt === "" ? null : Number(txt);
                          if (val !== null && (!isFinite(val) || val <= 0)) {
                            setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: "ratio inválido (número > 0)" } }));
                            return;
                          }
                          if (val !== (c.ratio ?? null)) patchRow(c, { ratio: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="10"
                        inputMode="decimal"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] text-right focus:border-[var(--t-accent)] focus:outline-none w-[60px]"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved" && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error" && <span className="text-red-400 cursor-help" title={state.msg}>✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}</span>}
                      <button
                        onClick={() => borrarCedear(c)}
                        title="Sacar del universo (deja de suscribirse)"
                        className="ml-2 px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-red-400 hover:text-red-400 transition-colors"
                      >
                        🗑
                      </button>
                    </td>
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

// TÍTULOS: Instrumentos (solo lectura) + Assets + ONs + Bonos + Renta Variable
// (edición maestro). Gate fino: INSTRUMENTOS → manager_instrumentos;
// ASSETS/ONs/BONOS/RENTA VARIABLE → manager_titulos.
// Así asistente_comercial (manager_instrumentos) ve solo Instrumentos.
// BREAKEVENS: curaduría de pares Lecap↔CER, partida al 50%.
//
// IZQUIERDA — los pares. El motor los empareja solo (CER de vto más cercano) y a
// veces se equivoca (par con BE absurdo) o directamente no arma uno que interesa.
// Dos acciones, las dos con efecto instantáneo en Renta Fija sin tocar el motor:
//   · EXCLUIR un par malo → el reader lo filtra al leer.
//   · "+" AGREGAR un par manual (elegís Lecap y CER a mano) → el BE se calcula en
//     la lectura con la misma función del motor. Fila marcada ✎.
//
// DERECHA — el diagnóstico de cobertura: por qué CADA bono tasa_fija del master
// entra o no entra a la matriz. Es el mismo dato que imprime
// `scripts/diag_breakevens_cobertura.py` (los dos leen el mismo endpoint), para
// no tener que entrar al Droplet a contestar "¿por qué no aparece este bono?".
interface BePar {
  lecap: string;
  cer: string;
  mes_inflacion?: string;
  dias?: number;
  breakeven_mensual?: number;
  excluido: boolean;
  manual?: boolean;
}

interface BeCandidato {
  ticker_corto: string;
  fecha_vencimiento: string | null;
  dias: number | null;
  apto: boolean;
}

interface BeDiagFila {
  lecap: string | null;
  vto: string | null;
  cer: string | null;
  diff: number | null;
  dias: number | null;
  estado: string;
  motivo: string;
}

interface BeDiag {
  hoy: string;
  ultimo_ipc: string | null;
  max_diff_dias: number;
  min_dias_plazo: number;
  master: Record<string, { n: number; vto_max: string | null; emision_max: string | null }>;
  filas: BeDiagFila[];
  n_par: number;
  n_lecaps: number;
  cer_sin_par: string[];
  publicado: {
    fecha: string | null;
    updated_at: string | null;
    n_pares: number;
    n_con_be: number;
    sin_be: { lecap: string; cer: string; falta: string[] }[];
  };
}

function fmtBe(n: number | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "--";
  return `${(n * 100).toFixed(2)}%`;
}

// El '+': dos listas (tasa_fija | CER) para elegir una de cada lado. No hay
// tolerancia de días acá a propósito — el motor ya filtra por ±20d y justamente
// esto existe para armar los pares que ese filtro deja afuera.
function BeAgregarManual({ onHecho }: { onHecho: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [cands, setCands] = useState<{ tasa_fija: BeCandidato[]; cer: BeCandidato[] } | null>(null);
  const [lecap, setLecap] = useState("");
  const [cer, setCer] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!abierto || cands) return;
    let alive = true;
    fetch("/api/manager/breakevens/candidatos")
      .then((r) => r.json())
      .then((d) => { if (alive) setCands({ tasa_fija: d.tasa_fija || [], cer: d.cer || [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [abierto, cands]);

  const guardar = async () => {
    if (!lecap || !cer) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/manager/breakevens/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap, cer, agregar: true }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d?.detail || `HTTP ${r.status}`);
      }
      setLecap(""); setCer(""); setAbierto(false);
      onHecho();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "no se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const opt = (c: BeCandidato) => (
    <option key={c.ticker_corto} value={c.ticker_corto}>
      {c.ticker_corto} · {c.fecha_vencimiento || "sin vto"}
      {c.dias !== null ? ` (${c.dias}d)` : ""}{c.apto ? "" : " ⚠ sin dato"}
    </option>
  );

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className={_onInput + " w-auto"} title="Agregar un par Lecap↔CER a mano">
        + par manual
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={lecap} onChange={(e) => setLecap(e.target.value)}
        className={_onInput + " w-auto"} aria-label="Lecap/Boncap">
        <option value="">— tasa fija —</option>
        {(cands?.tasa_fija || []).map(opt)}
      </select>
      <span className="text-[11px] text-[var(--t-text-dim)]">↔</span>
      <select value={cer} onChange={(e) => setCer(e.target.value)}
        className={_onInput + " w-auto"} aria-label="CER">
        <option value="">— CER —</option>
        {(cands?.cer || []).map(opt)}
      </select>
      <button type="button" disabled={!lecap || !cer || busy} onClick={guardar}
        className={_onInput + " w-auto font-semibold"}>
        {busy ? "…" : "agregar"}
      </button>
      <button type="button" onClick={() => { setAbierto(false); setErr(""); }}
        className={_onInput + " w-auto"}>cancelar</button>
      {err && <span className="text-[10px] text-red-500">{err}</span>}
    </div>
  );
}

// Panel derecho: la cobertura. Un bono que no aparece en Renta Fija cae siempre
// en uno de estos motivos — mostrarlos evita el "¿está roto el motor o nadie dio
// de alta el bono?".
function BeDiagnostico() {
  const [d, setD] = useState<BeDiag | null>(null);
  const [loading, setLoading] = useState(false);
  const [soloFuera, setSoloFuera] = useState(true);

  const correr = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/breakevens/diagnostico")
      .then((r) => r.json())
      .then((x: BeDiag) => setD(x))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/breakevens/diagnostico")
      .then((r) => r.json())
      .then((x: BeDiag) => { if (alive) setD(x); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const filas = useMemo(
    () => (d?.filas || []).filter((f) => (soloFuera ? f.estado !== "PAR" : true)),
    [d, soloFuera],
  );

  return (
    <div className="min-h-0 overflow-auto">
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <span className={GROUP_TITLE}>COBERTURA</span>
        <button type="button" onClick={correr} className={_onInput + " w-auto"}>↻</button>
        <label className="flex items-center gap-1 text-[11px] text-[var(--t-text-dim)]">
          <input type="checkbox" checked={soloFuera} onChange={(e) => setSoloFuera(e.target.checked)} />
          solo los que NO entran
        </label>
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">corriendo…</span>}
      </div>

      {d && (
        <>
          <p className="text-[11px] text-[var(--t-text-dim)] mb-2">
            {d.n_par} pares de {d.n_lecaps} bonos tasa fija · tolerancia ±{d.max_diff_dias}d ·
            plazo mínimo {d.min_dias_plazo}d · último IPC {d.ultimo_ipc || "--"}
          </p>

          <div className="text-[11px] mb-2">
            <span className="text-[var(--t-text-dim)]">Master: </span>
            {Object.entries(d.master).map(([curva, m]) => (
              <span key={curva} className="mr-2">
                {curva} <b className="tabular-nums">{m.n}</b>
                <span className="text-[var(--t-text-muted)]"> (vto máx {m.vto_max || "--"})</span>
              </span>
            ))}
          </div>

          <table>
            <thead>
              <tr><th>Lecap</th><th>Vto</th><th>CER</th><th>Estado</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.lecap}|${f.vto}`}>
                  <td className="font-semibold">{f.lecap || "?"}</td>
                  <td className="tabular-nums">{f.vto || "--"}</td>
                  <td>{f.cer || "--"}</td>
                  <td className={f.estado === "PAR" ? "" : "text-amber-500"}>{f.estado}</td>
                  <td className="text-[10px] text-[var(--t-text-dim)]">{f.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 && (
            <p className="text-[11px] text-[var(--t-text-muted)] mt-2">
              Todos los bonos tasa fija del master entran a la matriz.
            </p>
          )}

          {d.cer_sin_par.length > 0 && (
            <p className="text-[11px] text-[var(--t-text-dim)] mt-2">
              <b>CER sin par:</b> {d.cer_sin_par.join(", ")} — candidatos para el “+ par manual”.
            </p>
          )}

          <p className="text-[11px] text-[var(--t-text-dim)] mt-3">
            <b>Publicado:</b> {d.publicado.fecha || "sin datos"} · {d.publicado.n_pares} pares
            ({d.publicado.n_con_be} con BE) · actualizado {d.publicado.updated_at || "--"}
          </p>
          {d.publicado.sin_be.map((s) => (
            <p key={`${s.lecap}|${s.cer}`} className="text-[10px] text-amber-500">
              {s.lecap} ↔ {s.cer} — falta {s.falta.join(", ") || "revisar rango del BE"}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

function TabBreakevens() {
  const [pares, setPares] = useState<BePar[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [nExcl, setNExcl] = useState(0);

  const fetchPares = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  // Carga al montar — fetch inline (setState solo en .then) para no disparar
  // setState sincrónico dentro del effect.
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        if (!alive) return;
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const toggle = async (p: BePar) => {
    const key = `${p.lecap}|${p.cer}`;
    setBusy((b) => ({ ...b, [key]: true }));
    // Optimista: reflejo el cambio antes de la respuesta.
    setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: !x.excluido } : x)));
    try {
      const r = await fetch("/api/manager/breakevens/exclusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap: p.lecap, cer: p.cer, excluir: !p.excluido }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNExcl((n) => (p.excluido ? Math.max(0, n - 1) : n + 1));
    } catch {
      // revierto si falló
      setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: p.excluido } : x)));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  // Borrar un par MANUAL es distinto de excluir uno del motor: el manual no
  // existe sin la fila, así que se elimina en vez de ocultarse.
  const borrarManual = async (p: BePar) => {
    const key = `${p.lecap}|${p.cer}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const r = await fetch("/api/manager/breakevens/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap: p.lecap, cer: p.cer, agregar: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setPares((prev) => prev.filter((x) => !(x.lecap === p.lecap && x.cer === p.cer)));
    } catch {
      /* si falló, el ↻ lo vuelve a traer */
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  return (
    <div className="h-full min-h-0 p-3 grid grid-cols-1 xl:grid-cols-2 gap-4 items-start overflow-auto">
      {/* ── IZQUIERDA: los pares (motor + manuales) ── */}
      <div className="min-h-0 overflow-auto">
        <div className="flex items-center flex-wrap gap-2 mb-2">
          <span className={GROUP_TITLE}>PARES</span>
          <button type="button" onClick={fetchPares} className={_onInput + " w-auto"}>↻</button>
          <BeAgregarManual onHecho={fetchPares} />
        </div>
        <p className="text-[11px] text-[var(--t-text-dim)] mb-2">
          {pares.length} pares · {nExcl} excluidos · excluir un par lo oculta de Renta Fija
          al instante; los ✎ los agregaste a mano y el motor no los conoce
        </p>
        <table>
          <thead>
            <tr><th>Lecap/Boncap</th><th>CER</th><th>IPC mes</th><th>Días</th><th>BE mensual</th><th></th></tr>
          </thead>
          <tbody>
            {pares.map((p) => {
              const key = `${p.lecap}|${p.cer}`;
              const beRoto = p.breakeven_mensual !== undefined && (p.breakeven_mensual < 0 || p.breakeven_mensual > 0.15);
              return (
                <tr key={key} className={p.excluido ? "opacity-40" : ""}>
                  <td className="font-semibold">
                    {p.manual && <span title="par manual" className="mr-1">✎</span>}{p.lecap}
                  </td>
                  <td>{p.cer}</td>
                  <td className="tabular-nums">{p.mes_inflacion || "--"}</td>
                  <td className="tabular-nums text-right">{p.dias ?? "--"}</td>
                  <td className={"tabular-nums text-right " + (beRoto ? "text-red-500 font-semibold" : "")}>
                    {fmtBe(p.breakeven_mensual)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={busy[key]}
                      onClick={() => (p.manual ? borrarManual(p) : toggle(p))}
                      className={_onInput + " w-auto text-[10px]"}
                      title={p.manual
                        ? "Borrar este par manual"
                        : p.excluido ? "Volver a mostrar este par" : "Ocultar este par de Renta Fija"}
                    >
                      {busy[key] ? "…" : p.manual ? "borrar" : p.excluido ? "incluir" : "excluir"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">cargando…</p>}
        {!loading && pares.length === 0 && (
          <p className="text-[11px] text-[var(--t-text-muted)] mt-2">
            Sin pares — ¿el motor de breakevens está corriendo?
          </p>
        )}
      </div>

      {/* ── DERECHA: por qué un bono entra o no entra ── */}
      <BeDiagnostico />
    </div>
  );
}


// ── EMISORES — la INDUSTRIA vive acá, no en el bono ──────────────────────────
// Guardarla por bono es escribir el mismo dato N veces y esperar que nadie lo
// escriba distinto. Medido: 8 emisores tienen HOY sectores que se contradicen
// entre sus propios bonos (Pampa Energía tiene tres). Ninguna fila está "mal" —
// cada una suma bien por separado — y por eso agrupar da distinto según de dónde
// se lea. Acá el dato existe UNA vez.
interface EmisorRow { emisor: string; industria?: string | null; bonos?: number; editado_por?: string | null }
interface PendientesResp {
  sin_clasificar: { emisor: string; bonos: number; falta_en_catalogo: boolean }[];
  contradicciones: { emisor: string; bonos: number; sectores: string }[];
  n_sin_clasificar: number; n_contradicciones: number;
}

function TabEmisores() {
  const [rows, setRows] = useState<EmisorRow[]>([]);
  const [industrias, setIndustrias] = useState<string[]>([]);
  const [pend, setPend] = useState<PendientesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState("");

  const cargar = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/manager/emisores").then((r) => r.json()),
      fetch("/api/manager/emisores/industrias").then((r) => r.json()),
      fetch("/api/manager/emisores/pendientes").then((r) => r.json()),
    ])
      .then(([e, i, p]) => { setRows(e.emisores || []); setIndustrias(i.industrias || []); setPend(p); })
      .catch(() => setMsg({ kind: "err", text: "no se pudo cargar" }))
      .finally(() => setLoading(false));
  };
  useEffect(cargar, []);

  const setIndustria = async (emisor: string, industria: string) => {
    setMsg(null);
    try {
      const r = await fetch("/api/manager/emisores", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // `""` (y no `undefined`) es la señal explícita de DEJAR SIN CLASIFICAR:
        // sin clasificar es un estado válido y visible, no un error.
        body: JSON.stringify({ emisor, industria }),
      });
      const txt = await r.text(); let d: { detail?: string } = {};
      try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      setRows((prev) => prev.map((x) => (x.emisor === emisor ? { ...x, industria: industria || null } : x)));
      fetch("/api/manager/emisores/pendientes").then((x) => x.json()).then(setPend).catch(() => {});
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
  };

  const crearIndustria = async () => {
    const nombre = nueva.trim();
    if (!nombre) return;
    await fetch("/api/manager/emisores/industria", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industria: nombre }),
    }).catch(() => {});
    setNueva(""); cargar();
  };

  const filtradas = rows.filter((r) => !q || r.emisor.toLowerCase().includes(q.toLowerCase()));
  const sinIndustria = rows.filter((r) => !r.industria).length;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input className={_onInput + " w-48"} placeholder="buscar emisor…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-[11px] text-[var(--t-text-2)]">
          {rows.length} emisores · {sinIndustria} sin industria
        </span>
        <div className="flex-1" />
        <input className={_onInput + " w-40"} placeholder="industria nueva…"
               value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button className={_onInput + " w-auto text-[10px]"} onClick={crearIndustria}>+ INDUSTRIA</button>
        <button className={_onInput + " w-auto text-[10px]"} onClick={cargar}>recargar</button>
      </div>
      {msg && <p className={`text-[11px] ${msg.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      {/* Los pendientes ARRIBA y no escondidos en otra pantalla: si hay que mirar
          una lista para enterarse, se vuelve el incidente del backfill que falló
          dos días sin que nadie lo viera. */}
      {pend && pend.n_contradicciones > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/5 rounded p-2">
          <div className="text-[11px] font-semibold text-amber-400 mb-1">
            ⚠ {pend.n_contradicciones} emisor(es) con sectores contradictorios entre sus propios bonos
          </div>
          <div className="text-[10px] text-[var(--t-text-2)] mb-1">
            Ninguno está mal: cada bono suma bien por separado, y por eso agrupar da
            distinto según de dónde se lea. Elegí vos cuál queda — por eso no se
            resolvieron solos.
          </div>
          {pend.contradicciones.map((c) => (
            <div key={c.emisor} className="text-[11px] flex gap-2">
              <span className="w-52 truncate">{c.emisor}</span>
              <span className="text-[var(--t-text-2)]">{c.bonos} bonos · {c.sectores}</span>
            </div>
          ))}
        </div>
      )}

      <table className="w-full text-[11px]">
        <thead className="text-[var(--t-text-2)]">
          <tr><th className="text-left">EMISOR</th><th className="text-right">BONOS</th>
              <th className="text-left pl-3">INDUSTRIA</th><th className="text-left">EDITÓ</th></tr>
        </thead>
        <tbody>
          {filtradas.map((r) => (
            <tr key={r.emisor} className={r.industria ? "" : "bg-amber-500/5"}>
              <td className="truncate max-w-[16rem]">{r.emisor}</td>
              <td className="text-right">{r.bonos ?? 0}</td>
              <td className="pl-3">
                <select className={_onInput + " w-44"} value={r.industria || ""}
                        onChange={(e) => setIndustria(r.emisor, e.target.value)}>
                  <option value="">— sin clasificar —</option>
                  {industrias.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </td>
              <td className="text-[10px] text-[var(--t-text-2)] truncate max-w-[12rem]">
                {r.editado_por || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <p className="text-[11px] text-[var(--t-text-muted)]">cargando…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Catálogo vacío — corré <code>python -m scripts.sembrar_emisores --aplicar</code> en el Droplet.
        </p>
      )}
    </div>
  );
}

export function TitulosGroup({ modules }: { modules?: string[] | null }) {
  // "ons" se eliminó como sub-tab (2026-07-09): alta/edición + sector de ONs
  // viven en BONOS (editor unificado TabAltaTitulo). El persisted state viejo
  // con "ons" cae al default vía subVisible.
  const [sub, setSub] = usePersistedState<"instrumentos" | "assets" | "bonos" | "emisores" | "breakevens" | "renta_variable">("manager.titulos.sub", "instrumentos");
  const has = (m: string) => modules == null || modules.includes(m);
  const canInstr = has("manager") || has("manager_instrumentos");
  const canMaestro = has("manager") || has("manager_titulos");
  const subVisible = (sub === "instrumentos" && canInstr) || ((sub === "assets" || sub === "bonos" || sub === "emisores" || sub === "breakevens" || sub === "renta_variable") && canMaestro);
  const eff = subVisible ? sub : (canInstr ? "instrumentos" : "assets");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>TÍTULOS</span>
        {canInstr && <Pill label="INSTRUMENTOS" active={eff === "instrumentos"} onClick={() => setSub("instrumentos")} />}
        {canMaestro && <Pill label="ASSETS" active={eff === "assets"} onClick={() => setSub("assets")} />}
        {canMaestro && <Pill label="BONOS" active={eff === "bonos"} onClick={() => setSub("bonos")} />}
        {canMaestro && <Pill label="EMISORES" active={eff === "emisores"} onClick={() => setSub("emisores")} />}
        {canMaestro && <Pill label="BREAKEVENS" active={eff === "breakevens"} onClick={() => setSub("breakevens")} />}
        {canMaestro && <Pill label="RENTA VARIABLE" active={eff === "renta_variable"} onClick={() => setSub("renta_variable")} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {eff === "instrumentos"   && canInstr && <div className="h-full overflow-y-auto p-3"><TabInstrumentos /></div>}
        {eff === "assets"         && canMaestro && <TabAssets />}
        {eff === "bonos"          && canMaestro && <TabBonos />}
        {eff === "emisores"       && canMaestro && <TabEmisores />}
        {eff === "breakevens"     && canMaestro && <TabBreakevens />}
        {eff === "renta_variable" && canMaestro && <TabRentaVariable />}
      </div>
    </div>
  );
}
