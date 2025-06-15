
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
  if (round.includes('penyisihan') || round.includes('perempat final')) return 80;
  if (round.includes('semi final')) return 100;
  if (round.includes('final')) return 180;
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

    let unsubSchedule: (() => void) | null = null;
    let unsubTimer: (() => void) | null = null;

    const loadScheduleDetails = async () => {
      if (!mounted || !activeMatchId) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(data); // This will trigger the timer listener effect if scheduleDetails is a dep
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR ID ${activeMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          if (mounted) setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error("Error loading schedule details:", err);
          setError("Gagal memuat detail jadwal TGR.");
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          setIsLoading(false);
        }
      }
    };

    loadScheduleDetails();
    
    // This effect will now re-run if scheduleDetails changes, ensuring roundDuration is up-to-date
    // for the onSnapshot logic.
    if (scheduleDetails && activeMatchId) {
        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
        unsubTimer = onSnapshot(matchDataDocRef, async (matchDocSnap) => {
            if (!mounted) return;

            const roundDuration = getPerformanceDurationForRound(scheduleDetails?.round);
            let initialSide: 'biru' | 'merah' | null = null;
            if (scheduleDetails?.pesilatBiruName && scheduleDetails?.pesilatMerahName) {
                initialSide = 'biru';
            } else if (scheduleDetails?.pesilatMerahName || scheduleDetails?.pesilatBiruName) {
                initialSide = 'merah';
            }

            let newStatusToSet: TGRTimerStatus;
            let firestoreNeedsUpdate = false;
            let statusForFirestore: TGRTimerStatus | null = null;

            if (matchDocSnap.exists()) {
                const data = matchDocSnap.data();
                const fsTimerStatus = data?.timerStatus as TGRTimerStatus | undefined;

                if (fsTimerStatus) {
                    newStatusToSet = { ...fsTimerStatus }; // Start with what's in Firestore

                    // Correction logic
                    if (newStatusToSet.currentPerformingSide === undefined || newStatusToSet.currentPerformingSide === null && initialSide !== null && newStatusToSet.matchStatus !== 'Finished') {
                        newStatusToSet.currentPerformingSide = initialSide;
                        firestoreNeedsUpdate = true;
                    }
                    if (newStatusToSet.performanceDuration !== roundDuration) {
                        newStatusToSet.performanceDuration = roundDuration;
                        firestoreNeedsUpdate = true;
                    }
                    if ((newStatusToSet.matchStatus === 'Pending' || newStatusToSet.timerSeconds === 0 && newStatusToSet.matchStatus !== 'Finished') && newStatusToSet.timerSeconds !== roundDuration) {
                        newStatusToSet.timerSeconds = roundDuration;
                        firestoreNeedsUpdate = true;
                    }
                     // If overall match was finished (currentPerformingSide is null), but a new schedule (activeMatchId) has loaded,
                    // we need to re-initialize for the new schedule's first performer.
                    if (fsTimerStatus.matchStatus === 'Finished' && fsTimerStatus.currentPerformingSide === null) {
                         newStatusToSet = {
                            timerSeconds: roundDuration,
                            isTimerRunning: false,
                            matchStatus: 'Pending',
                            performanceDuration: roundDuration,
                            currentPerformingSide: initialSide,
                        };
                        firestoreNeedsUpdate = true;
                    }

                } else { // timerStatus field missing
                    newStatusToSet = {
                        timerSeconds: roundDuration,
                        isTimerRunning: false,
                        matchStatus: 'Pending',
                        performanceDuration: roundDuration,
                        currentPerformingSide: initialSide,
                    };
                    firestoreNeedsUpdate = true;
                }
            } else { // Match document doesn't exist
                newStatusToSet = {
                    timerSeconds: roundDuration,
                    isTimerRunning: false,
                    matchStatus: 'Pending',
                    performanceDuration: roundDuration,
                    currentPerformingSide: initialSide,
                };
                firestoreNeedsUpdate = true;
            }
            
            // Only update local state if it's different, to prevent unnecessary re-renders
            setTgrTimerStatus(prevStatus => {
                if (JSON.stringify(prevStatus) !== JSON.stringify(newStatusToSet)) {
                    return newStatusToSet;
                }
                return prevStatus;
            });

            if (firestoreNeedsUpdate) {
                statusForFirestore = { ...newStatusToSet }; // Use a fresh copy for Firestore
                // Avoid writing if the current Firestore state (if read again) would be identical
                // This check is a bit complex here, so we rely on the conditions above being mostly for initialization
                try {
                    await setDoc(matchDataDocRef, { timerStatus: statusForFirestore }, { merge: true });
                } catch (e) {
                    console.error("Error writing initial/corrected timer status to Firestore:", e);
                }
            }
        });
    }


    return () => {
      mounted = false;
      if (unsubSchedule) unsubSchedule();
      if (unsubTimer) unsubTimer();
    };
  }, [activeMatchId, scheduleDetails]); // Added scheduleDetails here


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
        // This interval should only decrement based on local state,
        // and then push the update. The onSnapshot will handle reflecting it.
        // However, for more robust sync, it's often better to read from FS then write.
        // For this interval, we'll try a slightly different approach:
        // Optimistically update local, then sync. Or, make Dewan 1 authoritative for timer ticks.
        // Given Dewan 1 is authoritative, this interval mainly updates Firestore.
        try {
          const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
          // It's critical to get the LATEST status from Firestore before decrementing
          const currentDBDoc = await getDoc(matchDataDocRef);
          
          if (!currentDBDoc.exists() || !(currentDBDoc.data()?.timerStatus as TGRTimerStatus)?.isTimerRunning) {
            // If Firestore says timer isn't running (e.g., paused by another action, or match reset), stop this interval.
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            // Sync local state if needed
            if (currentDBDoc.exists() && currentDBDoc.data()?.timerStatus) {
                 setTgrTimerStatus(currentDBDoc.data()?.timerStatus as TGRTimerStatus);
            } else {
                 // Fallback or reset if doc is gone
                 setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
            }
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
          
          const updatedStatusForFirestore: Partial<TGRTimerStatus> = { 
            timerSeconds: newSeconds, 
            isTimerRunning: newIsTimerRunning,
            matchStatus: newMatchStatus,
            // currentPerformingSide and performanceDuration should not change here
          };
          // Merge with the full currentDBTimerStatus to avoid accidentally removing fields
          await updateDoc(matchDataDocRef, { timerStatus: {...currentDBTimerStatus, ...updatedStatusForFirestore } });
          // Local state will be updated by the onSnapshot listener.
        } catch (e) {
          console.error("Error updating timer in interval:", e);
          if(timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Attempt to stop local timer
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
                                   : { // Sensible default if doc or field is missing
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
      // Local state `tgrTimerStatus` will be updated by the onSnapshot listener.
    } catch (e) {
      console.error("Error updating TGR timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    } finally {
      setIsSubmitting(false);
    }
  }, [activeMatchId, scheduleDetails]);

  const handleStartPauseTimer = () => {
    if (!activeMatchId || !scheduleDetails) return;
    // Prevent action if current side is finished and there's another side, or if overall match is finished.
    if (tgrTimerStatus.matchStatus === 'Finished' && 
        ( (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatMerahName) || 
          (tgrTimerStatus.currentPerformingSide === 'merah' && !scheduleDetails.pesilatBiruName) || // Single performer is done
          (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatBiruName) // Both done
        )
       ) {
        alert("Penampilan untuk sisi ini atau keseluruhan telah selesai. Gunakan tombol lanjut atau reset.");
        return;
    }
    
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

    // If no current side (e.g. overall match just finished and advanced, or initial load for a new match)
    // determine the starting side based on schedule.
    if (!sideToResetTo || (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) ) {
        sideToResetTo = (scheduleDetails.pesilatBiruName && scheduleDetails.pesilatMerahName) ? 'biru' : 'merah';
    }

    updateTimerStatusInFirestore({
      timerSeconds: roundDuration,
      isTimerRunning: false,
      matchStatus: 'Pending',
      performanceDuration: roundDuration,
      currentPerformingSide: sideToResetTo,
    });
  };

  const handleAdvanceStateOrParticipant = async () => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);

    try {
      const roundDuration = getPerformanceDurationForRound(scheduleDetails.round);
      // Case 1: Sudut Biru just finished, and Sudut Merah is next in the same schedule
      if (tgrTimerStatus.currentPerformingSide === 'biru' && tgrTimerStatus.matchStatus === 'Finished' && scheduleDetails.pesilatMerahName) {
        await updateTimerStatusInFirestore({
          currentPerformingSide: 'merah',
          matchStatus: 'Pending',
          timerSeconds: roundDuration,
          isTimerRunning: false,
          performanceDuration: roundDuration,
        });
      } 
      // Case 2: Sudut Merah just finished (or a single performer finished), advance to next schedule
      else if ((tgrTimerStatus.currentPerformingSide === 'merah' && tgrTimerStatus.matchStatus === 'Finished') || 
               (!scheduleDetails.pesilatBiruName && scheduleDetails.pesilatMerahName && tgrTimerStatus.matchStatus === 'Finished') || // Single Merah performer finished
               (!scheduleDetails.pesilatMerahName && scheduleDetails.pesilatBiruName && tgrTimerStatus.matchStatus === 'Finished') // Single Biru performer finished
      ) {
        // Mark current schedule as fully done by setting currentPerformingSide to null
        await updateTimerStatusInFirestore({ matchStatus: 'Finished', currentPerformingSide: null, isTimerRunning: false, timerSeconds: 0 });

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
          // State will reset via useEffect watching activeMatchId & scheduleDetails
        }
      } else {
        alert("Pastikan timer untuk sisi/penampilan saat ini telah selesai (status 'Finished') sebelum melanjutkan.");
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
    // If the current side is finished and there's another side, disable start/pause for current.
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) return true;
    // If the entire match (both sides or single performer) is finished
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'merah') return true; // Merah done, overall done
    if (tgrTimerStatus.matchStatus === 'Finished' && !scheduleDetails?.pesilatBiruName && scheduleDetails?.pesilatMerahName) return true; // Single Merah done


    if (tgrTimerStatus.timerSeconds === 0 && !tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus !== 'Pending') return true;
    return false;
  };


  const getAdvanceButtonText = () => {
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName && tgrTimerStatus.matchStatus === 'Finished') {
      return "Lanjut ke Sudut Merah";
    }
    return "Lanjut Peserta Berikutnya";
  };
  const getAdvanceButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.matchStatus !== 'Finished') return true;
    if (tgrTimerStatus.isTimerRunning) return true;
    // If Biru just finished and Merah is next, button should be enabled.
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) return false;
    // If Merah just finished (or single performer finished), button should be enabled.
    if (tgrTimerStatus.currentPerformingSide === 'merah' || (!scheduleDetails?.pesilatBiruName && scheduleDetails?.pesilatMerahName) || (!scheduleDetails?.pesilatMerahName && scheduleDetails?.pesilatBiruName) ) return false;

    return true; // Default to disabled if none of the enabling conditions are met
  };
  
  const displayPerformingSide = () => {
    if (!scheduleDetails) return "";
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruName) {
        return `Sudut Biru: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    }
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahName) {
        return `Sudut Merah: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    }
    // Fallback for single performer or if side is not yet determined but names exist
    if (scheduleDetails.pesilatMerahName && !scheduleDetails.pesilatBiruName) return `Peserta: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    if (scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName) return `Peserta: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || 'N/A'})`;
    // If both names exist but side is null (e.g., after full match finish)
    if (scheduleDetails.pesilatMerahName && scheduleDetails.pesilatBiruName && tgrTimerStatus.currentPerformingSide === null) return "Pertandingan Selesai";
    
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
          <Alert variant="destructive" className="mb-6 max-w-lg mx-auto">
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
              {tgrTimerStatus.matchStatus === 'Finished' && 
               ( (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails?.pesilatMerahName) || 
                 (tgrTimerStatus.currentPerformingSide === null) || // Overall match finished
                 (!scheduleDetails?.pesilatBiruName && scheduleDetails?.pesilatMerahName) // Single Merah performer finished
               ) && " (Penampilan Selesai)"}
            </p>
             <p className="text-xs text-muted-foreground">
              Target Durasi: {formatTime(tgrTimerStatus.performanceDuration)}
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
              aria-live="polite"
            >
              {isSubmitting && tgrTimerStatus.isTimerRunning !== undefined ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : getStartPauseButtonIcon()}
              {getStartPauseButtonText()}
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={getButtonDisabledState() || tgrTimerStatus.isTimerRunning}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer
            </Button>
            <Button onClick={handleAdvanceStateOrParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceButtonDisabled()}>
              {isSubmitting && (tgrTimerStatus.matchStatus === 'Finished' || tgrTimerStatus.currentPerformingSide === 'biru') ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
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

