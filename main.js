// ==========================================
// 🚀 PUNTO DE ENTRADA DE LA APP
// ==========================================
// Este archivo:
// 1) Inicializa cosas puntuales al cargar la página (fechas por defecto).
// 2) Escucha el estado de sesión de Firebase y decide qué mostrar.
// 3) Define resetearApp (la función de "blanquear todos mis datos").
// 4) Expone en "window" las funciones que el HTML llama con onclick="..."
//    (los módulos ES no exponen nada al scope global por defecto).

import { auth } from './firebase-config.js';
import { estadoApp, fechaActual } from './estado.js';
import { ocultarLoaderInicial } from './utilidades.js';
import { mostrarConfirmacion, mostrarPrompt } from './modales.js';

import {
    registrarUsuario, loginUsuario, logoutUsuario,
    cargarDatosDesdeNube, guardarDatosEnNube,
    guardarModoDesdeOnboarding, guardarCambiosDesdePerfil,
    cambiarPasswordPerfil, toggleMostrarPassword, eliminarCuenta,
    toggleMenuUsuario, abrirModalPerfil, cerrarModalPerfil,
    mostrarVistaRecuperar, volverALogin, enviarRecuperacionPassword
} from './auth.js';

import {
    evaluarCamposDinamicosGasto, toggleSelectAmigo, crearPersonaDeuda,
    agregarMovimiento
} from './movimientos.js';

import {
    inicializarMercado, toggleMovimientoInversion, evaluarCamposInversion,
    evaluarCamposRetiro, ejecutarInversionNueva, ejecutarRetiroNuevo,
    revertirMovimientoInversion, toggleModoDolar,
    ejecutarExtraccion
} from './billetera.js';

import {
    liquidarDeudaIndividual, liquidarDeudaGlobal,
    borrarMovimientoReal, darDeBajaServicio,
    abrirModalEditarServicio, toggleCamposModalEditarServicio,
    cerrarModalEditarServicio, guardarEdicionServicio
} from './deudas.js';

import { toggleSerieGrafico, setMesesAMostrar } from './grafico.js';

import { mostrarLogin, volverALanding, mostrarFeatureLanding } from './landing.js';

import { inicializarSelectorHistorico, cambiarPestaña, actualizarApp, actualizarFiltrosDetalle } from './render.js';

// --- INICIALIZACIÓN DE CAMPOS DE FECHA ---
document.getElementById('inputFecha').valueAsDate = fechaActual;
document.getElementById('invFechaNueva').valueAsDate = fechaActual;

// --- ESTADO DE SESIÓN ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('landing-section').style.display = 'none';
        document.getElementById('loader-inicial').style.display = 'flex';
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        inicializarSelectorHistorico();
        inicializarMercado();
        cargarDatosDesdeNube(user.uid);
    } else {
        // Nota: al cargar la página por primera vez sin sesión, la landing
        // queda visible (es lo que ya se ve por defecto en el HTML) y acá no
        // hace falta tocar nada. Al cerrar sesión, logoutUsuario() ya se
        // encarga de mostrar el login directamente (no la landing de nuevo).
        ocultarLoaderInicial();
        document.getElementById('main-app').style.display = 'none';
    }
});

// --- ZONA DE PELIGRO: RESET TOTAL ---
async function resetearApp() {
    if(await mostrarConfirmacion("⚠️ PELIGRO CRÍTICO: Se purgarán todos los balances de la nube.", {peligroso: true})) {
        if(await mostrarPrompt("Escribe BORRAR:") === "BORRAR") {
            estadoApp.todosLosMovimientos = []; estadoApp.suscripciones = [];
            estadoApp.patrimonio = { pesos: 0, dolares: 0 }; estadoApp.inversiones = [];
            estadoApp.sp500 = { nominales: 0 }; estadoApp.historialInversiones = [];
            estadoApp.historialMensual = {}; estadoApp.historialPesosPorMes = {};
            estadoApp.listaAmigos = [];
            estadoApp.perfilUsuario.modo = "";
            guardarDatosEnNube(); actualizarApp(); location.reload();
        }
    }
}

// ==========================================
// 🔗 EXPOSICIÓN A WINDOW
// Este archivo se carga como <script type="module">, y los módulos ES
// NO exponen sus funciones al scope global por defecto. Como el HTML
// sigue usando atributos onclick="..." / onchange="...", necesitamos
// enganchar acá las funciones que se llaman desde el markup (estático
// o generado dinámicamente en las tablas). Si en el futuro migramos a
// addEventListener, esta sección deja de ser necesaria.
// ==========================================
window.guardarModoDesdeOnboarding = guardarModoDesdeOnboarding;
window.loginUsuario = loginUsuario;
window.registrarUsuario = registrarUsuario;
window.logoutUsuario = logoutUsuario;
window.guardarCambiosDesdePerfil = guardarCambiosDesdePerfil;
window.cambiarPasswordPerfil = cambiarPasswordPerfil;
window.toggleMostrarPassword = toggleMostrarPassword;
window.eliminarCuenta = eliminarCuenta;
window.toggleMenuUsuario = toggleMenuUsuario;
window.abrirModalPerfil = abrirModalPerfil;
window.cerrarModalPerfil = cerrarModalPerfil;
window.mostrarVistaRecuperar = mostrarVistaRecuperar;
window.volverALogin = volverALogin;
window.enviarRecuperacionPassword = enviarRecuperacionPassword;
window.cambiarPestaña = cambiarPestaña;
window.actualizarApp = actualizarApp;
window.evaluarCamposDinamicosGasto = evaluarCamposDinamicosGasto;
window.agregarMovimiento = agregarMovimiento;
window.toggleSelectAmigo = toggleSelectAmigo;
window.crearPersonaDeuda = crearPersonaDeuda;
window.resetearApp = resetearApp;
window.darDeBajaServicio = darDeBajaServicio;
window.borrarMovimientoReal = borrarMovimientoReal;
window.abrirModalEditarServicio = abrirModalEditarServicio;
window.toggleCamposModalEditarServicio = toggleCamposModalEditarServicio;
window.cerrarModalEditarServicio = cerrarModalEditarServicio;
window.guardarEdicionServicio = guardarEdicionServicio;
window.liquidarDeudaIndividual = liquidarDeudaIndividual;
window.liquidarDeudaGlobal = liquidarDeudaGlobal;

// --- Inversiones (pestaña nueva) ---
window.toggleMovimientoInversion = toggleMovimientoInversion;
window.evaluarCamposInversion = evaluarCamposInversion;
window.evaluarCamposRetiro = evaluarCamposRetiro;
window.ejecutarInversionNueva = ejecutarInversionNueva;
window.ejecutarRetiroNuevo = ejecutarRetiroNuevo;
window.revertirMovimientoInversion = revertirMovimientoInversion;
window.toggleModoDolar = toggleModoDolar;
window.ejecutarExtraccion = ejecutarExtraccion;
window.toggleSerieGrafico = toggleSerieGrafico;
window.setMesesAMostrar = setMesesAMostrar;
window.actualizarFiltrosDetalle = actualizarFiltrosDetalle;

// --- Landing page ---
window.mostrarLogin = mostrarLogin;
window.volverALanding = volverALanding;
window.mostrarFeatureLanding = mostrarFeatureLanding;
