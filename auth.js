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
import { mostrarAlerta, mostrarConfirmacion, mostrarPrompt } from './modales.js';
import { ocultarLoaderInicial } from './utilidades.js';
import { actualizarApp } from './render.js';
import { actualizarSelectAmigosDisplay, evaluarCamposDinamicosGasto } from './movimientos.js';
import { reconstruirHistorialPesos } from './cierreMensual.js';

// Traduce los códigos de error de Firebase Auth a mensajes que una persona
// sin conocimientos técnicos pueda entender (por defecto son textos en
// inglés bastante crípticos).
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

export function registrarUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return mostrarAlerta("Completá el email y la contraseña.");
    auth.createUserWithEmailAndPassword(email, pass).then(()=>mostrarAlerta("¡Cuenta creada!")).catch(e=>mostrarAlerta(traducirErrorAuth(e)));
}
export function loginUsuario() {
    const email = document.getElementById('authEmail').value; const pass = document.getElementById('authPassword').value;
    if(!email || !pass) return mostrarAlerta("Completá el email y la contraseña.");
    auth.signInWithEmailAndPassword(email, pass).catch(e=>mostrarAlerta(traducirErrorAuth(e)));
}
// Guarda la función para desconectar el "oyente" en vivo de Firestore (lo
// que devuelve onSnapshot). Si no se desconecta antes de cerrar sesión o
// eliminar la cuenta, sigue intentando escuchar datos con un usuario que ya
// no está autenticado, y Firestore responde con un error de permisos.
let desconectarOyenteDatos = null;

export async function logoutUsuario() {
    if(await mostrarConfirmacion("¿Salir?")) {
        if (desconectarOyenteDatos) { desconectarOyenteDatos(); desconectarOyenteDatos = null; }
        await auth.signOut();
        // Después de cerrar sesión mostramos el login directo, no la landing
        // — quien ya usó la app no necesita volver a ver la presentación.
        document.getElementById('landing-section').style.display = 'none';
        document.getElementById('auth-section').style.display = 'block';
    }
}

// Íconos de "ojo" en SVG (más confiables que un emoji, que puede no
// distinguirse bien entre estados según el sistema).
const SVG_OJO_ABIERTO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_OJO_TACHADO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// Muestra u oculta el texto de la contraseña en la pantalla de login. El
// ícono refleja el estado DESPUÉS del cambio: ojo abierto = contraseña
// oculta (clic para verla), ojo tachado = contraseña visible (clic para
// ocultarla de nuevo).
export function toggleMostrarPassword() {
    let input = document.getElementById('authPassword');
    let boton = document.getElementById('btnMostrarPassword');
    let vaAMostrarla = input.type === 'password';
    input.type = vaAMostrarla ? 'text' : 'password';
    boton.innerHTML = vaAMostrarla ? SVG_OJO_TACHADO : SVG_OJO_ABIERTO;
    boton.setAttribute('aria-label', vaAMostrarla ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

// --- MENÚ DESPLEGABLE DE USUARIO (arriba a la derecha) ---
export function toggleMenuUsuario() {
    let dropdown = document.getElementById('userMenuDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}
// Cierra el menú si se hace clic afuera de él.
document.addEventListener('click', (e) => {
    let menu = document.querySelector('.user-menu');
    let dropdown = document.getElementById('userMenuDropdown');
    if (dropdown && dropdown.style.display === 'block' && menu && !menu.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// --- MODAL MI PERFIL ---
export function abrirModalPerfil() {
    document.getElementById('userMenuDropdown').style.display = 'none';
    document.getElementById('modal-perfil').style.display = 'flex';
}
export function cerrarModalPerfil() {
    document.getElementById('modal-perfil').style.display = 'none';
}

// --- RESTABLECER CONTRASEÑA (pantalla aparte, con su propio email) ---
export function mostrarVistaRecuperar() {
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-recover-view').style.display = 'block';
    document.getElementById('auth-recover-form').style.display = 'block';
    document.getElementById('auth-recover-exito').style.display = 'none';
    // Si ya habían escrito el email en el login, lo precargamos acá.
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
        .then(() => {
            document.getElementById('auth-recover-form').style.display = 'none';
            document.getElementById('auth-recover-exito').style.display = 'block';
        })
        .catch(e => mostrarAlerta(traducirErrorAuth(e)));
}

// --- SINCRONIZACIÓN CON LA NUBE ---
export function cargarDatosDesdeNube(uid) {
    desconectarOyenteDatos = db.collection("usuarios").doc(uid).onSnapshot(doc => {
        try {
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

                // --- MIGRACIÓN: S&P 500 pasó de ser "posiciones sueltas" a un pool
                // acumulado. Si hay entradas viejas de S&P 500 en "inversiones",
                // las sumamos al pool nuevo y las sacamos de la lista de posiciones
                // (que ahora es solo para Plazo Fijo / Mercado Pago).
                estadoApp.sp500 = data.sp500 || { nominales: 0 };
                let entradasSpViejas = estadoApp.inversiones.filter(inv => inv.instrumento === "S&P 500");
                if (entradasSpViejas.length > 0) {
                    entradasSpViejas.forEach(inv => { estadoApp.sp500.nominales += (inv.nominales || 0); });
                    estadoApp.inversiones = estadoApp.inversiones.filter(inv => inv.instrumento !== "S&P 500");
                }
                estadoApp.historialInversiones = data.historialInversiones || [];
                estadoApp.historialMensual = data.historialMensual || {};
                // La cotización del CEDEAR de IVV es editable a mano (ver
                // billetera.js) — si ya la habías ajustado antes, la
                // recuperamos; si no, se queda con el valor de referencia
                // definido en estado.js hasta que inicializarMercado() la
                // actualice con la cotización real de BYMA.
                if (data.cotizacionCedear) estadoApp.mercado.spy_ars = data.cotizacionCedear;
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
            // Reconstruimos el historial de Pesos (incluye el mes en curso) — si
            // cambió el saldo, lo persistimos ya mismo en la nube.
            if (reconstruirHistorialPesos()) guardarDatosEnNube();
            actualizarApp();
        } catch (e) {
            // Red de seguridad: si algo de lo de arriba falla, esto evita que
            // la app quede trabada en "Cargando tu información..." para
            // siempre — mejor mostrar un aviso claro que colgarse en silencio.
            console.error("Error procesando los datos cargados desde la nube:", e);
            mostrarAlerta("Hubo un problema cargando tus datos. Si esto se repite, contame este mensaje: " + e.message);
        } finally {
            ocultarLoaderInicial();
        }
    }, (error) => {
        // Esto atiende errores del propio Firestore (por ejemplo, permisos
        // denegados) — sin esto, el loader también se quedaría trabado para
        // siempre ante un error de conexión.
        console.error("Error de Firestore al escuchar los datos:", error);
        ocultarLoaderInicial();
        mostrarAlerta("No se pudieron cargar tus datos: " + error.message);
    });
}

export function guardarDatosEnNube() {
    if(auth.currentUser) db.collection("usuarios").doc(auth.currentUser.uid).set({
        todosLosMovimientos: estadoApp.todosLosMovimientos, suscripciones: estadoApp.suscripciones,
        patrimonio: estadoApp.patrimonio, inversiones: estadoApp.inversiones, listaAmigos: estadoApp.listaAmigos, perfilUsuario: estadoApp.perfilUsuario,
        sp500: estadoApp.sp500, historialInversiones: estadoApp.historialInversiones,
        historialMensual: estadoApp.historialMensual,
        cotizacionCedear: estadoApp.mercado.spy_ars
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

export async function cambiarPasswordPerfil() {
    let n = document.getElementById('profilePasswordInput').value;
    if(n.length < 6) return mostrarAlerta("Mínimo 6 chars");
    auth.currentUser.updatePassword(n).then(() => { mostrarAlerta("Clave cambiada"); document.getElementById('profilePasswordInput').value = ''; }).catch(e => mostrarAlerta(traducirErrorAuth(e)));
}

// Elimina la cuenta por completo: borra el documento de Firestore y el
// usuario de Firebase Auth. Es irreversible, así que pide doble confirmación
// (igual que "Blanquear todos mis datos"). Si Firebase pide un login reciente
// por seguridad, se lo explica a la persona en vez de fallar en silencio.
export async function eliminarCuenta() {
    if (!(await mostrarConfirmacion("⚠️ Esto va a eliminar tu cuenta y TODOS tus datos para siempre. No se puede deshacer.", {peligroso: true}))) return;
    let confirmacion = await mostrarPrompt("Para confirmar, escribí ELIMINAR:");
    if (confirmacion !== "ELIMINAR") return;

    let user = auth.currentUser;
    if (!user) return;

    if (desconectarOyenteDatos) { desconectarOyenteDatos(); desconectarOyenteDatos = null; }

    try {
        await db.collection("usuarios").doc(user.uid).delete();
        await user.delete();
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('landing-section').style.display = 'block';
        mostrarAlerta("Tu cuenta fue eliminada. ¡Gracias por haber usado la app!");
    } catch (e) {
        mostrarAlerta(traducirErrorAuth(e));
    }
}
