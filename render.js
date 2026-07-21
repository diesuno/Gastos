// ==========================================
// 🖼️ RENDERIZADO PRINCIPAL (dashboard, pestañas y tablas)
// ==========================================
import { estadoApp, nombresMeses, fechaActual } from './estado.js';
import { escapeHTML, agruparMovimientosPorGrupo, precioNominalSp500Usd, describirMovimientoInversion, obtenerMontoYSimboloParaMostrar } from './utilidades.js';
import { calcularFlujoDeMes } from './flujoMensual.js';
import { sincronizarPoolPesos } from './cierreMensual.js';
import { renderizarGrafico, seriesGrafico } from './grafico.js';
import { guardarDatosEnNube } from './auth.js';

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
    if(tabId === 'tab-inversiones' || tabId === 'tab-perfil') panelMes.style.display = 'none';
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

    // El pool de Pesos se mantiene sincronizado con el Disponible real de cada
    // mes (incluido el mes en curso) en cada actualización de la app.
    if (sincronizarPoolPesos()) guardarDatosEnNube();

    // RENDER DASHBOARD DINÁMICO
    let dashUI = document.getElementById('dashboard-dinamico');

    if (esAvanzado) {
        let disponible = ing - gastosEnActo;
        dashUI.innerHTML = `
            <div class="card ingreso"><h3>Ingresos Totales</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
            <div class="card gasto" style="background:#fffbeb; border-left-color:#f59e0b;"><h3>Pagado (En Acto)</h3><p style="color:#d97706;">$${gastosEnActo.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Dinero que ya salió hoy.</span></div>
            <div class="card gasto"><h3>Obligaciones (Cuotas+Serv)</h3><p>$${(gastosCredito + gastosServicio).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Deudas del mes a pagar.</span></div>
            <div class="card ahorro" style="grid-column: span 3; background:#e0f2fe; border-color: #0ea5e9;"><h3>Disponible</h3><p style="color:#1e3a8a; font-size: 1.8em;">$${disponible.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Plata en mano hoy (no descuenta cuotas ni servicios pendientes).</span></div>
        `;
    } else {
        let dispBasic = ing - (gastosFijosBasic + gastosVariablesBasic);
        let pctFijos = ing > 0 ? ((gastosFijosBasic / ing) * 100).toFixed(1) : '0.0';
        let pctVariables = ing > 0 ? ((gastosVariablesBasic / ing) * 100).toFixed(1) : '0.0';
        dashUI.innerHTML = `
            <div class="card ingreso"><h3>Ingresos</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
            <div class="card gasto"><h3>Gastos Fijos</h3><p>$${gastosFijosBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctFijos}% de tus ingresos</span></div>
            <div class="card gasto"><h3>Gastos Variables</h3><p>$${gastosVariablesBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">${pctVariables}% de tus ingresos</span></div>
            <div class="card ahorro" style="grid-column: span 3; background:#e0f2fe; border-color: #0ea5e9;"><h3>Disponible</h3><p style="color:#1e3a8a; font-size: 1.8em;">$${dispBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Lo que te queda en el mes.</span></div>
        `;
    }

    // RENDER TABLA FLUJO
    let tabla = document.getElementById('tablaMovimientos'); tabla.innerHTML = '';
    let thead = document.getElementById('headTablaMovimientos');
    if (esAvanzado) {
        thead.innerHTML = `<tr><th>Fecha</th><th>Texto</th><th>Método</th><th>Monto Total</th><th>Compartido</th><th>Deuda Asoc.</th><th>Acción</th></tr>`;

        let gruposUI = agruparMovimientosPorGrupo(estadoApp.movimientosMesGlobal);

        [...Object.values(gruposUI)].reverse().forEach(mov => {
            if(mov.tipo === "Ingreso" && mov.monto === 0) return;
            let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
            let mtdText = mov.metodo === "CREDITO" ? "💳 Crédito" : (mov.metodo === "SERVICIO" ? "🔌 Servicio" : "💵 En el Acto");
            let lblComp = mov.esCompartido === "SÍ" ? `<span style="color:#0ea5e9; font-weight:bold;">SÍ</span>` : "No";
            let lblDeu = mov.montoAdeudado > 0 ? `<span style="color:#ef4444;">$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>` : "-";
            tabla.innerHTML += `<tr><td>${ff}</td><td>${escapeHTML(mov.conceptoOriginal)}</td><td>${mtdText}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${lblComp}</td><td>${lblDeu}</td><td><button class="btn-borrar" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">X</button></td></tr>`;
        });
    } else {
        thead.innerHTML = `<tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Acción</th></tr>`;
        [...estadoApp.movimientosMesGlobal].reverse().forEach(mov => {
            if(mov.tipo === "Cuenta Cobrar") return;
            let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
            tabla.innerHTML += `<tr><td>${ff}</td><td>${escapeHTML(mov.concepto)}</td><td>${mov.tipo}</td><td>$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td><button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">X</button></td></tr>`;
        });
    }

    // RENDER DETALLES GASTOS (SOLO AVANZADO)
    if (esAvanzado) {
        let tbCredito = document.getElementById('tablaCreditos'); tbCredito.innerHTML = '';
        let tbServ = document.getElementById('tablaServicios'); tbServ.innerHTML = '';
        let totalCredAgrup = 0, totalServAgrup = 0;

        let gruposUI = agruparMovimientosPorGrupo(estadoApp.movimientosMesGlobal);

        Object.values(gruposUI).forEach(mov => {
            if(mov.tipo === "Ingreso") return;
            let lblComp = mov.esCompartido === "SÍ" ? `<span style="color:#0ea5e9; font-weight:bold;">SÍ</span>` : "No";
            let lblDeu = mov.montoAdeudado > 0 ? `<span style="color:#ef4444;">$${mov.montoAdeudado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>` : "-";

            if(mov.metodo === "CREDITO") {
                totalCredAgrup += mov.montoTotalAgrupado;
                let saldoRest = mov.deudaRestante || 0;
                tbCredito.innerHTML += `<tr><td>${escapeHTML(mov.conceptoOriginal)}</td><td>${mov.cuotaActual}/${mov.cuotasTotales}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td style="color:#ef4444; font-weight:bold;">$${saldoRest.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${lblComp}</td><td>${lblDeu}</td><td><button class="btn-borrar" onclick="borrarMovimientoReal('${mov.idGrupo}')">X Todo</button></td></tr>`;
            }
            if(mov.metodo === "SERVICIO") {
                totalServAgrup += mov.montoTotalAgrupado;
                let prevMonthDate = new Date(aSel, mSel - 1, 1);
                let montoPasado = null; let variacionHtml = "-";
                let suscObj = estadoApp.suscripciones.find(s => s.id === mov.idGrupo);
                if(suscObj) {
                    let dKeys = Object.keys(suscObj.montosPorMes).sort();
                    for (let key of dKeys) { let [kA, kM] = key.split('-').map(Number); if (new Date(kA, kM - 1, 1) <= prevMonthDate) montoPasado = suscObj.montosPorMes[key]; }
                }
                if(montoPasado !== null) {
                    let diff = mov.montoTotalAgrupado - montoPasado;
                    if(diff > 0) variacionHtml = `<span style="color:#ef4444; font-weight:bold;">▲ +${((diff/montoPasado)*100).toFixed(1)}%</span>`;
                    else if(diff < 0) variacionHtml = `<span style="color:#10b981; font-weight:bold;">▼ -${((Math.abs(diff)/montoPasado)*100).toFixed(1)}%</span>`;
                    else variacionHtml = `<span style="color:#94a3b8; font-weight:bold;">= Igual</span>`;
                } else { variacionHtml = `<span style="color:#3b82f6; font-style:italic;">Nuevo</span>`; }

                let debStr = mov.debito === "SI" ? "✅ Sí" : "❌ No";
                tbServ.innerHTML += `<tr><td>${escapeHTML(mov.conceptoOriginal)}</td><td>${debStr}</td><td>$${mov.montoTotalAgrupado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${variacionHtml}</td><td>${lblComp}</td><td>${lblDeu}</td><td><button class="btn-editar" onclick="editarMontoServicio('${mov.idGrupo}', ${mov.montoTotalAgrupado})">Editar</button> <button class="btn-borrar" onclick="darDeBajaServicio('${mov.idGrupo}')" style="margin-left:5px;">Baja</button></td></tr>`;
            }
        });
        document.getElementById('lblTotalCreditos').innerText = `Total Tarjetas: $${totalCredAgrup.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        document.getElementById('lblTotalServicios').innerText = `Total Servicios: $${totalServAgrup.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
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
        cardsHtml += `<div class="card" style="background:#ecfdf5;"><h3>Dólares</h3><p style="color:#10b981;">US$ ${estadoApp.patrimonio.dolares.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>`;
    }
    if (estadoApp.sp500.nominales > 0) {
        cardsHtml += `<div class="card" style="background:#fffbeb;"><h3>S&P 500</h3><p style="color:#f59e0b;">${estadoApp.sp500.nominales.toFixed(4)} Nom.</p><span class="porcentaje">US$ ${valorSp500Usd.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span></div>`;
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

    [...estadoApp.historialInversiones].reverse().filter(h => {
        if (filtroInst !== 'TODOS' && h.instrumento !== filtroInst) return false;
        if (filtroAnio !== 'TODOS' && new Date(h.fecha + 'T00:00:00').getFullYear().toString() !== filtroAnio) return false;
        return true;
    }).forEach(h => {
        let f = new Date(h.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
        let { monto, simbolo } = obtenerMontoYSimboloParaMostrar(h);
        let montoTxt = `${simbolo}${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:4})}`;
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

    let deudasHistoricasReales = estadoApp.todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && new Date(m.fecha + 'T00:00:00').getFullYear() === aSel && new Date(m.fecha + 'T00:00:00').getMonth() === mSel);
    let deudasVirtualesMes = estadoApp.movimientosMesGlobal.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && m.esVirtual);
    let todasLasDeudas = [...deudasHistoricasReales, ...deudasVirtualesMes];

    if (!esAvanzado) {
        let tbBasica = document.getElementById('tablaDeudasBasicas'); tbBasica.innerHTML = '';
        todasLasDeudas.forEach(mov => {
            let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
            let sim = mov.sentido === "A_FAVOR" ? `$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : `-$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (Debo)`;
            let btnA = mov.sentido === "A_FAVOR" ? `<button class="btn-verde" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Cobrar</button>` : `<button class="btn-naranja" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Pagar</button>`;
            tbBasica.innerHTML += `<tr><td>${ff}</td><td><strong>${escapeHTML(mov.deudor)}</strong></td><td>${escapeHTML(mov.concepto)}</td><td>${sim}</td><td>${btnA}</td></tr>`;
        });
        return;
    }

    // MODO AVANZADO
    let totDiario = {}; let totFijo = {};
    estadoApp.listaAmigos.forEach(am => { totDiario[am] = 0; totFijo[am] = 0; });
    let tbDiaria = document.getElementById('tablaDeudasDiarias'); tbDiaria.innerHTML = '';
    let tbFija = document.getElementById('tablaDeudasFijas'); tbFija.innerHTML = '';

    todasLasDeudas.forEach(mov => {
        let esDiario = (mov.metodo === "EN_EL_ACTO");
        if(totDiario[mov.deudor] !== undefined) {
            if(esDiario) totDiario[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto;
            else totFijo[mov.deudor] += (mov.sentido === "A_FAVOR") ? mov.monto : -mov.monto;
        }
        let f = new Date(mov.fecha + 'T00:00:00'); let ff = `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
        let sim = mov.sentido === "A_FAVOR" ? `$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : `-$${mov.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})} (Debo)`;
        let btnA = mov.sentido === "A_FAVOR" ? `<button class="btn-verde" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Cobrar</button>` : `<button class="btn-naranja" style="padding:3px; font-size:0.8em;" onclick="liquidarDeudaIndividual('${mov.id}')">Pagar</button>`;
        let htmlRow = `<tr><td>${ff}</td><td><strong>${escapeHTML(mov.deudor)}</strong></td><td>${escapeHTML(mov.concepto)}</td><td>${sim}</td><td>${btnA} <button class="btn-borrar" style="padding:3px; font-size:0.8em; margin-left:5px;" onclick="${mov.esVirtual ? `darDeBajaServicio('${mov.idGrupo}')` : `borrarMovimientoReal('${mov.idGrupo}')`}">X</button></td></tr>`;

        if(esDiario) tbDiaria.innerHTML += htmlRow; else tbFija.innerHTML += htmlRow;
    });

    let gridDeudas = document.getElementById('gridResumenDeudas'); gridDeudas.innerHTML = '';
    for(let p in totDiario) {
        let sD = totDiario[p]; let sF = totFijo[p]; let sTotal = sD + sF;
        if (sD === 0 && sF === 0) continue;
        let colorB = sTotal >= 0 ? "#10b981" : "#ef4444"; let colorC = sTotal >= 0 ? "#ecfdf5" : "#fef2f2";

        gridDeudas.innerHTML += `<div class="card" style="border-left-color: ${colorB}; background:${colorC}; text-align:left;">
            <h3 style="margin-top:0; text-align:center;">${escapeHTML(p)}</h3>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em;">
                <span>Diario: <b>${sD >= 0 ? '' : '-'}$${Math.abs(sD).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></span>
                <button class="btn-secundario" style="padding:4px 8px; font-size:0.8em;" onclick="liquidarDeudaGlobal('${p}', ${sD}, 'DIARIO')">Saldar</button>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9em;">
                <span>Tarjetas/Serv: <b>${sF >= 0 ? '' : '-'}$${Math.abs(sF).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</b></span>
                <button class="btn-secundario" style="padding:4px 8px; font-size:0.8em;" onclick="liquidarDeudaGlobal('${p}', ${sF}, 'FIJO')">Saldar</button>
            </div>
            <hr style="border:0; border-top:1px solid #cbd5e1; margin:10px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1.1em; color:${colorB}; font-weight:bold;">NETO: ${sTotal >= 0 ? '' : '-'}$${Math.abs(sTotal).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                <button style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;" onclick="liquidarDeudaGlobal('${p}', ${sTotal}, 'TODO')">Pagar Todo</button>
            </div>
        </div>`;
    }
}
