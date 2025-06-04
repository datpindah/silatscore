
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, collection, writeBatch, updateDoc } from 'firebase/firestore';
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

// Enhanced JuriMatchData to include juriId
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
  contributingEntryKeys: Set<string>; // Set of "juriId_timestampMillis_points"
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
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const newActiveId = docSnap.data().activeScheduleId;
        if (newActiveId !== activeScheduleId) { 
          console.log("[Dewan-1] Active schedule ID changed to:", newActiveId);
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
          setAllContributingEntryKeys(new Set());
          setPrevSavedConfirmedKeys(new Set());
          setError(null); 
        } else if (!activeScheduleId && !newActiveId) {
            console.log("[Dewan-1] No active schedule ID found (both null/undefined).");
            setIsLoading(false); 
            setError("Tidak ada jadwal pertandingan yang aktif.");
        }
      } else {
        console.log("[Dewan-1] Active schedule config document does not exist or has no activeScheduleId.");
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
        setAllContributingEntryKeys(new Set());
        setPrevSavedConfirmedKeys(new Set());
        setIsLoading(false); 
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
      console.log("[Dewan-1] No activeScheduleId, skipping data load.");
      setMatchDetails(null); 
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setTimerStatus(initialTimerStatus);
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set());
      setPrevSavedConfirmedKeys(new Set());
      setIsLoading(false);
      return;
    }

    console.log("[Dewan-1] ActiveScheduleId present:", activeScheduleId, "Proceeding to load data.");
    setIsLoading(true); 
    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      try {
        console.log(`[Dewan-1] Loading schedule details for ID: ${activeScheduleId}`);
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          console.log("[Dewan-1] Schedule details loaded:", data);
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
        } else {
          console.error(`[Dewan-1] Schedule details for ID ${activeScheduleId} not found.`);
          setError(`Detail jadwal untuk ID ${activeScheduleId} tidak ditemukan.`);
          setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
          setIsLoading(false); 
          return;
        }

        console.log(`[Dewan-1] Setting up listener for timer status for match ID: ${activeScheduleId}`);
        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            console.log("[Dewan-1] Timer status updated from Firestore:", docSnap.data()?.timer_status);
            setTimerStatus(docSnap.data()?.timer_status as TimerStatus);
             // Also get confirmed_entry_keys_log if it exists, to initialize prevSavedConfirmedKeys
            if (docSnap.data()?.confirmed_entry_keys_log) {
              setPrevSavedConfirmedKeys(new Set(docSnap.data()?.confirmed_entry_keys_log as string[]));
            }
          } else {
            console.log("[Dewan-1] Timer status not found in Firestore, initializing with initialTimerStatus for match:", activeScheduleId);
            const initialDataForMatch = { 
                timer_status: initialTimerStatus,
                confirmed_entry_keys_log: [] // Initialize this field
            };
            await setDoc(timerStatusDocRef, initialDataForMatch, { merge: true });
            setTimerStatus(initialTimerStatus); 
            setPrevSavedConfirmedKeys(new Set());
          }
        }, (err) => {
          console.error("[Dewan-1] Error fetching timer status:", err);
          setError("Gagal memuat status timer.");
        });
        unsubscribers.push(unsubTimer);
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          console.log(`[Dewan-1] Setting up listener for juri scores for ${juriId}, match ID: ${activeScheduleId}`);
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (docSnap.exists()) {
              console.log(`[Dewan-1] Scores updated from Firestore for ${juriId}:`, docSnap.data());
              juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              console.log(`[Dewan-1] No scores document found for ${juriId}, match ID: ${activeScheduleId}. Setting to null.`);
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
        setIsLoading(false); 
      }
    };

    loadData();

    return () => {
      console.log("[Dewan-1] Unsubscribing from all listeners for match ID:", activeScheduleId);
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
    // console.log(`[CalcScore] For ${pesilatColor}, round ${targetRound}, all raw entries:`, JSON.parse(JSON.stringify(allEntriesForRound)));
    
    // Filter out entries with invalid timestamps first
    const validEntriesForRound = allEntriesForRound.filter(entry => {
      if (entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        return true;
      }
      // console.warn(
      //   `[CalcScore] Filtering out malformed score entry for ${pesilatColor}, round ${targetRound}, juri ${entry?.juriId}: Score=${JSON.stringify(entry)}`
      // );
      return false;
    });
    
    // console.log(`[CalcScore] For ${pesilatColor}, round ${targetRound}, valid entries (with toMillis):`, JSON.parse(JSON.stringify(validEntriesForRound)));

    if (validEntriesForRound.length < 2) { // Need at least two entries to potentially form a pair
      // console.log(`[CalcScore] Not enough valid entries for ${pesilatColor}, round ${targetRound} to form any pair. Count: ${validEntriesForRound.length}`);
      return { score: 0, contributingEntryKeys: new Set() };
    }

    // Sort entries by timestamp
    validEntriesForRound.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    // console.log(`[CalcScore] For ${pesilatColor}, round ${targetRound}, sorted valid entries:`, JSON.parse(JSON.stringify(validEntriesForRound)));

    let confirmedPointsTotalForRound = 0;
    // This Set tracks the keys of entries that have already been used to form a confirmed point.
    // Key format: "juriId_timestampMillis_points"
    const consumedEntryKeysForConfirmedPoints = new Set<string>(); 
    // This Set tracks the keys of entries that successfully contributed to this round's score.
    const contributingEntryKeysThisRound = new Set<string>(); 

    for (let i = 0; i < validEntriesForRound.length; i++) {
      const e1 = validEntriesForRound[i];
      const e1Key = `${e1.juriId}_${e1.timestamp.toMillis()}_${e1.points}`;
      
      // console.log(`[CalcScore] Processing e1: ${e1Key} from ${pesilatColor}, round ${targetRound}`);

      // Skip if this entry (e1) has already been part of a confirmed score.
      if (consumedEntryKeysForConfirmedPoints.has(e1Key)) {
        // console.log(`[CalcScore] e1 ${e1Key} already consumed. Skipping.`);
        continue;
      }

      // Juries involved in this specific potential agreement, starting with e1's juri.
      let confirmingJuriesForE1 = new Set<string>([e1.juriId]); 
      // Keys of entries (e.g., "juri1_1678886400000_1") forming this specific potential agreement.
      let entriesInThisAgreement = new Set<string>([e1Key]); 

      // Look for matching entries (e2) from other juris.
      for (let j = i + 1; j < validEntriesForRound.length; j++) {
        const e2 = validEntriesForRound[j];
        const e2Key = `${e2.juriId}_${e2.timestamp.toMillis()}_${e2.points}`;
        // console.log(`[CalcScore]  Comparing with e2: ${e2Key}`);

        // Skip if e2 has already been consumed in a prior agreement.
        if (consumedEntryKeysForConfirmedPoints.has(e2Key)) {
          // console.log(`[CalcScore]   e2 ${e2Key} already consumed for a prior agreement. Skipping for this e1.`);
          continue;
        }
        // Skip if e2 is from a juri already part of *this current* agreement being built for e1.
        if (confirmingJuriesForE1.has(e2.juriId)) { 
            // console.log(`[CalcScore]   e2 ${e2Key} is from a juri (${e2.juriId}) already in this current agreement set for e1. Skipping.`);
            continue;
        }
        
        const timeDifference = Math.abs(e2.timestamp.toMillis() - e1.timestamp.toMillis());
        // console.log(`[CalcScore]   Time difference between e1 (${e1.timestamp.toMillis()}) and e2 (${e2.timestamp.toMillis()}): ${timeDifference}ms`);

        // If e2 is too far in the future from e1, break because entries are sorted by time.
        // (2000ms = 2 seconds)
        if (timeDifference > 2000) { 
           // console.log(`[CalcScore]   Time difference > 2000ms. Breaking inner loop for e1 ${e1Key}.`);
           break; 
        }

        // Check if points match.
        if (e1.points === e2.points) {
          // console.log(`[CalcScore]   MATCHES e1 ${e1Key} on points (${e1.points}) with e2 ${e2Key} from juri ${e2.juriId}.`);
          confirmingJuriesForE1.add(e2.juriId);
          entriesInThisAgreement.add(e2Key);
        } else {
          // console.log(`[CalcScore]   MISMATCH on points: e1 (${e1.points}) vs e2 (${e2.points}).`);
        }
      }
      
      // console.log(`[CalcScore] For e1 ${e1Key}, unique confirming juris count: ${confirmingJuriesForE1.size}`);
      // If at least 2 juris (e1's juri + at least one other) agree on the point value within the time window.
      if (confirmingJuriesForE1.size >= 2) {
        // console.log(`[CalcScore]   CONFIRMED: Score of ${e1.points} for ${pesilatColor}, round ${targetRound} from e1 ${e1Key}. Consuming entries:`, Array.from(entriesInThisAgreement));
        confirmedPointsTotalForRound += e1.points; 
        // Mark all entries involved in this confirmed agreement as consumed.
        // Also, add them to this round's contributing keys.
        entriesInThisAgreement.forEach(key => {
            consumedEntryKeysForConfirmedPoints.add(key);
            contributingEntryKeysThisRound.add(key);
        });
      } else {
        // console.log(`[CalcScore]   NOT CONFIRMED: Score for e1 ${e1Key} (confirming juris: ${confirmingJuriesForE1.size}). This entry might be 'struck'.`);
      }
    }
    // console.log(`[CalcScore] Total confirmed points for ${pesilatColor}, round ${targetRound}: ${confirmedPointsTotalForRound}`);
    return { score: confirmedPointsTotalForRound, contributingEntryKeys: contributingEntryKeysThisRound };
  }, []);


  useEffect(() => {
    // console.log("[Dewan-1] useEffect for score calculation triggered. ActiveScheduleId:", activeScheduleId);
    if (!activeScheduleId) {
      setConfirmedScoreMerah(0);
      setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set());
      setPrevSavedConfirmedKeys(new Set());
      setIsLoading(false); 
      // console.log("[Dewan-1] No active schedule ID, confirmed scores reset, loading set to false.");
      return;
    }

    const allJuriData = [juri1Scores, juri2Scores, juri3Scores];
    // console.log("[Dewan-1] Current Juri Data for calculation:", {juri1Scores, juri2Scores, juri3Scores});
    
    let totalMerahOverall = 0;
    let totalBiruOverall = 0;
    const newAllContributingKeys = new Set<string>();

    for (let roundNum: 1 | 2 | 3 = 1; roundNum <= TOTAL_ROUNDS; roundNum = (roundNum + 1) as (1 | 2 | 3)) {
        // console.log(`[Dewan-1] Calculating confirmed score for MERAH, round ${roundNum}`);
        const merahResult = calculateConfirmedScoreForPesilat('merah', roundNum, allJuriData);
        totalMerahOverall += merahResult.score;
        merahResult.contributingEntryKeys.forEach(key => newAllContributingKeys.add(key));
        
        // console.log(`[Dewan-1] Calculating confirmed score for BIRU, round ${roundNum}`);
        const biruResult = calculateConfirmedScoreForPesilat('biru', roundNum, allJuriData);
        totalBiruOverall += biruResult.score;
        biruResult.contributingEntryKeys.forEach(key => newAllContributingKeys.add(key));

        if (roundNum === TOTAL_ROUNDS) break; 
    }

    // console.log("[Dewan-1] Final calculated confirmed scores: Merah =", totalMerahOverall, "Biru =", totalBiruOverall);
    // console.log("[Dewan-1] All contributing entry keys:", newAllContributingKeys);
    setConfirmedScoreMerah(totalMerahOverall);
    setConfirmedScoreBiru(totalBiruOverall);
    setAllContributingEntryKeys(newAllContributingKeys);

    // Save allContributingEntryKeys to Firestore if changed
    if (activeScheduleId) {
      const newKeysArray = Array.from(newAllContributingKeys);
      const prevKeysArray = Array.from(prevSavedConfirmedKeys);
      
      let changed = newKeysArray.length !== prevKeysArray.length;
      if (!changed && newKeysArray.length > 0) { // only check content if lengths are same and not empty
        const tempNewSet = new Set(newKeysArray);
        for (const key of prevKeysArray) {
          if (!tempNewSet.has(key)) {
            changed = true;
            break;
          }
        }
        if(!changed){ // check the other way around
             const tempPrevSet = new Set(prevKeysArray);
             for(const key of newKeysArray){
                 if(!tempPrevSet.has(key)){
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
            // console.log("[Dewan-1] Confirmed entry keys log updated in Firestore.", newKeysArray);
            setPrevSavedConfirmedKeys(new Set(newKeysArray)); 
          })
          .catch(e => console.error("[Dewan-1] Error updating confirmed_entry_keys_log: ", e));
      }
    }
    
    if (matchDetails || error) { 
        // console.log("[Dewan-1] Match details or error exists, setting isLoading to false.");
        setIsLoading(false);
    } else if (activeScheduleId && !matchDetails && !error) {
        // console.log("[Dewan-1] Active schedule ID exists, but no match details or error yet. Setting isLoading to true.");
        setIsLoading(true); 
    } else { 
        // console.log("[Dewan-1] Fallback: setting isLoading to false.");
        setIsLoading(false); 
    }

  }, [juri1Scores, juri2Scores, juri3Scores, timerStatus.currentRound, activeScheduleId, matchDetails, error, calculateConfirmedScoreForPesilat, prevSavedConfirmedKeys]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => { // Make the interval callback async
        if (activeScheduleId) { // Re-check activeScheduleId inside interval
            try {
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                const currentDBDoc = await getDoc(matchDocRef); // Get current DB state
                
                if (!currentDBDoc.exists()) {
                    console.warn("[Dewan-1 Interval] Match doc does not exist. Stopping timer update.");
                    if(interval) clearInterval(interval); // Clear interval if doc is gone
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) { // If DB says timer isn't running, stop local
                    // console.log("[Dewan-1 Interval] Timer stopped in DB or no status, stopping local interval.");
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Update local state
                    if(interval) clearInterval(interval);
                    return;
                }

                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false; // Stop the timer
                    newMatchStatus = `FinishedRound${currentDBTimerStatus.currentRound}` as TimerStatus['matchStatus'];
                    if (currentDBTimerStatus.currentRound === TOTAL_ROUNDS) {
                        newMatchStatus = 'MatchFinished';
                    }
                }
                
                const updatedStatusForFirestore: TimerStatus = {
                    ...currentDBTimerStatus, // Base on current DB status
                    timerSeconds: newSeconds,
                    isTimerRunning: newIsTimerRunning,
                    matchStatus: newMatchStatus,
                };
                
                // Update Firestore FIRST
                await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
                // THEN update local state (or rely on snapshot listener, but for immediate UI, this is ok)
                // setTimerStatus(updatedStatusForFirestore); // Listener should pick this up
            } catch (e) {
                console.error("[Dewan-1] Error updating timer in interval: ", e);
            }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, activeScheduleId]); // Removed timerStatus.timerSeconds from deps to avoid re-creating interval too often


  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status 
                                   ? docSnap.data()?.timer_status as TimerStatus 
                                   : timerStatus; // Fallback to local if DB is empty, but prefer DB
      
      const newFullStatus = { ...currentDBTimerStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // Local state will be updated by the onSnapshot listener
    } catch (e) {
      console.error("[Dewan-1] Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); // timerStatus is a dependency for fallback

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
                   ? `FinishedRound${round}` as TimerStatus['matchStatus'] // If going to an earlier finished round, keep it finished
                   : 'Pending', // Otherwise, set to pending for the new round
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus) return;
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    // If current round is not finished (timer > 0) and it's not the last round
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
    // If current round is the last round
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
            confirmed_entry_keys_log: [] // Reset confirmed keys log
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
    contributingKeys: Set<string> // This is allContributingEntryKeys from Dewan-1's state
  ): React.ReactNode => {
    if (!juriData) return '-';
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';
    
    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        // console.warn(`[Dewan-1 Display] Invalid timestamp for entry in juri ${juriId}, round ${round}, pesilat ${pesilatColor}:`, entry);
        entryTimestampMillis = Date.now(); 
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      // Check if this specific entry key is part of the set of keys that contributed to the confirmed score
      const isConfirmed = contributingKeys.has(entryKey);

      return (
        <span key={`${juriId}-${round}-${pesilatColor}-${index}`} className={cn(!isConfirmed && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
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
  
  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai' : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');
  
  const isNextActionDisabled: boolean = 
    timerStatus.isTimerRunning || 
    timerStatus.matchStatus === 'MatchFinished' ||
    (timerStatus.matchStatus.startsWith("OngoingRound")) || // Cannot proceed if round is ongoing
    (timerStatus.matchStatus.startsWith(`FinishedRound${TOTAL_ROUNDS}`)) ;// Cannot proceed if match is finished (last round done)
    // Removed: (timerStatus.matchStatus === 'Pending' && timerStatus.timerSeconds === ROUND_DURATION_SECONDS && !timerStatus.matchStatus.startsWith("FinishedRound") && timerStatus.currentRound === 1) ;


  const isTimerStartDisabled: boolean = timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled: boolean = !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isBabakButtonDisabled = (round: number): boolean => 
    timerStatus.isTimerRunning || 
    timerStatus.matchStatus === 'MatchFinished' ||
    timerStatus.matchStatus.startsWith('OngoingRound') ||
    (timerStatus.matchStatus.startsWith('FinishedRound') && timerStatus.currentRound < round); // Cannot go to a future round if current finished round is earlier

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
                 <CardDescription>Skor di bawah adalah input mentah dari tiap juri. Skor yang dicoret tidak memenuhi syarat konfirmasi (min. 2 juri, nilai sama, rentang 2 detik).</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx];
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                            {jS && (
                                <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1, allContributingEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2, allContributingEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3, allContributingEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1, allContributingEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2, allContributingEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3, allContributingEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
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
