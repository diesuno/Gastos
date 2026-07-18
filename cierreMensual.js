// ==========================================
// 🔄 SINCRONIZACIÓN DEL POOL DE PESOS CON EL DISPONIBLE
// ==========================================
// Antes esto "cerraba" un mes una sola vez (cuando quedaba en el pasado) y
// nunca lo volvía a tocar. Ahora es distinto: recorre cada mes (incluido el
// mes EN CURSO) y compara cuánto Disponible tiene hoy contra cuánto se le
// había sumado la última vez al pool de Pesos — si cambió, suma o resta la
// diferencia. Así el pool queda siempre al día en vivo, sin esperar a fin de
// mes, y sin duplicar plata que ya se sumó antes.
import { estadoApp } from './estado.js';
import { calcularFlujoDeMes } from './flujoMensual.js';
import { precioNominalSp500Usd, normalizarMovimientoInversion } from './utilidades.js';

// Devuelve true si sumó/restó algo (para saber si hay que guardar en la nube).
export function sincronizarPoolPesos() {
    let hoy = new Date();
    let anioActual = hoy.getFullYear(), mesActual = hoy.getMonth();
    let huboCambios = false;

    // Recorremos desde 24 meses atrás hasta el mes actual, incluido.
    for (let i = 24; i >= 0; i--) {
        let fechaIter = new Date(anioActual, mesActual - i, 1);
        let a = fechaIter.getFullYear(), m = fechaIter.getMonth();
        let key = `${a}-${(m + 1).toString().padStart(2, '0')}`;

        let flujo = calcularFlujoDeMes(a, m);
        // Si ese mes no tiene movimientos ni un aporte previo registrado, no
        // hay nada que hacer (evita ensuciar el registro con meses vacíos).
        if (flujo.movimientosDelMes.length === 0 && !(key in estadoApp.aportesPesosPorMes)) continue;

        let disponibleActual = flujo.esAvanzado ? flujo.dispReal : flujo.dispBasico;
        let aportePrevio = estadoApp.aportesPesosPorMes[key] || 0;
        let delta = disponibleActual - aportePrevio;

        if (delta !== 0) {
            estadoApp.patrimonio.pesos += delta;
            huboCambios = true;
        }
        estadoApp.aportesPesosPorMes[key] = disponibleActual;
    }
    return huboCambios;
}

// Rearma TODO el historial mensual del gráfico desde cero, repasando cada
// movimiento de Inversiones en el orden de su FECHA real (no de cuándo se
// cargó en la app) y acumulando cuánto había de cada pool después de cada
// uno. Así, si cargás una compra vieja (de hace 3 meses), el gráfico la
// ubica en el mes que corresponde, no en el mes actual.
//
// Para valuar S&P 500 en cada mes se usa el precio histórico real de SPY de
// ESE mes si lo tenemos guardado (estadoApp.mercado.historicoSpyUsd, cargado
// al abrir la app — ver billetera.js); si no lo tenemos, se usa el precio de
// hoy como aproximación. El mes actual siempre usa el precio de hoy, sea cual
// sea el caso, porque es más preciso que cualquier dato "histórico" de este
// mismo mes.
export function reconstruirHistorialMensual() {
    let movimientosOrdenados = [...estadoApp.historialInversiones].sort((a, b) => a.fecha.localeCompare(b.fecha));

    let dolaresAcumulado = 0;
    let nominalesAcumulado = 0;
    let nuevoHistorial = {};

    movimientosOrdenados.forEach(movOriginal => {
        let mov = normalizarMovimientoInversion(movOriginal);

        if (mov.destino === "DOLARES" && mov.montoDestino) dolaresAcumulado += mov.montoDestino;
        if (mov.origen === "DOLARES" && mov.montoOrigen) dolaresAcumulado -= mov.montoOrigen;
        if (mov.destino === "S&P 500" && mov.montoDestino) nominalesAcumulado += mov.montoDestino;
        if (mov.origen === "S&P 500" && mov.montoOrigen) nominalesAcumulado -= mov.montoOrigen;

        let key = mov.fecha.slice(0, 7); // "YYYY-MM"
        let precioDeEseMes = estadoApp.mercado.historicoSpyUsd[key] || estadoApp.mercado.spy_usd;
        let sp500UsdDeEseMes = nominalesAcumulado * (precioDeEseMes / estadoApp.mercado.ratioCedear);

        nuevoHistorial[key] = { dolares: dolaresAcumulado, sp500Usd: sp500UsdDeEseMes };
    });

    // El mes de hoy siempre se valúa con el precio de HOY, aunque no haya
    // habido ningún movimiento este mes — así el gráfico siempre termina en
    // el valor real y actualizado, no en un dato viejo.
    let hoy = new Date();
    let keyHoy = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
    nuevoHistorial[keyHoy] = { dolares: dolaresAcumulado, sp500Usd: nominalesAcumulado * precioNominalSp500Usd() };

    estadoApp.historialMensual = nuevoHistorial;
}
