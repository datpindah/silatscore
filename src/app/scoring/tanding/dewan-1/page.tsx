
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
  timestamp: Timestamp; 
}

interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
  key: string; 
  round: keyof JuriRoundScores;
  color: 'merah' | 'biru';
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
    // console.log("[Dewan-1] Config listener effect running.");
    setIsLoading(true); 
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) {
        // console.log(`[Dewan-1] Config Match ID changed from ${configMatchId} to ${newDbConfigId}`);
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) {
        // console.log("[Dewan-1] Initial load, no active schedule in config.");
        setConfigMatchId(null); 
      }
    }, (err) => {
      console.error("[Dewan-1] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null); 
    });
    return () => unsubConfig();
  }, []); 

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
        if (!mounted) return;
        // console.log(`[Dewan-1] Resetting all match data due to: ${reason}`);
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
    
    if (configMatchId === undefined) { 
        if (!isLoading) setIsLoading(true); 
        return;
    }

    if (configMatchId === null) { 
        if (activeScheduleId !== null) { 
            resetAllMatchData("configMatchId became null");
        }
        if (isLoading) setIsLoading(false); 
        setError("Tidak ada jadwal pertandingan yang aktif.");
        return;
    }
    
    if (configMatchId !== activeScheduleId) {
        resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
        setActiveScheduleId(configMatchId); 
        if (!isLoading) setIsLoading(true); 
        return; 
    }

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return; 
      // console.log(`[Dewan-1] Loading data for match: ${currentMatchId}`);
      
      if (!isLoading) setIsLoading(true);

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
            setMatchDetailsLoaded(true);
          }
        } else {
          if(mounted) {
            setError(`Detail jadwal untuk ID ${currentMatchId} tidak ditemukan.`);
            resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
            if(isLoading) setIsLoading(false);
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
            const firestoreKeysLog = new Set(data?.confirmed_entry_keys_log as string[] || []);
            if (mounted) {
                // Initialize both local `allContributingEntryKeys` (for UI) and `prevSavedConfirmedKeys` (for Firestore diffing)
                // This ensures that on page load/refresh, we start with what was persisted.
                setAllContributingEntryKeys(firestoreKeysLog);
                setPrevSavedConfirmedKeys(firestoreKeysLog);
                // console.log(`[Dewan-1] Initialized allContributingEntryKeys & prevSavedConfirmedKeys from Firestore log for ${currentMatchId}`, firestoreKeysLog);
            }
          } else {
            if(mounted) {
                const initialDataForMatch = { timer_status: initialTimerStatus, confirmed_entry_keys_log: [] };
                await setDoc(timerStatusDocRef, initialDataForMatch, { merge: true });
                setTimerStatus(initialTimerStatus); 
                setAllContributingEntryKeys(new Set()); 
                setPrevSavedConfirmedKeys(new Set());
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
            if (isLoading) setIsLoading(false); 
        }
      }
    };

    if (activeScheduleId) { 
        loadData(activeScheduleId);
    } else if (isLoading && configMatchId === null){ 
        setIsLoading(false);
    }


    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]); 


  useEffect(() => {
    // console.log("[Dewan-1] Score calculation effect running. Dependencies changed.");
    if (!activeScheduleId || !matchDetailsLoaded || 
        juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined) {
        
        let shouldBeLoading = true;
        if (!activeScheduleId && configMatchId === null) { // No active match, definitely not loading match data
            shouldBeLoading = false;
        } else if (activeScheduleId && (!matchDetailsLoaded || juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined)) {
            // Active match ID exists, but some data is still pending (undefined)
            shouldBeLoading = true;
        } else if (configMatchId === undefined) { // Initial state before config is even read
            shouldBeLoading = true;
        } else { // All primary data sources (juri scores) are either null (no data yet) or loaded
             shouldBeLoading = false;
        }

        if (isLoading !== shouldBeLoading) {
            setIsLoading(shouldBeLoading);
        }
        if (shouldBeLoading) return; // Don't proceed with calculation if essential data is missing
    }
    
    // If we reach here, it means essential data markers (juriXScores) are no longer undefined.
    // We can now safely set isLoading to false if it hasn't been already by the data loading part.
    if (isLoading) setIsLoading(false);

    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];
    
    // currentGlobalAccumulatedKeys starts with what was previously saved or the initial empty set
    // This is the core for PERMANENT "valid" status for display.
    const currentGlobalAccumulatedKeys = new Set<string>(prevSavedConfirmedKeys);
    const allRawEntries: CombinedScoreEntry[] = [];

    allJuriDataInput.forEach(juriData => {
      (['merah', 'biru'] as const).forEach(pesilatColor => {
        (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
          juriData[pesilatColor]?.[roundKey]?.forEach(entry => {
            if (entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
              const entryKey = `${juriData.juriId}_${entry.timestamp.toMillis()}_${entry.points}`;
              allRawEntries.push({
                ...entry,
                juriId: juriData.juriId,
                key: entryKey,
                round: roundKey,
                color: pesilatColor
              });
            } else {
              console.warn(
                `[Dewan-1] Skipping entry due to invalid or missing timestamp during raw entry processing. Entry:`, 
                JSON.stringify(entry),
                `Juri: ${juriData.juriId}, Color: ${pesilatColor}, Round: ${roundKey}`
              );
            }
          });
        });
      });
    });
    allRawEntries.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    
    const newlyFoundValidKeysThisCycle = new Set<string>();

    for (let i = 0; i < allRawEntries.length; i++) {
        const e1 = allRawEntries[i];
        if (currentGlobalAccumulatedKeys.has(e1.key)) { // If e1 is already part of a finalized valid pair, skip
            continue;
        }

        // Find partners for e1 that are NOT already part of a finalized valid pair
        const potentialPartners = [];
        for (let j = i + 1; j < allRawEntries.length; j++) {
            const e2 = allRawEntries[j];
            if (currentGlobalAccumulatedKeys.has(e2.key)) { // If e2 is already finalized, it can't be a new partner
                continue;
            }

            if (e1.juriId !== e2.juriId &&
                e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= 2000) {
                potentialPartners.push(e2);
            }
        }

        if (potentialPartners.length > 0) { // Found at least one new partner for e1
            currentGlobalAccumulatedKeys.add(e1.key);
            newlyFoundValidKeysThisCycle.add(e1.key);
            potentialPartners.forEach(p => {
                currentGlobalAccumulatedKeys.add(p.key);
                newlyFoundValidKeysThisCycle.add(p.key);
            });
            // e1 and its new partners are now "globally accumulated"
        }
    }
    
    // Update the UI-driving set for Dewan-1 immediately with the accumulated keys
    setAllContributingEntryKeys(new Set(currentGlobalAccumulatedKeys));

    // Calculate total scores based on the fully accumulated valid keys
    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const keysUsedForScoringThisCalculation = new Set<string>();

    // Iterate based on the accumulated keys to calculate score
    // This ensures that even if optimal pairs change, points are based on current valid groups
    // Sort the entries by timestamp to ensure deterministic processing for scoring groups.
    const entriesForScoreCalculation = allRawEntries
        .filter(e => currentGlobalAccumulatedKeys.has(e.key))
        .sort((a,b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    for (const e1 of entriesForScoreCalculation) {
        if (keysUsedForScoringThisCalculation.has(e1.key)) continue;

        const agreeingPartnersForE1 = [e1];
        for (const e2 of entriesForScoreCalculation) {
            if (e1.key === e2.key || keysUsedForScoringThisCalculation.has(e2.key) || e1.juriId === e2.juriId) continue;

            if (e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= 2000) {
                agreeingPartnersForE1.push(e2);
            }
        }

        if (agreeingPartnersForE1.length >= 2) {
            // Valid group found
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;
            
            agreeingPartnersForE1.forEach(p => keysUsedForScoringThisCalculation.add(p.key));
        }
    }

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);

    // Update Firestore log if `currentGlobalAccumulatedKeys` has new additions compared to `prevSavedConfirmedKeys`
    if (activeScheduleId) {
        const newLogForFirestoreArray = Array.from(currentGlobalAccumulatedKeys);
        let firestoreUpdateNeeded = newLogForFirestoreArray.length > prevSavedConfirmedKeys.size;
        if (!firestoreUpdateNeeded && newLogForFirestoreArray.length === prevSavedConfirmedKeys.size && newLogForFirestoreArray.length > 0) {
           for(const key of newLogForFirestoreArray){
               if(!prevSavedConfirmedKeys.has(key)){
                   firestoreUpdateNeeded = true;
                   break;
               }
           }
        }

        if (firestoreUpdateNeeded) {
            // console.log("[Dewan-1] Firestore update needed for confirmed_entry_keys_log.");
            updateDoc(doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId), {
                confirmed_entry_keys_log: newLogForFirestoreArray
            }).then(() => {
                setPrevSavedConfirmedKeys(new Set(newLogForFirestoreArray)); // Update prevSaved to current
                // console.log("[Dewan-1] Firestore updated with new accumulated keys:", newLogForFirestoreArray);
            }).catch(err => {
                console.error("[Dewan-1] Error updating Firestore log:", err);
            });
        } else {
            // console.log("[Dewan-1] No Firestore update needed for confirmed_entry_keys_log. currentGlobal: ", currentGlobalAccumulatedKeys.size, "prevSaved: ", prevSavedConfirmedKeys.size);
        }
    }

  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetailsLoaded, prevSavedConfirmedKeys]);


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
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
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
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
    
    let newMatchStatus: TimerStatus['matchStatus'] = 'Pending';
    let newTimerSeconds = ROUND_DURATION_SECONDS;

    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) {
        newMatchStatus = `FinishedRound${round}` as TimerStatus['matchStatus'];
        newTimerSeconds = 0; 
    } else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { 
             newMatchStatus = `FinishedRound${round}` as TimerStatus['matchStatus'];
             newTimerSeconds = 0;
        } else { 
            newMatchStatus = 'Pending';
            newTimerSeconds = ROUND_DURATION_SECONDS;
        }
    }

     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: newTimerSeconds, 
      isTimerRunning: false, 
      matchStatus: newMatchStatus, 
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus || isLoading) return;
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    const isCurrentRoundActuallyFinished = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;

    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0 atau status belum 'Finished'). Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) {
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
    // console.log("[Dewan-1] handleResetMatch called. ActiveScheduleId:", activeScheduleId);
    if (!activeScheduleId || isLoading) {
        console.warn("[Dewan-1] Reset aborted: no active schedule ID or still loading.");
        return;
    }
    if (!confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;
    
    if (!isLoading) setIsLoading(true); 
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
        // console.log("[Dewan-1] Firestore batch commit successful for reset.");
        
        setTimerStatus(initialTimerStatus); 
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        setAllContributingEntryKeys(new Set()); 
        setPrevSavedConfirmedKeys(new Set()); 
        setJuri1Scores(null); 
        setJuri2Scores(null); 
        setJuri3Scores(null);
                
        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error("[Dewan-1] Error resetting match:", e);
      setError("Gagal mereset pertandingan.");
    } finally {
         if (isLoading) setIsLoading(false);
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
    
    const now = Date.now(); 
    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        // console.warn(`[Dewan-1] Invalid timestamp in getJuriScoreForDisplay. Juri: ${juriId}, Color: ${pesilatColor}, Round: ${round}, Entry:`, JSON.stringify(entry));
        entryTimestampMillis = now; // Fallback to current time to avoid error, though data is problematic
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isContributing = contributingKeysForDisplay.has(entryKey);
      const isGracePeriod = (now - entryTimestampMillis) <= 2000; 
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

  const isTimerStartDisabled: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled: boolean = !activeScheduleId || isLoading || !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound");
  const isResetButtonDisabled: boolean = !activeScheduleId || isLoading;
  
  const isBabakButtonDisabled = (round: number): boolean => {
    if (!activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished') return true;
    return false; 
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
              <Button 
                onClick={handleResetMatch} 
                disabled={isResetButtonDisabled}
                variant="destructive" 
                className="w-full py-2 md:py-3 text-sm md:text-base"
              >
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
                 <CardDescription>Nilai hanya sah jika dua juri atau lebih memberikan nilai yang sama (poin 1 atau 2) untuk warna dan babak yang sama dalam selang waktu 2 detik. Nilai yang SAH akan ditampilkan normal dan dihitung. Nilai yang TIDAK SAH (misal, hanya 1 juri, atau beda nilai, atau beda waktu &gt;2 detik) akan DICORET setelah 2 detik jika tidak ada pasangan. Nilai yang baru masuk (&lt;2 detik) tidak langsung dicoret.</CardDescription>
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

    
