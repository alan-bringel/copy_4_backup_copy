import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// Importar a configuração centralizada
import firebaseConfig from './firebase-config.js';

// Inicializar Firebase com a configuração unificada
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Autenticar com Google (substitui a autenticação anônima)
export async function authenticateWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("Autenticação Google realizada com sucesso", result.user.uid);
    return result.user;
  } catch (error) {
    console.error("Erro ao autenticar com Google:", error);
    throw error;
  }
}

// Adicionar revisão (sem necessidade de autenticação prévia)
export async function addReviewWithAuth(reviewData) {
  try {
    // Adicionar diretamente sem autenticação anônima
    const reviewsRef = collection(db, 'reviews');
    const docRef = await addDoc(reviewsRef, {
      ...reviewData,
      verified: true
    });
    
    return {
      success: true,
      id: docRef.id,
      message: 'Review salvo com sucesso'
    };
  } catch (error) {
    console.error("Erro ao adicionar review:", error);
    throw error;
  }
}

// Buscar revisões
export async function getReviews() {
  try {
    const reviewsRef = collection(db, 'reviews');
    const q = query(reviewsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Erro ao buscar reviews:", error);
    throw error;
  }
}