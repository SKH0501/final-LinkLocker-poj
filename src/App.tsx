import React, { useState, useEffect } from "react";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  Timestamp,
  query
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
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, seedDatabaseIfEmpty, HUBS, type LostItem } from "./firebase";

export default function App() {
  // Demo Mode State: user, locker, or split
  const [demoMode, setDemoMode] = useState<"split" | "user" | "locker">("split");
  
  // Real-time Firestore items lists
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ----------------------------------------------------
  // User Mode States
  // ----------------------------------------------------
  const [selectedHubId, setSelectedHubId] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [activeReservation, setActiveReservation] = useState<LostItem | null>(null);
  const [otpTimer, setOtpTimer] = useState<number>(180); // 3 minutes in seconds

  // ----------------------------------------------------
  // Registration States
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
  // Locker Mode States
  // ----------------------------------------------------
  const [lockerHubId, setLockerHubId] = useState<string>("h2"); // Default to Library Hub
  const [enteredOtp, setEnteredOtp] = useState<string>("");
  const [authSuccessItem, setAuthSuccessItem] = useState<LostItem | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDoorOpen, setIsDoorOpen] = useState<boolean>(false);
  const [unlockedBoxId, setUnlockedBoxId] = useState<string | null>(null);
  const [currentLockerTime, setCurrentLockerTime] = useState<string>("");

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

  // 1. Seed database and subscribe to Firestore updates
  useEffect(() => {
    // Initial call to seed base items if database is empty
    seedDatabaseIfEmpty();

    const q = query(collection(db, "items"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList: LostItem[] = [];
      snapshot.forEach((doc) => {
        itemsList.push({ id: doc.id, ...doc.data() } as LostItem);
      });
      setItems(itemsList);
      setLoading(false);
      
      // Update active reservation if it gets modified on Firestore
      if (activeReservation) {
        const updated = itemsList.find(i => i.id === activeReservation.id);
        if (updated) {
          if (updated.status === "PICKED_UP") {
            // If picked up in physical locker, reflect it
            setActiveReservation(updated);
          } else if (updated.status === "AVAILABLE") {
            // Cancelled or reset
            setActiveReservation(null);
          } else {
            setActiveReservation(updated);
          }
        } else {
          setActiveReservation(null);
        }
      }
    }, (error) => {
      console.error("Firestore real-time sync subscription error: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeReservation]);

  // Timer logic for Reservation OTP
  useEffect(() => {
    let timerInterval: NodeJS.Timeout;
    if (activeReservation && activeReservation.status === "RESERVED" && otpTimer > 0) {
      timerInterval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            // Expire OTP on Firestore
            handleCancelReservation(activeReservation.id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerInterval);
  }, [activeReservation, otpTimer]);

  // ----------------------------------------------------
  // Core Business Actions
  // ----------------------------------------------------

  // Action: Create pick-up reservation
  const handleReserve = async (itemId: string) => {
    try {
      // Generate a highly secure random 6-digit passcode
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const itemRef = doc(db, "items", itemId);
      
      const now = Timestamp.now();
      await updateDoc(itemRef, {
        status: "RESERVED",
        otp: code,
        reservedAt: now
      });

      const updatedItem = items.find(i => i.id === itemId);
      if (updatedItem) {
        const reservedObj: LostItem = {
          ...updatedItem,
          status: "RESERVED",
          otp: code,
          reservedAt: now
        };
        setActiveReservation(reservedObj);
        setOtpTimer(180); // Reset timer to 3 mins
      }
      setSelectedItem(null); // Close detail modal
    } catch (err) {
      console.error("Transaction reservation error: ", err);
    }
  };

  // Action: Cancel reservation
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

  // Action: OTP Verification (Cabinet Keypad Input)
  const handleVerifyOtp = async () => {
    setAuthError(null);
    
    if (enteredOtp.length !== 6) {
      setAuthError("OTP 6자리를 모두 입력해주세요.");
      return;
    }

    // Match OTP and active reservation under this specific cabinet building
    const matchingItem = items.find(
      (item) => 
        item.hubId === lockerHubId && 
        item.otp === enteredOtp && 
        item.status === "RESERVED"
    );

    if (matchingItem) {
      try {
        setAuthSuccessItem(matchingItem);
        setIsDoorOpen(true);
        // Box assignment simulation (derive from item index)
        const boxNumber = (items.indexOf(matchingItem) + 1) * 3 + 12;
        setUnlockedBoxId(`A-${boxNumber}`);

        // Write "PICKED_UP" update to Firestore (Silently broadcast pick-up)
        const itemRef = doc(db, "items", matchingItem.id);
        await updateDoc(itemRef, {
          status: "PICKED_UP",
          pickedUpAt: Timestamp.now()
        });

        // Auto transition logic to close doors after a moment
        setEnteredOtp("");
      } catch (err) {
        console.error("Verification confirmation error: ", err);
        setAuthError("데이터베이스 갱신 중 오류가 발생했습니다.");
      }
    } else {
      setAuthError("잘못된 승인 키이거나 다른 Hub에 보관된 물품입니다.");
    }
  };

  // Reset/Restock Database Items so they can Demo multiple times!
  const handleRestockDatabase = async () => {
    setLoading(true);
    try {
      for (const item of items) {
        const ref = doc(db, "items", item.id);
        await updateDoc(ref, {
          status: "AVAILABLE",
          otp: null,
          reservedAt: null,
          pickedUpAt: null
        });
      }
      setActiveReservation(null);
      setAuthSuccessItem(null);
      setIsDoorOpen(false);
      setUnlockedBoxId(null);
      setEnteredOtp("");
    } catch (err) {
      console.error("Restock failed: ", err);
    }
    setLoading(false);
  };

  // Action: Register lost item to Firestore
  const handleRegisterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;

    setIsSubmitting(true);
    try {
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
        pickedUpAt: null
      };

      await setDoc(itemRef, newItem);
      
      setIsRegisterOpen(false);
      setRegName("");
    } catch (err) {
      console.error("Failed to register lost item: ", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper formatting for timer
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Main UI Colors: Hanyang University Tone Matcher
  // Navy: #003C71 -> class custom arbitrary bg-[#003C71]
  // Gold: #C5A059 -> class custom arbitrary text-[#C5A059], border-[#C5A059]

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-800 font-sans">
      
      {/* Header Navigation */}
      <header className="bg-[#002B5B] text-white px-6 py-4 flex justify-between items-center shrink-0 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl w-full mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-inner">
              <div className="w-6 h-6 border-4 border-[#002B5B] rounded-sm transform rotate-45"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">
                  LinkLocker <span className="text-[#C5A059] font-medium text-xs ml-2 uppercase tracking-widest">Hanyang Univ.</span>
                </h1>
                <span className="bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/30 font-bold text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Proto
                </span>
              </div>
              <p className="text-[10px] opacity-70">Smart Lost & Found Management System</p>
            </div>
          </div>

          {/* Quick Sandbox / Restock Controller */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Real-time Indicator */}
            <div className="flex items-center gap-2 bg-[#001F41] px-4.5 py-2 rounded-full border border-blue-900 shadow-sm leading-none">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">Firebase: Connected</span>
            </div>

            <button
              onClick={handleRestockDatabase}
              className="bg-white/10 hover:bg-white/20 active:scale-95 text-[11px] text-amber-200 border border-amber-300/20 px-3.5 py-2 rounded-full flex items-center gap-1.5 transition font-semibold"
              title="분실물 상태를 모두 '보관 중'으로 리셋하고 새롭게 시연할 수 있습니다."
            >
              <RotateCcw size={12} />
              시연 초기화 (Reset)
            </button>
            <div className="h-4 w-[1px] bg-white/20 hidden sm:block"></div>
            <div className="bg-[#001F41] p-1 rounded-full border border-blue-950 flex gap-0.5">
              <button
                onClick={() => setDemoMode("split")}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                  demoMode === "split"
                    ? "bg-[#C5A059] text-sky-950 shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Tv size={11} /> Split View
              </button>
              <button
                onClick={() => setDemoMode("user")}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                  demoMode === "user"
                    ? "bg-[#C5A059] text-sky-950 shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Smartphone size={11} /> Student App
              </button>
              <button
                onClick={() => setDemoMode("locker")}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 transition-all ${
                  demoMode === "locker"
                    ? "bg-[#C5A059] text-sky-950 shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Cpu size={11} /> Hub Terminal
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
            <RefreshCw className="animate-spin text-[#002B5B]" size={36} />
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Loading Synchronized Database...</p>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* 1. STUDENT MOBILE RECONSTRUCT (USER VIEW) */}
            {(demoMode === "split" || demoMode === "user") && (
              <div
                className={`bg-slate-100/50 border border-slate-200/60 rounded-3xl p-3 flex flex-col relative transition-all duration-300 ${
                  demoMode === "split" ? "lg:col-span-6 h-[85vh]" : "lg:col-span-8 lg:col-start-3 h-[85vh] max-w-2xl mx-auto w-full"
                }`}
              >
                <div className="flex justify-between items-end mb-2.5 px-1">
                  <h2 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">1. Student Mobile App View</h2>
                  <span className="text-[9px] bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs text-[#002B5B] font-extrabold">/user/dashboard</span>
                </div>

                <div className="flex-1 bg-white rounded-[32px] border-[8px] border-slate-800 shadow-2xl relative overflow-hidden flex flex-col">
                  {/* Simulated Phone Frame Header */}
                  <div className="bg-[#002B5B] text-white py-3.5 px-5 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-2">
                    <Smartphone size={15} className="text-[#C5A059]" />
                    <span className="font-extrabold text-sm tracking-wide">HYU LinkLocker Mobile</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-slate-300 font-mono">Real-time sync</span>
                  </div>
                </div>

                {/* Simulated User Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 flex flex-col">
                  
                  {/* MAP CONTAINER */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                          <MapPin size={15} className="text-[#002B5B]" />
                          교내 분실물 사물함 안내도 (Hanyang Blue Map)
                        </h3>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">원하시는 무인 Hub의 보관 항목을 검색하려면 빌딩을 탭하세요.</p>
                      </div>
                      {selectedHubId !== "all" && (
                        <button
                          onClick={() => setSelectedHubId("all")}
                          className="text-[10px] text-white bg-slate-500 hover:bg-slate-650 font-bold px-2 py-1 rounded"
                        >
                          전체보기
                        </button>
                      )}
                    </div>

                    {/* Highly Interactive SVG Campus Map */}
                    <div className="relative w-full aspect-[21/9] bg-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                      <svg viewBox="0 0 600 240" className="w-full h-full text-slate-400 select-none">
                        {/* Map Background Roads / Grasslands */}
                        <rect x="0" y="0" width="600" height="240" fill="#F8FAFC" />
                        <path d="M 0 100 Q 150 110 300 80 T 600 70" fill="none" stroke="#E2E8F0" strokeWidth="24" />
                        <path d="M 250 0 L 280 240" fill="none" stroke="#E2E8F0" strokeWidth="18" />
                        
                        {/* 1. Student Union Building Shape */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setSelectedHubId("h1")}
                        >
                          {/* Building Area Highlight */}
                          <polygon 
                            points="40,160 160,160 140,210 20,210" 
                            fill={selectedHubId === "h1" ? "#EFF6FF" : "white"} 
                            stroke={selectedHubId === "h1" ? "#002B5B" : "#CBD5E1"} 
                            strokeWidth="2" 
                            className="transition-all duration-200 group-hover:fill-blue-50/70"
                          />
                          <text x="80" y="190" fill="#002B5B" className="text-[10px] font-bold tracking-tight text-center select-none" textAnchor="middle">
                            학생회관
                          </text>
                          {/* Active Hub Marker Pin */}
                          <g transform="translate(140, 150)">
                            <circle r="12" fill="#002B5B" stroke="#C5A059" strokeWidth="2.5" className="animate-bounce shadow-sm" style={{ animationDuration: '3s' }} />
                            <text y="4.5" fill="white" className="text-[9px] font-extrabold font-mono" textAnchor="middle">H1</text>
                          </g>
                        </g>

                        {/* 2. Library (Academic Information Center) Shape */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setSelectedHubId("h2")}
                        >
                          <circle 
                            cx="320" cy="110" r="45" 
                            fill={selectedHubId === "h2" ? "#EFF6FF" : "white"} 
                            stroke={selectedHubId === "h2" ? "#002B5B" : "#CBD5E1"} 
                            strokeWidth="2"
                            className="transition-all duration-200 group-hover:fill-blue-50/70"
                          />
                          <text x="320" y="114" fill="#002B5B" className="text-[10px] font-bold tracking-tight" textAnchor="middle">
                            학술정보관
                          </text>
                          {/* Active Hub Marker Pin */}
                          <g transform="translate(355, 75)">
                            <circle r="12" fill="#002B5B" stroke="#C5A059" strokeWidth="2.5" className="animate-bounce shadow-sm" style={{ animationDuration: '3.5s' }} />
                            <text y="4.5" fill="white" className="text-[9px] font-extrabold font-mono" textAnchor="middle">H2</text>
                          </g>
                        </g>

                        {/* 3. Engineering Building 1 Shape */}
                        <g 
                          className="cursor-pointer group"
                          onClick={() => setSelectedHubId("h3")}
                        >
                          <polygon 
                            points="440,30 560,40 540,110 420,100" 
                            fill={selectedHubId === "h3" ? "#EFF6FF" : "white"} 
                            stroke={selectedHubId === "h3" ? "#002B5B" : "#CBD5E1"} 
                            strokeWidth="2"
                            className="transition-all duration-200 group-hover:fill-blue-50/70"
                          />
                          <text x="490" y="74" fill="#002B5B" className="text-[10px] font-bold tracking-tight" textAnchor="middle">
                            제1공학관
                          </text>
                          {/* Active Hub Marker Pin */}
                          <g transform="translate(440, 45)">
                            <circle r="12" fill="#002B5B" stroke="#C5A059" strokeWidth="2.5" className="animate-bounce shadow-sm" style={{ animationDuration: '4s' }} />
                            <text y="4.5" fill="white" className="text-[9px] font-extrabold font-mono" textAnchor="middle">H3</text>
                          </g>
                        </g>
                      </svg>

                      {/* Map Badges */}
                      <div className="absolute top-2 left-2 flex gap-1.5 self-start">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${selectedHubId === "all" ? "bg-[#002B5B] text-white" : "bg-slate-200/80 text-slate-700"}`}>
                          전체 {items.filter(i => i.status === "AVAILABLE").length}개 보관
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ACTIVE RESERVATION OTP PANEL */}
                  <AnimatePresence>
                    {activeReservation && (
                      <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="p-4 bg-blue-50/70 border-2 border-[#002B5B] rounded-2xl relative"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-bold text-[#002B5B] text-sm flex items-center gap-1.5">
                              <span>🎒</span> {activeReservation.name}
                            </h3>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {HUBS[activeReservation.hubId]?.name}에서 보관 중
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-white bg-[#C5A059] px-2 py-0.5 rounded uppercase tracking-wider">ACTIVE</span>
                            {activeReservation.status !== "PICKED_UP" && (
                              <button
                                onClick={() => handleCancelReservation(activeReservation.id)}
                                className="text-[10px] text-red-500 hover:text-red-700 font-bold underline transition"
                              >
                                취소
                              </button>
                            )}
                          </div>
                        </div>

                        {activeReservation.status === "PICKED_UP" ? (
                          <div className="bg-white rounded-xl p-4 text-center border border-emerald-100 shadow-xs">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold text-lg">✓</div>
                            <h4 className="text-xs font-bold text-slate-800">성공적으로 수령되었습니다!</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">사물함에서 수령 완료가 정상 반영되었습니다.</p>
                            <button
                              onClick={() => setActiveReservation(null)}
                              className="mt-3 text-[10px] bg-[#002B5B] text-white font-bold px-4 py-1 rounded-lg hover:bg-[#001F41]"
                            >
                              대시보드 닫기
                            </button>
                          </div>
                        ) : (
                          <div className="bg-white rounded-xl p-4 text-center border border-blue-100/80 shadow-xs">
                            <p className="text-[9px] uppercase tracking-wider text-slate-400 mb-1 font-bold">Your Pickup OTP</p>
                            <p className="text-3xl font-mono font-black text-[#002B5B] tracking-[0.2em] bg-slate-50 py-2.5 rounded-xl border border-slate-100">
                              {activeReservation.otp}
                            </p>
                            <div className="w-full h-1 bg-slate-100 mt-4 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#002B5B] transition-all duration-1000"
                                style={{ width: `${(otpTimer / 180) * 100}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between items-center text-[9.5px] text-slate-400 mt-2 font-medium">
                              <span>남은 인증 유효시간</span>
                              <span className={otpTimer < 45 ? "text-red-500 animate-pulse font-extrabold" : "text-[#002B5B] font-extrabold font-mono"}>
                                {formatTime(otpTimer)}
                              </span>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* FILTER SELECTION */}
                  <div className="space-y-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      <div className="relative flex-1 min-w-[150px]">
                        <Search className="absolute left-3 top-2.5 text-slate-450" size={13} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="분실물 이름을 검색하세요..."
                          className="w-full bg-[#F8FAFC] border border-slate-200 text-xs rounded-xl pl-8.5 pr-3 py-2 outline-none focus:border-[#002B5B] focus:bg-white transition"
                        />
                      </div>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-white border border-slate-200 text-[11px] font-bold rounded-xl px-3 py-2 outline-none cursor-pointer text-slate-700 focus:border-[#002B5B]"
                      >
                        <option value="all">모든 카테고리</option>
                        <option value="전자기기">🎧 전자기기</option>
                        <option value="지갑/가방">👛 지갑/가방</option>
                        <option value="도서">📘 도서</option>
                        <option value="학생증/신분증">🪪 학생증/신분증</option>
                      </select>
                      <button
                        onClick={() => {
                          setRegName("");
                          setIsRegisterOpen(true);
                        }}
                        className="bg-[#002B5B] hover:bg-[#001F41] active:scale-95 text-white text-[11px] font-extrabold px-3.5 py-2 rounded-xl flex items-center gap-1 transition shadow-sm shrink-0 leading-none h-[34px]"
                        title="분실물 신규 등록"
                      >
                        <Plus size={13} />
                        분실물 등록
                      </button>
                    </div>

                    {/* Quick Active Filter Pills */}
                    <div className="flex gap-1.5 items-center overflow-x-auto pb-1 text-xs scrollbar-none">
                      <span className="text-slate-400 font-extrabold shrink-0 text-[9px] uppercase tracking-wider">사물함 구역:</span>
                      <button
                        onClick={() => setSelectedHubId("all")}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-tight transition ${
                          selectedHubId === "all" ? "bg-[#002B5B] text-white shadow-xs" : "bg-[#F8FAFC] text-slate-600 border border-slate-200/60"
                        }`}
                      >
                        전체
                      </button>
                      {Object.entries(HUBS).map(([id, hub]) => (
                        <button
                          key={id}
                          onClick={() => setSelectedHubId(id)}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-tight transition whitespace-nowrap ${
                            selectedHubId === id ? "bg-[#002B5B] text-white shadow-xs" : "bg-[#F8FAFC] text-slate-600 border border-slate-200/60"
                          }`}
                        >
                          {hub.name.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* MASTER LOST ITEMS LIST */}
                  <div className="flex-1 flex flex-col space-y-2.5">
                    <h4 className="font-extrabold text-slate-400 text-[9px] tracking-wider uppercase">
                      선택된 구역의 분실물 ({
                        items.filter((item) => {
                          const matchesHub = selectedHubId === "all" || item.hubId === selectedHubId;
                          const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
                          const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
                          return matchesHub && matchesCat && matchesSearch;
                        }).length
                      }개)
                    </h4>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3.5 pb-6">
                      {items.filter((item) => {
                        const matchesHub = selectedHubId === "all" || item.hubId === selectedHubId;
                        const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
                        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
                        return matchesHub && matchesCat && matchesSearch;
                      }).length === 0 ? (
                        <div className="col-span-full bg-[#F8FAFC] rounded-2xl p-8 border border-slate-100 flex flex-col items-center justify-center text-center gap-2">
                          <Inbox className="text-slate-300" size={30} />
                          <p className="text-xs text-slate-500 font-bold">보관 중인 분실물이 없습니다.</p>
                          <p className="text-[10px] text-slate-400">사물함 필터를 변경하거나 시나리오 초기화를 실행해보세요.</p>
                        </div>
                      ) : (
                        items
                          .filter((item) => {
                            const matchesHub = selectedHubId === "all" || item.hubId === selectedHubId;
                            const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
                            const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
                            return matchesHub && matchesCat && matchesSearch;
                          })
                          .map((item) => {
                            const hubObj = HUBS[item.hubId];
                            return (
                              <div
                                key={item.id}
                                className={`bg-white rounded-2xl border p-4 flex flex-col justify-between hover:shadow-xs hover:border-slate-350 transition duration-250 text-slate-800 relative cursor-pointer ${
                                  item.status === "RESERVED"
                                    ? "border-amber-300/80 bg-amber-50/25"
                                    : item.status === "PICKED_UP"
                                    ? "border-slate-150 bg-slate-50/50"
                                    : "border-slate-100"
                                }`}
                                onClick={() => setSelectedItem(item)}
                              >
                                {item.status === "RESERVED" && (
                                  <span className="absolute top-3 right-3 bg-amber-500 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                    예약됨
                                  </span>
                                )}
                                {item.status === "PICKED_UP" && (
                                  <span className="absolute top-3 right-3 bg-slate-450 text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                    수령됨
                                  </span>
                                )}
                                {item.status === "AVAILABLE" && (
                                  <span className="absolute top-3 right-3 bg-[#002B5B] text-white font-extrabold text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                    보관 중
                                  </span>
                                )}

                                <div className="space-y-3">
                                  <div className="w-10 h-10 bg-[#F1F5F9] rounded-xl flex items-center justify-center text-xl shadow-inner-xs border border-slate-100">
                                    {item.icon}
                                  </div>
                                  <div>
                                    <h5 className="font-bold text-sm text-slate-800 leading-tight line-clamp-1">{item.name}</h5>
                                    <div className="flex items-center gap-1.5 mt-1.5 text-slate-400">
                                      <MapPin size={11} className="text-[#002B5B]" />
                                      <span className="text-[10px] font-bold text-slate-550">{hubObj?.name.split(" ")[0]}</span>
                                    </div>
                                    <div className="flex gap-1.5 mt-2">
                                      <span className="bg-[#002B5B]/5 text-[#002B5B] px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-tight">
                                        {item.category}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="border-t border-slate-100 mt-3 pt-2.5 flex justify-between items-center text-[9.5px]">
                                  <span className="text-slate-400 font-medium">등록 시간</span>
                                  <span className="text-slate-500 font-bold font-mono">24h ago</span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* 2. RECONSTRUCT CABINET / TOUCH PANEL SCREEN (LOCKER VIEW) */}
            {(demoMode === "split" || demoMode === "locker") && (
              <div
                className={`bg-[#1E293B] border-[12px] border-[#334155] rounded-[36px] overflow-hidden shadow-2xl flex flex-col items-stretch justify-between transition-all duration-300 relative ${
                  demoMode === "split" ? "lg:col-span-6 h-[85vh]" : "lg:col-span-8 lg:col-start-3 h-[85vh] max-w-2xl mx-auto w-full"
                }`}
              >
                {/* Physical Tablet Trim Top */}
                <div className="bg-white p-4 px-5 border-b border-slate-100 flex justify-between items-center text-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="font-bold text-[11px] text-[#002B5B] tracking-wider uppercase">LinkLocker Hub Terminal</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider font-mono bg-slate-50 border border-slate-200/55 px-2.5 py-1 rounded-md">
                      🕒 {currentLockerTime || "14:20 PM"}
                    </span>
                    <select
                      value={lockerHubId}
                      onChange={(e) => {
                        setLockerHubId(e.target.value);
                        setAuthSuccessItem(null);
                        setEnteredOtp("");
                        setAuthError(null);
                        setIsDoorOpen(false);
                        setUnlockedBoxId(null);
                      }}
                      className="bg-slate-50 border border-slate-200 text-xs py-1 px-2.5 rounded-lg font-bold text-slate-700 outline-none focus:border-[#002B5B]"
                    >
                      <option value="h1">학생회관 Hub</option>
                      <option value="h2">학술정보관 Hub</option>
                      <option value="h3">제1공학관 Hub</option>
                    </select>
                  </div>
                </div>

                {/* Simulated Tablet Main Screen Interior */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col md:flex-row gap-4 items-stretch bg-[#F8FAFC]">
                  
                  {/* Left Column: Locker Cabinet visual grid */}
                  <div className="flex-1 bg-white border border-slate-150 p-4 rounded-2xl flex flex-col justify-between shadow-xs">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-[11px] text-[#002B5B] tracking-wide uppercase">
                          사물함 보관 현황 (Locker Cabinet)
                        </h4>
                        <span className="bg-[#002B5B] text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {HUBS[lockerHubId]?.name.split(" ")[0]}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mb-3.5 font-medium">실시간 무인 스마트 보관함의 컴파트먼트 현황입니다.</p>

                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
                          const boxIdVal = `${idx + 12}`;
                          
                          let matchingItemInside: LostItem | undefined;
                          if (lockerHubId === "h1" && idx === 1) matchingItemInside = items.find(i => i.id === "item_wallet");
                          if (lockerHubId === "h2" && idx === 2) matchingItemInside = items.find(i => i.id === "item_airpods");
                          if (lockerHubId === "h2" && idx === 5) matchingItemInside = items.find(i => i.id === "item_idcard");
                          if (lockerHubId === "h3" && idx === 3) matchingItemInside = items.find(i => i.id === "item_book");

                          const isUnlocked = unlockedBoxId === `A-${boxIdVal}`;

                          return (
                            <div
                              key={idx}
                              className={`aspect-[1/1] border-2 rounded-xl flex flex-col items-center justify-between p-1.5 transition relative select-none ${
                                isUnlocked
                                  ? "bg-amber-500/10 border-amber-400 animate-pulse text-amber-500"
                                  : matchingItemInside?.status === "RESERVED"
                                  ? "bg-blue-50/60 border-[#002B5B] text-[#002B5B]"
                                  : matchingItemInside?.status === "PICKED_UP"
                                  ? "bg-slate-50 border-slate-200/50 text-slate-350 opacity-40"
                                  : matchingItemInside?.status === "AVAILABLE"
                                  ? "bg-emerald-50/50 border-emerald-400 text-emerald-600"
                                  : "bg-slate-50/20 border-slate-200 text-slate-400"
                              }`}
                            >
                              <span className="text-[8.5px] font-mono font-bold">Box {boxIdVal}</span>
                              <div className="text-center">
                                {isUnlocked ? (
                                  <span className="text-sm">🔓</span>
                                ) : matchingItemInside?.status === "RESERVED" ? (
                                  <span className="text-sm" title="예약 중">🔐</span>
                                ) : matchingItemInside?.status === "AVAILABLE" ? (
                                  <span className="text-sm" title="보관 중">🔒</span>
                                ) : (
                                  <span className="text-[8px] font-mono font-black opacity-30 select-none">EMPTY</span>
                                )}
                              </div>
                              <span className="text-[8px] font-bold truncate max-w-full">
                                {isUnlocked ? "열림 (Open)" : matchingItemInside?.status === "RESERVED" ? "예약 대기" : matchingItemInside?.status === "AVAILABLE" ? "보관품" : "사용가능"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 mt-4 pt-3.5">
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-150 text-[9.5px] leading-relaxed text-slate-400 font-medium space-y-1">
                        <div className="flex gap-1">
                          <span className="text-[#C5A059]">📍</span>
                          <span className="text-slate-550">위치: {HUBS[lockerHubId]?.location}</span>
                        </div>
                        <div className="flex gap-1">
                          <span className="text-[#C5A059]">⚠️</span>
                          <span className="text-slate-550">모바일에서 발급받은 6자리 일회용 비밀번호(OTP)를 사용하여 문을 여세요.</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Physical Digit Passcode Keypad */}
                  <div className="flex-1 flex flex-col justify-between bg-white border border-slate-150 p-4.5 rounded-2xl relative overflow-hidden text-slate-800 shadow-xs">
                    
                    {/* KEYPAD SCREEN */}
                    <div className="space-y-4">
                      <div className="text-center">
                        <span className="text-[8px] font-mono tracking-widest text-[#C5A059] block font-black uppercase">ENTER INTEGRITY OTP PASS</span>
                        <h5 className="text-[10.5px] text-slate-400 font-bold mt-1">스마트 사물함의 수령 코드를 입력하세요.</h5>
                      </div>

                      {/* Six individual pin digits box */}
                      <div className="flex justify-center gap-1.5 py-1">
                        {[0, 1, 2, 3, 4, 5].map((i) => {
                          const char = enteredOtp[i];
                          return (
                            <div 
                              key={i}
                              className={`w-9 h-11 border-2 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                                char 
                                  ? "border-[#002B5B] bg-[#002B5B]/5 text-[#002B5B]" 
                                  : "border-slate-200 text-slate-300 bg-slate-50"
                              }`}
                            >
                              {char || ""}
                            </div>
                          );
                        })}
                      </div>

                      {/* Tactile keypad buttons */}
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                          <button
                            key={num}
                            onClick={() => {
                              if (enteredOtp.length < 6) {
                                setEnteredOtp((prev) => prev + num);
                                setAuthError(null);
                              }
                            }}
                            className="bg-slate-50 border border-slate-150 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl transition font-extrabold text-sm active:scale-95"
                          >
                            {num}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setEnteredOtp((prev) => prev.slice(0, -1));
                            setAuthError(null);
                          }}
                          className="bg-slate-100 border border-slate-200 hover:bg-slate-200/50 text-slate-500 font-bold text-[10px] py-2 rounded-xl transition flex items-center justify-center active:scale-95 uppercase tracking-wide"
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
                          className="bg-slate-50 border border-slate-150 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl transition font-extrabold text-sm active:scale-95"
                        >
                          0
                        </button>
                        <button
                          onClick={handleVerifyOtp}
                          className="bg-[#002B5B] text-white hover:bg-[#001F41] font-bold text-[10px] py-2 rounded-xl transition flex items-center justify-center active:scale-95 shadow-xs uppercase tracking-wider"
                        >
                          Confirm
                        </button>
                      </div>

                      {authError && (
                        <div className="bg-red-50 border border-red-200 p-2 text-[10px] text-red-550 font-bold leading-normal text-center rounded-xl">
                          ⚠️ {authError}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3 flex justify-center items-center text-[9px] text-slate-400 font-bold uppercase tracking-widest text-center leading-none">
                      보안 가이드 : 미승인 수집 시 형사처벌 대상
                    </div>

                    {/* OVERLAY FOR THE COMPLETE UNLOCKED DOOR EVENT SUCCESS MODAL */}
                    <AnimatePresence>
                      {authSuccessItem && isDoorOpen && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-[#0F172A]/90 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 z-20"
                        >
                          <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="space-y-5 max-w-xs w-full p-6 bg-white rounded-3xl border border-slate-100 shadow-2xl text-slate-800"
                          >
                            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-emerald-100">
                              <Unlock size={24} className="animate-pulse" />
                            </div>
                            <div>
                              <h4 className="font-extrabold text-[#002B5B] text-base mb-1">인증성공! 사물함 열림</h4>
                              <p className="text-[10px] text-slate-400 mt-1">보관함을 확인하고 분실물을 찾아가십시오.</p>
                            </div>
                            
                            <div className="bg-[#F8FAFC] border border-slate-150 p-4 rounded-2xl text-center space-y-1 shadow-inner-xs">
                              <span className="text-[8.5px] text-slate-400 block font-bold uppercase tracking-widest">배정된 사물함</span>
                              <span className="text-3xl font-mono font-black text-[#002B5B] tracking-wider block">
                                {unlockedBoxId}
                              </span>
                              <div className="pt-2 border-t border-slate-200/50 text-[11px] mt-2 text-slate-600 font-semibold">
                                <p className="font-bold text-slate-800">{authSuccessItem.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Category: {authSuccessItem.category}</p>
                              </div>
                            </div>

                            <p className="text-[10px] text-emerald-600 font-bold">
                              분실물을 수령하고 사물함 문을 꽉 닫아주세요.
                            </p>

                            <button
                              onClick={() => {
                                setAuthSuccessItem(null);
                                setIsDoorOpen(false);
                                setUnlockedBoxId(null);
                              }}
                              className="w-full bg-[#002B5B] text-white py-3 rounded-xl font-bold text-xs hover:bg-slate-900 transition-all shadow-sm uppercase tracking-wider"
                            >
                              수령 완료 (Door Closed)
                            </button>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* DETAIL DRAWER / POPUP DIALOG */}
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
                  <span className="bg-[#002B5B]/5 text-[#002B5B] px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest">
                    {selectedItem.category}
                  </span>
                  <h3 className="font-bold text-base text-slate-800 mt-2">{selectedItem.name}</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">보관 일자 : 24h ago (Stored)</p>
                </div>

                <div className="bg-[#F8FAFC] rounded-2xl p-4.5 border border-slate-150 text-left space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">보관 Hub</span>
                    <span className="text-slate-800 font-bold">{HUBS[selectedItem.hubId]?.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-semibold">상세 위치</span>
                    <span className="text-[#002B5B] font-extrabold">{HUBS[selectedItem.hubId]?.location}</span>
                  </div>
                  <div className="flex justify-between items-stretch flex-col">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-400 font-semibold">보관 상태</span>
                      <span className={`font-extrabold text-[11px] ${
                        selectedItem.status === "AVAILABLE" 
                          ? "text-emerald-600" 
                          : selectedItem.status === "RESERVED" 
                          ? "text-amber-500" 
                          : "text-slate-450"
                      }`}>
                        {selectedItem.status === "AVAILABLE" && "보관 구역 내 보관 중"}
                        {selectedItem.status === "RESERVED" && "수령 대기중"}
                        {selectedItem.status === "PICKED_UP" && "수령 처리가 정상 완료됨"}
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-400 leading-normal font-medium">
                      {selectedItem.status === "AVAILABLE" && "원격 예약을 신청하시면 즉시 수령 인증번호가 모바일로 발행됩니다."}
                      {selectedItem.status === "RESERVED" && "인증번호가 타인에 의해 배정되어 현재 예약 불가능합니다."}
                      {selectedItem.status === "PICKED_UP" && "이전 수거 이력이 완료되었습니다."}
                    </p>
                  </div>
                </div>

                {selectedItem.status === "AVAILABLE" ? (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setSelectedItem(null)}
                      className="flex-1 bg-slate-50 hover:bg-slate-100 font-bold text-slate-500 py-3 rounded-xl transition text-xs"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => handleReserve(selectedItem.id)}
                      className="flex-1 bg-[#002B5B] hover:bg-[#001F41] text-white font-bold py-3 rounded-xl shadow-md transition text-xs"
                    >
                      찾아가기 예약
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="w-full bg-slate-50 hover:bg-slate-100 font-bold text-slate-500 py-3 rounded-xl transition text-xs mt-2"
                  >
                    확인 및 닫기
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REGISTER LOST ITEM MODAL */}
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
                  <div className="w-12 h-12 bg-[#002B5B]/5 rounded-2xl mx-auto flex items-center justify-center text-2xl border border-[#002B5B]/10 text-[#002B5B] mb-2 font-bold">
                    {regIcon}
                  </div>
                  <h3 className="font-bold text-base text-slate-800">새로운 분실물 등록</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">교내에서 습득한 물품의 정보와 보관 사물함을 지정하세요.</p>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">물품 이름</label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="예: 에어팟 맥스 (실버), 파란색 우산"
                      className="w-full bg-[#F8FAFC] border border-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-[#002B5B] focus:bg-white transition font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
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

                  {/* Preset Emojis Picker */}
                  <div className="space-y-1">
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
                    {isSubmitting ? "등록 중..." : "등록 완료"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* System Footer Bar */}
      <footer className="bg-white border-t border-slate-200 py-5 px-6 md:px-8 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 text-[9.5px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="flex flex-wrap gap-4 justify-center">
            <span className="text-[#002B5B]">Diagnostic State Engine:</span>
            <span className="flex items-center gap-1">FIRESTORE: <span className="text-green-500 font-extrabold">ACTIVE</span></span>
            <span className="flex items-center gap-1">AUTH: <span className="text-green-500 font-extrabold">ACTIVE</span></span>
            <span className="flex items-center gap-1">HUB LOCKERS: <span className="text-green-500 font-extrabold">READY</span></span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium normal-case/50">
            &copy; 2026 LinkLocker Hanyang | senior frontend prototype
          </div>
        </div>
      </footer>
    </div>
  );
}
