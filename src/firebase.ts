import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  Timestamp,
  query,
  where,
  getDocFromServer
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get services - CRITICAL: must specify databaseId as per skill
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Sign in anonymously silently to comply with security standards
signInAnonymously(auth).catch((err) => {
  console.error("Firebase Anonymous Auth Error: ", err);
});

// Seed data interfaces
export interface LostItem {
  id: string;
  name: string;
  hubId: string;
  category: string;
  icon: string;
  status: "AVAILABLE" | "RESERVED" | "PICKED_UP";
  otp: string | null;
  createdAt: Timestamp;
  reservedAt: Timestamp | null;
  pickedUpAt: Timestamp | null;
}

// Map Hub IDs to Hub Names (specifically targeting Hanyang Univ. style)
export const HUBS: { [id: string]: { name: string; location: string; description: string } } = {
  h1: {
    name: "학생회관 Hub (Student Union)",
    location: "학생회관 1층 로비",
    description: "한양대학교 ERICA 학생회관 편의점 맞은편"
  },
  h2: {
    name: "학술정보관 Hub (Library)",
    location: "학술정보관 지하 1층 열람실 앞",
    description: "한양대학교 ERICA 학술정보관 무인 사물함 구역"
  },
  h3: {
    name: "제1공학관 Hub (Engineering Hall 1)",
    location: "제1공학관 1층 통합 행정팀 앞",
    description: "한양대학교 ERICA 제1공학관 중앙 로비 엘리베이터 앞"
  }
};

const DEFAULT_ITEMS = [
  {
    id: "item_airpods",
    name: "에어팟 프로 2세대 (AirPods Pro 2)",
    hubId: "h2", // Library
    category: "전자기기",
    icon: "🎧",
    status: "AVAILABLE",
    otp: null,
    reservedAt: null,
    pickedUpAt: null
  },
  {
    id: "item_wallet",
    name: "검은색 가죽 지갑 (MCM)",
    hubId: "h1", // Student Union
    category: "지갑/가방",
    icon: "👛",
    status: "AVAILABLE",
    otp: null,
    reservedAt: null,
    pickedUpAt: null
  },
  {
    id: "item_book",
    name: "프로그래밍 기초 (파이썬 데이터 분석 교재)",
    hubId: "h3", // Engineering Hall 1
    category: "도서",
    icon: "📘",
    status: "AVAILABLE",
    otp: null,
    reservedAt: null,
    pickedUpAt: null
  },
  {
    id: "item_idcard",
    name: "한양대학교 ERICA 학생회원증 (경영학부)",
    hubId: "h2", // Library
    category: "학생증/신분증",
    icon: "🪪",
    status: "AVAILABLE",
    otp: null,
    reservedAt: null,
    pickedUpAt: null
  }
];

/**
 * Validates connection to Firestore.
 */
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firestore connection test completed.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration. Client appears offline.");
    }
  }
}

/**
 * Seeds default lost items into Firestore if the database is currently empty.
 * This guarantees a working dataset for the user's demonstration immediately.
 */
export async function seedDatabaseIfEmpty() {
  try {
    const itemsRef = collection(db, "items");
    const snapshot = await getDocs(itemsRef);
    
    if (snapshot.empty) {
      console.log("No items found in Firestore items collection. Seeding initial test data...");
      
      const batch = writeBatch(db);
      const now = Timestamp.now();
      
      DEFAULT_ITEMS.forEach((item) => {
        const docRef = doc(db, "items", item.id);
        batch.set(docRef, {
          ...item,
          createdAt: now
        });
      });
      
      await batch.commit();
      console.log("Firestore successfully seeded with 4 default lost items.");
    } else {
      console.log(`Firestore already has ${snapshot.size} items. Skipping seeding.`);
    }
  } catch (error) {
    console.error("Database seeding encountered an error: ", error);
  }
}

// Call test connection
testConnection();
