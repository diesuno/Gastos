// ==========================================
// 🖼️ RENDERIZADO PRINCIPAL (dashboard, pestañas y tablas)
// ==========================================
import { estadoApp, nombresMeses, fechaActual } from './estado.js';
import { escapeHTML, agruparMovimientosPorGrupo, generarId } from './utilidades.js';
import { renderizarGrafico } from './grafico.js';

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
    if(tabId === 'tab-ahorros' || tabId === 'tab-graficos') panelMes.style.display = 'none';
    else panelMes.style.display = 'flex';

    if (tabId === 'tab-graficos') renderizarGrafico();
}

export function actualizarApp() {
    let sel = document.getElementById('filtroMesAnio'); if(!sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    estadoApp.keyMesActualGlobal = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let fechaSelObj = new Date(aSel, mSel, 1);
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

    let filtrados = estadoApp.todosLosMovimientos.filter(mov => {
        let f = new Date(mov.fecha + 'T00:00:00'); return f.getFullYear() === aSel && f.getMonth() === mSel;
    });

    let movsVirtuales = [];
    if(esAvanzado) {
        estadoApp.suscripciones.forEach(susc => {
            let fAlta = new Date(susc.fechaAlta + 'T00:00:00'); let fAltaMesObj = new Date(fAlta.getFullYear(), fAlta.getMonth(), 1);
            if (fechaSelObj < fAltaMesObj) return;
            if (susc.mesBaja) { let [bA, bM] = susc.mesBaja.split('-').map(Number); if (fechaSelObj >= new Date(bA, bM - 1, 1)) return; }

            let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
            for (let key of diffKeys) { let [kA, kM] = key.split('-').map(Number); if (new Date(kA, kM - 1, 1) <= fechaSelObj) montoActivo = susc.montosPorMes[key]; }
            if (montoActivo === 0) return;

            let vMov = { id: susc.id + "_" + estadoApp.keyMesActualGlobal, idGrupo: susc.id, monto: montoActivo, tipo: susc.tipo, concepto: susc.concepto, fecha: `${aSel}-${(mSel+1).toString().padStart(2,'0')}-01`, metodo: "SERVICIO", debito: susc.debito, dividir: susc.dividir, amigo: susc.amigo, esVirtual: true };

            let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";
            if (susc.dividir === "PAGUE_50_TOTAL") { vMov.monto = montoActivo/2; }
            else if (susc.dividir === "PAGUE_50_INTEGRO") { vMov.monto = montoActivo/2; movsVirtuales.push({...vMov, id: generarId(), monto: montoActivo/2, tipo: "Gasto Variable", concepto: `Adelanto a ${susc.amigo}: ${susc.concepto}`}); registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_50") { registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "EN_CONTRA"; }
            else if (susc.dividir === "PAGUE_100_DEUDA") { vMov.monto = montoActivo; vMov.tipo = "Gasto Variable"; vMov.concepto = `Adelanto a ${susc.amigo}: ${susc.concepto}`; registrarDeuda = true; mDeuda = montoActivo; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_100_DEUDA") { registrarDeuda = true; mDeuda = montoActivo; tDeuda = "EN_CONTRA"; }

            if (susc.dividir !== "PAGO_OTRO_50" && susc.dividir !== "PAGO_OTRO_100_DEUDA") { movsVirtuales.push(vMov); }

            if(registrarDeuda) {
                let yaPagado = (susc.pagosAmigo && susc.pagosAmigo.includes(estadoApp.keyMesActualGlobal));
                movsVirtuales.push({ id: susc.id + "_deuda_" + estadoApp.keyMesActualGlobal, idGrupo: susc.id, monto: mDeuda, tipo: "Cuenta Cobrar", concepto: tDeuda === "A_FAVOR" ? `Te debe por: ${susc.concepto}` : `Le debés por: ${susc.concepto}`, fecha: vMov.fecha, deudor: susc.amigo, sentido: tDeuda, estado: yaPagado ? "Saldado" : "Pendiente", metodo: "SERVICIO", esVirtual: true, mesClave: estadoApp.keyMesActualGlobal });
            }
        });
    }

    estadoApp.movimientosMesGlobal = filtrados.concat(movsVirtuales);

    // RENDER DASHBOARD DINÁMICO
    let dashUI = document.getElementById('dashboard-dinamico');
    let ing = 0, gastosEnActo = 0, gastosCredito = 0, gastosServicio = 0;
    let gastosFijosBasic = 0, gastosVariablesBasic = 0;

    estadoApp.movimientosMesGlobal.forEach(mov => {
        if (mov.tipo === "Ingreso") ing += mov.monto;
        if (mov.tipo === "Gasto Fijo" || mov.tipo === "Enviado a Ahorros") gastosFijosBasic += mov.monto;
        if (mov.tipo === "Gasto Variable") gastosVariablesBasic += mov.monto;

        if (mov.tipo !== "Ingreso" && mov.tipo !== "Cuenta Cobrar") {
            let mtd = mov.metodo || "EN_EL_ACTO";
            if(mtd === "EN_EL_ACTO") gastosEnActo += mov.monto;
            if(mtd === "CREDITO") gastosCredito += mov.monto;
            if(mtd === "SERVICIO") gastosServicio += mov.monto;
        }
    });

    if (esAvanzado) {
        let dispReal = ing - gastosEnActo; let dispProy = ing - (gastosEnActo + gastosCredito + gastosServicio);
        dashUI.innerHTML = `
            <div class="card ingreso"><h3>Ingresos Totales</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
            <div class="card gasto" style="background:#fffbeb; border-left-color:#f59e0b;"><h3>Pagado (En Acto)</h3><p style="color:#d97706;">$${gastosEnActo.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Dinero que ya salió hoy.</span></div>
            <div class="card gasto"><h3>Obligaciones (Cuotas+Serv)</h3><p>$${(gastosCredito + gastosServicio).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p><span class="porcentaje">Deudas del mes a pagar.</span></div>
            <div class="card ahorro" style="grid-column: span 3; background:#f1f5f9; border-color: #94a3b8; display: flex; justify-content: space-around; align-items: center; padding: 20px;">
                <div><h3 style="margin-top:0;">Disponible Real (Bolsillo)</h3><p style="color:#10b981; font-size:1.6em;">$${dispReal.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
                <div><h3 style="margin-top:0;">Disponible Proyectado</h3><p style="color:#ef4444; font-size:1.6em;">$${dispProy.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
                <span class="porcentaje" style="position: absolute; bottom: 5px; width: 100%; text-align: center; font-weight:normal;">Real = Plata en mano hoy. Proyectado = Lo que quedará al pagar las deudas del mes.</span>
            </div>
        `;
    } else {
        let dispBasic = ing - (gastosFijosBasic + gastosVariablesBasic);
        dashUI.innerHTML = `
            <div class="card ingreso"><h3>Ingresos</h3><p>$${ing.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
            <div class="card gasto"><h3>Gastos Fijos</h3><p>$${gastosFijosBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
            <div class="card gasto"><h3>Gastos Variables</h3><p>$${gastosVariablesBasic.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</p></div>
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

    // BILLETERA PATRIMONIAL
    document.getElementById('walletPesos').innerText = estadoApp.patrimonio.pesos.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
    document.getElementById('walletDolares').innerText = estadoApp.patrimonio.dolares.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});

    let totalInvARS = 0, capInvARS = 0, totalInvUSD = 0, capInvUSD = 0;
    let hoyLimpiada = new Date(); hoyLimpiada.setHours(0,0,0,0);
    let tablaInv = document.getElementById('tablaInversiones'); tablaInv.innerHTML = '';
    estadoApp.inversiones.forEach((inv, index) => {
        let sim = inv.moneda === "ARS" ? "$" : "US$";
        let fDate = new Date(inv.fecha + 'T00:00:00'); let ff = `${fDate.getDate().toString().padStart(2,'0')}/${(fDate.getMonth()+1).toString().padStart(2,'0')}/${fDate.getFullYear()}`;
        let dias = Math.max(0, Math.round((hoyLimpiada - fDate) / (1000 * 60 * 60 * 24)));
        let valorAct = inv.monto; let colDetalle = "";

        if(inv.instrumento === "S&P 500") {
            valorAct = (inv.nominales || 0) * (inv.moneda === "ARS" ? estadoApp.mercado.spy_ars : estadoApp.mercado.spy_usd);
            colDetalle = `<strong>${(inv.nominales||0).toFixed(4)} Nom.</strong>`;
        } else {
            let tna = inv.interes || (inv.moneda === "ARS" ? estadoApp.mercado.mpARS : estadoApp.mercado.mpUSD);
            valorAct = inv.monto + (inv.monto * (tna / 100) * (dias / 365));
            colDetalle = `<span>${tna}% TNA (${dias} días)</span>`;
        }

        if(inv.moneda === "ARS") { totalInvARS += valorAct; capInvARS += inv.monto; } else { totalInvUSD += valorAct; capInvUSD += inv.monto; }
        let colorValor = valorAct >= inv.monto ? "#10b981" : "#ef4444";
        tablaInv.innerHTML += `<tr><td>${ff}</td><td><strong>${inv.instrumento}</strong></td><td>${sim}${inv.monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</td><td style="color:${colorValor}; font-weight:bold;">${sim}${valorAct.toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2})}</td><td>${colDetalle}</td><td><button class="btn-naranja" onclick="retirarInversion(${index}, ${valorAct})">Liquidar</button></td></tr>`;
    });

    document.getElementById('invTotalPesos').innerText = totalInvARS.toLocaleString('es-AR', {minimumFractionDigits:0});
    document.getElementById('invTotalDolares').innerText = totalInvUSD.toLocaleString('es-AR', {minimumFractionDigits:0});
    let pctARS = capInvARS > 0 ? (((totalInvARS - capInvARS) / capInvARS) * 100).toFixed(2) : 0;
    let pctUSD = capInvUSD > 0 ? (((totalInvUSD - capInvUSD) / capInvUSD) * 100).toFixed(2) : 0;

    document.getElementById('invRendPesos').innerText = (pctARS >= 0 ? "+" : "") + pctARS + "%"; document.getElementById('invRendPesos').style.color = pctARS >= 0 ? "#10b981" : "#ef4444";
    document.getElementById('invRendDolares').innerText = (pctUSD >= 0 ? "+" : "") + pctUSD + "%"; document.getElementById('invRendDolares').style.color = pctUSD >= 0 ? "#10b981" : "#ef4444";

    actualizarPestañaCuentasCobrar(esAvanzado);
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
