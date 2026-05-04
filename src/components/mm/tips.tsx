// Diccionario centralizado de tips para la vista MM. Cada tip explica
// qué es la métrica, cómo se interpreta y para qué sirve. Usado por
// <InfoIcon tip={tips.mid} />.
//
// Referencias: Cartea/Jaimungal/Penalva, "Algorithmic and High-Frequency
// Trading" (2015), capítulos 1-4.
import type { ReactNode } from "react";

export const tips: Record<string, ReactNode> = {
  // ── Cap 1 — Book metrics ──
  mid: (
    <>
      <h4>MIDPRICE</h4>
      <p>
        Promedio simple del mejor bid y mejor ask:{" "}
        <code>S = (a + b) / 2</code>.
      </p>
      <p>
        Es el proxy del <strong>precio justo</strong>: ni pagás por comprar (ask)
        ni recibís por vender (bid).
      </p>
      <p>
        Para análisis de microestructura conviene usar mid en lugar del last
        price porque el last tiene <em>bid-ask bounce</em> (autocorrelación
        negativa artificial).
      </p>
      <p>
        Limitación: ignora la profundidad. Si hay mucho volumen del lado bid y
        poco del ask, el precio "real" no está exactamente en el medio — para
        eso existe el microprice.
      </p>
    </>
  ),
  microprice: (
    <>
      <h4>MICROPRICE</h4>
      <p>
        Versión refinada del midprice ajustada por el order book imbalance:
        <br />
        <code>Microprice = S + (OBI / 2) · QS</code>
      </p>
      <p>
        Es un promedio ponderado de bid y ask donde cada lado pesa por el{" "}
        <strong>volumen del lado opuesto</strong>. Si hay mucho size en el bid
        (presión compradora), el microprice se acerca al ask.
      </p>
      <p>
        <strong>Mejor predictor</strong> del próximo precio de trade que el mid
        simple. Cuando hay imbalance, el mid subestima dónde está el verdadero
        valor.
      </p>
    </>
  ),
  obi: (
    <>
      <h4>ORDER BOOK IMBALANCE (OBI)</h4>
      <p>
        Mide el desbalance entre la profundidad del bid y del ask en el top:
        <br />
        <code>I = (V_b - V_a) / (V_b + V_a)</code>
      </p>
      <p>Rango ∈ [-1, +1]:</p>
      <ul>
        <li>
          <strong>+1</strong> · todo el volumen está en el bid → presión
          compradora extrema.
        </li>
        <li>
          <strong>0</strong> · bid y ask balanceados.
        </li>
        <li>
          <strong>-1</strong> · todo en el ask → presión vendedora extrema.
        </li>
      </ul>
      <p>
        Predice movimientos del mid: imbalance positivo → próximo trade
        probable al ask → mid tiende a subir.
      </p>
    </>
  ),
  qs: (
    <>
      <h4>QUOTED SPREAD</h4>
      <p>
        Diferencia entre el mejor ask y el mejor bid:{" "}
        <code>QS = a - b</code>.
      </p>
      <p>
        Es el spread <strong>publicado</strong> en el book. Mostrado en bps
        relativo al mid: <code>QS / S × 10000</code>.
      </p>
      <p>
        Acotado por abajo por el tick size. Si comprás al ask y vendés al bid
        inmediatamente, perdés el spread completo. Para el costo real ejecutado
        ver <strong>Effective Spread</strong>.
      </p>
      <p>
        Determinado teóricamente por <em>selección adversa</em>{" "}
        (Glosten-Milgrom) e <em>inventory risk</em> (Grossman-Miller).
      </p>
    </>
  ),

  bookL2: (
    <>
      <h4>ORDER BOOK L2</h4>
      <p>
        Estructura central del mercado: lista doble de órdenes con precio y
        size. Bids ordenados de mayor a menor precio; asks de menor a mayor.
      </p>
      <p>Tipos de órdenes:</p>
      <ul>
        <li>
          <strong>Limit (LO)</strong> — precio especificado. Se queda en el
          book esperando ejecutarse. Provee liquidez.
        </li>
        <li>
          <strong>Market (MO)</strong> — sin precio. Ejecuta inmediatamente al
          mejor disponible. Consume liquidez.
        </li>
      </ul>
      <p>
        Prioridad: precio (mejor primero), después tiempo (FIFO). Captura full
        del book hoy: <code>AL30 - CI</code>.
      </p>
    </>
  ),

  // ── Cap 4 — Tape enriquecido ──
  effectiveSpread: (
    <>
      <h4>EFFECTIVE SPREAD (ES)</h4>
      <p>
        Lo que <strong>realmente pagaste</strong> por encima del mid al
        ejecutar:
        <br />
        <code>ES = |trade.price - mid_at_trade|</code>
      </p>
      <p>
        Distinto al quoted spread porque puede diferir por:
      </p>
      <ul>
        <li>
          <strong>Walking the book</strong> · orden grande consume varios
          niveles → ES MAYOR que QS/2.
        </li>
        <li>
          Hidden orders / price improvement · ES MENOR.
        </li>
      </ul>
      <p>
        Métrica estándar de TCA. Acá lo reportamos en bps relativo al mid.
      </p>
    </>
  ),
  leeReady: (
    <>
      <h4>LEE-READY ALGORITHM</h4>
      <p>
        Clasifica un trade como buy MO o sell MO sin saber qué dijo el
        broker:
      </p>
      <ul>
        <li>
          Trade ejecutó <strong>arriba</strong> del mid → BUY MO (alguien
          pegó al ask).
        </li>
        <li>
          Trade ejecutó <strong>abajo</strong> del mid → SELL MO (alguien
          pegó al bid).
        </li>
        <li>Trade en el mid exacto → ambiguo (MID).</li>
      </ul>
      <p>
        Acá lo cross-checkeamos contra el <code>side</code> reportado por
        pyRofex. Si difieren (flag <strong>!</strong>) suele indicar que el
        mid del momento no estaba representativo (book stale).
      </p>
      <p>Lee & Ready (1991).</p>
    </>
  ),
  walking: (
    <>
      <h4>WALKING THE BOOK</h4>
      <p>
        Trade agresivo que consume <strong>varios niveles consecutivos</strong>{" "}
        del LOB porque el top no tiene profundidad suficiente.
      </p>
      <p>
        Detección heurística: <code>trade.size &gt; top_size del lado</code>.
      </p>
      <p>
        Manifestación operativa del <em>temporary impact</em>. Trades que
        caminan inflan el effective spread.
      </p>
    </>
  ),

  // ── Cap 4 — Intraday ──
  nof: (
    <>
      <h4>NET ORDER FLOW (NOF)</h4>
      <p>
        Diferencia entre volumen de buy MOs y sell MOs por intervalo (Lee-Ready):
        <br />
        <code>π = V_buy_MO - V_sell_MO</code>
      </p>
      <p>
        <strong>Predictor central</strong> del movimiento del midprice (cap 4):
        <br />
        <code>ΔS = b · π + ε</code>
      </p>
      <p>
        NOF positivo acumulado en el día → presión compradora real (no solo
        intención visible en el book).
      </p>
    </>
  ),
  qES: (
    <>
      <h4>qES — QUANTITY-WEIGHTED EFFECTIVE SPREAD</h4>
      <p>
        Effective spread promedio ponderado por size del trade:
        <br />
        <code>qES = Σ(Q_i · ES_i) / Σ Q_i</code>
      </p>
      <p>
        Métrica estándar de TCA para comparar costo agregado entre
        brokers/activos/períodos.
      </p>
      <p>
        Por qué pesar por size: un trade chico al spread mínimo y un trade
        gigante caminando el book pesarían igual con un promedio simple. El
        qES refleja el costo total de transaccionar.
      </p>
    </>
  ),
  realizedVol: (
    <>
      <h4>VOLATILIDAD REALIZADA</h4>
      <p>
        Desvío estándar de los retornos a 1-trade dentro del bucket, calculados
        sobre el mid:
        <br />
        <code>σ_realizada = stdev(r_t)</code>
      </p>
      <p>
        Es la vol "real" del intervalo, no una estimación. Reportada en bps.
      </p>
      <p>
        Calculada sobre mid (no last) para evitar bid-ask bounce. A altas
        frecuencias el bounce infla artificialmente la vol.
      </p>
    </>
  ),
  walkingPct: (
    <>
      <h4>WALKING %</h4>
      <p>
        Proporción de trades del bucket que caminaron el book (size {">"} top
        depth del lado).
      </p>
      <p>
        Walking alto = trades agresivos, posible adverse selection.
        Combinado con NOF direccional sugiere "alguien con prisa que sabe
        algo".
      </p>
    </>
  ),

  // ── Cap 4 — Impact ──
  impactB: (
    <>
      <h4>PERMANENT IMPACT (b)</h4>
      <p>
        Estima cuánto se mueve el mid <strong>permanentemente</strong> por
        unidad de NOF:
        <br />
        <code>ΔS_n = b · π_n + ε_n</code>
      </p>
      <p>
        Es la versión empírica multi-tick del{" "}
        <strong>λ de Kyle</strong> y la manifestación de la{" "}
        <strong>selección adversa</strong> de Glosten-Milgrom: cada trade
        revela info, los MMs ajustan quotes hacia el nuevo nivel implícito.
      </p>
      <p>
        Mayor <code>b</code> → mercado menos líquido / más informacional. Cae
        con la liquidez del activo.
      </p>
      <p>
        Estimación: OLS sin intercepto sobre buckets de 1 min × N días, con
        winsorización 1% en cada cola.
      </p>
    </>
  ),
  impactK: (
    <>
      <h4>TEMPORARY IMPACT (k)</h4>
      <p>
        Estima el slippage por unidad de tamaño de orden:
        <br />
        <code>|S_exec - mid| = k · Q + ε</code>
      </p>
      <p>
        Costo de <strong>consumir liquidez</strong>. Después del trade el book
        se re-puebla y el mid vuelve cerca del nivel pre-trade — no se queda
        permanente como <code>b</code>.
      </p>
      <p>
        Mayor <code>k</code> → menor profundidad disponible. Se manifiesta
        operativamente como <em>walking the book</em>.
      </p>
      <p>
        Trade-off rápido vs lento: ejecutar rápido sufre más k pero menos
        exposición a vol. Base teórica de los algoritmos de ejecución óptima
        (Almgren-Chriss).
      </p>
    </>
  ),

  // ── Cap 4 — Smile ──
  smile: (
    <>
      <h4>SMILE INTRADIARIO</h4>
      <p>
        Patrón <strong>en U</strong> de volumen y volatilidad a lo largo del
        día:
      </p>
      <ul>
        <li>
          <strong>Apertura</strong> · pico — digestión de noticias overnight,
          descubrimiento de precio.
        </li>
        <li>
          <strong>Mediodía</strong> · mínimo — calma sostenida, almuerzo de
          traders, algoritmos institucionales bajan actividad.
        </li>
        <li>
          <strong>Cierre</strong> · pico mayor — rebalanceo de funds (NAV),
          VWAP final, hedging, posicionamiento overnight.
        </li>
      </ul>
      <p>
        Aparece en TODOS los activos, en TODOS los días. Universal. Base de
        algoritmos VWAP y POV.
      </p>
    </>
  ),

  // ── Cap 3 — Stylized facts ──
  skewness: (
    <>
      <h4>SKEWNESS (ASIMETRÍA)</h4>
      <p>
        Tercer momento estandarizado:{" "}
        <code>S = E[(r - μ)³] / σ³</code>.
      </p>
      <ul>
        <li>
          <strong>S &gt; 0</strong> · cola derecha más larga (subas extremas
          más probables).
        </li>
        <li>
          <strong>S = 0</strong> · simétrica (normal teórica).
        </li>
        <li>
          <strong>S &lt; 0</strong> · cola izquierda más larga (caídas
          extremas más probables) — típico en finanzas por leverage effect.
        </li>
      </ul>
    </>
  ),
  kurtosis: (
    <>
      <h4>KURTOSIS (CURTOSIS)</h4>
      <p>
        Cuarto momento estandarizado:{" "}
        <code>K = E[(r - μ)⁴] / σ⁴</code>.
      </p>
      <ul>
        <li>
          <strong>K = 3</strong> · normal teórica.
        </li>
        <li>
          <strong>K &gt; 3</strong> · leptocúrtica → colas pesadas, eventos
          extremos más frecuentes que la normal.
        </li>
        <li>
          <strong>K &lt; 3</strong> · platicúrtica.
        </li>
      </ul>
      <p>
        Cap 3 stylized fact #1: los retornos financieros tienen K {">"} 3{" "}
        <strong>universalmente</strong>. Eventos "imposibles" bajo normal son
        frecuentes.
      </p>
    </>
  ),
  acf1: (
    <>
      <h4>ACF LAG 1</h4>
      <p>
        Autocorrelación de un retorno con el retorno anterior. Mide
        persistencia de muy corto plazo.
      </p>
      <p>Calculado sobre dos series:</p>
      <ul>
        <li>
          <strong>Sobre mid</strong> · esperás ≈ 0. Eficiencia direccional —
          el siguiente retorno no es predecible.
        </li>
        <li>
          <strong>Sobre last</strong> · esperás &lt; 0. Es el{" "}
          <em>bid-ask bounce</em>: los precios rebotan entre bid y ask, los
          retornos consecutivos tienen signos opuestos.
        </li>
      </ul>
      <p>El bounce no es predictividad económica — cruzarlo cuesta el spread.</p>
    </>
  ),
  acfAbs: (
    <>
      <h4>ACF DE |r| — VOLATILITY CLUSTERING</h4>
      <p>
        Autocorrelación de los retornos absolutos a varios lags. Cap 3
        stylized fact #3:
      </p>
      <ul>
        <li>
          ACF de <code>r_t</code> ≈ 0 → la <strong>dirección</strong> no es
          predecible.
        </li>
        <li>
          ACF de <code>|r_t|</code> {">"} 0 y persistente → la{" "}
          <strong>magnitud</strong> sí lo es. Días volátiles se agrupan.
        </li>
      </ul>
      <p>
        "Persistencia" = cuántos lags entre 1 y 20 tienen ACF {">"} 0.05.
        Si {">"} 5, hay clustering claro. Modelos GARCH lo capturan.
      </p>
    </>
  ),
  jarqueBera: (
    <>
      <h4>JARQUE-BERA TEST</h4>
      <p>
        Test formal de normalidad. Estadístico:
        <br />
        <code>JB = (n / 6) · [S² + (K - 3)² / 4]</code>
      </p>
      <p>
        Bajo nula de normalidad sigue χ²(2). Lectura del p-value:
      </p>
      <ul>
        <li>
          <strong>p &lt; 0.05</strong> · rechaza normalidad al 5% (caso
          típico en retornos financieros).
        </li>
        <li>
          <strong>p ≥ 0.05</strong> · no se rechaza normalidad.
        </li>
      </ul>
      <p>
        Sensible al tamaño de muestra: muestras grandes rechazan casi
        siempre. Combinar con QQ-plot para diagnóstico visual.
      </p>
    </>
  ),
};
