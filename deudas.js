// ==========================================
// 🤝 GESTIÓN DE DEUDAS Y CUENTAS POR COBRAR
// ==========================================
import { estadoApp } from './estado.js';
import { generarId } from './utilidades.js';
import { mostrarConfirmacion, mostrarPrompt, mostrarAlerta } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';

export async function liquidarDeudaIndividual(idMov) {
    let mov = estadoApp.todosLosMovimientos.find(m => m.id === idMov) || estadoApp.movimientosMesGlobal.find(m => m.id === idMov);
    if(!mov) return;
    if(await mostrarConfirmacion(mov.sentido === "A_FAVOR" ? "¿Confirmas cobro? Suma al bolsillo hoy." : "¿Confirmas pago? Resta del bolsillo hoy.")) {
        if(mov.esVirtual) {
            let s = estadoApp.suscripciones.find(x => x.id === mov.idGrupo);
            if(s) { if(!s.pagosAmigo) s.pagosAmigo = []; s.pagosAmigo.push(mov.mesClave); }
        } else { mov.estado = "Saldado"; }

        let hoy = new Date().toISOString().split('T')[0];
        if(mov.sentido === "A_FAVOR") {
            // Lo que me deben nunca se contó como gasto mío (ver
            // movimientos.js), así que cobrarlo siempre es plata nueva.
            estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Ingreso", concepto: `Cobro deuda: ${mov.deudor}`, fecha: hoy, metodo: "EN_EL_ACTO" });
        } else if (mov.metodo === "EN_EL_ACTO") {
            // Con Tarjeta/Servicio, lo que debo ya se contó como Obligación
            // mía al momento de la compra — acá solo salda la deuda con la
            // persona, sin sumar un gasto nuevo (para no contar la misma
            // plata dos veces). Con En el Acto, en cambio, todavía no se
            // había registrado ningún gasto, así que se crea acá.
            estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Gasto Variable", concepto: `Pago deuda: ${mov.deudor}`, fecha: hoy, metodo: "EN_EL_ACTO" });
        }
        actualizarApp(); guardarDatosEnNube();
    }
}

export async function liquidarDeudaGlobal(persona, neto, tipoPagar) {
    if(neto === 0) return mostrarAlerta("Saldos en cero.");
    let mInput = await mostrarPrompt(`Estás por saldar deudas [${tipoPagar}] de ${persona}.\nIngresá el importe exacto:`, Math.abs(neto));
    if(!mInput) return; let mReal = parseFloat(mInput); if(isNaN(mReal) || mReal <= 0) return;

    let sel = document.getElementById('filtroMesAnio'); let [aSel, mSel] = sel.value.split('-').map(Number);
    let deudasHistoricasReales = estadoApp.todosLosMovimientos.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && new Date(m.fecha + 'T00:00:00').getFullYear() === aSel && new Date(m.fecha + 'T00:00:00').getMonth() === mSel);
    let deudasVirtualesMes = estadoApp.movimientosMesGlobal.filter(m => m.tipo === "Cuenta Cobrar" && m.estado === "Pendiente" && m.esVirtual);
    let todasLasDeudas = [...deudasHistoricasReales, ...deudasVirtualesMes];

    todasLasDeudas.forEach(m => {
        if(m.deudor === persona) {
            let condFiltro = (tipoPagar === "TODO") || (tipoPagar === "DIARIO" && m.metodo === "EN_EL_ACTO") || (tipoPagar === "FIJO" && m.metodo !== "EN_EL_ACTO");
            if (condFiltro) {
                if (m.esVirtual) { let s = estadoApp.suscripciones.find(x => x.id === m.idGrupo); if(s) { if(!s.pagosAmigo) s.pagosAmigo = []; s.pagosAmigo.push(m.mesClave); } }
                else { let r = estadoApp.todosLosMovimientos.find(x => x.id === m.id); if(r) r.estado = "Saldado"; }
            }
        }
    });

    let hoy = new Date().toISOString().split('T')[0];
    if(neto > 0) {
        // Lo que me deben nunca se contó como gasto mío, así que cobrarlo
        // siempre es plata nueva.
        estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Ingreso", concepto: `Cobro ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "EN_EL_ACTO" });
    } else if (tipoPagar !== "FIJO") {
        // "FIJO" es exclusivamente Tarjeta/Servicio, y esas obligaciones ya
        // se contaron al momento de la compra — acá solo se salda la deuda,
        // sin sumar un gasto nuevo. "DIARIO"/"TODO" sí pueden incluir En el
        // Acto (nunca contado antes), así que ahí se crea el gasto.
        estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Gasto Variable", concepto: `Pago ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "EN_EL_ACTO" });
    }
    actualizarApp(); guardarDatosEnNube();
}

export async function borrarMovimientoReal(idGrupo) {
    if(await mostrarConfirmacion("¿Eliminar para siempre esta operación y TODAS sus cuotas/deudas asociadas?", {peligroso: true})) {
        estadoApp.todosLosMovimientos = estadoApp.todosLosMovimientos.filter(m => m.idGrupo !== idGrupo);
        actualizarApp(); guardarDatosEnNube();
    }
}
export async function darDeBajaServicio(idGrupo) {
    if(await mostrarConfirmacion("¿Dar de baja este servicio a partir de ESTE mes? El historial viejo se mantiene.")) {
        let s = estadoApp.suscripciones.find(x => x.id === idGrupo); if(s) { s.mesBaja = estadoApp.keyMesActualGlobal; actualizarApp(); guardarDatosEnNube(); }
    }
}
export async function editarMontoServicio(idGrupo, montoActual) {
    let nuevo = await mostrarPrompt("Ingresá el nuevo valor a pagar desde este mes en adelante:", montoActual);
    if(!nuevo) return; let nReal = parseFloat(nuevo); if(isNaN(nReal) || nReal <= 0) return;
    let s = estadoApp.suscripciones.find(x => x.id === idGrupo); if(s) { s.montosPorMes[estadoApp.keyMesActualGlobal] = nReal; actualizarApp(); guardarDatosEnNube(); }
}
