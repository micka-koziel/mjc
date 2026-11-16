/**
 * Initialisation Firebase (repris de src/lib/firebase.js de Trendl), mais
 * PARESSEUSE : en mode démo, Firebase n'est jamais chargé ni exigé.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

let cached = null;

export function getFirebase() {
  if (cached) return cached;
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Configuration Firebase incomplète (${missing.join(', ')}). Voir .env.example.`);
  }
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  cached = { app, db: getFirestore(app), auth: getAuth(app), storage: getStorage(app) };
  return cached;
}
