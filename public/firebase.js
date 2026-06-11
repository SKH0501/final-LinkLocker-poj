// LinkLocker Firebase Configuration & Service Core
// 이 코드는 한양대학교 ERICA LinkLocker 분실물 실시간 동기화 서비스를 처리하는 핵심 Firebase 모듈입니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// AI Studio에서 임베디드 생성된 실제 Firebase 프로젝트 설정 데이터입니다.
const firebaseConfig = {
  projectId: "feisty-primer-x71nt",
  appId: "1:286545360696:web:c6e6d50815be71ab83b3cd",
  apiKey: "AIzaSyDrdUbl8NYqK_AT4cOWlamlV6Fq5kJzR_M",
  authDomain: "feisty-primer-x71nt.firebaseapp.com",
  storageBucket: "feisty-primer-x71nt.firebasestorage.app",
  messagingSenderId: "286545360696"
};

const app = initializeApp(firebaseConfig);

// 특정 에디션 스펙에 맞추어 Firestore를 마운트합니다.
export const db = getFirestore(app, "ai-studio-4dbbfc92-6d9a-4edd-87af-79a2c5d74d8c");
export const auth = getAuth(app);

// 백엔드가 없는 순수 프론트엔드 환경에서 Firestore 보안 규칙을 통과하기 위해,
// 어플리케이션 시작 시 백그라운드에서 익명 회원 인증을 즉시 체결합니다.
signInAnonymously(auth)
  .then(() => console.log("LinkLocker 익명 계정 인증 성공 (Real-time Synced)"))
  .catch((err) => console.error("Firebase 익명 회원가입 인증 오류:", err));

// 빌딩 구분 메타데이터
export const HUBS = {
  h1: { name: "학생회관 Hub", location: "학생회관 1층 로비 ATM 옆" },
  h2: { name: "학술정보관 Hub", location: "학술정보관 B1 로비 복도" },
  h3: { name: "제1공학관 Hub", location: "제1공학관 1층 로비 로토콘솔 앞" }
};

// 시연용 마스터 데이터셋
const DEFAULT_ITEMS = [
  { id: "item_airpods", name: "에어팟 프로 2세대", hubId: "h2", category: "전자기기", icon: "🎧" },
  { id: "item_wallet", name: "검은색 지갑", hubId: "h1", category: "지갑/가방", icon: "👛" },
  { id: "item_book", name: "프로그래밍 교재", hubId: "h3", category: "도서", icon: "📘" },
  { id: "item_idcard", name: "학생증", hubId: "h2", category: "학생증", icon: "🪪" }
];

// 데이터가 비었을 때 자동으로 시연 데이터를 데이터베이스에 채워 넣는 헬퍼 함수
export async function seedDatabaseIfEmpty() {
  try {
    const querySnapshot = await getDocs(collection(db, "items"));
    if (querySnapshot.empty) {
      console.log("Firestore 컬렉션이 비어 있어 시연용 초기 데이터를 구축합니다...");
      const batch = writeBatch(db);
      const now = Timestamp.now();
      
      DEFAULT_ITEMS.forEach((item) => {
        const docRef = doc(db, "items", item.id);
        batch.set(docRef, {
          ...item,
          status: "AVAILABLE",
          otp: null,
          createdAt: now,
          reservedAt: null,
          pickedUpAt: null
        });
      });
      
      await batch.commit();
      console.log("초기 분실물 데이터 적재가 완료되었습니다.");
    }
  } catch (error) {
    console.error("초기 데이터 적재 오류:", error);
  }
}
