
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Loader2, MinusCircle, UserCircle, Info } from 'lucide-react';
import type { ScheduleTGR, TGRDewanPenalty, TGRDewanPenaltyType, TGRJuriScore, TGRTimerStatus, SideSpecificTGRScore } from '@/lib/types';
import { db, auth } from '@/lib/firebase'; 
import { doc, onSnapshot, getDoc, collection, addDoc, query, orderBy, limit, deleteDoc, serverTimestamp, Timestamp, where, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const DEWAN_PENALTIES_TGR_SUBCOLLECTION = 'dewan_penalties_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';

const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;
const BASE_SCORE_TGR = 9.90;
const GERAKAN_SALAH_DEDUCTION = 0.01;

interface PenaltyConfigItem {
  id: TGRDewanPenaltyType;
  description: string;
  points: number;
}

const PENALTY_CONFIG_TUNGGAL: PenaltyConfigItem[] = [
  { id: 'arena_out', description: "Penampilan Keluar Gelanggang 10mx10m", points: -0.50 },
  { id: 'weapon_touch_floor', description: "Menjatuhkan Senjata Menyentuh Lantai", points: -0.50 },
  { id: 'time_tolerance_violation', description: "Penampilan melebihi atau kurang dari toleransi waktu 5 Detik S/d 10 Detik", points: -0.50 },
  { id: 'costume_violation', description: "Pakaian tidak sesuai aturan (kain samping jatuh, kain samping tidak 1 (satu) motif, baju atasan dan bawahan tidak 1 (satu) warna)", points: -0.50 },
  { id: 'movement_hold_violation', description: "Menahan gerakan lebih dari 5 (lima) detik.", points: -0.50 },
];

const PENALTY_CONFIG_GANDA: PenaltyConfigItem[] = [
  { id: 'arena_out', description: "Penampilan keluar gelanggang 10 m x 10 m.", points: -0.50 },
  { id: 'weapon_touch_floor', description: "Senjata jatuh tidak memenuhi sinopsis.", points: -0.50 },
  { id: 'weapon_out_of_arena', description: "Senjata jatuh keluar gelanggang saat masih harus menggunakan dalam penampilannya.", points: -0.50 },
  { id: 'weapon_broken_detached', description: "Senjata terlepas dari gagangnya atau patah.", points: -0.50 },
  { id: 'costume_violation', description: "Mengenakan pakaian yang tidak sesuai dengan ketentuan.", points: -0.50 },
];

const PENALTY_CONFIG_REGU: PenaltyConfigItem[] = [
  { id: 'time_tolerance_violation', description: "Penampilan melebihi atau kekurangan dari toleransi waktu >5 detik s/d 10 detik.", points: -0.50 },
  { id: 'arena_out', description: "Penampilan keluar gelanggang 10 m x 10 m.", points: -0.50 },
  { id: 'costume_violation', description: "Pakaian tidak sesuai aturan.", points: -0.50 },
  { id: 'movement_hold_violation', description: "Manahan gerakan lebih dari 5 (lima) detik", points: -0.50 },
];

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
  currentPerformingSide: null,
};

function DewanTGRPenaltyPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [penaltiesLog, setPenaltiesLog] = useState<TGRDewanPenalty[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);

  useEffect(() => {
    if (!gelanggangName) {
      setError("Nama gelanggang tidak ditemukan di URL.");
      setConfigMatchId(null); 
      setIsLoading(false);
      return;
    }
    setError(null); 
    setIsLoading(true);

    const unsubGelanggangMap = onSnapshot(doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      let newDbConfigId: string | null = null;
      if (docSnap.exists()) {
        newDbConfigId = docSnap.data()?.[gelanggangName] || null;
      }
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
      if (!newDbConfigId) {
         setError(`Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName}.`);
      }
    }, (err) => {
      console.error(`[Dewan1TGR] Error fetching active TGR matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif TGR per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      setCurrentUserEmail(user ? user.email : null);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setPenaltiesLog([]);
      setMatchDetailsLoaded(false);
      setError(null);
      setTgrTimerStatus(initialTgrTimerStatus);
      setActiveMatchId(configMatchId);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);

  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading && !configMatchId && !gelanggangName) setIsLoading(false); // No gelanggang, not loading config
      else if (isLoading && !configMatchId && gelanggangName) setIsLoading(false); // No config for this gelanggang
      return;
    }

    let mounted = true;
    if (!matchDetailsLoaded) setIsLoading(true);

    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      if (!mounted) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          setScheduleDetails({ id: scheduleDocSnap.id, ...scheduleDocSnap.data() } as ScheduleTGR);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR (ID: ${activeMatchId}) tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      } catch (err) {
        if (mounted) setError(`Error memuat detail jadwal TGR: ${err instanceof Error ? err.message : String(err)}`);
        setScheduleDetails(null);
        setMatchDetailsLoaded(false);
      }
    };
    
    loadData();
    
    const penaltiesQuery = query(
      collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION),
      orderBy("timestamp", "asc")
    );
    unsubscribers.push(onSnapshot(penaltiesQuery, (snapshot) => {
      if (!mounted) return;
      const log: TGRDewanPenalty[] = [];
      snapshot.forEach(doc => log.push({ id: doc.id, ...doc.data() } as TGRDewanPenalty));
      setPenaltiesLog(log);
    }, (err) => {
      if (mounted) setError(`Gagal memuat log pelanggaran: ${err.message}`);
    }));

    const matchTimerRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
    unsubscribers.push(onSnapshot(matchTimerRef, (docSnap) => {
        if (!mounted) return;
        if (docSnap.exists() && docSnap.data()?.timerStatus) {
            setTgrTimerStatus(docSnap.data()?.timerStatus as TGRTimerStatus);
        } else {
            setTgrTimerStatus(initialTgrTimerStatus);
        }
    }));

    if (isLoading && matchDetailsLoaded) setIsLoading(false);

    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeMatchId, matchDetailsLoaded, isLoading]);

  const handleAddPenalty = async (penalty: PenaltyConfigItem) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("User tidak terautentikasi. Silakan login ulang dan coba lagi.");
      alert("User tidak terautentikasi. Silakan login ulang dan coba lagi.");
      return;
    }
    
    const currentPerformingSide = tgrTimerStatus.currentPerformingSide;
    if (!currentPerformingSide) {
        setError("Tidak ada sisi (Biru/Merah) yang aktif untuk diberikan penalti. Tunggu Timer Kontrol memulai sisi.");
        alert("Tidak ada sisi (Biru/Merah) yang aktif untuk diberikan penalti. Tunggu Timer Kontrol memulai sisi.");
        return;
    }

    if (!activeMatchId || activeMatchId.trim() === "" || isProcessing[penalty.id]) {
      if (!activeMatchId || activeMatchId.trim() === "") {
        setError("ID pertandingan aktif tidak valid. Tidak dapat menambah pelanggaran.");
      }
      return;
    }
    setIsProcessing(prev => ({ ...prev, [penalty.id]: true }));
    try {
      const penaltyData: Omit<TGRDewanPenalty, 'id' | 'timestamp'> & { timestamp: any } = {
        type: penalty.id,
        description: penalty.description,
        pointsDeducted: penalty.points,
        side: currentPerformingSide, 
        timestamp: serverTimestamp(),
      };

      const batch = writeBatch(db);
      const newPenaltyRef = doc(collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION));
      batch.set(newPenaltyRef, penaltyData);

      const deductionAmount = Math.abs(penalty.points); 

      for (const juriId of TGR_JURI_IDS) {
        const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
        const juriDocSnap = await getDoc(juriDocRef);
        
        let currentJuriData: TGRJuriScore;
        if (juriDocSnap.exists()) {
            currentJuriData = juriDocSnap.data() as TGRJuriScore;
        } else {
            currentJuriData = { 
                biru: { gerakanSalahCount: 0, staminaKemantapanBonus: 0, externalDeductions: 0, calculatedScore: BASE_SCORE_TGR, isReady: false },
                merah: { gerakanSalahCount: 0, staminaKemantapanBonus: 0, externalDeductions: 0, calculatedScore: BASE_SCORE_TGR, isReady: false },
                lastUpdated: null,
            };
        }

        const sideDataToUpdate: SideSpecificTGRScore = currentJuriData[currentPerformingSide] 
            ? { ...currentJuriData[currentPerformingSide]! } 
            : { gerakanSalahCount: 0, staminaKemantapanBonus: 0, externalDeductions: 0, calculatedScore: BASE_SCORE_TGR, isReady: false };

        sideDataToUpdate.externalDeductions = (sideDataToUpdate.externalDeductions ?? 0) + deductionAmount;
        sideDataToUpdate.calculatedScore = parseFloat(
            ( (currentJuriData.baseScore ?? BASE_SCORE_TGR) -
              ((sideDataToUpdate.gerakanSalahCount ?? 0) * GERAKAN_SALAH_DEDUCTION) +
              (sideDataToUpdate.staminaKemantapanBonus ?? 0) -
              sideDataToUpdate.externalDeductions
            ).toFixed(2)
        );

        const juriUpdatePayload: Partial<TGRJuriScore> = {
            [currentPerformingSide]: sideDataToUpdate,
            lastUpdated: serverTimestamp(),
        };
        
        batch.set(juriDocRef, juriUpdatePayload, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      const firebaseError = err as any; 
      console.error("[handleAddPenalty] Dewan TGR Error. ActiveMatchId:", activeMatchId, "Penalty:", penalty.id, "Error:", firebaseError);
      let errorMessage = `Gagal menambah pelanggaran & update skor juri: ${firebaseError.message || String(firebaseError)}`;
      if (firebaseError.code === 'permission-denied') {
        errorMessage += " Pastikan Anda telah login dan memiliki izin yang cukup.";
      } else if (firebaseError.code === 'failed-precondition' && firebaseError.message.includes("index")) {
        errorMessage += ` Query memerlukan index Firestore. ${firebaseError.message.includes("currently building") ? "Index sedang dibuat, tunggu beberapa saat." : "Silakan buat index melalui link di konsol error atau di Firebase Console."}`;
      }
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsProcessing(prev => ({ ...prev, [penalty.id]: false }));
    }
  };

  const handleDeleteLastPenalty = async (penaltyType: TGRDewanPenaltyType) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("User tidak terautentikasi. Silakan login ulang dan coba lagi.");
      alert("User tidak terautentikasi. Silakan login ulang dan coba lagi.");
      return;
    }
    
    const currentPerformingSide = tgrTimerStatus.currentPerformingSide;
    if (!currentPerformingSide) {
        setError("Tidak ada sisi (Biru/Merah) yang aktif untuk menghapus penalti. Tunggu Timer Kontrol memulai sisi.");
        alert("Tidak ada sisi (Biru/Merah) yang aktif untuk menghapus penalti. Tunggu Timer Kontrol memulai sisi.");
        return;
    }

     if (!activeMatchId || activeMatchId.trim() === "" || isProcessing[penaltyType]) {
        if (!activeMatchId || activeMatchId.trim() === "") {
          setError("ID pertandingan aktif tidak valid. Tidak dapat menghapus pelanggaran.");
        }
        return;
    }
    setIsProcessing(prev => ({ ...prev, [penaltyType]: true }));
    try {
      const q = query(
        collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION),
        where("type", "==", penaltyType),
        where("side", "==", currentPerformingSide), 
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docToDelete = snapshot.docs[0];
        const deletedPenaltyPoints = (docToDelete.data() as TGRDewanPenalty).pointsDeducted;

        const batch = writeBatch(db);
        batch.delete(doc(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION, docToDelete.id));

        const deductionAmountToRevert = Math.abs(deletedPenaltyPoints);

        for (const juriId of TGR_JURI_IDS) {
            const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
            const juriDocSnap = await getDoc(juriDocRef); 

            if (juriDocSnap.exists()) {
                const currentJuriData = juriDocSnap.data() as TGRJuriScore;
                const sideDataToUpdate = currentJuriData[currentPerformingSide] 
                    ? { ...currentJuriData[currentPerformingSide]! }
                    : { gerakanSalahCount: 0, staminaKemantapanBonus: 0, externalDeductions: 0, calculatedScore: BASE_SCORE_TGR, isReady: false };

                sideDataToUpdate.externalDeductions = Math.max(0, (sideDataToUpdate.externalDeductions || 0) - deductionAmountToRevert);
                sideDataToUpdate.calculatedScore = parseFloat(
                    ( (currentJuriData.baseScore ?? BASE_SCORE_TGR) -
                      ((sideDataToUpdate.gerakanSalahCount ?? 0) * GERAKAN_SALAH_DEDUCTION) +
                      (sideDataToUpdate.staminaKemantapanBonus ?? 0) -
                      sideDataToUpdate.externalDeductions
                    ).toFixed(2)
                );
                
                const juriUpdatePayload: Partial<TGRJuriScore> = {
                    [currentPerformingSide]: sideDataToUpdate,
                    lastUpdated: serverTimestamp(),
                };
                batch.set(juriDocRef, juriUpdatePayload, { merge: true });
            }
        }
        await batch.commit();
      } else {
        alert(`Tidak ada pelanggaran tipe "${penaltyType}" untuk sisi ${currentPerformingSide} yang bisa dihapus.`);
      }
    } catch (err) {
      const firebaseError = err as any;
      console.error("[handleDeleteLastPenalty] Dewan TGR Error. ActiveMatchId:", activeMatchId, "PenaltyType:", penaltyType, "Error:", firebaseError);
      let errorMessage = `Gagal menghapus pelanggaran & update skor juri: ${firebaseError.message || String(firebaseError)}`;
      if (firebaseError.code === 'permission-denied') {
        errorMessage += " Pastikan Anda telah login dan memiliki izin yang cukup.";
      } else if (firebaseError.code === 'failed-precondition' && firebaseError.message.includes("index")) {
         errorMessage += ` Query memerlukan index Firestore. ${firebaseError.message.includes("currently building") ? "Index sedang dibuat, tunggu beberapa saat." : "Silakan buat index melalui link di konsol error atau di Firebase Console."}`;
      }
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsProcessing(prev => ({ ...prev, [penaltyType]: false }));
    }
  };

  const calculateTotalPointsForTypeAndSide = (penaltyType: TGRDewanPenaltyType, side: 'biru' | 'merah' | null): number => {
    if (!side) return 0;
    return penaltiesLog
      .filter(p => p.type === penaltyType && p.side === side)
      .reduce((sum, p) => sum + p.pointsDeducted, 0);
  };

  const totalOverallPenaltyForCurrentSide = tgrTimerStatus.currentPerformingSide 
    ? penaltiesLog
        .filter(p => p.side === tgrTimerStatus.currentPerformingSide)
        .reduce((sum, p) => sum + p.pointsDeducted, 0)
    : 0;
  
  const performingSideName = () => {
    if (!scheduleDetails || !tgrTimerStatus.currentPerformingSide) return "Peserta (Sisi Belum Aktif)";
    if (tgrTimerStatus.currentPerformingSide === 'biru') {
        return `Sudut Biru: ${scheduleDetails.pesilatBiruName || 'N/A'} (${scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    }
    return `Sudut Merah: ${scheduleDetails.pesilatMerahName || 'N/A'} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
  };

  let currentPenaltyListToDisplay: PenaltyConfigItem[];
  if (scheduleDetails?.category === 'Regu') {
    currentPenaltyListToDisplay = PENALTY_CONFIG_REGU;
  } else if (scheduleDetails?.category === 'Ganda') {
    currentPenaltyListToDisplay = PENALTY_CONFIG_GANDA;
  } else { // Default to Tunggal if category is Tunggal or not specified/matched
    currentPenaltyListToDisplay = PENALTY_CONFIG_TUNGGAL;
  }

  if (!gelanggangName && !isLoading) {
    return (
        <div className="flex flex-col min-h-screen"><Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <Info className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Nama Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data.</p>
                <Button asChild className="mt-6">
                    <Link href={`/scoring/tgr/login`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  if (isLoading && (!activeMatchId || !matchDetailsLoaded)) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">
            {configMatchId === undefined ? `Memuat konfigurasi Panel Dewan TGR untuk Gelanggang: ${gelanggangName || '...'}` : 
             !activeMatchId && configMatchId === null ? `Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName || '...'}` :
             `Memuat data pertandingan TGR untuk Gelanggang: ${gelanggangName || '...'}`}
          </p>
          {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <PageTitle 
          title={`Dewan Juri 1 - Pelanggaran TGR (Gel: ${gelanggangName || 'N/A'})`} 
          description={`Catat pelanggaran untuk ${performingSideName()}.`}
        >
            <div className="flex items-center gap-2">
                {currentUserEmail ? (
                    <div className={cn("flex items-center text-sm p-2 border rounded-md", currentUserEmail ? "text-green-600 dark:text-green-400 border-green-500" : "text-red-600 dark:text-red-400 border-red-500")}>
                        <UserCircle className="mr-2 h-4 w-4" /> 
                        {currentUserEmail ? `User: ${currentUserEmail}` : "Belum Login"}
                    </div>
                ) : (
                    <div className="flex items-center text-sm text-red-600 dark:text-red-400 p-2 border border-red-500 rounded-md">
                        <UserCircle className="mr-2 h-4 w-4" /> Belum Login ke Firebase
                    </div>
                )}
                <Button variant="outline" asChild>
                    <Link href={`/scoring/tgr/login?gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
                </Button>
            </div>
        </PageTitle>

        {isLoading && activeMatchId && !matchDetailsLoaded ? (
          <div className="text-center py-10">
            <Loader2 className="mx-auto h-16 w-16 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Memuat detail pertandingan TGR...</p>
          </div>
        ) : !activeMatchId ? (
          <div className="text-center py-10">
            <MinusCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
            <p className="text-xl font-semibold text-destructive">{error || "Tidak ada jadwal TGR yang aktif."}</p>
            <p className="text-muted-foreground mt-2">Silakan aktifkan jadwal TGR di halaman Admin atau tunggu Timer Kontrol.</p>
          </div>
        ) : !tgrTimerStatus.currentPerformingSide ? (
           <div className="text-center py-10">
            <MinusCircle className="mx-auto h-16 w-16 text-yellow-500 mb-4" />
            <p className="text-xl font-semibold text-yellow-600">Menunggu Sisi Aktif</p>
            <p className="text-muted-foreground mt-2">Timer Kontrol belum memulai penampilan untuk Sudut Biru atau Merah.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 border rounded-lg shadow bg-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-xl font-bold text-primary">{scheduleDetails?.pesilatMerahContingent }</h2>
                  <p className="text-md text-foreground">
                    {scheduleDetails?.pesilatMerahName} 
                    {scheduleDetails?.pesilatBiruName && ` & ${scheduleDetails.pesilatBiruName}`}
                    {' '}({scheduleDetails?.category || 'N/A'})
                  </p>
                </div>
                <div className="text-sm text-muted-foreground text-left sm:text-right">
                  <p>Partai/Undian: {scheduleDetails?.lotNumber || 'N/A'} | Babak: {scheduleDetails?.round || 'N/A'}</p>
                  <p>Gelanggang: {scheduleDetails?.place || 'N/A'}</p>
                  <p className="font-semibold text-lg mt-1">
                    Aktif: <span className={tgrTimerStatus.currentPerformingSide === 'biru' ? 'text-blue-600' : 'text-red-600'}>
                        {tgrTimerStatus.currentPerformingSide === 'biru' ? 'Sudut Biru' : 'Sudut Merah'}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <Info className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center p-2 bg-gray-100 dark:bg-gray-800 font-semibold border-b border-gray-300 dark:border-gray-700">
                <div className="text-sm">Pelanggaran ({scheduleDetails?.category || 'N/A'})</div>
                <div className="text-sm text-center w-24">Hapus</div>
                <div className="text-sm text-center w-28">Skor</div>
                <div className="text-sm text-center w-20">Subtotal ({tgrTimerStatus.currentPerformingSide === 'biru' ? 'Biru' : 'Merah'})</div>
              </div>

              {currentPenaltyListToDisplay.map((penalty) => (
                <div key={penalty.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center p-2 even:bg-gray-50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors duration-150">
                  <p className="text-sm text-foreground pr-2">{penalty.description}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-24 bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    onClick={() => handleDeleteLastPenalty(penalty.id)}
                    disabled={isProcessing[penalty.id] || penaltiesLog.filter(p => p.type === penalty.id && p.side === tgrTimerStatus.currentPerformingSide).length === 0 || !tgrTimerStatus.currentPerformingSide}
                  >
                    {isProcessing[penalty.id] && penaltiesLog.filter(p => p.type === penalty.id && p.side === tgrTimerStatus.currentPerformingSide).length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1 sm:mr-2" /> }
                     Hapus
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-28 mx-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => handleAddPenalty(penalty)}
                    disabled={isProcessing[penalty.id] || !tgrTimerStatus.currentPerformingSide}
                  >
                    {isProcessing[penalty.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : `${penalty.points.toFixed(2)}`}
                  </Button>
                  <div className="w-20 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                    {calculateTotalPointsForTypeAndSide(penalty.id, tgrTimerStatus.currentPerformingSide).toFixed(2)}
                  </div>
                </div>
              ))}
              
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center p-3 bg-gray-200 dark:bg-gray-900 font-bold border-t-2 border-gray-400 dark:border-gray-600">
                <div className="text-md">TOTAL PELANGGARAN ({tgrTimerStatus.currentPerformingSide === 'biru' ? 'BIRU' : 'MERAH'})</div>
                <div></div> 
                <div></div> 
                <div className="text-md text-center w-20 text-red-600 dark:text-red-400">
                  {totalOverallPenaltyForCurrentSide.toFixed(2)}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function DewanTGRPenaltyPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Panel Dewan TGR (Pelanggaran)...</p>
        </main>
      </div>
    }>
      <DewanTGRPenaltyPageComponentWithSearchParams />
    </Suspense>
  );
}

function DewanTGRPenaltyPageComponentWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <DewanTGRPenaltyPageComponent gelanggangName={gelanggangName} />;
}
