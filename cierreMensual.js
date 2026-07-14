// ==========================================
// 🗓️ CIERRE MENSUAL: alimenta el pool de Pesos y la foto para el gráfico
// ==========================================
import { estadoApp } from './estado.js';
import { calcularFlujoDeMes } from './flujoMensual.js';

// Recorre los meses ya pasados (hasta 24 meses atrás) y, si el Disponible de
// alguno todavía no se sumó al pool de Pesos, lo suma una única vez. El mes
// en curso NUNCA se cierra (todavía puede seguir cambiando).
// Devuelve true si sumó algo nuevo (para saber si hay que guardar en la nube).
export function cerrarMesesPendientes() {
    let hoy = new Date();
    let anioActual = hoy.getFullYear(), mesActual = hoy.getMonth();
    let huboCambios = false;

    for (let i = 1; i <= 24; i++) {
        let fechaIter = new Date(anioActual, mesActual - i, 1);
        let a = fechaIter.getFullYear(), m = fechaIter.getMonth();
        let key = `${a}-${(m + 1).toString().padStart(2, '0')}`;
        if (estadoApp.mesesPesosCerrados.includes(key)) continue;

        let flujo = calcularFlujoDeMes(a, m);
        // Si ese mes no tiene ningún movimiento cargado, no lo "cerramos" —
        // evita ensuciar el registro con meses vacíos de antes de usar la app.
        if (flujo.movimientosDelMes.length === 0) continue;

        let disponible = flujo.esAvanzado ? flujo.dispReal : flujo.dispBasico;
        estadoApp.patrimonio.pesos += disponible;
        estadoApp.mesesPesosCerrados.push(key);
        huboCambios = true;
    }
    return huboCambios;
}

// Guarda (o actualiza) la "foto" del mes en curso con el valor en dólares de
// los pools de Dólares y S&P 500, para poder graficar la evolución real.
// Se llama cada vez que se hace una inversión o un retiro en Dólares/S&P.
export function registrarFotoMesActual() {
    let hoy = new Date();
    let key = `${hoy.getFullYear()}-${(hoy.getMonth() + 1).toString().padStart(2, '0')}`;
    estadoApp.historialMensual[key] = {
        dolares: estadoApp.patrimonio.dolares,
        sp500Usd: estadoApp.sp500.nominales * estadoApp.mercado.spy_usd,
    };
}
