
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Play, RotateCcw, ChevronsRight, Loader2, PauseIcon, Info, StopCircle } from 'lucide-react';
import type { ScheduleTGR, TGRTimerStatus, TGRMatchResult } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, where, getDocs, Timestamp, deleteField, writeBatch } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';
const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;

const initialGlobalTgrTimerStatus: TGRTimerStatus = {
  isTimerRunning: false,
  matchStatus: 'Pending',
  currentPerformingSide: null,
  startTimeMs: null,
  accumulatedDurationMs: 0,
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
};

// High-precision timer format
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const hundredths = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
  return `${minutes}:${seconds}.${hundredths}`;
};

function TGRTimerControlPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);

  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialGlobalTgrTimerStatus);
  const [displayTime, setDisplayTime] = useState(0); // Local state for smooth animation, in ms
  const [matchResultSaved, setMatchResultSaved] = useState<TGRMatchResult | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const animationFrameRef = useRef<number>();

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
      console.error(`[TGRTimerControl] Error fetching active matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif TGR per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);

  useEffect(() => {
    if (configMatchId === undefined) { 
      setIsLoading(true);
      return;
    }
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      setTgrTimerStatus(initialGlobalTgrTimerStatus);
      setMatchResultSaved(null);
      setError(null); 
      setActiveMatchId(configMatchId); 
    }
    setIsLoading(!!configMatchId); 
  }, [configMatchId, activeMatchId]);


  useEffect(() => {
    if (!activeMatchId) {
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      return;
    }
    let mounted = true;
    const loadSchedule = async () => {
      if (!mounted) return;
      setIsLoading(true); 
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          setScheduleDetails(scheduleDocSnap.data() as ScheduleTGR);
          setMatchDetailsLoaded(true); 
        } else {
          setError(`Detail jadwal TGR ID ${activeMatchId} tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
          setIsLoading(false); 
        }
      } catch (err) {
        if (mounted) setError("Gagal memuat detail jadwal TGR.");
        setScheduleDetails(null);
        setMatchDetailsLoaded(false);
        setIsLoading(false); 
      }
    };
    loadSchedule();
    return () => { mounted = false; };
  }, [activeMatchId]);


  useEffect(() => {
    if (!activeMatchId || !matchDetailsLoaded || !scheduleDetails) {
        if (!activeMatchId && !isLoading) { /* Already handled */ }
        else if (activeMatchId && !matchDetailsLoaded && isLoading) { /* Waiting */ }
        else if (activeMatchId && matchDetailsLoaded && !scheduleDetails && isLoading) { setIsLoading(false); }
        return;
    }

    let mounted = true;
    let unsubTimer: (() => void) | null = null;

    const initializeAndListenToTimer = async () => {
      if (!mounted) return;
      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      
      let initialSideForThisSchedule: 'biru' | 'merah' | null = null;
      if (scheduleDetails.pesilatBiruName) initialSideForThisSchedule = 'biru';
      else if (scheduleDetails.pesilatMerahName) initialSideForThisSchedule = 'merah';

      try {
        const matchDocSnap = await getDoc(matchDataDocRef);
        if (!mounted) return;

        let statusToInitializeWith = { ...initialGlobalTgrTimerStatus };
        let needsFirestoreWrite = false;

        if (!matchDocSnap.exists()) {
          statusToInitializeWith.currentPerformingSide = initialSideForThisSchedule;
          statusToInitializeWith.matchStatus = initialSideForThisSchedule ? 'Pending' : 'MatchFinished';
          needsFirestoreWrite = true;
        } else {
          const existingTimerStatus = matchDocSnap.data()?.timerStatus as TGRTimerStatus | undefined;
          if (existingTimerStatus) {
            statusToInitializeWith = { ...initialGlobalTgrTimerStatus, ...existingTimerStatus };
          }
          if (initialSideForThisSchedule && 
              statusToInitializeWith.matchStatus !== 'Finished' && 
              statusToInitializeWith.currentPerformingSide === null) {
            statusToInitializeWith.currentPerformingSide = initialSideForThisSchedule;
            statusToInitializeWith.matchStatus = 'Pending';
            statusToInitializeWith.accumulatedDurationMs = 0;
            if(initialSideForThisSchedule === 'biru') statusToInitializeWith.performanceDurationBiru = 0;
            if(initialSideForThisSchedule === 'merah') statusToInitializeWith.performanceDurationMerah = 0;
            needsFirestoreWrite = true;
          }
        }
        
        if (needsFirestoreWrite) {
          await setDoc(matchDataDocRef, { timerStatus: statusToInitializeWith }, { merge: true });
        }
      } catch (e) {
        if (mounted) console.error("Error during TGR timer initialization:", e);
      }

      unsubTimer = onSnapshot(matchDataDocRef, (snap) => {
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data();
            if (data?.timerStatus) {
                setTgrTimerStatus(data.timerStatus as TGRTimerStatus);
            }
            if (data?.matchResult) {
                setMatchResultSaved(data.matchResult as TGRMatchResult);
            } else {
                setMatchResultSaved(null);
            }
        } else {
          let fallbackSide: 'biru' | 'merah' | null = null;
          if (scheduleDetails?.pesilatBiruName) fallbackSide = 'biru';
          else if (scheduleDetails?.pesilatMerahName) fallbackSide = 'merah';
          setTgrTimerStatus(prev => ({ ...initialGlobalTgrTimerStatus, currentPerformingSide: fallbackSide, matchStatus: fallbackSide ? 'Pending' : 'MatchFinished' }));
          setMatchResultSaved(null);
        }
        if (isLoading) setIsLoading(false);
      }, (err) => {
        if (mounted) {
          console.error("Error listening to TGR timer status:", err);
          setError("Gagal sinkronisasi status timer TGR.");
          if(isLoading) setIsLoading(false);
        }
      });
    };

    initializeAndListenToTimer();
    return () => { mounted = false; if (unsubTimer) unsubTimer(); };
  }, [activeMatchId, matchDetailsLoaded, scheduleDetails, isLoading]);


  const updateTimerStatusInFirestoreOnly = useCallback(async (newStatusUpdates: Partial<TGRTimerStatus>) => {
    if (!activeMatchId || !scheduleDetails) { 
        console.warn("Update Firestore (timer only) aborted: No activeMatchId or scheduleDetails"); 
        throw new Error("Update Firestore (timer only) aborted: No activeMatchId or scheduleDetails");
    }
    try {
      const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
      const docSnap = await getDoc(matchDataDocRef);
      
      let currentDBTimerStatus = { ...initialGlobalTgrTimerStatus };
      if (docSnap.exists() && docSnap.data()?.timerStatus) {
        currentDBTimerStatus = docSnap.data()?.timerStatus as TGRTimerStatus;
      } else {
        if (scheduleDetails.pesilatBiruName) currentDBTimerStatus.currentPerformingSide = 'biru';
        else if (scheduleDetails.pesilatMerahName) currentDBTimerStatus.currentPerformingSide = 'merah';
        currentDBTimerStatus.matchStatus = currentDBTimerStatus.currentPerformingSide ? 'Pending' : 'MatchFinished';
      }
      const newFullStatus: TGRTimerStatus = { ...currentDBTimerStatus, ...newStatusUpdates };
      await setDoc(matchDataDocRef, { timerStatus: newFullStatus }, { merge: true });
    } catch (e) {
      console.error("Error updating TGR timer status (only) in Firestore:", e);
      throw e; 
    }
  }, [activeMatchId, scheduleDetails]);


  const handleStartPauseTimer = async () => {
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide || isSubmitting) return;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide) {
        alert(`Penampilan untuk ${tgrTimerStatus.currentPerformingSide === 'biru' ? 'Sudut Biru' : 'Sudut Merah'} telah Selesai. Gunakan tombol lanjut atau reset.`); return;
    }
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) {
        alert("Partai TGR ini telah Selesai. Gunakan tombol lanjut ke partai berikutnya."); return;
    }
    
    setIsSubmitting(true);
    setError(null);
    try {
      if (tgrTimerStatus.isTimerRunning) { // Pausing
        const elapsed = Date.now() - (tgrTimerStatus.startTimeMs || Date.now());
        await updateTimerStatusInFirestoreOnly({ 
            isTimerRunning: false, 
            matchStatus: 'Paused',
            startTimeMs: null,
            accumulatedDurationMs: tgrTimerStatus.accumulatedDurationMs + elapsed,
        });
      } else { // Starting/Resuming
        await updateTimerStatusInFirestoreOnly({ 
            isTimerRunning: true, 
            matchStatus: 'Ongoing',
            startTimeMs: Date.now(),
        });
      }
    } catch (e) {
      console.error("Error in handleStartPauseTimer (TGR):", e);
      setError("Gagal mengubah status timer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopTimer = async () => {
    if (!activeMatchId || !tgrTimerStatus.currentPerformingSide || !tgrTimerStatus.isTimerRunning || isSubmitting || !scheduleDetails) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      const currentSide = tgrTimerStatus.currentPerformingSide;
      const elapsed = Date.now() - (tgrTimerStatus.startTimeMs || Date.now());
      const finalDuration = tgrTimerStatus.accumulatedDurationMs + elapsed;

      const updates: Partial<TGRTimerStatus> = {
        isTimerRunning: false,
        matchStatus: 'Finished',
        startTimeMs: null,
        accumulatedDurationMs: finalDuration,
      };

      if (currentSide === 'biru') {
        updates.performanceDurationBiru = finalDuration;
      } else if (currentSide === 'merah') {
        updates.performanceDurationMerah = finalDuration;
      }

      const isLastParticipant = (currentSide === 'merah') || (currentSide === 'biru' && !scheduleDetails.pesilatMerahName);
      
      if (isLastParticipant) {
        updates.currentPerformingSide = null;
      }

      await updateTimerStatusInFirestoreOnly(updates);
    } catch (e) {
      console.error("Error in handleStopTimer (TGR):", e);
      setError("Gagal menghentikan timer dan mencatat waktu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetTimer = async () => {
    if (!activeMatchId || !scheduleDetails || !tgrTimerStatus.currentPerformingSide) return;
    if (tgrTimerStatus.isTimerRunning) { alert("Jeda timer terlebih dahulu sebelum mereset."); return; }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const sideToReset = tgrTimerStatus.currentPerformingSide;
      const updates: Partial<TGRTimerStatus> = { 
          isTimerRunning: false, 
          matchStatus: 'Pending',
          startTimeMs: null,
          accumulatedDurationMs: 0,
      };
      if (sideToReset === 'biru') updates.performanceDurationBiru = 0;
      else if (sideToReset === 'merah') updates.performanceDurationMerah = 0;
      
      await updateTimerStatusInFirestoreOnly(updates);
      
      const batch = writeBatch(db);
      TGR_JURI_IDS.forEach(juriId => {
          const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
          batch.set(juriDocRef, { [sideToReset]: { isReady: false } }, { merge: true });
      });
      await batch.commit();

    } catch (e) {
      console.error("Error in handleResetTimer (TGR):", e);
      setError("Gagal mereset timer dan status juri.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceToNextParticipant = async () => {
    if (!activeMatchId || !scheduleDetails || isSubmitting || tgrTimerStatus.isTimerRunning) return;
    if (tgrTimerStatus.currentPerformingSide !== 'biru' || !scheduleDetails.pesilatMerahName) {
      alert("Tidak dapat lanjut, kondisi tidak terpenuhi (bukan dari biru ke merah).");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    try {
      await updateTimerStatusInFirestoreOnly({
        currentPerformingSide: 'merah',
        matchStatus: 'Pending',
        isTimerRunning: false,
        startTimeMs: null,
        accumulatedDurationMs: 0,
        performanceDurationMerah: 0,
      });

      const batch = writeBatch(db);
      TGR_JURI_IDS.forEach(juriId => {
        const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
        batch.set(juriDocRef, { merah: { isReady: false } }, { merge: true });
      });
      await batch.commit();

    } catch(err) {
      console.error("Error advancing to next TGR participant:", err);
      setError("Gagal melanjutkan ke peserta berikutnya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdvanceToNextMatch = async () => {
    if (!activeMatchId || !scheduleDetails || !gelanggangName || isSubmitting || tgrTimerStatus.isTimerRunning) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      await updateTimerStatusInFirestoreOnly({ matchStatus: 'Finished', currentPerformingSide: null, isTimerRunning: false, accumulatedDurationMs: 0, startTimeMs: null });

      const schedulesRef = collection(db, SCHEDULE_TGR_COLLECTION);
      const q = query(
        schedulesRef,
        where('place', '==', gelanggangName),
        where('lotNumber', '>', scheduleDetails.lotNumber),
        orderBy('lotNumber', 'asc'),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      const venueMapRef = doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH);

      if (querySnapshot.empty) {
        alert(`Tidak ada partai TGR berikutnya untuk Gelanggang: ${gelanggangName}. Mengosongkan gelanggang.`);
        await updateDoc(venueMapRef, { [gelanggangName]: deleteField() });
      } else {
        const nextMatchDoc = querySnapshot.docs[0];
        await updateDoc(venueMapRef, { [gelanggangName]: nextMatchDoc.id });
        alert(`Berpindah ke Partai No. ${nextMatchDoc.data().lotNumber} (${nextMatchDoc.data().pesilatMerahName}) di ${gelanggangName}.`);
      }
    } catch (err) {
      console.error("Error advancing TGR state/participant:", err);
      setError("Gagal memproses kelanjutan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonDisabledState = () => isLoading || isSubmitting || !activeMatchId || !matchDetailsLoaded;
  const getStartPauseButtonText = () => tgrTimerStatus.isTimerRunning ? "Jeda Timer" : "Mulai Timer";
  const getStartPauseButtonIcon = () => tgrTimerStatus.isTimerRunning ? <PauseIcon className="mr-2 h-5 w-5"/> : <Play className="mr-2 h-5 w-5"/>;
  const getStartPauseButtonDisabled = () => {
    if (getButtonDisabledState() || !tgrTimerStatus.currentPerformingSide) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true;
    return false;
  };
  const getStopButtonDisabled = () => getButtonDisabledState() || !tgrTimerStatus.isTimerRunning;
  const getResetButtonDisabled = () => {
    if (getButtonDisabledState() || tgrTimerStatus.isTimerRunning || !tgrTimerStatus.currentPerformingSide) return true;
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return true;
    return false;
  };

  const showAdvanceToMerahButton = tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === 'biru' && !!scheduleDetails?.pesilatMerahName;
  const getAdvanceToMerahButtonDisabled = () => getButtonDisabledState() || tgrTimerStatus.isTimerRunning;
  
  const showAdvanceToNextMatchButton = tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null;
  const getAdvanceToNextMatchButtonDisabled = () => getButtonDisabledState() || tgrTimerStatus.isTimerRunning || !matchResultSaved;
  

  const displayPerformingSideInfo = () => {
    if (!scheduleDetails) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
        return isLoading ? "Memuat info..." : "Data Jadwal Tidak Ditemukan";
    }
    if (!tgrTimerStatus.currentPerformingSide) {
        if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) return "Partai Selesai";
        if (scheduleDetails.pesilatBiruName) return `Menunggu Sudut Biru...`;
        if (scheduleDetails.pesilatMerahName) return `Menunggu Sudut Merah/Peserta...`;
        return "Menunggu info peserta...";
    }
    if (tgrTimerStatus.currentPerformingSide === 'biru' && scheduleDetails.pesilatBiruName) return `Sudut Biru: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || 'N/A'})`;
    if (tgrTimerStatus.currentPerformingSide === 'merah' && scheduleDetails.pesilatMerahName) return `Sudut Merah: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    if (scheduleDetails.pesilatMerahName && !scheduleDetails.pesilatBiruName && tgrTimerStatus.currentPerformingSide === 'merah') return `Peserta: ${scheduleDetails.pesilatMerahName} (${scheduleDetails.pesilatMerahContingent || 'N/A'})`;
    if (scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName && tgrTimerStatus.currentPerformingSide === 'biru') return `Peserta: ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent || 'N/A'})`;
    return "Konfigurasi peserta tidak jelas.";
  };
  
  const recordedDurationForSide = (side: 'biru' | 'merah'): string | null => {
    const durationMs = side === 'biru' ? tgrTimerStatus.performanceDurationBiru : tgrTimerStatus.performanceDurationMerah;
    if (durationMs && durationMs > 0) return formatTime(durationMs);
    return null;
  }

  const getStatusText = () => {
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === null) {
      return matchResultSaved ? "Partai Selesai, Siap Lanjut" : "Menunggu Keputusan Ketua Pertandingan";
    }
    if (tgrTimerStatus.isTimerRunning) return "Berjalan";
    if (!tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Paused') return "Jeda";
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide) {
      return `Penampilan ${tgrTimerStatus.currentPerformingSide === 'biru' ? "Sudut Biru" : "Sudut Merah"} Selesai`;
    }
    return tgrTimerStatus.matchStatus;
  }

  if (!gelanggangName && !isLoading) {
    return (
        <div className="flex flex-col min-h-screen"><Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <Info className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Nama Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data.</p>
                <Button asChild className="mt-6">
                    <Link href={`/scoring/tgr/login`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  if (isLoading && (!activeMatchId || !matchDetailsLoaded)) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">
            {configMatchId === undefined ? `Memuat konfigurasi untuk Gelanggang: ${gelanggangName || '...'}` : 
             !activeMatchId && configMatchId === null ? `Tidak ada jadwal TGR aktif untuk Gelanggang: ${gelanggangName || '...'}` :
             `Memuat data pertandingan TGR untuk Gelanggang: ${gelanggangName || '...'}`}
          </p>
          {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="mb-6 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Kontrol Stopwatch TGR (Gel: {gelanggangName || 'N/A'})</h1>
            {scheduleDetails && matchDetailsLoaded ? (
                <p className="text-md text-muted-foreground">
                    Partai {scheduleDetails.lotNumber}: {displayPerformingSideInfo()} ({scheduleDetails.category}) - {scheduleDetails.round}
                </p>
            ) : activeMatchId ? ( <Skeleton className="h-6 w-3/4 mx-auto mt-2 bg-muted" />
            ): ( <p className="text-md text-muted-foreground">Tidak ada jadwal TGR aktif untuk gelanggang ini.</p> )}
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
            <CardTitle className="text-6xl md:text-8xl font-mono text-primary tracking-tighter">
              {formatTime(displayTime)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Status: {getStatusText()}
            </p>
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
            <Button onClick={handleStartPauseTimer} className={cn("w-full py-3 text-lg",tgrTimerStatus.isTimerRunning ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-500 hover:bg-green-600 text-white")} disabled={getStartPauseButtonDisabled()} aria-live="polite">
              {isSubmitting && tgrTimerStatus.isTimerRunning !== undefined ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : getStartPauseButtonIcon()}
              {getStartPauseButtonText()}
            </Button>
            <Button onClick={handleStopTimer} variant="destructive" className="w-full py-3 text-lg" disabled={getStopButtonDisabled()}>
              {isSubmitting && !tgrTimerStatus.isTimerRunning && tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <StopCircle className="mr-2 h-5 w-5"/>}
              Stop & Catat Waktu
            </Button>
            <Button onClick={handleResetTimer} variant="outline" className="w-full py-3 text-lg" disabled={getResetButtonDisabled()}>
              {isSubmitting && tgrTimerStatus.matchStatus === 'Pending' && tgrTimerStatus.currentPerformingSide ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <RotateCcw className="mr-2 h-5 w-5"/>}
              Reset Timer ({tgrTimerStatus.currentPerformingSide ? (tgrTimerStatus.currentPerformingSide === 'biru' ? 'Biru' : 'Merah') : 'N/A'})
            </Button>
            
            {showAdvanceToMerahButton && (
               <Button onClick={handleAdvanceToNextParticipant} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceToMerahButtonDisabled()}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
                Lanjut ke Sudut Merah
              </Button>
            )}

            {showAdvanceToNextMatchButton && (
              <Button onClick={handleAdvanceToNextMatch} className="w-full py-3 text-lg bg-blue-600 hover:bg-blue-700 text-white" disabled={getAdvanceToNextMatchButtonDisabled()}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ChevronsRight className="mr-2 h-5 w-5"/>}
                Lanjut Partai Berikutnya
              </Button>
            )}

          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button variant="link" asChild>
            <Link href={`/scoring/tgr/login?gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login TGR</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

export default function TGRTimerControlPageWithSuspense() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Kontrol Timer TGR...</p>
        </main>
      </div>
    }>
      <TGRTimerControlPageComponentWithSearchParams />
    </Suspense>
  );
}

function TGRTimerControlPageComponentWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <TGRTimerControlPageComponent gelanggangName={gelanggangName} />;
}
