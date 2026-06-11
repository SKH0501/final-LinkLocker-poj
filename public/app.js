// LinkLocker Mobile App Controller
// 이 스크립트는 user.html의 모든 UI 인터랙션과 실시간 Firestore 데이터 연동을 담당합니다.
import { db, HUBS, seedDatabaseIfEmpty } from "./firebase.js";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 상태 변수
let activeItemsList = [];
let selectedHubId = "all";
let selectedCategory = "all";
let searchQuery = "";
let selectedItemDetail = null;
let activeReservation = null;
let otpTimerSeconds = 180;
let timerIntervalId = null;

// 지도 인스턴스
let leafMap = null;
let markersGroup = {};

// DOM 요소 바인딩
const itemsListContainer = document.getElementById("items-list-container");
const listTotalTxt = document.getElementById("list-total-txt");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const btnShowAll = document.getElementById("btn-show-all");

// 예약 관련 바인딩
const reservationBanner = document.getElementById("reservation-banner");
const resLocationText = document.getElementById("res-location-text");
const otpCodeDisplay = document.getElementById("otp-code-display");
const reservationTimer = document.getElementById("reservation-timer");
const btnCancelReservation = document.getElementById("btn-cancel-reservation");
const pickupSuccessBanner = document.getElementById("pickup-success-banner");
const btnCloseSuccess = document.getElementById("btn-close-success");

// 모달 관련 바인딩
const detailModal = document.getElementById("detail-modal");
const modalIcon = document.getElementById("modal-icon");
const modalCategory = document.getElementById("modal-category");
const modalTitle = document.getElementById("modal-title");
const modalHub = document.getElementById("modal-hub");
const modalLoc = document.getElementById("modal-loc");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnReserveSubmit = document.getElementById("btn-reserve-submit");

// 빌딩 필터 버튼 바인딩
const filterHubAll = document.getElementById("filter-hub-all");
const filterHubH1 = document.getElementById("filter-hub-h1");
const filterHubH2 = document.getElementById("filter-hub-h2");
const filterHubH3 = document.getElementById("filter-hub-h3");

// 지도 정의 정보 (Hanyang ERICA)
const ERICA_LAT_LNG = [37.2965, 126.8344];
const MAP_HUBS_COORDS = {
  h1: { lat: 37.2954, lng: 126.8351, name: "학생회관 Hub" },
  h2: { lat: 37.2969, lng: 126.8336, name: "학술정보관 Hub" },
  h3: { lat: 37.2982, lng: 126.8346, name: "제1공학관 Hub" }
};

// 1. 초기 맵 활성화
function initLeafletMap() {
  try {
    leafMap = L.map("map-canvas").setView(ERICA_LAT_LNG, 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution: 'LinkLocker'
    }).addTo(leafMap);

    // 각 Hub별 동적 마커 덧붙임
    Object.entries(MAP_HUBS_COORDS).forEach(([id, hub]) => {
      const marker = L.marker([hub.lat, hub.lng]).addTo(leafMap);
      marker.bindTooltip(`<b>${hub.name}</b>`, { permanent: true, direction: "top", className: "font-semibold text-xs border-0 shadow" });
      
      marker.on("click", () => {
        applyHubFilter(id);
      });
      markersGroup[id] = marker;
    });
  } catch (error) {
    console.warn("지도 API 임포트 누락 또는 초기화 실패:", error);
  }
}

// 2. 실시간 Firestore 리스너 장착
function initFirestoreListener() {
  // 데이터베이스 인출이 비었는지 확인 후 자동 적재
  seedDatabaseIfEmpty();

  const q = query(collection(db, "items"));
  onSnapshot(q, (snapshot) => {
    activeItemsList = [];
    snapshot.forEach((doc) => {
      activeItemsList.push({ id: doc.id, ...doc.data() });
    });
    
    // UI 동적 반영
    renderItemsList();
    updateReservationStatus();
  });
}

// 3. 필터 제어 기믹들
function applyHubFilter(hubId) {
  selectedHubId = hubId;
  updatePillButtons();
  renderItemsList();

  if (hubId === "all") {
    btnShowAll.classList.add("hidden");
    if (leafMap) leafMap.setView(ERICA_LAT_LNG, 16);
  } else {
    btnShowAll.classList.remove("hidden");
    const coord = MAP_HUBS_COORDS[hubId];
    if (leafMap && coord) leafMap.flyTo([coord.lat, coord.lng], 17);
  }
}

function updatePillButtons() {
  const buttonsMap = {
    all: filterHubAll,
    h1: filterHubH1,
    h2: filterHubH2,
    h3: filterHubH3
  };

  Object.entries(buttonsMap).forEach(([id, btn]) => {
    if (id === selectedHubId) {
      btn.className = "bg-[#003C71] text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-sm whitespace-nowrap";
    } else {
      btn.className = "bg-white text-slate-500 border border-slate-200 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap";
    }
  });
}

// 4. 리스트 동적 렌더링
function renderItemsList() {
  itemsListContainer.innerHTML = "";
  
  // 조건 필터링
  const filtered = activeItemsList.filter((item) => {
    const matchesHub = selectedHubId === "all" || item.hubId === selectedHubId;
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesHub && matchesCategory && matchesSearch;
  });

  listTotalTxt.innerText = `보관된 분실물 (${filtered.length}개)`;

  if (filtered.length === 0) {
    itemsListContainer.innerHTML = `
      <div class="bg-white rounded-3xl p-8 border border-slate-150 flex flex-col justify-center items-center text-center gap-2">
        <span class="text-3xl">🗃️</span>
        <p class="text-xs text-slate-400 font-extrabold">조회조건과 일치하는 항목이 없습니다.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((item) => {
    const address = HUBS[item.hubId]?.name || "기타 보관소";
    let badgeClass = "bg-blue-600 text-white";
    let statusLabel = "보관 중";

    if (item.status === "RESERVED") {
      badgeClass = "bg-amber-500 text-white";
      statusLabel = "예약완료";
    } else if (item.status === "PICKED_UP") {
      badgeClass = "bg-slate-400 text-white";
      statusLabel = "수령완료";
    }

    const cardHtml = `
      <div class="item-card bg-white rounded-2xl border border-slate-200/60 p-3.5 flex items-center gap-3.5 hover:border-slate-350 cursor-pointer shadow-sm relative transition-all" data-id="${item.id}">
        <div class="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center text-2xl border border-slate-100 shadow-inner">
          ${item.icon || "📌"}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <span class="bg-slate-100 text-[#003C71] text-[9.5px] font-bold px-1.5 py-0.5 rounded-md truncate max-w-[120px]">${item.category}</span>
            <span class="text-[9px] font-black text-slate-400">하루 전</span>
          </div>
          <h5 class="font-extrabold text-sm text-slate-900 mt-1 truncate pr-16">${item.name}</h5>
          <div class="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 font-semibold">
            <span>📍</span> <span>${address}</span>
          </div>
        </div>
        <span class="absolute top-3 right-3 shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm ${badgeClass}">
          ${statusLabel}
        </span>
      </div>
    `;
    
    itemsListContainer.insertAdjacentHTML("beforeend", cardHtml);
  });

  // 카드 클릭 시 다이얼로그 바인딩
  document.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", () => {
      const itemId = card.getAttribute("data-id");
      openDetailModal(itemId);
    });
  });
}

// 5. 제품 모달창 처리
function openDetailModal(itemId) {
  selectedItemDetail = activeItemsList.find((i) => i.id === itemId);
  if (!selectedItemDetail) return;

  modalIcon.innerText = selectedItemDetail.icon || "📌";
  modalCategory.innerText = selectedItemDetail.category;
  modalTitle.innerText = selectedItemDetail.name;
  
  const hDetails = HUBS[selectedItemDetail.hubId] || { name: "알 수 없는 Hub", location: "정보 없음" };
  modalHub.innerText = hDetails.name;
  modalLoc.innerText = hDetails.location;

  // 상태 분기
  if (selectedItemDetail.status === "AVAILABLE") {
    btnReserveSubmit.classList.remove("hidden");
  } else {
    btnReserveSubmit.classList.add("hidden");
  }

  detailModal.classList.remove("hidden");
  detailModal.classList.add("flex");
}

function closeModal() {
  detailModal.className = "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center p-4";
  selectedItemDetail = null;
}

// 6. 예약 전송 (Reserve System)
async function submitReservation() {
  if (!selectedItemDetail) return;
  
  const itemId = selectedItemDetail.id;
  const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    btnReserveSubmit.innerText = "예약 요청 중...";
    btnReserveSubmit.disabled = true;

    const docRef = doc(db, "items", itemId);
    await updateDoc(docRef, {
      status: "RESERVED",
      otp: rawOtp,
      reservedAt: Timestamp.now()
    });

    // 상태 업데이트
    activeReservation = { ...selectedItemDetail, status: "RESERVED", otp: rawOtp };
    otpTimerSeconds = 180;
    startReservationTimer();

    closeModal();
  } catch (error) {
    console.error("예약 실패:", error);
    alert("예약에 실패했습니다. 다시 시도해 주세요.");
  } finally {
    btnReserveSubmit.innerText = "찾아가기 예약";
    btnReserveSubmit.disabled = false;
  }
}

// 7. 예약 상태 모니터링 데몬
function updateReservationStatus() {
  if (activeReservation) {
    const liveState = activeItemsList.find(i => i.id === activeReservation.id);
    if (liveState) {
      if (liveState.status === "PICKED_UP") {
        // 사물함에서 OTP를 맞춰서 수령을 체결했을 경우!
        stopReservationTimer();
        activeReservation = null;
        reservationBanner.classList.add("hidden");
        pickupSuccessBanner.classList.remove("hidden");
      } else if (liveState.status === "AVAILABLE") {
        // 예약이 타임아웃 등으로 유실되었을 때
        stopReservationTimer();
        activeReservation = null;
        reservationBanner.classList.add("hidden");
      }
    }
  }
}

// 8. 타이머 핸들링
function startReservationTimer() {
  stopReservationTimer();

  resLocationText.innerText = HUBS[activeReservation.hubId]?.name || "지정 스마트 사물함";
  otpCodeDisplay.innerText = activeReservation.otp;
  reservationBanner.classList.remove("hidden");

  timerIntervalId = setInterval(async () => {
    otpTimerSeconds -= 1;
    
    const minutes = Math.floor(otpTimerSeconds / 60);
    const seconds = otpTimerSeconds % 60;
    reservationTimer.innerText = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    if (otpTimerSeconds <= 0) {
      stopReservationTimer();
      // Firestore 데이터 만료 복원
      try {
        const docRef = doc(db, "items", activeReservation.id);
        await updateDoc(docRef, {
          status: "AVAILABLE",
          otp: null,
          reservedAt: null
        });
      } catch (err) {
        console.error("만료 예약 복구 오류:", err);
      }
      activeReservation = null;
      reservationBanner.classList.add("hidden");
    }
  }, 1000);
}

function stopReservationTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

// 9. 예약 수동 취소
async function cancelActiveReservation() {
  if (!activeReservation) return;

  if (confirm("정말로 찾아가기 예약을 취소하시겠습니까?")) {
    const backupId = activeReservation.id;
    stopReservationTimer();
    activeReservation = null;
    reservationBanner.classList.add("hidden");

    try {
      const docRef = doc(db, "items", backupId);
      await updateDoc(docRef, {
        status: "AVAILABLE",
        otp: null,
        reservedAt: null
      });
    } catch (error) {
      console.error("예약 취소 오류:", error);
    }
  }
}

// 10. 이벤트 연결 수집
function bindAppEvents() {
  // 필터 연결
  filterHubAll.addEventListener("click", () => applyHubFilter("all"));
  filterHubH1.addEventListener("click", () => applyHubFilter("h1"));
  filterHubH2.addEventListener("click", () => applyHubFilter("h2"));
  filterHubH3.addEventListener("click", () => applyHubFilter("h3"));
  btnShowAll.addEventListener("click", () => applyHubFilter("all"));

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderItemsList();
  });

  categoryFilter.addEventListener("change", (e) => {
    selectedCategory = e.target.value;
    renderItemsList();
  });

  // 모달 버튼 제어
  btnCloseModal.addEventListener("click", closeModal);
  btnReserveSubmit.addEventListener("click", submitReservation);
  btnCancelReservation.addEventListener("click", cancelActiveReservation);
  
  btnCloseSuccess.addEventListener("click", () => {
    pickupSuccessBanner.classList.add("hidden");
  });
}

// 11. 부트스트랩 실행
window.addEventListener("DOMContentLoaded", () => {
  initLeafletMap();
  initFirestoreListener();
  bindAppEvents();
});
