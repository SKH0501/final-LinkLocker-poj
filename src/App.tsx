import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  query,
  deleteDoc
} from "firebase/firestore";
import {
  Search,
  MapPin,
  Clock,
  Key,
  Unlock,
  CheckCircle,
  Smartphone,
  Cpu,
  RefreshCw,
  FolderOpen,
  Check,
  ShieldCheck,
  Building,
  RotateCcw,
  BookOpen,
  Tv,
  Inbox,
  Plus,
  Coins,
  Sparkles,
  Inbox as InboxIcon,
  HelpCircle,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, seedDatabaseIfEmpty, HUBS, type LostItem } from "./firebase";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function App() {
  // Navigation / Tabs based on User mockup
  const [demoMode, setDemoMode] = useState<"split" | "user" | "locker">("split");
  
  // Real-time Firestore items
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ----------------------------------------------------
  // Points & Profile States (Persisted in localStorage)
  // ----------------------------------------------------
  const [points, setPoints] = useState<number>(() => {
    const saved = localStorage.getItem("link_locker_points");
    return saved !== null ? Number(saved) : 1500;
  });

  const [myRentedItemIds, setMyRentedItemIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("link_locker_rented_ids") || "[]");
    } catch {
      return [];
    }
  });

  // Track point modification visuals
  const [pointAlert, setPointAlert] = useState<{ amount: number; type: "earn" | "spend" } | null>(null);

  useEffect(() => {
    localStorage.setItem("link_locker_points", points.toString());
  }, [points]);

  useEffect(() => {
    localStorage.setItem("link_locker_rented_ids", JSON.stringify(myRentedItemIds));
  }, [myRentedItemIds]);

  // Helper helper to alter points with animation feedback
  const adjustPoints = (amount: number) => {
    setPoints((prev) => {
      const next = prev + amount;
      setPointAlert({
        amount: Math.abs(amount),
        type: amount > 0 ? "earn" : "spend"
      });
      setTimeout(() => setPointAlert(null), 1500);
      return next;
    });
  };

  // ----------------------------------------------------
  // Student Mobile App States
  // ----------------------------------------------------
  const [selectedHubId, setSelectedHubId] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [activeReservation, setActiveReservation] = useState<LostItem | null>(null);
  const [otpTimer, setOtpTimer] = useState<number>(180); // 3 minutes in seconds

  // ----------------------------------------------------
  // Registration States (Lost item registration via App)
  // ----------------------------------------------------
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [regName, setRegName] = useState<string>("");
  const [regHubId, setRegHubId] = useState<string>("h2");
  const [regCategory, setRegCategory] = useState<string>("전자기기");
  const [regIcon, setRegIcon] = useState<string>("🎧");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto icon presets based on category
  useEffect(() => {
    switch (regCategory) {
      case "전자기기":
        setRegIcon("🎧");
        break;
      case "지갑/가방":
        setRegIcon("👛");
        break;
      case "도서":
        setRegIcon("📘");
        break;
      case "학생증/신분증":
        setRegIcon("🪪");
        break;
      default:
        setRegIcon("📦");
    }
  }, [regCategory]);

  // ----------------------------------------------------
  // Locker View Terminal States
  // ----------------------------------------------------
  const [lockerHubId, setLockerHubId] = useState<string>("h2"); // Default to Library Hub
  const [enteredOtp, setEnteredOtp] = useState<string>("");
  const [authSuccessItem, setAuthSuccessItem] = useState<LostItem | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDoorOpen, setIsDoorOpen] = useState<boolean>(false);
  const [unlockedBoxIndex, setUnlockedBoxIndex] = useState<number | null>(null);
  const [currentLockerTime, setCurrentLockerTime] = useState<string>("");
  const [activeLockerOp, setActiveLockerOp] = useState<"deposit" | "retrieve" | "rent">("retrieve");

  // Terminal actions panel state: "none", "register", "otp", "rent"
  const [terminalPanel, setTerminalPanel] = useState<"none" | "register" | "otp" | "rent">("none");

  // Terminal registration states
  const [termRegName, setTermRegName] = useState<string>("");
  const [termRegCategory, setTermRegCategory] = useState<string>("전자기기");
  const [termRegIcon, setTermRegIcon] = useState<string>("🎧");

  useEffect(() => {
    switch (termRegCategory) {
      case "전자기기":
        setTermRegIcon("🎧");
        break;
      case "지갑/가방":
        setTermRegIcon("👛");
        break;
      case "도서":
        setTermRegIcon("📘");
        break;
      case "학생증/신분증":
        setTermRegIcon("🪪");
        break;
      default:
        setTermRegIcon("📦");
    }
  }, [termRegCategory]);

  // Clock effect for terminal
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12;
      h = h ? h : 12;
      const minStr = m < 10 ? "0" + m : m;
      setCurrentLockerTime(`${h}:${minStr} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // ----------------------------------------------------
  // Leaflet Map Integration
  // ----------------------------------------------------
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    // Timeout to make sure DOM is fully completed
    const timer = setTimeout(() => {
      const container = document.getElementById("leaflet-map");
      if (!container) return;

      // Avoid double-initialization
      if ((container as any)._leaflet_id) return;

      const mapInstance = L.map("leaflet-map", {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false
      }).setView([37.2965, 126.8344], 16);

      mapRef.current = mapInstance;

      // Load Voyager theme style mapping
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19
      }).addTo(mapInstance);

      // Add building circles/markers
      Object.entries(HUBS).forEach(([id, hub]) => {
        const coords: [number, number] =
          id === "h1" ? [37.2954, 126.8350] :
          id === "h2" ? [37.2968, 126.8335] :
          [37.2980, 126.8345];

        // Active items count in this specific hub
        const count = items.filter(
          (item) => item.hubId === id && item.status === "AVAILABLE" && item.type !== "personal"
        ).length;

        const pinIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center w-[140px] h-[36px]">
              <!-- Ambient Neon Pulsing Halo -->
              <span class="absolute inline-flex w-[134px] h-7 rounded-full bg-[#FFAA00]/25 animate-ping opacity-60"></span>
              
              <!-- Premium Dark Hub Capsule -->
              <div class="relative flex items-center gap-1.5 bg-slate-950 border-2 border-[#FFAA00] text-white font-black py-1 px-2 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 w-full h-full cursor-pointer whitespace-nowrap">
                <!-- ID badge -->
                <span class="bg-[#FFAA00] text-slate-950 px-1.5 py-0.5 rounded-lg text-[9px] font-black tracking-tighter shadow-sm flex items-center justify-center h-5">
                  ${id.toUpperCase()}
                </span>
                
                <!-- Hub Name -->
                <span class="text-[10px] text-white font-black tracking-tight select-none flex-1 truncate text-left">
                  ${hub.name.split(" ")[0]}
                </span>
                
                <!-- Stock/Item Count Pin badge -->
                <span class="bg-rose-600 text-white min-w-[20px] h-5 flex items-center justify-center rounded-full text-[9px] font-black border border-rose-500/30 shadow px-1">
                  ${count}
                </span>
              </div>
            </div>
          `,
          className: "leaflet-custom-marker",
          iconSize: [140, 36],
          iconAnchor: [70, 18]
        });

        const marker = L.marker(coords, { icon: pinIcon }).addTo(mapInstance);
        
        marker.on("click", () => {
          setSelectedHubId(id);
        });
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [items, demoMode]);

  // ----------------------------------------------------
  // Syncing with Firestore & Bootstrapping
  // ----------------------------------------------------
  useEffect(() => {
    seedDatabaseIfEmpty();

    const q = query(collection(db, "items"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList: LostItem[] = [];
      snapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as LostItem);
      });
      setItems(itemsList);
      setLoading(false);
      
      // Sync active reservation state
      if (activeReservation) {
        const updated = itemsList.find(i => i.id === activeReservation.id);
        if (updated) {
          if (updated.status === "PICKED_UP") {
            setActiveReservation(updated);
          } else if (updated.status === "AVAILABLE") {
            setActiveReservation(null);
          } else {
            setActiveReservation(updated);
          }
        } else {
          setActiveReservation(null);
        }
      }
    }, (error) => {
      console.error("Firestore sync error: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeReservation]);

  // Timer countdown logic for reserved item
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if (activeReservation && activeReservation.status === "RESERVED" && otpTimer > 0) {
      timerInterval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            handleCancelReservation(activeReservation.id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [activeReservation, otpTimer]);

  // Helper: Find first vacant slot in a hub (0 to 29)
  const getFirstVacantSlot = (hubId: string) => {
    const occupied = items
      .filter((item) => item.hubId === hubId && item.status !== "PICKED_UP")
      .map((item) => item.slotIndex ?? -1);

    for (let i = 0; i < 30; i++) {
      if (!occupied.includes(i)) {
        return i;
      }
    }
    return -1; // Hub full
  };

  // ----------------------------------------------------
  // Business Actions (Synced, Durable)
  // ----------------------------------------------------

  // 1. Create client side reservation (Student App)
  const handleReserve = async (itemId: string) => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const itemRef = doc(db, "items", itemId);
      
      const now = Timestamp.now();
      await updateDoc(itemRef, {
        status: "RESERVED",
        otp: code,
        reservedAt: now
      });

      const target = items.find(i => i.id === itemId);
      if (target) {
        setActiveReservation({
          ...target,
          status: "RESERVED",
          otp: code,
          reservedAt: now
        });
        setOtpTimer(180);
      }
      setSelectedItem(null);
    } catch (err) {
      console.error("Reserve failed: ", err);
    }
  };

  // 2. Request Personal Storage Pickup OTP
  const handlePersonalPickupRequest = async (itemId: string) => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const itemRef = doc(db, "items", itemId);
      
      const now = Timestamp.now();
      await updateDoc(itemRef, {
        status: "RESERVED",
        otp: code,
        reservedAt: now
      });

      const target = items.find(i => i.id === itemId);
      if (target) {
        setActiveReservation({
          ...target,
          status: "RESERVED",
          otp: code,
          reservedAt: now
        });
        setOtpTimer(180);
      }
    } catch (err) {
      console.error("Personal pickup key generation error: ", err);
    }
  };

  // 3. Cancel active reservation
  const handleCancelReservation = async (itemId: string) => {
    try {
      const itemRef = doc(db, "items", itemId);
      await updateDoc(itemRef, {
        status: "AVAILABLE",
        otp: null,
        reservedAt: null
      });
      setActiveReservation(null);
    } catch (err) {
      console.error("Cancel reservation failed: ", err);
    }
  };

  // 4. Register a lost item (Student App or Cabinet)
  const handleRegisterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;

    setIsSubmitting(true);
    try {
      const slot = getFirstVacantSlot(regHubId);
      if (slot === -1) {
        alert("선택하신 Hub에 빈 사물함 공간이 없습니다.");
        setIsSubmitting(false);
        return;
      }

      const newId = `item_${Date.now()}`;
      const itemRef = doc(db, "items", newId);
      
      const newItem = {
        id: newId,
        name: regName.trim(),
        hubId: regHubId,
        category: regCategory,
        icon: regIcon,
        status: "AVAILABLE",
        otp: null,
        createdAt: Timestamp.now(),
        reservedAt: null,
        pickedUpAt: null,
        slotIndex: slot,
        type: "lost"
      };

      await setDoc(itemRef, newItem);
      
      // Earn 100 points reward!
      adjustPoints(100);

      setIsRegisterOpen(false);
      setRegName("");
      alert(`🎉 분실물이 정상 등록되었습니다!\n배정된 사물함: ${slot + 1}번\n보상: 100포인트 적립 완료!`);
    } catch (err) {
      console.error("Register item error: ", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Register a lost item directly from physical Terminal
  const handleTerminalRegister = async () => {
    if (!termRegName.trim()) {
      setAuthError("물건 이름을 입력해주세요.");
      return;
    }

    try {
      const slot = getFirstVacantSlot(lockerHubId);
      if (slot === -1) {
        setAuthError("현재 무인보관소가 만석입니다!");
        return;
      }

      const newId = `item_${Date.now()}`;
      const itemRef = doc(db, "items", newId);

      const newItem = {
        id: newId,
        name: termRegName.trim(),
        hubId: lockerHubId,
        category: termRegCategory,
        icon: termRegIcon,
        status: "AVAILABLE",
        otp: null,
        createdAt: Timestamp.now(),
        reservedAt: null,
        pickedUpAt: null,
        slotIndex: slot,
        type: "lost"
      };

      await setDoc(itemRef, newItem);
      
      // Award points for finding lost item
      adjustPoints(100);

      setTermRegName("");
      setTerminalPanel("none");
      setAuthError(null);
      
      // Trigger Door Animation simulation
      setUnlockedBoxIndex(slot);
      setAuthSuccessItem(newItem as LostItem);
      setActiveLockerOp("deposit");
      setIsDoorOpen(true);
    } catch (err) {
      console.error("Terminal register failed: ", err);
    }
  };

  // 6. Rent Personal Locker
  const handleRentPersonalLocker = async () => {
    if (points < 100) {
      alert("⚠️ 포인트가 부족합니다!\n(개인 사물함 1일 대여료: 100P, 분실물 등록 시 +100P가 적립됩니다)");
      return;
    }

    const slot = getFirstVacantSlot(lockerHubId);
    if (slot === -1) {
      alert("현재 선택된 Hub 무인보관소가 가득 차 이용 가능한 사물함이 없습니다.");
      return;
    }

    const confirmRent = window.confirm(
      `개인 보관용 사물함을 대여하시겠습니까?\n이용 요금: 100P\n배정 장소: ${HUBS[lockerHubId]?.name} [${slot + 1}번 보관칸]`
    );

    if (!confirmRent) return;

    try {
      const newId = `personal_${Date.now()}`;
      const itemRef = doc(db, "items", newId);

      const newPersonalItem = {
        id: newId,
        name: "개인 보관물품",
        hubId: lockerHubId,
        category: "기타",
        icon: "🎒",
        status: "AVAILABLE",
        otp: null,
        createdAt: Timestamp.now(),
        reservedAt: null,
        pickedUpAt: null,
        slotIndex: slot,
        type: "personal"
      };

      await setDoc(itemRef, newPersonalItem);
      
      // Add ID to rented list
      setMyRentedItemIds((prev) => [...prev, newId]);
      
      // Deduct points
      adjustPoints(-100);

      alert(`📁 대여 및 수납함 문이 열렸습니다!\n위치: ${HUBS[lockerHubId]?.name} [${slot + 1}번]\n사용 시작 완료.`);
      
      // Animation trigger
      setUnlockedBoxIndex(slot);
      setAuthSuccessItem(newPersonalItem as LostItem);
      setActiveLockerOp("rent");
      setIsDoorOpen(true);
    } catch (err) {
      console.error("Locker rental error: ", err);
    }
  };

  // 7. Physical Terminal verification via 6-digit OTP
  const handleVerifyOtp = async () => {
    setAuthError(null);
    if (enteredOtp.length !== 6) {
      setAuthError("비밀번호 6자리를 모두 입력해주세요.");
      return;
    }

    const matched = items.find(
      (item) =>
        item.hubId === lockerHubId &&
        item.otp === enteredOtp &&
        item.status === "RESERVED"
    );

    if (matched) {
      try {
        const slot = matched.slotIndex !== undefined ? matched.slotIndex : 12;
        setUnlockedBoxIndex(slot);
        setAuthSuccessItem(matched);
        setActiveLockerOp("retrieve");
        setIsDoorOpen(true);

        const itemRef = doc(db, "items", matched.id);

        if (matched.type === "personal") {
          // If retrieving active personal item, delete card or flag handled
          await deleteDoc(itemRef);
          setMyRentedItemIds((prev) => prev.filter(id => id !== matched.id));
          // Personal locker retrieval is free
        } else {
          // Lost item pickup
          await updateDoc(itemRef, {
            status: "PICKED_UP",
            pickedUpAt: Timestamp.now(),
            otp: null
          });
          // Deduct lost item delivery fee (-50 points)
          adjustPoints(-50);
        }

        setEnteredOtp("");
      } catch (err) {
        console.error("Verify confirm failed: ", err);
        setAuthError("데이터 처리 오류가 발생했습니다.");
      }
    } else {
      setAuthError("일치하는 예약 코드 정보가 없거나, 다른 Hub의 사물함입니다.");
    }
  };

  // Helper points refill for easy scenario demonstration
  const handlePointRefill = () => {
    adjustPoints(500);
    alert("🪙 데모용 테스트 포인트 500P가 충전되었습니다!");
  };

  // 8. Scenario Reset
  const handleRestockDatabase = async () => {
    setLoading(true);
    try {
      // Clear personal items registered by this user
      for (const item of items) {
        const ref = doc(db, "items", item.id);
        if (item.type === "personal") {
          await deleteDoc(ref);
        } else {
          await updateDoc(ref, {
            status: "AVAILABLE",
            otp: null,
            reservedAt: null,
            pickedUpAt: null
          });
        }
      }
      setPoints(1500);
      localStorage.setItem("link_locker_points", "1500");
      setMyRentedItemIds([]);
      localStorage.setItem("link_locker_rented_ids", "[]");

      setActiveReservation(null);
      setAuthSuccessItem(null);
      setIsDoorOpen(false);
      setUnlockedBoxIndex(null);
      setEnteredOtp("");
      setTerminalPanel("none");
      setAuthError(null);
      alert("🔄 분실물 데이터베이스와 포인트(1500P)가 초기 세팅으로 리셋되었습니다!");
    } catch (err) {
      console.error("Restock failed: ", err);
    }
    setLoading(false);
  };

  // Formatting for timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // ----------------------------------------------------
  // Calculated Lists & Grid parameters
  // ----------------------------------------------------
  const personalItems = items.filter(
    (item) => item.type === "personal" && item.status !== "PICKED_UP" && myRentedItemIds.includes(item.id)
  );

  const lostItems = items.filter(
    (item) => item.type !== "personal" && item.status !== "PICKED_UP"
  );

  const filteredLostItems = lostItems.filter((item) => {
    const matchesHub = selectedHubId === "all" || item.hubId === selectedHubId;
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesHub && matchesCat && matchesSearch;
  });

  // Calculate cabinet slots list for the selected Hub
  const currentHubItems = items.filter(
    (item) => item.hubId === lockerHubId && item.status !== "PICKED_UP"
  );

  const lockerSlots = Array.from({ length: 30 }, (_, idx) => {
    return currentHubItems.find(item => item.slotIndex === idx);
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-800 font-sans">
      
      {/* 1. Header Navigation - Styled strictly as requested and compliant with User mockup */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex flex-col sm:flex-row items-center justify-between gap-3 py-3 sm:py-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#002B5B] text-white p-2 rounded-xl font-bold text-xl leading-none shadow-sm flex items-center justify-center w-10 h-10">
                📦
              </div>
              <div>
                <span className="font-black text-lg tracking-tight text-[#002B5B] block leading-none">
                  LinkLocker
                </span>
                <span className="text-[9.5px] font-bold tracking-widest text-[#C5A059] uppercase">
                  ERICA Lost & Found
                </span>
              </div>
            </div>

            {/* TAB SECTOR CONTROLLERS */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-150 ml-4">
              <button
                onClick={() => setDemoMode("user")}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs transition duration-200 ${
                  demoMode === "user"
                    ? "bg-white text-[#002B5B] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                📱 앱 화면
              </button>
              <button
                onClick={() => setDemoMode("locker")}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs transition duration-200 ${
                  demoMode === "locker"
                    ? "bg-white text-[#002B5B] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                🔐 사물함 화면
              </button>
              <button
                onClick={() => setDemoMode("split")}
                className={`px-4 py-1.5 rounded-lg font-bold text-xs transition duration-200 hidden md:flex items-center gap-1 ${
                  demoMode === "split"
                    ? "bg-white text-[#002B5B] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Tv size={11} /> 분할 시계
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Indicator flag */}
            <button
              onClick={handleRestockDatabase}
              className="text-[10px] bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-500 py-1.5 px-3 rounded-lg font-bold tracking-tight transition active:scale-95 flex items-center gap-1"
              title="데이터베이스 및 포인트를 리셋합니다"
            >
              <RotateCcw size={11} /> 초기화
            </button>

            {/* Simulated user points display */}
            <div className="relative group">
              <div 
                onClick={handlePointRefill}
                className="bg-amber-100/80 text-amber-800 hover:bg-amber-100 border border-amber-200/50 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition active:scale-95"
                title="클릭 시 500포인트를 테스트용으로 충전합니다"
              >
                <Coins size={14} className="text-amber-600 animate-spin" style={{ animationDuration: '6s' }} />
                <span>🪙</span>
                <span className="font-mono text-slate-800">{points.toLocaleString()}</span>
                <span className="text-[10px] text-amber-700 font-extrabold ml-1">P</span>
              </div>

              {/* Point alert bubble */}
              <AnimatePresence>
                {pointAlert && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: -20, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute left-1/2 -translate-x-1/2 -top-4 font-black text-xs px-2.5 py-1 rounded-full shadow-lg ${
                      pointAlert.type === "earn"
                        ? "bg-emerald-500 text-white"
                        : "bg-red-500 text-white"
                    }`}
                  >
                    {pointAlert.type === "earn" ? "+" : "-"}
                    {pointAlert.amount}P
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile detail */}
            <div className="flex items-center gap-2 cursor-pointer border border-slate-100 hover:bg-slate-50 p-1.5 px-3 rounded-xl transition">
              <div className="w-7 h-7 bg-[#002B5B] text-white rounded-lg flex items-center justify-center font-bold text-xs shadow-sm">
                S
              </div>
              <span className="font-extrabold text-xs text-[#002B5B] hidden sm:block">Seo 님</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:px-8 flex flex-col justify-start">
        {loading ? (
          <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
            <RefreshCw className="animate-spin text-[#002B5B]" size={36} />
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
              ERICA 안전 서버 DB와 실시간 연결 중...
            </p>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* ========================================================
                1. APP VIEW - STUDENT MOBILE PORTFOLIO DASHBOARD
               ======================================================== */}
            {(demoMode === "split" || demoMode === "user") && (
              <div
                className={`flex flex-col relative transition-all duration-300 ${
                  demoMode === "split" ? "lg:col-span-6 h-[80vh]" : "lg:col-span-12 h-[82vh]"
                }`}
              >
                {/* Visual Section Frame Tag */}
                <div className="flex justify-between items-center mb-2 px-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Smartphone size={11} /> 1. ERICA Student App Active View
                  </h3>
                  <span className="text-[9px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-inner text-[#002B5B] font-extrabold">
                    /app/dashboard
                  </span>
                </div>

                <div className="flex-1 bg-white rounded-3xl border border-slate-250 shadow-md relative overflow-hidden flex flex-col sm:flex-row">
                  
                  {/* LEFT: MAP ZONE & CLASSIFIED FILTERS */}
                  <div className="flex-1 p-4 flex flex-col justify-between border-r border-slate-100 min-h-0 overflow-y-auto">
                    <div className="space-y-4">
                      {/* Leaflet Live Map Section */}
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 shadow-inner relative space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-extrabold text-xs text-[#002B5B] flex items-center gap-1.5">
                            <MapPin size={14} /> 한양대학교 ERICA 캠퍼스 분실물 지도
                          </h4>
                          {selectedHubId !== "all" && (
                            <button
                              onClick={() => setSelectedHubId("all")}
                              className="text-[9.5px] text-white bg-slate-650 hover:bg-slate-700 font-extrabold px-2 py-0.5 rounded"
                            >
                              전체보기
                            </button>
                          )}
                        </div>
                        
                        {/* Leaflet Target DOM Node */}
                        <div className="relative w-full h-[220px] rounded-xl overflow-hidden border border-slate-150 shadow-sm bg-slate-200">
                          <div id="leaflet-map" className="w-full h-full" style={{ zIndex: 10 }}></div>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold px-1">
                          <span>💡 지도의 빌딩마커를 클릭하면 해당 무인 Hub에 보관된 품목들만 필터링됩니다.</span>
                        </div>
                      </div>

                      {/* Filter Row */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                            <input
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="분실물 이름을 검색해 보세요..."
                              className="w-full bg-[#F8FAFC] border border-slate-200/80 text-xs rounded-xl pl-8.5 pr-2.5 py-2 outline-none focus:border-[#002B5B] focus:bg-white transition"
                            />
                          </div>
                          
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-2 outline-none cursor-pointer text-slate-700 focus:border-[#002B5B] font-bold"
                          >
                            <option value="all">모든 카테고리</option>
                            <option value="전자기기">🎧 전자기기</option>
                            <option value="지갑/가방">👛 지갑/가방</option>
                            <option value="도서">📘 도서</option>
                            <option value="학생증/신분증">🪪 학생증/신분증</option>
                            <option value="기타">📦 기타</option>
                          </select>
                        </div>

                        {/* Hub pills */}
                        <div className="flex gap-1.5 items-center overflow-x-auto pb-1.5 scrollbar-none text-[10.5px]">
                          <span className="text-slate-400 font-bold shrink-0 text-[10px]">보관소:</span>
                          <button
                            onClick={() => setSelectedHubId("all")}
                            className={`px-3 py-1 rounded-full font-bold tracking-tight transition whitespace-nowrap ${
                              selectedHubId === "all" ? "bg-[#002B5B] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            전체
                          </button>
                          {Object.entries(HUBS).map(([id, hub]) => (
                            <button
                              key={id}
                              onClick={() => setSelectedHubId(id)}
                              className={`px-3 py-1 rounded-full font-bold tracking-tight transition whitespace-nowrap ${
                                selectedHubId === id ? "bg-[#002B5B] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {hub.name.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Direct Items visual list */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10.5px] text-slate-450 font-bold uppercase tracking-wider">
                          <span>분실물 목록 ({filteredLostItems.length})</span>
                          {selectedHubId !== "all" && <span className="text-[#002B5B]">{HUBS[selectedHubId]?.name.split(" ")[0]} 필터 중</span>}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[220px] overflow-y-auto pr-1">
                          {filteredLostItems.length === 0 ? (
                            <div className="col-span-full py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
                              <InboxIcon size={24} className="text-slate-300" />
                              <p className="text-xs text-slate-400 font-bold">보관 보관소에 해당하는 분실물이 없습니다.</p>
                            </div>
                          ) : (
                            filteredLostItems.map((item) => (
                              <div
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-3 bg-white hover:border-blue-300 focus:border-blue-400 transition cursor-pointer shadow-inner-xs text-left ${
                                  item.status === "RESERVED"
                                    ? "border-amber-200/80 bg-amber-50/20"
                                    : "border-slate-150"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl shadow-inner border border-slate-100">
                                    {item.icon}
                                  </div>
                                  <div>
                                    <h5 className="font-bold text-xs text-slate-800 leading-tight line-clamp-1">
                                      {item.name}
                                    </h5>
                                    <p className="text-[10px] text-slate-450 mt-1 font-bold flex items-center gap-1">
                                      <span>📍</span> {HUBS[item.hubId]?.name.split(" ")[0]} [{(item.slotIndex ?? 0) + 1}번]
                                    </p>
                                  </div>
                                </div>

                                <span className={`text-[9px] font-black uppercase tracking-wider py-1 px-2 rounded-full ${
                                  item.status === "RESERVED"
                                    ? "bg-amber-500 text-white"
                                    : "bg-emerald-500 text-white"
                                }`}>
                                  {item.status === "RESERVED" ? "예약대기" : "보관중"}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: PERSONAL LOCKER & RECENT SIDEBAR */}
                  <div className="w-full sm:w-76 p-4 bg-slate-50/50 flex flex-col justify-between shrink-0 border-t sm:border-t-0 border-slate-100 min-h-0 overflow-y-auto">
                    <div className="space-y-4">
                      
                      {/* Personal storage lists */}
                      <div className="space-y-2.5">
                        <h4 className="font-bold text-xs text-[#002B5B] flex items-center justify-between">
                          <span>📦 내 보관품 (Personal Items)</span>
                          <span className="bg-[#C5A059]/20 text-[#C5A059] text-[9.5px] px-2 py-0.5 rounded font-black">
                            {personalItems.length}개
                          </span>
                        </h4>

                        <div className="space-y-2">
                          {personalItems.length === 0 ? (
                            <div className="bg-white rounded-xl p-4 text-center border border-slate-150 text-slate-400">
                              <p className="text-[11px] font-bold">임대보관 중인 물건이 없습니다.</p>
                              <p className="text-[9.5px] text-slate-400 mt-1">사물함에서 개인 사물함 대여 시 여기에 리스팅됩니다.</p>
                            </div>
                          ) : (
                            personalItems.map((item) => (
                              <div
                                key={item.id}
                                className="bg-amber-50/40 border border-amber-200 p-3 rounded-xl flex items-center justify-between gap-2 shadow-inner-xs text-left"
                              >
                                <div>
                                  <h5 className="font-extrabold text-xs text-[#002B5B]">
                                    개인 보관 중 {item.icon}
                                  </h5>
                                  <p className="text-[9.5px] text-slate-550 mt-1 font-bold">
                                    {HUBS[item.hubId]?.name.split(" ")[0]} [{(item.slotIndex ?? 0) + 1}번]
                                  </p>
                                </div>

                                {item.status === "RESERVED" ? (
                                  <span className="bg-amber-500 text-white text-[9px] font-bold px-2 py-1 rounded-md">
                                    인증 진행중
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handlePersonalPickupRequest(item.id)}
                                    className="bg-amber-500 text-white text-[9.5px] font-black px-3 py-1.5 rounded-lg hover:bg-amber-600 shadow transition"
                                  >
                                    수령하기
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* ACTIVE RESERVATION OTP AREA */}
                      <AnimatePresence>
                        {activeReservation && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-blue-50/60 border-2 border-[#002B5B] rounded-2xl p-3.5 space-y-3"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-black text-xs text-[#002B5B] leading-tight">
                                  {activeReservation.type === "personal" ? "🔑 개인 보관물 수령 인증" : "🎒 분실물 수거 인증키"}
                                </h4>
                                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-none">
                                  {HUBS[activeReservation.hubId]?.name.split(" ")[0]} [{(activeReservation.slotIndex ?? 0) + 1}번]
                                </p>
                              </div>
                              <button
                                onClick={() => handleCancelReservation(activeReservation.id)}
                                className="text-[10px] text-red-500 font-bold hover:underline"
                              >
                                예약취소
                              </button>
                            </div>

                            <div className="bg-white rounded-xl p-3 text-center border border-blue-100 shadow-sm relative overflow-hidden">
                              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Your Locker OTP</p>
                              <p className="text-2xl font-mono font-black text-[#002B5B] tracking-[0.25em] bg-slate-50 py-2 rounded-lg border border-slate-100">
                                {activeReservation.otp}
                              </p>
                              
                              <div className="w-full h-1 bg-slate-100 mt-3 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#002B5B] transition-all"
                                  style={{ width: `${(otpTimer / 180) * 100}%` }}
                                ></div>
                              </div>
                              <p className="text-[9px] text-slate-400 mt-1.5 flex justify-between font-bold">
                                <span>유효시간</span>
                                <span className="font-mono text-[#002B5B]">{formatTime(otpTimer)}</span>
                              </p>
                            </div>

                            <p className="text-[9px] text-slate-400 leading-normal font-bold">
                              ⚠️ 사물함 기기의 화면에서 위 일회용 비밀번호를 입력하면 바로 보관함 문이 열리게 됩니다.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Quick FAQ / Helper */}
                      <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-slate-500 space-y-1.5">
                        <h5 className="font-bold text-[10px] text-slate-700 flex items-center gap-1">
                          <Info size={11} /> <strong>LinkLocker 학생 가이드</strong>
                        </h5>
                        <ul className="text-[9.5px] list-disc list-inside space-y-1 pl-1 font-bold text-slate-500 leading-relaxed">
                          <li>습득물 등록 완료 시 <span className="text-emerald-600">+100P</span> 획득</li>
                          <li>분실한 내 소유품 수령 시 <span className="text-red-500">-50P</span> 차감</li>
                          <li>임시 사물함 1일 임대 시 <span className="text-[#C5A059]">-100P</span> 대여료 발생</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ========================================================
                2. TERMINAL VIEW - PHYSICAL ROBOTIC CABINET TERMINAL
               ======================================================== */}
            {(demoMode === "split" || demoMode === "locker") && (
              <div
                className={`flex flex-col relative transition-all duration-300 ${
                  demoMode === "split" ? "lg:col-span-6 h-[80vh]" : "lg:col-span-12 h-[82vh]"
                }`}
              >
                {/* Visual Section Frame Tag */}
                <div className="flex justify-between items-center mb-2 px-1">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Cpu size={11} /> 2. ERICA SMART HUB LOCKER CABINET
                  </h3>
                  <div className="flex items-center gap-1 text-[9.5px] font-bold text-slate-400 uppercase font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>HARDWARE ONLINE</span>
                  </div>
                </div>

                <div className="flex-1 bg-[#1E293B] border-[12px] border-[#314158] rounded-4xl shadow-2xl relative overflow-hidden flex flex-col justify-between">
                  
                  {/* Locker Header */}
                  <div className="bg-zinc-950 p-4 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-2 border-b border-slate-850">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
                      <h4 className="font-extrabold text-white text-sm tracking-widest select-none">
                        SMART STATION TERMINAL
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded">
                        🕒 {currentLockerTime || "12:00 PM"}
                      </span>
                      
                      <select
                        value={lockerHubId}
                        onChange={(e) => {
                          setLockerHubId(e.target.value);
                          setAuthSuccessItem(null);
                          setEnteredOtp("");
                          setAuthError(null);
                          setIsDoorOpen(false);
                          setUnlockedBoxIndex(null);
                          setTerminalPanel("none");
                        }}
                        className="bg-slate-900 text-white border border-slate-700 text-xs py-1 px-3 rounded cursor-pointer font-bold select-none focus:border-[#C5A059] outline-none"
                      >
                        <option value="h1" className="bg-[#1e293b] text-white">학생회관 Hub (H1)</option>
                        <option value="h2" className="bg-[#1e293b] text-white">학술정보관 Hub (H2)</option>
                        <option value="h3" className="bg-[#1e293b] text-white">제1공학관 Hub (H3)</option>
                      </select>
                    </div>
                  </div>

                  {/* Operational Cabinet Box Container */}
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col sm:flex-row gap-4 items-stretch bg-[#111827]">
                    
                    {/* LEFT COMPARTMENT BOARD (30 LOTS) */}
                    <div className="flex-1 bg-slate-900/50 p-3.5 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="font-extrabold text-[10.5px] text-[#C5A059] tracking-wider uppercase">
                            스마트 사물함 컴파트먼트 (30 Slots)
                          </h5>
                          <span className="bg-[#C5A059] text-[#002B5B] text-[9.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {HUBS[lockerHubId]?.name.split(" ")[0]}
                          </span>
                        </div>

                        {/* 5 columns x 6 rows = 30 grids matching User mockup */}
                        <div className="grid grid-cols-5 gap-1.5">
                          {lockerSlots.map((item, index) => {
                            const isSelectedLocker = unlockedBoxIndex === index && isDoorOpen;

                            let styling = "bg-slate-800/60 border-slate-700/80 text-slate-400";
                            let visualLabel = `${index + 1}`;
                            let cellIcon = "🔒";

                            if (item) {
                              if (item.type === "personal") {
                                styling = "bg-amber-950/40 border-amber-500/80 text-amber-500 shadow-[0_0_8px_rgba(234,179,8,0.25)]";
                                visualLabel = "보관";
                                cellIcon = "🎒";
                              } else {
                                styling = "bg-blue-950/40 border-blue-500/80 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.25)]";
                                visualLabel = item.icon || "📦";
                                cellIcon = "🎧";
                              }
                            }

                            if (isSelectedLocker) {
                              styling = "bg-green-500/15 border-green-500 animate-pulse text-green-500";
                              visualLabel = "열림";
                              cellIcon = "🔓";
                            }

                            return (
                              <div
                                key={index}
                                className={`aspect-square border rounded-lg flex flex-col items-center justify-between p-1 select-none transition duration-200 relative ${styling}`}
                              >
                                <span className="text-[7.5px] font-bold font-mono opacity-50 block leading-none">
                                  #{index + 1}
                                </span>
                                
                                <div className="text-sm my-0.5 flex items-center justify-center">
                                  {isSelectedLocker ? "🔓" : item ? (item.type === "personal" ? "🎒" : item.icon) : ""}
                                </div>

                                <span className="text-[7px] font-extrabold truncate max-w-full leading-none opacity-80">
                                  {isSelectedLocker ? "Door Open" : item ? (item.type === "personal" ? "임대차" : "습득분") : "공실"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-3.5 border-t border-slate-800/80 pt-2 text-[9px] text-slate-400 font-bold flex items-center gap-1">
                        <span className="text-[#C5A059]">📍</span>
                        <span>실시간 보관 장소: {HUBS[lockerHubId]?.location}</span>
                      </div>
                    </div>

                    {/* RIGHT HARDWARE CONTROLLER PANEL */}
                    <div className="w-full sm:w-64 bg-slate-950 border border-slate-850 p-3.5 rounded-2xl flex flex-col justify-between">
                      
                      <div className="space-y-4">
                        <h4 className="text-white font-black text-xs text-center border-b border-slate-800 pb-2 uppercase tracking-widest text-[#C5A059]">
                          보관소 메인 액션
                        </h4>

                        {/* Actions preset layout exactly matching mockup */}
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            onClick={() => {
                              setTerminalPanel("register");
                              setTermRegName("");
                              setAuthError(null);
                            }}
                            className={`py-3.5 rounded-xl font-bold text-xs transition duration-200 flex flex-col items-center justify-center border ${
                              terminalPanel === "register"
                                ? "bg-blue-600 text-white border-blue-400"
                                : "bg-slate-900 border-slate-800 text-blue-400 hover:bg-slate-850"
                            }`}
                          >
                            <span className="text-xl">📥</span>
                            <span className="mt-1 leading-none">분실물 등록 (+100P)</span>
                          </button>

                          <button
                            onClick={() => {
                              setTerminalPanel("otp");
                              setEnteredOtp("");
                              setAuthError(null);
                            }}
                            className={`py-3.5 rounded-xl font-bold text-xs transition duration-200 flex flex-col items-center justify-center border  ${
                              terminalPanel === "otp"
                                ? "bg-amber-600 text-white border-amber-400"
                                : "bg-slate-900 border-slate-800 text-amber-500 hover:bg-slate-850"
                            }`}
                          >
                            <span className="text-xl">🔑</span>
                            <span className="mt-1 leading-none">물건 찾기 (OTP 검증)</span>
                          </button>

                           <button
                             onClick={() => {
                               setTerminalPanel("rent");
                               setAuthError(null);
                             }}
                             className={`py-3.5 rounded-xl font-bold text-xs transition duration-200 flex flex-col items-center justify-center border ${
                               terminalPanel === "rent"
                                 ? "bg-rose-600 text-white border-rose-400"
                                 : "bg-slate-900 border-slate-800 text-rose-400 hover:bg-slate-850"
                             }`}
                           >
                             <span className="text-xl">🎒</span>
                             <span className="mt-1 leading-none">개인 사물함 대여 (-100P)</span>
                           </button>
                        </div>

                        {/* Interactive dynamic sub-panels */}
                        <AnimatePresence mode="wait">
                          {terminalPanel === "register" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-2 text-left"
                            >
                              <h5 className="font-extrabold text-[10.5px] text-white">📦 새 습득물 보관 접수</h5>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={termRegName}
                                  onChange={(e) => setTermRegName(e.target.value)}
                                  placeholder="물건 이름 (예: 아이폰15)"
                                  className="w-full bg-slate-850 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-blue-500"
                                />

                                <div className="grid grid-cols-2 gap-1.5">
                                  <select
                                    value={termRegCategory}
                                    onChange={(e) => setTermRegCategory(e.target.value)}
                                    className="bg-slate-850 text-white border border-slate-700 text-[10.5px] rounded-lg px-2 py-1.5 font-bold cursor-pointer outline-none focus:border-blue-500"
                                  >
                                    <option value="전자기기" className="bg-[#1e293b] text-white">🎧 전자기기</option>
                                    <option value="지갑/가방" className="bg-[#1e293b] text-white">👛 지갑/가방</option>
                                    <option value="도서" className="bg-[#1e293b] text-white">📘 도서</option>
                                    <option value="학생증/신분증" className="bg-[#1e293b] text-white">🪪 학생증/신분증</option>
                                    <option value="기타" className="bg-[#1e293b] text-white">기타 (📦)</option>
                                  </select>

                                  <div className="bg-slate-850 flex items-center justify-center text-lg rounded-lg border border-slate-700">
                                    {termRegIcon}
                                  </div>
                                </div>

                                <button
                                  onClick={handleTerminalRegister}
                                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg text-[11px] font-black tracking-widest transition shadow"
                                >
                                  등록 완료 및 보관함 열기
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {terminalPanel === "rent" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 space-y-3.5 text-left"
                            >
                              <div>
                                <h5 className="font-extrabold text-[10.5px] text-white flex items-center gap-1.5 uppercase tracking-wider text-rose-450">
                                  🎒 개인 사물함 대여 신청
                                </h5>
                                <p className="text-[10px] text-slate-450 mt-1">
                                  선택된 보관소: <strong className="text-slate-200 font-semibold">{HUBS[lockerHubId]?.name}</strong>
                                </p>
                              </div>
                              
                              <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-[11px] text-slate-350 space-y-2">
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>1일 이용 금액</span>
                                  <span className="font-black text-rose-400 font-mono">- 100 P</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400 font-bold">
                                  <span>현재 보유 포인트</span>
                                  <span className="font-black text-amber-500 font-mono">{points.toLocaleString()} P</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-slate-900/65">
                                  <span>배정 예정 보관함</span>
                                  {getFirstVacantSlot(lockerHubId) !== -1 ? (
                                    <span className="font-bold text-white bg-[#1e293b] border border-slate-800 px-2.5 py-0.5 rounded text-[10px] font-mono">
                                      {getFirstVacantSlot(lockerHubId) + 1}번 보관함
                                    </span>
                                  ) : (
                                    <span className="font-black text-red-500">
                                      보관고 만석
                                    </span>
                                  )}
                                </div>
                              </div>

                              {authError && (
                                <p className="text-[9.5px] font-bold text-red-400 leading-normal bg-red-955/45 py-2 px-2.5 rounded-lg border border-red-900/50">
                                  ⚠️ {authError}
                                </p>
                              )}

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTerminalPanel("none");
                                    setAuthError(null);
                                  }}
                                  className="flex-1 bg-slate-850 hover:bg-slate-800 text-slate-400 py-2 rounded-lg text-xs font-bold transition outline-none border border-slate-800"
                                >
                                  이전으로
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setAuthError(null);
                                    if (points < 100) {
                                      setAuthError("포인트가 부족합니다! (대여료: 100P)\n습득물 기증 등으로 포인트를 충전해 주세요.");
                                      return;
                                    }
                                    const slot = getFirstVacantSlot(lockerHubId);
                                    if (slot === -1) {
                                      setAuthError("현재 무인보관소가 만석이라 사물함을 배정할 수 없습니다.");
                                      return;
                                    }
                                    
                                    try {
                                      const newId = `personal_${Date.now()}`;
                                      const itemRef = doc(db, "items", newId);
                                      
                                      const newPersonalItem = {
                                        id: newId,
                                        name: "개인 보관물품",
                                        hubId: lockerHubId,
                                        category: "기타",
                                        icon: "🎒",
                                        status: "AVAILABLE",
                                        otp: null,
                                        createdAt: Timestamp.now(),
                                        reservedAt: null,
                                        pickedUpAt: null,
                                        slotIndex: slot,
                                        type: "personal"
                                      };

                                      await setDoc(itemRef, newPersonalItem);
                                      setMyRentedItemIds((prev) => [...prev, newId]);
                                      adjustPoints(-100);

                                      setTerminalPanel("none");
                                      setUnlockedBoxIndex(slot);
                                      setAuthSuccessItem(newPersonalItem as LostItem);
                                      setActiveLockerOp("rent");
                                      setIsDoorOpen(true);
                                    } catch (err) {
                                      console.error("Locker rental error: ", err);
                                      setAuthError("네트워크 신호가 약해 처리에 실패했습니다.");
                                    }
                                  }}
                                  className="flex-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white py-2 rounded-lg text-xs font-black tracking-wide transition shadow outline-none border border-rose-500"
                                >
                                  사물함 대여 및 문열기
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {terminalPanel === "otp" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-3"
                            >
                              <div className="text-center font-bold">
                                <span className="text-[7.5px] font-mono tracking-widest text-[#C5A059] block uppercase">ENTER SECURITY PASSCODE</span>
                                <p className="text-[9.5px] text-slate-400 mt-1 leading-none">수령 암호 6자리를 누르세요</p>
                              </div>

                              {/* individual pin display */}
                              <div className="flex justify-center gap-1">
                                {[0, 1, 2, 3, 4, 5].map((i) => {
                                  const char = enteredOtp[i];
                                  return (
                                    <div
                                      key={i}
                                      className={`w-7 h-9 border rounded-lg flex items-center justify-center text-xs font-mono font-black ${
                                        char
                                          ? "border-amber-400 bg-amber-500/10 text-amber-400"
                                          : "border-slate-800 bg-slate-900 text-slate-600"
                                      }`}
                                    >
                                      {char || ""}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Tactile keypad buttons code matching mockup */}
                              <div className="grid grid-cols-3 gap-1 px-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                  <button
                                    key={num}
                                    onClick={() => {
                                      if (enteredOtp.length < 6) {
                                        setEnteredOtp((prev) => prev + num);
                                        setAuthError(null);
                                      }
                                    }}
                                    className="bg-slate-850 hover:bg-slate-800 border border-slate-800 text-white py-1.5 rounded font-black text-xs active:scale-95 transition"
                                  >
                                    {num}
                                  </button>
                                ))}
                                <button
                                  onClick={() => {
                                    setEnteredOtp((prev) => prev.slice(0, -1));
                                    setAuthError(null);
                                  }}
                                  className="bg-slate-800 border border-slate-750 text-slate-400 font-extrabold text-[9px] py-1.5 rounded active:scale-95 text-center transition"
                                >
                                  C
                                </button>
                                <button
                                  onClick={() => {
                                    if (enteredOtp.length < 6) {
                                      setEnteredOtp((prev) => prev + "0");
                                      setAuthError(null);
                                    }
                                  }}
                                  className="bg-slate-850 hover:bg-slate-800 border border-slate-800 text-white py-1.5 rounded font-black text-xs active:scale-95 transition"
                                >
                                  0
                                </button>
                                <button
                                  onClick={handleVerifyOtp}
                                  className="bg-[#C5A059] text-slate-950 font-black text-[9px] py-1.5 rounded active:scale-95 text-center transition tracking-widest shadow"
                                >
                                  확인
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {authError && (
                          <div className="bg-red-500/10 border border-red-500/25 p-2 text-[9.5px] text-red-400 font-bold text-center rounded-lg leading-normal">
                            ⚠️ {authError}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 border-t border-slate-850 pt-2.5 text-[8px] text-slate-500 font-bold text-center tracking-wider">
                        SECURITY LOCK: SYSTEM INTEGRITY ASSURED
                      </div>

                    </div>
                  </div>

                  {/* CABINET UNLOCk OVERLAY EVENT SIMULATOR */}
                  <AnimatePresence>
                    {authSuccessItem && isDoorOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 z-30"
                      >
                        <motion.div
                          initial={{ scale: 0.9, y: 10 }}
                          animate={{ scale: 1, y: 0 }}
                          exit={{ scale: 0.9, y: 10 }}
                          className="max-w-xs w-full bg-[#1E293B] border-2 border-green-500 rounded-3xl p-5 text-center shadow-2xl relative text-white space-y-4"
                        >
                          <div className="w-14 h-14 bg-green-500/20 text-green-400 rounded-2xl flex items-center justify-center mx-auto border border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)] animate-pulse">
                            <Unlock size={24} />
                          </div>

                          <div>
                            <h4 className="font-extrabold text-base text-white">
                              {activeLockerOp === "deposit" && "📥 신규 보관 접수! 격실 도어 오픈"}
                              {activeLockerOp === "rent" && "🎒 사물함 대여 성공! 격실 도어 오픈"}
                              {activeLockerOp === "retrieve" && "🔓 인증성공! 격실 도어 오픈"}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {activeLockerOp === "deposit" && "배정된 번호의 사물함에 습득하신 물품을 보관해 주십시오."}
                              {activeLockerOp === "rent" && "배정된 수납함에 보관하고 싶은 소지품을 수납하십시오."}
                              {activeLockerOp === "retrieve" && "지정된 번호에서 물품을 확인해 찾아가십시오."}
                            </p>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-inner text-center">
                            <span className="text-[8px] text-slate-500 block font-bold uppercase tracking-widest">
                              {activeLockerOp === "deposit" && "배정된 보관 사물함"}
                              {activeLockerOp === "rent" && "대여된 사물함 격실"}
                              {activeLockerOp === "retrieve" && "배정된 사물함 격실"}
                            </span>
                            <span className="text-3xl font-mono font-black text-[#C5A059] tracking-wider block mt-1">
                              Box {(unlockedBoxIndex !== null ? unlockedBoxIndex + 1 : 12)}
                            </span>
                            <div className="pt-2 border-t border-slate-800 text-[11px] mt-2 text-slate-300 font-semibold max-w-full truncate">
                              <p className="font-extrabold">{authSuccessItem.name}</p>
                              <p className="text-[9px] text-slate-500 mt-0.5">카테고리: {authSuccessItem.category}</p>
                            </div>
                          </div>

                          <div className="text-[9.5px] text-green-400 font-extrabold leading-normal bg-green-500/10 py-2 px-3 rounded-lg border border-green-500/20">
                            {activeLockerOp === "deposit" && "📢 기증 등록으로 +100P가 적립되었습니다."}
                            {activeLockerOp === "rent" && "📢 사물함 대여료로 -100P가 차감되었습니다."}
                            {activeLockerOp === "retrieve" && "📢 수령 완료 후 보관소 도어를 밀어 완전히 닫아주십시오."}
                          </div>

                          <button
                            onClick={() => {
                              setAuthSuccessItem(null);
                              setIsDoorOpen(false);
                              setUnlockedBoxIndex(null);
                            }}
                            className="w-full bg-[#002B5B] hover:bg-[#001F41] border border-slate-850 py-3 rounded-xl font-bold text-xs text-white transition shadow-sm uppercase tracking-wider"
                          >
                            닫기 및 완료 (Door Closed)
                          </button>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              </div>
            )}

          </div>
        )}
      </main>

      {/* DETAIL DIALOG DRAWERS */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100/80 max-w-sm w-full relative z-10 p-6 text-slate-800"
            >
              <div className="text-center space-y-4">
                <div className="w-14 h-14 bg-[#F8FAFC] rounded-2xl mx-auto flex items-center justify-center text-4xl shadow-inner border border-slate-100">
                  {selectedItem.icon}
                </div>
                
                <div>
                  <span className="bg-[#002B5B]/5 text-[#002B5B] px-2.5 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase tracking-widest">
                    {selectedItem.category}
                  </span>
                  <h3 className="font-extrabold text-base text-slate-850 mt-2">{selectedItem.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">등록 보관: 24h ago (Stored)</p>
                </div>

                <div className="bg-[#F8FAFC] rounded-2xl p-4 border border-slate-150 text-left space-y-2.5 text-xs text-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">보관 Hub</span>
                    <span className="text-slate-800 font-extrabold">{HUBS[selectedItem.hubId]?.name.split(" ")[0]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">상세 위치</span>
                    <span className="text-[#002B5B] font-black">{HUBS[selectedItem.hubId]?.location}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-bold">배정 격실</span>
                    <span className="text-slate-800 font-extrabold">사물함 {(selectedItem.slotIndex ?? 0) + 1}번</span>
                  </div>
                  <div className="flex justify-between items-stretch flex-col pt-1.5 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-400 font-bold">수령 수수료</span>
                      <span className="font-extrabold text-red-500 text-xs">50 포인트 차감</span>
                    </div>
                    <p className="text-[9.5px] text-slate-450 leading-normal font-bold">
                      ※ 원격 수령 예약을 신청하시면 즉시 격실 수령 🔐 일회용 비밀번호(OTP)가 발행되며 해당 비밀번호로 즉시 찾아가실 수 있습니다.
                    </p>
                  </div>
                </div>

                {selectedItem.status === "AVAILABLE" ? (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 font-bold text-slate-500 py-3 rounded-xl transition text-xs"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReserve(selectedItem.id)}
                      className="flex-1 bg-[#002B5B] hover:bg-[#001F41] text-white font-bold py-3 rounded-xl shadow-md transition text-xs"
                    >
                      찾아가기 예약 (OTP 발급)
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="w-full bg-slate-50 hover:bg-slate-100 font-bold text-slate-500 py-3 rounded-xl transition text-xs mt-2"
                  >
                    이미 예약되었거나 찾은 물품 (닫기)
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NEW REGISTER MODAL DIALOG */}
      <AnimatePresence>
        {isRegisterOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRegisterOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100/80 max-w-sm w-full relative z-10 p-6 text-slate-800"
            >
              <form onSubmit={handleRegisterItem} className="space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 bg-[#002B5B]/5 rounded-2xl mx-auto flex items-center justify-center text-2xl border border-[#002B5B]/10 text-[#002B5B] mb-2 font-bold select-none">
                    {regIcon}
                  </div>
                  <h3 className="font-extrabold text-base text-slate-800">새로운 습득물 기증 등록</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-bold">교내에서 우연히 발견한 분실물을 안전히 사물함에 대행 보관합니다.</p>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">물품 이름</label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="예: 아이폰14프로 가죽케이스, 민트색 우산"
                      className="w-full bg-[#F8FAFC] border border-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-[#002B5B] focus:bg-white transition font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">보관 지정 Hub</label>
                      <select
                        value={regHubId}
                        onChange={(e) => setRegHubId(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none cursor-pointer text-slate-700 focus:border-[#002B5B] font-bold"
                      >
                        <option value="h1">학생회관 Hub (H1)</option>
                        <option value="h2">학술정보관 Hub (H2)</option>
                        <option value="h3">제1공학관 Hub (H3)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">카테고리</label>
                      <select
                        value={regCategory}
                        onChange={(e) => setRegCategory(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none cursor-pointer text-slate-700 focus:border-[#002B5B] font-bold"
                      >
                        <option value="전자기기">전자기기</option>
                        <option value="지갑/가방">지갑/가방</option>
                        <option value="도서">도서</option>
                        <option value="학생증/신분증">학생증/신분증</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">아이콘 프리셋</label>
                    <div className="grid grid-cols-8 gap-1.5 p-2 bg-[#F8FAFC] rounded-xl border border-slate-200">
                      {["🎧", "📱", "💻", "⌚", "👛", "💼", "🎒", "🔑", "📘", "📕", "🪪", "💳", "📦", "🕶️", "🧣", "☂️"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setRegIcon(emoji)}
                          className={`text-base p-1 rounded-md hover:bg-white transition flex items-center justify-center ${
                            regIcon === emoji ? "bg-white border border-amber-300 shadow-xs" : "border border-transparent"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 font-bold text-slate-500 py-3 rounded-xl transition text-xs"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !regName.trim()}
                    className="flex-1 bg-[#002B5B] hover:bg-[#001F41] text-white font-bold py-3 rounded-xl shadow-md transition text-xs disabled:opacity-50"
                  >
                    {isSubmitting ? "등록 중..." : "등록 완료 (+100P)"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* System Footer bar and statistics */}
      <footer className="bg-white border-t border-slate-200 py-5 px-6 md:px-8 shrink-0 shadow-inner">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-[9.5px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="flex flex-wrap gap-4 justify-center">
            <span className="text-[#002B5B]">LinkLocker Terminal Diagnostician:</span>
            <span className="flex items-center gap-1">FIRESTORE Realtime: <span className="text-green-500 font-black">ACTIVE</span></span>
            <span className="flex items-center gap-1">HANYANG MAP: <span className="text-green-500 font-black">LEAFLET ONLINE</span></span>
            <span className="flex items-center gap-1">ANONYMOUS AUTH: <span className="text-green-500 font-black">GRANTED</span></span>
          </div>
          <div className="text-[10px] text-slate-450 normal-case font-bold tracking-tight">
            &copy; 2026 LinkLocker Hanyang | ERICA 스마트 분실물 플랫폼
          </div>
        </div>
      </footer>

    </div>
  );
}
