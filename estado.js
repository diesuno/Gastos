// ==========================================
// 📦 ESTADO COMPARTIDO DE LA APP
// ==========================================
// Todas las variables que representan "los datos de la app en memoria" viven
// acá, en un único objeto exportado (estadoApp). Los demás módulos lo importan
// y leen/modifican sus propiedades (ej: estadoApp.patrimonio.pesos += 100).
// Esto reemplaza lo que antes eran variables sueltas del tipo "let patrimonio"
// repartidas por todo un solo archivo — ahora hay un solo lugar donde vive el
// estado, y cualquier módulo que lo necesite simplemente lo importa.
//
// Nota de nombres: se llama "estadoApp" (no "estado" a secas) para no
// confundirse con el campo "estado" que tienen los movimientos de tipo
// "Cuenta Cobrar" (que vale "Pendiente" o "Saldado" — un concepto distinto).

export const estadoApp = {
    todosLosMovimientos: [],
    suscripciones: [],
    // "pesos" se mantiene sincronizado en vivo con el Disponible de cada mes,
    // incluido el mes en curso (ver cierreMensual.js). "dolares" es el pool de
    // dólares comprados (ver billetera.js) — son el capital para invertir en
    // S&P 500, no se retiran directamente.
    patrimonio: { pesos: 0, dolares: 0 },
    // Posiciones de Plazo Fijo / Mercado Pago de una versión anterior de la
    // app (esos instrumentos ya no existen). Se deja el campo para no perder
    // datos viejos de usuarios que los tenían, pero no se crean entradas
    // nuevas ni se muestra nada de esto en la UI.
    inversiones: [],
    // Pool acumulado de nominales de S&P 500 (sin trackear de qué compra vino).
    sp500: { nominales: 0 },
    // Historial de movimientos de Inversión/Retiro para la tabla "Historial de
    // Movimientos" (Dólares y S&P 500). Cada entrada: { id, mov, pesosInvertidos,
    // instrumento, monto, moneda, fecha }.
    historialInversiones: [],
    // Fotos mensuales del valor en dólares de "dolares" y "sp500", para poder
    // graficar la evolución real (ver cierreMensual.js y grafico.js). Clave
    // "YYYY-MM" -> { dolares, sp500Usd }.
    historialMensual: {},
    // Cuánto del Disponible de cada mes (clave "YYYY-MM") ya se sumó al pool
    // de Pesos. Incluye el mes en curso: se recalcula todo el tiempo (ver
    // cierreMensual.js), así el pool queda siempre al día, no solo una vez
    // que el mes termina.
    aportesPesosPorMes: {},

    listaAmigos: [],
    perfilUsuario: { nombre: "Usuario", modo: "" },

    movimientosMesGlobal: [],
    keyMesActualGlobal: "",

    // "actualizado" indica si cada valor vino de una API real hoy, o si
    // seguimos usando el valor de referencia por defecto porque no se pudo
    // conectar a nada (ver billetera.js). "spy_ars" es la cotización REAL del
    // CEDEAR de IVV en pesos, tal como cotiza en BYMA (o la cargada a mano) —
    // sin convertir a la acción real de EEUU, porque la app es de uso local.
    // "spy_usd" es ese mismo valor pasado a dólares (spy_ars ÷ dolarCCL). Los
    // nombres de variable quedaron del momento en que la app seguía a SPY —
    // hoy representan directamente al CEDEAR de IVV.
    mercado: { spy_usd: 1.1, dolarCCL: 1550, spy_ars: 1700, actualizado: { ccl: false, cedear: false } },

    miGrafico: null,

    // El onSnapshot de Firestore se dispara en cada cambio de datos, no solo
    // la primera vez — esta bandera evita ocultar el loader más de una vez.
    loaderYaOcultado: false,
};

export const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const fechaActual = new Date();
