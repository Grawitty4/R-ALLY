import { getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured() {
  return Boolean(config.apiKey && config.databaseURL && config.projectId);
}

export function getFirebaseDatabase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: config.apiKey!,
        authDomain: config.authDomain,
        databaseURL: config.databaseURL,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
  return getDatabase(app);
}
