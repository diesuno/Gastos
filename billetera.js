// ==========================================
// 💹 BILLETERA: cotizaciones de mercado, inversiones y retiros
// ==========================================
// Solo maneja Dólares y S&P 500. Plazo Fijo y Mercado Pago se sacaron de la
// app (si en el futuro los volvemos a sumar, el patrón de "pool acumulado"
// que usa S&P 500 acá es el punto de partida más simple).
import { estadoApp } from './estado.js';
import { generarId } from './utilidades.js';
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

export async function inicializarMercado() {
    let precioArs = await obtenerPrecioYahoo("SPY.BA");
    if (precioArs !== null) {
        if (precioArs > 100000) precioArs /= 10;
        estadoApp.mercado.spy_ars = precioArs;
        estadoApp.mercado.actualizado.ars = true;
    } else {
        console.warn("No se pudo obtener la cotización de SPY.BA en ningún proxy, se usa valor de referencia.");
    }

    let precioUsd = await obtenerPrecioYahoo("SPY");
    if (precioUsd !== null) {
        estadoApp.mercado.spy_usd = precioUsd;
        estadoApp.mercado.actualizado.usd = true;
    } else {
        console.warn("No se pudo obtener la cotización de SPY en ningún proxy, se usa valor de referencia.");
    }

    evaluarCamposInversion(); actualizarApp();
}

// --- FORMULARIO: mostrar Inversión o Retiro ---
export function toggleMovimientoInversion() {
    let mov = document.getElementById('invMovimiento').value;
    document.getElementById('seccionInversion').style.display = mov === "INVERSION" ? "block" : "none";
    document.getElementById('seccionRetiro').style.display = mov === "RETIRO" ? "block" : "none";
}

// --- FORMULARIO: campos dinámicos de Inversión según instrumento ---
export function evaluarCamposInversion() {
    let inst = document.getElementById('invInstrumentoNuevo').value;
    let boxOrigen = document.getElementById('boxInvOrigen');
    let boxCotizacion = document.getElementById('boxInvCotizacionDolar');
    let boxNominales = document.getElementById('boxInvNominales');
    let lblMonto = document.getElementById('lblInvMontoNuevo');

    boxCotizacion.style.display = 'none';
    boxNominales.style.display = 'none';

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
        let precio = origen === "PESOS" ? estadoApp.mercado.spy_ars : estadoApp.mercado.spy_usd;
        let monto = parseFloat(document.getElementById('invMontoNuevo').value) || 0;
        document.getElementById('invNominalesNuevo').value = precio > 0 ? (monto / precio).toFixed(4) : '';
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
        nominalesARetirar = montoUsdDeseado / estadoApp.mercado.spy_usd;
    }
    if (estadoApp.sp500.nominales < nominalesARetirar) return mostrarAlerta("No tenés suficientes nominales de S&P 500.");

    estadoApp.sp500.nominales -= nominalesARetirar;
    let valorUsd = nominalesARetirar * estadoApp.mercado.spy_usd;
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
            nominales = entrada.monto / estadoApp.mercado.spy_usd;
            esAproximado = true;
        }
        estadoApp.sp500.nominales += nominales;
    }

    estadoApp.historialInversiones = estadoApp.historialInversiones.filter(h => h.id !== id);
    registrarFotoMesActual();
    actualizarApp(); guardarDatosEnNube();

    if (esAproximado) mostrarAlerta("Este movimiento es de antes de guardar todos los detalles, así que se revirtió de forma aproximada.");
}
