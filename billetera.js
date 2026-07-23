// ==========================================
// 💹 BILLETERA: cotizaciones de mercado, inversiones, retiros y extracciones
// ==========================================
// Solo maneja Dólares y S&P 500. Plazo Fijo y Mercado Pago se sacaron de la
// app (si en el futuro los volvemos a sumar, el patrón de "pool acumulado"
// que usa S&P 500 acá es el punto de partida más simple).
import { estadoApp } from './estado.js';
import { generarId, precioNominalSp500Usd, precioNominalSp500Ars, normalizarMovimientoInversion } from './utilidades.js';
import { mostrarAlerta, mostrarConfirmacion } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';
import { reconstruirHistorialMensual, reconstruirHistorialPesos } from './cierreMensual.js';

// Lista de proxies CORS públicos, por si en el futuro hace falta consultar
// alguna fuente que no permita pedidos directos desde el navegador.
const PROXIES_CORS = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Intenta traer la cotización REAL del CEDEAR de IVV (en pesos, tal como
// cotiza en BYMA) — este es el precio de "1 nominal" que se usa en toda la
// app, sin ningún ratio de conversión: la idea es reflejar lo que
// efectivamente compraste/vendiste en tu banco, no un equivalente teórico en
// la bolsa de EEUU. Es un endpoint público sin login, pero no es una API
// oficial documentada: puede no permitir pedidos desde el navegador (CORS), o
// cambiar el formato de respuesta sin aviso. Si eso pasa, devuelve null y la
// app sigue funcionando con el valor cargado a mano.
async function obtenerCotizacionCedearIvv() {
    try {
        let res = await fetch("https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excludeZeroPxAndQty: true, T1: true, T0: false })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();
        let lista = Array.isArray(data) ? data : (data.data || data.cedears || null);
        if (!Array.isArray(lista)) throw new Error("Formato de respuesta inesperado");

        let entradaIvv = lista.find(item => {
            let simbolo = (item.symbol || item.ticker || item.especie || "").toUpperCase();
            return simbolo === "IVV";
        });
        if (!entradaIvv) throw new Error("No se encontró IVV en la respuesta");

        let precioCedearArs = entradaIvv.lastPrice ?? entradaIvv.closingPrice ?? entradaIvv.previousClosePrice
            ?? entradaIvv.ultimoPrecio ?? entradaIvv.cierreAnterior ?? null;
        if (!precioCedearArs || precioCedearArs <= 0) throw new Error("No se encontró un precio válido");

        return precioCedearArs;
    } catch (e) {
        console.warn("No se pudo obtener la cotización del CEDEAR de IVV automáticamente, se usa el valor cargado a mano:", e.message);
        return null;
    }
}

// Trae la cotización real del CEDEAR de IVV en pesos (BYMA, best-effort) y el
// dólar CCL (dolarapi.com, API pública que no necesita proxy). El precio en
// pesos de "1 nominal de S&P 500" es directamente lo que devuelve BYMA (o lo
// último cargado a mano si falla) — el equivalente en dólares se calcula
// dividiendo por el CCL, sin ningún ratio de conversión de por medio.
export async function inicializarMercado() {
    let precioCedear = await obtenerCotizacionCedearIvv();
    if (precioCedear !== null) {
        estadoApp.mercado.spy_ars = precioCedear;
        estadoApp.mercado.actualizado.cedear = true;
    } else {
        estadoApp.mercado.actualizado.cedear = false;
    }

    try {
        let res = await fetch("https://dolarapi.com/v1/dolares/contadoconliqui");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();
        if (data && data.venta) {
            estadoApp.mercado.dolarCCL = data.venta;
            estadoApp.mercado.actualizado.ccl = true;
        }
    } catch (e) {
        console.warn("No se pudo obtener el dólar CCL de dolarapi.com, se usa valor de referencia:", e.message);
    }

    estadoApp.mercado.spy_usd = estadoApp.mercado.spy_ars / estadoApp.mercado.dolarCCL;

    reconstruirHistorialMensual();
    evaluarCamposInversion(); actualizarApp();
}

// --- FORMULARIO: mostrar Inversión, Retiro o Extracción ---
export function toggleMovimientoInversion() {
    let mov = document.getElementById('invMovimiento').value;
    document.getElementById('seccionInversion').style.display = mov === "INVERSION" ? "block" : "none";
    document.getElementById('seccionRetiro').style.display = mov === "RETIRO" ? "block" : "none";
    document.getElementById('seccionExtraccion').style.display = mov === "EXTRACCION" ? "block" : "none";
}

// --- FORMULARIO: mostrar Cotización o Cantidad al comprar Dólares ---
export function toggleModoDolar() {
    let modo = document.getElementById('invModoDolar').value; // "COTIZACION" | "CANTIDAD"
    document.getElementById('boxInvCotizacionDolar').style.display = modo === "COTIZACION" ? 'block' : 'none';
    document.getElementById('boxInvCantidadDolares').style.display = modo === "CANTIDAD" ? 'block' : 'none';
}

// --- FORMULARIO: campos dinámicos de Inversión según instrumento ---
export function evaluarCamposInversion() {
    let inst = document.getElementById('invInstrumentoNuevo').value;
    let boxOrigen = document.getElementById('boxInvOrigen');
    let boxModoDolar = document.getElementById('boxModoDolar');
    let boxNominales = document.getElementById('boxInvNominales');
    let lblMonto = document.getElementById('lblInvMontoNuevo');

    boxModoDolar.style.display = 'none';
    document.getElementById('boxInvCotizacionDolar').style.display = 'none';
    document.getElementById('boxInvCantidadDolares').style.display = 'none';
    boxNominales.style.display = 'none';

    if (inst === "Dólares") {
        // Comprar dólares siempre sale del pool de Pesos.
        boxOrigen.style.display = 'none';
        lblMonto.innerText = 'Monto a Invertir (Pesos)';
        boxModoDolar.style.display = 'block';
        toggleModoDolar();
    } else {
        // S&P 500 — monto y nominales se cargan los dos a mano, tal cual la
        // operación real que hiciste. La cotización de referencia (BYMA) no
        // se pide acá: se consulta sola para la card y el gráfico, sin
        // mezclarla con lo que cargás en la compra.
        boxOrigen.style.display = 'block';
        let origen = document.getElementById('invOrigen').value;
        lblMonto.innerText = origen === "PESOS" ? "Monto a Invertir (Pesos)" : "Monto a Invertir (Dólares)";
        boxNominales.style.display = 'block';
    }
}

// --- FORMULARIO: campos dinámicos de Retiro de S&P 500 ---
export function evaluarCamposRetiro() {
    let destino = document.getElementById('retDestino').value; // "PESOS" | "DOLARES"
    let cargarNominales = document.getElementById('retCargarNominales').checked;
    document.getElementById('boxRetMontoDeseado').style.display = cargarNominales ? 'none' : 'block';
    document.getElementById('boxRetNominalesExactos').style.display = cargarNominales ? 'block' : 'none';
    document.getElementById('lblRetMontoDeseado').innerText = destino === "PESOS" ? "Valor en Pesos a Retirar" : "Valor en US$ a Retirar";

    let inputCotiz = document.getElementById('retCotizacion');
    if (document.activeElement !== inputCotiz) {
        let cotizacionSugerida = destino === "PESOS" ? precioNominalSp500Ars() : precioNominalSp500Usd();
        inputCotiz.value = cotizacionSugerida.toFixed(2);
    }
}

// Registra un movimiento (Inversión, Retiro o Extracción) en el historial que
// alimenta la tabla "Historial de Movimientos" y el gráfico. "origen"/"destino"
// describen de dónde a dónde fue la plata (PESOS, DOLARES, "S&P 500", o FUERA
// para una Extracción) — esto es lo que permite después revertir el
// movimiento con precisión y mostrar un detalle claro en la tabla, sea cual
// sea el tipo de operación.
function registrarMovimientoInversion({ mov, instrumento, origen, destino, montoOrigen, montoDestino, monedaDestino, precioCompraUsd, motivo, fecha }) {
    estadoApp.historialInversiones.push({
        id: generarId(), mov, instrumento,
        origen: origen || null, destino: destino || null,
        montoOrigen: montoOrigen || null, montoDestino: montoDestino || null,
        monedaDestino: monedaDestino || null,
        precioCompraUsd: precioCompraUsd || null,
        motivo: motivo || null,
        fecha
    });
}

export function ejecutarInversionNueva() {
    let inst = document.getElementById('invInstrumentoNuevo').value;
    let fecha = document.getElementById('invFechaNueva').value;
    if (!fecha) return mostrarAlerta("Completá la fecha");

    if (inst === "Dólares") {
        let modo = document.getElementById('invModoDolar').value; // "COTIZACION" | "CANTIDAD"
        let montoPesos = parseFloat(document.getElementById('invMontoNuevo').value);
        if (!montoPesos || montoPesos <= 0) return mostrarAlerta("Completá el monto en pesos");
        if (estadoApp.patrimonio.pesos < montoPesos) return mostrarAlerta("Pesos insuficientes en la billetera.");

        let dolaresComprados;
        if (modo === "CANTIDAD") {
            dolaresComprados = parseFloat(document.getElementById('invCantidadDolares').value);
            if (!dolaresComprados || dolaresComprados <= 0) return mostrarAlerta("Completá la cantidad de dólares comprados");
        } else {
            let cotizacion = parseFloat(document.getElementById('invCotizacionDolar').value);
            if (!cotizacion || cotizacion <= 0) return mostrarAlerta("Ingresá la cotización de compra");
            dolaresComprados = montoPesos / cotizacion;
        }

        estadoApp.patrimonio.dolares += dolaresComprados;
        registrarMovimientoInversion({
            mov: "Inversión", instrumento: "Dólares",
            origen: "PESOS", destino: "DOLARES", montoOrigen: montoPesos, montoDestino: dolaresComprados, monedaDestino: "USD",
            fecha
        });
    } else {
        // S&P 500
        let origen = document.getElementById('invOrigen').value; // "PESOS" | "DOLARES"
        let monto = parseFloat(document.getElementById('invMontoNuevo').value);
        if (!monto || monto <= 0) return mostrarAlerta("Completá el monto a invertir");
        let poolDisponible = origen === "PESOS" ? estadoApp.patrimonio.pesos : estadoApp.patrimonio.dolares;
        if (poolDisponible < monto) return mostrarAlerta(`${origen === "PESOS" ? "Pesos" : "Dólares"} insuficientes en la billetera.`);

        let nominales = parseFloat(document.getElementById('invNominalesNuevo').value);
        if (!nominales || nominales <= 0) return mostrarAlerta("Completá los nominales");
        if (origen === "DOLARES") estadoApp.patrimonio.dolares -= monto;
        estadoApp.sp500.nominales += nominales;
        registrarMovimientoInversion({
            mov: "Inversión", instrumento: "S&P 500",
            origen, destino: "S&P 500", montoOrigen: monto, montoDestino: nominales, monedaDestino: "Nominales",
            precioCompraUsd: precioNominalSp500Usd(),
            fecha
        });
    }

    document.getElementById('invMontoNuevo').value = "";
    reconstruirHistorialMensual();
    reconstruirHistorialPesos();
    actualizarApp(); guardarDatosEnNube();
}

// Retiro de S&P 500: convierte nominales a Pesos o Dólares (a elección), con
// una cotización autocompletada pero editable por si preferís cargar la tuya.
export function ejecutarRetiroNuevo() {
    let hoy = new Date().toISOString().split('T')[0];
    let destino = document.getElementById('retDestino').value; // "PESOS" | "DOLARES"
    let cotizacion = parseFloat(document.getElementById('retCotizacion').value);
    if (!cotizacion || cotizacion <= 0) return mostrarAlerta("Ingresá la cotización a usar");

    let cargarNominales = document.getElementById('retCargarNominales').checked;
    let nominalesARetirar;

    if (cargarNominales) {
        nominalesARetirar = parseFloat(document.getElementById('retNominalesExactos').value);
        if (!nominalesARetirar || nominalesARetirar <= 0) return mostrarAlerta("Ingresá los nominales a retirar");
    } else {
        let montoDeseado = parseFloat(document.getElementById('retMontoDeseado').value);
        if (!montoDeseado || montoDeseado <= 0) return mostrarAlerta("Ingresá un monto válido");
        nominalesARetirar = montoDeseado / cotizacion;
    }
    if (estadoApp.sp500.nominales < nominalesARetirar) return mostrarAlerta("No tenés suficientes nominales de S&P 500.");

    estadoApp.sp500.nominales -= nominalesARetirar;
    let valorDestino = nominalesARetirar * cotizacion;
    if (destino === "DOLARES") estadoApp.patrimonio.dolares += valorDestino;

    registrarMovimientoInversion({
        mov: "Retiro", instrumento: "S&P 500",
        origen: "S&P 500", destino, montoOrigen: nominalesARetirar, montoDestino: valorDestino,
        monedaDestino: destino === "PESOS" ? "ARS" : "USD",
        fecha: hoy
    });

    reconstruirHistorialMensual();
    reconstruirHistorialPesos();
    actualizarApp(); guardarDatosEnNube();
}

// Extracción: saca Dólares de la app definitivamente (por ejemplo, porque los
// gastaste o vendiste fuera del sistema). Queda registrada con un motivo para
// tener el detalle a mano después.
export function ejecutarExtraccion() {
    let hoy = new Date().toISOString().split('T')[0];
    let monto = parseFloat(document.getElementById('extMontoDolares').value);
    let motivo = document.getElementById('extMotivo').value.trim();
    if (!monto || monto <= 0) return mostrarAlerta("Ingresá un monto válido");
    if (!motivo) return mostrarAlerta("Ingresá un motivo");
    if (estadoApp.patrimonio.dolares < monto) return mostrarAlerta("No tenés suficientes dólares.");

    estadoApp.patrimonio.dolares -= monto;
    registrarMovimientoInversion({
        mov: "Extracción", instrumento: "Dólares",
        origen: "DOLARES", destino: "FUERA", montoOrigen: monto, montoDestino: null, monedaDestino: null,
        motivo, fecha: hoy
    });

    document.getElementById('extMontoDolares').value = "";
    document.getElementById('extMotivo').value = "";
    reconstruirHistorialMensual();
    reconstruirHistorialPesos();
    actualizarApp(); guardarDatosEnNube();
}

// Deshace un movimiento del Historial: le devuelve al pool de origen lo que
// salió, y le saca al pool de destino lo que entró — funciona igual para
// Inversión, Retiro o Extracción porque todos comparten el mismo esquema
// (origen/destino/montoOrigen/montoDestino). Para movimientos guardados antes
// de este esquema, normalizarMovimientoInversion() los traduce al vuelo.
export async function revertirMovimientoInversion(id) {
    let entradaOriginal = estadoApp.historialInversiones.find(h => h.id === id);
    if (!entradaOriginal) return;
    let entrada = normalizarMovimientoInversion(entradaOriginal);

    if (!(await mostrarConfirmacion(`¿Revertir este movimiento?\n\n${entrada.mov}: ${entrada.instrumento}`, {peligroso: true}))) return;

    if (entrada.destino === "DOLARES" && entrada.montoDestino) estadoApp.patrimonio.dolares -= entrada.montoDestino;
    if (entrada.destino === "S&P 500" && entrada.montoDestino) estadoApp.sp500.nominales -= entrada.montoDestino;

    if (entrada.origen === "DOLARES" && entrada.montoOrigen) estadoApp.patrimonio.dolares += entrada.montoOrigen;
    if (entrada.origen === "S&P 500" && entrada.montoOrigen) estadoApp.sp500.nominales += entrada.montoOrigen;

    estadoApp.historialInversiones = estadoApp.historialInversiones.filter(h => h.id !== id);
    reconstruirHistorialMensual();
    reconstruirHistorialPesos();
    actualizarApp(); guardarDatosEnNube();

    if (entradaOriginal.origen === undefined) {
        mostrarAlerta("Este movimiento es de antes de guardar todos los detalles, así que se revirtió con la mejor información disponible.");
    }
}
