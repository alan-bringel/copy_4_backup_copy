// Crie este novo arquivo para acesso direto ao Firebase quando o Wrangler falhar

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBPTTRjcEFZalg7BSbfvZ-n9gN-HX_IV-o",
  authDomain: "reviews-smartplay-br.firebaseapp.com",
  projectId: "reviews-smartplay-br",
  storageBucket: "reviews-smartplay-br.appspot.com",
  messagingSenderId: "738180029480",
  appId: "1:738180029480:web:23b856f9d5a6a8766db9f3"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Adicionar revisão diretamente ao Firebase
export async function addReviewDirectly(reviewData) {
  try {
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

// Buscar revisões diretamente do Firebase
export async function getReviewsDirectly() {
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