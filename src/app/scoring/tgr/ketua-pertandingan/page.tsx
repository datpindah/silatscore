
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRJuriScore, TGRDewanPenalty, TGRDewanPenaltyType, SideSpecificTGRScore } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';
const DEWAN_PENALTIES_TGR_SUBCOLLECTION = 'dewan_penalties_tgr';

const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;

const PENALTY_DESCRIPTIONS_MAP: Record<TGRDewanPenaltyType, string> = {
  'arena_out': "Keluar Gelanggang",
  'weapon_touch_floor': "Senjata Jatuh",
  'time_tolerance_violation': "Toleransi Waktu",
  'costume_violation': "Pakaian",
  'movement_hold_violation': "Gerakan Tertahan"
};

const PENALTY_DISPLAY_ORDER: TGRDewanPenaltyType[] = [
  'arena_out',
  'weapon_touch_floor',
  'time_tolerance_violation',
  'costume_violation',
  'movement_hold_violation',
];

// Define initialGlobalTgrTimerStatus locally
const initialGlobalTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, // Default target duration for TGR
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180, // Target duration
  currentPerformingSide: null,
  performanceDurationBiru: 0, // Actual recorded duration for Biru
  performanceDurationMerah: 0, // Actual recorded duration for Merah
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
  return parseFloat(Math.sqrt(variance).toFixed(2));
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


export default function KetuaPertandinganTGRPage() {
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

  const derivedIsLoading = configMatchId === undefined || (!!activeMatchId && !matchDetailsLoaded);

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
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error("[KetuaTGR] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif TGR.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) return; 
    if (configMatchId === null) {
      if (activeMatchId !== null) { 
        resetPageData(); 
        setActiveMatchId(null); 
      }
      setError("Tidak ada jadwal TGR yang aktif."); 
      return;
    }
    if (configMatchId !== activeMatchId) {
      resetPageData();
      setActiveMatchId(configMatchId);
    }
  }, [configMatchId, activeMatchId, resetPageData]);


  useEffect(() => {
    if (!activeMatchId) {
      setMatchDetailsLoaded(false); 
      if (!error?.includes("konfigurasi")) setError(null);
      return;
    }

    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;
      
      setMatchDetailsLoaded(false); // Start with not loaded for new ID

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          setScheduleDetails(scheduleDocSnap.data() as ScheduleTGR);
          setMatchDetailsLoaded(true); 
        } else {
          setError(`Detail jadwal TGR ID ${currentMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false); 
          return; 
        }

        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, currentMatchId);
        unsubscribers.push(onSnapshot(matchDataDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Ensure all fields from initialGlobalTgrTimerStatus are present
            const fsTimerStatus = data?.timerStatus as TGRTimerStatus | undefined;
            setTgrTimerStatus(fsTimerStatus ? { ...initialGlobalTgrTimerStatus, ...fsTimerStatus } : initialGlobalTgrTimerStatus);
          } else {
            setTgrTimerStatus(initialGlobalTgrTimerStatus);
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

      } catch (err) {
        if (mounted) { 
          console.error("[KetuaTGR] Error in loadData:", err); 
          setError("Gagal memuat data pertandingan TGR."); 
          setMatchDetailsLoaded(false); 
        }
      }
    };

    loadData(activeMatchId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId]);


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
    
    if (sides.length === 0 && (scheduleDetails.pesilatMerahName || scheduleDetails.pesilatBiruName)) {
        sides.push('merah'); // Default to merah if only one participant (name might be in merahName or biruName)
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
    if (seconds === undefined || seconds === null) return { menit: 0, detik: 0};
    const validSeconds = Math.max(0, seconds); // Ensure non-negative
    const minutes = Math.floor(validSeconds / 60);
    const remainingSeconds = validSeconds % 60;
    return { menit: minutes, detik: remainingSeconds };
  };
  
  const waktuTampilBiru = formatWaktuPenampilan(tgrTimerStatus.performanceDurationBiru);
  const waktuTampilMerah = formatWaktuPenampilan(tgrTimerStatus.performanceDurationMerah);


  if (derivedIsLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Panel Ketua Pertandingan TGR...</p>
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
          <Button variant="outline" asChild><Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link></Button>
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
          <p className="text-muted-foreground mb-4">Tidak ada jadwal TGR yang aktif atau detail tidak dapat dimuat.</p>
          <Button variant="outline" asChild><Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link></Button>
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
    // If one of them is undefined/empty, use the other one if available (for single participant)
    const biruKontingen = scheduleDetails.pesilatBiruContingent;
    const merahKontingen = scheduleDetails.pesilatMerahContingent;

    if (side === 'biru') {
        return biruKontingen || merahKontingen || "Kontingen";
    }
    // side === 'merah'
    return merahKontingen || biruKontingen || "Kontingen";
  };
  
  const renderSideScoresTable = (side: 'biru' | 'merah') => {
    if (side === 'biru' && !scheduleDetails.pesilatBiruName) return null;
    if (side === 'merah' && !scheduleDetails.pesilatMerahName && scheduleDetails.pesilatBiruName) return null; 
    
    const participantName = getParticipantName(side);
    const kontingenName = getKontingenName(side);
    const median = medianScores[side];
    const penalties = totalDewanPenaltyPointsMap[side];
    const final = finalScores[side];
    const stdDev = standardDeviations[side];
    const waktuTampil = side === 'biru' ? waktuTampilBiru : waktuTampilMerah;
    const recordedPerformanceDuration = side === 'biru' ? tgrTimerStatus.performanceDurationBiru : tgrTimerStatus.performanceDurationMerah;

    return (
      <div className="mb-8">
        <div className={cn("text-white p-3 md:p-4 text-center rounded-t-lg shadow-md", side === 'biru' ? 'bg-blue-600' : 'bg-red-600')}>
          <div className="flex justify-between items-center">
            <span className="text-lg md:text-xl font-semibold">{participantName.toUpperCase()}</span>
            <span className="text-lg md:text-xl font-semibold">{scheduleDetails.round?.toUpperCase()}</span> {/* Changed from babak to round */}
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
                        {allJuriScores[id]?.[side]?.isReady ? allJuriScores[id]?.[side]?.calculatedScore.toFixed(2) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow><TableCell className="font-medium py-2 px-2">Stamina/Flow <span className="text-xs">(0.01-0.10)</span></TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`stamina-${id}-${side}`} className="text-center py-2 px-2">
                        {allJuriScores[id]?.[side]?.isReady ? allJuriScores[id]?.[side]?.staminaKemantapanBonus.toFixed(2) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              <div className="mt-3 space-y-1 text-sm">
                <div className="grid grid-cols-[200px_1fr_1fr_1fr] items-center">
                  <span className="font-medium px-2">Waktu Penampilan</span>
                   <div className="text-center">
                     <span className="font-semibold">{recordedPerformanceDuration ? formatWaktuPenampilan(recordedPerformanceDuration).menit : waktuTampil.menit}</span> <span className="text-xs">Menit</span>
                   </div>
                   <div className="text-center">
                     <span className="font-semibold">{recordedPerformanceDuration ? formatWaktuPenampilan(recordedPerformanceDuration).detik : waktuTampil.detik}</span> <span className="text-xs">Detik</span>
                   </div>
                  <div></div>
                </div>
                <div className="grid grid-cols-[200px_1fr] items-center bg-yellow-100 dark:bg-yellow-800/30 p-1 rounded">
                  <span className="font-bold px-2 text-yellow-700 dark:text-yellow-300">Median</span>
                  <span className="font-bold text-center text-yellow-700 dark:text-yellow-300">{median.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="border-l border-gray-300 dark:border-gray-600 pl-3">
              <h3 className="text-md font-semibold mb-1 text-center text-gray-700 dark:text-gray-200">Pelanggaran Dewan</h3>
              <div className="space-y-1 text-xs">
                {PENALTY_DISPLAY_ORDER.map(penaltyType => {
                  const sidePenaltyValue = dewanPenalties
                    .filter(p => p.type === penaltyType && p.side === side)
                    .reduce((sum, p) => sum + p.pointsDeducted, 0);
                  return (
                    <div key={`${penaltyType}-${side}`} className="flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/40 rounded">
                      <span className="text-gray-600 dark:text-gray-300">{PENALTY_DESCRIPTIONS_MAP[penaltyType]}</span>
                      <span className={cn("font-semibold px-1.5 py-0.5 rounded text-white", sidePenaltyValue < 0 ? "bg-red-500" : "bg-gray-400 dark:bg-gray-600")}>
                        {sidePenaltyValue.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-300 dark:border-gray-600 space-y-1 text-sm">
             <div className="grid grid-cols-[200px_1fr_200px_1fr] items-center gap-x-4">
                <span className="font-bold text-lg text-right text-green-600 dark:text-green-400">Final Skor</span>
                <span className="font-bold text-lg text-left text-green-700 dark:text-green-300 py-1 px-2 bg-green-100 dark:bg-green-800/30 rounded w-min">
                    {final.toFixed(2)}
                </span>
                <span className="font-medium text-right">Standard Deviation</span>
                <span className="font-medium text-left py-1 px-2 bg-gray-100 dark:bg-gray-700/50 rounded w-min">
                    {stdDev.toFixed(2)}
                </span>
             </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        {scheduleDetails?.pesilatBiruName && renderSideScoresTable('biru')}
        {renderSideScoresTable('merah')}
        
        <div className="mt-8 text-center">
          <Button variant="outline" asChild>
            <Link href="/scoring/tgr/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login TGR</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
