// ==========================================
// 🏠 LANDING PAGE (introducción antes del login)
// ==========================================
// Esta pantalla se muestra a quien todavía no inició sesión, ANTES del
// login. No depende de Firebase ni de ningún dato real de la persona — es
// una vidriera con datos de ejemplo, para mostrar qué hace la app.

let chartDemoCreado = false;

export function mostrarLogin() {
    document.getElementById('landing-section').style.display = 'none';
    document.getElementById('auth-section').style.display = 'block';
}

// Volver de la pantalla de login a la landing (por si alguien entra por
// error o quiere leer de nuevo qué hace la app antes de registrarse).
export function volverALanding() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('landing-section').style.display = 'block';
}

export function mostrarFeatureLanding(id, boton) {
    document.querySelectorAll('.landing-feat').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.landing-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('landing-feat-' + id).style.display = 'grid';
    boton.classList.add('active');

    // El mini-gráfico de ejemplo se arma recién la primera vez que se abre
    // esa pestaña (no hace falta crearlo si nadie lo llega a ver).
    if (id === 'inversiones' && !chartDemoCreado) {
        inicializarChartDemo();
    }
}

function inicializarChartDemo() {
    let canvas = document.getElementById('landingChartDemo');
    if (!canvas) return;
    chartDemoCreado = true;
    let ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
            datasets: [
                { label: '💵 Dólares', data: [500, 620, 680, 750, 820, 900], borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 3, tension: 0.3 },
                { label: '📈 S&P 500', data: [300, 340, 310, 380, 420, 460], borderColor: '#f59e0b', backgroundColor: 'transparent', borderWidth: 3, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#334155' } } },
            scales: {
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#e2e8f0' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            }
        }
    });
}
