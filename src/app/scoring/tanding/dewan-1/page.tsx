
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

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface JuriScores {
  merah: { round1: number[], round2: number[], round3: number[] };
  biru: { round1: number[], round2: number[], round3: number[] };
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

export default function ScoringTandingDewanSatuPage() {
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  const [juri1Scores, setJuri1Scores] = useState<JuriScores | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriScores | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriScores | null>(null);

  const [aggregatedScoreMerah, setAggregatedScoreMerah] = useState(0);
  const [aggregatedScoreBiru, setAggregatedScoreBiru] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Listen for active schedule ID
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const newActiveId = docSnap.data().activeScheduleId;
        if (newActiveId !== activeScheduleId) {
          setActiveScheduleId(newActiveId);
          // Reset states for new match
          setMatchDetails(null);
          setPesilatMerahInfo(null);
          setPesilatBiruInfo(null);
          setTimerStatus(initialTimerStatus);
          setJuri1Scores(null);
          setJuri2Scores(null);
          setJuri3Scores(null);
          setAggregatedScoreMerah(0);
          setAggregatedScoreBiru(0);
          setError(null);
        }
      } else {
        setActiveScheduleId(null);
        setError("Tidak ada jadwal pertandingan yang aktif.");
      }
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setIsLoading(false);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, [activeScheduleId]); // Re-run if activeScheduleId is changed externally, though primary trigger is the snapshot

  // 2. Fetch match details and listen for timer & juri scores when activeScheduleId is set
  useEffect(() => {
    if (!activeScheduleId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let unsubMatchDetails = () => {};
    let unsubTimerStatus = () => {};
    let unsubJuri1 = () => {};
    let unsubJuri2 = () => {};
    let unsubJuri3 = () => {};

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
          setMatchDetails(null);
          return; // Stop if no schedule details
        }

        // Listen to timer_status
        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        unsubTimerStatus = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            setTimerStatus(docSnap.data()?.timer_status as TimerStatus);
          } else {
            // Initialize timer_status if it doesn't exist for this match
            await setDoc(timerStatusDocRef, { timer_status: initialTimerStatus }, { merge: true });
            setTimerStatus(initialTimerStatus);
          }
        }, (err) => {
          console.error("Error fetching timer status:", err);
          setError("Gagal memuat status timer.");
        });

        // Listen to Juri scores
        const juriIds = ['juri-1', 'juri-2', 'juri-3'];
        const setters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        
        juriIds.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          const unsub = onSnapshot(juriDocRef, (docSnap) => {
            if (docSnap.exists()) {
              setters[index](docSnap.data() as JuriScores);
            } else {
              setters[index](null); // Juri hasn't submitted scores yet or document doesn't exist
            }
          }, (err) => console.error(`Error fetching scores for ${juriId}:`, err));
          
          if (index === 0) unsubJuri1 = unsub;
          if (index === 1) unsubJuri2 = unsub;
          if (index === 2) unsubJuri3 = unsub;
        });
        
      } catch (err) {
        console.error("Error loading match data:", err);
        setError("Gagal memuat data pertandingan.");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      unsubMatchDetails();
      unsubTimerStatus();
      unsubJuri1();
      unsubJuri2();
      unsubJuri3();
    };
  }, [activeScheduleId]);

  // 3. Aggregate scores when Juri scores change
  useEffect(() => {
    const calculateTotal = (scores: JuriScores | null, color: 'merah' | 'biru') => {
      if (!scores) return 0;
      return (scores[color]?.round1?.reduce((a, b) => a + b, 0) || 0) +
             (scores[color]?.round2?.reduce((a, b) => a + b, 0) || 0) +
             (scores[color]?.round3?.reduce((a, b) => a + b, 0) || 0);
    };

    setAggregatedScoreMerah(
      calculateTotal(juri1Scores, 'merah') +
      calculateTotal(juri2Scores, 'merah') +
      calculateTotal(juri3Scores, 'merah')
    );
    setAggregatedScoreBiru(
      calculateTotal(juri1Scores, 'biru') +
      calculateTotal(juri2Scores, 'biru') +
      calculateTotal(juri3Scores, 'biru')
    );
  }, [juri1Scores, juri2Scores, juri3Scores]);


  // 4. Timer countdown logic
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        const newSeconds = timerStatus.timerSeconds - 1;
        const newTimerStatus: Partial<TimerStatus> = { timerSeconds: newSeconds };
        if (newSeconds === 0) {
          newTimerStatus.isTimerRunning = false;
          newTimerStatus.matchStatus = `FinishedRound${timerStatus.currentRound}`;
        }
        try {
            const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
            await setDoc(matchDocRef, { timer_status: { ...timerStatus, ...newTimerStatus } }, { merge: true });
        } catch (e) {
            console.error("Error updating timer in interval: ", e);
        }
      }, 1000);
    } else if (timerStatus.timerSeconds === 0 && timerStatus.isTimerRunning && activeScheduleId) {
      // This case should be handled by the newSeconds === 0 check above.
      // It's here as a safeguard but ideally won't be hit frequently.
        (async () => {
            try {
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                await setDoc(matchDocRef, { timer_status: { ...timerStatus, isTimerRunning: false, matchStatus: `FinishedRound${timerStatus.currentRound}` } }, { merge: true });
            } catch (e) {
                console.error("Error stopping timer at 0: ", e);
            }
        })();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, timerStatus.currentRound, activeScheduleId]);

  const updateTimerStatusInFirestore = useCallback(async (newStatus: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      await setDoc(matchDocRef, { timer_status: { ...timerStatus, ...newStatus } }, { merge: true });
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
        // If round ended and starting next, implicitly go to next round
        handleSetBabak((timerStatus.currentRound + 1) as 1 | 2 | 3, true); // true to auto-start
      } else {
        updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: `OngoingRound${timerStatus.currentRound}` });
      }
    } else if (action === 'pause') {
      updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: `PausedRound${timerStatus.currentRound}` });
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
      isTimerRunning: autoStartTimer, // Auto start if coming from next round logic
      matchStatus: autoStartTimer ? `OngoingRound${round}` : `Pending`, // Or 'Pending' if not auto-starting
    });
  };
  
  const handleResetMatch = async () => {
    if (!activeScheduleId || !confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    try {
        const batch = writeBatch(db);
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { timer_status: initialTimerStatus }, { merge: true });

        // Reset Juri scores
        const juriIds = ['juri-1', 'juri-2', 'juri-3'];
        const initialJuriScoresData = {
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(),
        };
        juriIds.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriScoresData);
        });
        
        await batch.commit();
        setTimerStatus(initialTimerStatus); // Update local state
        // Local juri scores will update via snapshot listeners
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
    return <div className="flex flex-col min-h-screen"><Header /><main className="flex-1 container mx-auto p-8 text-center">Memuat data Dewan...</main></div>;
  }
  if (error) {
     return <div className="flex flex-col min-h-screen"><Header /><main className="flex-1 container mx-auto p-8 text-center text-red-500">{error}</main></div>;
  }
  if (!activeScheduleId || !matchDetails) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title="Scoring Tanding - Dewan Kontrol" description="Tidak ada pertandingan yang aktif atau detail tidak ditemukan.">
            <Button variant="outline" asChild>
              <Link href="/scoring/tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT</h1>
            <p className="text-xs md:text-sm">
              {matchDetails.place || "Gelanggang Utama"} | {matchDetails.round} | {matchDetails.class}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          {/* Pesilat Biru (Kiri) */}
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4">
                <CardTitle className="text-sm md:text-xl font-semibold truncate">{pesilatBiruInfo?.name || 'Pesilat Biru'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{aggregatedScoreBiru}</span>
              </CardContent>
            </Card>
          </div>

          {/* Kontrol Tengah */}
          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className="text-3xl md:text-5xl font-mono font-bold text-gray-800">{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto ${timerStatus.currentRound === round ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={timerStatus.isTimerRunning && timerStatus.currentRound !== round}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 mt-1 md:mt-2 px-1">{getMatchStatusText()}</p>
          </div>

          {/* Pesilat Merah (Kanan) */}
          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-sm md:text-xl font-semibold truncate">{pesilatMerahInfo?.name || 'Pesilat Merah'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{aggregatedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <Card className="shadow-lg">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
              {!timerStatus.isTimerRunning ? (
                <Button 
                    onClick={() => handleTimerControl('start')} 
                    disabled={timerStatus.matchStatus === 'MatchFinished' || (timerStatus.timerSeconds === 0 && timerStatus.currentRound >= TOTAL_ROUNDS && timerStatus.matchStatus !== `FinishedRound${TOTAL_ROUNDS}`)}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 md:py-3 text-sm md:text-base"
                >
                  <Play className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Start
                </Button>
              ) : (
                <Button onClick={() => handleTimerControl('pause')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-3 text-sm md:text-base">
                  <Pause className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Pause
                </Button>
              )}
              <Button 
                onClick={() => handleSetBabak( (timerStatus.currentRound % TOTAL_ROUNDS + 1) as 1 | 2 | 3, false )}
                disabled={timerStatus.isTimerRunning || timerStatus.currentRound >= TOTAL_ROUNDS || timerStatus.matchStatus === 'MatchFinished'}
                variant="outline"
                className="w-full py-2 md:py-3 text-sm md:text-base"
              >
                Babak Selanjutnya <ChevronRight className="ml-1 h-4 md:h-5 w-4 md:w-5" />
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
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri & Skor Detail
                </CardTitle>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {[juri1Scores, juri2Scores, juri3Scores].map((jS, idx) => (
                    <div key={`juri-status-${idx+1}`} className="border p-2 md:p-3 rounded-md bg-gray-50">
                        <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600">Belum ada skor</span>}</p>
                        {jS && (
                            <div className="space-y-0.5">
                                <p>Merah: R1[{jS.merah.round1.join(',')||'-'}] R2[{jS.merah.round2.join(',')||'-'}] R3[{jS.merah.round3.join(',')||'-'}] = { (jS.merah.round1.reduce((a,b)=>a+b,0) + jS.merah.round2.reduce((a,b)=>a+b,0) + jS.merah.round3.reduce((a,b)=>a+b,0)) }</p>
                                <p>Biru: R1[{jS.biru.round1.join(',')||'-'}] R2[{jS.biru.round2.join(',')||'-'}] R3[{jS.biru.round3.join(',')||'-'}] = { (jS.biru.round1.reduce((a,b)=>a+b,0) + jS.biru.round2.reduce((a,b)=>a+b,0) + jS.biru.round3.reduce((a,b)=>a+b,0)) }</p>
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

