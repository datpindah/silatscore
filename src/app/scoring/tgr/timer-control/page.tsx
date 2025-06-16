
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
  timerSeconds: 0, // Stopwatch starts at 0
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
      setConfigMatchId(null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
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
    let unsubTimer: (() => void) | null = null;

    const loadScheduleDetailsAndInitializeTimer = async () => {
      if (!mounted || !activeMatchId) return;
      if (!matchDetailsLoaded) setIsLoading(true);

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        let currentSchedule: ScheduleTGR | null = null;
        if (scheduleDocSnap.exists()) {
          currentSchedule = scheduleDocSnap.data() as ScheduleTGR;
          setScheduleDetails(currentSchedule);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR ID ${activeMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          if (mounted) setIsLoading(false);
          return;
        }

        if (currentSchedule) {
          const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
          unsubTimer = onSnapshot(matchDataDocRef, async (matchDocSnap) => {
            if (!mounted) return;

            let initialSide: 'biru' | 'merah' | null = null;
            if (currentSchedule?.pesilatBiruName) {
              initialSide = 'biru';
            } else if (currentSchedule?.pesilatMerahName) {
              initialSide = 'merah';
            }

            let newStatusToSet: TGRTimerStatus;
            let firestoreNeedsUpdate = false;

            if (matchDocSnap.exists()) {
              const data = matchDocSnap.data();
              const fsTimerStatus = data?.timerStatus as TGRTimerStatus | undefined;
              newStatusToSet = fsTimerStatus ? { ...initialGlobalTgrTimerStatus, ...fsTimerStatus } : { ...initialGlobalTgrTimerStatus };

              if (newStatusToSet.matchStatus === 'Finished' && newStatusToSet.currentPerformingSide === null) {
                // Match is fully finished, do not re-initialize
              } else if (newStatusToSet.currentPerformingSide === undefined || newStatusToSet.currentPerformingSide === null) {
                // If currentPerformingSide is not set, initialize it
                newStatusToSet.currentPerformingSide = initialSide;
                newStatusToSet.timerSeconds = 0;
                newStatusToSet.matchStatus = 'Pending';
                newStatusToSet.isTimerRunning = false;
                // Reset performance durations for the new match/side
                newStatusToSet.performanceDurationBiru = 0;
                newStatusToSet.performanceDurationMerah = 0;
                firestoreNeedsUpdate = true;
              }
            } else {
              // Match document doesn't exist, create it with initial state
              newStatusToSet = {
                ...initialGlobalTgrTimerStatus,
                currentPerformingSide: initialSide,
                timerSeconds: 0,
                matchStatus: 'Pending',
                performanceDurationBiru: 0,
                performanceDurationMerah: 0,
              };
              firestoreNeedsUpdate = true;
            }
            
            setTgrTimerStatus(prevStatus => {
              if (JSON.stringify(prevStatus) !== JSON.stringify(newStatusToSet)) {
                return newStatusToSet;
              }
              return prevStatus;
            });

            if (firestoreNeedsUpdate) {
              try {
                await setDoc(matchDataDocRef, { timerStatus: newStatusToSet }, { merge: true });
              } catch (e) {
                console.error("Error writing initial/corrected timer status to Firestore:", e);
              }
            }
          });
        }
      } catch (err) {
        if (mounted) {
          console.error("Error in loadScheduleDetailsAndInitializeTimer:", err);
          setError("Gagal memuat data jadwal atau timer.");
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      } finally {
        if (mounted && matchDetailsLoaded) setIsLoading(false);
      }
    };

    loadScheduleDetailsAndInitializeTimer();

    return () => {
      mounted = false;
      if (unsubTimer) unsubTimer();
    };
  }, [activeMatchId, matchDetailsLoaded]);

  useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeMatchId === null)) {
      setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeMatchId]);

  useEffect(() => {
    if (tgrTimerStatus.isTimerRunning && activeMatchId) {
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
            if (currentDBDoc.exists() && currentDBDoc.data()?.timerStatus) {
                 setTgrTimerStatus(currentDBDoc.data()?.timerStatus as TGRTimerStatus);
            } else {
                 setTgrTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
            }
            return;
          }

          const currentDBTimerStatus = currentDBDoc.data()?.timerStatus as TGRTimerStatus;
          const newSeconds = currentDBTimerStatus.timerSeconds + 1;

          const updatedStatusForFirestore: Partial<TGRTimerStatus> = {
            timerSeconds: newSeconds,
          };
          await updateDoc(matchDataDocRef, { timerStatus: {...currentDBTimerStatus, ...updatedStatusForFirestore } });
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
  }, [tgrTimerStatus.isTimerRunning, activeMatchId]);

  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TGRTimerStatus>) => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);
    try {
      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      const docSnap = await getDoc(matchDataDocRef);
      
      let currentDBTimerStatus = initialGlobalTgrTimerStatus;
      if (docSnap.exists() && docSnap.data()?.timerStatus) {
        currentDBTimerStatus = docSnap.data()?.timerStatus as TGRTimerStatus;
      } else {
        if (scheduleDetails.pesilatBiruName) currentDBTimerStatus.currentPerformingSide = 'biru';
        else if (scheduleDetails.pesilatMerahName) currentDBTimerStatus.currentPerformingSide = 'merah';
      }

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
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide) return;

    if (tgrTimerStatus.matchStatus === 'Finished') {
        alert("Penampilan untuk sisi ini telah selesai. Gunakan tombol lanjut atau reset.");
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
      matchStatus: 'Finished',
    };
    if (tgrTimerStatus.currentPerformingSide === 'biru') {
      updates.performanceDurationBiru = tgrTimerStatus.timerSeconds;
    } else if (tgrTimerStatus.currentPerformingSide === 'merah') {
      updates.performanceDurationMerah = tgrTimerStatus.timerSeconds;
    }
    updateTimerStatusInFirestore(updates);
  };

  const handleResetTimer = () => {
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide) return;
    const updates: Partial<TGRTimerStatus> = {
      timerSeconds: 0,
      isTimerRunning: false,
      matchStatus: 'Pending',
    };
    if (tgrTimerStatus.currentPerformingSide === 'biru') {
      updates.performanceDurationBiru = 0;
    } else if (tgrTimerStatus.currentPerformingSide === 'merah') {
      updates.performanceDurationMerah = 0;
    }
    updateTimerStatusInFirestore(updates);
  };

  const handleAdvanceStateOrParticipant = async () => {
    if (!activeMatchId || !scheduleDetails) return;
    setIsSubmitting(true);

    try {
      // If current side is Biru and Merah exists, transition to Merah
      if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatMerahName) {
        await updateTimerStatusInFirestore({
          currentPerformingSide: 'merah',
          matchStatus: 'Pending',
          timerSeconds: 0,
          isTimerRunning: false,
          performanceDurationMerah: 0,
        });
      } else {
        // Current side was Merah, or it was a single participant, or Biru was last.
        // Mark current match as fully finished.
        await updateTimerStatusInFirestore({
            matchStatus: 'Finished',
            currentPerformingSide: null, // No side is active anymore for this match
            isTimerRunning: false,
        });

        // Then, look for the next TGR schedule.
        const schedulesRef = collection(db, SCHEDULE_TGR_COLLECTION);
        const q = query(
          schedulesRef,
          where('lotNumber', '>', scheduleDetails.lotNumber),
          orderBy('lotNumber', 'asc'),
          limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          alert("Ini adalah partai TGR terakhir. Tidak ada partai berikutnya.");
          // Optionally, clear the active TGR schedule setting
          // await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: null });
        } else {
          const nextMatchDoc = querySnapshot.docs[0];
          await setDoc(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), { activeScheduleId: nextMatchDoc.id });
          // The page will reload due to configMatchId change listener.
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
    if (!tgrTimerStatus.currentPerformingSide) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide !== null) return true; // Side finished, cannot restart/pause
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true; // Overall match finished
    return false;
  };
  
  const getStopButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (!tgrTimerStatus.isTimerRunning) return true;
    return false;
  };

  const getResetButtonDisabled = () => {
    if (getButtonDisabledState() || tgrTimerStatus.isTimerRunning || !tgrTimerStatus.currentPerformingSide) return true;
    if (tgrTimerStatus.matchStatus === 'Ongoing') return true;
    return false;
  };

  const getAdvanceButtonText = () => {
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) {
      return "Lanjut ke Sudut Merah";
    }
    return "Lanjut Partai Berikutnya";
  };

  const getAdvanceButtonDisabled = () => {
    if (getButtonDisabledState()) return true;
    if (tgrTimerStatus.isTimerRunning) return true;
    
    // To advance, the current side's performance must be 'Finished'
    if (tgrTimerStatus.matchStatus !== 'Finished') return true;

    // If current side is Biru and Merah exists, can advance to Merah
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) return false;
    
    // If current side is Merah, can advance to next participant
    if (tgrTimerStatus.currentPerformingSide === 'merah') return false;
    
    // If current side is Biru, and NO Merah exists (single performer was Biru)
    if (tgrTimerStatus.currentPerformingSide === 'biru' && !scheduleDetails?.pesilatMerahName) return false;

    // If overall match is finished (currentPerformingSide is null), button should allow advancing to *next schedule*
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return false;

    return true; // Otherwise, disabled
  };

  const displayPerformingSideInfo = () => {
    if (!scheduleDetails) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
        return "Memuat info...";
    }
    if (!tgrTimerStatus.currentPerformingSide) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
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
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Kontrol Stopwatch TGR</h1>
            {scheduleDetails && matchDetailsLoaded ? (
                <p className="text-md text-muted-foreground">
                    Partai {scheduleDetails.lotNumber}: {displayPerformingSideInfo()} ({scheduleDetails.category}) - {scheduleDetails.round}
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
              {!tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Paused' && " (Jeda)"}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide && ` (${tgrTimerStatus.currentPerformingSide === 'biru' ? "Sudut Biru" : "Sudut Merah"} Selesai)`}
              {tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null && " (Partai Selesai)"}
            </p>
            {tgrTimerStatus.currentPerformingSide && recordedDurationForSide(tgrTimerStatus.currentPerformingSide) && tgrTimerStatus.matchStatus === 'Finished' && (
                <p className="text-xs text-green-600">
                    Waktu Tercatat {tgrTimerStatus.currentPerformingSide === 'biru' ? 'Biru' : 'Merah'}: {recordedDurationForSide(tgrTimerStatus.currentPerformingSide)}
                </p>
            )}
             {!tgrTimerStatus.currentPerformingSide && recordedDurationForSide('merah') && tgrTimerStatus.matchStatus === 'Finished' && ( 
                <p className="text-xs text-green-600">
                    Waktu Tercatat Merah: {recordedDurationForSide('merah')}
                </p>
            )}
             {!tgrTimerStatus.currentPerformingSide && recordedDurationForSide('biru') && scheduleDetails?.pesilatBiruName && tgrTimerStatus.matchStatus === 'Finished' && (
                <p className="text-xs text-green-600">
                    Waktu Tercatat Biru: {recordedDurationForSide('biru')}
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
              {isSubmitting && !tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Finished' ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <StopCircle className="mr-2 h-5 w-5"/>}
              Stop & Catat Waktu
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={getResetButtonDisabled()}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' && tgrTimerStatus.currentPerformingSide && tgrTimerStatus.timerSeconds === 0 ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer (untuk {tgrTimerStatus.currentPerformingSide === 'biru' ? 'Biru' : (tgrTimerStatus.currentPerformingSide === 'merah' ? 'Merah' : 'Sisi Aktif')})
            </Button>
            <Button onClick={handleAdvanceStateOrParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceButtonDisabled()}>
              {isSubmitting && (tgrTimerStatus.matchStatus === 'Finished' || (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails?.pesilatMerahName) ) ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
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

