// ==========================================
// 💹 BILLETERA: cotizaciones de mercado, inversiones y ahorro
// ==========================================
import { estadoApp } from './estado.js';
import { generarId } from './utilidades.js';
import { mostrarAlerta, mostrarPrompt } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';

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
    try {
        let res = await fetch("https://api.argentinadatos.com/v1/finanzas/rendimientos/fci");
        let data = await res.json();
        let mp = data.find(f => f.fondo.toLowerCase().includes("mercado"));
        if (mp && mp.tna) { estadoApp.mercado.mpTna = (mp.tna * 100).toFixed(1); estadoApp.mercado.actualizado.mpTna = true; }
    } catch(e) { console.warn("No se pudo obtener la TNA de Mercado Pago, se usa valor de referencia:", e.message); }

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

    toggleCamposInversion(); actualizarApp();
}

export function toggleCamposInversion() {
    let i = document.getElementById('invInstrumento').value; let mon = document.getElementById('invMoneda').value;
    let lblPrecio = document.getElementById('lblPrecioMercado');
    if(i === "S&P 500") {
        document.getElementById('grupoInteres').style.display = "none"; document.getElementById('grupoCotizacionMercado').style.display = "flex";
        let valM = mon === "ARS" ? estadoApp.mercado.spy_ars : estadoApp.mercado.spy_usd; let sim = mon === "ARS" ? "$" : "US$";
        let esActual = mon === "ARS" ? estadoApp.mercado.actualizado.ars : estadoApp.mercado.actualizado.usd;
        lblPrecio.innerText = `${sim}${valM.toLocaleString('es-AR')}` + (esActual ? "" : " ⚠️ Sin conexión, valor de referencia");
        lblPrecio.style.color = esActual ? "#1e3a8a" : "#d97706";
    } else if (i === "Mercado Pago") {
        document.getElementById('grupoInteres').style.display = "flex"; document.getElementById('grupoCotizacionMercado').style.display = "flex";
        lblPrecio.innerText = `TNA API: ${estadoApp.mercado.mpTna}%` + (estadoApp.mercado.actualizado.mpTna ? "" : " ⚠️ Sin conexión, valor de referencia");
        lblPrecio.style.color = estadoApp.mercado.actualizado.mpTna ? "#1e3a8a" : "#d97706";
        document.getElementById('invInteres').value = estadoApp.mercado.mpTna;
    } else {
        document.getElementById('grupoInteres').style.display = "flex"; document.getElementById('grupoCotizacionMercado').style.display = "none"; document.getElementById('invInteres').value = "";
    }
}

export function ejecutarInversion() {
    let m = parseFloat(document.getElementById('invMonto').value); let mon = document.getElementById('invMoneda').value;
    let inst = document.getElementById('invInstrumento').value; let fec = document.getElementById('invFecha').value;
    if(!m || !fec) return mostrarAlerta("Faltan datos");
    if(mon === "ARS" && estadoApp.patrimonio.pesos < m) return mostrarAlerta("Efectivo Pesos insuficiente en la billetera.");
    if(mon === "USD" && estadoApp.patrimonio.dolares < m) return mostrarAlerta("Efectivo USD insuficiente en la billetera.");

    let nom = 0; let int = parseFloat(document.getElementById('invInteres').value) || (inst==="Mercado Pago"?estadoApp.mercado.mpTna:0);
    if(inst === "S&P 500") nom = m / (mon === "ARS" ? estadoApp.mercado.spy_ars : estadoApp.mercado.spy_usd);

    if(mon === "ARS") estadoApp.patrimonio.pesos -= m; else estadoApp.patrimonio.dolares -= m;
    estadoApp.inversiones.push({ monto: m, moneda: mon, instrumento: inst, fecha: fec, nominales: nom, interes: int });
    document.getElementById('invMonto').value = ""; actualizarApp(); guardarDatosEnNube();
}

export async function retirarInversion(idx, valorSugerido) {
    let i = estadoApp.inversiones[idx];
    let nInput = await mostrarPrompt(`Liquidando inversión.\n\nEl sistema estima un valor de: $${Math.floor(valorSugerido)}\n\nIngresá importe EXACTO devuelto a tu caja:`, Math.floor(valorSugerido));
    if(!nInput) return; let n = parseFloat(nInput);
    if(i.moneda === "ARS") estadoApp.patrimonio.pesos += n; else estadoApp.patrimonio.dolares += n;
    estadoApp.inversiones.splice(idx, 1); actualizarApp(); guardarDatosEnNube();
}

export async function ejecutarEnvioAhorro() {
    let m = parseFloat(document.getElementById('ahorroMontoPesos').value); let mon = document.getElementById('ahorroDestinoMoneda').value;
    let sel = document.getElementById('filtroMesAnio'); let [aSel, mSel] = sel.value.split('-').map(Number);
    if(!m || m <= 0) return; let conceptoD = "";
    if(mon === "ARS") { estadoApp.patrimonio.pesos += m; conceptoD = "Envío a Ahorros (Pesos)"; }
    else { let cotizacion = parseFloat(await mostrarPrompt("Ingresá a cuánto compraste el Dólar.")); if(!cotizacion) return; let dComprados = m / cotizacion; estadoApp.patrimonio.dolares += dComprados; conceptoD = `Compra USD (${dComprados.toFixed(2)} USD a $${cotizacion})`; }
    let fFalsa = `${aSel}-${(mSel + 1).toString().padStart(2,'0')}-28`;
    estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: m, tipo: "Enviado a Ahorros", concepto: conceptoD, fecha: fFalsa, metodo: "EN_EL_ACTO" });
    document.getElementById('ahorroMontoPesos').value = ""; actualizarApp(); guardarDatosEnNube();
}

export function ingresarSaldoExistente() {
    let m = parseFloat(document.getElementById('ajusteMonto').value); let mon = document.getElementById('ajusteMoneda').value;
    if(!m || m <= 0) return;
    if(mon === "ARS") estadoApp.patrimonio.pesos += m; else estadoApp.patrimonio.dolares += m;
    document.getElementById('ajusteMonto').value = ""; actualizarApp(); guardarDatosEnNube();
}
