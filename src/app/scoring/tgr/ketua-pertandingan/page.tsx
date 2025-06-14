
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRJuriScore, TGRDewanPenalty, TGRDewanPenaltyType } from '@/lib/types';
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
  'arena_out': "Penampilan Keluar Gelanggang 10mx10m",
  'weapon_touch_floor': "Menjatuhkan Senjata Menyentuh Lantai",
  'time_tolerance_violation': "Penampilan melebihi atau kurang dari toleransi waktu",
  'costume_violation': "Pakaian tidak sesuai aturan",
  'movement_hold_violation': "Menahan gerakan lebih dari 5 (lima) detik."
};

const PENALTY_DISPLAY_ORDER: TGRDewanPenaltyType[] = [
  'arena_out',
  'weapon_touch_floor',
  'time_tolerance_violation',
  'costume_violation',
  'movement_hold_violation',
];


const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 0,
};

const initialAllJuriScores: Record<string, TGRJuriScore | null> = TGR_JURI_IDS.reduce((acc, id) => {
  acc[id] = null;
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
  if (scores.length < 3) { // If less than 3 scores, average them (or handle as per specific rule)
    return parseFloat((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2));
  }
  const sortedScores = [...scores].sort((a, b) => a - b);
  const scoresToAverage = sortedScores.slice(1, -1); // Drop highest and lowest
  if (scoresToAverage.length === 0) { // Should not happen if initial length >=3, but as a safeguard
      return parseFloat((sortedScores.reduce((a,b) => a+b, 0) / sortedScores.length).toFixed(2));
  }
  return parseFloat((scoresToAverage.reduce((sum, score) => sum + score, 0) / scoresToAverage.length).toFixed(2));
}


export default function KetuaPertandinganTGRPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);
  const [allJuriScores, setAllJuriScores] = useState<Record<string, TGRJuriScore | null>>(initialAllJuriScores);
  const [dewanPenalties, setDewanPenalties] = useState<TGRDewanPenalty[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  // Calculated values
  const [medianScore, setMedianScore] = useState(0);
  const [totalDewanPenaltyPoints, setTotalDewanPenaltyPoints] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [standardDeviation, setStandardDeviation] = useState(0);

  const resetPageData = useCallback(() => {
    setScheduleDetails(null);
    setTgrTimerStatus(initialTgrTimerStatus);
    setAllJuriScores(initialAllJuriScores);
    setDewanPenalties([]);
    setMatchDetailsLoaded(false);
    setError(null);
    setMedianScore(0);
    setTotalDewanPenaltyPoints(0);
    setFinalScore(0);
    setStandardDeviation(0);
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
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeMatchId !== null) { resetPageData(); setActiveMatchId(null); }
      setIsLoading(false); setError("Tidak ada jadwal TGR yang aktif."); return;
    }
    if (configMatchId !== activeMatchId) {
      resetPageData();
      setActiveMatchId(configMatchId);
    }
  }, [configMatchId, activeMatchId, resetPageData]);

  useEffect(() => {
    if (!activeMatchId) {
      setIsLoading(false);
      if (!error?.includes("konfigurasi")) setError(null);
      return;
    }

    setIsLoading(true);
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;
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
          setMatchDetailsLoaded(false); // Explicitly set to false
          setIsLoading(false); // Stop loading if details not found
          return;
        }

        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, currentMatchId);
        unsubscribers.push(onSnapshot(matchDataDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timerStatus) setTgrTimerStatus(data.timerStatus as TGRTimerStatus);
            else setTgrTimerStatus(initialTgrTimerStatus);
          } else {
            setTgrTimerStatus(initialTgrTimerStatus);
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
        if (mounted) { console.error("[KetuaTGR] Error in loadData:", err); setError("Gagal memuat data pertandingan TGR."); }
      }
    };

    loadData(activeMatchId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId]);

  useEffect(() => {
    if (isLoading && matchDetailsLoaded && Object.values(allJuriScores).some(s => s !== null)) {
      setIsLoading(false);
    } else if (isLoading && activeMatchId === null) {
      setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, allJuriScores, activeMatchId]);

  // Calculations useEffect
  useEffect(() => {
    const validJuriScores = TGR_JURI_IDS
      .map(id => allJuriScores[id])
      .filter(score => score && score.isReady)
      .map(score => score!.calculatedScore);

    if (validJuriScores.length > 0) {
      const currentMedian = calculateMedian(validJuriScores);
      setMedianScore(currentMedian);
      setStandardDeviation(calculateStandardDeviation(validJuriScores));
      
      const currentTotalDewanPenalties = dewanPenalties.reduce((sum, p) => sum + p.pointsDeducted, 0);
      setTotalDewanPenaltyPoints(currentTotalDewanPenalties);
      
      setFinalScore(parseFloat((currentMedian + currentTotalDewanPenalties).toFixed(2)));
    } else {
      setMedianScore(0);
      setStandardDeviation(0);
      const currentTotalDewanPenalties = dewanPenalties.reduce((sum, p) => sum + p.pointsDeducted, 0);
      setTotalDewanPenaltyPoints(currentTotalDewanPenalties);
      setFinalScore(parseFloat(currentTotalDewanPenalties.toFixed(2)));
    }
  }, [allJuriScores, dewanPenalties]);

  const formatWaktuPenampilan = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return { menit: minutes, detik: remainingSeconds };
  };
  const waktuTampil = formatWaktuPenampilan(tgrTimerStatus.performanceDuration);


  const aggregatedPenalties: Record<string, number> = PENALTY_DISPLAY_ORDER.reduce((acc, type) => {
    acc[type] = dewanPenalties
      .filter(p => p.type === type)
      .reduce((sum, p) => sum + p.pointsDeducted, 0);
    return acc;
  }, {} as Record<string, number>);


  if (isLoading) {
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
  
  const participantName = scheduleDetails.pesilatMerahName || "Nama Peserta";
  const kontingenName = scheduleDetails.pesilatMerahContingent || "Kontingen";
  const kategori = scheduleDetails.category || "Tunggal";
  const babak = scheduleDetails.round || "N/A";
  const gelanggangPartai = `Gelanggang ${scheduleDetails.place || 'N/A'}, Partai ${scheduleDetails.lotNumber || 'N/A'}`;


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="bg-blue-600 text-white p-3 md:p-4 text-center rounded-t-lg shadow-md">
          <div className="flex justify-between items-center">
            <span className="text-lg md:text-xl font-semibold">{participantName.toUpperCase()}</span>
            <span className="text-lg md:text-xl font-semibold">{babak.toUpperCase()}</span>
            <span className="text-lg md:text-xl font-semibold">{kategori.toUpperCase()}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-3 md:p-4 shadow-md rounded-b-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-md md:text-lg font-bold text-gray-700 dark:text-gray-200">
              KONTINGEN: {kontingenName.toUpperCase()}
            </h2>
            <div className="text-right">
              <p className="text-sm md:text-md text-gray-600 dark:text-gray-400">{gelanggangPartai}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            {/* Juri Scores Table */}
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow className="bg-gray-200 dark:bg-gray-700">
                    <TableHead className="py-2 px-2 text-gray-600 dark:text-gray-300 w-[200px]">Juri</TableHead>
                    {TGR_JURI_IDS.map((id, index) => (
                      <TableHead key={id} className="py-2 px-2 text-center text-gray-600 dark:text-gray-300">{index + 1}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium py-2 px-2">Kebenaran Skor</TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`kebenaran-${id}`} className="text-center py-2 px-2">
                        {allJuriScores[id]?.isReady ? allJuriScores[id]?.calculatedScore.toFixed(2) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium py-2 px-2">Urutan Gerakan/Stamina <span className="text-xs">(0.01-0.10)</span></TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`stamina-${id}`} className="text-center py-2 px-2">
                        {allJuriScores[id]?.isReady ? allJuriScores[id]?.staminaKemantapanBonus.toFixed(2) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="bg-gray-100 dark:bg-gray-700/50 font-semibold">
                    <TableCell className="py-2 px-2">Total Skor</TableCell>
                    {TGR_JURI_IDS.map(id => (
                      <TableCell key={`total-${id}`} className="text-center py-2 px-2">
                        {allJuriScores[id]?.isReady ? allJuriScores[id]?.calculatedScore.toFixed(2) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              
              {/* Waktu, Detail Juri, Median */}
              <div className="mt-3 space-y-1 text-sm">
                <div className="grid grid-cols-[200px_1fr_1fr_1fr] items-center">
                  <span className="font-medium px-2">Waktu Penampilan</span>
                  <div className="text-center">
                    <span className="font-semibold">{waktuTampil.menit}</span> <span className="text-xs">Menit</span>
                  </div>
                  <div className="text-center">
                    <span className="font-semibold">{waktuTampil.detik}</span> <span className="text-xs">Detik</span>
                  </div>
                  <div></div>
                </div>
                 <div className="grid grid-cols-[200px_1fr] items-center">
                    <span className="font-medium px-2">Detail Juri</span>
                    <span className="px-2 text-center">-</span>
                </div>
                <div className="grid grid-cols-[200px_1fr] items-center bg-yellow-100 dark:bg-yellow-800/30 p-1 rounded">
                    <span className="font-bold px-2 text-yellow-700 dark:text-yellow-300">Median</span>
                    <span className="font-bold text-center text-yellow-700 dark:text-yellow-300">{medianScore.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Dewan Penalties */}
            <div className="border-l border-gray-300 dark:border-gray-600 pl-3">
              <h3 className="text-md font-semibold mb-1 text-center text-gray-700 dark:text-gray-200">Pelanggaran Dewan</h3>
              <div className="space-y-1 text-xs">
                {PENALTY_DISPLAY_ORDER.map(penaltyType => (
                  <div key={penaltyType} className="flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/40 rounded">
                    <span className="text-gray-600 dark:text-gray-300">{PENALTY_DESCRIPTIONS_MAP[penaltyType]}</span>
                    <span className={cn(
                        "font-semibold px-1.5 py-0.5 rounded text-white",
                        (aggregatedPenalties[penaltyType] ?? 0) < 0 ? "bg-red-500" : "bg-gray-400 dark:bg-gray-600"
                    )}>
                      {(aggregatedPenalties[penaltyType] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Final Score & Standard Deviation */}
          <div className="mt-4 pt-3 border-t border-gray-300 dark:border-gray-600 space-y-1 text-sm">
             <div className="grid grid-cols-[200px_1fr_200px_1fr] items-center gap-x-4">
                <span className="font-bold text-lg text-right text-green-600 dark:text-green-400">Final Skor</span>
                <span className="font-bold text-lg text-left text-green-700 dark:text-green-300 py-1 px-2 bg-green-100 dark:bg-green-800/30 rounded w-min">
                    {finalScore.toFixed(2)}
                </span>
                <span className="font-medium text-right">Standard Deviation</span>
                <span className="font-medium text-left py-1 px-2 bg-gray-100 dark:bg-gray-700/50 rounded w-min">
                    {standardDeviation.toFixed(2)}
                </span>
             </div>
          </div>
           <div className="mt-8 text-center">
            <Button variant="outline" asChild>
              <Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

