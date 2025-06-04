
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // Uncomment if you need Auth
// import { getStorage } from 'firebase/storage'; // Uncomment if you need Storage

const firebaseConfig = {
  apiKey: "AIzaSyDZiChqftbZmze_dt26d-vOasEt4PcVilU",
  authDomain: "newilek-15d47.firebaseapp.com",
  projectId: "newilek-15d47",
  storageBucket: "newilek-15d47.firebasestorage.app",
  messagingSenderId: "713781638903",
  appId: "1:713781638903:web:cf8c8956c5cc9dad7005f2",
  measurementId: "G-4FJFZV2JXP"
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
// const auth = getAuth(app); // Uncomment if you need Auth
// const storage = getStorage(app); // Uncomment if you need Storage

export { app, db /*, auth, storage */ };
