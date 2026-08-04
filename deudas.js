// ==========================================
// 🤝 GESTIÓN DE DEUDAS Y CUENTAS POR COBRAR
// ==========================================
import { estadoApp } from './estado.js';
import { generarId, agruparMovimientosPorGrupo } from './utilidades.js';
import { mostrarConfirmacion, mostrarPrompt, mostrarAlerta } from './modales.js';
import { actualizarApp } from './render.js';
import { guardarDatosEnNube } from './auth.js';
import { obtenerTodasLasDeudasPendientes, calcularMiParteSuscripcion } from './flujoMensual.js';
import { obtenerKeyPeriodoDeFecha } from './periodo.js';

// --- PAGAR RESUMEN (TARJETA O SERVICIO) ---
// Las cuotas/servicios individuales ya se ven en Obligaciones (se devengan
// solos cada mes), pero eso NO resta del Disponible — porque todavía no los
// pagaste. Esto es lo que sí resta: el pago real del resumen, el día que
// efectivamente sale la plata de tu bolsillo — y de paso marca esas
// cuotas/ese servicio como pagados, para que no vuelvan a sumar en
// Obligaciones este mes (sin esto, se contaría la misma plata dos veces).
export function abrirModalPagarResumen() {
    let selTarjeta = document.getElementById('resumenTarjeta'); selTarjeta.innerHTML = '';
    estadoApp.listaTarjetas.forEach(t => { let o = document.createElement('option'); o.value = t; o.text = t; selTarjeta.appendChild(o); });

    let selServicio = document.getElementById('resumenServicio'); selServicio.innerHTML = '';
    estadoApp.suscripciones.forEach(s => { let o = document.createElement('option'); o.value = s.id; o.text = s.concepto; selServicio.appendChild(o); });

    if (estadoApp.listaTarjetas.length === 0 && estadoApp.suscripciones.length === 0) {
        return mostrarAlerta("Todavía no cargaste ninguna tarjeta ni servicio.");
    }
    document.getElementById('resumenTipo').value = estadoApp.listaTarjetas.length > 0 ? 'TARJETA' : 'SERVICIO';
    document.getElementById('resumenFecha').valueAsDate = new Date();
    toggleResumenTipo();
    document.getElementById('modal-pagar-resumen').style.display = 'flex';
}

export function toggleResumenTipo() {
    let esTarjeta = document.getElementById('resumenTipo').value === 'TARJETA';
    document.getElementById('boxResumenTarjeta').style.display = esTarjeta ? 'block' : 'none';
    document.getElementById('boxResumenServicio').style.display = esTarjeta ? 'none' : 'block';
    sugerirMontoResumen();
}

export function sugerirMontoResumen() {
    let esTarjeta = document.getElementById('resumenTipo').value === 'TARJETA';
    let sugerido = 0;
    if (esTarjeta) {
        let tarjeta = document.getElementById('resumenTarjeta').value;
        let gruposUI = agruparMovimientosPorGrupo(estadoApp.movimientosMesGlobal);
        sugerido = Object.values(gruposUI)
            .filter(mov => mov.metodo === "CREDITO" && mov.tarjeta === tarjeta && !mov.pagado)
            .reduce((acc, mov) => acc + mov.montoTotalAgrupado, 0);
    } else {
        let idServicio = document.getElementById('resumenServicio').value;
        let susc = estadoApp.suscripciones.find(s => s.id === idServicio);
        if (susc) sugerido = calcularMiParteSuscripcion(susc, estadoApp.keyMesActualGlobal);
    }
    document.getElementById('resumenMonto').value = sugerido.toFixed(2);
}

export function cerrarModalPagarResumen() {
    document.getElementById('modal-pagar-resumen').style.display = 'none';
}

export function confirmarPagoResumen() {
    let esTarjeta = document.getElementById('resumenTipo').value === 'TARJETA';
    let monto = parseFloat(document.getElementById('resumenMonto').value);
    let fecha = document.getElementById('resumenFecha').value;
    if (!monto || monto <= 0) return mostrarAlerta("Ingresá un monto válido");
    if (!fecha) return mostrarAlerta("Elegí una fecha");

    let nombreParaConcepto = "";
    if (esTarjeta) {
        let tarjeta = document.getElementById('resumenTarjeta').value;
        nombreParaConcepto = tarjeta;
        // No dejamos pagar de nuevo si ya no queda ninguna cuota pendiente de
        // esa tarjeta este mes — evita pagar la misma plata dos veces.
        let hayPendientes = estadoApp.todosLosMovimientos.some(mov =>
            mov.metodo === "CREDITO" && mov.tarjeta === tarjeta && !mov.pagado && obtenerKeyPeriodoDeFecha(mov.fecha) === estadoApp.keyMesActualGlobal
        );
        if (!hayPendientes) return mostrarAlerta(`Ya no hay cuotas pendientes de "${tarjeta}" este mes — no se puede pagar de nuevo.`);

        // Marcamos como pagadas todas las cuotas de esa tarjeta del mes que
        // estás mirando — dejan de sumar en Obligaciones desde ahora.
        estadoApp.todosLosMovimientos.forEach(mov => {
            if (mov.metodo === "CREDITO" && mov.tarjeta === tarjeta && !mov.pagado && obtenerKeyPeriodoDeFecha(mov.fecha) === estadoApp.keyMesActualGlobal) {
                mov.pagado = true;
            }
        });
    } else {
        let idServicio = document.getElementById('resumenServicio').value;
        let susc = estadoApp.suscripciones.find(s => s.id === idServicio);
        if (!susc) return mostrarAlerta("No se encontró ese servicio.");
        if (susc.pagosResumen && susc.pagosResumen.includes(estadoApp.keyMesActualGlobal)) {
            return mostrarAlerta(`Ya pagaste "${susc.concepto}" este mes — no se puede pagar de nuevo.`);
        }
        nombreParaConcepto = susc.concepto;
        if (!susc.pagosResumen) susc.pagosResumen = [];
        susc.pagosResumen.push(estadoApp.keyMesActualGlobal);
    }

    estadoApp.todosLosMovimientos.push({
        id: generarId(), idGrupo: generarId(), monto, tipo: "Gasto Variable",
        concepto: `Pago resumen: ${nombreParaConcepto}`, fecha, metodo: "LIQUIDACION", esVirtual: false
    });

    cerrarModalPagarResumen();
    actualizarApp(); guardarDatosEnNube();
}

// Paga un solo servicio con un clic (sin pasar por el modal) — usa el monto
// que le corresponde a este mes, y queda bloqueado hasta el mes que viene.
export async function pagarServicioIndividual(idGrupo) {
    let susc = estadoApp.suscripciones.find(s => s.id === idGrupo);
    if (!susc) return;
    if (susc.pagosResumen && susc.pagosResumen.includes(estadoApp.keyMesActualGlobal)) {
        return mostrarAlerta(`Ya pagaste "${susc.concepto}" este mes.`);
    }
    let monto = calcularMiParteSuscripcion(susc, estadoApp.keyMesActualGlobal);
    if (!monto || monto <= 0) return mostrarAlerta("No hay ningún monto pendiente para este servicio este mes.");

    if (!(await mostrarConfirmacion(`¿Pagar "${susc.concepto}" por $${monto.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}?`))) return;

    if (!susc.pagosResumen) susc.pagosResumen = [];
    susc.pagosResumen.push(estadoApp.keyMesActualGlobal);

    let hoy = new Date().toISOString().split('T')[0];
    estadoApp.todosLosMovimientos.push({
        id: generarId(), idGrupo: generarId(), monto, tipo: "Gasto Variable",
        concepto: `Pago resumen: ${susc.concepto}`, fecha: hoy, metodo: "LIQUIDACION", esVirtual: false
    });

    actualizarApp(); guardarDatosEnNube();
}

// Paga TODOS los servicios pendientes de este mes de un tirón, en un solo
// movimiento — a los que ya estén pagados no los vuelve a tocar.
export async function pagarTodosLosServicios() {
    let pendientes = estadoApp.suscripciones
        .map(susc => ({ susc, monto: calcularMiParteSuscripcion(susc, estadoApp.keyMesActualGlobal) }))
        .filter(({ susc, monto }) => monto > 0 && !(susc.pagosResumen && susc.pagosResumen.includes(estadoApp.keyMesActualGlobal)));

    if (pendientes.length === 0) return mostrarAlerta("No hay ningún servicio pendiente de pago este mes.");

    let total = pendientes.reduce((acc, p) => acc + p.monto, 0);
    let nombres = pendientes.map(p => p.susc.concepto).join(", ");
    if (!(await mostrarConfirmacion(`¿Pagar ${pendientes.length} servicio(s) (${nombres}) por un total de $${total.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}?`))) return;

    pendientes.forEach(({ susc }) => {
        if (!susc.pagosResumen) susc.pagosResumen = [];
        susc.pagosResumen.push(estadoApp.keyMesActualGlobal);
    });

    let hoy = new Date().toISOString().split('T')[0];
    estadoApp.todosLosMovimientos.push({
        id: generarId(), idGrupo: generarId(), monto: total, tipo: "Gasto Variable",
        concepto: `Pago resumen: ${pendientes.length} servicios`, fecha: hoy, metodo: "LIQUIDACION", esVirtual: false
    });

    actualizarApp(); guardarDatosEnNube();
}

// --- ARREGLAR DATOS VIEJOS (cuotas cargadas antes de tener tarjeta/pagado) ---

// Le asigna una tarjeta a TODAS las cuotas de una misma compra (pasadas y
// futuras) — útil para compras viejas que se cargaron antes de que existiera
// el campo Tarjeta, y que por eso "Pagar Resumen" nunca podía encontrar.
export async function asignarTarjetaAGrupo(idGrupo) {
    let sugerida = estadoApp.listaTarjetas[0] || '';
    let nombre = await mostrarPrompt("¿Con qué tarjeta se pagó esta compra?", sugerida);
    if (!nombre) return;
    nombre = nombre.trim();
    if (!nombre) return;

    if (!estadoApp.listaTarjetas.includes(nombre)) estadoApp.listaTarjetas.push(nombre);

    let cuotasActualizadas = 0;
    estadoApp.todosLosMovimientos.forEach(mov => {
        if (mov.idGrupo === idGrupo && mov.metodo === "CREDITO") {
            mov.tarjeta = nombre;
            cuotasActualizadas++;
        }
    });

    actualizarApp(); guardarDatosEnNube();
    mostrarAlerta(`Listo, se asignó "${nombre}" a ${cuotasActualizadas} cuota(s) de esta compra.`);
}

// Marca UNA cuota puntual como ya pagada, sin generar ningún gasto nuevo —
// para corregir el registro cuando en la vida real ya la pagaste (por
// ejemplo, con un resumen que se pagó antes de que existiera esta función),
// pero la app no llegó a marcarla sola.
export async function marcarCuotaComoPagada(id) {
    let mov = estadoApp.todosLosMovimientos.find(m => m.id === id);
    if (!mov) return;
    if (!(await mostrarConfirmacion(`¿Marcar "${mov.concepto}" como ya pagada? Esto no resta del Disponible de nuevo — es solo para corregir el registro si ya la pagaste antes.`))) return;

    mov.pagado = true;
    actualizarApp(); guardarDatosEnNube();
}

// --- MODAL EXPORTAR EXCEL (con filtros) ---
export function abrirModalExportarExcel() {
    let sel = document.getElementById('exportPersona'); sel.innerHTML = '<option value="TODAS">Todas</option>';
    estadoApp.listaAmigos.forEach(am => { let o = document.createElement('option'); o.value = am; o.text = am; sel.appendChild(o); });
    document.getElementById('chkExportDiarias').checked = true;
    document.getElementById('chkExportFijas').checked = true;
    document.getElementById('chkExportFijasTodosMeses').checked = false;
    toggleExportFijasTodosMeses();
    document.getElementById('modal-exportar-excel').style.display = 'flex';
}

export function cerrarModalExportarExcel() {
    document.getElementById('modal-exportar-excel').style.display = 'none';
}

export function toggleExportFijasTodosMeses() {
    let incluirFijas = document.getElementById('chkExportFijas').checked;
    document.getElementById('boxExportFijasTodosMeses').style.display = incluirFijas ? 'block' : 'none';
}

// Arma un Excel (.xlsx) con el detalle de Cuentas por Cobrar que coincida con
// los filtros elegidos, para poder compartirlo. Se genera todo en el
// navegador con SheetJS (cargada en index.html) — no hace falta servidor.
export function confirmarDescargaExcel() {
    let persona = document.getElementById('exportPersona').value;
    let incluirDiarias = document.getElementById('chkExportDiarias').checked;
    let incluirFijas = document.getElementById('chkExportFijas').checked;
    let fijasTodosMeses = document.getElementById('chkExportFijasTodosMeses').checked;
    if (!incluirDiarias && !incluirFijas) return mostrarAlerta("Elegí incluir Diarias, Fijas, o ambas.");

    let sel = document.getElementById('filtroMesAnio');
    let [aSel, mSel] = sel.value.split('-').map(Number);
    let keySel = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;

    let filtradas = obtenerTodasLasDeudasPendientes().filter(d => {
        let esDiaria = d.metodo === "EN_EL_ACTO";
        if (esDiaria && !incluirDiarias) return false;
        if (!esDiaria && !incluirFijas) return false;
        // Las Fijas se devengan mes a mes, así que por defecto solo se
        // incluyen las del mes que estás mirando arriba (a menos que se
        // tilde "incluir todos los meses pendientes").
        if (!esDiaria && !fijasTodosMeses && obtenerKeyPeriodoDeFecha(d.fecha) !== keySel) return false;
        if (persona !== 'TODAS' && d.deudor !== persona) return false;
        return true;
    });
    if (filtradas.length === 0) return mostrarAlerta("No hay deudas que coincidan con esos filtros.");

    let filas = [...filtradas].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(d => ({
        "Fecha": d.fecha,
        "Concepto": d.concepto,
        "Tipo": d.metodo === "EN_EL_ACTO" ? "Diario" : "Fijo (Tarjeta/Servicio)",
        "Monto": d.sentido === "EN_CONTRA" ? -d.monto : d.monto
    }));

    let hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 20 }, { wch: 14 }];
    let libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Cuentas por Cobrar");

    let hoy = new Date().toISOString().split('T')[0];
    XLSX.writeFile(libro, `cuentas_por_cobrar_${hoy}.xlsx`);
    cerrarModalExportarExcel();
}

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
            estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Ingreso", concepto: `Cobro deuda: ${mov.deudor}`, fecha: hoy, metodo: "LIQUIDACION" });
        } else if (mov.metodo === "EN_EL_ACTO") {
            // Con Tarjeta/Servicio, lo que debo ya se contó como Obligación
            // mía al momento de la compra — acá solo salda la deuda con la
            // persona, sin sumar un gasto nuevo (para no contar la misma
            // plata dos veces). Con En el Acto, en cambio, todavía no se
            // había registrado ningún gasto, así que se crea acá.
            estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mov.monto, tipo: "Gasto Variable", concepto: `Pago deuda: ${mov.deudor}`, fecha: hoy, metodo: "LIQUIDACION" });
        }
        actualizarApp(); guardarDatosEnNube();
    }
}

export async function liquidarDeudaGlobal(persona, neto, tipoPagar) {
    if(neto === 0) return mostrarAlerta("Saldos en cero.");
    let mInput = await mostrarPrompt(`Estás por saldar deudas [${tipoPagar}] de ${persona}.\nIngresá el importe exacto:`, Math.abs(neto));
    if(!mInput) return; let mReal = parseFloat(mInput); if(isNaN(mReal) || mReal <= 0) return;

    // Saldamos entre las deudas pendientes con esa persona: las "Diarias"
    // (En el Acto) sin importar el mes en que se originaron, pero las
    // "Fijas" (Tarjeta/Servicio) solo las del mes que está filtrado arriba
    // — se devengan mes a mes como cargos separados.
    let sel = document.getElementById('filtroMesAnio'); let [aSel, mSel] = sel.value.split('-').map(Number);
    let keySel = `${aSel}-${(mSel + 1).toString().padStart(2, '0')}`;
    let todasLasDeudas = obtenerTodasLasDeudasPendientes();

    todasLasDeudas.forEach(m => {
        if(m.deudor === persona) {
            let esDiario = (m.metodo === "EN_EL_ACTO");
            let esTarjeta = (m.metodo === "CREDITO");
            let esServicio = (m.metodo === "SERVICIO");
            let esDelMesFiltrado = obtenerKeyPeriodoDeFecha(m.fecha) === keySel;
            let condFiltro = (tipoPagar === "TODO" && (esDiario || esDelMesFiltrado))
                || (tipoPagar === "DIARIO" && esDiario)
                || (tipoPagar === "TARJETA" && esTarjeta && esDelMesFiltrado)
                || (tipoPagar === "SERVICIO" && esServicio && esDelMesFiltrado);
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
        estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Ingreso", concepto: `Cobro ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "LIQUIDACION" });
    } else if (tipoPagar === "DIARIO" || tipoPagar === "TODO") {
        // "TARJETA"/"SERVICIO"/"FIJO" son cuotas ya devengadas y se
        // contaron al momento de la compra — acá solo se salda la deuda,
        // sin sumar un gasto nuevo. "DIARIO"/"TODO" sí pueden incluir En el
        // Acto (nunca contado antes), así que ahí se crea el gasto.
        estadoApp.todosLosMovimientos.push({ id: generarId(), idGrupo: generarId(), monto: mReal, tipo: "Gasto Variable", concepto: `Pago ${tipoPagar}: ${persona}`, fecha: hoy, metodo: "LIQUIDACION" });
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
// --- MODAL EDITAR SERVICIO ---
// Antes esto era un simple prompt para cambiar el monto; ahora es un modal
// que permite editar nombre, tipo, monto, débito automático y la división
// del pago (con quién y cómo se reparte), todo en un solo lugar.
let idGrupoEnEdicion = null;

export function abrirModalEditarServicio(idGrupo) {
    let s = estadoApp.suscripciones.find(x => x.id === idGrupo);
    if (!s) return;
    idGrupoEnEdicion = idGrupo;

    document.getElementById('editServNombre').value = s.concepto;
    document.getElementById('editServTipo').value = s.tipo;
    document.getElementById('editServDebito').value = s.debito || "NO";
    document.getElementById('editServDividir').value = s.dividir || "NO";

    // El monto que se edita es el vigente para el mes que se está viendo.
    let dKeys = Object.keys(s.montosPorMes).sort();
    let montoVigente = s.montosPorMes[dKeys[dKeys.length - 1]];
    document.getElementById('editServMonto').value = montoVigente;

    let selAmigo = document.getElementById('editServAmigo');
    selAmigo.innerHTML = '';
    estadoApp.listaAmigos.forEach(am => { let o = document.createElement('option'); o.value = am; o.text = am; selAmigo.appendChild(o); });
    selAmigo.value = s.amigo || '';

    toggleCamposModalEditarServicio();
    document.getElementById('modal-editar-servicio').style.display = 'flex';
}

export function toggleCamposModalEditarServicio() {
    let dividir = document.getElementById('editServDividir').value;
    document.getElementById('boxEditServAmigo').style.display = dividir !== "NO" ? 'block' : 'none';
}

export function cerrarModalEditarServicio() {
    document.getElementById('modal-editar-servicio').style.display = 'none';
    idGrupoEnEdicion = null;
}

export function guardarEdicionServicio() {
    if (!idGrupoEnEdicion) return;
    let s = estadoApp.suscripciones.find(x => x.id === idGrupoEnEdicion);
    if (!s) return;

    let nombre = document.getElementById('editServNombre').value.trim();
    let monto = parseFloat(document.getElementById('editServMonto').value);
    let dividir = document.getElementById('editServDividir').value;
    let amigo = document.getElementById('editServAmigo').value;
    if (!nombre) return mostrarAlerta("Ingresá un nombre");
    if (!monto || monto <= 0) return mostrarAlerta("Ingresá un monto válido");
    if (dividir !== "NO" && !amigo) return mostrarAlerta("Elegí una persona para dividir");

    s.concepto = nombre;
    s.tipo = document.getElementById('editServTipo').value;
    s.debito = document.getElementById('editServDebito').value;
    s.dividir = dividir;
    s.amigo = dividir !== "NO" ? amigo : "";
    s.montosPorMes[estadoApp.keyMesActualGlobal] = monto;

    cerrarModalEditarServicio();
    actualizarApp(); guardarDatosEnNube();
}
