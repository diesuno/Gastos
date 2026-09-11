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
import { obtenerRangoPeriodo, obtenerKeyPeriodoDeFecha, obtenerKeyPeriodoDeDate } from './periodo.js';

// Devuelve los movimientos "reales" de un mes puntual (aSel = año, mSel = mes
// 0-indexado) más los "virtuales" generados por servicios recurrentes activos
// ese mes (tarjetas/suscripciones que se devengan mes a mes).
export function obtenerMovimientosDeMes(aSel, mSel) {
    let { inicio, fin } = obtenerRangoPeriodo(aSel, mSel);
    let keyMes = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

let filtrados = estadoApp.todosLosMovimientos.filter(mov => {
    let f = new Date(mov.fecha + 'T00:00:00'); return f >= inicio && f <= fin;
});

let movsVirtuales = [];
    if (esAvanzado) {
        estadoApp.suscripciones.forEach(susc => {
            let keyAlta = obtenerKeyPeriodoDeFecha(susc.fechaAlta);
            if (keyMes < keyAlta) return;
            if (susc.mesBaja && keyMes >= susc.mesBaja) return;

                                        let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
            for (let key of diffKeys) { if (key <= keyMes) montoActivo = susc.montosPorMes[key]; }
            if (montoActivo === 0) return;

                                        let fechaVMov = `${inicio.getFullYear()}-${(inicio.getMonth()+1).toString().padStart(2,'0')}-${inicio.getDate().toString().padStart(2,'0')}`;
            let yaPagadoResumen = (susc.pagosResumen && susc.pagosResumen.includes(keyMes));
            let vMov = { id: susc.id + "_" + keyMes, idGrupo: susc.id, monto: montoActivo, tipo: susc.tipo, concepto: susc.concepto, fecha: fechaVMov, metodo: "SERVICIO", debito: susc.debito, dividir: susc.dividir, amigo: susc.amigo, categoria: susc.categoria || '', esVirtual: true, pagado: yaPagadoResumen };

                                        let miParte = calcularMiParteSuscripcion(susc, keyMes);
            let pushearVMov = miParte > 0;
            vMov.monto = miParte;

                                        let registrarDeuda = false; let mDeuda = 0; let tDeuda = "";
            if (susc.dividir === "PAGUE_50_INTEGRO") { registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_50") { registrarDeuda = true; mDeuda = montoActivo/2; tDeuda = "EN_CONTRA"; }
            else if (susc.dividir === "PAGUE_100_DEUDA") { registrarDeuda = true; mDeuda = montoActivo; tDeuda = "A_FAVOR"; }
            else if (susc.dividir === "PAGO_OTRO_100_DEUDA") { registrarDeuda = true; mDeuda = montoActivo; tDeuda = "EN_CONTRA"; }

                                        if (pushearVMov) movsVirtuales.push(vMov);

                                        if(registrarDeuda) {
                                            let yaPagado = (susc.pagosAmigo && susc.pagosAmigo.includes(keyMes));
                                            movsVirtuales.push({ id: susc.id + "_deuda_" + keyMes, idGrupo: susc.id, monto: mDeuda, tipo: "Cuenta Cobrar", concepto: tDeuda === "A_FAVOR" ? `Te debe por: ${susc.concepto}` : `Le debés por: ${susc.concepto}`, fecha: vMov.fecha, deudor: susc.amigo, sentido: tDeuda, estado: yaPagado ? "Saldado" : "Pendiente", metodo: "SERVICIO", esVirtual: true, mesClave: keyMes });
                                        }
        });
    }

return filtrados.concat(movsVirtuales);
}

export function calcularMiParteSuscripcion(susc, keyPeriodo) {
    let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
    for (let key of diffKeys) { if (key <= keyPeriodo) montoActivo = susc.montosPorMes[key]; }
    if (montoActivo === 0) return 0;

if (susc.dividir === "PAGUE_50_INTEGRO" || susc.dividir === "PAGO_OTRO_50") return montoActivo / 2;
    if (susc.dividir === "PAGUE_100_DEUDA") return 0;
    return montoActivo;
}

function calcularDeudaSuscripcionEnPeriodo(susc, keyPeriodo) {
    let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
    for (let key of diffKeys) { if (key <= keyPeriodo) montoActivo = susc.montosPorMes[key]; }
    if (montoActivo === 0) return null;

if (susc.dividir === "PAGUE_50_INTEGRO") return { monto: montoActivo / 2, sentido: "A_FAVOR" };
    if (susc.dividir === "PAGO_OTRO_50") return { monto: montoActivo / 2, sentido: "EN_CONTRA" };
    if (susc.dividir === "PAGUE_100_DEUDA") return { monto: montoActivo, sentido: "A_FAVOR" };
    if (susc.dividir === "PAGO_OTRO_100_DEUDA") return { monto: montoActivo, sentido: "EN_CONTRA" };
    return null;
}

export function obtenerTodasLasDeudasPendientes() {
    let reales = estadoApp.todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente");

let virtuales = [];
    if (estadoApp.perfilUsuario.modo === "AVANZADO") {
        let hoy = new Date();
        let keyHoy = obtenerKeyPeriodoDeDate(hoy);

    estadoApp.suscripciones.forEach(susc => {
        if (!susc.dividir || susc.dividir === "NO") return;

                                    let keyAlta = obtenerKeyPeriodoDeFecha(susc.fechaAlta);
        let [a, m] = keyAlta.split('-').map(Number);
        let cursor = new Date(a, m - 1, 1);
        let [aHoy, mHoy] = keyHoy.split('-').map(Number);
        let finCursor = new Date(aHoy, mHoy - 1, 1);

                                    while (cursor <= finCursor) {
                                        let aC = cursor.getFullYear(), mC = cursor.getMonth();
                                        let keyC = `${aC}-${(mC + 1).toString().padStart(2, '0')}`;
                                        if (susc.mesBaja && keyC >= susc.mesBaja) break;

        let deuda = calcularDeudaSuscripcionEnPeriodo(susc, keyC);
                                        if (deuda) {
                                            let yaPagado = (susc.pagosAmigo && susc.pagosAmigo.includes(keyC));
                                            if (!yaPagado) {
                                                let { inicio } = obtenerRangoPeriodo(aC, mC);
                                                let fechaVMov = `${inicio.getFullYear()}-${(inicio.getMonth() + 1).toString().padStart(2, '0')}-${inicio.getDate().toString().padStart(2, '0')}`;
                                                virtuales.push({
                                                    id: susc.id + "_deuda_" + keyC, idGrupo: susc.id, monto: deuda.monto, tipo: "Cuenta Cobrar",
                                                    concepto: deuda.sentido === "A_FAVOR" ? `Te debe por: ${susc.concepto}` : `Le debés por: ${susc.concepto}`,
                                                    fecha: fechaVMov, deudor: susc.amigo, sentido: deuda.sentido, estado: "Pendiente", metodo: "SERVICIO",
                                                    esVirtual: true, mesClave: keyC
                                                });
                                            }
                                        }
                                        cursor.setMonth(cursor.getMonth() + 1);
                                    }
    });
    }

return [...reales, ...virtuales];
}

export function calcularFlujoDeMes(aSel, mSel) {
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");
    let movimientosDelMes = obtenerMovimientosDeMes(aSel, mSel);

let ing = 0, gastosEnActo = 0, gastosCredito = 0, gastosServicio = 0, gastosLiquidacion = 0;
    let gastosFijosBasic = 0, gastosVariablesBasic = 0;

movimientosDelMes.forEach(mov => {
    if (mov.tipo === "Ingreso") ing += mov.monto;

                          let esLiquidacion = (mov.metodo === "LIQUIDACION");

                          if (!esLiquidacion) {
                              if (mov.tipo === "Gasto Fijo" || mov.tipo === "Enviado a Ahorros") gastosFijosBasic += mov.monto;
                              if (mov.tipo === "Gasto Variable") gastosVariablesBasic += mov.monto;
                          }

                          if (mov.tipo !== "Ingreso" && mov.tipo !== "Cuenta Cobrar") {
                              let mtd = mov.metodo || "EN_EL_ACTO";
                              if(mtd === "EN_EL_ACTO") gastosEnActo += mov.monto;
                              if(mtd === "CREDITO" && !mov.pagado) gastosCredito += mov.monto;
                              if(mtd === "SERVICIO" && !mov.pagado) gastosServicio += mov.monto;
                              if(mtd === "LIQUIDACION") gastosLiquidacion += mov.monto;
                          }
});

return {
    movimientosDelMes, esAvanzado,
    ing, gastosEnActo, gastosCredito, gastosServicio, gastosFijosBasic, gastosVariablesBasic, gastosLiquidacion,
    dispReal: ing - gastosEnActo - gastosLiquidacion,
    dispBasico: ing - (gastosFijosBasic + gastosVariablesBasic) - gastosLiquidacion,
};
}


// Devuelve el monto TOTAL del servicio (lo que sale realmente del bolsillo
// al pagarle al proveedor), independientemente de cómo se divida la deuda.
// A diferencia de calcularMiParteSuscripcion() — que sirve para calcular
// Obligaciones — este se usa en "Pagar Resumen" y "Pagar Servicio".
export function calcularMontoTotalSuscripcion(susc, keyPeriodo) {
    let montoActivo = 0;
    let diffKeys = Object.keys(susc.montosPorMes).sort();
    for (let key of diffKeys) {
        if (key <= keyPeriodo) montoActivo = susc.montosPorMes[key];
    }
    return montoActivo;
}
