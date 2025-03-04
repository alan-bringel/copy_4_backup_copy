// filepath: /Users/alanbringel/parallel_reading copy 4/functions/firebase-admin.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let firebaseApp;
let firestoreDb;

export function getFirebaseAdmin(useEnvVars = true) {
  if (firebaseApp) {
    return { app: firebaseApp, db: firestoreDb };
  }
  
  try {
    let credential;
    
    if (useEnvVars && process.env.FIREBASE_PRIVATE_KEY) {
      // Usar variáveis de ambiente (produção)
      credential = cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else {
      // Usar arquivo local (desenvolvimento)
      const serviceAccountPath = path.join(process.cwd(), 'private', 'keys', 'firebase-service-account.json');
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      credential = cert(serviceAccount);
    }
    
    firebaseApp = initializeApp({ credential });
    firestoreDb = getFirestore(firebaseApp);
    
    return { app: firebaseApp, db: firestoreDb };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}