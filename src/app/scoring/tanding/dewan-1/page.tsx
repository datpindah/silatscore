
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower } from 'lucide-react';
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
  timestamp: Timestamp;
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
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const newActiveId = docSnap.data().activeScheduleId;
        if (newActiveId !== activeScheduleId) {
          setActiveScheduleId(newActiveId);
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
        }
      } else {
        setActiveScheduleId(null);
        setError("Tidak ada jadwal pertandingan yang aktif.");
      }
      setIsLoading(activeScheduleId !== null); // isLoading is true if we have an id but not yet data
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setIsLoading(false);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, [activeScheduleId]);

  useEffect(() => {
    if (!activeScheduleId) {
      setIsLoading(false);
      setMatchDetails(null); // Clear details if no active ID
      return;
    }

    setIsLoading(true);
    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
        } else {
          setError(`Detail jadwal untuk ID ${activeScheduleId} tidak ditemukan.`);
          setMatchDetails(null);
          setIsLoading(false);
          return;
        }

        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            setTimerStatus(docSnap.data()?.timer_status as TimerStatus);
          } else {
            await setDoc(timerStatusDocRef, { timer_status: initialTimerStatus }, { merge: true });
            setTimerStatus(initialTimerStatus);
          }
        }, (err) => {
          console.error("Error fetching timer status:", err);
          setError("Gagal memuat status timer.");
        });
        unsubscribers.push(unsubTimer);
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (docSnap.exists()) {
              juriSetters[index](docSnap.data() as JuriMatchData);
            } else {
              juriSetters[index](null);
            }
          }, (err) => console.error(`Error fetching scores for ${juriId}:`, err));
          unsubscribers.push(unsubJuri);
        });
        
      } catch (err) {
        console.error("Error loading match data:", err);
        setError("Gagal memuat data pertandingan.");
      } finally {
        // setIsLoading(false); // Moved to juri score processing effect
      }
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
      if (juriData) {
        const juriId = JURI_IDS[index];
        const scoresToAdd = juriData[pesilatColor]?.[roundKey] || [];
        scoresToAdd.forEach(score => {
          allEntriesForRound.push({ ...score, juriId });
        });
      }
    });

    if (allEntriesForRound.length < 2) return 0;

    allEntriesForRound.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    let confirmedPointsTotal = 0;
    const usedEntriesIndices = new Set<string>(); // Store as "juriId_timestampMillis_points"

    for (let i = 0; i < allEntriesForRound.length; i++) {
      const e1 = allEntriesForRound[i];
      const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;
      if (usedEntriesIndices.has(e1Key)) continue;

      let confirmingJuries = new Set<string>([e1.juriId]);
      let tempUsedEntries = new Set<string>([e1Key]);

      for (let j = i + 1; j < allEntriesForRound.length; j++) {
        const e2 = allEntriesForRound[j];
        const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;

        if (usedEntriesIndices.has(e2Key) || confirmingJuries.has(e2.juriId)) continue;
        if (e2.timestamp.toMillis() - e1.timestamp.toMillis() > 2000) break; // Outside 2s window from e1

        if (e1.points === e2.points) {
          confirmingJuries.add(e2.juriId);
          tempUsedEntries.add(e2Key);
        }
      }
      
      if (confirmingJuries.size >= 2) {
        confirmedPointsTotal += e1.points;
        tempUsedEntries.forEach(key => usedEntriesIndices.add(key));
      }
    }
    return confirmedPointsTotal;
  }, []);


  useEffect(() => {
    if (!activeScheduleId || !timerStatus) {
      setConfirmedScoreMerah(0);
      setConfirmedScoreBiru(0);
      setIsLoading(!!activeScheduleId); // if activeScheduleId exists, but no timer/juri data, still loading
      return;
    }
    
    const allJuriData = [juri1Scores, juri2Scores, juri3Scores];
    
    let totalMerah = 0;
    let totalBiru = 0;

    for (let round: 1 | 2 | 3 = 1; round <= TOTAL_ROUNDS; round = (round + 1) as (1 | 2 | 3)) {
        totalMerah += calculateConfirmedScoreForPesilat('merah', round, allJuriData);
        totalBiru += calculateConfirmedScoreForPesilat('biru', round, allJuriData);
        if (round === TOTAL_ROUNDS) break; // Ensure loop terminates correctly for TS
    }

    setConfirmedScoreMerah(totalMerah);
    setConfirmedScoreBiru(totalBiru);
    
    // Set loading to false if we have an active schedule, timer status, and juri data (even if null)
    // This means initial fetch attempt for all primary data sources is complete.
    if (activeScheduleId && timerStatus && allJuriData.every(data => data !== undefined) ) {
        setIsLoading(false);
    }

  }, [juri1Scores, juri2Scores, juri3Scores, timerStatus, activeScheduleId, calculateConfirmedScoreForPesilat]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        setTimerStatus(prevStatus => {
            const newSeconds = prevStatus.timerSeconds - 1;
            let newMatchStatus = prevStatus.matchStatus;
            let newIsTimerRunning = prevStatus.isTimerRunning;

            if (newSeconds === 0) {
                newIsTimerRunning = false;
                newMatchStatus = `FinishedRound${prevStatus.currentRound}` as TimerStatus['matchStatus'];
            }
            
            const updatedStatus = {
                ...prevStatus,
                timerSeconds: newSeconds,
                isTimerRunning: newIsTimerRunning,
                matchStatus: newMatchStatus,
            };
            
            // Async operation to update Firestore, separated from state update
            (async () => {
                if (activeScheduleId) {
                    try {
                        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                        // Only update changed fields to avoid race conditions if other fields are updated elsewhere
                        await setDoc(matchDocRef, { timer_status: updatedStatus }, { merge: true });
                    } catch (e) {
                        console.error("Error updating timer in interval: ", e);
                    }
                }
            })();
            return updatedStatus; // Return new state for React
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, activeScheduleId]); // Removed timerStatus.currentRound as dependency for setInterval

  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      // Fetch current timer_status from Firestore or use local state as base
      const currentDBStatus = timerStatus || initialTimerStatus;
      const newFullStatus = { ...currentDBStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // setTimerStatus(newFullStatus); // Local state will update via onSnapshot
    } catch (e) {
      console.error("Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]);

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || timerStatus.matchStatus === 'MatchFinished') return;

    if (action === 'start') {
      if (timerStatus.timerSeconds === 0 && timerStatus.currentRound >= TOTAL_ROUNDS) {
         updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false});
         return;
      }
      if (timerStatus.timerSeconds === 0 && timerStatus.currentRound < TOTAL_ROUNDS) {
        handleSetBabak((timerStatus.currentRound + 1) as 1 | 2 | 3, true);
      } else {
        updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] });
      }
    } else if (action === 'pause') {
      updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: `PausedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] });
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3, autoStartTimer = false) => {
    if (!activeScheduleId || timerStatus.matchStatus === 'MatchFinished') return;
    if (timerStatus.isTimerRunning && timerStatus.currentRound !== round && !confirm("Timer sedang berjalan. Yakin ingin pindah babak? Timer akan direset.")) {
        return;
    }

    updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: ROUND_DURATION_SECONDS,
      isTimerRunning: autoStartTimer,
      matchStatus: autoStartTimer ? `OngoingRound${round}` as TimerStatus['matchStatus'] : `Pending`,
    });
  };
  
  const handleResetMatch = async () => {
    if (!activeScheduleId || !confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    try {
        const batch = writeBatch(db);
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { timer_status: initialTimerStatus }, { merge: true });

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
        // States will update via onSnapshot listeners
        alert("Pertandingan telah direset.");
    } catch (e) {
        console.error("Error resetting match:", e);
        setError("Gagal mereset pertandingan.");
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return <div className="flex flex-col min-h-screen"><Header /><main className="flex-1 container mx-auto p-8 text-center">Memuat data Dewan Kontrol...</main></div>;
  }
  if (error && !activeScheduleId) { // Only show critical error if no active schedule ID
     return <div className="flex flex-col min-h-screen"><Header /><main className="flex-1 container mx-auto p-8 text-center text-red-500">{error}</main></div>;
  }
   if (!activeScheduleId || !matchDetails) { // If no active schedule or details failed to load after attempt
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title="Scoring Tanding - Dewan Kontrol" description={error || "Tidak ada pertandingan yang aktif atau detail tidak ditemukan."}>
            <Button variant="outline" asChild>
              <Link href="/admin/schedule-tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Atur Jadwal</Link>
            </Button>
          </PageTitle>
           <Card className="mt-6"><CardContent className="p-6 text-center"><p>Silakan aktifkan jadwal pertandingan di halaman Admin.</p></CardContent></Card>
        </main>
      </div>
    );
  }
  
  const getMatchStatusText = () => {
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
    return scores.length > 0 ? scores.join(',') : '-';
  };

  const getTotalJuriScoreForDisplay = (juriData: JuriMatchData | null, pesilatColor: 'merah' | 'biru') => {
    if (!juriData) return 0;
    let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        juriData[pesilatColor]?.[roundKey]?.forEach(s => total += s.points);
    });
    return total;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT</h1>
            <p className="text-xs md:text-sm">
              {matchDetails.place || "Gelanggang Utama"} | Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
            </p>
            {error && <p className="text-xs md:text-sm text-yellow-300 mt-1">Error: {error}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4">
                <CardTitle className="text-sm md:text-xl font-semibold truncate">{pesilatBiruInfo?.name || 'Pesilat Biru'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreBiru}</span>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className="text-3xl md:text-5xl font-mono font-bold text-gray-800">{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto ${timerStatus.currentRound === round ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={(timerStatus.isTimerRunning && timerStatus.currentRound !== round) || timerStatus.matchStatus === 'MatchFinished'}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 mt-1 md:mt-2 px-1">{getMatchStatusText()}</p>
          </div>

          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-sm md:text-xl font-semibold truncate">{pesilatMerahInfo?.name || 'Pesilat Merah'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <Card className="shadow-lg mb-4">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
              {!timerStatus.isTimerRunning && timerStatus.matchStatus !== 'MatchFinished' && timerStatus.timerSeconds > 0 ? (
                <Button 
                    onClick={() => handleTimerControl('start')} 
                    disabled={timerStatus.matchStatus === 'MatchFinished' || (timerStatus.timerSeconds === 0 && timerStatus.currentRound >= TOTAL_ROUNDS && !timerStatus.matchStatus.startsWith(`FinishedRound${TOTAL_ROUNDS}`))}
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
                onClick={() => {
                    if (timerStatus.currentRound < TOTAL_ROUNDS) {
                        handleSetBabak((timerStatus.currentRound + 1) as 1 | 2 | 3, false);
                    } else if (timerStatus.currentRound === TOTAL_ROUNDS && !timerStatus.isTimerRunning && timerStatus.timerSeconds === 0) {
                        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false });
                    }
                }}
                disabled={
                    timerStatus.isTimerRunning || 
                    timerStatus.matchStatus === 'MatchFinished' ||
                    (timerStatus.currentRound === TOTAL_ROUNDS && (timerStatus.isTimerRunning || timerStatus.timerSeconds > 0))
                }
                variant="outline"
                className="w-full py-2 md:py-3 text-sm md:text-base"
              >
                {timerStatus.currentRound < TOTAL_ROUNDS ? 'Babak Selanjutnya' : 'Selesaikan Match'} <ChevronRight className="ml-1 h-4 md:h-5 w-4 md:w-5" />
              </Button>
              <Button onClick={handleResetMatch} variant="destructive" className="w-full py-2 md:py-3 text-sm md:text-base">
                <RotateCcw className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Reset Match
              </Button>
               <Button variant="outline" asChild className="w-full py-2 md:py-3 text-sm md:text-base">
                <Link href="/scoring/tanding">
                  <ArrowLeft className="mr-2 h-4 md:h-5 w-4 md:w-5" />
                  Kembali
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
         <Card className="mt-4 shadow-lg">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center">
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri & Skor Mentah Detail
                </CardTitle>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {[juri1Scores, juri2Scores, juri3Scores].map((jS, idx) => (
                    <div key={`juri-status-${idx+1}`} className="border p-2 md:p-3 rounded-md bg-gray-50">
                        <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600">Belum ada data</span>}</p>
                        {jS && (
                            <div className="space-y-0.5">
                                <p>Merah: R1[{getJuriScoreForDisplay(jS, 'merah', 1)}] R2[{getJuriScoreForDisplay(jS, 'merah', 2)}] R3[{getJuriScoreForDisplay(jS, 'merah', 3)}] = {getTotalJuriScoreForDisplay(jS, 'merah')}</p>
                                <p>Biru: R1[{getJuriScoreForDisplay(jS, 'biru', 1)}] R2[{getJuriScoreForDisplay(jS, 'biru', 2)}] R3[{getJuriScoreForDisplay(jS, 'biru', 3)}] = {getTotalJuriScoreForDisplay(jS, 'biru')}</p>
                            </div>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}


    