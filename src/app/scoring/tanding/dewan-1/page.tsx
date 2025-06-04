
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
// import { PageTitle } from '@/components/shared/PageTitle'; // Not used here, but might be if layout changes
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, collection, writeBatch } from 'firebase/firestore';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const ROUND_DURATION_SECONDS = 120; // 2 minutes
const TOTAL_ROUNDS = 3;
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'];

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface ScoreEntry { // Structure from Juri page
  points: 1 | 2;
  timestamp: Timestamp; // Firebase Timestamp
}

interface JuriRoundScores { // Structure from Juri page
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

interface JuriMatchData { // Structure from Juri page
  merah: JuriRoundScores;
  biru: JuriRoundScores;
  lastUpdated?: Timestamp;
}

interface TimerStatus {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: 'Pending' | `OngoingRound${number}` | `PausedRound${number}` | `FinishedRound${number}` | 'MatchFinished';
  roundDuration: number;
}

const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: ROUND_DURATION_SECONDS,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: ROUND_DURATION_SECONDS,
};

// Helper type for combined score entry with juriId
interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
}


export default function ScoringTandingDewanSatuPage() {
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  const [juri1Scores, setJuri1Scores] = useState<JuriMatchData | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriMatchData | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriMatchData | null>(null);

  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true); // Set loading true when starting to fetch config
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const newActiveId = docSnap.data().activeScheduleId;
        if (newActiveId !== activeScheduleId) { // Check if ID actually changed
          setActiveScheduleId(newActiveId);
          // Reset dependent states only if ID changes, data loading for new ID will handle specifics
          setMatchDetails(null);
          setPesilatMerahInfo(null);
          setPesilatBiruInfo(null);
          setTimerStatus(initialTimerStatus);
          setJuri1Scores(null);
          setJuri2Scores(null);
          setJuri3Scores(null);
          setConfirmedScoreMerah(0);
          setConfirmedScoreBiru(0);
          setError(null);
          // setIsLoading will be true until new data is loaded by the next useEffect
        } else if (!activeScheduleId && !newActiveId) { // If both current and new are null/empty
            setIsLoading(false); // No active schedule, stop loading
        }
      } else {
        setActiveScheduleId(null);
        setError("Tidak ada jadwal pertandingan yang aktif.");
        setMatchDetails(null);
        setPesilatMerahInfo(null);
        setPesilatBiruInfo(null);
        setIsLoading(false); // No active schedule, stop loading
      }
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setIsLoading(false);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, [activeScheduleId]); // Rerun if activeScheduleId state itself is changed elsewhere (though unlikely)

  useEffect(() => {
    if (!activeScheduleId) {
      setMatchDetails(null); 
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setTimerStatus(initialTimerStatus);
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setIsLoading(false); // Explicitly set loading false if no active ID
      return;
    }

    setIsLoading(true); // Start loading process for the activeScheduleId
    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding; // Assume date is string from Firestore fetch
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
        } else {
          setError(`Detail jadwal untuk ID ${activeScheduleId} tidak ditemukan.`);
          setMatchDetails(null);
          setPesilatMerahInfo(null);
          setPesilatBiruInfo(null);
          setIsLoading(false); // Failed to load schedule details
          return;
        }

        // Listener for timer_status
        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            setTimerStatus(docSnap.data()?.timer_status as TimerStatus);
          } else {
            // If timer_status doesn't exist, initialize it
            await setDoc(timerStatusDocRef, { timer_status: initialTimerStatus }, { merge: true });
            setTimerStatus(initialTimerStatus);
          }
        }, (err) => {
          console.error("Error fetching timer status:", err);
          setError("Gagal memuat status timer.");
          // Consider setting isLoading false if this is critical and fails
        });
        unsubscribers.push(unsubTimer);
        
        // Listeners for juri_scores
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (docSnap.exists()) {
              juriSetters[index](docSnap.data() as JuriMatchData);
            } else {
              juriSetters[index](null); // No data for this Juri yet
            }
            // Loading state will be managed by the useEffect that processes scores
          }, (err) => {
            console.error(`Error fetching scores for ${juriId}:`, err);
            juriSetters[index](null);
          });
          unsubscribers.push(unsubJuri);
        });
        
      } catch (err) {
        console.error("Error loading match data:", err);
        setError("Gagal memuat data pertandingan.");
        setIsLoading(false); // General error during data loading
      }
      // setIsLoading(false) will be handled by the score processing useEffect
    };

    loadData();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeScheduleId]);


  const calculateConfirmedScoreForPesilat = useCallback((
    pesilatColor: 'merah' | 'biru',
    currentRound: 1 | 2 | 3,
    allJuriScores: (JuriMatchData | null)[]
  ): number => {
    const roundKey = `round${currentRound}` as keyof JuriRoundScores;
    let allEntriesForRound: CombinedScoreEntry[] = [];

    allJuriScores.forEach((juriData, index) => {
      if (juriData && juriData[pesilatColor] && juriData[pesilatColor][roundKey]) {
        const juriId = JURI_IDS[index];
        const scoresForRoundByJuri: ScoreEntry[] = juriData[pesilatColor][roundKey];

        scoresForRoundByJuri.forEach(score => {
          allEntriesForRound.push({ ...score, juriId });
        });
      }
    });

    // Filter out entries with invalid timestamps BEFORE sorting
    const validEntriesForRound = allEntriesForRound.filter(entry => {
      if (entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        return true;
      }
      console.warn(
        `Filtering out malformed score entry before sort: juriId=${entry.juriId}, pesilat=${pesilatColor}, round=${currentRound}, score=${JSON.stringify(entry)}`
      );
      return false;
    });
    
    if (validEntriesForRound.length < 2) return 0;

    validEntriesForRound.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    let confirmedPointsTotal = 0;
    const usedEntriesKeys = new Set<string>(); // Store as "juriId_timestampMillis_points"

    for (let i = 0; i < validEntriesForRound.length; i++) {
      const e1 = validEntriesForRound[i];
      const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;
      if (usedEntriesKeys.has(e1Key)) continue;

      let confirmingJuries = new Set<string>([e1.juriId]);
      let tempUsedEntriesForThisPoint = new Set<string>([e1Key]); // Keys of entries forming this potential point

      for (let j = i + 1; j < validEntriesForRound.length; j++) {
        const e2 = validEntriesForRound[j];
        const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;

        if (usedEntriesKeys.has(e2Key) || confirmingJuries.has(e2.juriId)) continue;
        
        // Check time window relative to e1 (the first score in a potential match)
        if (e2.timestamp.toMillis() - e1.timestamp.toMillis() > 2000) { 
          // If e2 is too far from e1, subsequent entries will also be too far from e1.
          // However, e1 might still pair with an earlier e2 that we haven't processed in this inner loop
          // This logic needs to ensure we check all pairs correctly.
          // The current sort ensures e2.timestamp is >= e1.timestamp.
          // If we iterate e1, then for each e1, we look for confirming e2s.
          // This break might be too aggressive if e1 could pair with something much later but e2 is just noise.
          // Let's simplify: compare e2 with e1. If e2 is within e1's 2s window.
           // No, this break should be correct: if e2 is already outside the 2s window from e1, no later e_k can be inside.
           break; 
        }


        if (e1.points === e2.points) {
          confirmingJuries.add(e2.juriId);
          tempUsedEntriesForThisPoint.add(e2Key);
        }
      }
      
      if (confirmingJuries.size >= 2) {
        confirmedPointsTotal += e1.points;
        tempUsedEntriesForThisPoint.forEach(key => usedEntriesKeys.add(key));
      }
    }
    return confirmedPointsTotal;
  }, []);


  useEffect(() => {
    // This effect calculates confirmed scores whenever juri scores or timer status (for currentRound) changes.
    // It also manages the overall isLoading state for the page.
    if (!activeScheduleId) {
      setConfirmedScoreMerah(0);
      setConfirmedScoreBiru(0);
      setIsLoading(false); // No active schedule, not loading
      return;
    }

    // Assume loading is true if we have an activeScheduleId but haven't finished processing scores
    // The point at which isLoading becomes false is crucial.
    // It should be after all initial data (schedule, timer, all juri scores) for the activeScheduleId is fetched or attempted.

    const allJuriData = [juri1Scores, juri2Scores, juri3Scores];
    
    let totalMerah = 0;
    let totalBiru = 0;

    // Calculate scores for all rounds up to TOTAL_ROUNDS
    for (let roundNum: 1 | 2 | 3 = 1; roundNum <= TOTAL_ROUNDS; roundNum = (roundNum + 1) as (1 | 2 | 3)) {
        totalMerah += calculateConfirmedScoreForPesilat('merah', roundNum, allJuriData);
        totalBiru += calculateConfirmedScoreForPesilat('biru', roundNum, allJuriData);
        if (roundNum === TOTAL_ROUNDS) break; 
    }

    setConfirmedScoreMerah(totalMerah);
    setConfirmedScoreBiru(totalBiru);
    
    // Determine if initial loading is complete:
    // We need scheduleDetails, timerStatus, and an attempt to load all juri scores.
    // juriXScores can be null if a juri hasn't submitted, that's fine.
    // The key is that the onSnapshot listeners for juri scores have fired at least once (or failed).
    // This is tricky to determine perfectly without more complex state.
    // A simple heuristic: if matchDetails and timerStatus are loaded, and this effect is running,
    // then the juri score snapshots have likely also been set up.
    if (matchDetails && timerStatus) {
        setIsLoading(false);
    } else if (activeScheduleId) {
        setIsLoading(true); // Still waiting for matchDetails or timerStatus for the current activeScheduleId
    } else {
        setIsLoading(false); // No active schedule ID
    }

  }, [juri1Scores, juri2Scores, juri3Scores, timerStatus, activeScheduleId, matchDetails, calculateConfirmedScoreForPesilat]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(() => {
        // Intentionally update Firestore first, local state will follow via onSnapshot
        // This makes Firestore the source of truth for the timer tick.
        (async () => {
          if (activeScheduleId) { // Re-check activeScheduleId inside async
            try {
              const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
              // It's important to fetch the LATEST timer status before decrementing
              // to avoid race conditions if multiple clients (unlikely for Dewan-1) or fast updates.
              // For Dewan-1, direct update based on its own state is usually fine.
              const currentTimerSeconds = timerStatus.timerSeconds; // Use current state from snapshot
              const newSeconds = Math.max(0, currentTimerSeconds - 1);
              
              let newMatchStatus = timerStatus.matchStatus;
              let newIsTimerRunning = timerStatus.isTimerRunning;

              if (newSeconds === 0) {
                  newIsTimerRunning = false;
                  newMatchStatus = `FinishedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'];
                  if (timerStatus.currentRound === TOTAL_ROUNDS) {
                    newMatchStatus = 'MatchFinished';
                  }
              }
              
              const updatedStatusForFirestore: Partial<TimerStatus> = {
                  timerSeconds: newSeconds,
                  isTimerRunning: newIsTimerRunning,
                  matchStatus: newMatchStatus,
              };
              await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
            } catch (e) {
                console.error("Error updating timer in interval: ", e);
            }
          }
        })();
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, timerStatus.currentRound, timerStatus.matchStatus, activeScheduleId]);


  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      // Fetch current timer_status from Firestore or use local state as base for a complete object
      const currentDBStatus = timerStatus || initialTimerStatus; // Use local state as fallback
      const newFullStatus = { ...currentDBStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // Local state will update via onSnapshot from Firestore
    } catch (e) {
      console.error("Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]);

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;

    if (action === 'start') {
      // If round ended and it's not the last round, auto-start implies moving to next round's start
      if (timerStatus.timerSeconds === 0 && timerStatus.currentRound < TOTAL_ROUNDS) {
         // This should be handled by "Babak Selanjutnya" or explicit set babak
         // For pure start, if timer is 0, it means round is over.
         // If user presses start when timer is 0 for current round, it should only start if round hasn't finished.
         if (!timerStatus.matchStatus.startsWith('FinishedRound')) {
             updateTimerStatusInFirestore({ 
                 isTimerRunning: true, 
                 matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
             });
         }
      } else if (timerStatus.timerSeconds > 0) { // Standard start/resume
        updateTimerStatusInFirestore({ 
            isTimerRunning: true, 
            matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
        });
      }
    } else if (action === 'pause') {
      updateTimerStatusInFirestore({ 
          isTimerRunning: false, 
          matchStatus: `PausedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
      });
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;
    
    // Prevent changing babak if current round is running and not finished
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round && timerStatus.timerSeconds > 0) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
    // Allow changing to a new babak or restarting a finished babak
     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: ROUND_DURATION_SECONDS, // Reset timer for the new/selected round
      isTimerRunning: false, // Always start paused when babak is manually set
      matchStatus: 'Pending', // Or `PausedRound${round}` if preferred
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus) return;

    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan ke babak berikutnya atau menyelesaikan match.");
        return;
    }

    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        // Move to next round
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS,
            isTimerRunning: false,
            matchStatus: 'Pending', // Ready for next round to start
        });
    } else if (timerStatus.currentRound === TOTAL_ROUNDS && (timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound'))) {
        // Finish match
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false });
    } else if (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning){
        // If last round is paused but not finished, alert user or implement logic to force finish
        if(confirm("Babak terakhir belum selesai (timer belum 0). Yakin ingin menyelesaikan pertandingan?")){
            updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
        }
    }
  };


  const handleResetMatch = async () => {
    if (!activeScheduleId || !confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    setIsLoading(true); // Show loading during reset
    try {
        const batch = writeBatch(db);
        
        // Reset timer status
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { timer_status: initialTimerStatus }, { merge: true }); // Use initialTimerStatus

        // Reset scores for all juri
        const initialJuriScoresData = { // Define initial structure for a juri's scores
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(),
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriScoresData); // Set to initial, not delete
        });
        
        await batch.commit();
        // Local states (timerStatus, juriXScores) will update via their onSnapshot listeners.
        // Confirmed scores will also update via their useEffect.
        alert("Pertandingan telah direset.");
    } catch (e) {
        console.error("Error resetting match:", e);
        setError("Gagal mereset pertandingan.");
    } finally {
       // setIsLoading(false); // Re-fetching will set this correctly
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat data Dewan Kontrol...</p>
                {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
            </main>
        </div>
    );
  }

   if (!activeScheduleId || !matchDetails) { 
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
           <Card className="mt-6 shadow-lg">
            <CardHeader>
                <CardTitle className="text-xl font-headline text-center text-primary">Scoring Tanding - Dewan Kontrol</CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center">
                <p className="mb-4 text-muted-foreground">{error || "Tidak ada pertandingan yang aktif atau detail tidak ditemukan."}</p>
                <Button variant="outline" asChild>
                    <Link href="/admin/schedule-tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Atur Jadwal Aktif</Link>
                </Button>
            </CardContent>
           </Card>
        </main>
      </div>
    );
  }
  
  const getMatchStatusText = () => {
    if (!timerStatus) return "Memuat status...";
    if (timerStatus.matchStatus.startsWith("Ongoing")) return `Babak ${timerStatus.currentRound} Berlangsung`;
    if (timerStatus.matchStatus.startsWith("Paused")) return `Babak ${timerStatus.currentRound} Jeda`;
    if (timerStatus.matchStatus.startsWith("FinishedRound")) return `Babak ${timerStatus.currentRound} Selesai`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    return "Menunggu Dimulai";
  };

  const getJuriScoreForDisplay = (juriData: JuriMatchData | null, pesilatColor: 'merah' | 'biru', round: 1 | 2 | 3) => {
    if (!juriData) return '-';
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scores = juriData[pesilatColor]?.[roundKey]?.map(s => s.points) || [];
    return scores.length > 0 ? scores.join(',') : '0';
  };

  const getTotalJuriScoreForDisplay = (juriData: JuriMatchData | null, pesilatColor: 'merah' | 'biru') => {
    if (!juriData) return 0;
    let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        (juriData[pesilatColor]?.[roundKey] || []).forEach(s => total += s.points);
    });
    return total;
  };
  
  const nextButtonText = timerStatus.currentRound < TOTAL_ROUNDS ? 'Babak Selanjutnya' : 'Selesaikan Match';
  const isNextActionDisabled = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.timerSeconds > 0 && !timerStatus.matchStatus.startsWith('FinishedRound'));


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT</h1>
            <p className="text-xs md:text-sm">
              {matchDetails.place || "Gelanggang Utama"} | Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
            </p>
            {error && !isLoading && <p className="text-xs md:text-sm text-yellow-300 mt-1">Error: {error}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          {/* Pesilat Biru Score Box */}
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4">
                <CardTitle className="text-base md:text-xl font-semibold truncate">{pesilatBiruInfo?.name || 'Pesilat Biru'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreBiru}</span>
              </CardContent>
            </Card>
          </div>

          {/* Timer and Round Controls */}
          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className="text-3xl md:text-5xl font-mono font-bold text-gray-800 dark:text-gray-200">{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${
                    timerStatus.currentRound === round 
                      ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent dark:ring-offset-gray-800' 
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  } ${ (timerStatus.isTimerRunning && timerStatus.currentRound !== round) || timerStatus.matchStatus === 'MatchFinished' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={(timerStatus.isTimerRunning && timerStatus.currentRound !== round) || timerStatus.matchStatus === 'MatchFinished'}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 md:mt-2 px-1">{getMatchStatusText()}</p>
          </div>

          {/* Pesilat Merah Score Box */}
          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-base md:text-xl font-semibold truncate">{pesilatMerahInfo?.name || 'Pesilat Merah'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Control Buttons */}
        <Card className="shadow-lg mb-4 bg-white dark:bg-gray-800">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
              {!timerStatus.isTimerRunning && timerStatus.matchStatus !== 'MatchFinished' && timerStatus.timerSeconds > 0 ? (
                <Button 
                    onClick={() => handleTimerControl('start')} 
                    disabled={timerStatus.matchStatus === 'MatchFinished' || (timerStatus.timerSeconds === 0 && timerStatus.matchStatus.startsWith(`FinishedRound`)) || timerStatus.matchStatus.startsWith('FinishedRound')}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 md:py-3 text-sm md:text-base"
                >
                  <Play className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Start
                </Button>
              ) : (
                <Button onClick={() => handleTimerControl('pause')} 
                        disabled={!timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished'}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-3 text-sm md:text-base">
                  <Pause className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Pause
                </Button>
              )}
              <Button 
                onClick={handleNextAction}
                disabled={isNextActionDisabled}
                variant="outline"
                className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {nextButtonText} <ChevronRight className="ml-1 h-4 md:h-5 w-4 md:w-5" />
              </Button>
              <Button onClick={handleResetMatch} variant="destructive" className="w-full py-2 md:py-3 text-sm md:text-base">
                <RotateCcw className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Reset Match
              </Button>
               <Button variant="outline" asChild className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 md:h-5 w-4 md:w-5" />
                  Keluar
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

         {/* Juri Status and Raw Scores */}
         <Card className="mt-4 shadow-lg bg-white dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center text-gray-800 dark:text-gray-200">
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri & Skor Mentah Detail
                </CardTitle>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {[juri1Scores, juri2Scores, juri3Scores].map((jS, idx) => (
                    <div key={`juri-status-${idx+1}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                        <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Belum ada data</span>}</p>
                        {jS && (
                            <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                <p><span className='font-medium text-red-500'>Merah:</span> R1[{getJuriScoreForDisplay(jS, 'merah', 1)}] R2[{getJuriScoreForDisplay(jS, 'merah', 2)}] R3[{getJuriScoreForDisplay(jS, 'merah', 3)}] = <span className='font-semibold'>{getTotalJuriScoreForDisplay(jS, 'merah')}</span></p>
                                <p><span className='font-medium text-blue-500'>Biru:</span> R1[{getJuriScoreForDisplay(jS, 'biru', 1)}] R2[{getJuriScoreForDisplay(jS, 'biru', 2)}] R3[{getJuriScoreForDisplay(jS, 'biru', 3)}] = <span className='font-semibold'>{getTotalJuriScoreForDisplay(jS, 'biru')}</span></p>
                            </div>
                        )}
                         {!jS && <p className="italic text-gray-500 dark:text-gray-400">Menunggu input dari Juri {idx+1}...</p>}
                    </div>
                ))}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

