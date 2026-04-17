import { apiFetch } from "@/lib/api";
import { Panel, Empty, fmtNum, fmtPrice, fmtVol } from "@/components/ui";

interface OpcionDoc {
  instrumento: string;
  tipo: string;
  strike: number;
  last: number;
  bid: number;
  offer: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  ev: number;
  spot: number;
  vence: string;
}

export default async function OpcionesPage() {
  let opciones: OpcionDoc[] = [];

  try {
    opciones = await apiFetch<OpcionDoc[]>("/api/cotizaciones/opciones");
  } catch {
    // API no disponible
  }

  const spot = opciones[0]?.spot;

  return (
    <div className="flex-1 p-3 space-y-3">
      <Panel
        title="OPCIONES GGAL"
        count={opciones.length}
        sub={spot ? `SPOT ${fmtNum(spot)}` : ""}
      >
        {opciones.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>STRIKE</th>
                  <th>TIPO</th>
                  <th className="text-right">BID</th>
                  <th className="text-right">ASK</th>
                  <th className="text-right">LAST</th>
                  <th className="text-right">IV</th>
                  <th className="text-right">DELTA</th>
                  <th className="text-right">GAMMA</th>
                  <th className="text-right">THETA</th>
                  <th className="text-right">VEGA</th>
                  <th className="text-right">EV</th>
                </tr>
              </thead>
              <tbody>
                {opciones
                  .sort(
                    (a, b) =>
                      a.strike - b.strike || (a.tipo > b.tipo ? 1 : -1)
                  )
                  .map((o) => (
                    <tr key={o.instrumento}>
                      <td className="font-semibold">{fmtNum(o.strike)}</td>
                      <td
                        className={
                          o.tipo === "CALL"
                            ? "text-[#00cc66]"
                            : "text-[#ff3333]"
                        }
                      >
                        {o.tipo}
                      </td>
                      <td className="text-right">{fmtPrice(o.bid)}</td>
                      <td className="text-right">{fmtPrice(o.offer)}</td>
                      <td className="text-right font-semibold">
                        {fmtPrice(o.last)}
                      </td>
                      <td className="text-right text-[#ffaa00]">
                        {o.iv ? (o.iv * 100).toFixed(1) + "%" : "--"}
                      </td>
                      <td className="text-right text-[#808080]">
                        {o.delta?.toFixed(3) || "--"}
                      </td>
                      <td className="text-right text-[#808080]">
                        {o.gamma?.toFixed(4) || "--"}
                      </td>
                      <td className="text-right text-[#808080]">
                        {o.theta?.toFixed(2) || "--"}
                      </td>
                      <td className="text-right text-[#808080]">
                        {o.vega?.toFixed(2) || "--"}
                      </td>
                      <td className="text-right text-[#555555]">
                        {o.ev ? fmtVol(o.ev) : "--"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
    </div>
  );
}
