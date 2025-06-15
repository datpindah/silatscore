
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

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';

const getPerformanceDurationForRound = (roundName: string | undefined): number => {
  const round = roundName?.toLowerCase() || '';
  if (round.includes('penyisihan') || round.includes('perempat final')) return 80; // 1 min 20 sec
  if (round.includes('semi final')) return 100; // 1 min 40 sec
  if (round.includes('final')) return 180; // 3 min
  return 180; // Default if round name is not recognized or undefined
};

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, // Will be adjusted by schedule
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180, // Will be adjusted
};

export default function TGRTimerControlPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch active TGR schedule ID from app_settings
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

  // Update activeMatchId and reset states if configMatchId changes
  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setTgrTimerStatus(initialTgrTimerStatus);
      setMatchDetailsLoaded(false);
      setError(null);
      setActiveMatchId(configMatchId);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);

  // Fetch schedule details and listen to/initialize timer status in Firestore
  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading) setIsLoading(false);
      setScheduleDetails(null);
      setTgrTimerStatus(initialTgrTimerStatus);
      setMatchDetailsLoaded(false);
      return;
    }

    let mounted = true;
    if(!matchDetailsLoaded) setIsLoading(true);

    const loadScheduleAndTimer = async () => {
      if (!mounted) return;
      try {
        // Load Schedule Details
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

        // Listen to/Initialize Timer Status in Firestore
        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
        const unsubTimer = onSnapshot(matchDataDocRef, async (matchDocSnap) => {
          if (!mounted) return;
          const roundDuration = getPerformanceDurationForRound(currentSchedule?.round);
          if (matchDocSnap.exists()) {
            const data = matchDocSnap.data();
            if (data?.timerStatus) {
              const fsTimerStatus = data.timerStatus as TGRTimerStatus;
              // Ensure performanceDuration is correctly set based on round if pending
              if (fsTimerStatus.matchStatus === 'Pending' && (fsTimerStatus.performanceDuration !== roundDuration || fsTimerStatus.timerSeconds !== roundDuration)) {
                 setTgrTimerStatus({ 
                    ...fsTimerStatus, 
                    performanceDuration: roundDuration,
                    timerSeconds: roundDuration 
                });
              } else {
                setTgrTimerStatus(fsTimerStatus);
              }
            } else { // Timer status field doesn't exist, initialize it
              const newStatus: TGRTimerStatus = {
                timerSeconds: roundDuration,
                isTimerRunning: false,
                matchStatus: 'Pending',
                performanceDuration: roundDuration,
              };
              setTgrTimerStatus(newStatus);
              await setDoc(matchDataDocRef, { timerStatus: newStatus }, { merge: true });
            }
          } else { // Match document doesn't exist, create it with initial timer status
            const newStatus: TGRTimerStatus = {
              timerSeconds: roundDuration,
              isTimerRunning: false,
              matchStatus: 'Pending',
              performanceDuration: roundDuration,
            };
            setTgrTimerStatus(newStatus);
            await setDoc(matchDataDocRef, { timerStatus: newStatus });
          }
        }, (err) => {
          if(mounted) console.error("Error fetching TGR match document (timer):", err);
          // Fallback to default if error
          if(mounted) setTgrTimerStatus({
            timerSeconds: getPerformanceDurationForRound(currentSchedule?.round),
            isTimerRunning: false,
            matchStatus: 'Pending',
            performanceDuration: getPerformanceDurationForRound(currentSchedule?.round),
          });
        });
        return unsubTimer; // Return for cleanup
      } catch (err) {
        if (mounted) {
          console.error("Error loading schedule and timer:", err);
          setError("Gagal memuat data pertandingan TGR.");
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      } finally {
        if (mounted && matchDetailsLoaded) setIsLoading(false);
      }
    };

    const unsubTimerListenerPromise = loadScheduleAndTimer();
    
    return () => {
      mounted = false;
      unsubTimerListenerPromise.then(unsub => { if (unsub) unsub(); });
    };
  }, [activeMatchId, matchDetailsLoaded]);


  // Timer countdown logic
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
            // Sync local state if dewan stopped timer elsewhere
            if (currentDBDoc.exists()) setTgrTimerStatus(currentDBDoc.data()?.timerStatus as TGRTimerStatus || initialTgrTimerStatus);
            return;
          }

          const currentDBTimerStatus = currentDBDoc.data()?.timerStatus as TGRTimerStatus;
          const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
          let newMatchStatus = currentDBTimerStatus.matchStatus;
          let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

          if (newSeconds === 0) {
            newIsTimerRunning = false;
            newMatchStatus = 'Finished';
          }
          
          const updatedStatus: Partial<TGRTimerStatus> = { 
            timerSeconds: newSeconds, 
            isTimerRunning: newIsTimerRunning,
            matchStatus: newMatchStatus,
          };
          await updateDoc(matchDataDocRef, { timerStatus: {...currentDBTimerStatus, ...updatedStatus} });
          // Local state will be updated by Firestore listener
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
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timerStatus 
                                   ? docSnap.data()?.timerStatus as TGRTimerStatus 
                                   : { // Sensible defaults if doc doesn't exist or has no timerStatus
                                       timerSeconds: getPerformanceDurationForRound(scheduleDetails.round),
                                       isTimerRunning: false,
                                       matchStatus: 'Pending',
                                       performanceDuration: getPerformanceDurationForRound(scheduleDetails.round),
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
    if (!activeMatchId || !scheduleDetails || tgrTimerStatus.matchStatus === 'Finished') return;

    if (tgrTimerStatus.isTimerRunning) { // Pause
      updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: 'Paused' });
    } else { // Start
      if (tgrTimerStatus.timerSeconds > 0) {
        updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: 'Ongoing' });
      } else {
        alert("Timer sudah 0, tidak bisa dimulai. Reset dulu.");
      }
    }
  };

  const handleResetTimer = () => {
    if (!activeMatchId || !scheduleDetails) return;
    const roundDuration = getPerformanceDurationForRound(scheduleDetails.round);
    updateTimerStatusInFirestore({
      timerSeconds: roundDuration,
      isTimerRunning: false,
      matchStatus: 'Pending',
      performanceDuration: roundDuration,
    });
  };

  const handleNextParticipant = async () => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);
    try {
      // 1. Mark current match timer as 'Finished'
      await updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: 'Finished' });

      // 2. Fetch next schedule
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
        // Optionally, clear the active_match_tgr setting
        // await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: null });
      } else {
        const nextMatchDoc = querySnapshot.docs[0];
        await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: nextMatchDoc.id });
        // The page will react to the change in activeMatchId,
        // and the useEffect for loading schedule/timer will initialize timer for the new match.
      }
    } catch (err) {
      console.error("Error navigating to next TGR participant:", err);
      setError("Gagal berpindah ke peserta berikutnya.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const buttonDisabled = isLoading || isSubmitting || !activeMatchId || !matchDetailsLoaded;

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
                    Partai {scheduleDetails.lotNumber}: {scheduleDetails.pesilatMerahName} ({scheduleDetails.category}) - {scheduleDetails.round}
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
              {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.timerSeconds > 0 && tgrTimerStatus.matchStatus !== 'Pending' && " (Jeda)"}
            </p>
             <p className="text-xs text-muted-foreground">
              Durasi Penampilan: {formatTime(tgrTimerStatus.performanceDuration)}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 md:p-6">
            <Button 
              onClick={handleStartPauseTimer} 
              className={cn(
                "w-full py-3 text-lg",
                tgrTimerStatus.isTimerRunning ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-500 hover:bg-green-600 text-white"
              )}
              disabled={buttonDisabled || tgrTimerStatus.matchStatus === 'Finished' || (tgrTimerStatus.timerSeconds === 0 && !tgrTimerStatus.isTimerRunning) }
            >
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : (tgrTimerStatus.isTimerRunning ? <PauseIcon className="mr-2 h-5 w-5"/> : <Play className="mr-2 h-5 w-5"/>)}
              {tgrTimerStatus.isTimerRunning ? "Jeda Timer" : "Mulai Timer"}
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={buttonDisabled || tgrTimerStatus.isTimerRunning}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer
            </Button>
            <Button onClick={handleNextParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={buttonDisabled}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Finished' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
              Lanjut Peserta Berikutnya
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
