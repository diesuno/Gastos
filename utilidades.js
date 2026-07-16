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
export function precioNominalSp500Usd() {
    return estadoApp.mercado.spy_usd / estadoApp.mercado.ratioCedear;
}
export function precioNominalSp500Ars() {
    return estadoApp.mercado.spy_ars / estadoApp.mercado.ratioCedear;
}
