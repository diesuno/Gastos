// ==========================================
// 🔄 HISTORIAL ACUMULADO DE PESOS (Flujo Mensual + Inversiones)
// ==========================================
// "Pesos" es UN SOLO saldo acumulado que se ve igual en Flujo Mensual
// ("Disponible") y en Inversiones ("Pesos"): cada mes suma lo que generó ese
// mes (ingresos - gastos) y resta/suma lo que entró o salió por Inversión,
// Retiro o Extracción. Nunca se resetea entre meses — lo que te sobra en un
// mes pasa directo al siguiente, y así en adelante.
//
// Para poder mostrar "cuánto tenía disponible en tal mes pasado" (no solo el
// total de hoy), esto se reconstruye ENTERO desde cero cada vez, repasando
// mes a mes en orden cronológico — mismo patrón que ya usamos para el
// historial de Dólares/S&P 500 del gráfico.
import { estadoApp } from './estado.js';
import { calcularFlujoDeMes } from './flujoMensual.js';
import { precioNominalSp500Usd, normalizarMovimientoInversion } from './utilidades.js';

// Recorre mes a mes, desde el primero con actividad hasta el actual, sumando
// el flujo neto de ese mes y las inversiones/retiros/extracciones en Pesos
// que caigan en ese mes (según su fecha real). Guarda el saldo acumulado a
// fin de cada mes en estadoApp.historialPesosPorMes, y deja
// estadoApp.patrimonio.pesos con el valor del mes actual (el mismo que se
// ve en Inversiones). Devuelve true si el saldo actual cambió (para saber si
// hay que guardar en la nube).
export function reconstruirHistorialPesos() {
    let valorAnterior = estadoApp.patrimonio.pesos;

    // Determinamos desde qué mes hay que empezar a recorrer: el más viejo
    // entre los movimientos de Flujo Mensual y los movimientos de Inversiones.
    let fechas = [
        ...estadoApp.todosLosMovimientos.map(m => m.fecha),
        ...estadoApp.historialInversiones.map(h => h.fecha)
    ].filter(Boolean).sort();

    let hoy = new Date();
    let keyHoy = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;

    if (fechas.length === 0) {
        // Todavía no hay ninguna actividad — el saldo es 0.
        estadoApp.historialPesosPorMes = { [keyHoy]: 0 };
        estadoApp.patrimonio.pesos = 0;
        return estadoApp.patrimonio.pesos !== valorAnterior;
    }

    let [aInicio, mInicio] = fechas[0].split('-').map(Number);
    let cursor = new Date(aInicio, mInicio - 1, 1);
    let fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let saldoAcumulado = 0;
    let nuevoHistorial = {};

    while (cursor <= fin) {
        let a = cursor.getFullYear(), m = cursor.getMonth();
        let key = `${a}-${(m + 1).toString().padStart(2, '0')}`;

        // 1) Lo que generó ESTE mes en Flujo Mensual (ingresos - gastos).
        let flujo = calcularFlujoDeMes(a, m);
        saldoAcumulado += flujo.esAvanzado ? flujo.dispReal : flujo.dispBasico;

        // 2) Las inversiones/retiros/extracciones en Pesos con fecha en este mes.
        estadoApp.historialInversiones
            .filter(h => h.fecha.slice(0, 7) === key)
            .forEach(movOriginal => {
                let mov = normalizarMovimientoInversion(movOriginal);
                if (mov.origen === "PESOS" && mov.montoOrigen) saldoAcumulado -= mov.montoOrigen;
                if (mov.destino === "PESOS" && mov.montoDestino) saldoAcumulado += mov.montoDestino;
            });

        nuevoHistorial[key] = saldoAcumulado;
        cursor.setMonth(cursor.getMonth() + 1);
    }

    estadoApp.historialPesosPorMes = nuevoHistorial;
    estadoApp.patrimonio.pesos = saldoAcumulado;
    return estadoApp.patrimonio.pesos !== valorAnterior;
}

// Rearma TODO el historial mensual del gráfico desde cero, repasando cada
// movimiento de Inversiones en el orden de su FECHA real (no de cuándo se
// cargó en la app) y acumulando cuánto había de cada pool después de cada
// uno. Así, si cargás una compra vieja (de hace 3 meses), el gráfico la
// ubica en el mes que corresponde, no en el mes actual.
//
// Para valuar S&P 500 se usa siempre la cotización ACTUAL del CEDEAR de IVV
// (no hay ninguna fuente gratuita de precios históricos del CEDEAR en sí,
// a diferencia del dólar o de acciones de EEUU) — así que el gráfico muestra
// bien la EVOLUCIÓN DE LA CANTIDAD DE NOMINALES a lo largo del tiempo, pero
// valuados todos al precio de hoy.
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
        nuevoHistorial[key] = { dolares: dolaresAcumulado, sp500Usd: nominalesAcumulado * precioNominalSp500Usd() };
    });

    // El mes de hoy siempre queda registrado, aunque no haya habido ningún
    // movimiento este mes — así el gráfico siempre termina en el valor real
    // y actualizado.
    let hoy = new Date();
    let keyHoy = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
    nuevoHistorial[keyHoy] = { dolares: dolaresAcumulado, sp500Usd: nominalesAcumulado * precioNominalSp500Usd() };

    estadoApp.historialMensual = nuevoHistorial;
}
