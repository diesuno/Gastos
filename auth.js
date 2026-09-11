// ==========================================
// 🔐 AUTENTICACIÓN, PERFIL Y SINCRONIZACIÓN CON FIRESTORE
// ==========================================
import { auth, db } from './firebase-config.js';
import { estadoApp } from './estado.js';
import { mostrarAlerta, mostrarConfirmacion, mostrarPrompt } from './modales.js';
import { ocultarLoaderInicial } from './utilidades.js';
import { actualizarApp } from './render.js';
import { actualizarSelectAmigosDisplay, evaluarCamposDinamicosGasto } from './movimientos.js';
import { reconstruirHistorialPesos } from './cierreMensual.js';

function traducirErrorAuth(e) {
    const mensajes = {
        'auth/wrong-password': 'La contraseña es incorrecta.',
        'auth/user-not-found': 'No existe ninguna cuenta con ese email.',
        'auth/invalid-email': 'Ese email no es válido.',
        'auth/email-already-in-use': 'Ya existe una cuenta con ese email — probá iniciar sesión.',
        'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiados intentos seguidos. Esperá un momento y volvé a probar.',
        'auth/invalid-credential': 'Email o contraseña incorrectos.',
        'auth/requires-recent-login': 'Por seguridad, cerrá sesión y volvé a entrar antes de hacer esto.',
        'auth/missing-email': 'Escribí tu email primero.',
    };
    return mensajes[e.code] || e.message;
}

export function abrirModalRegistro() {
    document.getElementById('regNombre').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regPasswordConfirmar').value = '';
    document.getElementById('modal-registro').style.display = 'flex';
}
export function cerrarModalRegistro() {
    document.getElementById('modal-registro').style.display = 'none';
}

export function registrarUsuario() {
    const nombre = document.getElementById('regNombre').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value;
    const passConfirmar = document.getElementById('regPasswordConfirmar').value;

if (!nombre || !email || !pass || !passConfirmar) return mostrarAlerta("Completá todos los campos.");
    if (pass.length < 8) return mostrarAlerta("La contraseña tiene que tener al menos 8 caracteres.");
    if (pass !== passConfirmar) return mostrarAlerta("Las contraseñas no coinciden. Volvé a escribirlas.");

auth.createUserWithEmailAndPassword(email, pass)
    .then(() => {
        estadoApp.perfilUsuario.nombre = nombre;
        guardarDatosEnNube();
        cerrarModalRegistro();
        mostrarAlerta("¡Cuenta creada!");
    })
    .catch(e => mostrarAlerta(traducirErrorAuth(e)));
}

export function loginUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return mostrarAlerta("Completá el email y la contraseña.");
    auth.signInWithEmailAndPassword(email, pass).catch(e=>mostrarAlerta(traducirErrorAuth(e)));
}
export async function logoutUsuario() { if(await mostrarConfirmacion("¿Salir?")) auth.signOut(); }

const SVG_OJO_ABIERTO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_OJO_TACHADO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

export function toggleMostrarPassword() {
    let input = document.getElementById('authPassword');
    let boton = document.getElementById('btnMostrarPassword');
    let vaAMostrarla = input.type === 'password';
    input.type = vaAMostrarla ? 'text' : 'password';
    boton.innerHTML = vaAMostrarla ? SVG_OJO_TACHADO : SVG_OJO_ABIERTO;
    boton.setAttribute('aria-label', vaAMostrarla ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

function toggleMostrarCampoPassword(idInput, idBoton) {
    let input = document.getElementById(idInput);
    let boton = document.getElementById(idBoton);
    let vaAMostrarla = input.type === 'password';
    input.type = vaAMostrarla ? 'text' : 'password';
    boton.innerHTML = vaAMostrarla ? SVG_OJO_TACHADO : SVG_OJO_ABIERTO;
    boton.setAttribute('aria-label', vaAMostrarla ? 'Ocultar contraseña' : 'Mostrar contraseña');
}
export function toggleMostrarRegPassword() { toggleMostrarCampoPassword('regPassword', 'btnMostrarRegPassword'); }
export function toggleMostrarRegPasswordConfirmar() { toggleMostrarCampoPassword('regPasswordConfirmar', 'btnMostrarRegPasswordConfirmar'); }

export function toggleMenuUsuario() {
    let dropdown = document.getElementById('userMenuDropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', (e) => {
    let menu = document.querySelector('.user-menu');
    let dropdown = document.getElementById('userMenuDropdown');
    if (dropdown && dropdown.style.display === 'block' && menu && !menu.contains(e.target)) dropdown.style.display = 'none';
});

export function abrirModalPerfil() { document.getElementById('modal-perfil').style.display = 'flex'; }
export function cerrarModalPerfil() { document.getElementById('modal-perfil').style.display = 'none'; }

export function mostrarVistaRecuperar() {
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-recover-view').style.display = 'block';
    document.getElementById('auth-recover-form').style.display = 'block';
    document.getElementById('auth-recover-exito').style.display = 'none';
    let emailLogin = document.getElementById('authEmail').value.trim();
    if (emailLogin) document.getElementById('recoverEmail').value = emailLogin;
}
export function volverALogin() {
    document.getElementById('auth-recover-view').style.display = 'none';
    document.getElementById('auth-login-view').style.display = 'block';
}
export function enviarRecuperacionPassword() {
    let email = document.getElementById('recoverEmail').value.trim();
    if (!email) return mostrarAlerta("Escribí tu email.");
    auth.sendPasswordResetEmail(email)
    .then(() => { document.getElementById('auth-recover-form').style.display = 'none'; document.getElementById('auth-recover-exito').style.display = 'block'; })
    .catch(e => mostrarAlerta(traducirErrorAuth(e)));
}

function actualizarPerfilEnSidebar() {
    let nombre = estadoApp.perfilUsuario.nombre || "Usuario";
    let elNombre = document.getElementById('sbNombreUsuario');
    let elAvatar = document.getElementById('sbAvatarInicial');
    if (elNombre) elNombre.innerText = nombre;
    if (elAvatar) elAvatar.innerText = nombre.trim().charAt(0).toUpperCase() || "U";
document.body.classList.add('logueado');
}

// oyente activo de Firestore (se guarda para poder desconectarlo antes de crear uno nuevo)
let desconectarOyenteDatos = null;

export function cargarDatosDesdeNube(uid) {
    // FIX: desconectar el oyente anterior si existe (evita duplicados al renovar token)
if (desconectarOyenteDatos) {
    desconectarOyenteDatos();
    desconectarOyenteDatos = null;
}

const unsubscribe = db.collection("usuarios").doc(uid).onSnapshot(doc => {
    try {
        if (doc.metadata.hasPendingWrites) return;
        if (doc.exists) {
            const data = doc.data();
            estadoApp.todosLosMovimientos = data.todosLosMovimientos || [];
            estadoApp.suscripciones = data.suscripciones || [];
            estadoApp.patrimonio = data.patrimonio || { pesos: 0, dolares: 0 };
            estadoApp.inversiones = data.inversiones || [];
            estadoApp.listaAmigos = data.listaAmigos || [];
            estadoApp.listaTarjetas = data.listaTarjetas || [];
            if (data.perfilUsuario) estadoApp.perfilUsuario = data.perfilUsuario;
            if (typeof estadoApp.perfilUsuario.modo === "undefined") estadoApp.perfilUsuario.modo = "";
            estadoApp.sp500 = data.sp500 || { nominales: 0 };
            let entradasSpViejas = estadoApp.inversiones.filter(inv => inv.instrumento === "S&P 500");
            if (entradasSpViejas.length > 0) {
                entradasSpViejas.forEach(inv => { estadoApp.sp500.nominales += (inv.nominales || 0); });
                estadoApp.inversiones = estadoApp.inversiones.filter(inv => inv.instrumento !== "S&P 500");
            }
            estadoApp.historialInversiones = data.historialInversiones || [];
            estadoApp.historialMensual = data.historialMensual || {};
            if (data.cotizacionCedear) estadoApp.mercado.spy_ars = data.cotizacionCedear;
        }

    actualizarPerfilEnSidebar();
        document.getElementById('profileNameInput').value = estadoApp.perfilUsuario.nombre;
        let diaCobro = estadoApp.perfilUsuario.diaCobro || 0;
        document.getElementById('chkCicloPersonalizado').checked = diaCobro > 0;
        document.getElementById('inputDiaCobro').value = diaCobro > 0 ? diaCobro : '';
        toggleCampoDiaCobro();

    if (estadoApp.perfilUsuario.modo === "") {
        document.getElementById('onboarding-modal').style.display = 'flex';
    } else {
        document.getElementById('onboarding-modal').style.display = 'none';
        document.getElementById('profileModoInput').value = estadoApp.perfilUsuario.modo;
    }

    actualizarSelectAmigosDisplay();
        aplicarFiltrosDeModo();
        if (reconstruirHistorialPesos()) guardarDatosEnNube();
        actualizarApp();
    } catch(err) {
        console.error('Error al procesar datos de Firestore:', err);
        mostrarAlerta('Hubo un problema al cargar tus datos. Recargá la página.');
    } finally {
        ocultarLoaderInicial();
    }
}, err => {
    console.error('Error en onSnapshot:', err);
    ocultarLoaderInicial();
});

desconectarOyenteDatos = unsubscribe;
}

export function guardarDatosEnNube() {
    if(auth.currentUser) db.collection("usuarios").doc(auth.currentUser.uid).set({
        todosLosMovimientos: estadoApp.todosLosMovimientos, suscripciones: estadoApp.suscripciones,
        patrimonio: estadoApp.patrimonio, inversiones: estadoApp.inversiones, listaAmigos: estadoApp.listaAmigos,
        listaTarjetas: estadoApp.listaTarjetas, perfilUsuario: estadoApp.perfilUsuario,
        sp500: estadoApp.sp500, historialInversiones: estadoApp.historialInversiones,
        historialMensual: estadoApp.historialMensual, cotizacionCedear: estadoApp.mercado.spy_ars
    }, { merge: true });
}

export function guardarModoDesdeOnboarding(modoElegido) {
    estadoApp.perfilUsuario.modo = modoElegido;
    document.getElementById('onboarding-modal').style.display = 'none';
    document.getElementById('profileModoInput').value = modoElegido;
    guardarDatosEnNube();
}

export function toggleCampoDiaCobro() {
    let activo = document.getElementById('chkCicloPersonalizado').checked;
    document.getElementById('boxDiaCobro').style.display = activo ? 'block' : 'none';
}

export function guardarCambiosDesdePerfil() {
    let n = document.getElementById('profileNameInput').value;
    if(n) estadoApp.perfilUsuario.nombre = n;
    estadoApp.perfilUsuario.modo = document.getElementById('profileModoInput').value;
    let cicloActivo = document.getElementById('chkCicloPersonalizado').checked;
    if (cicloActivo) {
        let dia = parseInt(document.getElementById('inputDiaCobro').value, 10);
        if (!dia || dia < 1 || dia > 28) return mostrarAlerta("El día de cobro tiene que ser un número entre 1 y 28.");
        estadoApp.perfilUsuario.diaCobro = dia;
    } else {
        estadoApp.perfilUsuario.diaCobro = 0;
    }
    guardarDatosEnNube();
    aplicarFiltrosDeModo();
    actualizarApp();
    actualizarPerfilEnSidebar();
    mostrarAlerta("Perfil actualizado correctamente.");
}
export function guardarNombrePerfil() { guardarCambiosDesdePerfil(); }

export function aplicarFiltrosDeModo() {
    let esAvanzado = (estadoApp.perfilUsuario.modo === "AVANZADO");
    if (esAvanzado) {
        document.body.classList.remove('modo-basico');
    } else {
        document.body.classList.add('modo-basico');
        if (document.getElementById('tab-detalle-gastos').classList.contains('active')) {
            document.querySelector('.sb-link').click();
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

export async function cambiarPasswordPerfil() {
    let n = document.getElementById('profilePasswordInput').value;
    if(n.length < 6) return mostrarAlerta("Mínimo 6 chars");
    auth.currentUser.updatePassword(n).then(() => { mostrarAlerta("Clave cambiada"); document.getElementById('profilePasswordInput').value = ''; }).catch(e => mostrarAlerta(traducirErrorAuth(e)));
}

export async function eliminarCuenta() {
    if (!(await mostrarConfirmacion("⚠️ Esto va a eliminar tu cuenta y TODOS tus datos para siempre. No se puede deshacer.", {peligroso: true}))) return;
    let confirmacion = await mostrarPrompt("Para confirmar, escribí ELIMINAR:");
    if (confirmacion !== "ELIMINAR") return;

// FIX: reautenticar antes de borrar para evitar que el proceso quede a medias
let user = auth.currentUser;
    if (!user) return;
    let passActual = await mostrarPrompt("Por seguridad, ingresá tu contraseña actual:");
    if (!passActual) return;

try {
    let credencial = firebase.auth.EmailAuthProvider.credential(user.email, passActual);
    await user.reauthenticateWithCredential(credencial);
    await db.collection("usuarios").doc(user.uid).delete();
    await user.delete();
    mostrarAlerta("Tu cuenta fue eliminada. ¡Gracias por haber usado la app!");
} catch (e) {
    mostrarAlerta(traducirErrorAuth(e));
}
}

export function exportarDatosDiagnostico() {
    let datos = {
        exportadoEl: new Date().toISOString(),
        perfilUsuario: estadoApp.perfilUsuario,
        patrimonio: estadoApp.patrimonio,
        todosLosMovimientos: estadoApp.todosLosMovimientos,
        suscripciones: estadoApp.suscripciones,
        inversiones: estadoApp.inversiones,
        sp500: estadoApp.sp500,
        historialInversiones: estadoApp.historialInversiones,
        historialMensual: estadoApp.historialMensual,
        listaAmigos: estadoApp.listaAmigos,
        listaTarjetas: estadoApp.listaTarjetas,
        cotizacionCedear: estadoApp.mercado.spy_ars
    };
    let blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    let hoy = new Date().toISOString().split('T')[0];
    a.href = url; a.download = `mis_datos_finanzas_${hoy}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}
