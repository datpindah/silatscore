
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
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

// Structure from Juri page, ensure it's identical or compatible
interface ScoreEntry {
  points: 1 | 2;
  timestamp: Timestamp; // Firebase Timestamp
}

interface JuriRoundScores {
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

interface JuriMatchData {
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

// Helper type for combined score entry with juriId, used internally in Dewan-1
interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
}


export default function ScoringTandingDewanSatuPage() {
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  // State for each juri's full data
  const [juri1Scores, setJuri1Scores] = useState<JuriMatchData | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriMatchData | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriMatchData | null>(null);

  // State for confirmed scores after applying 2-out-of-3 logic
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effect to get the active schedule ID from app_settings
  useEffect(() => {
    setIsLoading(true); 
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const newActiveId = docSnap.data().activeScheduleId;
        if (newActiveId !== activeScheduleId) { 
          setActiveScheduleId(newActiveId);
          // Reset states that depend on activeScheduleId
          setMatchDetails(null);
          setPesilatMerahInfo(null);
          setPesilatBiruInfo(null);
          setTimerStatus(initialTimerStatus); // Reset timer for new match
          setJuri1Scores(null); // Reset juri scores for new match
          setJuri2Scores(null);
          setJuri3Scores(null);
          setConfirmedScoreMerah(0); // Reset confirmed scores
          setConfirmedScoreBiru(0);
          setError(null); // Clear previous errors
        } else if (!activeScheduleId && !newActiveId) {
            setIsLoading(false); 
            setError("Tidak ada jadwal pertandingan yang aktif.");
        }
      } else {
        setActiveScheduleId(null);
        setError("Tidak ada jadwal pertandingan yang aktif.");
        setMatchDetails(null);
        setPesilatMerahInfo(null);
        setPesilatBiruInfo(null);
        setTimerStatus(initialTimerStatus);
        setJuri1Scores(null);
        setJuri2Scores(null);
        setJuri3Scores(null);
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        setIsLoading(false); 
      }
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setIsLoading(false);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, [activeScheduleId]); // Rerun if activeScheduleId itself is changed

  // Effect to load match details, timer status, and subscribe to juri scores once activeScheduleId is known
  useEffect(() => {
    if (!activeScheduleId) {
      // If no active ID, ensure all related data is cleared and stop loading
      setMatchDetails(null); 
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setTimerStatus(initialTimerStatus);
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true); 
    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      try {
        // Fetch schedule details
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
        } else {
          setError(`Detail jadwal untuk ID ${activeScheduleId} tidak ditemukan.`);
          setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
          setIsLoading(false); // Stop loading if schedule details fail
          return;
        }

        // Listener for timer_status
        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            setTimerStatus(docSnap.data()?.timer_status as TimerStatus);
          } else {
            // If timer_status doesn't exist for a new match, initialize it in Firestore
            await setDoc(timerStatusDocRef, { timer_status: initialTimerStatus }, { merge: true });
            setTimerStatus(initialTimerStatus); // And set local state
          }
        }, (err) => {
          console.error("Error fetching timer status:", err);
          setError("Gagal memuat status timer.");
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
              juriSetters[index](null); 
            }
          }, (err) => {
            console.error(`Error fetching scores for ${juriId}:`, err);
            juriSetters[index](null);
          });
          unsubscribers.push(unsubJuri);
        });
        
      } catch (err) {
        console.error("Error loading match data:", err);
        setError("Gagal memuat data pertandingan.");
        setIsLoading(false); // Stop loading on general error
      }
      // setIsLoading(false) will be handled by the score processing useEffect
      // after it confirms data (or lack thereof) for juri scores.
    };

    loadData();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeScheduleId]); // This effect runs when activeScheduleId changes


  // Function to calculate confirmed score for a pesilat in a specific round
  // based on "2 out of 3 juri agreement within 2 seconds"
  const calculateConfirmedScoreForPesilat = useCallback((
    pesilatColor: 'merah' | 'biru',
    targetRound: 1 | 2 | 3, // Calculate for a specific round
    allJuriScoresData: (JuriMatchData | null)[]
  ): number => {
    const roundKey = `round${targetRound}` as keyof JuriRoundScores;
    let allEntriesForRound: CombinedScoreEntry[] = [];

    // Collect all score entries for the target round from all juris
    allJuriScoresData.forEach((juriData, index) => {
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
        `[Dewan-1] Filtering out malformed score entry for ${pesilatColor}, round ${targetRound}, juri ${entry?.juriId}: Score=${JSON.stringify(entry)}`
      );
      return false;
    });
    
    if (validEntriesForRound.length < 2) return 0; // Need at least 2 entries to form a pair

    // Sort entries by timestamp to process them chronologically
    validEntriesForRound.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    let confirmedPointsTotalForRound = 0;
    // Use a set to keep track of entry keys that have already contributed to a confirmed point
    // Key: "juriId_timestampMillis_pointsValue"
    const consumedEntryKeysForConfirmedPoints = new Set<string>(); 

    // Iterate through each valid entry as a potential start of an agreement ('e1')
    for (let i = 0; i < validEntriesForRound.length; i++) {
      const e1 = validEntriesForRound[i];
      const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;

      // If e1 has already been part of a confirmed point, skip it
      if (consumedEntryKeysForConfirmedPoints.has(e1Key)) continue;

      // Start a new potential agreement group with e1
      let confirmingJuriesForE1 = new Set<string>([e1.juriId]);
      let entriesInThisAgreement = new Set<string>([e1Key]); // Store keys of entries forming this potential point

      // Look for other entries ('e2') that agree with e1
      for (let j = i + 1; j < validEntriesForRound.length; j++) {
        const e2 = validEntriesForRound[j];
        const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;

        // If e2 is already used, or if e2 is from a juri already in this agreement group for e1, skip
        if (consumedEntryKeysForConfirmedPoints.has(e2Key) || confirmingJuriesForE1.has(e2.juriId)) continue;
        
        // If e2 is too far in time from e1 (more than 2s after), stop checking for this e1
        // (since entries are sorted, subsequent entries will also be too far)
        if (e2.timestamp.toMillis() - e1.timestamp.toMillis() > 2000) { 
           break; 
        }

        // If e2 has the same point value as e1, it's a match
        if (e1.points === e2.points) {
          confirmingJuriesForE1.add(e2.juriId);
          entriesInThisAgreement.add(e2Key);
        }
      }
      
      // If at least 2 juris agreed (e1 + at least one e2)
      if (confirmingJuriesForE1.size >= 2) {
        confirmedPointsTotalForRound += e1.points; // Add e1's point value
        // Mark all entries involved in this agreement as consumed
        entriesInThisAgreement.forEach(key => consumedEntryKeysForConfirmedPoints.add(key));
      }
    }
    return confirmedPointsTotalForRound;
  }, []);


  // Effect to calculate total confirmed scores whenever juri scores change or match details are loaded
  useEffect(() => {
    if (!activeScheduleId) {
      setConfirmedScoreMerah(0);
      setConfirmedScoreBiru(0);
      setIsLoading(false); 
      return;
    }

    const allJuriData = [juri1Scores, juri2Scores, juri3Scores];
    
    let totalMerahOverall = 0;
    let totalBiruOverall = 0;

    // Calculate scores for all rounds up to TOTAL_ROUNDS
    // Scores are confirmed per round and then summed up.
    for (let roundNum: 1 | 2 | 3 = 1; roundNum <= TOTAL_ROUNDS; roundNum = (roundNum + 1) as (1 | 2 | 3)) {
        totalMerahOverall += calculateConfirmedScoreForPesilat('merah', roundNum, allJuriData);
        totalBiruOverall += calculateConfirmedScoreForPesilat('biru', roundNum, allJuriData);
        if (roundNum === TOTAL_ROUNDS) break; 
    }

    setConfirmedScoreMerah(totalMerahOverall);
    setConfirmedScoreBiru(totalBiruOverall);
    
    // Determine if initial loading is complete.
    // Considered loaded if we have an active schedule ID, tried to load match details,
    // and the juri score listeners have had a chance to fire (even if they return null).
    if (matchDetails || error) { // If matchDetails are loaded, or an error occurred trying to load them
        setIsLoading(false);
    } else if (activeScheduleId && !matchDetails && !error) {
        setIsLoading(true); // Still waiting for matchDetails for the current activeScheduleId
    } else { // Default to not loading if no active ID
        setIsLoading(false); 
    }

  }, [juri1Scores, juri2Scores, juri3Scores, timerStatus, activeScheduleId, matchDetails, error, calculateConfirmedScoreForPesilat]);


  // Effect to handle the timer countdown and update Firestore
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(() => {
        (async () => {
          if (activeScheduleId) { 
            try {
              const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
              // Use the latest timer status from local state (which is updated by Firestore snapshot)
              const currentTimerSeconds = timerStatus.timerSeconds; 
              const newSeconds = Math.max(0, currentTimerSeconds - 1);
              
              let newMatchStatus = timerStatus.matchStatus;
              let newIsTimerRunning = timerStatus.isTimerRunning;

              if (newSeconds === 0) { // Timer reached zero
                  newIsTimerRunning = false;
                  newMatchStatus = `FinishedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'];
                  if (timerStatus.currentRound === TOTAL_ROUNDS) {
                    newMatchStatus = 'MatchFinished'; // Entire match finished
                  }
              }
              
              const updatedStatusForFirestore: Partial<TimerStatus> = {
                  timerSeconds: newSeconds,
                  isTimerRunning: newIsTimerRunning,
                  matchStatus: newMatchStatus,
              };
              // Update Firestore; local state will update via its onSnapshot listener
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


  // Function to update timer status in Firestore (for controls like start, pause, set babak)
  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      // Merge with current local state to ensure all fields are present if only partial updates are given
      const currentDBStatus = timerStatus || initialTimerStatus; 
      const newFullStatus = { ...currentDBStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
    } catch (e) {
      console.error("Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]);

  // Handler for timer control buttons (Start, Pause)
  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;

    if (action === 'start') {
      // Can only start if timer has seconds left and is not already running
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         updateTimerStatusInFirestore({ 
             isTimerRunning: true, 
             matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
         });
      }
    } else if (action === 'pause') {
      // Can only pause if timer is running
      if (timerStatus.isTimerRunning) {
        updateTimerStatusInFirestore({ 
            isTimerRunning: false, 
            matchStatus: `PausedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
        });
      }
    }
  };

  // Handler for selecting a babak
  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;
    
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
    // Setting a babak (re)sets its timer and pauses it
     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: ROUND_DURATION_SECONDS, 
      isTimerRunning: false, 
      matchStatus: 'Pending', // Or `PausedRound${round}` indicating ready but paused
    });
  };
  
  // Handler for "Babak Selanjutnya" or "Selesaikan Match" button
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus) return;

    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    // If current round is finished (timer is 0) or paused, and it's not the last round
    if (timerStatus.currentRound < TOTAL_ROUNDS && (timerStatus.timerSeconds === 0 || !timerStatus.isTimerRunning)) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS,
            isTimerRunning: false,
            matchStatus: 'Pending', 
        });
    } 
    // If current round is the last round and it's finished or paused
    else if (timerStatus.currentRound === TOTAL_ROUNDS && (timerStatus.timerSeconds === 0 || !timerStatus.isTimerRunning)) {
        if (timerStatus.timerSeconds > 0 && !confirm("Babak terakhir belum selesai (timer belum 0). Yakin ingin menyelesaikan pertandingan?")) {
            return;
        }
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
    }
  };

  // Handler for resetting the entire match
  const handleResetMatch = async () => {
    if (!activeScheduleId || !confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    setIsLoading(true);
    try {
        const batch = writeBatch(db);
        
        // Reset timer status in Firestore
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { timer_status: initialTimerStatus }, { merge: true });

        // Reset scores for all juri in Firestore
        const initialJuriScoresData = { 
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(),
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriScoresData); 
        });
        
        await batch.commit();
        // Local states will update via their onSnapshot listeners.
        // Explicitly set local timerStatus to ensure UI reflects reset immediately if needed,
        // though onSnapshot should handle it.
        setTimerStatus(initialTimerStatus);
        setConfirmedScoreBiru(0);
        setConfirmedScoreMerah(0);

        alert("Pertandingan telah direset.");
    } catch (e) {
        console.error("Error resetting match:", e);
        setError("Gagal mereset pertandingan.");
    } finally {
       // setIsLoading(false); // Firestore listeners should update state and loading status
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Loading state display
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

  // Display if no active schedule or error fetching details
   if (!activeScheduleId || (!matchDetails && !isLoading)) { 
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
  
  // Helper to get match status text for display
  const getMatchStatusText = () => {
    if (!timerStatus) return "Memuat status...";
    if (timerStatus.matchStatus.startsWith("OngoingRound")) return `Babak ${timerStatus.currentRound} Berlangsung`;
    if (timerStatus.matchStatus.startsWith("PausedRound")) return `Babak ${timerStatus.currentRound} Jeda`;
    if (timerStatus.matchStatus.startsWith("FinishedRound")) return `Babak ${timerStatus.currentRound} Selesai`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return "Menunggu Dimulai";
    return "Status Tidak Diketahui";
  };

  // Helpers to display raw scores from individual juris (for transparency)
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
  
  const nextButtonText = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai' : (timerStatus.currentRound < TOTAL_ROUNDS ? 'Babak Selanjutnya' : 'Selesaikan Match');
  const isNextActionDisabled = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || (timerStatus.matchStatus === 'Pending' && timerStatus.currentRound === 1) || (timerStatus.matchStatus.startsWith("FinishedRound") && timerStatus.currentRound === TOTAL_ROUNDS);
  const isTimerStartDisabled = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled = !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 font-body">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        {/* Top Bar Info Pertandingan */}
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-red-700 text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT</h1>
            {matchDetails && (
                <p className="text-xs md:text-sm">
                {matchDetails.place || "Gelanggang Utama"} | Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
                </p>
            )}
            {error && !isLoading && <p className="text-xs md:text-sm text-yellow-300 mt-1">Error Internal: {error}</p>}
          </CardContent>
        </Card>

        {/* Main Score Display and Timer/Round Controls */}
        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          {/* Pesilat Biru Score Box */}
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4">
                <CardTitle className="text-base md:text-xl font-semibold truncate font-headline">{pesilatBiruInfo?.name || 'PESILAT BIRU'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreBiru}</span>
              </CardContent>
            </Card>
          </div>

          {/* Timer and Round Controls (Center Column) */}
          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className="text-3xl md:text-5xl font-mono font-bold text-gray-800 dark:text-gray-200">{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${
                    timerStatus.currentRound === round 
                      ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent dark:ring-offset-gray-800 font-semibold' 
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  } ${ (timerStatus.isTimerRunning && timerStatus.currentRound !== round) || timerStatus.matchStatus === 'MatchFinished' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={(timerStatus.isTimerRunning && timerStatus.currentRound !== round) || timerStatus.matchStatus === 'MatchFinished'}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 md:mt-2 px-1 font-semibold">{getMatchStatusText()}</p>
          </div>

          {/* Pesilat Merah Score Box */}
          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-base md:text-xl font-semibold truncate font-headline">{pesilatMerahInfo?.name || 'PESILAT MERAH'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Control Buttons Panel */}
        <Card className="shadow-lg mb-4 bg-white dark:bg-gray-800">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
                <Button 
                    onClick={() => handleTimerControl('start')} 
                    disabled={isTimerStartDisabled}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 md:py-3 text-sm md:text-base"
                >
                  <Play className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Start
                </Button>
                <Button onClick={() => handleTimerControl('pause')} 
                        disabled={isTimerPauseDisabled}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-3 text-sm md:text-base">
                  <Pause className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Pause
                </Button>
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
               <Button variant="outline" asChild className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 col-span-2 sm:col-span-4">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 md:h-5 w-4 md:w-5" />
                  Keluar dari Panel Dewan
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

         {/* Juri Status and Raw Scores (for transparency) */}
         <Card className="mt-4 shadow-lg bg-white dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center text-gray-800 dark:text-gray-200">
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri & Skor Mentah (Detail per Juri)
                </CardTitle>
                 <CardDescription>Skor di bawah adalah input mentah dari tiap juri, skor utama di atas adalah yang terkonfirmasi.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {[juri1Scores, juri2Scores, juri3Scores].map((jS, idx) => (
                    <div key={`juri-status-${idx+1}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                        <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                        {jS && (
                            <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(jS, 'merah', 1)}] R2:[{getJuriScoreForDisplay(jS, 'merah', 2)}] R3:[{getJuriScoreForDisplay(jS, 'merah', 3)}] = <span className='font-semibold'>{getTotalJuriScoreForDisplay(jS, 'merah')}</span></p>
                                <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(jS, 'biru', 1)}] R2:[{getJuriScoreForDisplay(jS, 'biru', 2)}] R3:[{getJuriScoreForDisplay(jS, 'biru', 3)}] = <span className='font-semibold'>{getTotalJuriScoreForDisplay(jS, 'biru')}</span></p>
                                {jS.lastUpdated && <p className="text-gray-400 dark:text-gray-500 text-xxs">Update: {jS.lastUpdated.toDate().toLocaleTimeString()}</p>}
                            </div>
                        )}
                         {!jS && <p className="italic text-gray-500 dark:text-gray-400">Belum ada input dari Juri {idx+1} untuk pertandingan ini.</p>}
                    </div>
                ))}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

    