// ==========================================
// 📈 GRÁFICO DE EVOLUCIÓN PATRIMONIAL (Chart.js)
// ==========================================
import { estadoApp } from './estado.js';

export function renderizarGrafico() {
    let ctx = document.getElementById('patrimonioChart').getContext('2d');
    if(estadoApp.miGrafico) estadoApp.miGrafico.destroy();

    let dataARS = [0, 0, 0, 0, 0, 0]; let dataUSD = [0, 0, 0, 0, 0, 0];

    estadoApp.inversiones.forEach(inv => {
        let m = new Date(inv.fecha + 'T00:00:00').getMonth() % 6;
        let precioCot = inv.moneda === "ARS" ? estadoApp.mercado.spy_ars : estadoApp.mercado.spy_usd;
        let val = inv.instrumento === "S&P 500" ? (inv.nominales * precioCot) : inv.monto;
        if(inv.moneda === "ARS") dataARS[m] += val; else dataUSD[m] += val;
    });

    estadoApp.miGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ["Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes Actual"],
            datasets: [
                { label: '📈 Activos en Pesos (ARS)', data: dataARS, borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 3, tension: 0.2 },
                { label: '💵 Activos en Dólares (USD)', data: dataUSD, borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 3, tension: 0.2 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
