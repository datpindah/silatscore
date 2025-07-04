
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation'; // Ditambahkan
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Loader2, RadioTower, AlertTriangle, Sun, Moon, ChevronsRight } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRJuriScore, SideSpecificTGRScore, TGRDewanPenalty, TGRMatchResult, TGRMatchResultDetail } from '@/lib/types';
import type { ScoreEntry as LibScoreEntryType, RoundScores as LibRoundScoresType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, limit, Timestamp, setDoc, where, getDocs, updateDoc, deleteField } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle as RadixDialogTitle, DialogDescription as DialogDesc, DialogFooter } from "@/components/ui/dialog"; // DialogDesc for consistency
import { Card, CardContent } from '@/components/ui/card';
import { useTheme } from 'next-themes';
import { Header } from '@/components/layout/Header';


const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';
const DEWAN_PENALTIES_TGR_SUBCOLLECTION = 'dewan_penalties_tgr';


const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;

const initialTgrTimerStatus: TGRTimerStatus = {
  isTimerRunning: false,
  matchStatus: 'Pending',
  currentPerformingSide: null,
  startTimeMs: null,
  accumulatedDurationMs: 0,
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
};

const initialAllJuriScores: Record<string, TGRJuriScore | null> = TGR_JURI_IDS.reduce((acc, id) => {
  acc[id] = null;
  return acc;
}, {} as Record<string, TGRJuriScore | null>);

const initialSideSummary = {
  median: 0,
  penalty: 0,
  timePerformance: 0,
  total: 0,
  stdDev: 0,
  hasPerformed: false,
};


// Helper functions for calculations
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

function calculateStandardDeviation(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  return parseFloat(Math.sqrt(variance).toFixed(3));
}


interface TGRSideSummaryTableProps {
  sideLabel: string;
  median: number;
  penalty: number;
  timePerformanceSeconds: number;
  total: number;
  stdDev: number;
  isLoadingData: boolean;
}

const formatTimeForTable = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${String(minutes).padStart(2, '0')}.${String(remainingSeconds).padStart(2, '0')}`;
};

const TGRSideSummaryTable: React.FC<TGRSideSummaryTableProps> = ({
  sideLabel, median, penalty, timePerformanceSeconds, total, stdDev, isLoadingData
}) => {

  if (isLoadingData) {
    return (
      <div className="flex-1 min-w-[300px] md:min-w-0 p-2 border border-[var(--monitor-border)] rounded-md bg-[var(--monitor-dialog-bg)] shadow-lg">
        <h3 className="text-center text-md font-semibold mb-2 text-[var(--monitor-text)]"><Skeleton className="h-6 w-48 mx-auto bg-[var(--monitor-skeleton-bg)]" /></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm border-collapse">
            <thead>
              <tr>
                {['Median', 'Penalty', 'Time Performance', 'Total'].map(header => (
                  <th key={header} className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold"><Skeleton className="h-5 w-16 mx-auto bg-green-400"/></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[1,2,3,4].map(idx => (
                    <td key={idx} className="p-1.5 border border-gray-400 dark:border-gray-600 text-center"><Skeleton className="h-5 w-12 mx-auto bg-[var(--monitor-skeleton-bg)]"/></td>
                ))}
              </tr>
              <tr>
                <th colSpan={4} className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Standard Deviation</th>
              </tr>
              <tr>
                <td colSpan={4} className="p-1.5 border border-gray-400 dark:border-gray-600 text-center"><Skeleton className="h-5 w-20 mx-auto bg-[var(--monitor-skeleton-bg)]"/></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }


  return (
    <div className="flex-1 min-w-[300px] md:min-w-0 p-2 border border-[var(--monitor-border)] rounded-md bg-[var(--monitor-dialog-bg)] shadow-lg">
      <h3 className="text-center text-md font-semibold mb-2 text-[var(--monitor-text)]">{sideLabel}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-sm border-collapse text-[var(--monitor-text)]">
          <thead>
            <tr>
              <th className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Median</th>
              <th className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Penalty</th>
              <th className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Time Performance</th>
              <th className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-400 dark:border-gray-600 text-center">{median.toFixed(3)}</td>
              <td className="p-1.5 border border-gray-400 dark:border-gray-600 text-center">{Math.abs(penalty).toFixed(2)}</td>
              <td className="p-1.5 border border-gray-400 dark:border-gray-600 text-center">{formatTimeForTable(timePerformanceSeconds)}</td>
              <td className="p-1.5 border border-gray-400 dark:border-gray-600 text-center">{total.toFixed(3)}</td>
            </tr>
            <tr>
              <th colSpan={4} className="p-1.5 border border-gray-400 dark:border-gray-600 bg-green-600 text-white font-semibold">Standard Deviation</th>
            </tr>
            <tr>
              <td colSpan={4} className="p-1.5 border border-gray-400 dark:border-gray-600 text-center">{stdDev.toFixed(3)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const hundredths = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
  return `${minutes}:${seconds}.${hundredths}`;
};

function MonitoringSkorTGRPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);

  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);
  const [allJuriScores, setAllJuriScores] = useState<Record<string, TGRJuriScore | null>>(initialAllJuriScores);
  const [dewanPenalties, setDewanPenalties] = useState<TGRDewanPenalty[]>([]);
  
  const [displayTime, setDisplayTime] = useState(0); // Local state for smooth animation
  const animationFrameRef = useRef<number>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [summaryDataBiru, setSummaryDataBiru] = useState(initialSideSummary);
  const [summaryDataMerah, setSummaryDataMerah] = useState(initialSideSummary);
  
  const [winnerData, setWinnerData] = useState<TGRMatchResult | null>(null);
  const [isWinnerOverlayOpen, setIsWinnerOverlayOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Effect for smooth timer animation
  useEffect(() => {
    const animate = () => {
      if (tgrTimerStatus.isTimerRunning && tgrTimerStatus.startTimeMs) {
        const elapsed = Date.now() - tgrTimerStatus.startTimeMs;
        setDisplayTime(tgrTimerStatus.accumulatedDurationMs + elapsed);
      } else {
        setDisplayTime(tgrTimerStatus.accumulatedDurationMs);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [tgrTimerStatus]);


  const resetPageData = useCallback(() => {
    setScheduleDetails(null);
    setTgrTimerStatus(initialTgrTimerStatus);
    setAllJuriScores(initialAllJuriScores);
    setDewanPenalties([]);
    setMatchDetailsLoaded(false);
    setError(null);
    setSummaryDataBiru(initialSideSummary);
    setSummaryDataMerah(initialSideSummary);
    setWinnerData(null);
    setIsWinnerOverlayOpen(false);
  }, []);

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
      console.error(`[MonitorTGR] Error fetching active TGR matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif TGR per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);


  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetPageData(); setActiveScheduleId(null); }
      setIsLoading(false); 
      if (!error && gelanggangName) setError(`Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName}.`);
      return;
    }
    if (configMatchId !== activeScheduleId) {
        resetPageData();
        setActiveScheduleId(configMatchId);
    }
  }, [configMatchId, activeScheduleId, resetPageData, gelanggangName, error]);

  useEffect(() => {
    if (!activeScheduleId) {
        setIsLoading(false);
        if (!error?.includes("konfigurasi") && !error?.includes("Tidak ada jadwal")) setError(null);
        return;
    }

    setIsLoading(true);
    let isMounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!isMounted || !currentMatchId) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!isMounted) return;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(data);
          setMatchDetailsLoaded(true);
        } else {
            setError(`Detail jadwal TGR ID ${currentMatchId} tidak ditemukan.`);
            setScheduleDetails(null);
            setMatchDetailsLoaded(false);
            if (isMounted) setIsLoading(false);
            return;
        }

        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, currentMatchId);
        unsubscribers.push(onSnapshot(matchDataDocRef, (docSnap) => {
          if (!isMounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            const fsTimerStatus = data?.timerStatus as Partial<TGRTimerStatus> | undefined;

            const safeTimerStatus: TGRTimerStatus = {
              ...initialTgrTimerStatus,
              ...fsTimerStatus,
              accumulatedDurationMs: fsTimerStatus?.accumulatedDurationMs ?? 0,
              performanceDurationBiru: fsTimerStatus?.performanceDurationBiru ?? 0,
              performanceDurationMerah: fsTimerStatus?.performanceDurationMerah ?? 0,
              startTimeMs: fsTimerStatus?.startTimeMs ?? null,
            };
            setTgrTimerStatus(safeTimerStatus);
            
            if (data?.matchResult) {
              setWinnerData(data.matchResult as TGRMatchResult);
              setIsWinnerOverlayOpen(true);
            } else {
              setWinnerData(null);
              setIsWinnerOverlayOpen(false);
            }

          } else {
            setTgrTimerStatus(initialTgrTimerStatus);
            setWinnerData(null);
            setIsWinnerOverlayOpen(false);
          }
        }, (err) => console.error("[MonitorTGR] Error fetching TGR match document (timer/result):", err)));

        TGR_JURI_IDS.forEach(juriId => {
          unsubscribers.push(onSnapshot(doc(matchDataDocRef, JURI_SCORES_TGR_SUBCOLLECTION, juriId), (juriScoreDoc) => {
            if (!isMounted) return;
            setAllJuriScores(prev => ({
              ...prev,
              [juriId]: juriScoreDoc.exists() ? juriScoreDoc.data() as TGRJuriScore : null
            }));
          },(err) => console.error(`[MonitorTGR] Error fetching TGR scores for ${juriId}:`, err)));
        });

        unsubscribers.push(onSnapshot(query(collection(matchDataDocRef, DEWAN_PENALTIES_TGR_SUBCOLLECTION), orderBy("timestamp", "asc")), (snap) => {
          if (!isMounted) return;
          setDewanPenalties(snap.docs.map(d => ({ id: d.id, ...d.data() } as TGRDewanPenalty)));
        }, (err) => console.error("[MonitorTGR] Error fetching dewan penalties:", err)));


      } catch (err) {
          if (isMounted) { console.error("[MonitorTGR] Error in loadData:", err); setError("Gagal memuat data pertandingan TGR."); }
      } finally {
          if (isMounted && matchDetailsLoaded) setIsLoading(false);
      }
    };

    loadData(activeScheduleId);
    return () => { isMounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId, matchDetailsLoaded]); 

 useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeScheduleId === null)) {
      setIsLoading(false);
    }
 }, [isLoading, matchDetailsLoaded, activeScheduleId]);

  // Calculate summaries
  useEffect(() => {
    if (!scheduleDetails) {
      setSummaryDataBiru(initialSideSummary);
      setSummaryDataMerah(initialSideSummary);
      return;
    }

    const calculateSideSummary = (side: 'biru' | 'merah') => {
      const validJuriScoresForSide = TGR_JURI_IDS
        .map(id => allJuriScores[id]?.[side])
        .filter(sideScore => sideScore && sideScore.isReady)
        .map(sideScore => sideScore!.calculatedScore);

      const median = validJuriScoresForSide.length > 0 ? calculateMedian(validJuriScoresForSide) : 0;
      const stdDev = validJuriScoresForSide.length > 0 ? calculateStandardDeviation(validJuriScoresForSide) : 0;

      const totalPenalties = dewanPenalties
        .filter(p => p.side === side)
        .reduce((sum, p) => sum + p.pointsDeducted, 0);

      const finalScore = parseFloat((median + totalPenalties).toFixed(2));
      const timePerformance = side === 'biru' ? (tgrTimerStatus.performanceDurationBiru ?? 0) : (tgrTimerStatus.performanceDurationMerah ?? 0);

      let hasPerformedForSummary = false;
      if (side === 'biru' && (tgrTimerStatus.performanceDurationBiru ?? 0) > 0 && (tgrTimerStatus.matchStatus === 'Finished' || tgrTimerStatus.currentPerformingSide === 'merah')) {
        hasPerformedForSummary = true;
      } else if (side === 'merah' && (tgrTimerStatus.performanceDurationMerah ?? 0) > 0 && tgrTimerStatus.matchStatus === 'Finished') {
        hasPerformedForSummary = true;
      } else if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) {
          const sideScheduled = (side === 'biru' && scheduleDetails?.pesilatBiruName) || (side === 'merah' && scheduleDetails?.pesilatMerahName);
          if (sideScheduled && validJuriScoresForSide.length > 0) {
            hasPerformedForSummary = true;
          }
      }

      return { median, penalty: totalPenalties, timePerformance: timePerformance / 1000, total: finalScore, stdDev, hasPerformed: hasPerformedForSummary };
    };

    if (scheduleDetails.pesilatBiruName) {
        setSummaryDataBiru(calculateSideSummary('biru'));
    } else {
        setSummaryDataBiru({...initialSideSummary, hasPerformed: false});
    }
    if (scheduleDetails.pesilatMerahName) {
        setSummaryDataMerah(calculateSideSummary('merah'));
    } else {
        setSummaryDataMerah({...initialSideSummary, hasPerformed: false});
    }

  }, [allJuriScores, dewanPenalties, tgrTimerStatus, scheduleDetails]);

  const ScoreCell = ({ juriId, isLoadingJuriData }: { juriId: typeof TGR_JURI_IDS[number], isLoadingJuriData?: boolean }) => {
    const juriScoreData = allJuriScores[juriId];
    let displayValue: string | number = '-';

    if (isLoadingJuriData) {
        return (
            <div className="w-full py-3 md:py-4 border border-[var(--monitor-border)] flex items-center justify-center text-lg md:text-xl font-semibold bg-gradient-to-b from-blue-500 to-blue-700 text-[var(--monitor-skor-text)] rounded-sm">
                <Skeleton className="h-6 w-10 bg-blue-300" />
            </div>
        );
    }

    let sideToConsider: 'biru' | 'merah' | null = tgrTimerStatus.currentPerformingSide;

    if (tgrTimerStatus.matchStatus === 'Finished' && !tgrTimerStatus.currentPerformingSide) {
        if (scheduleDetails?.pesilatMerahName && juriScoreData?.merah?.isReady && (tgrTimerStatus.performanceDurationMerah ?? 0) > 0) {
            sideToConsider = 'merah';
        } else if (scheduleDetails?.pesilatBiruName && juriScoreData?.biru?.isReady && (tgrTimerStatus.performanceDurationBiru ?? 0) > 0) {
            sideToConsider = 'biru';
        } else if (scheduleDetails?.pesilatMerahName && juriScoreData?.merah?.isReady) {
             sideToConsider = 'merah';
        } else if (scheduleDetails?.pesilatBiruName && juriScoreData?.biru?.isReady) {
             sideToConsider = 'biru';
        }
    }

    if (juriScoreData && sideToConsider) {
        const sideData = juriScoreData[sideToConsider];
        if (sideData) {
            if (sideData.isReady) {
                displayValue = sideData.calculatedScore.toFixed(2);
            } else if (tgrTimerStatus.matchStatus !== 'Pending' && (tgrTimerStatus.currentPerformingSide === sideToConsider)) {
                displayValue = '...';
            }
        }
    }

    return (
        <div className="w-full py-3 md:py-4 border border-[var(--monitor-border)] flex items-center justify-center text-lg md:text-xl font-semibold bg-gradient-to-b from-blue-500 to-blue-700 text-[var(--monitor-skor-text)] rounded-sm">
            {displayValue}
        </div>
    );
};

  const JuriLabelCell = ({ label }: { label: string }) => (
    <div className="w-full py-2 border border-[var(--monitor-border)] flex items-center justify-center text-sm md:text-base font-medium bg-[var(--monitor-header-section-bg)] text-[var(--monitor-header-section-text)] rounded-sm">
      {label}
    </div>
  );

  const showBiruSummaryTable = summaryDataBiru.hasPerformed && !!scheduleDetails?.pesilatBiruName &&
    !(tgrTimerStatus.currentPerformingSide === 'merah' && (tgrTimerStatus.matchStatus === 'Pending' || tgrTimerStatus.matchStatus === 'Ongoing' || tgrTimerStatus.matchStatus === 'Paused'));

  const showMerahSummaryTable = summaryDataMerah.hasPerformed && !!scheduleDetails?.pesilatMerahName;


  const getParticipantDetails = () => {
    if (!scheduleDetails) {
      return { name: isLoading ? <Skeleton className="h-7 w-40 bg-[var(--monitor-skeleton-bg)]" /> : "N/A", contingent: isLoading ? <Skeleton className="h-5 w-32 bg-[var(--monitor-skeleton-bg)] mt-1" /> : "N/A", textColorClass: "text-[var(--monitor-text)]" };
    }

    let name = "";
    let contingent = "";
    let textColorClass = "text-[var(--monitor-text)]";
    let sideToDisplayDetails: 'biru' | 'merah' | null = tgrTimerStatus.currentPerformingSide;

    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) {
        if (winnerData && winnerData.winner !== 'seri') {
            sideToDisplayDetails = winnerData.winner;
        } else if (summaryDataMerah.hasPerformed && scheduleDetails.pesilatMerahName) {
            sideToDisplayDetails = 'merah';
        } else if (summaryDataBiru.hasPerformed && scheduleDetails.pesilatBiruName) {
            sideToDisplayDetails = 'biru';
        } else if (scheduleDetails.pesilatMerahName) {
            sideToDisplayDetails = 'merah';
        } else if (scheduleDetails.pesilatBiruName) {
            sideToDisplayDetails = 'biru';
        }
    }

    if (sideToDisplayDetails === 'biru' && scheduleDetails.pesilatBiruName) {
      name = scheduleDetails.pesilatBiruName;
      contingent = scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "Kontingen";
      textColorClass = "text-[var(--monitor-pesilat-biru-name-text)]";
    } else if (sideToDisplayDetails === 'merah' && scheduleDetails.pesilatMerahName) {
      name = scheduleDetails.pesilatMerahName;
      contingent = scheduleDetails.pesilatMerahContingent || "Kontingen";
      textColorClass = "text-[var(--monitor-pesilat-merah-name-text)]";
    } else if (scheduleDetails.pesilatMerahName) { 
        name = scheduleDetails.pesilatMerahName;
        contingent = scheduleDetails.pesilatMerahContingent || "Kontingen";
        textColorClass = "text-[var(--monitor-pesilat-merah-name-text)]";
    } else if (scheduleDetails.pesilatBiruName) { 
        name = scheduleDetails.pesilatBiruName;
        contingent = scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "Kontingen";
        textColorClass = "text-[var(--monitor-pesilat-biru-name-text)]";
    }
    return { name: name || "N/A", contingent: contingent || "N/A", textColorClass };
  };

  const { name: participantName, contingent: participantContingent, textColorClass: participantTextColorClass } = getParticipantDetails();

  if (!mounted) {
    return (
        <div className={cn("flex flex-col min-h-screen items-center justify-center", "bg-background text-foreground")}>
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
            <p className="text-xl">Menginisialisasi Monitor TGR...</p>
        </div>
    );
  }
  
  if (isLoading && (configMatchId === undefined || !gelanggangName)) {
    return (
        <div className={cn("flex flex-col min-h-screen items-center justify-center", mounted && (resolvedTheme === 'light' ? 'tgr-monitoring-theme-light' : 'tgr-monitoring-theme-dark'), mounted && "bg-[var(--monitor-bg)] text-[var(--monitor-text)]")}>
            <Loader2 className="h-16 w-16 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-xl">Memuat Konfigurasi Monitor TGR {gelanggangName ? `untuk Gel. ${gelanggangName}` : '...'}</p>
        </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col flex-1 font-sans overflow-hidden relative min-h-screen", 
        mounted && (resolvedTheme === 'dark' ? 'tgr-monitoring-theme-dark' : 'tgr-monitoring-theme-light'),
        mounted && "bg-[var(--monitor-bg)] text-[var(--monitor-text)]"
      )}
    >
      <Header overrideBackgroundClass="bg-[var(--monitor-bg)]" />
      <Card className="mb-2 md:mb-4 shadow-xl bg-gradient-to-r from-primary to-red-700 text-primary-foreground mx-1 md:mx-2">
        <CardContent className="p-3 md:p-4 text-center">
          <h1 className="text-xl md:text-2xl font-bold font-headline">
            PENCAK SILAT TGR - GELANGGANG: {gelanggangName || <Loader2 className="inline h-5 w-5 animate-spin"/>}
          </h1>
          {scheduleDetails && (
              <p className="text-xs md:text-sm">
                  Partai No. {scheduleDetails.lotNumber} | {scheduleDetails.round} | {scheduleDetails.category}
              </p>
          )}
          {error && !isLoading && !scheduleDetails && <p className="text-xs md:text-sm text-yellow-300 mt-1">Gagal memuat detail pertandingan. {error}</p>}
        </CardContent>
      </Card>


      <div className="flex-grow flex flex-col p-2 md:p-4">
        {/* Name/Kontingen and Timer Row */}
        <div className="flex justify-between items-center px-2 md:px-4 py-3 md:py-4">
          <div className={cn("text-left", participantTextColorClass)}>
            <div className="font-bold text-xl md:text-2xl uppercase">{participantName}</div>
            <div className="text-md md:text-lg uppercase">({participantContingent})</div>
          </div>
          <div className="text-right">
            <div className="text-xs md:text-sm font-medium text-[var(--monitor-text-muted)]">WAKTU PENAMPILAN</div>
            <div className="font-mono font-bold text-[var(--monitor-timer-text)] tracking-tighter flex items-baseline justify-end">
                <span className="text-4xl md:text-6xl">{formatTime(displayTime).split('.')[0]}</span>
                <span className="text-2xl md:text-4xl self-end">.{formatTime(displayTime).split('.')[1] || '00'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-center items-start md:items-stretch gap-4 my-4">
          {showBiruSummaryTable && (
            <TGRSideSummaryTable
              sideLabel={`Ringkasan Sudut Biru: ${scheduleDetails?.pesilatBiruName || 'N/A'}${summaryDataBiru.hasPerformed ? " (Selesai)" : ""}`}
              median={summaryDataBiru.median}
              penalty={summaryDataBiru.penalty}
              timePerformanceSeconds={summaryDataBiru.timePerformance ?? 0}
              total={summaryDataBiru.total}
              stdDev={summaryDataBiru.stdDev}
              isLoadingData={isLoading && !matchDetailsLoaded}
            />
          )}
          {showMerahSummaryTable && (
            <TGRSideSummaryTable
              sideLabel={`Ringkasan Sudut Merah: ${scheduleDetails?.pesilatMerahName || 'N/A'}${summaryDataMerah.hasPerformed ? " (Selesai)" : ""}`}
              median={summaryDataMerah.median}
              penalty={summaryDataMerah.penalty}
              timePerformanceSeconds={summaryDataMerah.timePerformance ?? 0}
              total={summaryDataMerah.total}
              stdDev={summaryDataMerah.stdDev}
              isLoadingData={isLoading && !matchDetailsLoaded}
            />
          )}
        </div>

        <div className="w-full max-w-3xl mx-auto">
          <div className="grid grid-cols-6 gap-1 md:gap-2 mb-1">
            {TGR_JURI_IDS.map((juriId, index) => (
              <JuriLabelCell key={`label-${juriId}`} label={`JURI ${index + 1}`} />
            ))}
          </div>
          <div className="grid grid-cols-6 gap-1 md:gap-2">
            {TGR_JURI_IDS.map(juriId => (
              <ScoreCell key={`score-${juriId}`} juriId={juriId} isLoadingJuriData={isLoading && !matchDetailsLoaded} />
            ))}
          </div>
        </div>

        {tgrTimerStatus.matchStatus && (
          <div className="mt-auto pt-4 text-center text-xs md:text-sm text-[var(--monitor-status-text)]">
            Status: {tgrTimerStatus.matchStatus}
            {tgrTimerStatus.isTimerRunning && " (Berjalan)"}
            {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.accumulatedDurationMs > 0 && tgrTimerStatus.matchStatus === 'Paused' && " (Jeda)"}
            {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide && ` (${tgrTimerStatus.currentPerformingSide === 'biru' ? "Sudut Biru" : "Sudut Merah"} Selesai)`}
            {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null && " (Partai Selesai)"}
          </div>
        )}
      </div>

      {isLoading && activeScheduleId && !matchDetailsLoaded && (
        <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50">
            <Loader2 className="h-12 w-12 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-lg text-[var(--monitor-overlay-text-primary)]">Memuat Data Monitor TGR untuk Gel. {gelanggangName || '...'}</p>
        </div>
      )}
      {!activeScheduleId && !isLoading && gelanggangName && (
        <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50 p-4">
            <AlertTriangle className="h-16 w-16 text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-xl text-center text-[var(--monitor-overlay-text-primary)] mb-2">{error || `Tidak ada pertandingan TGR yang aktif untuk dimonitor di Gel. ${gelanggangName}.`}</p>
            <p className="text-sm text-center text-[var(--monitor-overlay-text-secondary)] mb-6">Silakan aktifkan jadwal TGR di panel admin atau tunggu pertandingan dimulai.</p>
            <Button variant="outline" asChild className="bg-[var(--monitor-overlay-button-bg)] border-[var(--monitor-overlay-button-border)] hover:bg-[var(--monitor-overlay-button-hover-bg)] text-[var(--monitor-overlay-button-text)]">
              <Link href={`/scoring/tgr/login?redirect=/scoring/tgr/monitoring-skor&gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
        </div>
      )}

      {winnerData && isWinnerOverlayOpen && (
         <Dialog open={isWinnerOverlayOpen} onOpenChange={setIsWinnerOverlayOpen}>
              <DialogContent className={cn(
                  "max-w-2xl p-0 overflow-hidden",
                  mounted && (resolvedTheme === 'light' ? 'tgr-monitoring-theme-light' : 'tgr-monitoring-theme-dark'),
                  mounted && "bg-[var(--monitor-dialog-bg)] text-[var(--monitor-dialog-text)] border-[var(--monitor-dialog-border)]"
              )}>
                  <DialogHeader className="sr-only">
                    <RadixDialogTitle>Hasil Akhir Pertandingan TGR</RadixDialogTitle>
                    <DialogDesc>
                      Rincian skor dan pemenang pertandingan TGR: Gelanggang {winnerData.gelanggang}, Babak {winnerData.babak}, Kategori {winnerData.kategori}.
                      {winnerData.namaSudutBiru && ` Sudut Biru: ${winnerData.namaSudutBiru} (${winnerData.kontingenBiru}).`}
                      {winnerData.namaSudutMerah && ` Sudut Merah: ${winnerData.namaSudutMerah} (${winnerData.kontingenMerah}).`}
                      Pemenang: {winnerData.winner === 'biru' ? winnerData.namaSudutBiru || 'Biru' : winnerData.winner === 'merah' ? winnerData.namaSudutMerah || 'Merah' : 'Seri'}.
                    </DialogDesc>
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
                              <TableBody className="bg-white dark:bg-gray-800 text-[var(--monitor-text)]">
                                  {[
                                      { label: "Standar Deviasi", key: "standarDeviasi", precision: 3 },
                                      { label: "Waktu Penampilan (detik)", key: "waktuPenampilan", precision: 0 },
                                      { label: "Pelanggaran", key: "pelanggaran", precision: 2 },
                                  ].map(item => (
                                      <TableRow key={item.label}>
                                          <TableCell className="font-medium p-2">{item.label}</TableCell>
                                          <TableCell className="text-center p-2">
                                              {winnerData.detailPoint.biru ? winnerData.detailPoint.biru[item.key as keyof TGRMatchResultDetail].toFixed(item.precision) : '-'}
                                          </TableCell>
                                          <TableCell className="text-center p-2">
                                               {winnerData.detailPoint.merah ? winnerData.detailPoint.merah[item.key as keyof TGRMatchResultDetail].toFixed(item.precision) : '-'}
                                          </TableCell>
                                      </TableRow>
                                  ))}
                                  <TableRow className="bg-gray-100 dark:bg-gray-700">
                                      <TableCell className="font-bold text-base p-2">Poin Kemenangan</TableCell>
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
                      <Button onClick={() => setIsWinnerOverlayOpen(false)} variant="outline" className="bg-[var(--monitor-overlay-button-bg)] text-[var(--monitor-overlay-button-text)] border-[var(--monitor-overlay-button-border)]">Tutup</Button>
                  </DialogFooter>
              </DialogContent>
          </Dialog>
      )}
    </div>
  );
}

function MonitoringSkorTGRPageWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <MonitoringSkorTGRPageComponent gelanggangName={gelanggangName} />;
}

export default function MonitoringSkorTGRPageSuspended() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render a basic loader or null during SSR and before client-side mount
    return (
        <div className={cn("flex flex-col min-h-screen items-center justify-center", "bg-background text-foreground")}>
            <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
            <p className="text-xl">Menginisialisasi Monitor TGR...</p>
        </div>
    );
  }
  
  return (
    <Suspense fallback={
      <div className={cn("flex flex-col min-h-screen items-center justify-center", resolvedTheme === 'dark' ? 'tgr-monitoring-theme-dark' : 'tgr-monitoring-theme-light', "bg-[var(--monitor-bg)] text-[var(--monitor-text)]")}>
        <Loader2 className="h-16 w-16 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
        <p className="text-xl">Memuat Halaman Monitor Skor TGR...</p>
      </div>
    }>
      <MonitoringSkorTGRPageWithSearchParams />
    </Suspense>
  );
}
