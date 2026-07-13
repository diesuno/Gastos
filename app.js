// ==========================================
// ⚙️ CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD6b5jRsGPzKmwB-M-cDbyn1qQCAdN5ecE",
    authDomain: "gastos-a56f7.firebaseapp.com",
    projectId: "gastos-a56f7",
    storageBucket: "gastos-a56f7.firebasestorage.app",
    messagingSenderId: "537729737132",
    appId: "1:537729737132:web:2423ab40ff20fef30b9a09"
};
// ==========================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let todosLosMovimientos = [];
let suscripciones = [];
let patrimonio = { pesos: 0, dolares: 0 };
let inversiones = [];
let listaAmigos = [];
let perfilUsuario = { nombre: "Usuario", modo: "" };

let movimientosMesGlobal = [];
let keyMesActualGlobal = "";

let mercado = { spy_ars: 17000, spy_usd: 540, mpTna: 17.5 };

const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fechaActual = new Date();
document.getElementById('inputFecha').valueAsDate = fechaActual;
document.getElementById('invFecha').valueAsDate = fechaActual;
let miGrafico = null;

function generarId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

// Convierte texto libre del usuario (concepto, nombre de persona, etc.) en texto
// seguro para insertar con innerHTML, neutralizando <, >, &, comillas.
// SIEMPRE usar esta función al mostrar dentro de una tabla cualquier dato
// que haya sido tipeado por el usuario (no hace falta para números o textos fijos).
function escapeHTML(texto) {
    if (texto === null || texto === undefined) return "";
    const div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
}

// Agrupa una lista de movimientos por idGrupo (une las cuotas de una misma compra
// en un solo registro para mostrar) y calcula, para cada grupo, el monto total
// sumado y cuánto de ese grupo está compartido/adeudado con otra persona.
// Se usa tanto en la tabla de "Flujo Mensual" como en "Detalle Gastos" — antes
// este mismo bloque estaba copiado en los dos lugares.
function agruparMovimientosPorGrupo(movimientos) {
    let gruposUI = {};
    movimientos.forEach(mov => {
        if (mov.tipo === "Cuenta Cobrar") return;
        if (!gruposUI[mov.idGrupo]) {
            gruposUI[mov.idGrupo] = { ...mov, montoTotalAgrupado: 0, esCompartido: "NO", montoAdeudado: 0, conceptoOriginal: mov.concepto.replace(/^Adelanto a .*?: /, '') };
        }
        gruposUI[mov.idGrupo].montoTotalAgrupado += mov.monto;
    });
    movimientos.forEach(mov => {
        if (mov.tipo === "Cuenta Cobrar" && gruposUI[mov.idGrupo]) {
            gruposUI[mov.idGrupo].esCompartido = "SÍ"; gruposUI[mov.idGrupo].montoAdeudado += mov.monto;
        }
    });
    return gruposUI;
}

auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        inicializarSelectorHistorico();
        inicializarMercado();
        cargarDatosDesdeNube(user.uid);
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('main-app').style.display = 'none';
    }
});

async function inicializarMercado() {
    try { let res = await fetch("https://api.argentinadatos.com/v1/finanzas/rendimientos/fci"); let data = await res.json(); let mp = data.find(f => f.fondo.toLowerCase().includes("mercado")); if(mp && mp.tna) mercado.mpTna = (mp.tna * 100).toFixed(1); } catch(e) {}
    try { let res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/SPY.BA")); let data = await res.json(); if(data.chart.result) { let p = data.chart.result[0].meta.regularMarketPrice; if(p > 100000) p /= 10; mercado.spy_ars = p; } } catch(e) {}
    try { let res = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/SPY")); let data = await res.json(); if(data.chart.result) mercado.spy_usd = data.chart.result[0].meta.regularMarketPrice; } catch(e) {}
    toggleCamposInversion(); actualizarApp();
}

function registrarUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return; auth.createUserWithEmailAndPassword(email, pass).then(()=>alert("Creado!")).catch(e=>alert(e.message));
}
function loginUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return; auth.signInWithEmailAndPassword(email, pass).catch(e=>alert(e.message));
}
function logoutUsuario() { if(confirm("¿Salir?")) auth.signOut(); }

// --- GESTIÓN DE PERFILES Y MODOS ---
function cargarDatosDesdeNube(uid) {
    db.collection("usuarios").doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            todosLosMovimientos = data.todosLosMovimientos || [];
            suscripciones = data.suscripciones || [];
            patrimonio = data.patrimonio || { pesos: 0, dolares: 0 };
            inversiones = data.inversiones || [];
            listaAmigos = data.listaAmigos || [];

            if (data.perfilUsuario) {
                perfilUsuario = data.perfilUsuario;
            }
            // Si venía de una versión anterior que no tenía 'modo' guardado
            if (typeof perfilUsuario.modo === "undefined") {
                perfilUsuario.modo = "";
            }
        }

        document.getElementById('userNameDisplay').innerText = perfilUsuario.nombre;
        document.getElementById('profileNameInput').value = perfilUsuario.nombre;

        if (perfilUsuario.modo === "") {
            document.getElementById('onboarding-modal').style.display = 'flex';
        } else {
            document.getElementById('onboarding-modal').style.display = 'none';
            document.getElementById('profileModoInput').value = perfilUsuario.modo;
        }

        actualizarSelectAmigosDisplay();
        aplicarFiltrosDeModo();
        actualizarApp();
    });
}

function guardarModoDesdeOnboarding(modoElegido) {
    perfilUsuario.modo = modoElegido;
    document.getElementById('onboarding-modal').style.display = 'none';
    document.getElementById('profileModoInput').value = modoElegido;
    guardarDatosEnNube();
}

function guardarCambiosDesdePerfil() {
    let n = document.getElementById('profileNameInput').value;
    if(n) perfilUsuario.nombre = n;

    perfilUsuario.modo = document.getElementById('profileModoInput').value;

    guardarDatosEnNube();
    aplicarFiltrosDeModo();
    actualizarApp();
    alert("Perfil actualizado correctamente.");
}

function guardarNombrePerfil() {
    guardarCambiosDesdePerfil();
}

function aplicarFiltrosDeModo() {
    let esAvanzado = (perfilUsuario.modo === "AVANZADO");

    if (esAvanzado) {
        document.body.classList.remove('modo-basico');
    } else {
        document.body.classList.add('modo-basico');

        // Si estaba parado en la pestaña Detalles, lo devuelvo al inicio
        if (document.getElementById('tab-detalle-gastos').classList.contains('active')) {
            document.querySelector('.tab-button').click();
        }
    }

    document.getElementById('lblConceptoTexto').innerText = esAvanzado ? "Texto" : "Concepto";
    document.getElementById('inputConcepto').placeholder = esAvanzado ? "Ej: Compra Coto, Cena..." : "Ej: Sueldo, Supermercado...";

    if(!esAvanzado) {
        document.getElementById('tituloDeudaUnica').style.display = "block";
        document.getElementById('tablaDeudaUnica').style.display = "block";
    } else {
        document.getElementById('tituloDeudaUnica').style.display = "none";
        document.getElementById('tablaDeudaUnica').style.display = "none";
    }

    evaluarCamposDinamicosGasto();
}

function togglePerfilPanel() {
    let p = document.getElementById('profile-section');
    p.style.display = p.style.display === "block" ? "none" : "block";
}
function cambiarPasswordPerfil() {
    let n = document.getElementById('profilePasswordInput').value;
    if(n.length < 6) return alert("Mínimo 6 chars");
    auth.currentUser.updatePassword(n).then(() => { alert("Clave cambiada"); togglePerfilPanel(); }).catch(()=>alert("Volvé a iniciar sesión"));
}

function guardarDatosEnNube() {
    if(auth.currentUser) db.collection("usuarios").doc(auth.currentUser.uid).set({
        todosLosMovimientos: todosLosMovimientos, suscripciones: suscripciones,
        patrimonio: patrimonio, inversiones: inversiones, listaAmigos: listaAmigos, perfilUsuario: perfilUsuario
    }, { merge: true });
}

// --- FORMULARIO Y LÓGICA DE CARGA ---
function evaluarCamposDinamicosGasto() {
    let t = document.getElementById('inputTipo').value;
    let esGasto = (t !== "Ingreso");
    let esAvanzado = (perfilUsuario.modo === "AVANZADO");

    if (!esGasto || !esAvanzado) {
        document.getElementById('boxMetodoPago').style.display = "none";
        document.getElementById('boxPlanCuotas').style.display = "none";
        document.getElementById('boxDebitoAuto').style.display = "none";
        document.getElementById('boxGastoCompartido').style.display = "none";
        document.getElementById('boxSeleccionAmigo').style.display = "none";

        document.getElementById('inputMetodoPago').value = "EN_EL_ACTO";
        document.getElementById('inputCuotas').value = "1";
        document.getElementById('inputDebitoAuto').value = "NO";
        document.getElementById('inputDividir').value = "NO";
        return;
    }

    document.getElementById('boxMetodoPago').style.display = "block";
    document.getElementById('boxGastoCompartido').style.display = "block";

    let m = document.getElementById('inputMetodoPago').value;
    document.getElementById('boxPlanCuotas').style.display = (m === "CREDITO") ? "block" : "none";
    document.getElementById('boxDebitoAuto').style.display = (m === "SERVICIO") ? "block" : "none";

    if(m !== "CREDITO") document.getElementById('inputCuotas').value = "1";
    toggleSelectAmigo();
}

function toggleSelectAmigo() {
    if (perfilUsuario.modo !== "AVANZADO") return;
    let d = document.getElementById('inputDividir').value;
    document.getElementById('boxSeleccionAmigo').style.display = (d !== "NO") ? "block" : "none";
}

function crearPersonaDeuda() {
    let n = document.getElementById('nuevoAmigoNombre').value.trim();
    if(!n || listaAmigos.includes(n)) return;
    listaAmigos.push(n); document.getElementById('nuevoAmigoNombre').value = "";
    actualizarSelectAmigosDisplay(); guardarDatosEnNube(); actualizarApp();
}
function actualizarSelectAmigosDisplay() {
    let s = document.getElementById('inputAmigoAsignado'); s.innerHTML = '';
    listaAmigos.forEach(am => { let o = document.createElement('option'); o.value = am; o.text = am; s.appendChild(o); });
}
function ingresarSaldoExistente() {
    let m = parseFloat(document.getElementById('ajusteMonto').value); let mon = document.getElementById('ajusteMoneda').value;
    if(!m || m <= 0) return;
    if(mon === "ARS") patrimonio.pesos += m; else patrimonio.dolares += m;
    document.getElementById('ajusteMonto').value = ""; actualizarApp(); guardarDatosEnNube();
}

function agregarMovimiento() {
    let montoTotal = parseFloat(document.getElementById('inputMonto').value);
    let tipo = document.getElementById('inputTipo').value;
    let concepto = document.getElementById('inputConcepto').value.trim();
    let fechaBaseStr = document.getElementById('inputFecha').value;
    if(!montoTotal || !concepto || !fechaBaseStr) return alert("Completá los campos obligatorios");

    let esAvanzado = (perfilUsuario.modo === "AVANZADO");
    let cuotas = esAvanzado ? (parseInt(document.getElementById('inputCuotas').value) || 1) : 1;
    let metodoP = esAvanzado ? document.getElementById('inputMetodoPago').value : "EN_EL_ACTO";
    let debAuto = esAvanzado ? document.getElementById('inputDebitoAuto').value : "NO";
    let dividir = esAvanzado ? document.getElementById('inputDividir').value : "NO";
    let amigo = esAvanzado ? document.getElementById('inputAmigoAsignado').value : "";

    if(dividir !== "NO" && !amigo) return alert("Elegí una persona para dividir");

    let idGrupoPrincipal = generarId();

    if (metodoP === "SERVICIO" && tipo !== "Ingreso") {
        let fBaseObj = new Date(fechaBaseStr + 'T00:00:00');
        let keyMes = `${fBaseObj.getFullYear()}-${(fBaseObj.getMonth()+1).toString().padStart(2,'0')}`;
        suscripciones.push({
            id: idGrupoPrincipal, concepto: concepto, tipo: tipo, fechaAlta: fechaBaseStr, mesBaja: null,
            metodo: "SERVICIO", debito: debAuto, dividir: dividir, amigo: amigo,
            montosPorMes: { [keyMes]: montoTotal }, pagosAmigo: []
        });
    } else {
        let montoPorCuota = montoTotal / cuotas;
        for (let i = 0; i < cuotas; i++) {
            let f = new Date(fechaBaseStr + 'T00:00:00'); f.setMonth(f.getMonth() + i);
            let fechaF = `${f.getFullYear()}-${(f.getMonth()+1).toString().padStart(2,'0')}-${f.getDate().toString().padStart(2,'0')}`;
            let conceptoF = (cuotas > 1) ? `${concepto} (${i+1}/${cuotas})` : concepto;

            let objBase = {
                id: generarId(), idGrupo: idGrupoPrincipal, monto: montoPorCuota, tipo: tipo, concepto: conceptoF,
                fecha: fechaF, metodo: metodoP, cuotaActual: i+1, cuotasTotales: cuotas,
                deudaRestante: montoTotal - (montoPorCuota * (i + 1)), esVirtual: false
            };

            if(tipo === "Ingreso") {
                todosLosMovimientos.push(objBase);
            } else {
                let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";

                if (dividir === "PAGUE_50_TOTAL") {
                    objBase.monto = montoPorCuota/2; todosLosMovimientos.push(objBase);
                } else if (dividir === "PAGUE_50_INTEGRO") {
                    objBase.monto = montoPorCuota/2; todosLosMovimientos.push(objBase);
                    let vAdelanto = {...objBase, id: generarId(), monto: montoPorCuota/2, tipo: "Gasto Variable", concepto: `Adelanto a ${amigo}: ${conceptoF}`};
                    todosLosMovimientos.push(vAdelanto);
                    registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "A_FAVOR";
                } else if (dividir === "PAGO_OTRO_50") {
                    registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "EN_CONTRA";
                } else if (dividir === "PAGUE_100_DEUDA") {
                    objBase.monto = montoPorCuota; objBase.tipo = "Gasto Variable"; objBase.concepto = `Adelanto a ${amigo}: ${conceptoF}`;
                    todosLosMovimientos.push(objBase);
                    registrarDeuda = true; mDeuda = montoPorCuota; tDeuda = "A_FAVOR";
                } else if (dividir === "PAGO_OTRO_100_DEUDA") {
                    registrarDeuda = true; mDeuda = montoPorCuota; tDeuda = "EN_CONTRA";
                } else {
                    todosLosMovimientos.push(objBase);
                }

                if(registrarDeuda) {
                    todosLosMovimientos.push({
                        id: generarId(), idGrupo: idGrupoPrincipal, monto: mDeuda, tipo: "Cuenta Cobrar",
                        concepto: tDeuda === "A_FAVOR" ? `Te debe por: ${conceptoF}` : `Le debés por: ${conceptoF}`,
                        fecha: fechaF, deudor: amigo, sentido: tDeuda, estado: "Pendiente", metodo: metodoP, esVirtual: false
                    });
                }
            }
        }
    }
    document.getElementById('inputMonto').value = ""; document.getElementById('inputConcepto').value = "";
    actualizarApp(); guardarDatosEnNube();
}

// --- RENDERIZADO Y TABLEROS ---
function inicializarSelectorHistorico() {
    let sel = document.getElementById('filtroMesAnio'); if(sel.innerHTML !== '') return;
    let anio = fechaActual.getFullYear();
    [anio-1, anio, anio+1].forEach(a => { nombresMeses.forEach((m, i) => {
        let o = document.createElement('option'); o.value = `${a}-${i}`; o.text = `${m} ${a}`;
        if(a === anio && i === fechaActual.getMonth()) o.selected = true; sel.appendChild(o);
    });});
}

function cambiarPestaña(tabId, boton) {
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
    document.getElementById(tabId).classList.add('active'); boton.classList.add('active');

    let panelMes = document.getElementById('panel-selector-mes');
    if(tabId === 'tab-ahorros' || tabId === 'tab-graficos') panelMes.style.display = 'none';
    else panelMes.style.display = 'flex';

    if (tabId === 'tab-graficos') renderizarGrafico();
}

function actualizarApp() {
    let sel = document.getElementById('filtroMesAnio'); if(!sel.value) return;
    let [aSel, mSel] = sel.value.split('-').map(Number);
    keyMesActualGlobal = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let fechaSelObj = new Date(aSel, mSel, 1);
    let esAvanzado = (perfilUsuario.modo === "AVANZADO");

    let filtrados = todosLosMovimientos.filter(mov => {
        let f = new Date(mov.fecha + 'T00:00:00'); return f.getFullYear() === aSel && f.getMonth() === mSel;
    });

    let movsVirtuales = [];
    if(esAvanzado) {
        suscripciones.forEach(susc => {
            let fAlta = new Date(susc.fechaAlta + 'T00:00:00'); let fAltaMesObj = new Date(fAlta.getFullYear(), fAlta.getMonth(), 1);
            if (fechaSelObj < fAltaMesObj) return;
            if (susc.mesBaja) { let [bA, bM] = susc.mesBaja.split('-').map(Number); if (fechaSelObj >= new Date(bA, bM - 1, 1)) return; }

            let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
            for (let key of diffKeys) { let [kA, kM] = key.split('-').map(Number); if (new Date(kA, kM - 1, 1) <= fechaSelObj) montoActivo = susc.montosPorMes[key]; }
            if (montoActivo === 0) return;

            let vMov = { id: susc.id + "_" + keyMesActualGlobal, idGrupo: susc.id, monto: montoActivo, tipo: susc.tipo, concepto: susc.concepto, fecha: `${aSel}-${(mSel+1).toString().padStart(2,'0')}-01`, metodo: "SERVICIO", debito: susc.debito, dividir: susc.dividir, amigo: susc.amigo, esVirtual: true };

            let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";
            if (susc.dividir === "PAGUE_50_TOTAL") { vMov.monto = montoActivo/2; }
            else if (susc.dividir === "PAGUE_50_INTEGRO") { vMov.monto = montoActivo/2; movsVirtuales.push({...vMov, id: generarId(), monto: montoActivo/2, tipo: "Gasto Variable", concepto: `Adelanto a ${susc.amigo}: ${susc.concepto}`}); registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_50") { registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "EN_CONTRA"; }
            else if (susc.dividir === "PAGUE_100_DEUDA") { vMov.monto = montoActivo; vMov.tipo = "Gasto Variable"; vMov.concepto = `Adelanto a ${susc.amigo}: ${susc.concepto}`; registrarDeuda = true; mDeuda = montoActivo; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_100_DEUDA") { registrarDeuda = true; mDeuda = montoActivo; tDeuda = "EN_CONTRA"; }

            if (susc.dividir !== "PAGO_OTRO_50" && susc.dividir !== "PAGO_OTRO_100_DEUDA") { movsVirtuales.push(vMov); }

            if(registrarDeuda) {
                let yaPagado = (susc.pagosAmigo && susc.pagosAmigo.includes(keyMesActualGlobal));
                movsVirtuales.push({ id: susc.id + "_deuda_" + keyMesActualGlobal, idGrupo: susc.id, monto: mDeuda, tipo: "Cuenta Cobrar", concepto: tDeuda === "A_FAVOR" ? `Te debe por: ${susc.concepto}` : `Le debés por: ${susc.concepto}`, fecha: vMov.fecha, deudor: susc.amigo, sentido: tDeuda, estado: yaPagado ? "Saldado" : "Pendiente", metodo: "SERVICIO", esVirtual: true, mesClave: keyMesActualGlobal });
            }
        });
    }

    movimientosMesGlobal = filtrados.concat(movsVirtuales);

    // RENDER DASHBOARD DINÁMICO
    let dashUI = document.getElementById('dashboard-dinamico');
    let ing = 0, gastosEnActo = 0, gastosCredito = 0, gastosServicio = 0;
    let gastosFijosBasic = 0, gastosVariablesBasic = 0;

    movimientosMesGlobal.forEach(mov => {
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

        let gruposUI = agruparMovimientosPorGrupo(movimientosMesGlobal);

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
        [...movimientosMesGlobal].reverse().forEach(mov => {
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

        let gruposUI = agruparMovimientosPorGrupo(movimientosMesGlobal);

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
                let suscObj = suscripciones.find(s => s.id === mov.idGrupo);
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
    document.getElementById('walletPesos').innerText = patrimonio.pesos.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
    document.getElementById('walletDolares').innerText = patrimonio.dolares.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});

    let totalInvARS = 0, capInvARS = 0, totalInvUSD = 0, capInvUSD = 0;
    let hoyLimpiada = new Date(); hoyLimpiada.setHours(0,0,0,0);
    let tablaInv = document.getElementById('tablaInversiones'); tablaInv.innerHTML = '';
    inversiones.forEach((inv, index) => {
        let sim = inv.moneda === "ARS" ? "$" : "US$";
        let fDate = new Date(inv.fecha + 'T00:00:00'); let ff = `${fDate.getDate().toString().padStart(2,'0')}/${(fDate.getMonth()+1).toString().padStart(2,'0')}/${fDate.getFullYear()}`;
        let dias = Math.max(0, Math.round((hoyLimpiada - fDate) / (1000 * 60 * 60 * 24)));
        let valorAct = inv.monto; let colDetalle = "";

        if(inv.instrumento === "S&P 500") {
            valorAct = (inv.nominales || 0) * (inv.moneda === "ARS" ? mercado.spy_ars : mercado.spy_usd);
            colDetalle = `<strong>${(inv.nominales||0).toFixed(4)} Nom.</strong>`;
        } else {
            let tna = inv.interes || (inv.moneda === "ARS" ? mercado.mpARS : mercado.mpUSD);
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

    let deudasHistoricasReales = todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && new Date(m.fecha + 'T00:00:00').getFullYear() === aSel && new Date(m.fecha + 'T00:00:00').getMonth() === mSel);
    let deudasVirtualesMes = movimientosMesGlobal.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && m.esVirtual);
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
    listaAmigos.forEach(am => { totDiario[am] = 0; totFijo[am] = 0; });
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

function liquidarDeudaIndividual(idMov) {
    let mov = todosLosMovimientos.find(m => m.id === idMov) || movimientosMesGlobal.find(m => m.id === idMov);
    if(!mov) return;
    if(confirm(mov.sentido === "A_FAVOR" ? "¿Confirmas cobro? Suma al bolsillo hoy." : "¿Confirmas pago? Resta del bolsillo hoy.")) {
        if(mov.esVirtual) {
            let s = suscripciones.find(x => x.id === mov.idGrupo);
            if(s) { if(!s.pagosAmigo) s.pagosAmigo = []; s.pagosAmigo.push(mov.mesClave); }
        } else { mov.estado = "Saldado"; }

        let hoy = new Date().toISOString().split('T')[0];
        if(mov.sentido === "A_FAVOR") todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Ingreso", concepto: `Cobro deuda: ${mov.deudor}`, fecha: hoy, metodo: "EN_EL_ACTO" });
        else todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Gasto Variable", concepto: `Pago deuda: ${mov.deudor}`, fecha: hoy, metodo: "EN_EL_ACTO" });
        actualizarApp(); guardarDatosEnNube();
    }
}

function liquidarDeudaGlobal(persona, neto, tipoPagar) {
    if(neto === 0) return alert("Saldos en cero.");
    let mInput = prompt(`Estás por saldar deudas [${tipoPagar}] de ${persona}.\nIngresá el importe exacto:`, Math.abs(neto));
    if(!mInput) return; let mReal = parseFloat(mInput); if(isNaN(mReal) || mReal <= 0) return;

    let sel = document.getElementById('filtroMesAnio'); let [aSel, mSel] = sel.value.split('-').map(Number);
    let deudasHistoricasReales = todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && new Date(m.fecha + 'T00:00:00').getFullYear() === aSel && new Date(m.fecha + 'T00:00:00').getMonth() === mSel);
    let deudasVirtualesMes = movimientosMesGlobal.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && m.esVirtual);
    let todasLasDeudas = [...deudasHistoricasReales, ...deudasVirtualesMes];

    todasLasDeudas.forEach(m => {
        if(m.deudor === persona) {
            let condFiltro = (tipoPagar === "TODO") || (tipoPagar === "DIARIO" && m.metodo === "EN_EL_ACTO") || (tipoPagar === "FIJO" && m.metodo !== "EN_EL_ACTO");
            if (condFiltro) {
                if (m.esVirtual) { let s = suscripciones.find(x => x.id === m.idGrupo); if(s) { if(!s.pagosAmigo) s.pagosAmigo = []; s.pagosAmigo.push(m.mesClave); } }
                else { let r = todosLosMovimientos.find(x => x.id === m.id); if(r) r.estado = "Saldado"; }
            }
        }
    });

    let hoy = new Date().toISOString().split('T')[0];
    if(neto > 0) todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Ingreso", concepto: `Cobro ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "EN_EL_ACTO" });
    else todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Gasto Variable", concepto: `Pago ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "EN_EL_ACTO" });
    actualizarApp(); guardarDatosEnNube();
}

function borrarMovimientoReal(idGrupo) {
    if(confirm("¿Eliminar para siempre esta operación y TODAS sus cuotas/deudas asociadas?")) {
        todosLosMovimientos = todosLosMovimientos.filter(m => m.idGrupo !== idGrupo);
        actualizarApp(); guardarDatosEnNube();
    }
}
function darDeBajaServicio(idGrupo) {
    if(confirm("¿Dar de baja este servicio a partir de ESTE mes? El historial viejo se mantiene.")) {
        let s = suscripciones.find(x => x.id === idGrupo); if(s) { s.mesBaja = keyMesActualGlobal; actualizarApp(); guardarDatosEnNube(); }
    }
}
function editarMontoServicio(idGrupo, montoActual) {
    let nuevo = prompt("Ingresá el nuevo valor a pagar desde este mes en adelante:", montoActual);
    if(!nuevo) return; let nReal = parseFloat(nuevo); if(isNaN(nReal) || nReal <= 0) return;
    let s = suscripciones.find(x => x.id === idGrupo); if(s) { s.montosPorMes[keyMesActualGlobal] = nReal; actualizarApp(); guardarDatosEnNube(); }
}

function ejecutarEnvioAhorro() {
    let m = parseFloat(document.getElementById('ahorroMontoPesos').value); let mon = document.getElementById('ahorroDestinoMoneda').value;
    let sel = document.getElementById('filtroMesAnio'); let [aSel, mSel] = sel.value.split('-').map(Number);
    if(!m || m <= 0) return; let conceptoD = "";
    if(mon === "ARS") { patrimonio.pesos += m; conceptoD = "Envío a Ahorros (Pesos)"; }
    else { let cotizacion = parseFloat(prompt("Ingresá a cuánto compraste el Dólar.")); if(!cotizacion) return; let dComprados = m / cotizacion; patrimonio.dolares += dComprados; conceptoD = `Compra USD (${dComprados.toFixed(2)} USD a $${cotizacion})`; }
    let fFalsa = `${aSel}-${(mSel + 1).toString().padStart(2,'0')}-28`;
    todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: m, tipo: "Enviado a Ahorros", concepto: conceptoD, fecha: fFalsa, metodo: "EN_EL_ACTO" });
    document.getElementById('ahorroMontoPesos').value = ""; actualizarApp(); guardarDatosEnNube();
}

function toggleCamposInversion() {
    let i = document.getElementById('invInstrumento').value; let mon = document.getElementById('invMoneda').value;
    if(i === "S&P 500") {
        document.getElementById('grupoInteres').style.display = "none"; document.getElementById('grupoCotizacionMercado').style.display = "flex";
        let valM = mon === "ARS" ? mercado.spy_ars : mercado.spy_usd; let sim = mon === "ARS" ? "$" : "US$"; document.getElementById('lblPrecioMercado').innerText = `${sim}${valM.toLocaleString('es-AR')}`;
    } else if (i === "Mercado Pago") {
        document.getElementById('grupoInteres').style.display = "flex"; document.getElementById('grupoCotizacionMercado').style.display = "flex";
        document.getElementById('lblPrecioMercado').innerText = `TNA API: ${mercado.mpTna}%`; document.getElementById('invInteres').value = mercado.mpTna;
    } else {
        document.getElementById('grupoInteres').style.display = "flex"; document.getElementById('grupoCotizacionMercado').style.display = "none"; document.getElementById('invInteres').value = "";
    }
}

function ejecutarInversion() {
    let m = parseFloat(document.getElementById('invMonto').value); let mon = document.getElementById('invMoneda').value;
    let inst = document.getElementById('invInstrumento').value; let fec = document.getElementById('invFecha').value;
    if(!m || !fec) return alert("Faltan datos");
    if(mon === "ARS" && patrimonio.pesos < m) return alert("Efectivo Pesos insuficiente en la billetera.");
    if(mon === "USD" && patrimonio.dolares < m) return alert("Efectivo USD insuficiente en la billetera.");

    let nom = 0; let int = parseFloat(document.getElementById('invInteres').value) || (inst==="Mercado Pago"?mercado.mpTna:0);
    if(inst === "S&P 500") nom = m / (mon === "ARS" ? mercado.spy_ars : mercado.spy_usd);

    if(mon === "ARS") patrimonio.pesos -= m; else patrimonio.dolares -= m;
    inversiones.push({ monto: m, moneda: mon, instrumento: inst, fecha: fec, nominales: nom, interes: int });
    document.getElementById('invMonto').value = ""; actualizarApp(); guardarDatosEnNube();
}

function retirarInversion(idx, valorSugerido) {
    let i = inversiones[idx];
    let nInput = prompt(`Liquidando inversión.\n\nEl sistema estima un valor de: $${Math.floor(valorSugerido)}\n\nIngresá importe EXACTO devuelto a tu caja:`, Math.floor(valorSugerido));
    if(!nInput) return; let n = parseFloat(nInput);
    if(i.moneda === "ARS") patrimonio.pesos += n; else patrimonio.dolares += n;
    inversiones.splice(idx, 1); actualizarApp(); guardarDatosEnNube();
}

function renderizarGrafico() {
    let ctx = document.getElementById('patrimonioChart').getContext('2d');
    if(miGrafico) miGrafico.destroy();

    let dataARS = [0, 0, 0, 0, 0, 0]; let dataUSD = [0, 0, 0, 0, 0, 0];

    inversiones.forEach(inv => {
        let m = new Date(inv.fecha + 'T00:00:00').getMonth() % 6;
        let precioCot = inv.moneda === "ARS" ? mercado.spy_ars : mercado.spy_usd;
        let val = inv.instrumento === "S&P 500" ? (inv.nominales * precioCot) : inv.monto;
        if(inv.moneda === "ARS") dataARS[m] += val; else dataUSD[m] += val;
    });

    miGrafico = new Chart(ctx, {
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

function resetearApp() {
    if(confirm("⚠️ PELIGRO CRÍTICO: Se purgarán todos los balances de la nube.")) {
        if(prompt("Escribe BORRAR:") === "BORRAR") {
            todosLosMovimientos = []; suscripciones = []; patrimonio = { pesos: 0, dolares: 0 }; inversiones = []; listaAmigos = [];
            perfilUsuario.modo = "";
            guardarDatosEnNube(); actualizarApp(); location.reload();
        }
    }
}

// ==========================================
// 🔗 EXPOSICIÓN A WINDOW
// Este archivo se carga como <script type="module">, y los módulos ES
// NO exponen sus funciones al scope global por defecto. Como el HTML
// sigue usando atributos onclick="..." / onchange="...", necesitamos
// enganchar acá las funciones que se llaman desde el markup (estático
// o generado dinámicamente en las tablas). Si en el futuro migramos a
// addEventListener, esta sección deja de ser necesaria.
// ==========================================
window.guardarModoDesdeOnboarding = guardarModoDesdeOnboarding;
window.loginUsuario = loginUsuario;
window.registrarUsuario = registrarUsuario;
window.togglePerfilPanel = togglePerfilPanel;
window.logoutUsuario = logoutUsuario;
window.guardarCambiosDesdePerfil = guardarCambiosDesdePerfil;
window.cambiarPasswordPerfil = cambiarPasswordPerfil;
window.cambiarPestaña = cambiarPestaña;
window.actualizarApp = actualizarApp;
window.evaluarCamposDinamicosGasto = evaluarCamposDinamicosGasto;
window.agregarMovimiento = agregarMovimiento;
window.toggleSelectAmigo = toggleSelectAmigo;
window.ejecutarEnvioAhorro = ejecutarEnvioAhorro;
window.ingresarSaldoExistente = ingresarSaldoExistente;
window.toggleCamposInversion = toggleCamposInversion;
window.ejecutarInversion = ejecutarInversion;
window.crearPersonaDeuda = crearPersonaDeuda;
window.resetearApp = resetearApp;
window.darDeBajaServicio = darDeBajaServicio;
window.borrarMovimientoReal = borrarMovimientoReal;
window.editarMontoServicio = editarMontoServicio;
window.liquidarDeudaIndividual = liquidarDeudaIndividual;
window.liquidarDeudaGlobal = liquidarDeudaGlobal;
window.retirarInversion = retirarInversion;
