
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { cn } from '@/lib/utils';

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

interface JuriMatchDataWithId extends JuriMatchData {
  juriId: string;
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

interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
}

interface ConfirmedScoreResult {
  score: number;
  contributingEntryKeys: Set<string>; 
}


export default function ScoringTandingDewanSatuPage() {
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  const [juri1Scores, setJuri1Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriMatchDataWithId | null>(null);

  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  const [allContributingEntryKeys, setAllContributingEntryKeys] = useState<Set<string>>(new Set());
  const [prevSavedConfirmedKeys, setPrevSavedConfirmedKeys] = useState<Set<string>>(new Set());
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true); 
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newActiveId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newActiveId !== activeScheduleId) { 
        setActiveScheduleId(newActiveId);
        // Reset dependent states when activeScheduleId changes
        setMatchDetails(null);
        setPesilatMerahInfo(null);
        setPesilatBiruInfo(null);
        setTimerStatus(initialTimerStatus); 
        setJuri1Scores(null); 
        setJuri2Scores(null);
        setJuri3Scores(null);
        setConfirmedScoreMerah(0); 
        setConfirmedScoreBiru(0);
        setAllContributingEntryKeys(new Set());
        setPrevSavedConfirmedKeys(new Set());
        setError(null); 
      } else if (!activeScheduleId && !newActiveId) {
          setIsLoading(false); 
          setError("Tidak ada jadwal pertandingan yang aktif.");
      }
    }, (err) => {
      console.error("[Dewan-1] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setIsLoading(false);
      setActiveScheduleId(null);
    });
    return () => unsub();
  }, [activeScheduleId]); 

  useEffect(() => {
    if (!activeScheduleId) {
      setMatchDetails(null); 
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setTimerStatus(initialTimerStatus);
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set());
      setPrevSavedConfirmedKeys(new Set());
      setIsLoading(false);
      if (error !== "Tidak ada jadwal pertandingan yang aktif." && error !== "Gagal memuat konfigurasi jadwal aktif.") {
        setError("Tidak ada jadwal pertandingan yang aktif.");
      }
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
          setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
          setIsLoading(false); 
          return;
        }

        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) {
              setTimerStatus(data.timer_status as TimerStatus);
            }
            if (data?.confirmed_entry_keys_log) {
              const firestoreKeys = new Set(data.confirmed_entry_keys_log as string[]);
              setPrevSavedConfirmedKeys(firestoreKeys); // Keep track of what's in Firestore
              // Only update allContributingEntryKeys if it's meant to be directly from Firestore,
              // otherwise it's calculated locally. If it is calculated locally, this line might be redundant or cause issues.
              // For now, assume local calculation based on juri scores is the primary driver.
            } else {
              setPrevSavedConfirmedKeys(new Set());
            }
          } else {
            const initialDataForMatch = { 
                timer_status: initialTimerStatus,
                confirmed_entry_keys_log: [] 
            };
            try {
              await setDoc(timerStatusDocRef, initialDataForMatch, { merge: true });
              setTimerStatus(initialTimerStatus); 
              setPrevSavedConfirmedKeys(new Set());
            } catch (setErr) {
              console.error("[Dewan-1] Error initializing match document:", setErr);
              setError("Gagal menginisialisasi data pertandingan.");
            }
          }
        }, (err) => {
          console.error("[Dewan-1] Error fetching timer status/confirmed keys:", err);
          setError("Gagal memuat status timer atau kunci skor.");
        });
        unsubscribers.push(unsubTimer);
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (docSnap.exists()) {
              juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              juriSetters[index](null); 
            }
          }, (err) => {
            console.error(`[Dewan-1] Error fetching scores for ${juriId}:`, err);
            juriSetters[index](null);
          });
          unsubscribers.push(unsubJuri);
        });
        
      } catch (err) {
        console.error("[Dewan-1] Error in loadData function:", err);
        setError("Gagal memuat data pertandingan.");
      } finally {
        // setIsLoading(false) will be handled by the score calculation useEffect
      }
    };

    loadData();

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeScheduleId]); 


  const calculateConfirmedScoreForPesilat = useCallback((
    pesilatColor: 'merah' | 'biru',
    targetRound: 1 | 2 | 3, 
    allJuriScoresData: (JuriMatchDataWithId | null)[]
  ): ConfirmedScoreResult => {
    const roundKey = `round${targetRound}` as keyof JuriRoundScores;
    let allEntriesForRound: CombinedScoreEntry[] = [];

    allJuriScoresData.forEach((juriCompleteData) => {
      if (juriCompleteData && juriCompleteData[pesilatColor] && juriCompleteData[pesilatColor][roundKey]) {
        const juriId = juriCompleteData.juriId;
        const scoresForRoundByJuri: ScoreEntry[] = juriCompleteData[pesilatColor][roundKey];
        scoresForRoundByJuri.forEach(score => {
          allEntriesForRound.push({ ...score, juriId });
        });
      }
    });
        
    const validEntriesForRound = allEntriesForRound.filter(entry => 
      entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function'
    );
    
    if (validEntriesForRound.length < 2) { 
      return { score: 0, contributingEntryKeys: new Set() };
    }

    validEntriesForRound.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    let confirmedPointsTotalForRound = 0;
    const consumedEntryKeysForConfirmedPoints = new Set<string>(); 
    const contributingEntryKeysThisRound = new Set<string>(); 

    for (let i = 0; i < validEntriesForRound.length; i++) {
      const e1 = validEntriesForRound[i];
      const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;
      
      if (consumedEntryKeysForConfirmedPoints.has(e1Key)) {
        continue;
      }

      let confirmingJuriesForE1 = new Set<string>([e1.juriId]); 
      let entriesInThisAgreement = new Set<string>([e1Key]); 

      for (let j = i + 1; j < validEntriesForRound.length; j++) {
        const e2 = validEntriesForRound[j];
        const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;

        if (consumedEntryKeysForConfirmedPoints.has(e2Key)) {
          continue;
        }
        if (confirmingJuriesForE1.has(e2.juriId)) { 
            continue;
        }
        
        const timeDifference = Math.abs(e2.timestamp.toMillis() - e1.timestamp.toMillis());
        
        if (timeDifference > 2000) { 
           break; 
        }

        if (e1.points === e2.points) {
          confirmingJuriesForE1.add(e2.juriId);
          entriesInThisAgreement.add(e2Key);
        }
      }
      
      if (confirmingJuriesForE1.size >= 2) {
        confirmedPointsTotalForRound += e1.points; 
        entriesInThisAgreement.forEach(key => {
            consumedEntryKeysForConfirmedPoints.add(key);
            contributingEntryKeysThisRound.add(key);
        });
      }
    }
    return { score: confirmedPointsTotalForRound, contributingEntryKeys: contributingEntryKeysThisRound };
  }, []);


  useEffect(() => {
    if (!activeScheduleId) {
      setConfirmedScoreMerah(0);
      setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set());
      // No need to update prevSavedConfirmedKeys here, it's for Firestore comparison
      setIsLoading(false); 
      return;
    }

    const allJuriData = [juri1Scores, juri2Scores, juri3Scores];
        
    let totalMerahOverall = 0;
    let totalBiruOverall = 0;
    const newAllContributingKeys = new Set<string>();

    for (let roundNum: 1 | 2 | 3 = 1; roundNum <= TOTAL_ROUNDS; roundNum = (roundNum + 1) as (1 | 2 | 3)) {
        const merahResult = calculateConfirmedScoreForPesilat('merah', roundNum, allJuriData);
        totalMerahOverall += merahResult.score;
        merahResult.contributingEntryKeys.forEach(key => newAllContributingKeys.add(key));
        
        const biruResult = calculateConfirmedScoreForPesilat('biru', roundNum, allJuriData);
        totalBiruOverall += biruResult.score;
        biruResult.contributingEntryKeys.forEach(key => newAllContributingKeys.add(key));

        if (roundNum === TOTAL_ROUNDS) break; 
    }

    setConfirmedScoreMerah(totalMerahOverall);
    setConfirmedScoreBiru(totalBiruOverall);
    setAllContributingEntryKeys(newAllContributingKeys);

    if (activeScheduleId) {
      const newKeysArray = Array.from(newAllContributingKeys);
      
      let changed = newKeysArray.length !== prevSavedConfirmedKeys.size;
      if (!changed && newKeysArray.length > 0) { 
        for (const key of newKeysArray) {
          if (!prevSavedConfirmedKeys.has(key)) {
            changed = true;
            break;
          }
        }
        if(!changed){ 
             for(const key of Array.from(prevSavedConfirmedKeys)){
                 if(!newAllContributingKeys.has(key)){
                     changed = true;
                     break;
                 }
             }
        }
      }

      if (changed) {
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        updateDoc(matchDocRef, { confirmed_entry_keys_log: newKeysArray })
          .then(() => {
            setPrevSavedConfirmedKeys(new Set(newKeysArray)); 
          })
          .catch(e => console.error("[Dewan-1] Error updating confirmed_entry_keys_log: ", e));
      }
    }
    
    // Determine loading state
    if (juri1Scores !== null || juri2Scores !== null || juri3Scores !== null || (matchDetails && activeScheduleId) || error) {
        setIsLoading(false);
    } else if (activeScheduleId && !matchDetails && !error) {
        setIsLoading(true); 
    } else { 
        setIsLoading(false); 
    }

  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetails, error, calculateConfirmedScoreForPesilat, prevSavedConfirmedKeys]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => { 
        if (activeScheduleId) { 
            try {
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                const currentDBDoc = await getDoc(matchDocRef); 
                
                if (!currentDBDoc.exists()) {
                    if(interval) clearInterval(interval); 
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) { 
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); 
                    if(interval) clearInterval(interval);
                    return;
                }

                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false; 
                    newMatchStatus = `FinishedRound${currentDBTimerStatus.currentRound}` as TimerStatus['matchStatus'];
                    if (currentDBTimerStatus.currentRound === TOTAL_ROUNDS) {
                        newMatchStatus = 'MatchFinished';
                    }
                }
                
                const updatedStatusForFirestore: TimerStatus = {
                    ...currentDBTimerStatus, 
                    timerSeconds: newSeconds,
                    isTimerRunning: newIsTimerRunning,
                    matchStatus: newMatchStatus,
                };
                                
                await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
            } catch (e) {
                console.error("[Dewan-1] Error updating timer in interval: ", e);
            }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, activeScheduleId]);


  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status 
                                   ? docSnap.data()?.timer_status as TimerStatus 
                                   : timerStatus; 
      
      const newFullStatus = { ...currentDBTimerStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
    } catch (e) {
      console.error("[Dewan-1] Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); 

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;
    if (action === 'start') {
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         updateTimerStatusInFirestore({ 
             isTimerRunning: true, 
             matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
         });
      }
    } else if (action === 'pause') {
      if (timerStatus.isTimerRunning) {
        updateTimerStatusInFirestore({ 
            isTimerRunning: false, 
            matchStatus: `PausedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
        });
      }
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished') return;
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: ROUND_DURATION_SECONDS, 
      isTimerRunning: false, 
      matchStatus: (timerStatus.matchStatus.startsWith('FinishedRound') && timerStatus.currentRound > round) 
                   ? `FinishedRound${round}` as TimerStatus['matchStatus'] 
                   : 'Pending', 
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus) return;
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    if (timerStatus.timerSeconds > 0 && timerStatus.currentRound < TOTAL_ROUNDS && !timerStatus.matchStatus.startsWith(`FinishedRound${timerStatus.currentRound}`)) {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0). Yakin ingin lanjut ke babak berikutnya?`)) {
            return;
        }
    }

    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS,
            isTimerRunning: false,
            matchStatus: 'Pending', 
        });
    } 
    else if (timerStatus.currentRound === TOTAL_ROUNDS) {
        if (timerStatus.timerSeconds > 0 && !timerStatus.matchStatus.startsWith(`FinishedRound${TOTAL_ROUNDS}`)) {
            if (!confirm("Babak terakhir belum selesai (timer belum 0). Yakin ingin menyelesaikan pertandingan?")) {
                return;
            }
        }
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
    }
  };

  const handleResetMatch = async () => {
    if (!activeScheduleId || !confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;
    setIsLoading(true);
    try {
        const batch = writeBatch(db);
        
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { 
            timer_status: initialTimerStatus,
            confirmed_entry_keys_log: [] 
        }, { merge: true });

        const initialJuriDataContent: JuriMatchData = { 
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(),
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriDataContent); 
        });
        
        await batch.commit();
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        setAllContributingEntryKeys(new Set());
        setPrevSavedConfirmedKeys(new Set());
        // Local state updates for scores and timer will be triggered by onSnapshot listeners
        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error("[Dewan-1] Error resetting match:", e);
      setError("Gagal mereset pertandingan.");
    } finally {
        setIsLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getMatchStatusText = (): string => {
    if (!timerStatus) return "Memuat status...";
    if (timerStatus.matchStatus.startsWith("OngoingRound")) return `Babak ${timerStatus.currentRound} Berlangsung`;
    if (timerStatus.matchStatus.startsWith("PausedRound")) return `Babak ${timerStatus.currentRound} Jeda`;
    if (timerStatus.matchStatus.startsWith("FinishedRound")) return `Babak ${timerStatus.currentRound} Selesai`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return `Babak ${timerStatus.currentRound} Menunggu`;
    return "Status Tidak Diketahui";
  };

  const getJuriScoreForDisplay = (
    juriId: string,
    juriData: JuriMatchDataWithId | null,
    pesilatColor: 'merah' | 'biru',
    round: 1 | 2 | 3
  ): React.ReactNode => {
    if (!juriData) return '-';
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';
    
    const now = Date.now();

    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        entryTimestampMillis = now; 
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isContributing = allContributingEntryKeys.has(entryKey);
      const isGracePeriod = (now - entryTimestampMillis) <= 2000; // 2 second grace period

      const shouldStrike = !isContributing && !isGracePeriod;

      return (
        <span key={`${juriId}-${round}-${pesilatColor}-${index}-${entryTimestampMillis}`} className={cn(shouldStrike && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ', '}{curr}</>, <></>);
  };

  const getTotalJuriRawScoreForDisplay = (juriData: JuriMatchDataWithId | null, pesilatColor: 'merah' | 'biru'): number => {
    if (!juriData) return 0;
    let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        const scoresForRound = juriData[pesilatColor]?.[roundKey];
        if (scoresForRound && Array.isArray(scoresForRound)) {
            scoresForRound.forEach(s => {
                if (s && typeof s.points === 'number') {
                    total += s.points;
                }
            });
        }
    });
    return total;
  };
  
  if (isLoading && !activeScheduleId && !error) { // Initial loading before activeScheduleId is known
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat konfigurasi Dewan Kontrol...</p>
            </main>
        </div>
    );
  }
  
  if (isLoading && activeScheduleId) { // Loading match data after activeScheduleId is known
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat data pertandingan...</p>
                {matchDetails && <p className="text-sm text-muted-foreground">Partai: {matchDetails.pesilatMerahName} vs {matchDetails.pesilatBiruName}</p>}
                {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
            </main>
        </div>
    );
  }

   if (!activeScheduleId && !isLoading) { 
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
  
  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai' : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');
  
  const isNextActionDisabled: boolean = 
    timerStatus.isTimerRunning || 
    timerStatus.matchStatus === 'MatchFinished' ||
    (timerStatus.matchStatus.startsWith("OngoingRound")) || 
    (timerStatus.matchStatus === `FinishedRound${TOTAL_ROUNDS}`);


  const isTimerStartDisabled: boolean = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled: boolean = !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isBabakButtonDisabled = (round: number): boolean => 
    timerStatus.isTimerRunning || 
    timerStatus.matchStatus === 'MatchFinished' ||
    timerStatus.matchStatus.startsWith('OngoingRound') ||
    (timerStatus.matchStatus.startsWith('FinishedRound') && timerStatus.currentRound < round && parseInt(timerStatus.matchStatus.replace('FinishedRound','')) < round) ;

  const juriDataArray = [juri1Scores, juri2Scores, juri3Scores];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 font-body">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
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

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
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
                  } ${ isBabakButtonDisabled(round) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={isBabakButtonDisabled(round)}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 md:mt-2 px-1 font-semibold">{getMatchStatusText()}</p>
          </div>

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

         <Card className="mt-4 shadow-lg bg-white dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center text-gray-800 dark:text-gray-200">
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri &amp; Skor Mentah (Detail per Juri)
                </CardTitle>
                 <CardDescription>Skor di bawah adalah input mentah. Skor dicoret jika usianya &gt;2 detik &amp; tidak terkonfirmasi oleh min. 1 juri lain (total 2 juri, nilai sama, rentang 2 detik).</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx];
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                            {jS && (
                                <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
                                    {jS.lastUpdated && <p className="text-gray-400 dark:text-gray-500 text-xxs">Update: {jS.lastUpdated.toDate().toLocaleTimeString()}</p>}
                                </div>
                            )}
                            {!jS && <p className="italic text-gray-500 dark:text-gray-400">Belum ada input dari Juri {idx+1} untuk pertandingan ini.</p>}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

