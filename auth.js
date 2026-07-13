// ==========================================
// 🔐 AUTENTICACIÓN, PERFIL Y SINCRONIZACIÓN CON FIRESTORE
// ==========================================
// Nota sobre un import circular: este archivo importa de movimientos.js
// (actualizarSelectAmigosDisplay, evaluarCamposDinamicosGasto), y movimientos.js
// a su vez importa guardarDatosEnNube desde este archivo. Es seguro: ambas
// referencias solo se usan DENTRO de funciones que corren más tarde (clicks,
// callbacks de Firestore) y nunca durante la carga inicial de los módulos.
import { auth, db } from './firebase-config.js';
import { estadoApp } from './estado.js';
import { mostrarAlerta, mostrarConfirmacion } from './modales.js';
import { ocultarLoaderInicial } from './utilidades.js';
import { actualizarApp } from './render.js';
import { actualizarSelectAmigosDisplay, evaluarCamposDinamicosGasto } from './movimientos.js';

export function registrarUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return; auth.createUserWithEmailAndPassword(email, pass).then(()=>mostrarAlerta("Creado!")).catch(e=>mostrarAlerta(e.message));
}
export function loginUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return; auth.signInWithEmailAndPassword(email, pass).catch(e=>mostrarAlerta(e.message));
}
export async function logoutUsuario() { if(await mostrarConfirmacion("¿Salir?")) auth.signOut(); }

// --- SINCRONIZACIÓN CON LA NUBE ---
export function cargarDatosDesdeNube(uid) {
    db.collection("usuarios").doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            estadoApp.todosLosMovimientos = data.todosLosMovimientos || [];
            estadoApp.suscripciones = data.suscripciones || [];
            estadoApp.patrimonio = data.patrimonio || { pesos: 0, dolares: 0 };
            estadoApp.inversiones = data.inversiones || [];
            estadoApp.listaAmigos = data.listaAmigos || [];

            if (data.perfilUsuario) {
                estadoApp.perfilUsuario = data.perfilUsuario;
            }
            // Si venía de una versión anterior que no tenía 'modo' guardado
            if (typeof estadoApp.perfilUsuario.modo === "undefined") {
                estadoApp.perfilUsuario.modo = "";
            }
        }

        document.getElementById('userNameDisplay').innerText = estadoApp.perfilUsuario.nombre;
        document.getElementById('profileNameInput').value = estadoApp.perfilUsuario.nombre;

        if (estadoApp.perfilUsuario.modo === "") {
            document.getElementById('onboarding-modal').style.display = 'flex';
        } else {
            document.getElementById('onboarding-modal').style.display = 'none';
            document.getElementById('profileModoInput').value = estadoApp.perfilUsuario.modo;
        }

        actualizarSelectAmigosDisplay();
        aplicarFiltrosDeModo();
        actualizarApp();
        ocultarLoaderInicial();
    });
}

export function guardarDatosEnNube() {
    if(auth.currentUser) db.collection("usuarios").doc(auth.currentUser.uid).set({
        todosLosMovimientos: estadoApp.todosLosMovimientos, suscripciones: estadoApp.suscripciones,
        patrimonio: estadoApp.patrimonio, inversiones: estadoApp.inversiones, listaAmigos: estadoApp.listaAmigos, perfilUsuario: estadoApp.perfilUsuario
    }, { merge: true });
}

// --- PERFIL Y MODOS (BÁSICO / AVANZADO) ---
export function guardarModoDesdeOnboarding(modoElegido) {
    estadoApp.perfilUsuario.modo = modoElegido;
    document.getElementById('onboarding-modal').style.display = 'none';
    document.getElementById('profileModoInput').value = modoElegido;
    guardarDatosEnNube();
}

export function guardarCambiosDesdePerfil() {
    let n = document.getElementById('profileNameInput').value;
    if(n) estadoApp.perfilUsuario.nombre = n;

    estadoApp.perfilUsuario.modo = document.getElementById('profileModoInput').value;

    guardarDatosEnNube();
    aplicarFiltrosDeModo();
    actualizarApp();
    mostrarAlerta("Perfil actualizado correctamente.");
}

export function guardarNombrePerfil() {
    guardarCambiosDesdePerfil();
}

export function aplicarFiltrosDeModo() {
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");

    if (esAvanzado) {
        document.body.classList.remove('modo-basico');
    } else {
        document.body.classList.add('modo-basico');

        // Si estaba parado en la pestaña Detalles, lo devuelvo al inicio
        if (document.getElementById('tab-detalle-gastos').classList.contains('active')) {
            document.querySelector('.tab-button').click();
        }
    }

    document.getElementById('lblConceptoTexto').innerText = esAvanzado ? "Texto" : "Concepto";
    document.getElementById('inputConcepto').placeholder = esAvanzado ? "Ej: Compra Coto, Cena..." : "Ej: Sueldo, Supermercado...";

    if(!esAvanzado) {
        document.getElementById('tituloDeudaUnica').style.display = "block";
        document.getElementById('tablaDeudaUnica').style.display = "block";
    } else {
        document.getElementById('tituloDeudaUnica').style.display = "none";
        document.getElementById('tablaDeudaUnica').style.display = "none";
    }

    evaluarCamposDinamicosGasto();
}

export function togglePerfilPanel() {
    let p = document.getElementById('profile-section');
    p.style.display = p.style.display === "block" ? "none" : "block";
}
export async function cambiarPasswordPerfil() {
    let n = document.getElementById('profilePasswordInput').value;
    if(n.length < 6) return mostrarAlerta("Mínimo 6 chars");
    auth.currentUser.updatePassword(n).then(() => { mostrarAlerta("Clave cambiada"); togglePerfilPanel(); }).catch(()=>mostrarAlerta("Volvé a iniciar sesión"));
}
