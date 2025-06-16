
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Play, RotateCcw, ChevronsRight, Loader2, PauseIcon, Info, StopCircle } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, where, getDocs, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';

const initialGlobalTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  currentPerformingSide: null,
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
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
      setConfigMatchId(null); // Explicitly set to null on error
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { 
      setIsLoading(true); 
      return; 
    }
    if (configMatchId !== activeMatchId) {
      // Reset states when activeMatchId changes
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      setTgrTimerStatus(initialGlobalTgrTimerStatus); // Reset timer state too
      setError(null);
      setActiveMatchId(configMatchId);
      if (configMatchId) {
        setIsLoading(true); // Start loading for new activeMatchId
      } else {
        setIsLoading(false); // No active match, stop loading
      }
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      // Handles the case where initially there's no active match
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);


  // Effect 1: Load Schedule Details
  useEffect(() => {
    if (!activeMatchId) {
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      // isLoading is managed by the combined logic, don't set to false here alone
      return;
    }

    let mounted = true;
    const loadSchedule = async () => {
      if (!mounted) return;
      // setIsLoading(true); // Loading state is now more comprehensive

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(data);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR ID ${activeMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      } catch (err) {
        if (mounted) setError("Gagal memuat detail jadwal TGR.");
        setScheduleDetails(null);
        setMatchDetailsLoaded(false);
      }
      // Do not set isLoading to false here; wait for timer status sync
    };

    loadSchedule();
    return () => { mounted = false; };
  }, [activeMatchId]);

  // Effect 2: Initialize and Listen to Timer Status from Firestore
  useEffect(() => {
    if (!activeMatchId || !matchDetailsLoaded || !scheduleDetails) {
      // If no active match or details not loaded yet, ensure loading state is false if it should be.
      if (!activeMatchId && isLoading) setIsLoading(false);
      return;
    }

    let mounted = true;
    let unsubTimer: (() => void) | null = null;

    const initializeAndListenToTimer = async () => {
      if (!mounted) return;
      // If we are here, activeMatchId & scheduleDetails are available.

      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      
      let initialSideForThisSchedule: 'biru' | 'merah' | null = null;
      if (scheduleDetails.pesilatBiruName) {
        initialSideForThisSchedule = 'biru';
      } else if (scheduleDetails.pesilatMerahName) {
        initialSideForThisSchedule = 'merah';
      }

      try {
        const matchDocSnap = await getDoc(matchDataDocRef); // One-time read for initialization check
        if (!mounted) return;

        let needsFirestoreWrite = false;
        let statusToInitializeWith: TGRTimerStatus;

        if (!matchDocSnap.exists()) {
          statusToInitializeWith = {
            ...initialGlobalTgrTimerStatus,
            currentPerformingSide: initialSideForThisSchedule,
            timerSeconds: 0,
            matchStatus: 'Pending',
          };
          needsFirestoreWrite = true;
        } else {
          const existingTimerStatus = matchDocSnap.data()?.timerStatus as TGRTimerStatus | undefined;
          statusToInitializeWith = existingTimerStatus ? { ...initialGlobalTgrTimerStatus, ...existingTimerStatus } : { ...initialGlobalTgrTimerStatus };

          if (initialSideForThisSchedule !== null && 
              (statusToInitializeWith.currentPerformingSide === undefined || statusToInitializeWith.currentPerformingSide === null) &&
              !(statusToInitializeWith.matchStatus === 'Finished' && statusToInitializeWith.currentPerformingSide === null) 
             ) {
            // Side needs initialization or correction if match is not fully finished and current side isn't set
            statusToInitializeWith.currentPerformingSide = initialSideForThisSchedule;
            statusToInitializeWith.timerSeconds = 0;
            statusToInitializeWith.matchStatus = 'Pending';
            // Reset performance durations specifically for a new match setup or side switch if not fully done
            if (statusToInitializeWith.currentPerformingSide === 'biru') statusToInitializeWith.performanceDurationBiru = 0;
            if (statusToInitializeWith.currentPerformingSide === 'merah') statusToInitializeWith.performanceDurationMerah = 0;
            needsFirestoreWrite = true;
          }
        }
        
        // Set local state first, then write to Firestore if needed.
        // This avoids potential immediate re-trigger if onSnapshot is fast.
        // However, the snapshot listener will ultimately be the source of truth for local state.
        // setTgrTimerStatus(statusToInitializeWith); // Optional: set local state directly if not waiting for snapshot after write.

        if (needsFirestoreWrite) {
          await setDoc(matchDataDocRef, { timerStatus: statusToInitializeWith }, { merge: true });
        }
      } catch (e) {
        if (mounted) console.error("Error during TGR timer initialization:", e);
      }

      // Setup the snapshot listener
      unsubTimer = onSnapshot(matchDataDocRef, (snap) => {
        if (!mounted) return;
        if (snap.exists() && snap.data()?.timerStatus) {
          setTgrTimerStatus(snap.data()?.timerStatus as TGRTimerStatus);
        } else {
          // Fallback if doc disappears or timerStatus field is missing after init
          let fallbackSide: 'biru' | 'merah' | null = null;
          if (scheduleDetails?.pesilatBiruName) fallbackSide = 'biru';
          else if (scheduleDetails?.pesilatMerahName) fallbackSide = 'merah';
          
          setTgrTimerStatus(prev => ({
            ...initialGlobalTgrTimerStatus, 
            currentPerformingSide: fallbackSide, 
            matchStatus: fallbackSide ? 'Pending' : 'MatchFinished' 
          }));
        }
        if (isLoading) setIsLoading(false); // Stop loading once listener is active & data received
      }, (err) => {
        if (mounted) {
          console.error("Error listening to TGR timer status:", err);
          setError("Gagal sinkronisasi status timer TGR.");
          if(isLoading) setIsLoading(false);
        }
      });
    };

    initializeAndListenToTimer();

    return () => {
      mounted = false;
      if (unsubTimer) unsubTimer();
    };
  }, [activeMatchId, matchDetailsLoaded, scheduleDetails, isLoading]); //isLoading was removed to avoid re-triggering effect 2 on its own change. It's an output now.


  // Effect for stopwatch interval
  useEffect(() => {
    if (tgrTimerStatus.isTimerRunning && activeMatchId) {
      timerIntervalRef.current = setInterval(async () => {
        // No need to check mounted here, as clearInterval will handle it
        if (!activeMatchId) { // Defensive check
          if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return;
        }
        try {
          const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
          const currentDBDoc = await getDoc(matchDataDocRef);

          if (!currentDBDoc.exists()) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false, matchStatus: 'Pending' })); // Or error
            return;
          }
          
          const currentDBTimerStatus = currentDBDoc.data()?.timerStatus as TGRTimerStatus | undefined;

          if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            // Sync local state with DB if it was paused/stopped externally
            if (currentDBTimerStatus) setTgrTimerStatus(currentDBTimerStatus);
            else setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
            return;
          }

          const newSeconds = currentDBTimerStatus.timerSeconds + 1;
          // Directly update Firestore. Local state will sync via onSnapshot.
          await updateDoc(matchDataDocRef, { "timerStatus.timerSeconds": newSeconds });

        } catch (e) {
          console.error("Error updating timer in interval (TGR):", e);
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
  }, [tgrTimerStatus.isTimerRunning, activeMatchId]);

  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TGRTimerStatus>) => {
    if (!activeMatchId || !scheduleDetails) {
      console.warn("Update Firestore aborted: No activeMatchId or scheduleDetails");
      return;
    }
    setIsSubmitting(true);
    try {
      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      const docSnap = await getDoc(matchDataDocRef);
      
      let currentDBTimerStatus = initialGlobalTgrTimerStatus;
      if (docSnap.exists() && docSnap.data()?.timerStatus) {
        currentDBTimerStatus = docSnap.data()?.timerStatus as TGRTimerStatus;
      } else {
        // Fallback initialization if doc exists but timerStatus is missing
        if (scheduleDetails.pesilatBiruName) currentDBTimerStatus.currentPerformingSide = 'biru';
        else if (scheduleDetails.pesilatMerahName) currentDBTimerStatus.currentPerformingSide = 'merah';
      }

      const newFullStatus: TGRTimerStatus = {
        ...currentDBTimerStatus,
        ...newStatusUpdates,
      };
      await setDoc(matchDataDocRef, { timerStatus: newFullStatus }, { merge: true });
      // Local state `tgrTimerStatus` will be updated by the onSnapshot listener.
    } catch (e) {
      console.error("Error updating TGR timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeMatchId, scheduleDetails]);

  const handleStartPauseTimer = () => {
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide) return;

    // Cannot start/pause if the current side's performance is marked as 'Finished' by Stop button
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide) {
        alert(`Penampilan untuk ${tgrTimerStatus.currentPerformingSide === 'biru' ? 'Sudut Biru' : 'Sudut Merah'} telah Selesai. Gunakan tombol lanjut atau reset.`);
        return;
    }
    // Cannot start/pause if the overall match is 'Finished' (currentPerformingSide is null)
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) {
        alert("Partai TGR ini telah Selesai. Gunakan tombol lanjut ke partai berikutnya.");
        return;
    }

    if (tgrTimerStatus.isTimerRunning) {
      updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: 'Paused' });
    } else {
      updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: 'Ongoing' });
    }
  };

  const handleStopTimer = () => {
    if (!activeMatchId || !tgrTimerStatus.currentPerformingSide || !tgrTimerStatus.isTimerRunning) return;
    
    const updates: Partial<TGRTimerStatus> = {
      isTimerRunning: false,
      matchStatus: 'Finished', // Mark this side's performance as finished
    };
    // Record the actual performance duration for the side that just finished
    if (tgrTimerStatus.currentPerformingSide === 'biru') {
      updates.performanceDurationBiru = tgrTimerStatus.timerSeconds;
    } else if (tgrTimerStatus.currentPerformingSide === 'merah') {
      updates.performanceDurationMerah = tgrTimerStatus.timerSeconds;
    }
    updateTimerStatusInFirestore(updates);
  };

  const handleResetTimer = () => {
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide) return;
    if (tgrTimerStatus.isTimerRunning) {
        alert("Jeda timer terlebih dahulu sebelum mereset.");
        return;
    }
    const updates: Partial<TGRTimerStatus> = {
      timerSeconds: 0,
      isTimerRunning: false,
      matchStatus: 'Pending', // Reset status to Pending for this side
    };
    // Clear the recorded performance duration for the side being reset
    if (tgrTimerStatus.currentPerformingSide === 'biru') {
      updates.performanceDurationBiru = 0;
    } else if (tgrTimerStatus.currentPerformingSide === 'merah') {
      updates.performanceDurationMerah = 0;
    }
    updateTimerStatusInFirestore(updates);
  };

  const handleAdvanceStateOrParticipant = async () => {
    if (!activeMatchId || !scheduleDetails) return;
    if (tgrTimerStatus.isTimerRunning) {
        alert("Harap hentikan atau jeda timer saat ini sebelum melanjutkan.");
        return;
    }
    setIsSubmitting(true);

    try {
      // Case 1: Current side was Biru, and Merah exists. Transition to Merah.
      if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatMerahName) {
        await updateTimerStatusInFirestore({
          currentPerformingSide: 'merah',
          matchStatus: 'Pending',
          timerSeconds: 0,
          isTimerRunning: false,
          performanceDurationMerah: 0, // Reset duration for Merah's upcoming performance
        });
      } else {
        // Case 2: Current side was Merah, OR it was a single participant (Biru or Merah), OR Biru was last and no Merah.
        // This means the current *match schedule item* is considered fully finished.
        await updateTimerStatusInFirestore({
            matchStatus: 'Finished', // Mark this whole schedule item as finished
            currentPerformingSide: null, // No side is actively performing for *this* schedule item
            isTimerRunning: false,
        });

        // Now, find the *next* TGR schedule.
        const schedulesRef = collection(db, SCHEDULE_TGR_COLLECTION);
        const q = query(
          schedulesRef,
          where('lotNumber', '>', scheduleDetails.lotNumber), // Find next lot number
          orderBy('lotNumber', 'asc'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          alert("Ini adalah partai TGR terakhir. Tidak ada partai berikutnya.");
          // Optionally, clear the active TGR schedule setting in app_settings
          // await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: null });
        } else {
          const nextMatchDoc = querySnapshot.docs[0];
          await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: nextMatchDoc.id });
          // The page will automatically reload and re-initialize for the new activeMatchId
          // due to the onSnapshot listener for ACTIVE_TGR_SCHEDULE_CONFIG_PATH.
        }
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
    if (!tgrTimerStatus.currentPerformingSide) return true; // No side selected yet
    // If the current side's performance is finished, cannot start/pause
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide) return true;
    // If the overall match is finished (no current side and status is finished)
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true;
    return false;
  };
  
  const getStopButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (!tgrTimerStatus.isTimerRunning) return true; // Can only stop if running
    return false;
  };

  const getResetButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.isTimerRunning) return true; // Cannot reset if running
    if (!tgrTimerStatus.currentPerformingSide) return true; // No side to reset for
    // If the overall match is finished (no current side and status is finished)
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true;
    return false;
  };

  const getAdvanceButtonText = () => {
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) {
      return "Lanjut ke Sudut Merah";
    }
    // This will be shown if current is Merah, or if current is Biru and no Merah exists, or if match is fully finished
    return "Lanjut Partai Berikutnya";
  };

  const getAdvanceButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.isTimerRunning) return true; // Timer must be stopped/paused
    
    // To advance, the current side's performance must be 'Finished' *OR* the overall match must be 'Finished'
    if (tgrTimerStatus.matchStatus !== 'Finished') return true;

    // If current side is Biru and Merah exists, can advance to Merah if Biru is 'Finished'
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) return false;
    
    // If current side is Merah, can advance to next participant if Merah is 'Finished'
    if (tgrTimerStatus.currentPerformingSide === 'merah') return false;
    
    // If current side is Biru, and NO Merah exists (single performer was Biru), can advance if Biru is 'Finished'
    if (tgrTimerStatus.currentPerformingSide === 'biru' && !scheduleDetails?.pesilatMerahName) return false;

    // If overall match is finished (currentPerformingSide is null, and matchStatus is 'Finished'), button should allow advancing to *next schedule*
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return false;

    return true; // Otherwise, disabled
  };

  const displayPerformingSideInfo = () => {
    if (!scheduleDetails) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
        return isLoading ? "Memuat info..." : "Data Jadwal Tidak Ditemukan";
    }
    if (!tgrTimerStatus.currentPerformingSide) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
        // Determine initial side if not set yet by timer logic
        if (scheduleDetails.pesilatBiruName) return `Menunggu Sudut Biru...`;
        if (scheduleDetails.pesilatMerahName) return `Menunggu Sudut Merah/Peserta...`;
        return "Menunggu info peserta...";
    }

    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruName) {
        return `Sudut Biru: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || 'N/A'})`;
    }
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahName) {
        return `Sudut Merah: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    }
    // Handle single participant case (where they might be listed as Merah by default)
    if (scheduleDetails.pesilatMerahName && !scheduleDetails.pesilatBiruName && tgrTimerStatus.currentPerformingSide === 'merah') {
        return `Peserta: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    }
    if (scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName && tgrTimerStatus.currentPerformingSide === 'biru') {
        return `Peserta: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || 'N/A'})`;
    }
    return "Konfigurasi peserta tidak jelas.";
  };
  
  const recordedDurationForSide = (side: 'biru' | 'merah'): string | null => {
    if (side === 'biru' && tgrTimerStatus.performanceDurationBiru && tgrTimerStatus.performanceDurationBiru > 0) {
        return formatTime(tgrTimerStatus.performanceDurationBiru);
    }
    if (side === 'merah' && tgrTimerStatus.performanceDurationMerah && tgrTimerStatus.performanceDurationMerah > 0) {
        return formatTime(tgrTimerStatus.performanceDurationMerah);
    }
    return null;
  }

  if (isLoading && configMatchId === undefined && !activeMatchId) {
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
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Kontrol Stopwatch TGR</h1>
            {scheduleDetails && matchDetailsLoaded ? (
                <p className="text-md text-muted-foreground">
                    Partai {scheduleDetails.lotNumber}: {displayPerformingSideInfo()} ({scheduleDetails.category}) - {scheduleDetails.round}
                </p>
            ) : activeMatchId ? ( // activeMatchId is set, but details might still be loading
                <Skeleton className="h-6 w-3/4 mx-auto mt-2 bg-muted" />
            ): (
                <p className="text-md text-muted-foreground">Tidak ada jadwal TGR aktif.</p>
            )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 max-w-lg mx-auto">
            <Info className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="max-w-lg mx-auto shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-6xl md:text-8xl font-mono text-primary">
              {isLoading && !matchDetailsLoaded && activeMatchId ? <Skeleton className="h-20 w-52 mx-auto bg-muted" /> : formatTime(tgrTimerStatus.timerSeconds)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Status: {tgrTimerStatus.matchStatus}
              {tgrTimerStatus.isTimerRunning && " (Berjalan)"}
              {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Paused' && " (Jeda)"}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide && ` (${tgrTimerStatus.currentPerformingSide === 'biru' ? "Sudut Biru" : "Sudut Merah"} Selesai)`}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null && " (Partai Selesai)"}
            </p>
            {/* Display recorded times */}
            {scheduleDetails?.pesilatBiruName && recordedDurationForSide('biru') && (
                <p className={cn("text-xs", tgrTimerStatus.currentPerformingSide === 'biru' && tgrTimerStatus.matchStatus === 'Finished' ? "text-green-600 font-semibold" : "text-gray-500")}>
                    Waktu Tercatat Biru: {recordedDurationForSide('biru')}
                </p>
            )}
            {scheduleDetails?.pesilatMerahName && recordedDurationForSide('merah') && (
                 <p className={cn("text-xs", tgrTimerStatus.currentPerformingSide === 'merah' && tgrTimerStatus.matchStatus === 'Finished' ? "text-green-600 font-semibold" : "text-gray-500")}>
                    Waktu Tercatat Merah: {recordedDurationForSide('merah')}
                </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3 p-4 md:p-6">
            <Button
              onClick={handleStartPauseTimer}
              className={cn(
                "w-full py-3 text-lg",
                tgrTimerStatus.isTimerRunning ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-500 hover:bg-green-600 text-white"
              )}
              disabled={getStartPauseButtonDisabled()}
              aria-live="polite"
            >
              {isSubmitting && tgrTimerStatus.isTimerRunning !== undefined ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : getStartPauseButtonIcon()}
              {getStartPauseButtonText()}
            </Button>
            <Button
              onClick={handleStopTimer}
              variant="destructive"
              className="w-full py-3 text-lg"
              disabled={getStopButtonDisabled()}
            >
              {isSubmitting && !tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <StopCircle className="mr-2 h-5 w-5"/>}
              Stop & Catat Waktu
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={getResetButtonDisabled()}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' && tgrTimerStatus.currentPerformingSide && tgrTimerStatus.timerSeconds === 0 ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer ({tgrTimerStatus.currentPerformingSide ? (tgrTimerStatus.currentPerformingSide === 'biru' ? 'Biru' : 'Merah') : 'N/A'})
            </Button>
            <Button onClick={handleAdvanceStateOrParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceButtonDisabled()}>
              {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
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

