
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Sun, Moon, ChevronsRight, AlertTriangle } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRJuriScore, SideSpecificTGRScore } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, Timestamp, where, limit, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Header } from '@/components/layout/Header';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';

const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, // Default for Tunggal, can be adjusted by Dewan
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180,
  currentPerformingSide: null,
};

const initialAllJuriScores: Record<string, TGRJuriScore | null> = TGR_JURI_IDS.reduce((acc, id) => {
  acc[id] = null;
  return acc;
}, {} as Record<string, TGRJuriScore | null>);

export default function MonitoringSkorTGRPage() {
  const [pageTheme, setPageTheme] = useState<'light' | 'dark'>('light');
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);
  const [allJuriScores, setAllJuriScores] = useState<Record<string, TGRJuriScore | null>>(initialAllJuriScores);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [isNavigatingNextMatch, setIsNavigatingNextMatch] = useState(false);

  const resetPageData = useCallback(() => {
    setScheduleDetails(null);
    setTgrTimerStatus(initialTgrTimerStatus);
    setAllJuriScores(initialAllJuriScores);
    setMatchDetailsLoaded(false);
    setError(null);
    setIsNavigatingNextMatch(false);
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error("[MonitorTGR] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif TGR.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetPageData(); setActiveScheduleId(null); }
      setIsLoading(false); setError("Tidak ada jadwal TGR yang aktif."); return;
    }
    if (configMatchId !== activeScheduleId) {
      resetPageData();
      setActiveScheduleId(configMatchId);
    }
  }, [configMatchId, activeScheduleId, resetPageData]);

  useEffect(() => {
    if (!activeScheduleId) {
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
        // Load Schedule Details
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(data);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR ID ${currentMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          setIsLoading(false);
          return;
        }

        // Listen to Match Data (Timer)
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
        }, (err) => console.error("[MonitorTGR] Error fetching TGR match document (timer):", err)));

        // Listen to Juri Scores
        TGR_JURI_IDS.forEach(juriId => {
          unsubscribers.push(onSnapshot(doc(matchDataDocRef, JURI_SCORES_TGR_SUBCOLLECTION, juriId), (juriScoreDoc) => {
            if (!mounted) return;
            setAllJuriScores(prev => ({
              ...prev,
              [juriId]: juriScoreDoc.exists() ? juriScoreDoc.data() as TGRJuriScore : null
            }));
          }, (err) => console.error(`[MonitorTGR] Error fetching TGR scores for ${juriId}:`, err)));
        });

      } catch (err) {
        if (mounted) { console.error("[MonitorTGR] Error in loadData:", err); setError("Gagal memuat data pertandingan TGR."); }
      }
    };

    loadData(activeScheduleId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId]);

  useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeScheduleId === null)) {
      setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeScheduleId]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleNextMatchNavigation = async () => {
    if (!activeScheduleId || !scheduleDetails || tgrTimerStatus.matchStatus !== 'Finished') {
        alert("Pertandingan TGR saat ini belum selesai atau detail tidak tersedia.");
        return;
    }
    setIsNavigatingNextMatch(true);
    try {
        const currentLotNumber = scheduleDetails.lotNumber;
        const schedulesRef = collection(db, SCHEDULE_TGR_COLLECTION);
        const q = query(
            schedulesRef,
            where('lotNumber', '>', currentLotNumber),
            orderBy('lotNumber', 'asc'),
            limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert("Ini adalah partai TGR terakhir. Tidak ada partai berikutnya.");
        } else {
            const nextMatchDoc = querySnapshot.docs[0];
            await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: nextMatchDoc.id });
        }
    } catch (err) {
        console.error("Error navigating to next TGR match:", err);
        alert("Gagal berpindah ke partai TGR berikutnya.");
    } finally {
        setIsNavigatingNextMatch(false);
    }
  };

  const ScoreCell = ({ juriId, isLoadingJuriData }: { juriId: typeof TGR_JURI_IDS[number], isLoadingJuriData?: boolean }) => {
    const juriScoreData = allJuriScores[juriId];
    let displayValue: string | number = '-';

    if (isLoadingJuriData) {
        return (
            <div className="w-full py-3 md:py-4 border border-[var(--monitor-border)] flex items-center justify-center text-lg md:text-xl font-semibold bg-[var(--monitor-skor-biru-bg)] text-[var(--monitor-skor-text)] rounded-sm">
                <Skeleton className="h-6 w-10 bg-[var(--monitor-skeleton-bg)]" />
            </div>
        );
    }

    let sideToConsider: 'biru' | 'merah' | null = tgrTimerStatus.currentPerformingSide;

    if (!sideToConsider && tgrTimerStatus.matchStatus === 'Finished') {
        // If match is finished and no current side, default to 'merah' if it existed, else 'biru'
        if (scheduleDetails?.pesilatMerahName) {
            sideToConsider = 'merah';
        } else if (scheduleDetails?.pesilatBiruName) {
            sideToConsider = 'biru';
        }
    }
    
    if (juriScoreData && sideToConsider) {
        const sideData = juriScoreData[sideToConsider];
        if (sideData) {
            if (sideData.isReady) {
                displayValue = sideData.calculatedScore.toFixed(2);
            } else {
                displayValue = '...'; // Juri has data but not "SIAP" yet for this side
            }
        }
    }

    return (
        <div className="w-full py-3 md:py-4 border border-[var(--monitor-border)] flex items-center justify-center text-lg md:text-xl font-semibold bg-[var(--monitor-skor-biru-bg)] text-[var(--monitor-skor-text)] rounded-sm">
            {displayValue}
        </div>
    );
};


  const JuriLabelCell = ({ label }: { label: string }) => (
    <div className="w-full py-2 border border-[var(--monitor-border)] flex items-center justify-center text-sm md:text-base font-medium bg-[var(--monitor-header-section-bg)] text-[var(--monitor-text)] rounded-sm">
      {label}
    </div>
  );

  const mainParticipantName = () => {
    if (!scheduleDetails) return <Skeleton className="h-5 w-32 inline-block bg-[var(--monitor-skeleton-bg)]" />;
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruName) return scheduleDetails.pesilatBiruName;
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahName) return scheduleDetails.pesilatMerahName;
    if (scheduleDetails.pesilatMerahName && !scheduleDetails.pesilatBiruName) return scheduleDetails.pesilatMerahName; // Single performer (merah default)
    if (scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName) return scheduleDetails.pesilatBiruName; // Single performer (biru)
    return scheduleDetails.pesilatMerahName || "Nama Peserta"; // Fallback if side logic is complex
  };

  const mainParticipantContingent = () => {
    if (!scheduleDetails) return <Skeleton className="h-4 w-24 inline-block bg-[var(--monitor-skeleton-bg)] mt-1" />;
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruContingent) return scheduleDetails.pesilatBiruContingent;
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahContingent) return scheduleDetails.pesilatMerahContingent;
    // Fallback logic for single performer or if one contingent is primary
    return scheduleDetails.pesilatMerahContingent || scheduleDetails.pesilatBiruContingent || "Kontingen";
  };
  
  const displaySideName = tgrTimerStatus.currentPerformingSide 
    ? (tgrTimerStatus.currentPerformingSide === 'biru' ? 'SUDUT BIRU' : 'SUDUT MERAH')
    : (scheduleDetails?.pesilatMerahName && !scheduleDetails.pesilatBiruName ? 'PESERTA' : (scheduleDetails?.pesilatBiruName && !scheduleDetails.pesilatMerahName ? 'PESERTA' : 'N/A'));


  return (
    <>
      <Header />
      <div className={cn(
          "flex flex-col min-h-screen font-sans overflow-hidden relative -mt-16", 
          pageTheme === 'light' ? 'tgr-monitoring-theme-light' : 'tgr-monitoring-theme-dark', 
          "bg-[var(--monitor-bg)] text-[var(--monitor-text)]"
        )}
      >
        <Button
          variant="outline"
          size="icon"
          onClick={() => setPageTheme(prev => prev === 'light' ? 'dark' : 'light')}
          className="absolute top-2 right-2 z-[100] bg-[var(--monitor-dialog-bg)] text-[var(--monitor-text)] border-[var(--monitor-border)] hover:bg-[var(--monitor-neutral-bg)]"
          aria-label={pageTheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
        >
          {pageTheme === 'dark' ? <Sun className="h-[1.2rem] w-[1.2rem]" /> : <Moon className="h-[1.2rem] w-[1.2rem]" />}
        </Button>

        {/* Header Bar specific to this page */}
        <div className="bg-[var(--monitor-header-section-bg)] p-3 md:p-4 text-center text-sm md:text-base font-semibold text-[var(--monitor-text)]">
          <div className="grid grid-cols-4 gap-1 items-center">
            <div>{displaySideName}</div>
            <div>Partai/Pool: {scheduleDetails?.lotNumber || <Skeleton className="h-5 w-16 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
            <div>{scheduleDetails?.category || <Skeleton className="h-5 w-20 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
            <div>Babak: {scheduleDetails?.round || <Skeleton className="h-5 w-20 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
          </div>
        </div>

        <div className="flex-grow flex flex-col p-2 md:p-4">
          {/* Kontingen and Timer */}
          <div className="flex justify-between items-center mb-3 md:mb-6 px-1">
            <div className="text-left">
              <div className="text-xs md:text-sm font-medium text-[var(--monitor-text-muted)]">KONTINGEN</div>
              <div className="text-lg md:text-2xl font-bold text-[var(--monitor-text)]">
                {mainParticipantContingent()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs md:text-sm font-medium text-[var(--monitor-text-muted)]">TIMER</div>
              <div className="text-3xl md:text-5xl font-mono font-bold text-[var(--monitor-timer-text)]">
                {formatTime(tgrTimerStatus.timerSeconds)}
              </div>
            </div>
          </div>

          {/* Juri Scores Table */}
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

          {/* Status Message */}
          {tgrTimerStatus.matchStatus && (
            <div className="mt-auto pt-4 text-center text-xs md:text-sm text-[var(--monitor-status-text)]">
              Status: {tgrTimerStatus.matchStatus}
              {tgrTimerStatus.isTimerRunning && " (Berjalan)"}
               {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.timerSeconds > 0 && tgrTimerStatus.matchStatus === 'Paused' && " (Jeda)"}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide && ` (${tgrTimerStatus.currentPerformingSide === 'biru' ? "Sudut Biru" : "Sudut Merah"} Selesai)`}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null && " (Partai Selesai)"}
            </div>
          )}
        </div>
        
        {/* Overlays and Fixed Buttons */}
        {isLoading && activeScheduleId && !matchDetailsLoaded && (
           <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50">
              <Loader2 className="h-12 w-12 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
              <p className="text-lg text-[var(--monitor-overlay-text-primary)]">Memuat Data Monitor TGR...</p>
           </div>
        )}
         {!activeScheduleId && !isLoading && (
           <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50 p-4">
              <AlertTriangle className="h-16 w-16 text-[var(--monitor-overlay-accent-text)] mb-4" />
              <p className="text-xl text-center text-[var(--monitor-overlay-text-primary)] mb-2">{error || "Tidak ada pertandingan TGR yang aktif untuk dimonitor."}</p>
              <p className="text-sm text-center text-[var(--monitor-overlay-text-secondary)] mb-6">Silakan aktifkan jadwal TGR di panel admin atau tunggu pertandingan dimulai.</p>
              <Button variant="outline" asChild className="bg-[var(--monitor-overlay-button-bg)] border-[var(--monitor-overlay-button-border)] hover:bg-[var(--monitor-overlay-button-hover-bg)] text-[var(--monitor-overlay-button-text)]">
                <Link href="/scoring/tgr/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
              </Button>
           </div>
        )}
        
        {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null && (
            <Button
                onClick={handleNextMatchNavigation}
                disabled={isNavigatingNextMatch || isLoading}
                className="fixed bottom-6 right-6 z-50 shadow-lg bg-green-600 hover:bg-green-700 text-white py-3 px-4 text-sm md:text-base rounded-full"
                title="Lanjut ke Partai TGR Berikutnya"
            >
                {isNavigatingNextMatch ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                    <ChevronsRight className="mr-2 h-5 w-5" />
                )}
                Partai Berikutnya
            </Button>
        )}
      </div>
    </>
  );
}

