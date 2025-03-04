import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const CONFIG = {
  isDevelopment: window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1',
  reviewsEndpoint: '/api/reviews',
  localStorageKey: 'reviews',
  useFirebaseInDev: true // Usar Firebase mesmo em ambiente de desenvolvimento
};

// Cloudflare Function para lidar com requisições
export async function onRequest(context) {
  const { request, env } = context;
  
  // Headers para CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
  
  // Preflight CORS
  if (request.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  try {
    // Criar credencial do Firebase usando secrets
    const firebaseApp = initializeApp({
      credential: cert({
        projectId: "reviews-smartplay-br",
        privateKeyId: env.FIREBASE_PRIVATE_KEY_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        clientId: env.FIREBASE_CLIENT_ID,
        clientX509CertUrl: env.FIREBASE_CLIENT_X509_CERT_URL
      })
    }, 'reviews-app');
    
    const db = getFirestore(firebaseApp);
    const reviewsCollection = db.collection('reviews');
    
    // GET - buscar avaliações
    if (request.method === "GET") {
      const snapshot = await reviewsCollection.orderBy('date', 'desc').get();
      
      const reviews = [];
      snapshot.forEach(doc => {
        reviews.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return new Response(JSON.stringify(reviews), { headers });
    }
    
    // POST - adicionar avaliação
    if (request.method === "POST") {
      const reviewData = await request.json();
      
      // Validação básica
      if (!reviewData.name || !reviewData.rating || !reviewData.comment) {
        return new Response(JSON.stringify({error: 'Dados incompletos'}), 
                          { headers, status: 400 });
      }
      
      // Adicionar campos extras
      reviewData.date = reviewData.date || new Date().toISOString();
      reviewData.verified = true;
      
      // Salvar no Firestore
      const docRef = await reviewsCollection.add(reviewData);
      
      return new Response(JSON.stringify({
        success: true,
        id: docRef.id,
        message: 'Review salvo com sucesso'
      }), { headers, status: 201 });
    }
    
    // Método não suportado
    return new Response(JSON.stringify({error: 'Método não suportado'}),
                      { headers, status: 405 });
  } catch (error) {
    console.error("Erro:", error);
    return new Response(JSON.stringify({error: error.message}), 
                     { headers, status: 500 });
  }
}