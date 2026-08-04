// ==========================================
// 🖼️ RENDERIZADO PRINCIPAL (dashboard, pestañas y tablas)
// ==========================================
import { estadoApp, nombresMeses, fechaActual } from './estado.js';
import { escapeHTML, agruparMovimientosPorGrupo, precioNominalSp500Usd, describirMovimientoInversion, obtenerMontoYSimboloParaMostrar } from './utilidades.js';
import { calcularFlujoDeMes, obtenerTodasLasDeudasPendientes, calcularMiParteSuscripcion } from './flujoMensual.js';
import { reconstruirHistorialPesos } from './cierreMensual.js';
import { renderizarGrafico, seriesGrafico } from './grafico.js';
import { guardarDatosEnNube } from './auth.js';
import { obtenerKeyPeriodoDeFecha } from './periodo.js';

// ==========================================
// 🔀 ORDENAMIENTO Y FILTROS DE TABLAS
// ==========================================
// Estado de orden por tabla (no se persiste, es solo una preferencia de esta
// sesión de uso) y filtros de "Detalle de Movimientos del Mes".
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

// Compara 2 valores para ordenar (soporta texto y números por igual — las
// fechas ya vienen como texto "YYYY-MM-DD", que ordena bien alfabéticamente).
function compararValores(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
}

// Arma la flechita (▲/▼) para el encabezado que está activo, vacío si no.
function iconoOrden(tabla, campo) {
    let o = ordenTablas[tabla];
    if (o.campo !== campo) return '';
    return o.ascendente ? ' ▲' : ' ▼';
}

// Alterna el orden de una tabla al hacer clic en un encabezado: si ya estaba
// ordenada por ese campo, invierte el sentido; si es un campo nuevo, arranca
// en el sentido por defecto según el tipo (fecha/número: el más grande
// primero; texto: A-Z).
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
    document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
    document.getElementById(tabId).classList.add('active'); boton.classList.add('active');

    let panelMes = document.getElementById('panel-selector-mes');
    if(tabId === 'tab-inversiones') panelMes.style.display = 'none';
    else panelMes.style.display = 'flex';

    // El canvas del gráfico solo tiene tamaño correcto una vez que la pestaña
    // está visible, así que lo volvemos a dibujar al entrar.
    if (tabId === 'tab-inversiones') renderizarGrafico();
}

export function actualizarApp() {
    let sel = document.getElementById('filtroMesAnio'); if(!sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    estadoApp.keyMesActualGlobal = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

    let flujo = calcularFlujoDeMes(aSel, mSel);
    estadoApp.movimientosMesGlobal = flujo.movimientosDelMes;
    let { ing, gastosEnActo, gastosCredito, gastosServicio, gastosFijosBasic, gastosVariablesBasic } = flujo;

    // El historial acumulado de Pesos se reconstruye en cada actualización —
    // así "Disponible" (acá) y "Pesos" (en Inversiones) siempre muestran el
    // mismo número. Invertir o retirar también se refleja acá, porque
    // reconstruirHistorialPesos() ya tiene en cuenta esos movimientos.
    if (reconstruirHistorialPesos()) guardarDatosEnNube();

    // "Disponible" ahora es el saldo ACUMULADO a fin del mes seleccionado (lo
    // que sobró de meses anteriores + lo que generó este mes - lo invertido),
    // no solo el neto de este mes en particular. Si el mes elegido todavía no
    // tiene un saldo calculado (por ejemplo, un mes futuro), se muestra el
    // saldo actual como mejor aproximación.
    let disponibleAcumulado = estadoApp.historialPesosPorMes[estadoApp.keyMesActualGlobal] ?? estadoApp.patrimonio.pesos;

    // RENDER DASHBOARD DINÁMICO
    let dashUI = document.getElementById('dashboard-dinamico');

    if (esAvanzado) {
        let pctEnActo = ing > 0 ? ((gastosEnActo / ing) * 100).toFixed(1) : '0.0';
        let totalObligaciones = gastosCredito + gastosServicio;
        let pctObligaciones = ing > 0 ? ((totalObligaciones / ing) * 100).toFixed(1) : '0.0';

        // Comparamos Obligaciones contra el mismo total del mes anterior, para
        // mostrar si subió o bajó y en qué porcentaje.
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

    // RENDER TABLA FLUJO
    let tabla = document.getElementById('tablaMovimientos'); tabla.innerHTML = '';
    let thead = document.getElementById('headTablaMovimientos');
    let ordenMov = ordenTablas.movimientos;

    if (esAvanzado) {
        thead.innerHTML = `<tr>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','fecha','fecha')">Fecha${iconoOrden('movimientos','fecha')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','texto','texto')">Texto${iconoOrden('movimientos','texto')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','metodo','texto')">Método${iconoOrden('movimientos','metodo')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','monto','numero')">Monto Total${iconoOrden('movimientos','monto')}</th>
            <th>Compartido</th><th>Deuda Asoc.</th><th>Acción</th></tr>`;

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
            let mtdText = mov.metodo === "CREDITO" ? "💳 Crédito" : (mov.metodo === "SERVICIO" ? "🔌 Servicio" : (mov.metodo === "LIQUIDACION" ? "🔄 Liquidación de Deuda" : "💵 En el Acto"));
            let lblComp = mov.esCompartido === "SÍ" ? `<span style="color:#0ea5e9; font-weight:bold;">SÍ</span>` : "No";
            let lblDeu = mov.montoAdeudado > 0 ? `<span style="color:#ef4444;">$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>` : "-";
            // Por ahora solo se puede editar texto/fecha/monto de movimientos
            // "En el Acto" reales — las cuotas de tarjeta y los servicios
            // (virtuales) todavía no tienen pensada su lógica de edición acá.
            let esEditable = ((mov.metodo === "EN_EL_ACTO" || mov.metodo === "LIQUIDACION") && !mov.esVirtual);
            let btnEditar = esEditable ? `<button class="btn-editar" onclick="abrirModalEditarMovimiento('${mov.id}')">Editar</button> ` : '';
            let btnBorrar = `<button class="btn-borrar" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">X</button>`;
            tabla.innerHTML += `<tr><td>${ff}</td><td>${escapeHTML(mov.conceptoOriginal)}</td><td>${mtdText}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${lblComp}</td><td>${lblDeu}</td><td>${btnEditar}${btnBorrar}</td></tr>`;
        });
    } else {
        thead.innerHTML = `<tr>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','fecha','fecha')">Fecha${iconoOrden('movimientos','fecha')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','texto','texto')">Concepto${iconoOrden('movimientos','texto')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','tipo','texto')">Tipo${iconoOrden('movimientos','tipo')}</th>
            <th style="cursor:pointer;" onclick="ordenarTabla('movimientos','monto','numero')">Monto${iconoOrden('movimientos','monto')}</th>
            <th>Acción</th></tr>`;

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
            tabla.innerHTML += `<tr><td>${ff}</td><td>${escapeHTML(mov.concepto)}</td><td>${mov.tipo}</td><td>$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td><button class="btn-editar" onclick="abrirModalEditarMovimiento('${mov.id}')">Editar</button> <button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">X</button></td></tr>`;
        });
    }

    // RENDER DETALLES GASTOS (SOLO AVANZADO)
    if (esAvanzado) {
        let tbCredito = document.getElementById('tablaCreditos'); tbCredito.innerHTML = '';
        let tbServ = document.getElementById('tablaServicios'); tbServ.innerHTML = '';
        let totalCredMio = 0, totalCredCompartido = 0, totalServMio = 0, totalServCompartido = 0;

        // Opciones del filtro de Tarjeta, siempre actualizadas con la lista real.
        let selTarjeta = document.getElementById('filtroTarjeta');
        let valorPrevioTarjeta = filtrosCreditos.tarjeta;
        selTarjeta.innerHTML = '<option value="TODAS">Todas</option>';
        estadoApp.listaTarjetas.forEach(t => { let o = document.createElement('option'); o.value = t; o.text = t; selTarjeta.appendChild(o); });
        selTarjeta.value = estadoApp.listaTarjetas.includes(valorPrevioTarjeta) ? valorPrevioTarjeta : 'TODAS';

        document.getElementById('thTextoCreditos').innerHTML = `Texto${iconoOrden('detalleCreditos', 'texto')}`;
        document.getElementById('thMontoCreditos').innerHTML = `Valor Cuota${iconoOrden('detalleCreditos', 'monto')}`;
        document.getElementById('thTarjetaCreditos').innerHTML = `Tarjeta${iconoOrden('detalleCreditos', 'tarjeta')}`;
        document.getElementById('thTextoServicios').innerHTML = `Servicio${iconoOrden('detalleServicios', 'texto')}`;
        document.getElementById('thMontoServicios').innerHTML = `Valor a Pagar${iconoOrden('detalleServicios', 'monto')}`;

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
            let lblComp = mov.esCompartido === "SÍ" ? `<span style="color:#0ea5e9; font-weight:bold;">SÍ</span>` : "No";
            let lblDeu = mov.montoAdeudado > 0 ? `<span style="color:#ef4444;">$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>` : "-";
            // Si ya pagaste el resumen que cubre esta cuota, no vuelve a
            // sumar en el total — ya se contó como gasto real ese día.
            if (!mov.pagado) { totalCredMio += mov.montoTotalAgrupado; totalCredCompartido += mov.montoAdeudado; }
            let saldoRest = mov.deudaRestante || 0;
            let textoConIndicador = mov.pagado ? `✅ ${escapeHTML(mov.conceptoOriginal)}` : escapeHTML(mov.conceptoOriginal);
            let celdaTarjeta = mov.tarjeta
                ? escapeHTML(mov.tarjeta)
                : `<button class="btn-secundario" style="padding:4px 8px; font-size:0.75em;" onclick="asignarTarjetaAGrupo('${mov.idGrupo}')">Asignar</button>`;
            let btnMarcarPagada = mov.pagado ? '' : `<button class="btn-verde" style="padding:6px 10px; font-size:0.85em;" onclick="marcarCuotaComoPagada('${mov.id}')">✓ Pagada</button> `;
            tbCredito.innerHTML += `<tr><td>${textoConIndicador}</td><td>${mov.cuotaActual}/${mov.cuotasTotales}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td style="color:#ef4444; font-weight:bold;">$${saldoRest.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${celdaTarjeta}</td><td>${lblComp}</td><td>${lblDeu}</td><td>${btnMarcarPagada}<button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">X Todo</button></td></tr>`;
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
            let lblComp = mov.esCompartido === "SÍ" ? `<span style="color:#0ea5e9; font-weight:bold;">SÍ</span>` : "No";
            let lblDeu = mov.montoAdeudado > 0 ? `<span style="color:#ef4444;">$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>` : "-";
            if (!mov.pagado) { totalServMio += mov.montoTotalAgrupado; totalServCompartido += mov.montoAdeudado; }
            let prevMonthDate = new Date(aSel, mSel - 1, 1);
            let keyMesAnterior = `${prevMonthDate.getFullYear()}-${(prevMonthDate.getMonth()+1).toString().padStart(2,'0')}`;
            let montoPasado = null; let variacionHtml = "-";
            let suscObj = estadoApp.suscripciones.find(s => s.id === mov.idGrupo);
            if(suscObj) {
                // "Mi parte" del mes anterior, en la MISMA unidad que se
                // muestra ahora (antes se comparaba contra el monto completo
                // sin dividir, lo que daba variaciones de -50% que no eran
                // reales en servicios compartidos).
                let parteAnterior = calcularMiParteSuscripcion(suscObj, keyMesAnterior);
                if (parteAnterior > 0) montoPasado = parteAnterior;
            }
            if(montoPasado !== null) {
                let diff = mov.montoTotalAgrupado - montoPasado;
                if(diff > 0) variacionHtml = `<span style="color:#ef4444; font-weight:bold;">▲ +${((diff/montoPasado)*100).toFixed(1)}%</span>`;
                else if(diff < 0) variacionHtml = `<span style="color:#10b981; font-weight:bold;">▼ -${((Math.abs(diff)/montoPasado)*100).toFixed(1)}%</span>`;
                else variacionHtml = `<span style="color:#94a3b8; font-weight:bold;">= Igual</span>`;
            } else { variacionHtml = `<span style="color:#3b82f6; font-style:italic;">Nuevo</span>`; }

            let debStr = mov.debito === "SI" ? "✅ Sí" : "❌ No";
            let textoServConIndicador = mov.pagado ? `✅ ${escapeHTML(mov.conceptoOriginal)}` : escapeHTML(mov.conceptoOriginal);
            let btnPagarServ = mov.pagado ? '' : `<button class="btn-verde" style="padding:6px 10px; font-size:0.85em;" onclick="pagarServicioIndividual('${mov.idGrupo}')">Pagar</button> `;
            tbServ.innerHTML += `<tr><td>${textoServConIndicador}</td><td>${debStr}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${variacionHtml}</td><td>${lblComp}</td><td>${lblDeu}</td><td>${btnPagarServ}<button class="btn-editar" onclick="abrirModalEditarServicio('${mov.idGrupo}')">Editar</button> <button class="btn-borrar" onclick="darDeBajaServicio('${mov.idGrupo}')" style="margin-left:5px;">Baja</button></td></tr>`;
        });

        document.getElementById('lblTotalCreditos').innerText = `Mío: $${totalCredMio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}   —   Compartido: $${totalCredCompartido.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        document.getElementById('lblTotalServicios').innerText = `Mío: $${totalServMio.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}   —   Compartido: $${totalServCompartido.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    }

    renderizarInversiones();
    actualizarPestañaCuentasCobrar(esAvanzado);
}

// Pinta toda la pestaña "Inversiones": cards resumen, checkboxes del gráfico
// y tabla de Historial de Movimientos.
function renderizarInversiones() {
    let valorSp500Usd = estadoApp.sp500.nominales * precioNominalSp500Usd();

    // --- Cards resumen (Pesos siempre; el resto solo si hay saldo) ---
    let cardsHtml = `<div class="card" style="background:#f8fafc;"><h3>Pesos</h3><p style="color:#1e3a8a;">$${estadoApp.patrimonio.pesos.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Disponible acumulado</span></div>`;
    if (estadoApp.patrimonio.dolares > 0) {
        let equivalenteArs = estadoApp.patrimonio.dolares * estadoApp.mercado.dolarOficial;
        cardsHtml += `<div class="card" style="background:#ecfdf5;"><h3>Dólares</h3><p style="color:#10b981;">US$ ${estadoApp.patrimonio.dolares.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">≈ $${equivalenteArs.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (dólar oficial)</span></div>`;
    }
    if (estadoApp.sp500.nominales > 0) {
        cardsHtml += `<div class="card" style="background:#fffbeb;"><h3>S&P 500</h3><p style="color:#f59e0b;">${Math.round(estadoApp.sp500.nominales)} Nom.</p><span class="porcentaje">US$ ${valorSp500Usd.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>`;
    }
    document.getElementById('dashboard-inversiones').innerHTML = cardsHtml;

    // --- Checkboxes del gráfico (solo si hay saldo en esa serie) ---
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

// Reconstruye el <select> de años del filtro de Detalle a partir de los años
// presentes en el historial, preservando la selección actual si sigue existiendo.
function poblarFiltroAnioDetalle() {
    let sel = document.getElementById('filtroDetalleAnio');
    let valorPrevio = sel.value || 'TODOS';
    let anios = [...new Set(estadoApp.historialInversiones.map(h => new Date(h.fecha + 'T00:00:00').getFullYear()))].sort((a, b) => b - a);
    sel.innerHTML = '<option value="TODOS">Todos los años</option>' + anios.map(a => `<option value="${a}">${a}</option>`).join('');
    if ([...sel.options].some(o => o.value === valorPrevio)) sel.value = valorPrevio;
}

const COLOR_MOV = { 'Inversión': '#10b981', 'Retiro': '#3b82f6', 'Extracción': '#ef4444' };

function renderizarTablaDetalleInversiones() {
    poblarFiltroAnioDetalle();
    let filtroInst = document.getElementById('filtroDetalleInstrumento').value;
    let filtroAnio = document.getElementById('filtroDetalleAnio').value;
    let tbody = document.getElementById('tablaDetalleInversiones'); tbody.innerHTML = '';
    document.getElementById('thFechaDetalleInversiones').innerHTML = `Fecha${iconoOrden('detalleInversiones', 'fecha')}`;
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
        // Los nominales (sin símbolo de moneda) se muestran redondeados; los
        // montos en pesos/dólares mantienen 2 decimales, como corresponde.
        let montoTxt = simbolo === ''
            ? `${Math.round(monto).toLocaleString('es-AR')}`
            : `${simbolo}${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        let colorMov = COLOR_MOV[h.mov] || '#64748b';
        tbody.innerHTML += `<tr><td style="color:${colorMov}; font-weight:bold;">${h.mov}</td><td>${escapeHTML(describirMovimientoInversion(h))}</td><td>${escapeHTML(h.instrumento)}</td><td>${montoTxt}</td><td>${ff}</td><td><button class="btn-borrar" onclick="revertirMovimientoInversion('${h.id}')">Revertir</button></td></tr>`;
    });
}

export function actualizarFiltrosDetalle() {
    renderizarTablaDetalleInversiones();
}

function actualizarPestañaCuentasCobrar(esAvanzado) {
    let sel = document.getElementById('filtroMesAnio'); if(!sel || !sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    let keySel = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;

    // Cuentas por Cobrar junta TODAS las deudas pendientes (una deuda no
    // "vence" con el paso de los meses), pero eso solo aplica a las
    // "Diarias" (En el Acto). Las "Fijas" (Tarjeta/Servicio) se devengan mes
    // a mes como cargos separados — cada mes es su propio cargo — así que
    // ahí sí importa mirar solo el mes que tenés filtrado arriba.
    let todasLasDeudasPendientes = obtenerTodasLasDeudasPendientes();

    if (!esAvanzado) {
        document.getElementById('thFechaDeudasBasicas').innerHTML = `Fecha${iconoOrden('deudasBasicas', 'fecha')}`;
        let ordenBasicas = ordenTablas.deudasBasicas;
        let filasBasicas = [...todasLasDeudasPendientes].sort((a, b) => (ordenBasicas.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));

        let tbBasica = document.getElementById('tablaDeudasBasicas'); tbBasica.innerHTML = '';
        filasBasicas.forEach(mov => {
            let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
            let sim = mov.sentido === "A_FAVOR" ? `$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : `-$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (Debo)`;
            let btnA = mov.sentido === "A_FAVOR" ? `<button class="btn-verde" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Cobrar</button>` : `<button class="btn-naranja" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Pagar</button>`;
            tbBasica.innerHTML += `<tr><td>${ff}</td><td><strong>${escapeHTML(mov.deudor)}</strong></td><td>${escapeHTML(mov.concepto)}</td><td>${sim}</td><td>${btnA}</td></tr>`;
        });
        return;
    }

    // MODO AVANZADO
    document.getElementById('thFechaDeudasDiarias').innerHTML = `Fecha${iconoOrden('deudasDiarias', 'fecha')}`;
    document.getElementById('thFechaDeudasFijas').innerHTML = `Fecha${iconoOrden('deudasFijas', 'fecha')}`;
    let ordenDiarias = ordenTablas.deudasDiarias;
    let ordenFijas = ordenTablas.deudasFijas;

    let deudasDiariasArr = todasLasDeudasPendientes.filter(mov => mov.metodo === "EN_EL_ACTO");
    let deudasFijasArr = todasLasDeudasPendientes.filter(mov => mov.metodo !== "EN_EL_ACTO" && obtenerKeyPeriodoDeFecha(mov.fecha) === keySel);

    let totDiario = {}; let totTarjeta = {}; let totServicio = {};
    estadoApp.listaAmigos.forEach(am => { totDiario[am] = 0; totTarjeta[am] = 0; totServicio[am] = 0; });

    // Los totales por persona se calculan sobre lo que efectivamente se va a
    // mostrar en cada tabla (Diarias: todo lo pendiente; Fijas: solo el mes
    // filtrado), no sobre el orden en que después se muestren las filas.
    deudasDiariasArr.forEach(mov => { if(totDiario[mov.deudor] !== undefined) totDiario[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto; });
    deudasFijasArr.forEach(mov => {
        let destino = mov.metodo === "CREDITO" ? totTarjeta : totServicio;
        if(destino[mov.deudor] !== undefined) destino[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto;
    });

    let filaHtml = (mov) => {
        let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
        let sim = mov.sentido === "A_FAVOR" ? `$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : `-$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (Debo)`;
        let btnA = mov.sentido === "A_FAVOR" ? `<button class="btn-verde" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Cobrar</button>` : `<button class="btn-naranja" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Pagar</button>`;
        return `<tr><td>${ff}</td><td><strong>${escapeHTML(mov.deudor)}</strong></td><td>${escapeHTML(mov.concepto)}</td><td>${sim}</td><td>${btnA} <button class="btn-borrar" style="padding:3px; font-size:0.8em; margin-left:5px;" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">X</button></td></tr>`;
    };

    deudasDiariasArr.sort((a, b) => (ordenDiarias.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));
    deudasFijasArr.sort((a, b) => (ordenFijas.ascendente ? 1 : -1) * compararValores(a.fecha, b.fecha));

    let tbDiaria = document.getElementById('tablaDeudasDiarias'); tbDiaria.innerHTML = '';
    deudasDiariasArr.forEach(mov => { tbDiaria.innerHTML += filaHtml(mov); });
    let tbFija = document.getElementById('tablaDeudasFijas'); tbFija.innerHTML = '';
    deudasFijasArr.forEach(mov => { tbFija.innerHTML += filaHtml(mov); });

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
