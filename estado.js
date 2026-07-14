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
    // "pesos" ahora se alimenta solo (ver cierreMensual.js): cuando un mes de
    // Flujo Mensual queda en el pasado, su Disponible se suma acá una única vez.
    // "dolares" es el pool de dólares comprados (ver billetera.js).
    patrimonio: { pesos: 0, dolares: 0 },
    // Posiciones de Plazo Fijo / Mercado Pago únicamente (cada una con su fecha
    // y tasa, igual que antes). Dólares y S&P 500 ya NO viven acá: son pools
    // simples (ver "patrimonio.dolares" y "sp500" más abajo).
    inversiones: [],
    // Pool acumulado de nominales de S&P 500 (sin trackear de qué compra vino).
    sp500: { nominales: 0 },
    // Historial de movimientos de Inversión/Retiro para la tabla "Detalle"
    // (incluye los 4 instrumentos). Cada entrada: { id, mov, pesosInvertidos,
    // instrumento, monto, moneda, fecha }.
    historialInversiones: [],
    // Fotos mensuales del valor en dólares de "dolares" y "sp500", para poder
    // graficar la evolución real de los últimos 6 meses (ver cierreMensual.js
    // y grafico.js). Clave "YYYY-MM" -> { dolares, sp500Usd }.
    historialMensual: {},
    // Meses (clave "YYYY-MM") cuyo Disponible ya se sumó al pool de Pesos, para
    // no sumarlo dos veces (ver cierreMensual.js).
    mesesPesosCerrados: [],

    listaAmigos: [],
    perfilUsuario: { nombre: "Usuario", modo: "" },

    movimientosMesGlobal: [],
    keyMesActualGlobal: "",

    // "actualizado" indica si cada valor vino de una API real hoy, o si
    // seguimos usando el valor de referencia por defecto porque no se pudo
    // conectar a nada (ver billetera.js).
    mercado: { spy_ars: 17000, spy_usd: 540, mpTna: 17.5, actualizado: { ars: false, usd: false, mpTna: false } },

    miGrafico: null,

    // El onSnapshot de Firestore se dispara en cada cambio de datos, no solo
    // la primera vez — esta bandera evita ocultar el loader más de una vez.
    loaderYaOcultado: false,
};

export const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const fechaActual = new Date();
