// ==========================================
// 🧾 CARGA DE MOVIMIENTOS (formulario dinámico y alta de gastos/ingresos)
// ==========================================
import { estadoApp } from './estado.js';
import { generarId } from './utilidades.js';
import { mostrarAlerta } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';

export function evaluarCamposDinamicosGasto() {
    let t = document.getElementById('inputTipo').value;
    let esGasto = (t !== "Ingreso");
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

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

export function toggleSelectAmigo() {
    if (estadoApp.perfilUsuario.modo !== "AVANZADO") return;
    let d = document.getElementById('inputDividir').value;
    document.getElementById('boxSeleccionAmigo').style.display = (d !== "NO") ? "block" : "none";
}

export function crearPersonaDeuda() {
    let n = document.getElementById('nuevoAmigoNombre').value.trim();
    if(!n || estadoApp.listaAmigos.includes(n)) return;
    estadoApp.listaAmigos.push(n); document.getElementById('nuevoAmigoNombre').value = "";
    actualizarSelectAmigosDisplay(); guardarDatosEnNube(); actualizarApp();
}

export function actualizarSelectAmigosDisplay() {
    let s = document.getElementById('inputAmigoAsignado'); s.innerHTML = '';
    estadoApp.listaAmigos.forEach(am => { let o = document.createElement('option'); o.value = am; o.text = am; s.appendChild(o); });
}

export function agregarMovimiento() {
    let montoTotal = parseFloat(document.getElementById('inputMonto').value);
    let tipo = document.getElementById('inputTipo').value;
    let concepto = document.getElementById('inputConcepto').value.trim();
    let fechaBaseStr = document.getElementById('inputFecha').value;
    if(!montoTotal || !concepto || !fechaBaseStr) return mostrarAlerta("Completá los campos obligatorios");

    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");
    let cuotas = esAvanzado ? (parseInt(document.getElementById('inputCuotas').value) || 1) : 1;
    let metodoP = esAvanzado ? document.getElementById('inputMetodoPago').value : "EN_EL_ACTO";
    let debAuto = esAvanzado ? document.getElementById('inputDebitoAuto').value : "NO";
    let dividir = esAvanzado ? document.getElementById('inputDividir').value : "NO";
    let amigo = esAvanzado ? document.getElementById('inputAmigoAsignado').value : "";

    if(dividir !== "NO" && !amigo) return mostrarAlerta("Elegí una persona para dividir");

    let idGrupoPrincipal = generarId();

    if (metodoP === "SERVICIO" && tipo !== "Ingreso") {
        let fBaseObj = new Date(fechaBaseStr + 'T00:00:00');
        let keyMes = `${fBaseObj.getFullYear()}-${(fBaseObj.getMonth()+1).toString().padStart(2,'0')}`;
        estadoApp.suscripciones.push({
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
                estadoApp.todosLosMovimientos.push(objBase);
            } else {
                let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";

                if (dividir === "PAGUE_50_TOTAL") {
                    objBase.monto = montoPorCuota/2; estadoApp.todosLosMovimientos.push(objBase);
                } else if (dividir === "PAGUE_50_INTEGRO") {
                    objBase.monto = montoPorCuota/2; estadoApp.todosLosMovimientos.push(objBase);
                    let vAdelanto = {...objBase, id: generarId(), monto: montoPorCuota/2, tipo: "Gasto Variable", concepto: `Adelanto a ${amigo}: ${conceptoF}`};
                    estadoApp.todosLosMovimientos.push(vAdelanto);
                    registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "A_FAVOR";
                } else if (dividir === "PAGO_OTRO_50") {
                    registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "EN_CONTRA";
                } else if (dividir === "PAGUE_100_DEUDA") {
                    objBase.monto = montoPorCuota; objBase.tipo = "Gasto Variable"; objBase.concepto = `Adelanto a ${amigo}: ${conceptoF}`;
                    estadoApp.todosLosMovimientos.push(objBase);
                    registrarDeuda = true; mDeuda = montoPorCuota; tDeuda = "A_FAVOR";
                } else if (dividir === "PAGO_OTRO_100_DEUDA") {
                    registrarDeuda = true; mDeuda = montoPorCuota; tDeuda = "EN_CONTRA";
                } else {
                    estadoApp.todosLosMovimientos.push(objBase);
                }

                if(registrarDeuda) {
                    estadoApp.todosLosMovimientos.push({
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
