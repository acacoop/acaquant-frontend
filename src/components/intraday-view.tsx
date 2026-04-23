"use client";

import { useState } from "react";

// Herramienta de sesión: procesa el CSV 100% en el browser, no sube nada
// al servidor, no persiste nada. Se ejecuta al cargar el archivo y
// muestra el consolidado en pantalla.

interface ResumenFila {
  simbolo: string;
  moneda: string;
  cantidad_neta: number;
  turnover_neto: number;
  operaciones: number;
}

const CLIENT_ID_FILTRO = "255";

// Alias por columna: el CSV puede venir en español o inglés. La primera
// key que exista en el header es la que se usa.
const ALIAS_COLS = {
  clientId:     ["Client ID"],
  simbolo:      ["Symbol", "Simbolo", "Símbolo"],
  punta:        ["Side", "Punta"],
  cantEjec:     ["Executed Size", "Cantidad Ejecutada"],
  turnover:     ["Turnover"],
} as const;

const COMPRAR_VALS = new Set(["COMPRAR", "COMPRA", "BUY", "B"]);
const VENDER_VALS  = new Set(["VENDER", "VENTA", "SELL", "S"]);

function detectarMoneda(simbolo: string): string {
  const s = (simbolo || "").toUpperCase();
  if (s.includes("PESOS") || s.includes("ARS")) return "ARS";
  if (s.includes("USD") || s.includes("DOLAR") || s.includes("DÓLAR")) return "USD";
  return "otro";
}

function parseNumero(s: string): number {
  // Acepta formato español (1.234,56) o inglés (1,234.56). Si hay ambos
  // separadores, el último es el decimal y el otro es de miles.
  if (!s) return 0;
  const clean = s.trim();
  if (!clean) return 0;
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // coma decimal, punto miles
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // punto decimal, coma miles
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
  // Detección de separador: ; (común en español/Excel) o , (estándar).
  const firstLine = text.split(/\r?\n/)[0] || "";
  const sep = firstLine.includes(";") ? ";" : ",";

  // Parseo que respeta comillas simples: los valores envueltos en "..." se
  // quedan con su contenido y se ignora el separador dentro.
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

interface Resultado {
  archivo: string;
  filasCrudas: number;
  filasFiltradas: number;
  resumen: ResumenFila[];
  totalesPorMoneda: { moneda: string; turnoverTotal: number }[];
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
    !colSimb && `${ALIAS_COLS.simbolo.join("/")}`,
    !colPunta && `${ALIAS_COLS.punta.join("/")}`,
    !colCant && `${ALIAS_COLS.cantEjec.join("/")}`,
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

  // Agrupación por símbolo.
  const porSimbolo = new Map<string, ResumenFila>();

  for (const r of filasFiltradas) {
    const simbolo = r[colSimb!] || "";
    const puntaRaw = (r[colPunta!] || "").toUpperCase().trim();
    const signo = COMPRAR_VALS.has(puntaRaw) ? 1 : VENDER_VALS.has(puntaRaw) ? -1 : 0;
    const cant = parseNumero(r[colCant!] || "");
    const turn = parseNumero(r[colTurn!] || "");
    const cantFirmada = cant * signo;
    const turnFirmado = turn * -signo;  // al revés

    const prev = porSimbolo.get(simbolo);
    if (prev) {
      prev.cantidad_neta += cantFirmada;
      prev.turnover_neto += turnFirmado;
      prev.operaciones += 1;
    } else {
      porSimbolo.set(simbolo, {
        simbolo,
        moneda: detectarMoneda(simbolo),
        cantidad_neta: cantFirmada,
        turnover_neto: turnFirmado,
        operaciones: 1,
      });
    }
  }

  const resumen = Array.from(porSimbolo.values()).sort(
    (a, b) => b.turnover_neto - a.turnover_neto,
  );

  // Totales por moneda.
  const totales = new Map<string, number>();
  for (const f of resumen) {
    totales.set(f.moneda, (totales.get(f.moneda) ?? 0) + f.turnover_neto);
  }
  const totalesPorMoneda = Array.from(totales.entries()).map(([moneda, turnoverTotal]) => ({
    moneda,
    turnoverTotal,
  }));

  return {
    archivo: fileName,
    filasCrudas: rows.length,
    filasFiltradas: filasFiltradas.length,
    resumen,
    totalesPorMoneda,
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

export function IntradayView() {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResultado(null);

    try {
      const text = await file.text();
      const r = consolidar(file.name, text);
      setResultado(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // Reset para que se pueda re-subir el mismo archivo.
      e.target.value = "";
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3 overflow-hidden">
      {/* Upload */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0">
        <label className="px-3 py-1.5 text-[11px] font-semibold tracking-wide border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black cursor-pointer transition-colors">
          EXAMINAR ARCHIVO
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </label>
        <span className="text-[11px] text-[#888] font-mono truncate">
          {fileName || "Ningún archivo seleccionado"}
        </span>
        {resultado && (
          <div className="ml-auto flex items-center gap-3 text-[10px] text-[#888] font-mono">
            <span>{resultado.filasCrudas} filas totales</span>
            <span className="text-[#ff9900]">
              {resultado.filasFiltradas} con Client ID {CLIENT_ID_FILTRO}
            </span>
          </div>
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

      {resultado && resultado.filasFiltradas > 0 && (
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_auto] gap-3 overflow-hidden">
          {/* Tabla consolidada */}
          <div className="overflow-y-auto border border-[#1a1a1a] bg-[#080808]">
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead className="sticky top-0 bg-[#0c0c0c] z-10">
                <tr className="border-b border-[#1a1a1a] text-[10px] uppercase tracking-wide text-[#ff9900]">
                  <th className="!px-2 !py-1.5 text-left">Símbolo</th>
                  <th className="!px-2 !py-1.5 text-center">Moneda</th>
                  <th className="!px-2 !py-1.5 text-right">Ops</th>
                  <th className="!px-2 !py-1.5 text-right">Cantidad neta</th>
                  <th className="!px-2 !py-1.5 text-right">Turnover neto</th>
                </tr>
              </thead>
              <tbody>
                {resultado.resumen.map((r) => (
                  <tr
                    key={r.simbolo}
                    className="border-b border-[#111] hover:bg-[#ff9900]/5"
                  >
                    <td className="!px-2 !py-1 text-[#d0d0d0]">{r.simbolo}</td>
                    <td
                      className="!px-2 !py-1 text-center font-semibold"
                      style={{ color: monedaColor(r.moneda) }}
                    >
                      {r.moneda}
                    </td>
                    <td className="!px-2 !py-1 text-right text-[#888]">
                      {r.operaciones}
                    </td>
                    <td className="!px-2 !py-1 text-right text-[#d0d0d0]">
                      {fmtNum(r.cantidad_neta, 0)}
                    </td>
                    <td
                      className="!px-2 !py-1 text-right font-semibold"
                      style={{
                        color: r.turnover_neto >= 0 ? "#00cc66" : "#ff3333",
                      }}
                    >
                      {fmtNum(r.turnover_neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales por moneda */}
          <div className="shrink-0 w-64 border border-[#1a1a1a] bg-[#0a0a0a] p-3 flex flex-col gap-3">
            <div className="text-[9px] uppercase tracking-widest text-[#ff9900]">
              Totales por moneda
            </div>
            {resultado.totalesPorMoneda.map((t) => (
              <div key={t.moneda} className="flex flex-col gap-0.5">
                <span
                  className="text-[10px] uppercase tracking-wide font-semibold"
                  style={{ color: monedaColor(t.moneda) }}
                >
                  {t.moneda}
                </span>
                <span
                  className="text-[14px] font-mono font-bold"
                  style={{
                    color: t.turnoverTotal >= 0 ? "#00cc66" : "#ff3333",
                  }}
                >
                  {fmtNum(t.turnoverTotal)}
                </span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-[#1a1a1a] text-[9px] text-[#555] leading-relaxed">
              Turnover: + vender, − comprar. Cantidad: + comprar, − vender.
              Procesado en memoria del browser — nada se sube al servidor.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
