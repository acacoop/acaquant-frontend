"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { readSheetRows } from "@/lib/xlsx-read";
import { GROUP_HEADER, GROUP_TITLE, Pill } from "./manager-shared";

// OPERACIONES: carga de operaciones.operaciones por Excel/CSV. Parsea el archivo
// en el cliente y lo sube en lotes. Tres modos:
//   FALTANTES (default) → /api/manager/operaciones/faltantes. Solo inserta los
//     boletos que NO están; nunca pisa lo que vino de Aunesa. Previsualiza antes.
//   FECHAS → /api/manager/operaciones/fechas. Corrige SOLO concertacion contra el
//     archivo (arregla el día/mes dado vuelta de una carga histórica vieja).
//   REEMPLAZAR → /api/manager/operaciones/backfill. Upsert por boleto.
type OpsStats = { n: number; n_cuentas: number; min_concertacion: string | null; max_concertacion: string | null };

type FaltantesResp = {
  recibidas: number; sin_boleto: number; otc_excluidas: number; duplicadas_archivo: number;
  validas: number; ya_existen: number; nuevos: number; insertados: number;
  sin_concertacion?: number; desde?: string | null; hasta?: string | null;
  boletos_sin_fecha?: string[];
  bruto_ars?: number; bruto_usd?: number; arancel_total?: number;
  sin_mercado?: string[]; cuentas_sin_segmento?: string[];
  muestra?: Record<string, unknown>[];
};

type CambioFecha = { boleto: string; actual: string | null; nueva: string; tipo: string };

type FechasResp = {
  recibidas: number; sin_boleto: number; sin_fecha_archivo: number; duplicadas_archivo: number;
  con_fecha: number; iguales: number; swap: number; otra_dif: number;
  sin_fecha_base: number; no_existen: number; a_corregir: number; corregidos: number;
  muestra: CambioFecha[];
};

const OPS_BATCH = 2000;

function OpsStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">{label}</div>
      <div className="text-[13px] text-[var(--t-text)]">{value}</div>
    </div>
  );
}

const opsNum = (n: number | undefined) =>
  (n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

export function OperacionesBackfillPanel() {
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [modo, setModo] = useState<"faltantes" | "fechas" | "reemplazar">("faltantes");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [preview, setPreview] = useState<FaltantesResp | null>(null);
  const [pFechas, setPFechas] = useState<FechasResp | null>(null);
  const [result, setResult] = useState<{ recibidas: number; upsertadas: number; modificadas: number; sin_boleto: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStats = useCallback(() => {
    fetch("/api/manager/operaciones/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const onFile = async (file: File) => {
    setMsg(null); setResult(null); setPreview(null); setPFechas(null); setRows([]); setHeaders([]); setFileName(file.name);
    try {
      const json = await readSheetRows(file, { cellDates: true, fechasLocalISO: true });
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      setRows(json);
      setHeaders(Object.keys(json[0]).filter((h) => h.trim() !== ""));
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // Dedup por boleto en TODO el archivo (última fila gana). Así ningún boleto
  // aparece en dos lotes → se pueden mandar EN PARALELO sin chocar contra el
  // índice único (y de paso achica el total).
  const lotes = useCallback(() => {
    const normH = (h: string) =>
      h.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const bHeader = headers.find((h) => normH(h) === "boleto");
    let unique: Record<string, unknown>[] = rows;
    if (bHeader) {
      const map = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const b = String(r[bHeader] ?? "").trim();
        if (b) map.set(b, r);
      }
      unique = [...map.values()];
    }
    const out: Record<string, unknown>[][] = [];
    for (let i = 0; i < unique.length; i += OPS_BATCH) out.push(unique.slice(i, i + OPS_BATCH));
    return out;
  }, [rows, headers]);

  const post = async (url: string, body: unknown) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
          throw new Error(detail);
        }
        return await res.json();
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));  // backoff y reintenta
      }
    }
    throw lastErr;  // falló las 3 veces
  };

  // ── MODO FALTANTES: analiza (commit=false) o inserta (commit=true) ──────────
  const correrFaltantes = async (commit: boolean) => {
    if (busy || !rows.length) return;
    setBusy(true); setMsg(null); setResult(null);
    if (!commit) setPreview(null);
    const batches = lotes();
    const total = batches.length;
    let done = 0;
    const acc: FaltantesResp = {
      recibidas: 0, sin_boleto: 0, otc_excluidas: 0, duplicadas_archivo: 0,
      validas: 0, ya_existen: 0, nuevos: 0, insertados: 0, sin_concertacion: 0,
      bruto_ars: 0, bruto_usd: 0, arancel_total: 0,
      desde: null, hasta: null, sin_mercado: [], cuentas_sin_segmento: [], muestra: [],
    };
    const sinMercado = new Set<string>();
    const sinSegmento = new Set<string>();

    const send = async (batch: Record<string, unknown>[]) => {
      const j = await post("/api/manager/operaciones/faltantes", { rows: batch, commit }) as FaltantesResp;
      acc.recibidas += j.recibidas ?? 0;
      acc.sin_boleto += j.sin_boleto ?? 0;
      acc.otc_excluidas += j.otc_excluidas ?? 0;
      acc.duplicadas_archivo += j.duplicadas_archivo ?? 0;
      acc.validas += j.validas ?? 0;
      acc.ya_existen += j.ya_existen ?? 0;
      acc.nuevos += j.nuevos ?? 0;
      acc.insertados += j.insertados ?? 0;
      acc.sin_concertacion = (acc.sin_concertacion ?? 0) + (j.sin_concertacion ?? 0);
      acc.bruto_ars = (acc.bruto_ars ?? 0) + (j.bruto_ars ?? 0);
      acc.bruto_usd = (acc.bruto_usd ?? 0) + (j.bruto_usd ?? 0);
      acc.arancel_total = (acc.arancel_total ?? 0) + (j.arancel_total ?? 0);
      if (j.desde && (!acc.desde || j.desde < acc.desde)) acc.desde = j.desde;
      if (j.hasta && (!acc.hasta || j.hasta > acc.hasta)) acc.hasta = j.hasta;
      (j.sin_mercado ?? []).forEach((t) => sinMercado.add(t));
      (j.cuentas_sin_segmento ?? []).forEach((c) => sinSegmento.add(c));
      if (!acc.muestra?.length && j.muestra?.length) acc.muestra = j.muestra;
      done++; setProgress({ done, total });
    };

    try {
      if (!total) { setMsg({ ok: false, text: "Nada para subir." }); return; }
      let next = 0;
      const worker = async () => { for (let i = next++; i < total; i = next++) await send(batches[i]); };
      await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
      acc.sin_mercado = [...sinMercado].sort();
      acc.cuentas_sin_segmento = [...sinSegmento].sort();
      setPreview(acc);
      setMsg(commit
        ? { ok: true, text: `Listo: se insertaron ${opsNum(acc.insertados)} boletos nuevos. Los ${opsNum(acc.ya_existen)} que ya estaban quedaron intactos.` }
        : { ok: true, text: `Análisis listo — revisá abajo y confirmá.` });
      if (commit) loadStats();
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  // ── MODO FECHAS: corrige SOLO concertacion contra el archivo ────────────────
  const correrFechas = async (commit: boolean) => {
    if (busy || !rows.length) return;
    if (commit && !window.confirm("Se va a actualizar ÚNICAMENTE la fecha de concertación de los boletos listados. Ningún otro dato se toca. ¿Confirmás?")) return;
    setBusy(true); setMsg(null); setResult(null);
    if (!commit) setPFechas(null);
    const batches = lotes();
    const total = batches.length;
    let done = 0;
    const acc: FechasResp = {
      recibidas: 0, sin_boleto: 0, sin_fecha_archivo: 0, duplicadas_archivo: 0,
      con_fecha: 0, iguales: 0, swap: 0, otra_dif: 0, sin_fecha_base: 0,
      no_existen: 0, a_corregir: 0, corregidos: 0, muestra: [],
    };

    const send = async (batch: Record<string, unknown>[]) => {
      const j = await post("/api/manager/operaciones/fechas", { rows: batch, commit }) as FechasResp;
      (Object.keys(acc) as (keyof FechasResp)[]).forEach((k) => {
        if (k !== "muestra") (acc[k] as number) += (j[k] as number) ?? 0;
      });
      if (acc.muestra.length < 30) acc.muestra = acc.muestra.concat(j.muestra ?? []).slice(0, 30);
      done++; setProgress({ done, total });
    };

    try {
      if (!total) { setMsg({ ok: false, text: "Nada para analizar." }); return; }
      let next = 0;
      const worker = async () => { for (let i = next++; i < total; i = next++) await send(batches[i]); };
      await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
      setPFechas(acc);
      setMsg(commit
        ? { ok: true, text: `Listo: se corrigió la fecha de ${opsNum(acc.corregidos)} boletos. Ningún otro dato se modificó.` }
        : { ok: true, text: acc.a_corregir ? "Análisis listo — revisá los cambios abajo y confirmá." : "Todas las fechas del archivo ya coinciden con la base. No hay nada que corregir." });
      if (commit) loadStats();
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  // ── MODO REEMPLAZAR: upsert por boleto (el archivo pisa lo que había) ───────
  const subirUpsert = async () => {
    if (busy || !rows.length) return;
    if (!window.confirm("Este modo PISA los boletos que ya existen con lo que traiga el archivo. ¿Seguro?")) return;
    setBusy(true); setMsg(null); setResult(null); setPreview(null); setPFechas(null);
    const batches = lotes();
    const total = batches.length;
    const acc = { recibidas: 0, upsertadas: 0, modificadas: 0, sin_boleto: 0 };
    let done = 0;

    const send = async (batch: Record<string, unknown>[]) => {
      const j = await post("/api/manager/operaciones/backfill", { rows: batch });
      acc.recibidas += j.recibidas ?? 0;
      acc.upsertadas += j.upsertadas ?? 0;
      acc.modificadas += j.modificadas ?? 0;
      acc.sin_boleto += j.sin_boleto ?? 0;
      done++; setProgress({ done, total });
    };

    try {
      if (!total) { setMsg({ ok: false, text: "Nada para subir." }); return; }
      let next = 0;
      const worker = async () => { for (let i = next++; i < total; i = next++) await send(batches[i]); };
      await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
      setResult(acc);
      setMsg({ ok: true, text: `Listo: ${acc.upsertadas} escritas, ${acc.sin_boleto} sin boleto.` });
      loadStats();
    } catch (e) {
      setMsg({ ok: false, text: `Error al subir: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const btn = "px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="h-full overflow-y-auto p-4 text-[12px] text-[var(--t-text)]">
      <div className="max-w-[860px] space-y-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">CARGAR OPERACIONES</h2>
          <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
            Subí un Excel/CSV con operaciones para tapar huecos del histórico. La clave es el
            <strong className="text-[var(--t-text)]"> boleto</strong>: un boleto, un registro.
            Columnas reconocidas: boleto, id_cuenta (o cuenta), concertacion, denominacion,
            tipo_operacion, instrumento, condiciones, cantidad, bruto, arancel, tasa.
            El arancel puede venir con el prefijo <code>ARS </code> — se limpia solo.
            Las columnas derivadas (moneda, mercado, operacion, segmento, nivel_3, commodity,
            es_cierre, mep) NO hay que ponerlas: el backend las calcula igual que la ingesta diaria.
          </p>
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
          <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mb-2">ESTADO ACTUAL</div>
          {stats ? (
            <div className="flex gap-8">
              <OpsStat label="BOLETOS" value={stats.n.toLocaleString("es-AR")} />
              <OpsStat label="CUENTAS" value={String(stats.n_cuentas)} />
              <OpsStat label="DESDE" value={stats.min_concertacion ?? "—"} />
              <OpsStat label="HASTA" value={stats.max_concertacion ?? "—"} />
            </div>
          ) : <span className="text-[var(--t-text-muted)]">cargando…</span>}
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <div className="flex gap-4 items-center">
            {(["faltantes", "fechas", "reemplazar"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={modo === m} onChange={() => { setModo(m); setPreview(null); setPFechas(null); setResult(null); setMsg(null); }} />
                <span className={modo === m ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)]"}>
                  {m === "faltantes" ? "SOLO FALTANTES (recomendado)" : m === "fechas" ? "CORREGIR FECHAS" : "REEMPLAZAR EXISTENTES"}
                </span>
              </label>
            ))}
          </div>
          <div className="text-[var(--t-text-muted)] text-[11px]">
            {modo === "faltantes"
              ? "Inserta únicamente los boletos que no están en la base. Los que ya existen no se tocan."
              : modo === "fechas"
                ? "Compara la fecha de concertación del archivo contra la base y corrige solo esa columna. Ningún otro dato se modifica. Sirve para arreglar los boletos que quedaron con día y mes dados vuelta."
                : "⚠ Pisa con el archivo todos los boletos que ya existan. Usalo solo para corregir datos malos."}
          </div>

          <label className="inline-block px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]">
            ELEGIR ARCHIVO (.xlsx / .csv)
            <input
              type="file" accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
              className="hidden"
            />
          </label>
          {fileName && rows.length > 0 && (
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text)]">{fileName}</span> · {rows.length.toLocaleString("es-AR")} filas · columnas: {headers.join(", ")}
            </div>
          )}

          {rows.length > 0 ? (
            <div className="flex gap-2">
              {modo === "faltantes" ? (
                <>
                  <button onClick={() => correrFaltantes(false)} disabled={busy} className={btn}>
                    {busy && !preview ? "ANALIZANDO…" : "1 · ANALIZAR"}
                  </button>
                  <button
                    onClick={() => correrFaltantes(true)}
                    disabled={busy || !preview || !preview.nuevos || !!preview.insertados}
                    className={btn}
                  >
                    {preview?.insertados ? "INSERTADO ✓" : `2 · INSERTAR ${preview ? opsNum(preview.nuevos) : ""} FALTANTES`}
                  </button>
                </>
              ) : modo === "fechas" ? (
                <>
                  <button onClick={() => correrFechas(false)} disabled={busy} className={btn}>
                    {busy && !pFechas ? "ANALIZANDO…" : "1 · ANALIZAR FECHAS"}
                  </button>
                  <button
                    onClick={() => correrFechas(true)}
                    disabled={busy || !pFechas || !pFechas.a_corregir || !!pFechas.corregidos}
                    className={btn}
                  >
                    {pFechas?.corregidos ? "CORREGIDO ✓" : `2 · CORREGIR ${pFechas ? opsNum(pFechas.a_corregir) : ""} FECHAS`}
                  </button>
                </>
              ) : (
                <button onClick={subirUpsert} disabled={busy} className={btn}>
                  {busy ? "Subiendo…" : "SUBIR (PISA EXISTENTES)"}
                </button>
              )}
            </div>
          ) : (
            <div className="text-[var(--t-text-muted)]">Elegí un archivo para habilitar la subida.</div>
          )}
          {progress && <div className="text-[var(--t-text-muted)]">lote {progress.done}/{progress.total}…</div>}
          {msg && <div className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</div>}
          {result && (
            <div className="text-[var(--t-text)]">
              ✓ {result.upsertadas.toLocaleString("es-AR")} escritas · {result.sin_boleto} sin boleto · {result.recibidas.toLocaleString("es-AR")} procesadas
            </div>
          )}
        </div>

        {pFechas && (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
            <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
              {pFechas.corregidos ? "RESULTADO" : "PREVISUALIZACIÓN (todavía no se escribió nada)"}
            </div>
            <div className="flex flex-wrap gap-8">
              <OpsStat label="A CORREGIR" value={opsNum(pFechas.a_corregir)} />
              <OpsStat label="DÍA/MES AL REVÉS" value={opsNum(pFechas.swap)} />
              <OpsStat label="OTRA DIFERENCIA" value={opsNum(pFechas.otra_dif)} />
              <OpsStat label="YA COINCIDÍAN" value={opsNum(pFechas.iguales)} />
              <OpsStat label="NO ESTÁN EN LA BASE" value={opsNum(pFechas.no_existen)} />
              <OpsStat label="SIN FECHA EN EL ARCHIVO" value={opsNum(pFechas.sin_fecha_archivo)} />
            </div>
            {!!pFechas.otra_dif && (
              <div className="text-amber-400">
                ⚠ {opsNum(pFechas.otra_dif)} boletos difieren de una forma que NO es día/mes dado vuelta. Revisalos en la muestra antes de confirmar: puede ser un error del archivo.
              </div>
            )}
            {!!pFechas.no_existen && (
              <div className="text-amber-400">
                ⚠ {opsNum(pFechas.no_existen)} boletos del archivo no existen en la base — este modo no los inserta. Para cargarlos usá SOLO FALTANTES.
              </div>
            )}
            {!!pFechas.muestra.length && (
              <div className="overflow-x-auto">
                <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mb-1">
                  CAMBIOS (primeros {pFechas.muestra.length})
                </div>
                <table className="text-[11px] w-full">
                  <thead className="text-[var(--t-text-muted)]">
                    <tr>
                      <th className="text-left pr-3 font-normal">BOLETO</th>
                      <th className="text-left pr-3 font-normal">FECHA ACTUAL</th>
                      <th className="text-left pr-3 font-normal">FECHA NUEVA</th>
                      <th className="text-left pr-3 font-normal">DIAGNÓSTICO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pFechas.muestra.map((c) => (
                      <tr key={c.boleto} className="border-t border-[var(--t-border)]">
                        <td className="pr-3 py-0.5 whitespace-nowrap">{c.boleto}</td>
                        <td className="pr-3 py-0.5 whitespace-nowrap text-red-400">{c.actual ?? "—"}</td>
                        <td className="pr-3 py-0.5 whitespace-nowrap text-green-400">{c.nueva}</td>
                        <td className="pr-3 py-0.5 whitespace-nowrap text-[var(--t-text-muted)]">{c.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {preview && (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
            <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
              {preview.insertados ? "RESULTADO" : "PREVISUALIZACIÓN (todavía no se escribió nada)"}
            </div>
            <div className="flex flex-wrap gap-8">
              <OpsStat label="BOLETOS NUEVOS" value={opsNum(preview.nuevos)} />
              <OpsStat label="YA EXISTÍAN" value={opsNum(preview.ya_existen)} />
              <OpsStat label="DESCARTADAS" value={opsNum(preview.sin_boleto + preview.otc_excluidas + preview.duplicadas_archivo)} />
              <OpsStat label="DESDE" value={preview.desde ?? "—"} />
              <OpsStat label="HASTA" value={preview.hasta ?? "—"} />
            </div>
            <div className="flex flex-wrap gap-8">
              <OpsStat label="BRUTO ARS" value={opsNum(preview.bruto_ars)} />
              <OpsStat label="BRUTO USD" value={opsNum(preview.bruto_usd)} />
              <OpsStat label="ARANCEL (ARS)" value={opsNum(preview.arancel_total)} />
            </div>
            {!!preview.sin_concertacion && (
              <div className="text-amber-400 space-y-1">
                <div>
                  ⚠ {opsNum(preview.sin_concertacion)} boletos sin fecha de concertación en el archivo — entran, pero no aparecen en ninguna serie por fecha. Conviené completarlos en el Excel y volver a subir.
                </div>
                {!!preview.boletos_sin_fecha?.length && (
                  <div className="text-[10px] text-[var(--t-text-muted)] break-all">
                    {preview.boletos_sin_fecha.join(" · ")}
                    {preview.sin_concertacion > preview.boletos_sin_fecha.length && " …"}
                  </div>
                )}
              </div>
            )}
            {!!preview.sin_mercado?.length && (
              <div className="text-amber-400">
                ⚠ Tipos de operación fuera del catálogo (quedan sin mercado): {preview.sin_mercado.join(" · ")}
              </div>
            )}
            {!!preview.cuentas_sin_segmento?.length && (
              <div className="text-amber-400">
                ⚠ {preview.cuentas_sin_segmento.length} cuenta(s) sin segmento en el maestro de comitentes: {preview.cuentas_sin_segmento.slice(0, 15).join(", ")}
                {preview.cuentas_sin_segmento.length > 15 && "…"}
              </div>
            )}
            {!!preview.muestra?.length && (
              <div className="overflow-x-auto">
                <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mb-1">MUESTRA (primeros 20)</div>
                <table className="text-[11px] w-full">
                  <thead className="text-[var(--t-text-muted)]">
                    <tr>{Object.keys(preview.muestra[0]).map((k) => <th key={k} className="text-left pr-3 font-normal">{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.muestra.map((r, i) => (
                      <tr key={i} className="border-t border-[var(--t-border)]">
                        {Object.keys(preview.muestra![0]).map((k) => (
                          <td key={k} className="pr-3 py-0.5 whitespace-nowrap">{r[k] === null || r[k] === undefined ? "—" : String(r[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <AnuladosPanel />
      </div>
    </div>
  );
}

// ── ANULADOS: boletos que Aunesa anuló (les agrega el sufijo " (A)") ──────────
// Dos caminos, misma regla: el número de boleto es la MISMA identidad en
// operaciones.operaciones (col. boleto) y en negocio_movimientos (col.
// comprobante) → una anulación se marca en las DOS tablas a la vez.
//   BARRIDO  → /api/manager/operaciones/anulados/barrido. Busca el sufijo "(A)"
//     que ya está en la base y arrastra el gemelo sin marca (mismo número).
//   LISTA    → /api/manager/operaciones/anulados. Subís un Excel con la columna
//     BOLETO y busca cada uno probando CON y SIN "(A)".
// Los dos previsualizan primero (commit=false) y son idempotentes.
type AnulFila = {
  tabla: string; boleto: string; fecha: string | null; id_cuenta: string | null;
  cliente: string | null; operacion: string | null; instrumento: string | null;
  importe: number | null; moneda: string | null; ya_anulado: boolean;
};

type AnulTabla = {
  con_marca_a: AnulFila[]; gemelos_sin_marca: AnulFila[];
  n_con_marca: number; n_gemelos: number; n_ya_anuladas: number; marcadas: number;
};

type BarridoResp = { commit: boolean; marcadas: number; tablas: Record<string, AnulTabla> };

type ListaResp = {
  commit: boolean; pedidos: number; marcadas: number;
  sin_prefijo: string[]; no_encontrados: string[]; detalle: AnulFila[];
  tablas: Record<string, { encontradas: number; marcadas: number }>;
};

const anulImporte = (n: number | null) =>
  n === null || n === undefined ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function AnulTablaDetalle({ titulo, filas }: { titulo: string; filas: AnulFila[] }) {
  if (!filas.length) return null;
  return (
    <div className="overflow-x-auto">
      <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mb-1">
        {titulo} — {filas.length}
      </div>
      <table className="text-[11px] w-full">
        <thead className="text-[var(--t-text-muted)]">
          <tr>
            <th className="text-left pr-3 font-normal">FECHA</th>
            <th className="text-left pr-3 font-normal">CTA</th>
            <th className="text-left pr-3 font-normal">BOLETO</th>
            <th className="text-left pr-3 font-normal">CLIENTE</th>
            <th className="text-left pr-3 font-normal">OPERACIÓN</th>
            <th className="text-right pr-3 font-normal">IMPORTE</th>
            <th className="text-left pr-3 font-normal">MON</th>
            <th className="text-left pr-3 font-normal">ESTADO</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={`${f.tabla}-${f.boleto}-${i}`} className="border-t border-[var(--t-border)]">
              <td className="pr-3 py-0.5 whitespace-nowrap">{f.fecha ?? "—"}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap">{f.id_cuenta ?? "—"}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap text-[var(--t-accent)]">{f.boleto}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap">{(f.cliente ?? "—").slice(0, 32)}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap">{(f.operacion ?? "—").slice(0, 30)}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap text-right">{anulImporte(f.importe)}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap">{f.moneda ?? "—"}</td>
              <td className="pr-3 py-0.5 whitespace-nowrap text-[var(--t-text-muted)]">
                {f.ya_anulado ? "ya anulado" : "vivo"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnuladosPanel() {
  const [resumen, setResumen] = useState<Record<string, { con_marca_a: number; ya_anuladas: number }> | null>(null);
  const [barrido, setBarrido] = useState<BarridoResp | null>(null);
  const [lista, setLista] = useState<ListaResp | null>(null);
  const [boletos, setBoletos] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadResumen = useCallback(() => {
    fetch("/api/manager/operaciones/anulados/resumen").then((r) => r.json()).then(setResumen).catch(() => {});
  }, []);
  useEffect(() => { loadResumen(); }, [loadResumen]);

  const call = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
      throw new Error(detail);
    }
    return res.json();
  };

  const correrBarrido = async (commit: boolean) => {
    if (busy) return;
    if (commit && !window.confirm("Se van a marcar como ANULADOS los boletos con la marca (A) y sus gemelos sin marca, en las dos tablas. ¿Confirmás?")) return;
    setBusy(true); setMsg(null);
    try {
      const j = await call(`/api/manager/operaciones/anulados/barrido?commit=${commit}`) as BarridoResp;
      setBarrido(j);
      setMsg(commit
        ? { ok: true, text: `Listo: ${j.marcadas} fila(s) marcadas como anuladas.` }
        : { ok: true, text: "Análisis listo — revisá el detalle y confirmá." });
      if (commit) loadResumen();
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  // Excel/CSV con UNA columna: BOLETO. Se acepta con o sin la marca " (A)".
  const onFileAnul = async (file: File) => {
    setMsg(null); setLista(null); setBoletos([]); setFileName(file.name);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      const normH = (h: string) =>
        h.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const cols = Object.keys(json[0]);
      const col = cols.find((h) => ["boleto", "comprobante"].includes(normH(h))) ?? cols[0];
      const vals = [...new Set(json.map((r) => String(r[col] ?? "").trim()).filter(Boolean))];
      if (!vals.length) { setMsg({ ok: false, text: `No encontré boletos en la columna "${col}".` }); return; }
      setBoletos(vals);
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const correrLista = async (commit: boolean) => {
    if (busy || !boletos.length) return;
    if (commit && !window.confirm(`Se van a marcar como ANULADOS ${lista?.detalle.length ?? 0} registros en las dos tablas. ¿Confirmás?`)) return;
    setBusy(true); setMsg(null);
    try {
      const j = await call("/api/manager/operaciones/anulados", { boletos, commit }) as ListaResp;
      setLista(j);
      setMsg(commit
        ? { ok: true, text: `Listo: ${j.marcadas} fila(s) marcadas como anuladas.` }
        : { ok: true, text: `Encontrados ${j.detalle.length} registro(s) para ${j.pedidos} boleto(s). Revisá y confirmá.` });
      if (commit) loadResumen();
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };

  const btn = "px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="space-y-4 pt-6 border-t border-[var(--t-border)]">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">BOLETOS ANULADOS</h2>
        <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
          Cuando Aunesa anula un boleto le agrega el sufijo <code>(A)</code> al número. Como la ingesta
          guarda por número, el boleto marcado entró como registro NUEVO y convive con el original →
          la misma operación se cuenta dos veces. Anular lo saca de TODA la app (volumen, aranceles,
          PnL, actividad comercial) sin borrar el registro.
        </p>
      </div>

      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
        <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
          1 · BARRIDO AUTOMÁTICO — lo que YA está en la base con la marca (A)
        </div>
        {resumen && (
          <div className="flex flex-wrap gap-8">
            {Object.entries(resumen).map(([t, r]) => (
              <OpsStat key={t} label={t.toUpperCase()} value={`${opsNum(r.con_marca_a)} con (A) · ${opsNum(r.ya_anuladas)} ya anulados`} />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => correrBarrido(false)} disabled={busy} className={btn}>
            {busy && !barrido ? "ANALIZANDO…" : "1 · ANALIZAR"}
          </button>
          <button onClick={() => correrBarrido(true)} disabled={busy || !barrido || barrido.commit} className={btn}>
            {barrido?.commit ? "ANULADO ✓" : "2 · ANULAR EN LAS DOS TABLAS"}
          </button>
        </div>
      </div>

      {barrido && Object.entries(barrido.tablas).map(([tabla, d]) => (
        <div key={tabla} className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">{tabla.toUpperCase()}</div>
          <div className="flex flex-wrap gap-8">
            <OpsStat label="CON MARCA (A)" value={opsNum(d.n_con_marca)} />
            <OpsStat label="GEMELOS SIN MARCA" value={opsNum(d.n_gemelos)} />
            <OpsStat label="YA ANULADAS" value={opsNum(d.n_ya_anuladas)} />
            <OpsStat label="MARCADAS AHORA" value={opsNum(d.marcadas)} />
          </div>
          <AnulTablaDetalle titulo="CON LA MARCA (A) — anulados por Aunesa" filas={d.con_marca_a} />
          <AnulTablaDetalle titulo="GEMELOS SIN MARCA — mismo número, ingestados antes de la anulación" filas={d.gemelos_sin_marca} />
        </div>
      ))}

      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
        <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
          2 · SUBIR UNA LISTA DE BOLETOS ANULADOS
        </div>
        <div className="text-[var(--t-text-muted)] text-[11px]">
          Un Excel/CSV con una sola columna <strong className="text-[var(--t-text)]">BOLETO</strong>.
          Da igual si viene con la marca (<code>BOL 2026109006 (A)</code>) o sin ella
          (<code>BOL 2026109006</code>): se busca de las dos formas, en las dos tablas.
        </div>
        <label className="inline-block px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]">
          ELEGIR ARCHIVO (.xlsx / .csv)
          <input
            type="file" accept=".csv,.xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileAnul(f); e.target.value = ""; }}
            className="hidden"
          />
        </label>
        {fileName && boletos.length > 0 && (
          <div className="text-[var(--t-text-muted)]">
            <span className="text-[var(--t-text)]">{fileName}</span> · {boletos.length.toLocaleString("es-AR")} boletos únicos
          </div>
        )}
        {boletos.length > 0 && (
          <div className="flex gap-2">
            <button onClick={() => correrLista(false)} disabled={busy} className={btn}>
              {busy && !lista ? "BUSCANDO…" : "1 · BUSCAR EN LA BASE"}
            </button>
            <button onClick={() => correrLista(true)} disabled={busy || !lista || lista.commit || !lista.detalle.length} className={btn}>
              {lista?.commit ? "ANULADO ✓" : `2 · ANULAR ${lista ? lista.detalle.length : ""} REGISTRO(S)`}
            </button>
          </div>
        )}
      </div>

      {msg && <div className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</div>}

      {lista && (
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">
            {lista.commit ? "RESULTADO" : "PREVISUALIZACIÓN (todavía no se escribió nada)"}
          </div>
          <div className="flex flex-wrap gap-8">
            <OpsStat label="BOLETOS PEDIDOS" value={opsNum(lista.pedidos)} />
            {Object.entries(lista.tablas).map(([t, d]) => (
              <OpsStat key={t} label={t.toUpperCase()} value={`${opsNum(d.encontradas)} encontradas`} />
            ))}
            <OpsStat label="NO ENCONTRADOS" value={opsNum(lista.no_encontrados.length)} />
          </div>
          {!!lista.sin_prefijo.length && (
            <div className="text-amber-400 text-[11px]">
              ⚠ {lista.sin_prefijo.length} valor(es) sin prefijo (falta el <code>BOL </code>/<code>CL </code>/<code>DOC </code>): {lista.sin_prefijo.slice(0, 20).join(" · ")}
              {lista.sin_prefijo.length > 20 && " …"}
            </div>
          )}
          {!!lista.no_encontrados.length && (
            <div className="text-amber-400 text-[11px] break-all">
              ⚠ No están en ninguna de las dos tablas: {lista.no_encontrados.slice(0, 30).join(" · ")}
              {lista.no_encontrados.length > 30 && " …"}
            </div>
          )}
          <AnulTablaDetalle titulo="REGISTROS ENCONTRADOS" filas={lista.detalle} />
        </div>
      )}
    </div>
  );
}

// ── IMPORTAR TENENCIA: pisa Valuaciones.AuM con el Excel del contable ─────────
// Parsea el Excel en el cliente, PREVISUALIZA contra el backend (commit=false) y
// recién con confirmación explícita APLICA (commit=true). Pisa por (fecha,cuenta),
// idempotente. Pensado para corregir los fines de mes que el job dejó mal.
type ImportResp = {
  ok: boolean; error?: string; modo?: string;
  n_filas?: number; n_validas?: number; n_errores?: number;
  errores?: { fila: number; detalle: string }[];
  fechas?: string[]; cuentas?: string[]; n_cuentas?: number;
  total_valuacion?: number;
  columnas_detectadas?: string[];                    // headers que leyó del Excel
  matchean?: number; sin_match?: number;             // modo precios (preview)
  aplicado?: boolean; filas_actualizadas?: number;   // modo precios (commit)
  borrados?: number; insertados?: number;            // modo aum (commit)
};

// Paso 2: recalcular valuación (precio×cantidad, /100 renta fija). Divisor por CARTERA.
type RecalcResp = {
  ok: boolean; error?: string; aplicado?: boolean; filas_actualizadas?: number;
  n_recalculadas?: number; total_antes?: number; total_despues?: number;
  carteras?: { cartera: string; divisor: number; n: number;
               total_antes: number; total_despues: number; delta: number }[];
  sin_clasificar?: { cartera: string; n: number; total_antes: number }[];
};

export function ImportTenenciaPanel() {
  const [modo, setModo] = useState<"precios" | "aum">("precios");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [prev, setPrev] = useState<ImportResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recalc, setRecalc] = useState<RecalcResp | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const cambiarModo = (m: "precios" | "aum") => {
    setModo(m); setRows([]); setFileName(""); setPrev(null); setMsg(null); setRecalc(null);
  };

  const descargarPlantilla = async () => {
    const XLSX = await import("xlsx");
    const aoa = modo === "precios"
      ? [["unidad", "precio", "fecha"], ["[5921] AL30", 91320, "2026-04-30"]]
      : [["Cuenta", "Unidad", "Cantidad", "Fecha", "Precio", "Valuación"],
         ["[805] MOLLO NICOLAS", "[5921] AL30", 100, "2026-04-30", 91320, 91320]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, modo);
    XLSX.writeFile(wb, `plantilla_${modo}.xlsx`);
  };

  const onFile = async (file: File) => {
    setMsg(null); setPrev(null); setRecalc(null); setRows([]); setFileName(file.name);
    try {
      const json = await readSheetRows(file);
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      // El backend mapea las columnas (acepta Unidad/Precio/Fecha/Cuenta/... con o sin
      // mayúscula) → mandamos las filas crudas y validamos contra la previsualización.
      setRows(json);
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const enviar = async (commit: boolean) => {
    if (busy || !rows.length) return;
    setBusy(true); setMsg(null); setRecalc(null);
    const url = modo === "precios"
      ? "/api/manager/import-precios-sql" : "/api/manager/import-aum-sql";
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, commit }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
        throw new Error(detail);
      }
      const j: ImportResp = await res.json();
      setPrev(j);
      if (j.aplicado) {
        const txt = modo === "precios"
          ? `✓ ${j.filas_actualizadas ?? 0} precios actualizados. (La valuación se recalcula en el paso 2.)`
          : `✓ ${j.insertados ?? 0} filas insertadas, ${j.borrados ?? 0} reemplazadas.`;
        setMsg({ ok: true, text: txt });
      } else if (!commit) {
        setMsg({ ok: true, text: "Previsualización lista. Revisá y confirmá para aplicar." });
      }
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  // Paso 2 — recalcular valuación de las fechas recién importadas (divisor por cartera).
  const recalcularValuacion = async (commit: boolean) => {
    const fechas = prev?.fechas ?? [];
    if (recalcBusy || !fechas.length) return;
    setRecalcBusy(true);
    try {
      const res = await fetch("/api/manager/recalcular-valuacion-sql", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechas, commit }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
        throw new Error(detail);
      }
      const j: RecalcResp = await res.json();
      setRecalc(j);
      if (j.aplicado) setMsg({ ok: true, text: `✓ ${j.filas_actualizadas ?? 0} valuaciones recalculadas.` });
    } catch (e) {
      setMsg({ ok: false, text: `Error recalculando: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRecalcBusy(false);
    }
  };

  const money = (n: number | undefined) =>
    "$" + (n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full overflow-y-auto p-4 text-[12px] text-[var(--t-text)]">
      <div className="max-w-[820px] space-y-4">
        {/* Selector de modo */}
        <div className="flex items-center gap-2">
          <Pill label="PRECIOS" active={modo === "precios"} onClick={() => cambiarModo("precios")} />
          <Pill label="IMPORTAR AUM" active={modo === "aum"} onClick={() => cambiarModo("aum")} />
        </div>

        <div>
          {modo === "precios" ? (
            <>
              <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">PRECIOS → TENENCIA</h2>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                Excel con <code className="text-[var(--t-text)]">unidad · precio · fecha</code>. Actualiza el{" "}
                <code className="text-[var(--t-text)]">precio</code> por (fecha, unidad). La valuación NO se
                recalcula acá (paso 2: precio×cantidad, /100 para bonos).
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">IMPORTAR AUM → TENENCIA</h2>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                Excel con <code className="text-[var(--t-text)]">Cuenta · Unidad · Cantidad · Fecha · Precio · Valuación</code>.
                Pisa las tenencias de cada fecha (idempotente: re-subir reemplaza). El resto de columnas las resuelve la vista.
              </p>
            </>
          )}
          <button onClick={descargarPlantilla}
            className="mt-2 px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]">
            ↓ DESCARGAR PLANTILLA
          </button>
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <label className="inline-block px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]">
            ELEGIR ARCHIVO (.xlsx / .csv)
            <input type="file" accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
              className="hidden" />
          </label>
          {fileName && rows.length > 0 && (
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text)]">{fileName}</span> · {rows.length.toLocaleString("es-AR")} filas
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => enviar(false)} disabled={busy}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-50">
                {busy ? "…" : "1) PREVISUALIZAR"}
              </button>
              {prev && (prev.n_validas ?? 0) > 0 && !prev.aplicado && (
                <button onClick={() => enviar(true)} disabled={busy}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50">
                  {busy ? "Aplicando…" : `2) CONFIRMAR E IMPORTAR (${prev.n_validas})`}
                </button>
              )}
            </div>
          )}
          {msg && <div className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</div>}
        </div>

        {prev && (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-2">
            <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">PREVISUALIZACIÓN</div>
            <div className="flex flex-wrap gap-6">
              <OpsStat label="FILAS OK" value={(prev.n_validas ?? 0).toLocaleString("es-AR")} />
              <OpsStat label="ERRORES" value={(prev.n_errores ?? 0).toLocaleString("es-AR")} />
              {modo === "precios" ? (
                <>
                  <OpsStat label="MATCHEAN" value={(prev.matchean ?? 0).toLocaleString("es-AR")} />
                  <OpsStat label="SIN MATCH" value={(prev.sin_match ?? 0).toLocaleString("es-AR")} />
                </>
              ) : (
                <>
                  <OpsStat label="CUENTAS" value={String(prev.n_cuentas ?? 0)} />
                  <OpsStat label="VALUACIÓN TOTAL" value={"$" + (prev.total_valuacion ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })} />
                </>
              )}
            </div>
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text-dim)]">Fechas:</span> {(prev.fechas ?? []).join(", ") || "—"}
            </div>
            {prev.columnas_detectadas && prev.columnas_detectadas.length > 0 && (
              <div className="text-[var(--t-text-muted)] text-[10px]">
                <span className="text-[var(--t-text-dim)]">Columnas detectadas:</span>{" "}
                {prev.columnas_detectadas.map((c) => `"${c}"`).join(" · ")}
              </div>
            )}
            {prev.errores && prev.errores.length > 0 && (
              <div className="text-red-400 text-[11px]">
                <div className="font-semibold">Filas con error (no se importan):</div>
                {prev.errores.slice(0, 20).map((e) => (
                  <div key={e.fila}>fila {e.fila}: {e.detalle}</div>
                ))}
                {prev.errores.length > 20 ? <div>… +{prev.errores.length - 20} más</div> : null}
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: recalcular valuación (sólo tras importar PRECIOS) ── */}
        {modo === "precios" && prev?.aplicado && (prev.fechas?.length ?? 0) > 0 && (
          <div className="border border-[var(--t-accent)]/40 bg-[var(--t-panel)] p-3 space-y-3">
            <div>
              <h3 className="text-[12px] font-semibold text-[var(--t-accent)] tracking-wide">
                PASO 2 → RECALCULAR VALUACIÓN
              </h3>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                <code className="text-[var(--t-text)]">valuación = cantidad × precio</code> (÷100 para renta fija:
                carteras HD · DL · ARS). FCI · RENTA VARIABLE · MONEDAS · DERIVADOS van directo. Las carteras
                sin regla (ej. FINANCIAMIENTO) <span className="text-[var(--t-text)]">NO se tocan</span>.
                Fechas: {(prev.fechas ?? []).join(", ")}.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => recalcularValuacion(false)} disabled={recalcBusy}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-50">
                {recalcBusy ? "…" : "PREVISUALIZAR ANTES/DESPUÉS"}
              </button>
              {recalc && (recalc.n_recalculadas ?? 0) > 0 && !recalc.aplicado && (
                <button onClick={() => recalcularValuacion(true)} disabled={recalcBusy}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50">
                  {recalcBusy ? "Aplicando…" : `APLICAR (${recalc.n_recalculadas})`}
                </button>
              )}
            </div>

            {recalc && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-6">
                  <OpsStat label="VALUACIÓN ANTES" value={money(recalc.total_antes)} />
                  <OpsStat label="VALUACIÓN DESPUÉS" value={money(recalc.total_despues)} />
                  <OpsStat label="Δ" value={money((recalc.total_despues ?? 0) - (recalc.total_antes ?? 0))} />
                </div>
                {recalc.carteras && recalc.carteras.length > 0 && (
                  <table className="w-full text-[11px]">
                    <thead className="text-[var(--t-text-muted)] text-left">
                      <tr>
                        <th className="py-1">CARTERA</th><th>÷</th><th className="text-right">FILAS</th>
                        <th className="text-right">ANTES</th><th className="text-right">DESPUÉS</th><th className="text-right">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalc.carteras.map((c) => (
                        <tr key={c.cartera} className="border-t border-[var(--t-border)]">
                          <td className="py-1 text-[var(--t-text)]">{c.cartera}</td>
                          <td className="text-[var(--t-text-dim)]">{c.divisor}</td>
                          <td className="text-right">{c.n.toLocaleString("es-AR")}</td>
                          <td className="text-right text-[var(--t-text-dim)]">{money(c.total_antes)}</td>
                          <td className="text-right text-[var(--t-text)]">{money(c.total_despues)}</td>
                          <td className={"text-right " + (c.delta >= 0 ? "text-green-400" : "text-red-400")}>{money(c.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {recalc.sin_clasificar && recalc.sin_clasificar.length > 0 && (
                  <div className="text-[11px] text-amber-400">
                    <div className="font-semibold">Carteras SIN regla (no se tocan — definí el divisor):</div>
                    {recalc.sin_clasificar.map((s) => (
                      <div key={s.cartera}>{s.cartera}: {s.n.toLocaleString("es-AR")} filas · {money(s.total_antes)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
