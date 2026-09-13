// ==========================================
// 🖼️ RENDERIZADO PRINCIPAL (dashboard, navegación lateral y listas)
// ==========================================
import { estadoApp, nombresMeses, fechaActual } from './estado.js';
import { escapeHTML, agruparMovimientosPorGrupo, precioNominalSp500Usd, describirMovimientoInversion, obtenerMontoYSimboloParaMostrar } from './utilidades.js';
import { calcularFlujoDeMes, obtenerTodasLasDeudasPendientes, calcularMiParteSuscripcion } from './flujoMensual.js';
import { reconstruirHistorialPesos } from './cierreMensual.js';
import { renderizarGrafico, seriesGrafico } from './grafico.js';
import { guardarDatosEnNube } from './auth.js';
import { obtenerKeyPeriodoDeFecha } from './periodo.js';

function tarjetaFila({ titulo, subtitulo, monto, montoColor, badge, detalles, acciones }) {
    let detallesHtml = (detalles || []).filter(d => d).map(d =>
        `<div class="cr-detalle-item"><span class="cr-detalle-label">${d.label}</span><span class="cr-detalle-valor">${d.value}</span></div>`
                                                           ).join('');
    return `<div class="card-row">
    <div class="card-row-top" onclick="this.closest('.card-row').classList.toggle('abierta')">
    <div class="cr-info">
    <div class="cr-titulo">${titulo}</div>
    <div class="cr-subtitulo">${subtitulo}</div>
    </div>
    ${badge ? `<div class="cr-badge">${badge}</div>` : ''}
    <div class="cr-monto"${montoColor ? ` style="color:${montoColor};"` : ''}>${monto}</div>
    <button type="button" class="btn-info" onclick="event.stopPropagation(); this.closest('.card-row').classList.toggle('abierta')" aria-label="Ver detalles">i</button>
    </div>
    <div class="card-row-detalle">
    <div class="cr-detalles-grid">${detallesHtml}</div>
    <div class="cr-acciones">${acciones || ''}</div>
    </div>
    </div>`;
}

function estadoDeudaInfo(mov, keyMesActual) {
    if (mov.esCompartido !== "SÍ") return null;
    if (mov.metodo === "SERVICIO") {
        let susc = estadoApp.suscripciones.find(s => s.id === mov.idGrupo);
        return (susc && susc.pagosAmigo && susc.pagosAmigo.includes(keyMesActual)) ? 'SALDADA' : 'PENDIENTE';
    }
    let deuda = estadoApp.todosLosMovimientos.find(m => m.idGrupo === mov.idGrupo && m.tipo === "Cuenta Cobrar" && m.concepto.includes(mov.conceptoOriginal));
    if (!deuda) return null;
    return deuda.estado === "Saldado" ? 'SALDADA' : 'PENDIENTE';
}

function estadoDeudaBadge(estado) {
    if (estado === 'SALDADA') return '<span class="badge-deuda badge-pagado">✓ Abonado</span>';
    if (estado === 'PENDIENTE') return '<span class="badge-deuda badge-pendiente">Pendiente</span>';
    return '';
}

const ICONOS_CATEGORIA = {
'Supermercado': '🛒', 'Comida afuera': '🍔', 'Transporte': '🚗', 'Servicios': '🔌',
'Salud': '💊', 'Entretenimiento': '🎬', 'Ropa': '👕', 'Educación': '📚',
'Hogar': '🏠', 'Otros': '📦'
};
function iconoCategoria(categoria) {
if (!categoria) return '';
return (ICONOS_CATEGORIA[categoria] || '✏️') + ' ';
}

export function inicializarSidebar() {
    let colapsado = localStorage.getItem('sidebarColapsado') === '1';
    let sidebar = document.getElementById('sidebar');
    if (sidebar && colapsado) sidebar.classList.add('colapsado');
}

export function toggleSidebar() {
    let sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('colapsado');
    localStorage.setItem('sidebarColapsado', sidebar.classList.contains('colapsado') ? '1' : '0');
}

export function toggleSidebarMobile() {
    document.getElementById('sidebar').classList.toggle('abierto-mobile');
    document.getElementById('sb-overlay').classList.toggle('activo');
}

let ordenTablas = {
    movimientos: { campo: 'fecha', ascendente: false },
    deudasBasicas: { campo: 'fecha', ascendente: false },
    deudasDiarias: { campo: 'fecha', ascendente: false },
    deudasFijas: { campo: 'fecha', ascendente: false },
    detalleInversiones: { campo: 'fecha', ascendente: false },
    detalleCreditos: { campo: 'texto', ascendente: true },
    detalleServicios: { campo: 'texto', ascendente: true },
};
let filtrosMovimientos = { metodo: 'TODOS', desde: '', hasta: '', busqueda: '' };
let filtrosCreditos = { busqueda: '', tarjeta: 'TODAS' };
let filtrosServicios = { busqueda: '' };

function compararValores(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
}

export function ordenarTabla(tabla, campo, tipo) {
    let o = ordenTablas[tabla];
    if (o.campo === campo) {
        o.ascendente = !o.ascendente;
    } else {
        o.campo = campo;
        o.ascendente = (tipo === 'texto');
    }
    actualizarApp();
}

// --- Ordenar desde un <select> (a diferencia de ordenarTabla, fija el campo y direccion directo, sin togglear) ---
export function ordenarDesdeSelect(tabla, valorSelect) {
let [campo, dir] = valorSelect.split(':');
ordenTablas[tabla].campo = campo;
ordenTablas[tabla].ascendente = (dir === 'asc');
actualizarApp();
}

export function aplicarFiltrosMovimientos() {
    filtrosMovimientos.metodo = document.getElementById('filtroMetodoMovimientos').value;
    filtrosMovimientos.desde = document.getElementById('filtroFechaDesde').value;
    filtrosMovimientos.hasta = document.getElementById('filtroFechaHasta').value;
    filtrosMovimientos.busqueda = document.getElementById('buscarMovimientos').value.trim().toLowerCase();
    actualizarApp();
}

export function limpiarFiltrosMovimientos() {
    document.getElementById('filtroMetodoMovimientos').value = 'TODOS';
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    document.getElementById('buscarMovimientos').value = '';
    aplicarFiltrosMovimientos();
}

export function aplicarFiltrosCreditos() {
    filtrosCreditos.busqueda = document.getElementById('buscarCreditos').value.trim().toLowerCase();
    filtrosCreditos.tarjeta = document.getElementById('filtroTarjeta').value;
    filtrosServicios.busqueda = document.getElementById('buscarServicios').value.trim().toLowerCase();
    actualizarApp();
}

export function limpiarFiltrosCreditos() {
    document.getElementById('buscarCreditos').value = '';
    document.getElementById('filtroTarjeta').value = 'TODAS';
    document.getElementById('buscarServicios').value = '';
    aplicarFiltrosCreditos();
}

export function inicializarSelectorHistorico() {
    let sel = document.getElementById('filtroMesAnio'); if(sel.innerHTML !== '') return;
    let anio = fechaActual.getFullYear();
    [anio-1, anio, anio+1].forEach(a => { nombresMeses.forEach((m, i) => {
        let o = document.createElement('option'); o.value = `${a}-${i}`; o.text = `${m} ${a}`;
        if(a === anio && i === fechaActual.getMonth()) o.selected = true; sel.appendChild(o);
    });});
}

export function cambiarPestaña(tabId, boton) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.sb-link').forEach(tb => tb.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    if (boton) boton.classList.add('active');

let panelMes = document.getElementById('panel-selector-mes');
    if(tabId === 'tab-inversiones') panelMes.style.display = 'none';
    else panelMes.style.display = 'flex';

if (tabId === 'tab-inversiones') renderizarGrafico();

let sidebar = document.getElementById('sidebar');
    let overlay = document.getElementById('sb-overlay');
    if (sidebar) sidebar.classList.remove('abierto-mobile');
    if (overlay) overlay.classList.remove('activo');
}

export function actualizarApp() {
    let sel = document.getElementById('filtroMesAnio'); if(!sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    estadoApp.keyMesActualGlobal = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

let flujo = calcularFlujoDeMes(aSel, mSel);
    estadoApp.movimientosMesGlobal = flujo.movimientosDelMes;
    let { ing, gastosEnActo, gastosCredito, gastosServicio, gastosFijosBasic, gastosVariablesBasic } = flujo;

if (reconstruirHistorialPesos()) guardarDatosEnNube();

let disponibleAcumulado = estadoApp.historialPesosPorMes[estadoApp.keyMesActualGlobal] ?? estadoApp.patrimonio.pesos;

let dashUI = document.getElementById('dashboard-dinamico');

if (esAvanzado) {
    let pctEnActo = ing > 0 ? ((gastosEnActo / ing) * 100).toFixed(1) : '0.0';
    let totalObligaciones = gastosCredito + gastosServicio;
    let pctObligaciones = ing > 0 ? ((totalObligaciones / ing) * 100).toFixed(1) : '0.0';

    let mAnt = mSel - 1, aAnt = aSel;
    if (mAnt < 0) { mAnt = 11; aAnt -= 1; }
    let flujoAnterior = calcularFlujoDeMes(aAnt, mAnt);
    let totalObligacionesAnt = flujoAnterior.gastosCredito + flujoAnterior.gastosServicio;
    let varObligacionesTxt = 'Sin datos del mes anterior';
    if (totalObligacionesAnt > 0) {
        let diffPct = ((totalObligaciones - totalObligacionesAnt) / totalObligacionesAnt) * 100;
        if (diffPct > 0.05) varObligacionesTxt = `<span style="color:#ef4444; font-weight:600;">▲ +${diffPct.toFixed(1)}% vs. mes anterior</span>`;
        else if (diffPct < -0.05) varObligacionesTxt = `<span style="color:#10b981; font-weight:600;">▼ ${diffPct.toFixed(1)}% vs. mes anterior</span>`;
        else varObligacionesTxt = `<span style="color:#94a3b8; font-weight:600;">= Igual al mes anterior</span>`;
    }

    dashUI.innerHTML = `
    <div class="card ingreso"><h3>Ingresos Totales</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
    <div class="card gasto" style="background:#fffbeb; border-left-color:#f59e0b;"><h3>Pagado (En Acto)</h3><p style="color:#d97706;">$${gastosEnActo.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctEnActo}% de tus ingresos</span></div>
    <div class="card gasto obligaciones-card"><h3>Obligaciones (Cuotas+Serv)</h3><p>$${totalObligaciones.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctObligaciones}% de tus ingresos</span><br><span class="porcentaje">${varObligacionesTxt}</span>
    <div class="obligaciones-tooltip">
    <div>💳 Cuotas (Tarjeta): <b>$${gastosCredito.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></div>
    <div>🔌 Servicios: <b>$${gastosServicio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></div>
    </div>
    </div>
    <div class="card ahorro" style="grid-column: span 3; background:#e0f2fe; border-color: #0ea5e9;"><h3>Disponible</h3><p style="color:#1e3a8a; font-size: 1.8em;">$${disponibleAcumulado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Acumulado de meses anteriores + este mes, menos lo invertido. Es el mismo saldo que ves en Inversiones.</span></div>
    `;
} else {
    let pctFijos = ing > 0 ? ((gastosFijosBasic / ing) * 100).toFixed(1) : '0.0';
    let pctVariables = ing > 0 ? ((gastosVariablesBasic / ing) * 100).toFixed(1) : '0.0';
    dashUI.innerHTML = `
    <div class="card ingreso"><h3>Ingresos</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
    <div class="card gasto"><h3>Gastos Fijos</h3><p>$${gastosFijosBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctFijos}% de tus ingresos</span></div>
    <div class="card gasto"><h3>Gastos Variables</h3><p>$${gastosVariablesBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctVariables}% de tus ingresos</span></div>
    <div class="card ahorro" style="grid-column: span 3; background:#e0f2fe; border-color: #0ea5e9;"><h3>Disponible</h3><p style="color:#1e3a8a; font-size: 1.8em;">$${disponibleAcumulado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Acumulado de meses anteriores + este mes, menos lo invertido. Es el mismo saldo que ves en Inversiones.</span></div>
    `;
}

let tabla = document.getElementById('tablaMovimientos'); tabla.innerHTML = '';
    let ordenMov = ordenTablas.movimientos;

if (esAvanzado) {
    let gruposUI = agruparMovimientosPorGrupo(estadoApp.movimientosMesGlobal);
    let filas = Object.values(gruposUI).filter(mov => !(mov.tipo === "Ingreso" && mov.monto === 0));

    filas = filas.filter(mov => {
        if (filtrosMovimientos.metodo !== 'TODOS' && (mov.metodo || 'EN_EL_ACTO') !== filtrosMovimientos.metodo) return false;
        if (filtrosMovimientos.desde && mov.fecha < filtrosMovimientos.desde) return false;
        if (filtrosMovimientos.hasta && mov.fecha > filtrosMovimientos.hasta) return false;
        if (filtrosMovimientos.busqueda && !mov.conceptoOriginal.toLowerCase().includes(filtrosMovimientos.busqueda)) return false;
        return true;
    });

    let valorDeMov = (mov) => {
        if (ordenMov.campo === 'texto') return mov.conceptoOriginal;
        if (ordenMov.campo === 'metodo') return mov.metodo || '';
        if (ordenMov.campo === 'monto') return mov.montoTotalAgrupado;
        return mov.fecha;
    };
    filas.sort((a, b) => (ordenMov.ascendente ? 1 : -1) * compararValores(valorDeMov(a), valorDeMov(b)));

    filas.forEach(mov => {
        let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
        let mtdText = mov.metodo === "CREDITO" ? "💳 Crédito" : (mov.metodo === "SERVICIO" ? "🔌 Servicio" : (mov.metodo === "LIQUIDACION" ? "🔄 Liquidación" : "💵 En el Acto"));
        let lblComp = mov.esCompartido === "SÍ" ? "Sí" : "No";
        let estadoDeuda = estadoDeudaInfo(mov, estadoApp.keyMesActualGlobal);
        let lblDeu = estadoDeuda === 'SALDADA' ? '✓ Pagado' : (mov.montoAdeudado > 0 ? `$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : "—");
        let esEditable = ((mov.metodo === "EN_EL_ACTO" || mov.metodo === "LIQUIDACION") && !mov.esVirtual);
        let btnEditar = esEditable ? `<button class="btn-editar" onclick="abrirModalEditarMovimiento('${mov.id}')">Editar</button>` : '';
        let btnBorrar = `<button class="btn-borrar" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">Eliminar</button>`;
        let esIngreso = mov.tipo === "Ingreso";
        tabla.innerHTML += tarjetaFila({
            titulo: escapeHTML(mov.conceptoOriginal),
            subtitulo: `${ff} · ${mtdText}`,
            monto: `${esIngreso ? '▲' : '▼'} $${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
            montoColor: esIngreso ? '#10b981' : '#ef4444',
            badge: estadoDeudaBadge(estadoDeuda),
            detalles: [
                { label: 'Compartido', value: lblComp },
                { label: 'Deuda asociada', value: lblDeu },
                { label: 'Categoría', value: mov.categoria ? (iconoCategoria(mov.categoria) + escapeHTML(mov.categoria)) : '—' }
                ],
            acciones: `${btnEditar} ${btnBorrar}`
        });
    });
} else {
    let filas = estadoApp.movimientosMesGlobal.filter(mov => mov.tipo !== "Cuenta Cobrar");
    filas = filas.filter(mov => {
        if (filtrosMovimientos.desde && mov.fecha < filtrosMovimientos.desde) return false;
        if (filtrosMovimientos.hasta && mov.fecha > filtrosMovimientos.hasta) return false;
        if (filtrosMovimientos.busqueda && !mov.concepto.toLowerCase().includes(filtrosMovimientos.busqueda)) return false;
        return true;
    });

    let valorDeMovBasico = (mov) => {
        if (ordenMov.campo === 'texto') return mov.concepto;
        if (ordenMov.campo === 'tipo') return mov.tipo;
        if (ordenMov.campo === 'monto') return mov.monto;
        return mov.fecha;
    };
    filas.sort((a, b) => (ordenMov.ascendente ? 1 : -1) * compararValores(valorDeMovBasico(a), valorDeMovBasico(b)));

    filas.forEach(mov => {
        let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
        let esIngreso = mov.tipo === "Ingreso";
        tabla.innerHTML += tarjetaFila({
            titulo: escapeHTML(mov.concepto),
            subtitulo: `${ff} · ${mov.tipo}`,
            monto: `${esIngreso ? '▲' : '▼'} $${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
            montoColor: esIngreso ? '#10b981' : '#ef4444',
            detalles: [
                { label: 'Categoría', value: mov.categoria ? (iconoCategoria(mov.categoria) + escapeHTML(mov.categoria)) : '—' }
                ],
            acciones: `<button class="btn-editar" onclick="abrirModalEditarMovimiento('${mov.id}')">Editar</button> <button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">Eliminar</button>`
        });
    });
}

if (esAvanzado) {
    let tbCredito = document.getElementById('tablaCreditos'); tbCredito.innerHTML = '';
    let tbServ = document.getElementById('tablaServicios'); tbServ.innerHTML = '';
    let totalCredMio = 0, totalCredCompartido = 0, totalServMio = 0, totalServCompartido = 0;

    let selTarjeta = document.getElementById('filtroTarjeta');
    let valorPrevioTarjeta = filtrosCreditos.tarjeta;
    selTarjeta.innerHTML = '<option value="TODAS">Todas</option>';
    estadoApp.listaTarjetas.forEach(t => { let o = document.createElement('option'); o.value = t; o.text = t; selTarjeta.appendChild(o); });
    selTarjeta.value = estadoApp.listaTarjetas.includes(valorPrevioTarjeta) ? valorPrevioTarjeta : 'TODAS';

    let gruposUI = Object.values(agruparMovimientosPorGrupo(estadoApp.movimientosMesGlobal)).filter(mov => mov.tipo !== "Ingreso");

    let filasCredito = gruposUI.filter(mov => {
        if (mov.metodo !== "CREDITO") return false;
        if (filtrosCreditos.busqueda && !mov.conceptoOriginal.toLowerCase().includes(filtrosCreditos.busqueda)) return false;
        if (filtrosCreditos.tarjeta !== 'TODAS' && (mov.tarjeta || '') !== filtrosCreditos.tarjeta) return false;
        return true;
    });
    let ordenCred = ordenTablas.detalleCreditos;
    let valorDeCredito = (mov) => ordenCred.campo === 'monto' ? mov.montoTotalAgrupado : (ordenCred.campo === 'tarjeta' ? (mov.tarjeta || '') : mov.conceptoOriginal);
    filasCredito.sort((a, b) => (ordenCred.ascendente ? 1 : -1) * compararValores(valorDeCredito(a), valorDeCredito(b)));

    filasCredito.forEach(mov => {
        if (!mov.pagado) { totalCredMio += mov.montoTotalAgrupado; totalCredCompartido += mov.montoAdeudado; }
        let lblComp = mov.esCompartido === "SÍ" ? "Sí" : "No";
        let estadoDeuda = estadoDeudaInfo(mov, estadoApp.keyMesActualGlobal);
        let lblDeu = estadoDeuda === 'SALDADA' ? '✓ Pagado' : (mov.montoAdeudado > 0 ? `$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : "—");
        let saldoRest = mov.deudaRestante || 0;
        let titulo = (mov.pagado ? '✅ ' : '') + escapeHTML(mov.conceptoOriginal);
        let subtitulo = `Cuota ${mov.cuotaActual}/${mov.cuotasTotales} · ${mov.tarjeta ? escapeHTML(mov.tarjeta) : 'Sin tarjeta asignada'}`;
        let btnMarcarPagada = mov.pagado ? '' : `<button class="btn-verde" onclick="marcarCuotaComoPagada('${mov.id}')">✓ Marcar pagada</button>`;
        let btnAsignar = mov.tarjeta ? '' : `<button class="btn-secundario" onclick="asignarTarjetaAGrupo('${mov.idGrupo}')">Asignar tarjeta</button>`;
        tbCredito.innerHTML += tarjetaFila({
            titulo, subtitulo,
            monto: `$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
            badge: estadoDeudaBadge(estadoDeuda),
            detalles: [
                { label: 'Saldo restante', value: `$${saldoRest.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` },
                { label: 'Compartido', value: lblComp },
                { label: 'Deuda asociada', value: lblDeu },
                { label: 'Categoría', value: mov.categoria ? (iconoCategoria(mov.categoria) + escapeHTML(mov.categoria)) : '—' }
                ],
            acciones: `${btnMarcarPagada} ${btnAsignar} <button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">Eliminar todo</button>`
        });
    });

    let filasServicios = gruposUI.filter(mov => {
        if (mov.metodo !== "SERVICIO") return false;
        if (filtrosServicios.busqueda && !mov.conceptoOriginal.toLowerCase().includes(filtrosServicios.busqueda)) return false;
        return true;
    });
    let ordenServ = ordenTablas.detalleServicios;
    let valorDeServicio = (mov) => ordenServ.campo === 'monto' ? mov.montoTotalAgrupado : mov.conceptoOriginal;
    filasServicios.sort((a, b) => (ordenServ.ascendente ? 1 : -1) * compararValores(valorDeServicio(a), valorDeServicio(b)));

    filasServicios.forEach(mov => {
        if (!mov.pagado) { totalServMio += mov.montoTotalAgrupado; totalServCompartido += mov.montoAdeudado; }
        let prevMonthDate = new Date(aSel, mSel - 1, 1);
        let keyMesAnterior = `${prevMonthDate.getFullYear()}-${(prevMonthDate.getMonth()+1).toString().padStart(2,'0')}`;
        let montoPasado = null; let variacionTxt = "—";
        let suscObj = estadoApp.suscripciones.find(s => s.id === mov.idGrupo);
        if(suscObj) {
            let parteAnterior = calcularMiParteSuscripcion(suscObj, keyMesAnterior);
            if (parteAnterior > 0) montoPasado = parteAnterior;
        }
        if(montoPasado !== null) {
            let diff = mov.montoTotalAgrupado - montoPasado;
            if(diff > 0) variacionTxt = `▲ +${((diff/montoPasado)*100).toFixed(1)}%`;
            else if(diff < 0) variacionTxt = `▼ -${((Math.abs(diff)/montoPasado)*100).toFixed(1)}%`;
            else variacionTxt = `= Igual`;
        } else { variacionTxt = `Nuevo`; }

                           let lblComp = mov.esCompartido === "SÍ" ? "Sí" : "No";
        let estadoDeuda = estadoDeudaInfo(mov, estadoApp.keyMesActualGlobal);
        let lblDeu = estadoDeuda === 'SALDADA' ? '✓ Pagado' : (mov.montoAdeudado > 0 ? `$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : "—");
        let debStr = mov.debito === "SI" ? "Sí" : "No";
        let titulo = (mov.pagado ? '✅ ' : '') + escapeHTML(mov.conceptoOriginal);
        let subtitulo = `Débito automático: ${debStr}`;
        let btnPagarServ = mov.pagado ? '' : `<button class="btn-verde" onclick="pagarServicioIndividual('${mov.idGrupo}')">Pagar</button>`;
        tbServ.innerHTML += tarjetaFila({
            titulo, subtitulo,
            monto: `$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
            badge: estadoDeudaBadge(estadoDeuda),
            detalles: [
                { label: 'Variación vs. mes anterior', value: variacionTxt },
                { label: 'Compartido', value: lblComp },
                { label: 'Deuda asociada', value: lblDeu },
                { label: 'Categoría', value: mov.categoria ? (iconoCategoria(mov.categoria) + escapeHTML(mov.categoria)) : '—' }
                ],
            acciones: `${btnPagarServ} <button class="btn-editar" onclick="abrirModalEditarServicio('${mov.idGrupo}')">Editar</button> <button class="btn-borrar" onclick="darDeBajaServicio('${mov.idGrupo}')">Baja</button>`
        });
    });

    document.getElementById('lblTotalCreditos').innerText = `Mío: $${totalCredMio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} — Compartido: $${totalCredCompartido.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('lblTotalServicios').innerText = `Mío: $${totalServMio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} — Compartido: $${totalServCompartido.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}

renderizarInversiones();
    actualizarPestañaCuentasCobrar(esAvanzado);
}

function renderizarInversiones() {
    let valorSp500Usd = estadoApp.sp500.nominales * precioNominalSp500Usd();

let cardsHtml = `<div class="card" style="background:#f8fafc;"><h3>Pesos</h3><p style="color:#1e3a8a;">$${estadoApp.patrimonio.pesos.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Disponible acumulado</span></div>`;
    if (estadoApp.patrimonio.dolares > 0) {
        let equivalenteArs = estadoApp.patrimonio.dolares * estadoApp.mercado.dolarOficial;
        cardsHtml += `<div class="card" style="background:#ecfdf5;"><h3>Dólares</h3><p style="color:#10b981;">US$ ${estadoApp.patrimonio.dolares.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">≈ $${equivalenteArs.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (dólar oficial)</span></div>`;
    }
    if (estadoApp.sp500.nominales > 0) {
        cardsHtml += `<div class="card" style="background:#fffbeb;"><h3>S&P 500</h3><p style="color:#f59e0b;">${Math.round(estadoApp.sp500.nominales)} Nom.</p><span class="porcentaje">US$ ${valorSp500Usd.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>`;
    }
    document.getElementById('dashboard-inversiones').innerHTML = cardsHtml;

let chkHtml = '';
    if (estadoApp.patrimonio.dolares > 0) {
        chkHtml += `<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" onchange="toggleSerieGrafico('dolares')" ${seriesGrafico.dolares ? 'checked' : ''}> <span style="color:#10b981; font-weight:600;">💵 Dólares</span></label>`;
    }
    if (estadoApp.sp500.nominales > 0) {
        chkHtml += `<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" onchange="toggleSerieGrafico('sp500')" ${seriesGrafico.sp500 ? 'checked' : ''}> <span style="color:#f59e0b; font-weight:600;">📈 S&P 500</span></label>`;
    }
    document.getElementById('chkSeriesGrafico').innerHTML = chkHtml;
    renderizarGrafico();

renderizarTablaDetalleInversiones();
}

function poblarFiltroAnioDetalle() {
    let sel = document.getElementById('filtroDetalleAnio');
    let valorPrevio = sel.value || 'TODOS';
    let anios = [...new Set(estadoApp.historialInversiones.map(h => new Date(h.fecha + 'T00:00:00').getFullYear()))].sort((a, b) => b - a);
    sel.innerHTML = '<option value="TODOS">Todos los años</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join('');
    if ([...sel.options].some(o => o.value === valorPrevio)) sel.value = valorPrevio;
}

// Arma el detalle (fecha completa, montos con moneda, cotización, motivo)
// que se ve al abrir la "i" de un movimiento en el Historial de Inversiones.
function nombrePoolInversion(p) {
if (p === "PESOS") return "Pesos";
if (p === "DOLARES") return "Dólares";
if (p === "FUERA") return "Fuera de la app";
return p;
}
function formatoMontoPool(pool, monto) {
if (monto === null || monto === undefined) return null;
if (pool === "PESOS") return '$' + monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
if (pool === "DOLARES") return 'US$' + monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
if (pool === "S&P 500") return monto + ' nominal' + (monto === 1 ? '' : 'es');
return String(monto);
}
function detalleMovimientoInversion(h) {
let f = new Date(h.fecha + 'T00:00:00');
let fechaCompleta = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
let det = [{ label: 'Fecha', value: fechaCompleta }];
if (h.origen) det.push({ label: 'Salió de', value: nombrePoolInversion(h.origen) + (h.montoOrigen != null ? ' — ' + formatoMontoPool(h.origen, h.montoOrigen) : '') });
if (h.destino && h.destino !== "FUERA") det.push({ label: 'Entró a', value: nombrePoolInversion(h.destino) + (h.montoDestino != null ? ' — ' + formatoMontoPool(h.destino, h.montoDestino) : '') });
if (h.destino === "FUERA") det.push({ label: 'Destino', value: 'Salió de la plataforma definitivamente' });
let cotizacion = h.precioCompraUsd;
if (!cotizacion && h.montoOrigen && h.montoDestino && h.origen !== h.destino) {
if (h.origen === "PESOS" && h.destino === "DOLARES") cotizacion = h.montoOrigen / h.montoDestino;
else if (h.origen === "DOLARES" && h.destino === "PESOS") cotizacion = h.montoDestino / h.montoOrigen;
else if (h.origen === "S&P 500" && (h.destino === "PESOS" || h.destino === "DOLARES")) cotizacion = h.montoDestino / h.montoOrigen;
}
if (cotizacion) det.push({ label: 'Cotización usada', value: '$' + cotizacion.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' por USD' });
if (h.motivo) det.push({ label: 'Motivo', value: escapeHTML(h.motivo) });
return det;
}

const COLOR_MOV = { 'Inversión': '#10b981', 'Retiro': '#3b82f6', 'Extracción': '#ef4444' };

function renderizarTablaDetalleInversiones() {
    poblarFiltroAnioDetalle();
    let filtroInst = document.getElementById('filtroDetalleInstrumento').value;
    let filtroAnio = document.getElementById('filtroDetalleAnio').value;
    let tbody = document.getElementById('tablaDetalleInversiones'); tbody.innerHTML = '';
    let ordenDetInv = ordenTablas.detalleInversiones;

let filas = [...estadoApp.historialInversiones].filter(h => {
    if (filtroInst !== 'TODOS' && h.instrumento !== filtroInst) return false;
    if (filtroAnio !== 'TODOS' && new Date(h.fecha + 'T00:00:00').getFullYear().toString() !== filtroAnio) return false;
    return true;
});
    filas.sort((a, b) => (ordenDetInv.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));

filas.forEach(h => {
    let f = new Date(h.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
    let { monto, simbolo } = obtenerMontoYSimboloParaMostrar(h);
    let montoTxt = simbolo === ''
    ? `${Math.round(monto).toLocaleString('es-AR')}`
        : `${simbolo}${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    let colorMov = COLOR_MOV[h.mov] || '#64748b';
    tbody.innerHTML += tarjetaFila({
        titulo: `<span style="color:${colorMov};">${h.mov}</span> · ${escapeHTML(h.instrumento)}`,
        subtitulo: `${escapeHTML(describirMovimientoInversion(h))} · ${ff}`,
        monto: montoTxt,
        detalles: detalleMovimientoInversion(h),
        acciones: `<button class="btn-borrar" onclick="revertirMovimientoInversion('${h.id}')">Revertir</button>`
    });
});
}

export function actualizarFiltrosDetalle() {
    renderizarTablaDetalleInversiones();
}

function actualizarPestañaCuentasCobrar(esAvanzado) {
    let sel = document.getElementById('filtroMesAnio'); if(!sel || !sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    let keySel = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;

let todasLasDeudasPendientes = obtenerTodasLasDeudasPendientes();

let filaDeuda = (mov, incluirBorrar) => {
    let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
    let esFavor = mov.sentido === "A_FAVOR";
    let montoTxt = esFavor
    ? `$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`
        : `-$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    let btnA = esFavor
    ? `<button class="btn-verde" onclick="liquidarDeudaIndividual('${mov.id}')">Cobrar</button>`
        : `<button class="btn-naranja" onclick="liquidarDeudaIndividual('${mov.id}')">Pagar</button>`;
    let btnX = incluirBorrar
    ? `<button class="btn-borrar" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">Eliminar</button>`
        : '';
    return tarjetaFila({
        titulo: escapeHTML(mov.deudor),
        subtitulo: `${ff} · ${escapeHTML(mov.concepto)}`,
        monto: montoTxt,
        montoColor: esFavor ? '#10b981' : '#ef4444',
        detalles: [],
        acciones: `${btnA} ${btnX}`
    });
};

if (!esAvanzado) {
    let ordenBasicas = ordenTablas.deudasBasicas;
    let filasBasicas = [...todasLasDeudasPendientes].sort((a, b) => (ordenBasicas.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));

    let tbBasica = document.getElementById('tablaDeudasBasicas'); tbBasica.innerHTML = '';
    filasBasicas.forEach(mov => { tbBasica.innerHTML += filaDeuda(mov, false); });
    return;
}

let ordenDiarias = ordenTablas.deudasDiarias;
    let ordenFijas = ordenTablas.deudasFijas;

let deudasDiariasArr = todasLasDeudasPendientes.filter(mov => mov.metodo === "EN_EL_ACTO");
    let deudasFijasArr = todasLasDeudasPendientes.filter(mov => mov.metodo !== "EN_EL_ACTO" && obtenerKeyPeriodoDeFecha(mov.fecha) === keySel);

let totDiario = {}; let totTarjeta = {}; let totServicio = {};
    estadoApp.listaAmigos.forEach(am => { totDiario[am] = 0; totTarjeta[am] = 0; totServicio[am] = 0; });

deudasDiariasArr.forEach(mov => { if(totDiario[mov.deudor] !== undefined) totDiario[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto; });
    deudasFijasArr.forEach(mov => {
        let destino = mov.metodo === "CREDITO" ? totTarjeta : totServicio;
        if(destino[mov.deudor] !== undefined) destino[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto;
    });

deudasDiariasArr.sort((a, b) => (ordenDiarias.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));
    deudasFijasArr.sort((a, b) => (ordenFijas.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));

let tbDiaria = document.getElementById('tablaDeudasDiarias'); tbDiaria.innerHTML = '';
    deudasDiariasArr.forEach(mov => { tbDiaria.innerHTML += filaDeuda(mov, true); });
    let tbFija = document.getElementById('tablaDeudasFijas'); tbFija.innerHTML = '';
    deudasFijasArr.forEach(mov => { tbFija.innerHTML += filaDeuda(mov, true); });

let gridDeudas = document.getElementById('gridResumenDeudas'); gridDeudas.innerHTML = '';
    for(let p in totDiario) {
        let sD = totDiario[p]; let sT = totTarjeta[p]; let sS = totServicio[p]; let sTotal = sD + sT + sS;
        if (sD === 0 && sT === 0 && sS === 0) continue;
        let colorB = sTotal >= 0 ? "#10b981" : "#ef4444"; let colorC = sTotal >= 0 ? "#ecfdf5" : "#fef2f2";

    gridDeudas.innerHTML += `<div class="card" style="border-left-color: ${colorB}; background:${colorC}; text-align:left;">
    <h3 style="margin-top:0; text-align:center;">${escapeHTML(p)}</h3>
    <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em;">
    <span>Diario: <b>${sD >= 0 ? '' : '-'}$${Math.abs(sD).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></span>
    <button class="btn-secundario" style="padding:4px 8px; font-size:0.8em;" onclick="liquidarDeudaGlobal('${p}', ${sD}, 'DIARIO')">Saldar</button>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em;">
    <span>Tarjeta: <b>${sT >= 0 ? '' : '-'}$${Math.abs(sT).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></span>
    <button class="btn-secundario" style="padding:4px 8px; font-size:0.8em;" onclick="liquidarDeudaGlobal('${p}', ${sT}, 'TARJETA')">Saldar</button>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em;">
    <span>Servicio: <b>${sS >= 0 ? '' : '-'}$${Math.abs(sS).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></span>
    <button class="btn-secundario" style="padding:4px 8px; font-size:0.8em;" onclick="liquidarDeudaGlobal('${p}', ${sS}, 'SERVICIO')">Saldar</button>
    </div>
    <hr style="border:0; border-top:1px solid #cbd5e1; margin:10px 0;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
    <span style="font-size:1.1em; color:${colorB}; font-weight:bold;">NETO: ${sTotal >= 0 ? '' : '-'}$${Math.abs(sTotal).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
    <button style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="liquidarDeudaGlobal('${p}', ${sTotal}, 'TODO')">Pagar Todo</button>
    </div>
    </div>`;
    }
}
