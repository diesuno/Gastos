// ==========================================
// 📈 GRÁFICO DE EVOLUCIÓN (últimos 6 meses, Dólares y S&P 500 en USD)
// ==========================================
import { estadoApp, nombresMeses } from './estado.js';

const COLOR_DOLARES = '#10b981';
const COLOR_SP500 = '#f59e0b';

// Qué series están tildadas — es una preferencia de esta sesión nada más,
// no se guarda en la nube (por eso vive acá y no en estadoApp).
export const seriesGrafico = { dolares: true, sp500: true };

export function toggleSerieGrafico(serie) {
    seriesGrafico[serie] = !seriesGrafico[serie];
    renderizarGrafico();
}

// Devuelve los últimos 6 meses (incluyendo el actual), del más viejo al más
// nuevo, con su clave "YYYY-MM" y una etiqueta linda para el eje X.
function obtenerUltimos6Meses() {
    let hoy = new Date();
    let meses = [];
    for (let i = 5; i >= 0; i--) {
        let f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        meses.push({
            key: `${f.getFullYear()}-${(f.getMonth() + 1).toString().padStart(2, '0')}`,
            label: `${nombresMeses[f.getMonth()]} ${f.getFullYear()}`
        });
    }
    return meses;
}

// Arma la serie de datos "arrastrando" el último valor conocido: si un mes no
// tiene foto guardada (no hubo movimientos ese mes), repite el valor del mes
// anterior en vez de dejar un hueco — hasta que aparece la primera foto real,
// donde no hay nada que mostrar (queda null).
function serieConArrastre(meses, extraerValor) {
    let ultimoValor = null;
    return meses.map(m => {
        let foto = estadoApp.historialMensual[m.key];
        if (foto) ultimoValor = extraerValor(foto);
        return ultimoValor;
    });
}

export function renderizarGrafico() {
    let canvas = document.getElementById('patrimonioChart');
    if (!canvas) return;
    let ctx = canvas.getContext('2d');
    if (estadoApp.miGrafico) estadoApp.miGrafico.destroy();

    let meses = obtenerUltimos6Meses();
    let labels = meses.map(m => m.label);
    let datasets = [];

    if (seriesGrafico.dolares && estadoApp.patrimonio.dolares > 0) {
        datasets.push({
            label: '💵 Dólares',
            data: serieConArrastre(meses, f => f.dolares),
            borderColor: COLOR_DOLARES, backgroundColor: 'transparent', borderWidth: 3, tension: 0.2, spanGaps: true
        });
    }
    if (seriesGrafico.sp500 && estadoApp.sp500.nominales > 0) {
        datasets.push({
            label: '📈 S&P 500 (USD)',
            data: serieConArrastre(meses, f => f.sp500Usd),
            borderColor: COLOR_SP500, backgroundColor: 'transparent', borderWidth: 3, tension: 0.2, spanGaps: true
        });
    }

    estadoApp.miGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
