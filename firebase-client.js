import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, orderBy, query, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Usar HTTPS para todas as solicitações do Firestore para evitar problemas de CORS
// Isto funciona para a maioria dos navegadores modernos
const corsProxy = location.hostname === 'localhost' ? '/api/' : 'https://parallel-reading.netlify.app/api/';

// Implementar cache local para reduzir chamadas ao servidor
const reviewsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // 1 minuto de cache
};

export async function getReviews() {
  try {
    // Verificar se temos dados em cache válidos
    const now = Date.now();
    if (reviewsCache.data && now - reviewsCache.timestamp < reviewsCache.ttl) {
      console.log("Retornando reviews do cache");
      return reviewsCache.data;
    }
    
    const reviewsRef = collection(db, 'reviews');
    const q = query(reviewsRef, orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    
    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Atualizar o cache
    reviewsCache.data = reviews;
    reviewsCache.timestamp = now;
    
    return reviews;
  } catch (error) {
    console.error("Erro ao buscar reviews:", error);
    
    // Se falhar por CORS, tentar através do proxy
    try {
      const response = await fetch(`${corsProxy}reviews`);
      if (!response.ok) throw new Error('Falha na resposta do proxy');
      const reviews = await response.json();
      
      // Atualizar o cache
      reviewsCache.data = reviews;
      reviewsCache.timestamp = Date.now();
      
      return reviews;
    } catch (proxyError) {
      console.error("Erro no fallback do proxy:", proxyError);
      
      // Se ainda falhar, tentar obter dados do localStorage como último recurso
      const cachedReviews = localStorage.getItem('cached_reviews');
      return cachedReviews ? JSON.parse(cachedReviews) : [];
    }
  }
}

export async function addReview(reviewData) {
  try {
    // Verificar se este review já foi enviado (mecanismo anti-duplicação)
    if (reviewData.submissionId) {
      const submissionCache = localStorage.getItem('submittedReviews') || '{}';
      const submittedReviews = JSON.parse(submissionCache);
      
      if (submittedReviews[reviewData.submissionId]) {
        console.log("Review já foi enviado anteriormente, ignorando");
        return {
          success: true,
          id: submittedReviews[reviewData.submissionId],
          message: 'Review já enviado anteriormente'
        };
      }
    }
    
    const reviewsRef = collection(db, 'reviews');
    const docRef = await addDoc(reviewsRef, {
      ...reviewData,
      date: reviewData.date || new Date().toISOString(),
      verified: true
    });
    
    // Registrar que este review foi enviado
    if (reviewData.submissionId) {
      const submissionCache = localStorage.getItem('submittedReviews') || '{}';
      const submittedReviews = JSON.parse(submissionCache);
      submittedReviews[reviewData.submissionId] = docRef.id;
      localStorage.setItem('submittedReviews', JSON.stringify(submittedReviews));
    }
    
    // Invalidar o cache
    reviewsCache.timestamp = 0;
    
    return {
      success: true,
      id: docRef.id,
      message: 'Review salvo com sucesso'
    };
  } catch (error) {
    console.error("Erro ao adicionar review:", error);
    
    // Se falhar por CORS, tentar através do proxy
    try {
      const response = await fetch(`${corsProxy}reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reviewData)
      });
      
      if (!response.ok) throw new Error('Falha na resposta do proxy');
      const result = await response.json();
      
      // Registrar que este review foi enviado
      if (reviewData.submissionId && result.id) {
        const submissionCache = localStorage.getItem('submittedReviews') || '{}';
        const submittedReviews = JSON.parse(submissionCache);
        submittedReviews[reviewData.submissionId] = result.id;
        localStorage.setItem('submittedReviews', JSON.stringify(submittedReviews));
      }
      
      // Invalidar o cache
      reviewsCache.timestamp = 0;
      
      return result;
    } catch (proxyError) {
      console.error("Erro no fallback do proxy:", proxyError);
      throw proxyError;
    }
  }
}