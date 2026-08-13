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
            // Las claves "YYYY-MM" comparan bien como texto: si el período
            // que se está mirando es anterior al de la fecha de alta (o
            // igual/posterior al de la baja), la suscripción no corresponde acá.
            let keyAlta = obtenerKeyPeriodoDeFecha(susc.fechaAlta);
            if (keyMes < keyAlta) return;
            if (susc.mesBaja && keyMes >= susc.mesBaja) return;

            let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
            for (let key of diffKeys) { if (key <= keyMes) montoActivo = susc.montosPorMes[key]; }
            if (montoActivo === 0) return;

            let fechaVMov = `${inicio.getFullYear()}-${(inicio.getMonth()+1).toString().padStart(2,'0')}-${inicio.getDate().toString().padStart(2,'0')}`;
            // "pagado" marca si ya pagaste este servicio puntual (ver
            // "Pagar Resumen" en deudas.js) — mientras esté en false, sigue
            // sumando en Obligaciones.
            let yaPagadoResumen = (susc.pagosResumen && susc.pagosResumen.includes(keyMes));
            let vMov = { id: susc.id + "_" + keyMes, idGrupo: susc.id, monto: montoActivo, tipo: susc.tipo, concepto: susc.concepto, fecha: fechaVMov, metodo: "SERVICIO", debito: susc.debito, dividir: susc.dividir, amigo: susc.amigo, esVirtual: true, pagado: yaPagadoResumen };

            // "Mi parte" (lo que se registra como Gasto real) sale siempre de
            // calcularMiParteSuscripcion(), para que el monto mostrado acá y
            // el usado más adelante al comparar contra el mes anterior
            // (variación) estén siempre en la misma unidad — antes se
            // comparaba "mi mitad" contra "el monto completo" del mes
            // anterior, dando variaciones de -50% que no eran reales.
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

// Calcula el monto TOTAL (completo, sin dividir) de una suscripción en un
// período puntual — se usa específicamente para la ACCIÓN de pagar (Pagar
// Resumen / Pagar Servicio), porque ahí sale la plata completa de tu
// bolsillo, sea compartido o no: la parte del otro queda como una deuda a tu
// favor aparte, no se descuenta de lo que vos desembolsás. Es DISTINTO de
// calcularMiParteSuscripcion(), que da tu parte económica (la mitad si está
// compartido 50/50) y se usa para Obligaciones — ese cálculo sigue como
// estaba, esto es solo para cuando efectivamente pagás.
export function calcularMontoTotalSuscripcion(susc, keyPeriodo) {
    let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
    for (let key of diffKeys) { if (key <= keyPeriodo) montoActivo = susc.montosPorMes[key]; }
    return montoActivo;
}

// Calcula "mi parte" (lo que se registra como Gasto real, en la misma
// unidad que se muestra en "Valor a Pagar") de una suscripción en un
// período puntual, según cómo esté dividida. Se centraliza acá para que
// tanto el monto del mes actual como el del mes anterior (al comparar la
// variación) usen siempre el mismo criterio.
export function calcularMiParteSuscripcion(susc, keyPeriodo) {
    let montoActivo = 0; let diffKeys = Object.keys(susc.montosPorMes).sort();
    for (let key of diffKeys) { if (key <= keyPeriodo) montoActivo = susc.montosPorMes[key]; }
    if (montoActivo === 0) return 0;

    if (susc.dividir === "PAGUE_50_INTEGRO" || susc.dividir === "PAGO_OTRO_50") return montoActivo / 2;
    if (susc.dividir === "PAGUE_100_DEUDA") return 0;
    return montoActivo; // "NO" (normal) o "PAGO_OTRO_100_DEUDA" (Debo 100%: es enteramente mío)
}

// Calcula la deuda que genera una suscripción en un período puntual, según
// cómo esté dividida — se usa tanto para el mes que se está viendo
// (obtenerMovimientosDeMes) como para juntar TODAS las deudas pendientes de
// todos los períodos (obtenerTodasLasDeudasPendientes).
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

// Una deuda pendiente no "vence" — sigue apareciendo hasta que se salda, sin
// importar en qué mes se originó ni qué período estés mirando ahora. Por eso
// Cuentas por Cobrar junta TODAS las deudas pendientes (reales, más las
// virtuales que generan las suscripciones en cada período desde que están
// activas), en vez de limitarse al período actualmente seleccionado.
export function obtenerTodasLasDeudasPendientes() {
    let reales = estadoApp.todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente");

    let virtuales = [];
    if (estadoApp.perfilUsuario.modo === "AVANZADO") {
        let hoy = new Date();
        let keyHoy = obtenerKeyPeriodoDeDate(hoy);

        estadoApp.suscripciones.forEach(susc => {
            if (!susc.dividir || susc.dividir === "NO") return; // no genera deuda con nadie

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

// Calcula ingresos, gastos por método, y los 3 "disponibles" posibles de un
// mes puntual (real/proyectado para modo avanzado, básico para modo básico).
export function calcularFlujoDeMes(aSel, mSel) {
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");
    let movimientosDelMes = obtenerMovimientosDeMes(aSel, mSel);

    let ing = 0, gastosEnActo = 0, gastosCredito = 0, gastosServicio = 0, gastosLiquidacion = 0;
    let gastosFijosBasic = 0, gastosVariablesBasic = 0;

    movimientosDelMes.forEach(mov => {
        if (mov.tipo === "Ingreso") ing += mov.monto;

        // Las "liquidaciones" (cobrar/pagar una deuda, o pagar un resumen de
        // tarjeta/servicio) no son gasto diario ni fijo ni variable — son un
        // movimiento de plata aparte, que resta del Disponible sin ensuciar
        // ninguna categoría de gasto.
        let esLiquidacion = (mov.metodo === "LIQUIDACION");

        if (!esLiquidacion) {
            if (mov.tipo === "Gasto Fijo" || mov.tipo === "Enviado a Ahorros") gastosFijosBasic += mov.monto;
            if (mov.tipo === "Gasto Variable") gastosVariablesBasic += mov.monto;
        }

        if (mov.tipo !== "Ingreso" && mov.tipo !== "Cuenta Cobrar") {
            let mtd = mov.metodo || "EN_EL_ACTO";
            if(mtd === "EN_EL_ACTO") gastosEnActo += mov.monto;
            // Si ya pagaste el resumen que cubre esta cuota/servicio, no
            // vuelve a sumar en Obligaciones — esa plata ya se contó una vez,
            // como gasto real, el día que pagaste el resumen.
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
