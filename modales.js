// ==========================================
// 🪟 MODALES (reemplazo de alert / confirm / prompt nativos)
// ==========================================
// Los diálogos nativos del navegador (alert, confirm, prompt) no se pueden
// estilar, se ven distinto en cada navegador, y algunos ya los bloquean o
// muestran con leyendas de advertencia. Este módulo ofrece 3 funciones que
// hacen lo mismo pero con un modal propio, devolviendo una Promise para
// poder usarlas con "await" tal como se usaban sus equivalentes nativos.
//
// Uso:
//   await mostrarAlerta("Perfil actualizado");
//   const ok = await mostrarConfirmacion("¿Eliminar este movimiento?");
//   const valor = await mostrarPrompt("Ingresá el importe:", "100");

const overlay = document.getElementById('modal-generico');
const cajaModal = overlay.querySelector('.modal-box');
const elMensaje = document.getElementById('modal-mensaje');
const elInputContainer = document.getElementById('modal-input-container');
const elInput = document.getElementById('modal-input');
const btnCancelar = document.getElementById('modal-btn-cancelar');
const btnConfirmar = document.getElementById('modal-btn-confirmar');

// Guarda la función de resolución de la Promise actualmente abierta,
// para que los botones sepan qué "responder" cuando se los toca.
let resolverActual = null;

function cerrarModal(valorResuelto) {
    overlay.style.display = 'none';
    cajaModal.classList.remove('modal-solo-aceptar', 'modal-peligro');
    if (resolverActual) {
        resolverActual(valorResuelto);
        resolverActual = null;
    }
}

btnCancelar.addEventListener('click', () => cerrarModal(false));
btnConfirmar.addEventListener('click', () => {
    if (elInputContainer.style.display !== 'none') {
        cerrarModal(elInput.value);
    } else {
        cerrarModal(true);
    }
});
// Enter dentro del input de texto confirma, igual que en un prompt nativo
elInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnConfirmar.click();
});

/**
 * Reemplaza a alert(). Muestra un mensaje con un solo botón "Aceptar".
 * @param {string} mensaje
 * @returns {Promise<void>}
 */
export function mostrarAlerta(mensaje) {
    return new Promise(resolve => {
        resolverActual = () => resolve();
        elMensaje.textContent = mensaje;
        elInputContainer.style.display = 'none';
        cajaModal.classList.add('modal-solo-aceptar');
        overlay.style.display = 'flex';
        btnConfirmar.textContent = 'Aceptar';
    });
}

/**
 * Reemplaza a confirm(). Devuelve true si el usuario acepta, false si cancela.
 * @param {string} mensaje
 * @param {{peligroso?: boolean}} opciones - marcar peligroso:true pinta el botón de confirmar en rojo (para acciones destructivas)
 * @returns {Promise<boolean>}
 */
export function mostrarConfirmacion(mensaje, opciones = {}) {
    return new Promise(resolve => {
        resolverActual = (valor) => resolve(!!valor);
        elMensaje.textContent = mensaje;
        elInputContainer.style.display = 'none';
        if (opciones.peligroso) cajaModal.classList.add('modal-peligro');
        overlay.style.display = 'flex';
        btnConfirmar.textContent = 'Confirmar';
    });
}

/**
 * Reemplaza a prompt(). Devuelve el texto ingresado, o null si se cancela.
 * @param {string} mensaje
 * @param {string|number} valorInicial
 * @returns {Promise<string|null>}
 */
export function mostrarPrompt(mensaje, valorInicial = "") {
    return new Promise(resolve => {
        resolverActual = (valor) => resolve(valor === false ? null : valor);
        elMensaje.textContent = mensaje;
        elInput.value = (valorInicial !== undefined && valorInicial !== null) ? valorInicial : "";
        elInputContainer.style.display = 'block';
        overlay.style.display = 'flex';
        btnConfirmar.textContent = 'Aceptar';
        setTimeout(() => { elInput.focus(); elInput.select(); }, 50);
    });
}
