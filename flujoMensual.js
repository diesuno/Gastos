// ==========================================
// 📊 CÁLCULO DE FLUJO DE UN MES (ingresos, gastos, disponible)
// ==========================================
// Esta lógica vivía duplicada dentro de actualizarApp (render.js). Se extrajo
// acá porque ahora también la necesita el cierre mensual del pool de Pesos
// (cierreMensual.js) — así hay un solo lugar que calcula "cuánto quedó
// disponible en tal mes", y el dashboard y el cierre de mes nunca pueden
// quedar desincronizados entre sí.
import { estadoApp } from './estado.js';
import { generarId } from './utilidades.js';

// Devuelve los movimientos "reales" de un mes puntual (aSel = año, mSel = mes
// 0-indexado) más los "virtuales" generados por servicios recurrentes activos
// ese mes (tarjetas/suscripciones que se devengan mes a mes).
export function obtenerMovimientosDeMes(aSel, mSel) {
    let fechaSelObj = new Date(aSel, mSel, 1);
    let keyMes = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

    let filtrados = estadoApp.todosLosMovimientos.filter(mov => {
        let f = new Date(mov.fecha + 'T00:00:00'); return f.getFullYear() === aSel && f.getMonth() === mSel;
    });

    let movsVirtuales = [];
    if (esAvanzado) {
        estadoApp.suscripciones.forEach(susc => {
            let fAlta = new Date(susc.fechaAlta + 'T00:00:00'); let fAltaMesObj = new Date(fAlta.getFullYear(), fAlta.getMonth(), 1);
            if (fechaSelObj < fAltaMesObj) return;
            if (susc.mesBaja) { let [bA, bM] = susc.mesBaja.split('-').map(Number); if (fechaSelObj >= new Date(bA, bM - 1, 1)) return; }

            let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
            for (let key of diffKeys) { let [kA, kM] = key.split('-').map(Number); if (new Date(kA, kM - 1, 1) <= fechaSelObj) montoActivo = susc.montosPorMes[key]; }
            if (montoActivo === 0) return;

            let vMov = { id: susc.id + "_" + keyMes, idGrupo: susc.id, monto: montoActivo, tipo: susc.tipo, concepto: susc.concepto, fecha: `${aSel}-${(mSel+1).toString().padStart(2,'0')}-01`, metodo: "SERVICIO", debito: susc.debito, dividir: susc.dividir, amigo: susc.amigo, esVirtual: true };

            let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";
            if (susc.dividir === "PAGUE_50_TOTAL") { vMov.monto = montoActivo/2; }
            else if (susc.dividir === "PAGUE_50_INTEGRO") { vMov.monto = montoActivo/2; movsVirtuales.push({...vMov, id: generarId(), monto: montoActivo/2, tipo: "Gasto Variable", concepto: `Adelanto a ${susc.amigo}: ${susc.concepto}`}); registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_50") { registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "EN_CONTRA"; }
            else if (susc.dividir === "PAGUE_100_DEUDA") { vMov.monto = montoActivo; vMov.tipo = "Gasto Variable"; vMov.concepto = `Adelanto a ${susc.amigo}: ${susc.concepto}`; registrarDeuda = true; mDeuda = montoActivo; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_100_DEUDA") { registrarDeuda = true; mDeuda = montoActivo; tDeuda = "EN_CONTRA"; }

            if (susc.dividir !== "PAGO_OTRO_50" && susc.dividir !== "PAGO_OTRO_100_DEUDA") { movsVirtuales.push(vMov); }

            if(registrarDeuda) {
                let yaPagado = (susc.pagosAmigo && susc.pagosAmigo.includes(keyMes));
                movsVirtuales.push({ id: susc.id + "_deuda_" + keyMes, idGrupo: susc.id, monto: mDeuda, tipo: "Cuenta Cobrar", concepto: tDeuda === "A_FAVOR" ? `Te debe por: ${susc.concepto}` : `Le debés por: ${susc.concepto}`, fecha: vMov.fecha, deudor: susc.amigo, sentido: tDeuda, estado: yaPagado ? "Saldado" : "Pendiente", metodo: "SERVICIO", esVirtual: true, mesClave: keyMes });
            }
        });
    }

    return filtrados.concat(movsVirtuales);
}

// Calcula ingresos, gastos por método, y los 3 "disponibles" posibles de un
// mes puntual (real/proyectado para modo avanzado, básico para modo básico).
export function calcularFlujoDeMes(aSel, mSel) {
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");
    let movimientosDelMes = obtenerMovimientosDeMes(aSel, mSel);

    let ing = 0, gastosEnActo = 0, gastosCredito = 0, gastosServicio = 0;
    let gastosFijosBasic = 0, gastosVariablesBasic = 0;

    movimientosDelMes.forEach(mov => {
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

    return {
        movimientosDelMes, esAvanzado,
        ing, gastosEnActo, gastosCredito, gastosServicio, gastosFijosBasic, gastosVariablesBasic,
        dispReal: ing - gastosEnActo,
        dispBasico: ing - (gastosFijosBasic + gastosVariablesBasic),
    };
}
