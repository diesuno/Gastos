// ==========================================
// 🧰 UTILIDADES GENERALES
// ==========================================
import { estadoApp } from './estado.js';

export function generarId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

// Convierte texto libre del usuario (concepto, nombre de persona, etc.) en texto
// seguro para insertar con innerHTML, neutralizando <, >, &, comillas.
// SIEMPRE usar esta función al mostrar dentro de una tabla cualquier dato
// que haya sido tipeado por el usuario (no hace falta para números o textos fijos).
export function escapeHTML(texto) {
    if (texto === null || texto === undefined) return "";
    const div = document.createElement('div');
    div.textContent = String(texto);
    return div.innerHTML;
}

// Agrupa una lista de movimientos por idGrupo (une las cuotas de una misma compra
// en un solo registro para mostrar) y calcula, para cada grupo, el monto total
// sumado y cuánto de ese grupo está compartido/adeudado con otra persona.
// Se usa tanto en la tabla de "Flujo Mensual" como en "Detalle Gastos".
export function agruparMovimientosPorGrupo(movimientos) {
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

// Oculta el loader inicial (pantalla de "Cargando tu información...").
export function ocultarLoaderInicial() {
    if (estadoApp.loaderYaOcultado) return;
    estadoApp.loaderYaOcultado = true;
    const loader = document.getElementById('loader-inicial');
    if (loader) loader.style.display = 'none';
}

// Precio real de "1 nominal" (1 CEDEAR) de S&P 500, aplicando el ratio del
// CEDEAR (cuántos CEDEARs representan 1 acción real — ver estado.js). Se
// centraliza acá para que, el día que haya que tocar esta cuenta de nuevo,
// sea en un solo lugar y no en cada archivo por separado.
// Precio real de "1 nominal" (1 CEDEAR) de S&P 500 — es directamente la
// cotización del CEDEAR de IVV en BYMA (o la cargada a mano), sin convertir
// a la acción real de EEUU. Se centraliza acá para que el resto de la app
// (formularios, gráfico, historial) siempre use el mismo valor.
export function precioNominalSp500Usd() {
    return estadoApp.mercado.spy_usd;
}
export function precioNominalSp500Ars() {
    return estadoApp.mercado.spy_ars;
}

// Convierte cualquier entrada del historial de Inversiones (nueva o vieja) a
// una forma común: { origen, destino, montoOrigen, montoDestino }. Los
// movimientos nuevos ya vienen así; los guardados antes de este cambio usaban
// otro esquema (pesosInvertidos/dolaresInvertidos/nominalesRetirados), así que
// acá se "traducen" para que el resto del código (el gráfico, revertir un
// movimiento, la tabla de Historial) no tenga que preocuparse por la
// diferencia.
export function normalizarMovimientoInversion(entry) {
    if (entry.origen !== undefined) return entry; // ya es formato nuevo

    if (entry.mov === "Inversión" && entry.instrumento === "Dólares") {
        return { ...entry, origen: "PESOS", destino: "DOLARES", montoOrigen: entry.pesosInvertidos, montoDestino: entry.monto };
    }
    if (entry.mov === "Inversión" && entry.instrumento === "S&P 500") {
        let origen = entry.pesosInvertidos ? "PESOS" : (entry.dolaresInvertidos ? "DOLARES" : null);
        return { ...entry, origen, destino: "S&P 500", montoOrigen: entry.pesosInvertidos || entry.dolaresInvertidos || null, montoDestino: entry.monto };
    }
    if (entry.mov === "Retiro" && entry.instrumento === "S&P 500") {
        // Los retiros viejos no acreditaban ningún destino (la plata "salía"
        // sin más), así que destino queda null.
        return { ...entry, origen: "S&P 500", destino: null, montoOrigen: entry.nominalesRetirados || null, montoDestino: null };
    }
    return { ...entry, origen: null, destino: null, montoOrigen: null, montoDestino: null };
}

// Arma el texto "Origen → Destino" para la columna Detalle del Historial de
// Movimientos, entendiendo tanto el formato nuevo como el viejo.
const NOMBRES_MONEDA = { PESOS: 'Pesos', DOLARES: 'Dólares', 'S&P 500': 'S&P', FUERA: 'Fuera de la app' };
export function describirMovimientoInversion(entryOriginal) {
    let entry = normalizarMovimientoInversion(entryOriginal);
    let origenTxt = NOMBRES_MONEDA[entry.origen] || '?';
    let destinoTxt = NOMBRES_MONEDA[entry.destino] || '(sin registrar)';
    let base = `${origenTxt} → ${destinoTxt}`;
    if (entry.mov === "Extracción" && entryOriginal.motivo) base += ` (${entryOriginal.motivo})`;
    return base;
}

// Devuelve el monto "más representativo" de un movimiento para la columna
// Monto de la tabla, junto con su símbolo. Para Inversión/Retiro es lo que
// entró al destino; para Extracción (que no acredita ningún destino) es lo
// que salió del origen. También entiende el esquema más viejo de todos
// (monto/moneda sueltos, sin origen/destino).
export function obtenerMontoYSimboloParaMostrar(entryOriginal) {
    let entry = normalizarMovimientoInversion(entryOriginal);
    const simboloDe = m => m === 'USD' ? 'US$' : (m === 'Nominales' ? '' : (m ? '$' : ''));

    if (entry.montoDestino !== null && entry.montoDestino !== undefined) {
        return { monto: entry.montoDestino, simbolo: simboloDe(entry.monedaDestino) };
    }
    if (entry.montoOrigen !== null && entry.montoOrigen !== undefined) {
        let monedaOrigen = entry.origen === 'DOLARES' ? 'USD' : (entry.origen === 'S&P 500' ? 'Nominales' : 'ARS');
        return { monto: entry.montoOrigen, simbolo: simboloDe(monedaOrigen) };
    }
    if (entryOriginal.monto !== null && entryOriginal.monto !== undefined) {
        return { monto: entryOriginal.monto, simbolo: simboloDe(entryOriginal.moneda) };
    }
    return { monto: 0, simbolo: '' };
}
