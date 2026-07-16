// ==========================================
// 💹 BILLETERA: cotizaciones de mercado, inversiones y retiros
// ==========================================
// Solo maneja Dólares y S&P 500. Plazo Fijo y Mercado Pago se sacaron de la
// app (si en el futuro los volvemos a sumar, el patrón de "pool acumulado"
// que usa S&P 500 acá es el punto de partida más simple).
import { estadoApp } from './estado.js';
import { generarId, precioNominalSp500Usd, precioNominalSp500Ars } from './utilidades.js';
import { mostrarAlerta, mostrarConfirmacion } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';
import { registrarFotoMesActual } from './cierreMensual.js';

// Lista de proxies CORS públicos usados para poder leer Yahoo Finance desde el
// navegador (Yahoo no permite pedidos directos desde otro dominio). Son servicios
// gratuitos de terceros y pueden caerse sin aviso — por eso probamos más de uno
// en orden, y si ninguno responde, seguimos funcionando con el valor de referencia
// en vez de romper la app.
const PROXIES_CORS = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

// Intenta traer el precio de mercado de un símbolo (ej: "SPY", "SPY.BA") probando
// cada proxy de la lista en orden. Devuelve el precio, o null si ninguno funcionó.
async function obtenerPrecioYahoo(simbolo) {
    const urlYahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${simbolo}`;
    for (const construirUrlProxy of PROXIES_CORS) {
        try {
            let res = await fetch(construirUrlProxy(urlYahoo));
            if (!res.ok) continue;
            let data = await res.json();
            if (data && data.chart && data.chart.result) {
                return data.chart.result[0].meta.regularMarketPrice;
            }
        } catch (e) {
            console.warn(`Proxy CORS falló consultando ${simbolo}:`, e.message);
        }
    }
    return null;
}

// Intenta traer el precio REAL del CEDEAR de SPY (en pesos) desde BYMA, para
// poder calcular el ratio automáticamente en vez de que lo cargues a mano.
// Es un endpoint público sin login, pero no es una API oficial documentada:
// puede no permitir pedidos desde el navegador (CORS), o cambiar el formato
// de respuesta sin aviso. Por eso todo está en un try/catch bien amplio, y el
// resultado se valida contra un rango razonable antes de aceptarlo — si algo
// no cierra, devolvemos null y seguimos con el ratio manual sin romper nada.
async function obtenerRatioCedearAutomatico() {
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

        let entradaSpy = lista.find(item => {
            let simbolo = (item.symbol || item.ticker || item.especie || "").toUpperCase();
            return simbolo === "SPY";
        });
        if (!entradaSpy) throw new Error("No se encontró SPY en la respuesta");

        let precioCedearArs = entradaSpy.lastPrice ?? entradaSpy.closingPrice ?? entradaSpy.previousClosePrice
            ?? entradaSpy.ultimoPrecio ?? entradaSpy.cierreAnterior ?? null;
        if (!precioCedearArs || precioCedearArs <= 0) throw new Error("No se encontró un precio válido");

        // El ratio implícito = (precio real de SPY en pesos) / (precio del CEDEAR).
        let precioSpyArsSinRatio = estadoApp.mercado.spy_usd * estadoApp.mercado.dolarCCL;
        let ratioCalculado = precioSpyArsSinRatio / precioCedearArs;

        // Los ratios de CEDEARs conocidos van de 1:1 a unos pocos cientos —
        // si da un número fuera de este rango, algo se leyó mal.
        if (ratioCalculado < 1 || ratioCalculado > 500) throw new Error(`Ratio fuera de rango: ${ratioCalculado}`);

        return Math.round(ratioCalculado);
    } catch (e) {
        console.warn("No se pudo detectar el ratio del CEDEAR de SPY automáticamente, se usa el valor manual:", e.message);
        return null;
    }
}


// Trae la cotización real de SPY en dólares (Yahoo Finance, vía proxy CORS), el
// dólar CCL (dolarapi.com, API pública que no necesita proxy), y el ratio del
// CEDEAR de SPY (intentando detectarlo automático desde BYMA; si no se puede,
// se mantiene el valor cargado a mano). El precio en pesos de "1 nominal de
// S&P 500" se CALCULA como spy_usd × dolarCCL — no se pide directo a ninguna
// fuente. Esto evita depender ciegamente de una sola fuente para el ratio del
// CEDEAR (cuántos CEDEARs representan 1 acción real), que cambia sin aviso:
// BYMA lo ajustó de 20:1 a 60:1 en mayo/junio de 2026, por ejemplo.
export async function inicializarMercado() {
    let precioUsd = await obtenerPrecioYahoo("SPY");
    if (precioUsd !== null) {
        estadoApp.mercado.spy_usd = precioUsd;
        estadoApp.mercado.actualizado.usd = true;
    } else {
        console.warn("No se pudo obtener la cotización de SPY en ningún proxy, se usa valor de referencia.");
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

    estadoApp.mercado.spy_ars = estadoApp.mercado.spy_usd * estadoApp.mercado.dolarCCL;

    let ratioAutomatico = await obtenerRatioCedearAutomatico();
    if (ratioAutomatico !== null) {
        estadoApp.mercado.ratioCedear = ratioAutomatico;
        estadoApp.mercado.actualizado.ratio = true;
    } else {
        estadoApp.mercado.actualizado.ratio = false;
    }

    evaluarCamposInversion(); actualizarApp();
}

// --- FORMULARIO: mostrar Inversión o Retiro ---
export function toggleMovimientoInversion() {
    let mov = document.getElementById('invMovimiento').value;
    document.getElementById('seccionInversion').style.display = mov === "INVERSION" ? "block" : "none";
    document.getElementById('seccionRetiro').style.display = mov === "RETIRO" ? "block" : "none";
}

// El ratio del CEDEAR de SPY (cuántos CEDEARs representan 1 acción real) lo
// fija BYMA y puede cambiar sin aviso — no hay ninguna API gratuita que lo dé,
// así que es editable a mano acá.
export function actualizarRatioCedear() {
    let nuevoRatio = parseFloat(document.getElementById('inputRatioCedear').value);
    if (!nuevoRatio || nuevoRatio <= 0) return;
    estadoApp.mercado.ratioCedear = nuevoRatio;
    estadoApp.mercado.actualizado.ratio = false; // lo tocó la persona a mano, ya no es "automático"
    evaluarCamposInversion();
    actualizarApp();
    guardarDatosEnNube();
}

// --- FORMULARIO: campos dinámicos de Inversión según instrumento ---
export function evaluarCamposInversion() {
    let inst = document.getElementById('invInstrumentoNuevo').value;
    let boxOrigen = document.getElementById('boxInvOrigen');
    let boxCotizacion = document.getElementById('boxInvCotizacionDolar');
    let boxNominales = document.getElementById('boxInvNominales');
    let boxRatio = document.getElementById('boxRatioCedear');
    let lblMonto = document.getElementById('lblInvMontoNuevo');

    boxCotizacion.style.display = 'none';
    boxNominales.style.display = 'none';
    boxRatio.style.display = 'none';

    if (inst === "Dólares") {
        // Comprar dólares siempre sale del pool de Pesos.
        boxOrigen.style.display = 'none';
        boxCotizacion.style.display = 'block';
        lblMonto.innerText = 'Monto a Invertir (Pesos)';
    } else {
        // S&P 500
        boxOrigen.style.display = 'block';
        let origen = document.getElementById('invOrigen').value;
        lblMonto.innerText = origen === "PESOS" ? "Monto a Invertir (Pesos)" : "Monto a Invertir (Dólares)";

        boxNominales.style.display = 'block';
        boxRatio.style.display = 'block';
        let precio = origen === "PESOS" ? precioNominalSp500Ars() : precioNominalSp500Usd();
        let monto = parseFloat(document.getElementById('invMontoNuevo').value) || 0;
        document.getElementById('invNominalesNuevo').value = precio > 0 ? (monto / precio).toFixed(4) : '';

        let inputRatio = document.getElementById('inputRatioCedear');
        if (document.activeElement !== inputRatio) inputRatio.value = estadoApp.mercado.ratioCedear;
        document.getElementById('lblEstadoRatio').innerText = estadoApp.mercado.actualizado.ratio
            ? 'Detectado automáticamente'
            : 'No se pudo detectar solo — verificá que sea el vigente';
        document.getElementById('lblEstadoRatio').style.color = estadoApp.mercado.actualizado.ratio ? '#10b981' : '#d97706';

        let avisoViejo = document.getElementById('avisoCotizacionVieja');
        let cotizacionesOk = estadoApp.mercado.actualizado.usd && estadoApp.mercado.actualizado.ccl;
        avisoViejo.style.display = cotizacionesOk ? 'none' : 'block';
    }
}

// --- FORMULARIO: campos dinámicos de Retiro ---
// Los dólares no se pueden retirar (son capital para invertir en S&P 500),
// así que Retiro es solo para S&P 500 — el único toggle que queda es
// "cargar nominales exactos" vs. "valor en dólares deseado".
export function evaluarCamposRetiro() {
    let cargarNominales = document.getElementById('retCargarNominales').checked;
    document.getElementById('boxRetMontoUsdSp').style.display = cargarNominales ? 'none' : 'block';
    document.getElementById('boxRetNominalesExactos').style.display = cargarNominales ? 'block' : 'none';
}

// Registra un movimiento (Inversión o Retiro) en el historial que alimenta la
// tabla "Historial de Movimientos". "pesosInvertidos"/"dolaresInvertidos"
// guardan de qué pool salió la plata (el que no aplica queda null) — esto es
// lo que permite después revertir el movimiento con precisión.
function registrarMovimientoInversion({ mov, pesosInvertidos, dolaresInvertidos, nominalesRetirados, instrumento, monto, moneda, fecha }) {
    estadoApp.historialInversiones.push({
        id: generarId(), mov,
        pesosInvertidos: pesosInvertidos || null,
        dolaresInvertidos: dolaresInvertidos || null,
        nominalesRetirados: nominalesRetirados || null,
        instrumento, monto, moneda, fecha
    });
}

export function ejecutarInversionNueva() {
    let inst = document.getElementById('invInstrumentoNuevo').value;
    let fecha = document.getElementById('invFechaNueva').value;
    let monto = parseFloat(document.getElementById('invMontoNuevo').value);
    if (!monto || monto <= 0 || !fecha) return mostrarAlerta("Completá los campos obligatorios");

    if (inst === "Dólares") {
        let cotizacion = parseFloat(document.getElementById('invCotizacionDolar').value);
        if (!cotizacion || cotizacion <= 0) return mostrarAlerta("Ingresá la cotización de compra");
        if (estadoApp.patrimonio.pesos < monto) return mostrarAlerta("Pesos insuficientes en la billetera.");

        let dolaresComprados = monto / cotizacion;
        estadoApp.patrimonio.pesos -= monto;
        estadoApp.patrimonio.dolares += dolaresComprados;
        registrarMovimientoInversion({ mov: "Inversión", pesosInvertidos: monto, instrumento: "Dólares", monto: dolaresComprados, moneda: "USD", fecha });
        registrarFotoMesActual();
    } else {
        // S&P 500
        let origen = document.getElementById('invOrigen').value; // "PESOS" | "DOLARES"
        let poolDisponible = origen === "PESOS" ? estadoApp.patrimonio.pesos : estadoApp.patrimonio.dolares;
        if (poolDisponible < monto) return mostrarAlerta(`${origen === "PESOS" ? "Pesos" : "Dólares"} insuficientes en la billetera.`);

        let nominales = parseFloat(document.getElementById('invNominalesNuevo').value);
        if (!nominales || nominales <= 0) return mostrarAlerta("Completá los nominales");
        if (origen === "PESOS") estadoApp.patrimonio.pesos -= monto; else estadoApp.patrimonio.dolares -= monto;
        estadoApp.sp500.nominales += nominales;
        registrarMovimientoInversion({
            mov: "Inversión",
            pesosInvertidos: origen === "PESOS" ? monto : null,
            dolaresInvertidos: origen === "DOLARES" ? monto : null,
            instrumento: "S&P 500", monto: nominales, moneda: "Nominales", fecha
        });
        registrarFotoMesActual();
    }

    document.getElementById('invMontoNuevo').value = "";
    actualizarApp(); guardarDatosEnNube();
}

// Los dólares no se retiran (son capital para invertir en S&P 500) — Retiro
// es exclusivamente para el pool de S&P 500.
export function ejecutarRetiroNuevo() {
    let hoy = new Date().toISOString().split('T')[0];
    let cargarNominales = document.getElementById('retCargarNominales').checked;
    let nominalesARetirar;

    if (cargarNominales) {
        nominalesARetirar = parseFloat(document.getElementById('retNominalesExactos').value);
        if (!nominalesARetirar || nominalesARetirar <= 0) return mostrarAlerta("Ingresá los nominales a retirar");
    } else {
        let montoUsdDeseado = parseFloat(document.getElementById('retMontoUsdSp').value);
        if (!montoUsdDeseado || montoUsdDeseado <= 0) return mostrarAlerta("Ingresá un monto válido");
        nominalesARetirar = montoUsdDeseado / precioNominalSp500Usd();
    }
    if (estadoApp.sp500.nominales < nominalesARetirar) return mostrarAlerta("No tenés suficientes nominales de S&P 500.");

    estadoApp.sp500.nominales -= nominalesARetirar;
    let valorUsd = nominalesARetirar * precioNominalSp500Usd();
    registrarMovimientoInversion({ mov: "Retiro", nominalesRetirados: nominalesARetirar, instrumento: "S&P 500", monto: valorUsd, moneda: "USD", fecha: hoy });

    registrarFotoMesActual();
    actualizarApp(); guardarDatosEnNube();
}

// Deshace un movimiento del Historial: le devuelve al pool correspondiente
// exactamente lo que ese movimiento le sacó (o viceversa), y lo borra del
// historial. Para movimientos viejos que no tengan guardados los campos
// nuevos (dolaresInvertidos / nominalesRetirados), hace lo mejor posible y
// avisa que la reversión es aproximada.
export async function revertirMovimientoInversion(id) {
    let entrada = estadoApp.historialInversiones.find(h => h.id === id);
    if (!entrada) return;

    let esAproximado = false;

    if (!(await mostrarConfirmacion(`¿Revertir este movimiento?\n\n${entrada.mov}: ${entrada.instrumento}`, {peligroso: true}))) return;

    if (entrada.mov === "Inversión" && entrada.instrumento === "Dólares") {
        // Se gastaron pesos y se obtuvieron dólares: se revierte 1 a 1.
        estadoApp.patrimonio.pesos += entrada.pesosInvertidos || 0;
        estadoApp.patrimonio.dolares -= entrada.monto;
    } else if (entrada.mov === "Inversión" && entrada.instrumento === "S&P 500") {
        estadoApp.sp500.nominales -= entrada.monto;
        if (entrada.pesosInvertidos) estadoApp.patrimonio.pesos += entrada.pesosInvertidos;
        else if (entrada.dolaresInvertidos) estadoApp.patrimonio.dolares += entrada.dolaresInvertidos;
        else if (entrada.pesosInvertidos === null && entrada.dolaresInvertidos === null) {
            // Movimiento viejo, de antes de guardar de dónde salió la plata
            // cuando el origen era Dólares — no podemos saber cuántos dólares
            // devolver, así que solo se revierten los nominales.
            esAproximado = true;
        }
    } else if (entrada.mov === "Retiro" && entrada.instrumento === "S&P 500") {
        let nominales = entrada.nominalesRetirados;
        if (!nominales) {
            // Movimiento viejo sin nominales guardados: se recalcula con la
            // cotización actual (puede no coincidir con la de ese momento).
            nominales = entrada.monto / precioNominalSp500Usd();
            esAproximado = true;
        }
        estadoApp.sp500.nominales += nominales;
    }

    estadoApp.historialInversiones = estadoApp.historialInversiones.filter(h => h.id !== id);
    registrarFotoMesActual();
    actualizarApp(); guardarDatosEnNube();

    if (esAproximado) mostrarAlerta("Este movimiento es de antes de guardar todos los detalles, así que se revirtió de forma aproximada.");
}
