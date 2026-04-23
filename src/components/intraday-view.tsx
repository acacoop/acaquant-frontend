"use client";

import { useEffect, useMemo, useState } from "react";

// Herramienta de sesión: procesa el CSV 100% en el browser, persiste en
// sessionStorage (sobrevive navegar y recargar, solo para el usuario que
// subió). Para compartir entre usuarios haría falta un endpoint backend.

interface ResumenFila {
  simbolo: string;
  moneda: string;
  plazo: string;       // 'CI' | '24hs' | 'otro'
  especie: string;     // ticker base sin sufijo D/C (ej AL30D → AL30)
  cantidad_neta: number;
  turnover_neto: number;
  operaciones: number;
}

interface Resultado {
  archivo: string;
  timestamp: number;
  filasCrudas: number;
  filasFiltradas: number;
  resumen: ResumenFila[];
}

const CLIENT_ID_FILTRO = "255";
const STORAGE_KEY = "intraday_consolidado_v1";

const ALIAS_COLS = {
  clientId: ["Client ID"],
  simbolo:  ["Symbol", "Simbolo", "Símbolo"],
  punta:    ["Side", "Punta"],
  cantEjec: ["Executed Size", "Cantidad Ejecutada"],
  turnover: ["Turnover"],
} as const;

const COMPRAR_VALS = new Set(["COMPRAR", "COMPRA", "BUY", "B"]);
const VENDER_VALS  = new Set(["VENDER", "VENTA", "SELL", "S"]);

type FiltroPlazo = "todos" | "CI" | "24hs";

function detectarMoneda(simbolo: string): string {
  const s = (simbolo || "").toUpperCase();
  if (s.includes("PESOS") || s.includes("ARS")) return "ARS";
  if (s.includes("USD") || s.includes("DOLAR") || s.includes("DÓLAR")) return "USD";
  return "otro";
}

function detectarPlazo(simbolo: string): string {
  const s = simbolo || "";
  // Divisa (PESOS/DOLAR) siempre es CI, sin importar qué token traiga.
  const u = s.toUpperCase();
  if (u.includes("PESOS") || u.includes("DOLAR") || u.includes("DÓLAR")) return "CI";
  if (s.includes("-0001-")) return "CI";
  if (s.includes("-0002-")) return "24hs";
  return "otro";
}

function extraerEspecie(simbolo: string): string {
  // Primer token antes del '-'. Si termina en 'D' o 'C' (sufijo de
  // moneda en bonos soberanos: D=MEP/USD, C=CCL), lo saca. Ej:
  //   AL30D-0001-C-CT-USD → AL30D → AL30
  //   AL30-0001-C-CT-ARS  → AL30  → AL30
  //   GGAL-...            → GGAL  → GGAL
  const base = (simbolo || "").split("-")[0] || simbolo;
  const last = base.slice(-1);
  if ((last === "D" || last === "C") && base.length > 1) {
    return base.slice(0, -1);
  }
  return base;
}

function parseNumero(s: string): number {
  if (!s) return 0;
  const clean = s.trim();
  if (!clean) return 0;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = clean.replace(/,/g, "");
  } else {
    normalized = clean;
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const sep = firstLine.includes(";") ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (c === sep && !inQuotes) {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]).map(stripQuotes);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = stripQuotes(values[j] ?? "");
    });
    rows.push(row);
  }
  return { headers, rows };
}

function resolverCol(headers: string[], alias: readonly string[]): string | null {
  for (const a of alias) {
    if (headers.includes(a)) return a;
  }
  return null;
}

function consolidar(fileName: string, text: string): Resultado {
  const { headers, rows } = parseCSV(text);

  const colClient = resolverCol(headers, ALIAS_COLS.clientId);
  const colSimb   = resolverCol(headers, ALIAS_COLS.simbolo);
  const colPunta  = resolverCol(headers, ALIAS_COLS.punta);
  const colCant   = resolverCol(headers, ALIAS_COLS.cantEjec);
  const colTurn   = resolverCol(headers, ALIAS_COLS.turnover);

  const faltantes = [
    !colClient && ALIAS_COLS.clientId[0],
    !colSimb && ALIAS_COLS.simbolo.join("/"),
    !colPunta && ALIAS_COLS.punta.join("/"),
    !colCant && ALIAS_COLS.cantEjec.join("/"),
    !colTurn && ALIAS_COLS.turnover[0],
  ].filter(Boolean) as string[];
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan columnas: ${faltantes.join(", ")}. Presentes: ${headers.join(", ")}`,
    );
  }

  const filasFiltradas = rows.filter(
    (r) => (r[colClient!] ?? "").trim() === CLIENT_ID_FILTRO,
  );

  const porSimbolo = new Map<string, ResumenFila>();
  for (const r of filasFiltradas) {
    const simbolo = r[colSimb!] || "";
    const puntaRaw = (r[colPunta!] || "").toUpperCase().trim();
    const signo = COMPRAR_VALS.has(puntaRaw) ? 1 : VENDER_VALS.has(puntaRaw) ? -1 : 0;
    const cant = parseNumero(r[colCant!] || "");
    const turn = parseNumero(r[colTurn!] || "");
    const cantFirmada = cant * signo;
    const turnFirmado = turn * -signo;

    const prev = porSimbolo.get(simbolo);
    if (prev) {
      prev.cantidad_neta += cantFirmada;
      prev.turnover_neto += turnFirmado;
      prev.operaciones += 1;
    } else {
      porSimbolo.set(simbolo, {
        simbolo,
        moneda:  detectarMoneda(simbolo),
        plazo:   detectarPlazo(simbolo),
        especie: extraerEspecie(simbolo),
        cantidad_neta: cantFirmada,
        turnover_neto: turnFirmado,
        operaciones: 1,
      });
    }
  }

  return {
    archivo: fileName,
    timestamp: Date.now(),
    filasCrudas: rows.length,
    filasFiltradas: filasFiltradas.length,
    resumen: Array.from(porSimbolo.values()),
  };
}

function fmtNum(n: number, d = 2): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function monedaColor(moneda: string): string {
  if (moneda === "ARS") return "#4fc3f7";
  if (moneda === "USD") return "#00cc66";
  return "#888";
}

const MONEDA_ORDEN: Record<string, number> = { ARS: 0, USD: 1, otro: 2 };

export function IntradayView() {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroPlazo>("todos");

  // Al montar, restaurar el último consolidado de sessionStorage.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Resultado;
        if (parsed?.resumen && Array.isArray(parsed.resumen)) {
          setResultado(parsed);
        }
      }
    } catch {
      /* storage corrupto o disabled — no pasa nada */
    }
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      const text = await file.text();
      const r = consolidar(file.name, text);
      setResultado(r);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r));
      } catch {
        /* quota excedida o browser privado — fallamos silenciosamente */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = "";
    }
  };

  const limpiar = () => {
    setResultado(null);
    setError(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  // Resumen filtrado por plazo + ordenado por (moneda, turnover desc).
  const resumenFiltrado = useMemo(() => {
    if (!resultado) return [];
    const filtrado = filtro === "todos"
      ? resultado.resumen
      : resultado.resumen.filter((r) => r.plazo === filtro);
    return [...filtrado].sort((a, b) => {
      const ma = MONEDA_ORDEN[a.moneda] ?? 9;
      const mb = MONEDA_ORDEN[b.moneda] ?? 9;
      if (ma !== mb) return ma - mb;
      return b.turnover_neto - a.turnover_neto;
    });
  }, [resultado, filtro]);

  // Totales por moneda (sobre el filtrado).
  const totalesPorMoneda = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resumenFiltrado) {
      map.set(r.moneda, (map.get(r.moneda) ?? 0) + r.turnover_neto);
    }
    return Array.from(map.entries())
      .map(([moneda, turnoverTotal]) => ({ moneda, turnoverTotal }))
      .sort((a, b) => (MONEDA_ORDEN[a.moneda] ?? 9) - (MONEDA_ORDEN[b.moneda] ?? 9));
  }, [resumenFiltrado]);

  // Consolidado por especie (agrupa AL30/AL30D/AL30C → AL30).
  // Usa la cantidad neta — sirve para chequear descalce de títulos
  // independientemente de la moneda (si vendiste 100 AL30 ARS y
  // compraste 100 AL30D USD, estás flat en especie).
  const consolidadoPorEspecie = useMemo(() => {
    const map = new Map<string, { especie: string; cantidad_neta: number }>();
    for (const r of resumenFiltrado) {
      const prev = map.get(r.especie);
      if (prev) prev.cantidad_neta += r.cantidad_neta;
      else map.set(r.especie, { especie: r.especie, cantidad_neta: r.cantidad_neta });
    }
    return Array.from(map.values())
      .sort((a, b) => Math.abs(b.cantidad_neta) - Math.abs(a.cantidad_neta));
  }, [resumenFiltrado]);

  const hayDatos = resultado && resultado.filasFiltradas > 0;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3 overflow-hidden">
      {/* Upload + filtros */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0 flex-wrap">
        <label className="px-3 py-1.5 text-[11px] font-semibold tracking-wide border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black cursor-pointer transition-colors">
          EXAMINAR ARCHIVO
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </label>
        <span className="text-[11px] text-[#888] font-mono truncate max-w-[280px]">
          {resultado?.archivo || "Ningún archivo seleccionado"}
        </span>

        {resultado && (
          <>
            <div className="h-5 w-px bg-[#222]" />

            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-[#555] mr-1">
                Plazo:
              </span>
              {(["todos", "CI", "24hs"] as FiltroPlazo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setFiltro(p)}
                  className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
                    filtro === p
                      ? "bg-[#ff9900] text-black border-[#ff9900]"
                      : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                  }`}
                >
                  {p === "todos" ? "AMBOS" : p.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={limpiar}
              className="text-[10px] text-[#555] hover:text-[#ff3333] underline"
              title="Borra el consolidado de la sesión"
            >
              limpiar
            </button>

            <div className="ml-auto flex items-center gap-3 text-[10px] text-[#888] font-mono">
              <span>{resultado.filasCrudas} filas totales</span>
              <span className="text-[#ff9900]">
                {resultado.filasFiltradas} con Client ID {CLIENT_ID_FILTRO}
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {!resultado && !error && (
        <div className="flex-1 flex items-center justify-center text-[#555] text-[12px] text-center px-6">
          Cargá un CSV con las columnas: Client ID, Symbol/Símbolo, Side/Punta,
          Executed Size/Cantidad Ejecutada, Turnover.
        </div>
      )}

      {resultado && resultado.filasFiltradas === 0 && (
        <div className="flex-1 flex items-center justify-center text-[#888] text-[12px]">
          Sin operaciones con Client ID = {CLIENT_ID_FILTRO} en este archivo.
        </div>
      )}

      {hayDatos && (
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_auto] gap-3 overflow-hidden">
          {/* Tabla consolidada (agrupada visualmente por moneda). */}
          <div className="overflow-y-auto border border-[#1a1a1a] bg-[#080808]">
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead className="sticky top-0 bg-[#0c0c0c] z-10">
                <tr className="border-b border-[#1a1a1a] text-[10px] uppercase tracking-wide text-[#ff9900]">
                  <th className="!px-2 !py-1.5 text-left">Símbolo</th>
                  <th className="!px-2 !py-1.5 text-center">Moneda</th>
                  <th className="!px-2 !py-1.5 text-center">Plazo</th>
                  <th className="!px-2 !py-1.5 text-right">Ops</th>
                  <th className="!px-2 !py-1.5 text-right">Cantidad neta</th>
                  <th className="!px-2 !py-1.5 text-right">Turnover neto</th>
                </tr>
              </thead>
              <tbody>
                {resumenFiltrado.map((r, i) => {
                  const prev = resumenFiltrado[i - 1];
                  const divisor = !prev || prev.moneda !== r.moneda;
                  return (
                    <tr
                      key={r.simbolo}
                      className={`border-b border-[#111] hover:bg-[#ff9900]/5 ${
                        divisor ? "border-t-2 border-t-[#1a1a1a]" : ""
                      }`}
                    >
                      <td className="!px-2 !py-1 text-[#d0d0d0]">{r.simbolo}</td>
                      <td
                        className="!px-2 !py-1 text-center font-semibold"
                        style={{ color: monedaColor(r.moneda) }}
                      >
                        {r.moneda}
                      </td>
                      <td className="!px-2 !py-1 text-center text-[#888]">{r.plazo}</td>
                      <td className="!px-2 !py-1 text-right text-[#888]">
                        {r.operaciones}
                      </td>
                      <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                        {fmtNum(r.cantidad_neta, 0)}
                      </td>
                      <td
                        className="!px-2 !py-1 text-right font-semibold"
                        style={{ color: r.turnover_neto >= 0 ? "#00cc66" : "#ff3333" }}
                      >
                        {fmtNum(r.turnover_neto)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sidebar derecho: totales + consolidado por especie */}
          <div className="shrink-0 w-96 flex flex-col gap-3 overflow-hidden">
            <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 flex flex-col gap-2 shrink-0">
              <div className="text-[9px] uppercase tracking-widest text-[#ff9900]">
                Totales por moneda
              </div>
              {totalesPorMoneda.map((t) => (
                <div key={t.moneda} className="flex items-baseline justify-between">
                  <span
                    className="text-[10px] uppercase tracking-wide font-semibold"
                    style={{ color: monedaColor(t.moneda) }}
                  >
                    {t.moneda}
                  </span>
                  <span
                    className="text-[13px] font-mono font-bold"
                    style={{ color: t.turnoverTotal >= 0 ? "#00cc66" : "#ff3333" }}
                  >
                    {fmtNum(t.turnoverTotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Consolidado por especie (descalce de títulos) */}
            <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 flex flex-col overflow-hidden flex-1 min-h-0">
              <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-2 shrink-0">
                Consolidado por especie
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead className="sticky top-0 bg-[#0a0a0a]">
                    <tr className="text-[9px] uppercase tracking-wide text-[#555]">
                      <th className="!py-1 text-left">Especie</th>
                      <th className="!py-1 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidadoPorEspecie.map((e) => (
                      <tr key={e.especie} className="border-t border-[#1a1a1a]">
                        <td className="!py-1 text-[#d0d0d0]">{e.especie}</td>
                        <td
                          className="!py-1 text-right font-semibold"
                          style={{
                            color:
                              e.cantidad_neta === 0
                                ? "#888"
                                : e.cantidad_neta > 0
                                ? "#00cc66"
                                : "#ff3333",
                          }}
                        >
                          {fmtNum(e.cantidad_neta, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 pt-2 border-t border-[#1a1a1a] text-[9px] text-[#555] leading-relaxed shrink-0">
                Agrupa AL30/AL30D/AL30C como AL30. Si el neto es 0, estás
                flat en títulos más allá de la moneda.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
