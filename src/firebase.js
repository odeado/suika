import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAqLu7YlbDn2AkKXjihLVU8bzy4Fb61V7c",
  authDomain: "juegos-online-99b20.firebaseapp.com",
  projectId: "juegos-online-99b20",
  storageBucket: "juegos-online-99b20.firebasestorage.app",
  messagingSenderId: "942532179041",
  appId: "1:942532179041:web:eee067b965e74b4a26a620"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collection reference
const highscoresRef = collection(db, "highscores");

export const saveScore = async (playerName, score) => {
  try {
    await addDoc(highscoresRef, {
      name: playerName || "Anonymous",
      score: score,
      timestamp: new Date()
    });
    return true;
  } catch (error) {
    console.error("Error adding document: ", error);
    return false;
  }
};

export const getTopScores = async (topCount = 5) => {
  try {
    const q = query(highscoresRef, orderBy("score", "desc"), limit(topCount));
    const querySnapshot = await getDocs(q);
    const scores = [];
    querySnapshot.forEach((doc) => {
      scores.push({ id: doc.id, ...doc.data() });
    });
    return scores;
  } catch (error) {
    console.error("Error getting documents: ", error);
    return [];
  }
};
