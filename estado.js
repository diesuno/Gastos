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
    // conectar a nada (ver billetera.js). "spy_usd"/"spy_ars" siguen el
    // nombre histórico de la variable, pero desde este cambio representan la
    // cotización de IVV (iShares Core S&P 500 ETF), no de SPY — es el CEDEAR
    // que en la práctica se usa acá. "spy_ars" es un valor CALCULADO
    // (spy_usd × dolarCCL), no se pide directo a ninguna API — así no
    // depende del ratio del CEDEAR. "ratioCedear" es cuántos CEDEARs
    // representan 1 acción real de IVV — este número lo fija BYMA/el banco y
    // puede cambiar sin aviso, por eso es editable a mano en vez de venir de
    // una API (la detección automática es un intento best-effort nomás).
    // "historicoSpyUsd" es un cache de precios mensuales pasados de IVV (clave
    // "YYYY-MM" -> precio en USD), usado para valuar el gráfico con el precio
    // real de cada mes en vez de siempre el de hoy. Se llena en billetera.js
    // al abrir la app; si la fuente falla, queda vacío y todo cae de vuelta al
    // precio actual (ver cierreMensual.js).
    mercado: { spy_usd: 750, dolarCCL: 1550, spy_ars: 1162500, ratioCedear: 60, historicoSpyUsd: {}, actualizado: { usd: false, ccl: false, ratio: false } },

    miGrafico: null,

    // El onSnapshot de Firestore se dispara en cada cambio de datos, no solo
    // la primera vez — esta bandera evita ocultar el loader más de una vez.
    loaderYaOcultado: false,
};

export const nombresMeses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const fechaActual = new Date();
