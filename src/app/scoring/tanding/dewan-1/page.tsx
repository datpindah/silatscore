
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

export default function ScoringTandingDewanSatuPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined); 
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  const [juri1Scores, setJuri1Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriMatchDataWithId | null>(null);

  const [allContributingEntryKeys, setAllContributingEntryKeys] = useState<Set<string>>(new Set());
  const [prevSavedConfirmedKeys, setPrevSavedConfirmedKeys] = useState<Set<string>>(new Set());
  
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);


  useEffect(() => {
    setIsLoading(true); 
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) {
        console.log(`[Dewan-1] Config Match ID changed from ${configMatchId} to ${newDbConfigId}`);
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) {
        setConfigMatchId(null); 
      }
    }, (err) => {
      console.error("[Dewan-1] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null); // Ensure state reflects error
      setIsLoading(false);
    });
    return () => unsubConfig();
  }, []); // configMatchId removed

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
        if (!mounted) return;
        console.log(`[Dewan-1] Resetting all match data due to: ${reason}`);
        setActiveScheduleId(null);
        setMatchDetails(null);
        setMatchDetailsLoaded(false);
        setPesilatMerahInfo(null);
        setPesilatBiruInfo(null);
        setTimerStatus(initialTimerStatus);
        setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
        setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
        setAllContributingEntryKeys(new Set());
        setPrevSavedConfirmedKeys(new Set());
        setError(null);
    };
    
    if (configMatchId === undefined) { // Still waiting for config from Firestore
        setIsLoading(true); 
        return;
    }

    if (configMatchId === null) { // No active schedule configured
        if (activeScheduleId !== null) { // Only reset if there was a previous active match
            resetAllMatchData("configMatchId became null");
        }
        setIsLoading(false); // Not loading if no match
        setError("Tidak ada jadwal pertandingan yang aktif.");
        return;
    }
    
    // If configMatchId has changed to a new valid ID, or if it's the first valid ID
    if (configMatchId !== activeScheduleId) {
        resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
        setActiveScheduleId(configMatchId); 
        setIsLoading(true); 
    } else if (!matchDetailsLoaded && activeScheduleId && isLoading) {
        // This means activeScheduleId is set, we are loading, but details aren't loaded yet.
        // This is a valid loading state, let loadData proceed or complete.
    } else if (matchDetailsLoaded && activeScheduleId && isLoading) {
      // If details are loaded but we are still in isLoading, something is off or calculation hasn't finished.
      // For now, let the calculation useEffect handle isLoading=false.
    }


    const loadData = async (currentMatchId: string) => {
      if (!mounted) return;
      console.log(`[Dewan-1] Loading data for match: ${currentMatchId}`);
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          if(mounted) {
            setMatchDetails(data);
            setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
            setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
            setMatchDetailsLoaded(true); // Mark details as loaded
          }
        } else {
          if(mounted) {
            setError(`Detail jadwal untuk ID ${currentMatchId} tidak ditemukan.`);
            resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
            setIsLoading(false); // Stop loading as schedule not found
          }
          return;
        }

        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) {
              if(mounted) setTimerStatus(data.timer_status as TimerStatus);
            }
            if (data?.confirmed_entry_keys_log) {
              const firestoreKeys = new Set(data.confirmed_entry_keys_log as string[]);
              if(mounted) {
                setPrevSavedConfirmedKeys(firestoreKeys);
                // Set allContributingEntryKeys here for initial load consistency,
                // it will be refined by the calculation useEffect.
                // This helps avoid a flash of all-struck scores if calc takes time.
                setAllContributingEntryKeys(firestoreKeys); 
              }
            } else {
              if(mounted) {
                setPrevSavedConfirmedKeys(new Set());
                // setAllContributingEntryKeys(new Set()); 
              }
            }
          } else {
            if(mounted) {
                const initialDataForMatch = { timer_status: initialTimerStatus, confirmed_entry_keys_log: [] };
                await setDoc(timerStatusDocRef, initialDataForMatch, { merge: true });
                setTimerStatus(initialTimerStatus); 
                setPrevSavedConfirmedKeys(new Set());
                // setAllContributingEntryKeys(new Set());
            }
          }
        }, (err) => {
          if(mounted) console.error("[Dewan-1] Error fetching timer status/confirmed keys:", err);
        });
        if(mounted) unsubscribers.push(unsubTimer);
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (!mounted) return;
            if (docSnap.exists()) {
              if(mounted) juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              if(mounted) juriSetters[index](null);
            }
          }, (err) => {
            if(mounted) {
                console.error(`[Dewan-1] Error fetching scores for ${juriId}:`, err);
                juriSetters[index](null);
            }
          });
          if(mounted) unsubscribers.push(unsubJuri);
        });
        
      } catch (err) {
        if(mounted){
            console.error("[Dewan-1] Error in loadData function:", err);
            setError("Gagal memuat data pertandingan.");
            setIsLoading(false); // Stop loading on error
        }
      } finally {
        // Moved setIsLoading(false) to calculation useEffect to ensure all data is ready
      }
    };

    if (activeScheduleId) { 
        loadData(activeScheduleId);
    }


    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]); // Re-run if activeScheduleId or configMatchId changes


  const calculateConfirmedScoreForPesilat = useCallback((
    pesilatColor: 'merah' | 'biru',
    targetRound: 1 | 2 | 3,
    allJuriScoresData: JuriMatchDataWithId[]
  ): { score: number, contributingEntryKeys: Set<string> } => {
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

    validEntriesForRound.sort((a, b) => {
        const timeDiff = a.timestamp.toMillis() - b.timestamp.toMillis();
        if (timeDiff !== 0) return timeDiff;
        return a.juriId.localeCompare(b.juriId);
    });

    let confirmedPointsTotalForRound = 0;
    const consumedEntryKeysForConfirmedPoints = new Set<string>(); 
    const contributingEntryKeysThisRound = new Set<string>(); 

    for (let i = 0; i < validEntriesForRound.length; i++) {
        const e1 = validEntriesForRound[i];
        const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;

        if (consumedEntryKeysForConfirmedPoints.has(e1Key)) {
            continue; 
        }

        let agreeingEntriesGroupKeys = new Set<string>([e1Key]);
        let agreeingJuriesIds = new Set<string>([e1.juriId]);

        for (let j = i + 1; j < validEntriesForRound.length; j++) {
            const e2 = validEntriesForRound[j];
            const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;

            if (consumedEntryKeysForConfirmedPoints.has(e2Key) || agreeingJuriesIds.has(e2.juriId)) {
                continue;
            }
            
            const timeDifference = Math.abs(e2.timestamp.toMillis() - e1.timestamp.toMillis());
            
            if (e1.points === e2.points && timeDifference <= 2000) {
                agreeingJuriesIds.add(e2.juriId);
                agreeingEntriesGroupKeys.add(e2Key);
            }
        }
        
        if (agreeingJuriesIds.size >= 2) {
            confirmedPointsTotalForRound += e1.points; 
            agreeingEntriesGroupKeys.forEach(keyInGroup => {
                consumedEntryKeysForConfirmedPoints.add(keyInGroup);
                contributingEntryKeysThisRound.add(keyInGroup);
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
        if(isLoading && configMatchId !== undefined) setIsLoading(false); // If no active match, not loading
        return;
    }

    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores];
    
    if (!matchDetailsLoaded || allJuriDataInput.some(data => data === null)) {
        if(configMatchId && !isLoading) setIsLoading(true); // Start loading if we have a match ID but data is missing
        return;
    }
    if(isLoading) setIsLoading(false); // All data is now loaded and ready for calculation

    const allJuriData = allJuriDataInput.filter(Boolean) as JuriMatchDataWithId[];
    
    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const liveCalculatedContributingKeys = new Set<string>(); 

    for (let roundNum: 1 | 2 | 3 = 1; roundNum <= TOTAL_ROUNDS; roundNum = (roundNum + 1) as (1 | 2 | 3)) {
        const merahResult = calculateConfirmedScoreForPesilat('merah', roundNum, allJuriData);
        calculatedTotalMerah += merahResult.score;
        merahResult.contributingEntryKeys.forEach(key => liveCalculatedContributingKeys.add(key));
        
        const biruResult = calculateConfirmedScoreForPesilat('biru', roundNum, allJuriData);
        calculatedTotalBiru += biruResult.score;
        biruResult.contributingEntryKeys.forEach(key => liveCalculatedContributingKeys.add(key));

        if (roundNum === TOTAL_ROUNDS) break; 
    }

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);
    setAllContributingEntryKeys(liveCalculatedContributingKeys); // For Dewan-1 UI rendering
    
    if (activeScheduleId) {
        const newLogForFirestoreArray = Array.from(liveCalculatedContributingKeys);
        
        let logsAreDifferent = newLogForFirestoreArray.length !== prevSavedConfirmedKeys.size;
        if (!logsAreDifferent && newLogForFirestoreArray.length > 0) { 
            const currentFirestoreSet = prevSavedConfirmedKeys;
            if (!newLogForFirestoreArray.every(key => currentFirestoreSet.has(key)) || 
                !Array.from(currentFirestoreSet).every(key => liveCalculatedContributingKeys.has(key))) {
                logsAreDifferent = true;
            }
        }

        if (logsAreDifferent) {
            const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
            updateDoc(matchDocRef, { confirmed_entry_keys_log: newLogForFirestoreArray })
            .then(() => {
                setPrevSavedConfirmedKeys(new Set(newLogForFirestoreArray)); 
                console.log(`[Dewan-1] Updated confirmed_entry_keys_log in Firestore for ${activeScheduleId}`);
            })
            .catch(e => console.error("[Dewan-1] Error updating confirmed_entry_keys_log: ", e));
        }
    }

  }, [
    juri1Scores, juri2Scores, juri3Scores, 
    activeScheduleId, matchDetailsLoaded, matchDetails, // ensure matchDetails is a dependency
    calculateConfirmedScoreForPesilat, 
    prevSavedConfirmedKeys,
    configMatchId, isLoading // Add isLoading and configMatchId to help manage loading state
  ]);


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
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) { 
                    setTimerStatus(prev => ({ 
                        ...prev, 
                        isTimerRunning: false, 
                        ...(currentDBTimerStatus && { 
                            timerSeconds: currentDBTimerStatus.timerSeconds, 
                            matchStatus: currentDBTimerStatus.matchStatus, 
                            currentRound: currentDBTimerStatus.currentRound
                        }) 
                    })); 
                    if(interval) clearInterval(interval);
                    return;
                }
                if (!timerStatus.isTimerRunning) { 
                    if (interval) clearInterval(interval);
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
                 if(interval) clearInterval(interval);
                 setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); 
            }
        } else {
             if(interval) clearInterval(interval); 
        }
      }, 1000);
    } else if (!timerStatus.isTimerRunning || timerStatus.timerSeconds === 0) {
        if(interval) clearInterval(interval);
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
    
    let newMatchStatus: TimerStatus['matchStatus'] = 'Pending';
    let newTimerSeconds = ROUND_DURATION_SECONDS;

    const currentStatusRoundNumber = timerStatus.matchStatus.startsWith('FinishedRound') || timerStatus.matchStatus.startsWith('PausedRound') || timerStatus.matchStatus.startsWith('OngoingRound')
        ? parseInt(timerStatus.matchStatus.replace(/^(OngoingRound|PausedRound|FinishedRound)/, ''))
        : timerStatus.currentRound;

    if ((timerStatus.matchStatus.startsWith('FinishedRound') && round <= currentStatusRoundNumber) || 
        (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) ) {
        newMatchStatus = `FinishedRound${round}` as TimerStatus['matchStatus'];
        newTimerSeconds = 0;
    }

     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: newTimerSeconds, 
      isTimerRunning: false, 
      matchStatus: newMatchStatus, 
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus) return;
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    const isCurrentRoundFinishedByTimer = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;

    if (timerStatus.timerSeconds > 0 && !isCurrentRoundFinishedByTimer && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0). Yakin ingin melanjutkan?`)) {
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
    else if (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
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
        
        setTimerStatus(initialTimerStatus); 
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        setAllContributingEntryKeys(new Set()); 
        setPrevSavedConfirmedKeys(new Set()); 
        
        setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
        // Match details remain
        
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
    round: 1 | 2 | 3,
    contributingKeysForDisplay: Set<string> 
  ): React.ReactNode => {
    if (!juriData) return '-';
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';
    
    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      try {
        entryTimestampMillis = entry.timestamp.toMillis();
      } catch (e) {
        console.warn("[Dewan-1] Error converting timestamp for display:", entry.timestamp, e);
        entryTimestampMillis = Date.now(); 
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isContributing = contributingKeysForDisplay.has(entryKey);
      const shouldStrike = !isContributing; 

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
  
  if (configMatchId === undefined && isLoading) { 
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
  
  if (isLoading && activeScheduleId) { 
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat data pertandingan...</p>
                {matchDetails && <p className="text-sm text-muted-foreground">Partai: {matchDetails.pesilatMerahName} vs {matchDetails.pesilatBiruName}</p>}
                {error && !matchDetails && <p className="text-sm text-red-500 mt-2">Error memuat detail: {error}</p>}
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
                <p className="mb-4 text-muted-foreground">{error || "Tidak ada pertandingan yang aktif atau detail tidak dapat dimuat."}</p>
                 {error && <p className="text-xs text-red-500 mt-2">Detail Error: {error}</p>}
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
  
  const isNextActionPossible: boolean = 
    (timerStatus.currentRound < TOTAL_ROUNDS || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished'));

  const isNextActionDisabledBtn: boolean = 
    timerStatus.isTimerRunning || 
    !isNextActionPossible ||
    (timerStatus.matchStatus.startsWith("OngoingRound"));


  const isTimerStartDisabled: boolean = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled: boolean = !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  
  const isBabakButtonDisabled = (round: number): boolean => {
    if (timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished') return true;
    // Allow setting to a finished round to review its scores, but not to start it again if already past.
    // if (timerStatus.matchStatus.startsWith('FinishedRound')) {
    //     const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
    //     if (round > finishedRoundNumber && timerStatus.currentRound < round) return true; // Cannot jump past an unfinished current round to a future finished one
    // }
    return false; // Generally allow changing rounds if timer not running and match not finished
  };


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
            {error && !isLoading && !matchDetails && <p className="text-xs md:text-sm text-yellow-300 mt-1">Gagal memuat detail pertandingan. {error}</p>}
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
                disabled={isNextActionDisabledBtn}
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
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri &amp; Skor Mentah
                </CardTitle>
                 <CardDescription>Skor mentah dari juri. Skor dicoret jika tidak membentuk pasangan nilai yang sama dari minimal 2 juri (untuk warna &amp; babak yang sama) dalam rentang waktu input 2 detik. Total skor di atas hanya menghitung nilai yang tidak tercoret.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx];
                    const keysForThisJuriDisplay = allContributingEntryKeys; 
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                            {jS && (
                                <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1, keysForThisJuriDisplay)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2, keysForThisJuriDisplay)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3, keysForThisJuriDisplay)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1, keysForThisJuriDisplay)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2, keysForThisJuriDisplay)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3, keysForThisJuriDisplay)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
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

    