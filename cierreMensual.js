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
