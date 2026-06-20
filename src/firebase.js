import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, query, orderBy, limit, where, updateDoc, onSnapshot } from "firebase/firestore";

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

// Collection references
const highscoresRef = collection(db, "highscores");
const roomsRef = collection(db, "rooms");

export const saveScore = async (playerName, score) => {
  try {
    const name = playerName || "Anonymous";
    const q = query(highscoresRef, where("name", "==", name));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      // User exists
      const docSnap = snapshot.docs[0];
      const data = docSnap.data();
      if (score > data.score) {
        await updateDoc(doc(db, "highscores", docSnap.id), {
          score: score,
          timestamp: new Date()
        });
      }
    } else {
      // New user
      await addDoc(highscoresRef, {
        name: name,
        score: score,
        timestamp: new Date()
      });
    }
    return true;
  } catch (error) {
    console.error("Error saving score: ", error);
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

// MULTIPLAYER LOGIC
export const createRoom = async (roomCode) => {
  try {
    const roomDoc = doc(roomsRef, roomCode);
    await setDoc(roomDoc, {
      player1: { score: 0, punishments: 0 },
      player2: null,
      status: 'waiting'
    });
    return true;
  } catch (error) {
    console.error("Error creating room: ", error);
    return false;
  }
};

export const joinRoom = async (roomCode) => {
  try {
    const roomDoc = doc(roomsRef, roomCode);
    const snapshot = await getDocs(query(roomsRef, where("__name__", "==", roomCode)));
    
    if (snapshot.empty) return false;
    
    const data = snapshot.docs[0].data();
    if (data.status !== 'waiting') return false;

    await updateDoc(roomDoc, {
      player2: { score: 0, punishments: 0 },
      status: 'playing'
    });
    return true;
  } catch (error) {
    console.error("Error joining room: ", error);
    return false;
  }
};

export const listenToRoom = (roomCode, callback) => {
  const roomDoc = doc(roomsRef, roomCode);
  return onSnapshot(roomDoc, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    }
  });
};

export const updateRoomState = async (roomCode, isPlayer1, dataToUpdate, status = null) => {
  try {
    const roomDoc = doc(roomsRef, roomCode);
    const fieldPrefix = isPlayer1 ? 'player1' : 'player2';
    
    const updates = {};
    if (dataToUpdate.score !== undefined) updates[`${fieldPrefix}.score`] = dataToUpdate.score;
    if (dataToUpdate.punishments !== undefined) updates[`${fieldPrefix}.punishments`] = dataToUpdate.punishments;
    if (status !== null) updates.status = status;
    
    await updateDoc(roomDoc, updates);
  } catch (error) {
    console.error("Error updating room state: ", error);
  }
};

export const sendPunishment = async (roomCode, isPlayer1) => {
  try {
    const roomDoc = doc(roomsRef, roomCode);
    // Send punishment to the OTHER player
    const targetField = isPlayer1 ? 'player2.punishments' : 'player1.punishments';
    
    // We have to read it first to increment (or use FieldValue.increment, but doing a quick read is fine here for simplicity)
    const snapshot = await getDocs(query(roomsRef, where("__name__", "==", roomCode)));
    if(!snapshot.empty){
        const data = snapshot.docs[0].data();
        const targetPlayer = isPlayer1 ? data.player2 : data.player1;
        if(targetPlayer){
             const updates = {};
             updates[targetField] = (targetPlayer.punishments || 0) + 1;
             await updateDoc(roomDoc, updates);
        }
    }
  } catch (error) {
    console.error("Error sending punishment: ", error);
  }
};
