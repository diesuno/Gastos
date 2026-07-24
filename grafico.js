// ==========================================
// 📈 GRÁFICO DE EVOLUCIÓN (6 o 12 meses, Dólares y S&P 500 en USD)
// ==========================================
import { estadoApp, nombresMeses } from './estado.js';

const COLOR_DOLARES = '#10b981';
const COLOR_SP500 = '#f59e0b';

// Qué series están tildadas y cuántos meses se piden ver — son preferencias
// de esta sesión nada más, no se guardan en la nube (por eso viven acá y no
// en estadoApp).
export const seriesGrafico = { dolares: true, sp500: true };
export let mesesAMostrar = 6;

export function toggleSerieGrafico(serie) {
    seriesGrafico[serie] = !seriesGrafico[serie];
    renderizarGrafico();
}

export function setMesesAMostrar(n, boton) {
    mesesAMostrar = n;
    document.querySelectorAll('.btn-periodo-grafico').forEach(b => b.classList.remove('activo'));
    if (boton) boton.classList.add('activo');
    renderizarGrafico();
}

// Arma la lista de meses a graficar: arranca en "mesesAMostrar" meses atrás,
// PERO si la primera foto real que existe es más reciente que eso, arranca
// ahí directamente (no tiene sentido mostrar meses vacíos antes de la primera
// inversión). Si todavía no hay ninguna foto guardada, devuelve una lista
// vacía — no hay nada que graficar todavía.
function obtenerMesesARenderizar() {
    let claves = Object.keys(estadoApp.historialMensual);
    if (claves.length === 0) return [];

    let primeraClave = claves.sort()[0]; // "YYYY-MM" ordena bien como texto
    let [pA, pM] = primeraClave.split('-').map(Number);
    let fechaPrimera = new Date(pA, pM - 1, 1);

    let hoy = new Date();
    let fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth() - (mesesAMostrar - 1), 1);
    let fechaInicio = fechaPrimera > fechaLimite ? fechaPrimera : fechaLimite;

    let meses = [];
    let cursor = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1);
    let fin = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    while (cursor <= fin) {
        meses.push({
            key: `${cursor.getFullYear()}-${(cursor.getMonth() + 1).toString().padStart(2, '0')}`,
            label: `${nombresMeses[cursor.getMonth()]} ${cursor.getFullYear()}`
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    return meses;
}

// Arma la serie de datos "arrastrando" el último valor conocido: si un mes no
// tiene foto guardada (no hubo movimientos ese mes), repite el valor del mes
// anterior en vez de dejar un hueco.
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
    let elSinDatos = document.getElementById('graficoSinDatos');
    if (!canvas) return;

    if (estadoApp.miGrafico) { estadoApp.miGrafico.destroy(); estadoApp.miGrafico = null; }

    let meses = obtenerMesesARenderizar();

    if (meses.length === 0) {
        canvas.style.display = 'none';
        if (elSinDatos) elSinDatos.style.display = 'block';
        return;
    }
    canvas.style.display = 'block';
    if (elSinDatos) elSinDatos.style.display = 'none';

    let ctx = canvas.getContext('2d');
    let labels = meses.map(m => m.label);
    let datasets = [];

    if (seriesGrafico.dolares && estadoApp.patrimonio.dolares > 0) {
        datasets.push({
            label: '💵 Dólares',
            data: serieConArrastre(meses, f => f.dolares),
            borderColor: COLOR_DOLARES, backgroundColor: 'transparent', borderWidth: 3, tension: 0.2, spanGaps: true,
            pointRadius: 4, pointHoverRadius: 7, pointHitRadius: 20
        });
    }
    if (seriesGrafico.sp500 && estadoApp.sp500.nominales > 0) {
        datasets.push({
            label: '📈 S&P 500 (USD)',
            data: serieConArrastre(meses, f => f.sp500Usd),
            borderColor: COLOR_SP500, backgroundColor: 'transparent', borderWidth: 3, tension: 0.2, spanGaps: true,
            pointRadius: 4, pointHoverRadius: 7, pointHitRadius: 20
        });
    }

    estadoApp.miGrafico = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Con esto, tocar en cualquier parte vertical de un mes (no solo
            // el pixel exacto del punto) ya muestra el tooltip — mucho más
            // fácil de usar con el dedo en el celular.
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    ticks: {
                        // Formato argentino (coma decimal) y como máximo 2 decimales.
                        callback: (valor) => valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (contexto) => {
                            let valor = contexto.parsed.y.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            let linea = `${contexto.dataset.label}: US$ ${valor}`;
                            if (contexto.dataset.label.includes('Dólares')) {
                                let equivalenteArs = contexto.parsed.y * estadoApp.mercado.dolarOficial;
                                let arsTxt = equivalenteArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                return [linea, `≈ $${arsTxt} (dólar oficial)`];
                            }
                            return linea;
                        }
                    }
                }
            }
        }
    });
}
