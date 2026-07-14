// ==========================================
// ⚙️ CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD6b5jRsGPzKmwB-M-cDbyn1qQCAdN5ecE",
    authDomain: "gastos-a56f7.firebaseapp.com",
    projectId: "gastos-a56f7",
    storageBucket: "gastos-a56f7.firebasestorage.app",
    messagingSenderId: "537729737132",
    appId: "1:537729737132:web:2423ab40ff20fef30b9a09"
};
// ==========================================

// "firebase" viene de los <script> de firebase-app/auth/firestore cargados
// en index.html antes que este módulo — no hace falta importarlo.
firebase.initializeApp(firebaseConfig);
export const auth = firebase.auth();
export const db = firebase.firestore();
