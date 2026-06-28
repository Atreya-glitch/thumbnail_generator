import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBGCtfI3ZdITckIDtRkSAm2PNVB6sxGONY",
  authDomain: "ai-uploader-2430d.firebaseapp.com",
  projectId: "ai-uploader-2430d",
  storageBucket: "ai-uploader-2430d.firebasestorage.app",
  messagingSenderId: "201433784923",
  appId: "1:201433784923:web:9dc03f20b5b1e347c2d57e",
  measurementId: "G-G6W434FD6R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export {
  auth,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
};
