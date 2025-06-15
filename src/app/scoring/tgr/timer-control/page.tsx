
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Play, RotateCcw, ChevronsRight, Loader2, PauseIcon, Info } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, where, getDocs, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';

const getPerformanceDurationForRound = (roundName: string | undefined): number => {
  const round = roundName?.toLowerCase() || '';
  if (round.includes('penyisihan') || round.includes('perempat final')) return 80; // 1 min 20 sec
  if (round.includes('semi final')) return 100; // 1 min 40 sec
  if (round.includes('final')) return 180; // 3 min
  return 180; // Default
};

const initialGlobalTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180,
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180,
  currentPerformingSide: null,
};

export default function TGRTimerControlPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialGlobalTgrTimerStatus);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error("Error fetching active TGR schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif TGR.");
      setConfigMatchId(null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setTgrTimerStatus(initialGlobalTgrTimerStatus);
      setMatchDetailsLoaded(false);
      setError(null);
      setActiveMatchId(configMatchId);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);

  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading) setIsLoading(false);
      setScheduleDetails(null);
      setTgrTimerStatus(initialGlobalTgrTimerStatus);
      setMatchDetailsLoaded(false);
      return;
    }

    let mounted = true;
    if (!matchDetailsLoaded) setIsLoading(true);

    const loadScheduleAndInitializeTimer = async () => {
      if (!mounted) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        let currentSchedule: ScheduleTGR | null = null;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(data);
          currentSchedule = data;
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR ID ${activeMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          setIsLoading(false);
          return;
        }

        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
        const unsubTimer = onSnapshot(matchDataDocRef, async (matchDocSnap) => {
          if (!mounted) return;
          const roundDuration = getPerformanceDurationForRound(currentSchedule?.round);
          let initialSide: 'biru' | 'merah' | null = null;
          if (currentSchedule?.pesilatBiruName && currentSchedule?.pesilatMerahName) {
            initialSide = 'biru';
          } else if (currentSchedule?.pesilatMerahName || currentSchedule?.pesilatBiruName) { // If either is present, default to merah if biru is not.
            initialSide = 'merah';
          }
          
          if (matchDocSnap.exists()) {
            const data = matchDocSnap.data();
            if (data?.timerStatus) {
              const fsTimerStatus = data.timerStatus as TGRTimerStatus;
              // If status is 'Finished' overall, or if currentPerformingSide is null (from previous overall finish), re-init for new schedule
              if (fsTimerStatus.matchStatus === 'Finished' && fsTimerStatus.currentPerformingSide === null) {
                 const reinitializedStatus: TGRTimerStatus = {
                    timerSeconds: roundDuration,
                    isTimerRunning: false,
                    matchStatus: 'Pending',
                    performanceDuration: roundDuration,
                    currentPerformingSide: initialSide,
                  };
                  setTgrTimerStatus(reinitializedStatus);
                  await setDoc(matchDataDocRef, { timerStatus: reinitializedStatus }, { merge: true });
              } else {
                // Ensure performanceDuration and possibly timerSeconds are correct if schedule changed but status wasn't fully reset
                 if (fsTimerStatus.performanceDuration !== roundDuration || 
                    (fsTimerStatus.matchStatus === 'Pending' && fsTimerStatus.timerSeconds !== roundDuration)) {
                    setTgrTimerStatus({ 
                        ...fsTimerStatus, 
                        performanceDuration: roundDuration,
                        timerSeconds: (fsTimerStatus.matchStatus === 'Pending' || fsTimerStatus.timerSeconds > roundDuration) ? roundDuration : fsTimerStatus.timerSeconds,
                        currentPerformingSide: fsTimerStatus.currentPerformingSide || initialSide // Ensure side is set
                    });
                 } else {
                    setTgrTimerStatus({...fsTimerStatus, currentPerformingSide: fsTimerStatus.currentPerformingSide || initialSide});
                 }
              }
            } else { // timerStatus field doesn't exist
              const newStatus: TGRTimerStatus = {
                timerSeconds: roundDuration,
                isTimerRunning: false,
                matchStatus: 'Pending',
                performanceDuration: roundDuration,
                currentPerformingSide: initialSide,
              };
              setTgrTimerStatus(newStatus);
              await setDoc(matchDataDocRef, { timerStatus: newStatus }, { merge: true });
            }
          } else { // Match document doesn't exist
            const newStatus: TGRTimerStatus = {
              timerSeconds: roundDuration,
              isTimerRunning: false,
              matchStatus: 'Pending',
              performanceDuration: roundDuration,
              currentPerformingSide: initialSide,
            };
            setTgrTimerStatus(newStatus);
            await setDoc(matchDataDocRef, { timerStatus: newStatus });
          }
        });
        return unsubTimer;
      } catch (err) {
        if (mounted) {
          console.error("Error loading schedule and timer:", err);
          setError("Gagal memuat data pertandingan TGR.");
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      }
    };

    const unsubTimerListenerPromise = loadScheduleAndInitializeTimer();
    
    return () => {
      mounted = false;
      unsubTimerListenerPromise.then(unsub => { if (unsub) unsub(); });
    };
  }, [activeMatchId]);


  useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeMatchId === null)) {
        setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeMatchId]);

  useEffect(() => {
    if (tgrTimerStatus.isTimerRunning && tgrTimerStatus.timerSeconds > 0 && activeMatchId) {
      timerIntervalRef.current = setInterval(async () => {
        if (!activeMatchId) {
          if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return;
        }
        try {
          const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
          const currentDBDoc = await getDoc(matchDataDocRef);
          
          if (!currentDBDoc.exists() || !(currentDBDoc.data()?.timerStatus as TGRTimerStatus)?.isTimerRunning) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            if (currentDBDoc.exists()) setTgrTimerStatus(currentDBDoc.data()?.timerStatus as TGRTimerStatus || initialGlobalTgrTimerStatus);
            return;
          }

          const currentDBTimerStatus = currentDBDoc.data()?.timerStatus as TGRTimerStatus;
          const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
          let newMatchStatus = currentDBTimerStatus.matchStatus;
          let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

          if (newSeconds === 0) {
            newIsTimerRunning = false;
            newMatchStatus = 'Finished'; // Mark current side/phase as finished
          }
          
          const updatedStatus: Partial<TGRTimerStatus> = { 
            timerSeconds: newSeconds, 
            isTimerRunning: newIsTimerRunning,
            matchStatus: newMatchStatus,
          };
          await updateDoc(matchDataDocRef, { timerStatus: {...currentDBTimerStatus, ...updatedStatus} });
        } catch (e) {
          console.error("Error updating timer in interval:", e);
          if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [tgrTimerStatus.isTimerRunning, tgrTimerStatus.timerSeconds, activeMatchId]);

  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TGRTimerStatus>) => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);
    try {
      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      const docSnap = await getDoc(matchDataDocRef);
      const roundDuration = getPerformanceDurationForRound(scheduleDetails.round);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timerStatus 
                                   ? docSnap.data()?.timerStatus as TGRTimerStatus 
                                   : { 
                                       timerSeconds: roundDuration,
                                       isTimerRunning: false,
                                       matchStatus: 'Pending',
                                       performanceDuration: roundDuration,
                                       currentPerformingSide: (scheduleDetails.pesilatBiruName && scheduleDetails.pesilatMerahName) ? 'biru' : 'merah',
                                     };
      
      const newFullStatus: TGRTimerStatus = {
        ...currentDBTimerStatus,
        ...newStatusUpdates,
      };
      await setDoc(matchDataDocRef, { timerStatus: newFullStatus }, { merge: true });
    } catch (e) {
      console.error("Error updating TGR timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeMatchId, scheduleDetails]);

  const handleStartPauseTimer = () => {
    if (!activeMatchId || !scheduleDetails || (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'merah') || (tgrTimerStatus.matchStatus === 'Finished' && !scheduleDetails.pesilatBiruName)) return;

    if (tgrTimerStatus.isTimerRunning) { // Pause
      updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: 'Paused' });
    } else { // Start
      if (tgrTimerStatus.timerSeconds > 0) {
        updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: 'Ongoing' });
      } else {
        alert("Timer sudah 0, tidak bisa dimulai. Reset dulu atau lanjut ke sisi/peserta berikutnya.");
      }
    }
  };

  const handleResetTimer = () => {
    if (!activeMatchId || !scheduleDetails) return;
    const roundDuration = getPerformanceDurationForRound(scheduleDetails.round);
    let sideToResetTo = tgrTimerStatus.currentPerformingSide;
    if (!sideToResetTo) { // If overall finished or not set, determine based on schedule
        sideToResetTo = (scheduleDetails.pesilatBiruName && scheduleDetails.pesilatMerahName) ? 'biru' : 'merah';
    }

    updateTimerStatusInFirestore({
      timerSeconds: roundDuration,
      isTimerRunning: false,
      matchStatus: 'Pending',
      performanceDuration: roundDuration,
      currentPerformingSide: sideToResetTo, // Reset to the current or initial side
    });
  };

  const handleAdvanceStateOrParticipant = async () => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);

    try {
      // Case 1: Biru just finished, and Merah is next in the same schedule
      if (tgrTimerStatus.currentPerformingSide === 'biru' && tgrTimerStatus.matchStatus === 'Finished' && scheduleDetails.pesilatMerahName) {
        const roundDuration = getPerformanceDurationForRound(scheduleDetails.round);
        await updateTimerStatusInFirestore({
          currentPerformingSide: 'merah',
          matchStatus: 'Pending',
          timerSeconds: roundDuration,
          isTimerRunning: false,
          performanceDuration: roundDuration,
        });
      } 
      // Case 2: Merah just finished (or single performer finished), advance to next schedule
      else if ((tgrTimerStatus.currentPerformingSide === 'merah' && tgrTimerStatus.matchStatus === 'Finished') || 
               (!scheduleDetails.pesilatBiruName && tgrTimerStatus.matchStatus === 'Finished')) {
        // Mark current schedule as fully done
        await updateTimerStatusInFirestore({ matchStatus: 'Finished', currentPerformingSide: null, isTimerRunning: false });

        const schedulesRef = collection(db, SCHEDULE_TGR_COLLECTION);
        const q = query(
          schedulesRef,
          where('lotNumber', '>', scheduleDetails.lotNumber),
          orderBy('lotNumber', 'asc'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          alert("Ini adalah peserta TGR terakhir. Tidak ada peserta berikutnya.");
        } else {
          const nextMatchDoc = querySnapshot.docs[0];
          await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: nextMatchDoc.id });
          // State will reset via useEffect watching activeMatchId
        }
      } else {
        alert("Pastikan timer untuk sisi saat ini telah selesai (status 'Finished') sebelum melanjutkan.");
      }
    } catch (err) {
      console.error("Error advancing TGR state/participant:", err);
      setError("Gagal memproses kelanjutan.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getButtonDisabledState = () => isLoading || isSubmitting || !activeMatchId || !matchDetailsLoaded;
  
  const getStartPauseButtonText = () => tgrTimerStatus.isTimerRunning ? "Jeda Timer" : "Mulai Timer";
  const getStartPauseButtonIcon = () => tgrTimerStatus.isTimerRunning ? <PauseIcon className="mr-2 h-5 w-5"/> : <Play className="mr-2 h-5 w-5"/>;
  const getStartPauseButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'merah') return true; // Merah done, overall done for this schedule
    if (tgrTimerStatus.matchStatus === 'Finished' && !scheduleDetails?.pesilatBiruName) return true; // Single performer done
    if (tgrTimerStatus.timerSeconds === 0 && !tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus !== 'Pending') return true; // Timer at 0, not running, not pending reset
    return false;
  };


  const getAdvanceButtonText = () => {
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) {
      return "Lanjut ke Sudut Merah";
    }
    return "Lanjut Peserta Berikutnya";
  };
  const getAdvanceButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.matchStatus !== 'Finished') return true; // Can only advance if current side/phase is finished
    if (tgrTimerStatus.isTimerRunning) return true;
    return false;
  };
  
  const displayPerformingSide = () => {
    if (!scheduleDetails) return "";
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruName) {
        return `Sudut Biru: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent})`;
    }
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahName) {
        return `Sudut Merah: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent})`;
    }
    // Fallback if only one name is available or side is not determined yet for a single performer
    if (scheduleDetails.pesilatMerahName) return `Peserta: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent})`;
    if (scheduleDetails.pesilatBiruName) return `Peserta: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent})`;
    return "Peserta";
  };


  if (isLoading && configMatchId === undefined) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Konfigurasi Timer TGR...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="mb-6 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Kontrol Timer TGR</h1>
            {scheduleDetails && matchDetailsLoaded ? (
                <p className="text-md text-muted-foreground">
                    Partai {scheduleDetails.lotNumber}: {displayPerformingSide()} ({scheduleDetails.category}) - {scheduleDetails.round}
                </p>
            ) : activeMatchId ? (
                <Skeleton className="h-6 w-3/4 mx-auto mt-2" />
            ): (
                <p className="text-md text-muted-foreground">Tidak ada jadwal TGR aktif.</p>
            )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="max-w-lg mx-auto shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-6xl md:text-8xl font-mono text-primary">
              {isLoading && !matchDetailsLoaded && activeMatchId ? <Skeleton className="h-20 w-52 mx-auto" /> : formatTime(tgrTimerStatus.timerSeconds)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Status: {tgrTimerStatus.matchStatus}
              {tgrTimerStatus.isTimerRunning && " (Berjalan)"}
              {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.timerSeconds > 0 && tgrTimerStatus.matchStatus === 'Paused' && " (Jeda)"}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName && " (Sudut Biru Selesai)"}
              {tgrTimerStatus.matchStatus === 'Finished' && (tgrTimerStatus.currentPerformingSide === 'merah' || !scheduleDetails?.pesilatBiruName) && " (Penampilan Selesai)"}

            </p>
             <p className="text-xs text-muted-foreground">
              Durasi Penampilan per Sisi: {formatTime(tgrTimerStatus.performanceDuration)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 md:p-6">
            <Button 
              onClick={handleStartPauseTimer} 
              className={cn(
                "w-full py-3 text-lg",
                tgrTimerStatus.isTimerRunning ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-500 hover:bg-green-600 text-white"
              )}
              disabled={getStartPauseButtonDisabled()}
            >
              {isSubmitting && tgrTimerStatus.isTimerRunning !== undefined /* check if submitting for this action */ ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : getStartPauseButtonIcon()}
              {getStartPauseButtonText()}
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={getButtonDisabledState() || tgrTimerStatus.isTimerRunning}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' /* check if submitting for this action */ ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer
            </Button>
            <Button onClick={handleAdvanceStateOrParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceButtonDisabled()}>
              {isSubmitting && (tgrTimerStatus.matchStatus === 'Finished' || tgrTimerStatus.currentPerformingSide === 'biru') /* check if submitting for this action */ ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
              {getAdvanceButtonText()}
            </Button>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button variant="link" asChild>
            <Link href="/scoring/tgr/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login TGR</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
