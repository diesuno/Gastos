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

// Categoría: visible para cualquier gasto (fijo o variable), en cualquier modo
// (Básico o Avanzado) — no depende del resto de los campos avanzados.
document.getElementById('boxCategoria').style.display = esGasto ? "block" : "none";
    if (!esGasto) {
        document.getElementById('boxCategoriaPersonalizada').style.display = "none";
    }

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
    document.getElementById('boxTarjeta').style.display = (m === "CREDITO") ? "block" : "none";
    if (m === "CREDITO") actualizarSelectTarjetasDisplay();

if(m !== "CREDITO") document.getElementById('inputCuotas').value = "1";
    toggleSelectAmigo();
}

// Muestra/oculta el campo de texto libre cuando se elige "Personalizada..."
// en el selector de Categoría.
export function toggleCategoriaPersonalizada() {
    let esPersonalizada = document.getElementById('inputCategoria').value === '__PERSONALIZADA__';
    document.getElementById('boxCategoriaPersonalizada').style.display = esPersonalizada ? 'block' : 'none';
}

// --- TARJETAS REUTILIZABLES (mismo patrón que la lista de amigos) ---
export function actualizarSelectTarjetasDisplay() {
    let s = document.getElementById('inputTarjetaSeleccionada');
    let valorPrevio = s.value;
    s.innerHTML = '<option value="">Elegir tarjeta...</option>';
    estadoApp.listaTarjetas.forEach(t => { let o = document.createElement('option'); o.value = t; o.text = t; s.appendChild(o); });
    let optNueva = document.createElement('option'); optNueva.value = '__NUEVA__'; optNueva.text = '+ Agregar una nueva';
    s.appendChild(optNueva);
    // Si la tarjeta que tenía seleccionada sigue existiendo, la mantenemos.
if (estadoApp.listaTarjetas.includes(valorPrevio)) s.value = valorPrevio;
}

export function toggleNuevaTarjeta() {
    let esNueva = document.getElementById('inputTarjetaSeleccionada').value === '__NUEVA__';
    document.getElementById('boxNuevaTarjeta').style.display = esNueva ? 'block' : 'none';
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

// --- EDITAR UN MOVIMIENTO YA CARGADO ---
// Por ahora solo se puede editar texto, fecha y monto, y solo en movimientos
// "En el Acto" reales (no cuotas de tarjeta ni servicios recurrentes — esos
// todavía no tienen pensada su lógica de edición acá).
let idMovimientoEnEdicion = null;

export function abrirModalEditarMovimiento(id) {
    let mov = estadoApp.todosLosMovimientos.find(m => m.id === id);
    if (!mov) return;
    idMovimientoEnEdicion = id;
    document.getElementById('editMovTexto').value = mov.concepto;
    document.getElementById('editMovFecha').value = mov.fecha;
    document.getElementById('editMovMonto').value = mov.monto;
    document.getElementById('modal-editar-movimiento').style.display = 'flex';
}

export function cerrarModalEditarMovimiento() {
    document.getElementById('modal-editar-movimiento').style.display = 'none';
    idMovimientoEnEdicion = null;
}

export function guardarEdicionMovimiento() {
    if (!idMovimientoEnEdicion) return;
    let mov = estadoApp.todosLosMovimientos.find(m => m.id === idMovimientoEnEdicion);
    if (!mov) return;

let texto = document.getElementById('editMovTexto').value.trim();
    let fecha = document.getElementById('editMovFecha').value;
    let monto = parseFloat(document.getElementById('editMovMonto').value);
    if (!texto) return mostrarAlerta("Ingresá un texto");
    if (!fecha) return mostrarAlerta("Elegí una fecha");
    if (!monto || monto <= 0) return mostrarAlerta("Ingresá un monto válido");

mov.concepto = texto;
    mov.fecha = fecha;
    mov.monto = monto;

cerrarModalEditarMovimiento();
    actualizarApp(); guardarDatosEnNube();
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

// Categoría: solo aplica a gastos (no a ingresos). Si eligió "Personalizada",
// usamos el texto libre que cargó; si no, el valor del selector estándar.
let categoria = "";
    if (tipo !== "Ingreso") {
        let selCategoria = document.getElementById('inputCategoria').value;
        if (selCategoria === '__PERSONALIZADA__') {
            categoria = document.getElementById('inputCategoriaPersonalizada').value.trim();
            if (!categoria) return mostrarAlerta("Escribí el nombre de la categoría personalizada");
        } else {
            categoria = selCategoria;
        }
    }

// Tarjeta usada (solo aplica si el método es Crédito). Si eligió "+
// Agregar una nueva", la creamos y la sumamos a la lista reutilizable.
let tarjeta = "";
    if (esAvanzado && metodoP === "CREDITO") {
        let seleccion = document.getElementById('inputTarjetaSeleccionada').value;
        if (seleccion === "__NUEVA__") {
            let nombreNueva = document.getElementById('inputNuevaTarjeta').value.trim();
            if (!nombreNueva) return mostrarAlerta("Escribí el nombre de la tarjeta nueva");
            if (!estadoApp.listaTarjetas.includes(nombreNueva)) estadoApp.listaTarjetas.push(nombreNueva);
            tarjeta = nombreNueva;
        } else {
            tarjeta = seleccion;
        }
    }

if(dividir !== "NO" && !amigo) return mostrarAlerta("Elegí una persona para dividir");

let idGrupoPrincipal = generarId();

if (metodoP === "SERVICIO" && tipo !== "Ingreso") {
    let fBaseObj = new Date(fechaBaseStr + 'T00:00:00');
    let keyMes = `${fBaseObj.getFullYear()}-${(fBaseObj.getMonth()+1).toString().padStart(2,'0')}`;
    estadoApp.suscripciones.push({
        id: idGrupoPrincipal, concepto: concepto, tipo: tipo, fechaAlta: fechaBaseStr, mesBaja: null,
        metodo: "SERVICIO", debito: debAuto, dividir: dividir, amigo: amigo, categoria: categoria,
        montosPorMes: { [keyMes]: montoTotal }, pagosAmigo: []
    });
} else {
    let montoPorCuota = montoTotal / cuotas;
    for (let i = 0; i < cuotas; i++) {
        let f = new Date(fechaBaseStr + 'T00:00:00'); f.setMonth(f.getMonth() + i);
        let fechaF = `${f.getFullYear()}-${(f.getMonth()+1).toString().padStart(2,'0')}-${f.getDate().toString().padStart(2,'0')}`;
        let conceptoF = (cuotas > 1) ? `${concepto} (${i+1}/${cuotas})` : concepto;

    let objBase = {
        id: generarId(), idGrupo: idGrupoPrincipal, monto: montoPorCuota, montoTotalCuota: montoPorCuota, tipo: tipo, concepto: conceptoF,
        fecha: fechaF, metodo: metodoP, cuotaActual: i+1, cuotasTotales: cuotas, tarjeta: tarjeta, categoria: categoria,
        pagado: false,
        montoTotalCuota: montoTotal, deudaRestante: montoTotal - (montoPorCuota * (i + 1)), esVirtual: false
    };

    if(tipo === "Ingreso") {
        estadoApp.todosLosMovimientos.push(objBase);
    } else {
        let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";
        let esEnElActo = (metodoP === "EN_EL_ACTO");

        if (dividir === "PAGUE_50_INTEGRO") {
            objBase.monto = montoPorCuota/2; estadoApp.todosLosMovimientos.push(objBase);
            if (esEnElActo) {
                let vAdelanto = {...objBase, id: generarId(), monto: montoPorCuota/2, tipo: "Gasto Variable", concepto: `Adelanto a ${amigo}: ${conceptoF}`};
                estadoApp.todosLosMovimientos.push(vAdelanto);
            }
            registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "A_FAVOR";
        } else if (dividir === "PAGO_OTRO_50") {
            if (!esEnElActo) { objBase.monto = montoPorCuota/2; estadoApp.todosLosMovimientos.push(objBase); }
            registrarDeuda = true; mDeuda = montoPorCuota/2; tDeuda = "EN_CONTRA";
        } else if (dividir === "PAGUE_100_DEUDA") {
            if (esEnElActo) {
                objBase.monto = montoPorCuota; objBase.tipo = "Gasto Variable"; objBase.concepto = `Adelanto a ${amigo}: ${conceptoF}`;
                estadoApp.todosLosMovimientos.push(objBase);
            }
            registrarDeuda = true; mDeuda = montoPorCuota; tDeuda = "A_FAVOR";
        } else if (dividir === "PAGO_OTRO_100_DEUDA") {
            if (!esEnElActo) { estadoApp.todosLosMovimientos.push(objBase); }
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
    document.getElementById('inputNuevaTarjeta').value = "";
    document.getElementById('inputCategoriaPersonalizada').value = "";
    actualizarApp(); guardarDatosEnNube();
}
