
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react'; // Added Suspense
import Link from 'next/link';
import { useSearchParams } from 'next/navigation'; // Added useSearchParams
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Info, Trophy } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRJuriScore, TGRDewanPenalty, TGRDewanPenaltyType, SideSpecificTGRScore, TGRMatchResult, TGRMatchResultDetail } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, Timestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// Changed Firestore path
const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';
const DEWAN_PENALTIES_TGR_SUBCOLLECTION = 'dewan_penalties_tgr';

const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;

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


const initialGlobalTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  currentPerformingSide: null,
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
};


const initialSideScores = { biru: 0, merah: 0 };
const initialSideSpecificTGRScore: SideSpecificTGRScore = {
  gerakanSalahCount: 0,
  staminaKemantapanBonus: 0,
  externalDeductions: 0,
  calculatedScore: 0,
  isReady: false,
};

const initialAllJuriScores: Record<string, TGRJuriScore | null> = TGR_JURI_IDS.reduce((acc, id) => {
  acc[id] = {
    baseScore: 9.90,
    biru: { ...initialSideSpecificTGRScore },
    merah: { ...initialSideSpecificTGRScore },
    lastUpdated: null,
  };
  return acc;
}, {} as Record<string, TGRJuriScore | null>);


function calculateStandardDeviation(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  return parseFloat(Math.sqrt(variance).toFixed(3));
}

function calculateMedian(scores: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length < 3) { 
    return parseFloat((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));
  }
  const sortedScores = [...scores].sort((a, b) => a - b);
  const scoresToAverage = sortedScores.slice(1, -1); 
  if (scoresToAverage.length === 0) { 
      return parseFloat((sortedScores.reduce((a,b) => a+b, 0) / sortedScores.length).toFixed(2));
  }
  return parseFloat((scoresToAverage.reduce((sum, score) => sum + score, 0) / scoresToAverage.length).toFixed(2));
}


// Renamed original export default
function KetuaPertandinganTGRPageComponent({ gelanggangNameParam }: { gelanggangNameParam: string | null }) {
  const [gelanggangName, setGelanggangName] = useState<string | null>(null); // State for gelanggangName

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialGlobalTgrTimerStatus);
  const [allJuriScores, setAllJuriScores] = useState<Record<string, TGRJuriScore | null>>(initialAllJuriScores);
  const [dewanPenalties, setDewanPenalties] = useState<TGRDewanPenalty[]>([]);

  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [medianScores, setMedianScores] = useState<{biru: number; merah: number}>(initialSideScores);
  const [totalDewanPenaltyPointsMap, setTotalDewanPenaltyPointsMap] = useState<{biru: number; merah: number}>(initialSideScores);
  const [finalScores, setFinalScores] = useState<{biru: number; merah: number}>(initialSideScores);
  const [standardDeviations, setStandardDeviations] = useState<{biru: number; merah: number}>(initialSideScores);

  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [winnerData, setWinnerData] = useState<TGRMatchResult | null>(null);
  const [isProcessingWinner, setIsProcessingWinner] = useState(false);
  
  // Added isLoading state for overall page loading indication
  const [isLoadingPage, setIsLoadingPage] = useState(true);


  const resetPageData = useCallback(() => {
    setScheduleDetails(null);
    setTgrTimerStatus(initialGlobalTgrTimerStatus);
    setAllJuriScores(initialAllJuriScores);
    setDewanPenalties([]);
    setMatchDetailsLoaded(false);
    setError(null);
    setMedianScores(initialSideScores);
    setTotalDewanPenaltyPointsMap(initialSideScores);
    setFinalScores(initialSideScores);
    setStandardDeviations(initialSideScores);
    setIsWinnerModalOpen(false);
    setWinnerData(null);
    setIsProcessingWinner(false);
  }, []);
  
  // Effect to set gelanggangName from prop
  useEffect(() => {
    setGelanggangName(gelanggangNameParam);
  }, [gelanggangNameParam]);

  // Effect 1: Listen to gelanggang map to get configMatchId
  useEffect(() => {
    if (!gelanggangName) {
      setError("Nama gelanggang tidak ditemukan di URL.");
      setConfigMatchId(null); 
      setIsLoadingPage(false);
      return;
    }
    setError(null); 
    setIsLoadingPage(true); // Start loading when gelanggangName is present

    const unsubGelanggangMap = onSnapshot(doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      let newDbConfigId: string | null = null;
      if (docSnap.exists()) {
        newDbConfigId = docSnap.data()?.[gelanggangName] || null;
      }
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
      if (!newDbConfigId) {
        setError(`Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName}.`);
        // Keep setIsLoadingPage true here, let subsequent effects handle it if matchId becomes null
      }
    }, (err) => {
      console.error("[KetuaTGR] Error fetching active matches by gelanggang map:", err);
      setError("Gagal memuat peta jadwal aktif TGR per gelanggang.");
      setConfigMatchId(null);
      setIsLoadingPage(false); // Stop loading on error
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);

  // Effect 2: Sync activeMatchId with configMatchId and reset page data
  useEffect(() => {
    if (configMatchId === undefined) { // Still waiting for configMatchId
      setIsLoadingPage(true);
      return;
    }
    if (configMatchId === null) { // No active match for this gelanggang
      if (activeMatchId !== null) { 
        resetPageData(); 
        setActiveMatchId(null); 
      }
      if (!error) setError(`Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName}.`);
      setIsLoadingPage(false); // Stop loading as there's no match
      return;
    }
    if (configMatchId !== activeMatchId) {
      resetPageData();
      setActiveMatchId(configMatchId);
      // setIsLoadingPage(true) will be set by the next effect if activeMatchId is valid
    }
  }, [configMatchId, activeMatchId, resetPageData, gelanggangName, error]);


  // Effect 3: Load Schedule Details and other match data when activeMatchId changes
  useEffect(() => {
    if (!activeMatchId) {
      setMatchDetailsLoaded(false); 
      // If configMatchId also became null, the previous effect handles error and loading.
      // If activeMatchId became null for other reasons, ensure loading stops.
      if(isLoadingPage && configMatchId === null) setIsLoadingPage(false);
      return;
    }

    let mounted = true;
    // Only set loading true if we are actually going to fetch data for a new match
    if (!matchDetailsLoaded) setIsLoadingPage(true); 
    
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) {
        if(mounted) setIsLoadingPage(false); // Ensure loading stops if condition not met
        return;
      }
      
      let scheduleDetailsLoadedThisEffect = false;

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          setScheduleDetails(scheduleDocSnap.data() as ScheduleTGR);
          setMatchDetailsLoaded(true); 
          scheduleDetailsLoadedThisEffect = true;
        } else {
          setError(`Detail jadwal TGR ID ${currentMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false); 
          if (mounted) setIsLoadingPage(false); // Stop loading if schedule not found
          return; 
        }

        // Only subscribe to other data if schedule is loaded
        if(scheduleDetailsLoadedThisEffect) {
            const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, currentMatchId);
            unsubscribers.push(onSnapshot(matchDataDocRef, (docSnap) => {
              if (!mounted) return;
              if (docSnap.exists()) {
                const data = docSnap.data();
                const fsTimerStatus = data?.timerStatus as TGRTimerStatus | undefined;
                setTgrTimerStatus(fsTimerStatus ? { ...initialGlobalTgrTimerStatus, ...fsTimerStatus } : initialGlobalTgrTimerStatus);
                if (data?.matchResult) { 
                  setWinnerData(data.matchResult as TGRMatchResult);
                  setIsWinnerModalOpen(true);
                } else {
                  setWinnerData(null);
                  setIsWinnerModalOpen(false);
                }
              } else {
                setTgrTimerStatus(initialGlobalTgrTimerStatus);
                setWinnerData(null);
                setIsWinnerModalOpen(false);
              }
            }));

            TGR_JURI_IDS.forEach(juriId => {
              unsubscribers.push(onSnapshot(doc(matchDataDocRef, JURI_SCORES_TGR_SUBCOLLECTION, juriId), (juriScoreDoc) => {
                if (!mounted) return;
                setAllJuriScores(prev => ({
                  ...prev,
                  [juriId]: juriScoreDoc.exists() ? juriScoreDoc.data() as TGRJuriScore : null
                }));
              }));
            });
            
            unsubscribers.push(onSnapshot(query(collection(matchDataDocRef, DEWAN_PENALTIES_TGR_SUBCOLLECTION), orderBy("timestamp", "asc")), (snap) => {
              if (!mounted) return;
              setDewanPenalties(snap.docs.map(d => ({ id: d.id, ...d.data() } as TGRDewanPenalty)));
            }));
        }

      } catch (err) {
        if (mounted) { 
          console.error("[KetuaTGR] Error in loadData:", err); 
          setError("Gagal memuat data pertandingan TGR."); 
          setMatchDetailsLoaded(false); 
        }
      } finally {
         // Stop loading only if all expected parts are done or failed
        if (mounted && (scheduleDetailsLoadedThisEffect || error)) setIsLoadingPage(false);
      }
    };

    loadData(activeMatchId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId]); // Removed matchDetailsLoaded from deps to avoid re-triggering on sub-data load

  // Effect for score calculations
  useEffect(() => {
    if (!scheduleDetails) {
      setMedianScores(initialSideScores);
      setTotalDewanPenaltyPointsMap(initialSideScores);
      setFinalScores(initialSideScores);
      setStandardDeviations(initialSideScores);
      return;
    }

    const newMedianScores = { biru: 0, merah: 0 };
    const newTotalPenalties = { biru: 0, merah: 0 };
    const newFinalScores = { biru: 0, merah: 0 };
    const newStdDevs = { biru: 0, merah: 0 };
    
    const sides: ('biru' | 'merah')[] = [];
    if (scheduleDetails.pesilatBiruName) sides.push('biru');
    if (scheduleDetails.pesilatMerahName) sides.push('merah');
    
    if (sides.length === 0 && (scheduleDetails.pesilatMerahName || scheduleDetails.pesilatBiruName) ) {
        sides.push(scheduleDetails.pesilatMerahName ? 'merah' : 'biru'); 
    }


    sides.forEach(side => {
      const validJuriScoresForSide = TGR_JURI_IDS
        .map(id => allJuriScores[id]?.[side])
        .filter(sideScore => sideScore && sideScore.isReady)
        .map(sideScore => sideScore!.calculatedScore);

      if (validJuriScoresForSide.length > 0) {
        newMedianScores[side] = calculateMedian(validJuriScoresForSide);
        newStdDevs[side] = calculateStandardDeviation(validJuriScoresForSide);
      }

      newTotalPenalties[side] = dewanPenalties
        .filter(p => p.side === side)
        .reduce((sum, p) => sum + p.pointsDeducted, 0);
      
      newFinalScores[side] = parseFloat((newMedianScores[side] + newTotalPenalties[side]).toFixed(2));
    });

    setMedianScores(newMedianScores);
    setTotalDewanPenaltyPointsMap(newTotalPenalties);
    setFinalScores(newFinalScores);
    setStandardDeviations(newStdDevs);

  }, [allJuriScores, dewanPenalties, scheduleDetails]);

  const formatWaktuPenampilan = (seconds: number | undefined) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) return { menit: 0, detik: 0};
    const validSeconds = Math.max(0, seconds); 
    const minutes = Math.floor(validSeconds / 60);
    const remainingSeconds = Math.round(validSeconds % 60);
    return { menit: minutes, detik: remainingSeconds };
  };
  
  const waktuTampilBiru = formatWaktuPenampilan(tgrTimerStatus.performanceDurationBiru);
  const waktuTampilMerah = formatWaktuPenampilan(tgrTimerStatus.performanceDurationMerah);

  const handleTentukanPemenang = async () => {
    if (isProcessingWinner || !scheduleDetails || !activeMatchId) return;
    if (
      tgrTimerStatus.matchStatus !== 'Finished' ||
      tgrTimerStatus.currentPerformingSide !== null
    ) {
        alert("Pertandingan belum selesai atau sisi yang tampil belum selesai. Pastikan Timer Kontrol telah menyelesaikan semua penampilan.");
        return;
    }

    setIsProcessingWinner(true);
    let winner: 'biru' | 'merah' | 'seri';
    
    const hasBiru = !!scheduleDetails.pesilatBiruName;
    const hasMerah = !!scheduleDetails.pesilatMerahName;

    if (hasBiru && !hasMerah) {
        winner = 'biru';
    } else if (!hasBiru && hasMerah) {
        winner = 'merah';
    } else if (!hasBiru && !hasMerah) {
        alert("Tidak ada peserta yang terdaftar untuk pertandingan ini.");
        setIsProcessingWinner(false);
        return;
    } else { // Both Biru and Merah exist
        if (finalScores.biru > finalScores.merah) {
            winner = 'biru';
        } else if (finalScores.merah > finalScores.biru) {
            winner = 'merah';
        } else { // Skor akhir sama, cek standar deviasi
            if (standardDeviations.biru < standardDeviations.merah) { // Lower std dev is better
                winner = 'biru';
            } else if (standardDeviations.merah < standardDeviations.biru) {
                winner = 'merah';
            } else {
                winner = 'seri'; // Jika standar deviasi juga sama
            }
        }
    }
    
    const resultData: TGRMatchResult = {
        winner,
        gelanggang: scheduleDetails.place || 'N/A',
        babak: scheduleDetails.round || 'N/A',
        kategori: scheduleDetails.category || 'N/A',
        namaSudutBiru: scheduleDetails.pesilatBiruName || undefined,
        kontingenBiru: scheduleDetails.pesilatBiruContingent || (hasBiru && scheduleDetails.pesilatMerahContingent) || undefined,
        namaSudutMerah: scheduleDetails.pesilatMerahName || undefined,
        kontingenMerah: scheduleDetails.pesilatMerahContingent || undefined,
        detailPoint: {},
        timestamp: Timestamp.now(),
    };

    if (hasBiru) {
        resultData.detailPoint.biru = {
            standarDeviasi: standardDeviations.biru,
            waktuPenampilan: tgrTimerStatus.performanceDurationBiru || 0,
            pelanggaran: totalDewanPenaltyPointsMap.biru,
            poinKemenangan: finalScores.biru,
        };
    }
    if (hasMerah) {
        resultData.detailPoint.merah = {
            standarDeviasi: standardDeviations.merah,
            waktuPenampilan: tgrTimerStatus.performanceDurationMerah || 0,
            pelanggaran: totalDewanPenaltyPointsMap.merah,
            poinKemenangan: finalScores.merah,
        };
    }
    
    setWinnerData(resultData); // Set for modal display
    setIsWinnerModalOpen(true); // Open modal

    try {
        const matchDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
        await updateDoc(matchDocRef, { matchResult: resultData });
        alert(`Pemenang telah ditentukan: ${winner === 'seri' ? 'SERI' : winner.toUpperCase()}. Hasil tersimpan.`);
    } catch (e) {
        console.error("Gagal menyimpan hasil pertandingan ke Firestore:", e);
        setError("Gagal menyimpan hasil pertandingan.");
        setIsWinnerModalOpen(false); // Close modal on error too or let user close
    } finally {
        setIsProcessingWinner(false);
    }
  };

  // isLoadingPage is true if gelanggangName is missing, or config is loading, or activeMatchId is set but details not loaded
  const derivedIsLoading = isLoadingPage || (gelanggangName && configMatchId === undefined) || (activeMatchId && !matchDetailsLoaded);


  if (derivedIsLoading && !gelanggangName) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
            <Info className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-xl font-semibold text-destructive">Nama Gelanggang Diperlukan</h1>
            <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL.</p>
            <Button asChild className="mt-6">
                <Link href={`/scoring/tgr/login`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link>
            </Button>
        </main>
      </div>
    );
  }

  if (derivedIsLoading) { // General loading for when gelanggangName is present but data is still fetching
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">
            {gelanggangName && configMatchId === undefined ? `Memuat konfigurasi Gel. ${gelanggangName}...` :
            gelanggangName && activeMatchId && !matchDetailsLoaded ? `Memuat detail pertandingan Gel. ${gelanggangName}...` :
            `Memuat Panel Ketua TGR...`}
          </p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 text-center">
          <Info className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold text-destructive mb-2">Terjadi Kesalahan</h1>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" asChild>
            <Link href={`/scoring/tgr/login?gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
          </Button>
        </main>
      </div>
    );
  }
  
  if (!activeMatchId || !scheduleDetails) {
     return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 text-center">
          <Info className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h1 className="text-2xl font-bold text-yellow-600 mb-2">Informasi Tidak Tersedia</h1>
          <p className="text-muted-foreground mb-4">{`Tidak ada jadwal TGR yang aktif untuk Gelanggang: ${gelanggangName || 'N/A'} atau detail tidak dapat dimuat.`}</p>
          <Button variant="outline" asChild>
             <Link href={`/scoring/tgr/login?gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
          </Button>
        </main>
      </div>
    );
  }
  
  const getParticipantName = (side: 'biru' | 'merah') => {
    if (!scheduleDetails) return "N/A";
    return side === 'biru' ? (scheduleDetails.pesilatBiruName || "Pesilat Biru") : (scheduleDetails.pesilatMerahName || "Pesilat Merah");
  };

  const getKontingenName = (side: 'biru' | 'merah') => {
    if (!scheduleDetails) return "N/A";
    const biruKontingen = scheduleDetails.pesilatBiruContingent;
    const merahKontingen = scheduleDetails.pesilatMerahContingent;

    if (side === 'biru') {
        return biruKontingen || merahKontingen || "Kontingen";
    }
    return merahKontingen || biruKontingen || "Kontingen";
  };
  
  const renderSideScoresTable = (side: 'biru' | 'merah') => {
    if (side === 'biru' && !scheduleDetails.pesilatBiruName) return null;
    if (side === 'merah' && !scheduleDetails.pesilatMerahName) return null; 
    
    const participantName = getParticipantName(side);
    const kontingenName = getKontingenName(side);
    const median = medianScores[side];
    const penalties = totalDewanPenaltyPointsMap[side];
    const final = finalScores[side];
    const stdDev = standardDeviations[side];
    const waktuTampil = side === 'biru' ? waktuTampilBiru : waktuTampilMerah;
    const recordedPerformanceDuration = side === 'biru' ? tgrTimerStatus.performanceDurationBiru : tgrTimerStatus.performanceDurationMerah;

    let penaltyListToDisplay: PenaltyConfigItem[];
    if (scheduleDetails?.category === 'Regu') {
      penaltyListToDisplay = PENALTY_CONFIG_REGU;
    } else if (scheduleDetails?.category === 'Ganda') {
      penaltyListToDisplay = PENALTY_CONFIG_GANDA;
    } else {
      penaltyListToDisplay = PENALTY_CONFIG_TUNGGAL;
    }

    return (
      <div className="mb-8">
        <div className={cn("text-white p-3 md:p-4 text-center rounded-t-lg shadow-md", side === 'biru' ? 'bg-blue-600' : 'bg-red-600')}>
          <div className="flex justify-between items-center">
            <span className="text-lg md:text-xl font-semibold">{participantName.toUpperCase()}</span>
            <span className="text-lg md:text-xl font-semibold">{scheduleDetails.round?.toUpperCase()}</span>
            <span className="text-lg md:text-xl font-semibold">{scheduleDetails.category?.toUpperCase()}</span>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 shadow-md rounded-b-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md md:text-lg font-bold text-gray-700 dark:text-gray-200">
              KONTINGEN: {kontingenName.toUpperCase()}
            </h2>
            <div className="text-right">
              <p className="text-sm md:text-md text-gray-600 dark:text-gray-400">Gelanggang {scheduleDetails.place || 'N/A'}, Partai {scheduleDetails.lotNumber || 'N/A'}</p>
            </div>
          </div>
           <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader><TableRow className="bg-gray-200 dark:bg-gray-700">
                  <TableHead className="py-2 px-2 text-gray-600 dark:text-gray-300 w-[200px]">Juri</TableHead>
                  {TGR_JURI_IDS.map((id, index) => (
                    <TableHead key={id} className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{index + 1}</TableHead>
                  ))}
                </TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell className="font-medium py-2 px-2">Skor</TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`kebenaran-${id}-${side}`} className="text-center py-2 px-2">
                        {derivedIsLoading ? <Skeleton className="h-5 w-10 mx-auto" /> : (allJuriScores[id]?.[side]?.isReady ? allJuriScores[id]?.[side]?.calculatedScore.toFixed(2) : '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow><TableCell className="font-medium py-2 px-2">Stamina/Flow <span className="text-xs">(0.01-0.10)</span></TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`stamina-${id}-${side}`} className="text-center py-2 px-2">
                        {derivedIsLoading ? <Skeleton className="h-5 w-10 mx-auto" /> : (allJuriScores[id]?.[side]?.isReady ? (allJuriScores[id]?.[side]?.staminaKemantapanBonus?.toFixed(2) ?? '-') : '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-3 space-y-1 text-sm">
                <div className="grid grid-cols-[200px_1fr_1fr_1fr] items-center">
                  <span className="font-medium px-2">Waktu Penampilan</span>
                   <div className="text-center">
                     <span className="font-semibold">{derivedIsLoading ? <Skeleton className="h-5 w-8 inline-block"/> : (recordedPerformanceDuration ? formatWaktuPenampilan(recordedPerformanceDuration).menit : waktuTampil.menit)}</span> <span className="text-xs">Menit</span>
                   </div>
                   <div className="text-center">
                     <span className="font-semibold">{derivedIsLoading ? <Skeleton className="h-5 w-8 inline-block"/> : (recordedPerformanceDuration ? formatWaktuPenampilan(recordedPerformanceDuration).detik : waktuTampil.detik)}</span> <span className="text-xs">Detik</span>
                   </div>
                  <div></div>
                </div>
                <div className="grid grid-cols-[200px_1fr] items-center bg-yellow-100 dark:bg-yellow-800/30 p-1 rounded">
                  <span className="font-bold px-2 text-yellow-700 dark:text-yellow-300">Median</span>
                  <span className="font-bold text-center text-yellow-700 dark:text-yellow-300">{derivedIsLoading ? <Skeleton className="h-5 w-12 inline-block"/> : median.toFixed(2)}</span>
                </div>
                 <div className="grid grid-cols-[200px_1fr] items-center bg-red-100 dark:bg-red-800/30 p-1 rounded">
                  <span className="font-semibold px-2 text-red-700 dark:text-red-300">Pelanggaran Dewan</span>
                  <span className="font-semibold text-center text-red-700 dark:text-red-300">{derivedIsLoading ? <Skeleton className="h-5 w-12 inline-block"/> : penalties.toFixed(2)}</span>
                </div>
                 <div className="grid grid-cols-[200px_1fr] items-center bg-green-100 dark:bg-green-800/30 p-1 rounded">
                  <span className="font-bold text-lg px-2 text-green-700 dark:text-green-300">Skor Akhir</span>
                  <span className="font-bold text-lg text-center text-green-700 dark:text-green-300">{derivedIsLoading ? <Skeleton className="h-6 w-16 inline-block"/> : final.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-[200px_1fr] items-center bg-indigo-100 dark:bg-indigo-800/30 p-1 rounded">
                  <span className="font-medium px-2 text-indigo-700 dark:text-indigo-300">Standard Deviasi</span>
                  <span className="font-medium text-center text-indigo-700 dark:text-indigo-300">{derivedIsLoading ? <Skeleton className="h-5 w-12 inline-block"/> : stdDev.toFixed(3)}</span>
                </div>
              </div>
            </div>
            <div className="border-l border-gray-300 dark:border-gray-600 pl-3">
              <h3 className="text-md font-semibold mb-1 text-center text-gray-700 dark:text-gray-200">Pelanggaran Dewan</h3>
              <div className="space-y-1 text-xs">
                {penaltyListToDisplay.map(penaltyConfig => {
                  const sidePenaltyValue = dewanPenalties
                    .filter(p => p.type === penaltyConfig.id && p.side === side)
                    .reduce((sum, p) => sum + p.pointsDeducted, 0);
                  return (
                    <div key={`${penaltyConfig.id}-${side}`} className="flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/40 rounded">
                      <span className="text-gray-600 dark:text-gray-300">{penaltyConfig.description}</span>
                      <span className={cn("font-semibold px-1.5 py-0.5 rounded text-white", sidePenaltyValue < 0 ? "bg-red-500" : "bg-gray-400 dark:bg-gray-600")}>
                        {derivedIsLoading ? <Skeleton className="h-4 w-10 inline-block"/> : sidePenaltyValue.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const isDetermineWinnerDisabled = derivedIsLoading ||
    isProcessingWinner ||
    !scheduleDetails ||
    (!scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName) ||
    tgrTimerStatus.matchStatus !== 'Finished' ||
    tgrTimerStatus.currentPerformingSide !== null;


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        {renderSideScoresTable('biru')}
        {renderSideScoresTable('merah')}
        
        <div className="mt-8 text-center flex flex-col items-center gap-4">
           <Button 
            onClick={handleTentukanPemenang} 
            disabled={isDetermineWinnerDisabled}
            className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 text-lg"
          >
            {isProcessingWinner ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <Trophy className="mr-2 h-5 w-5"/>}
            Tentukan Pemenang
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/scoring/tgr/login?gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login TGR</Link>
          </Button>
        </div>

        {winnerData && (
            <Dialog open={isWinnerModalOpen} onOpenChange={setIsWinnerModalOpen}>
                <DialogContent className="max-w-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 p-0">
                   <DialogHeader className="sr-only">
                        <DialogTitle>Hasil Pertandingan TGR</DialogTitle>
                        <DialogDescription>
                            Detail hasil akhir pertandingan TGR: {winnerData.kategori}, Babak {winnerData.babak}, Gelanggang {winnerData.gelanggang}. 
                            Pemenang: {winnerData.winner === 'biru' ? (winnerData.namaSudutBiru || 'BIRU') : winnerData.winner === 'merah' ? (winnerData.namaSudutMerah || 'MERAH') : 'SERI'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-blue-600 text-white p-4 rounded-t-lg">
                        <div className="flex justify-around text-center text-sm sm:text-base font-semibold">
                            <span>GLG: {winnerData.gelanggang}</span>
                            <span>BABAK: {winnerData.babak}</span>
                            <span>KATEGORI: {winnerData.kategori}</span>
                        </div>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-start text-center">
                            <div className="w-2/5">
                                <div className="text-lg sm:text-xl font-bold text-blue-700 dark:text-blue-400">{winnerData.namaSudutBiru || (scheduleDetails?.pesilatBiruName ? "SUDUT BIRU" : "")}</div>
                                <div className="text-xs sm:text-sm text-blue-600 dark:text-blue-500">{winnerData.kontingenBiru || (scheduleDetails?.pesilatBiruName ? (scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "-") : "")}</div>
                            </div>
                            <div className="w-1/5 flex flex-col items-center pt-2">
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pemenang</p>
                                <p className={cn(
                                    "text-2xl sm:text-3xl font-bold",
                                    winnerData.winner === 'biru' ? "text-blue-700 dark:text-blue-400" :
                                    winnerData.winner === 'merah' ? "text-red-700 dark:text-red-400" :
                                    "text-gray-700 dark:text-gray-300"
                                )}>
                                    {winnerData.winner === 'biru' ? (winnerData.namaSudutBiru || "BIRU") : 
                                     winnerData.winner === 'merah' ? (winnerData.namaSudutMerah || "MERAH") : "SERI"}
                                </p>
                            </div>
                            <div className="w-2/5">
                                <div className="text-lg sm:text-xl font-bold text-red-700 dark:text-red-400">{winnerData.namaSudutMerah || (scheduleDetails?.pesilatMerahName ? "SUDUT MERAH" : "")}</div>
                                <div className="text-xs sm:text-sm text-red-600 dark:text-red-500">{winnerData.kontingenMerah || (scheduleDetails?.pesilatMerahName ? (scheduleDetails.pesilatMerahContingent || "-") : "")}</div>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-md">
                            <Table className="min-w-full text-sm">
                                <TableHeader>
                                    <TableRow className="bg-gray-200 dark:bg-gray-700">
                                        <TableHead className="w-[35%] p-2 text-gray-700 dark:text-gray-300">Detail Point</TableHead>
                                        <TableHead className="w-[32.5%] text-center p-2 bg-blue-500 text-white">Biru</TableHead>
                                        <TableHead className="w-[32.5%] text-center p-2 bg-red-500 text-white">Merah</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                                    {[
                                        { label: "Standar Deviasi", key: "standarDeviasi", precision: 3 },
                                        { label: "Waktu Penampilan (detik)", key: "waktuPenampilan", precision: 0 },
                                        { label: "Pelanggaran", key: "pelanggaran", precision: 2 },
                                    ].map(item => (
                                        <TableRow key={item.label}>
                                            <TableCell className="font-medium p-2 text-gray-600 dark:text-gray-400">{item.label}</TableCell>
                                            <TableCell className="text-center p-2">
                                                {winnerData.detailPoint.biru ? winnerData.detailPoint.biru[item.key as keyof TGRMatchResultDetail].toFixed(item.precision) : '-'}
                                            </TableCell>
                                            <TableCell className="text-center p-2">
                                                 {winnerData.detailPoint.merah ? winnerData.detailPoint.merah[item.key as keyof TGRMatchResultDetail].toFixed(item.precision) : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-gray-100 dark:bg-gray-700">
                                        <TableCell className="font-bold text-base p-2 text-gray-700 dark:text-gray-300">Poin Kemenangan</TableCell>
                                        <TableCell className="text-center font-bold text-base p-2 text-blue-700 dark:text-blue-400">
                                            {winnerData.detailPoint.biru ? winnerData.detailPoint.biru.poinKemenangan.toFixed(2) : '-'}
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-base p-2 text-red-700 dark:text-red-400">
                                            {winnerData.detailPoint.merah ? winnerData.detailPoint.merah.poinKemenangan.toFixed(2) : '-'}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <DialogFooter className="p-4 bg-gray-100 dark:bg-gray-800 rounded-b-lg border-t border-gray-300 dark:border-gray-600">
                        <Button onClick={() => setIsWinnerModalOpen(false)} variant="outline">Tutup</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}

      </main>
    </div>
  );
}

// Wrapper component to handle Suspense for useSearchParams
export default function KetuaPertandinganTGRPageWithSuspense() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen"> <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Panel Ketua Pertandingan TGR...</p>
        </main>
      </div>
    }>
      <KetuaPertandinganTGRPageComponentWithSearchParams />
    </Suspense>
  );
}

function KetuaPertandinganTGRPageComponentWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangNameParam = searchParams.get('gelanggang');
  return <KetuaPertandinganTGRPageComponent gelanggangNameParam={gelanggangNameParam} />;
}

