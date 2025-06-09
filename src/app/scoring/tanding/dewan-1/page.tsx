
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2 } from 'lucide-react';
import type { ScheduleTanding, KetuaActionLogEntry, TimerStatus, TimerMatchStatus } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, updateDoc, writeBatch, collection, query, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions'; 
const ROUND_DURATION_SECONDS = 120; 
const TOTAL_ROUNDS = 3;
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'];
const GRACE_PERIOD_FOR_STRIKE_DECISION = 5000; 
const JURI_INPUT_VALIDITY_WINDOW_MS = 2000; 

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
  
  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);


  const [allContributingEntryKeys, setAllContributingEntryKeys] = useState<Set<string>>(new Set()); 
  const [permanentlyStruckEntryKeys, setPermanentlyStruckEntryKeys] = useState<Set<string>>(new Set()); 

  const [prevSavedUnstruckKeys, setPrevSavedUnstruckKeys] = useState<Set<string>>(new Set());
  const [prevSavedStruckKeys, setPrevSavedStruckKeys] = useState<Set<string>>(new Set());

  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  useEffect(() => { // Effect C: Listens to Firestore for active match config
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => { // Use functional update
        if (prevId === newDbConfigId) { // If new ID is same as current, no need to update state
          return prevId;
        }
        return newDbConfigId; // Otherwise, update to the new ID (or null)
      });
    }, (err) => {
      console.error(`[Dewan-1] Error fetching active schedule config from path '${ACTIVE_TANDING_SCHEDULE_CONFIG_PATH}':`, err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null); // Ensure configMatchId is set to null on error
    });
    return () => unsubConfig();
  }, []); 

  useEffect(() => { // Effect A: Main data loading and state synchronization logic
    let unsubscribers: (() => void)[] = [];
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
      if (!mounted) return;
      setMatchDetails(null);
      setMatchDetailsLoaded(false);
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setTimerStatus(initialTimerStatus);
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setKetuaActionsLog([]); 
      setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set());
      setPermanentlyStruckEntryKeys(new Set());
      setPrevSavedUnstruckKeys(new Set());
      setPrevSavedStruckKeys(new Set());
      setError(null);
    };

    if (configMatchId === undefined) {
      setIsLoading(true);
      return () => { mounted = false; /* no unsubscribers yet */ };
    }

    if (configMatchId === null) {
      if (activeScheduleId !== null) {
        resetAllMatchData("configMatchId became null");
        setActiveScheduleId(null);
      } else {
         setIsLoading(false);
         setError("Tidak ada jadwal pertandingan yang aktif.");
      }
      return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
    }

    // configMatchId is a string here
    if (configMatchId !== activeScheduleId) {
      resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
      setActiveScheduleId(configMatchId);
      setIsLoading(true); 
      return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
    }

    // configMatchId is a string AND configMatchId === activeScheduleId
    setIsLoading(true);

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (!mounted) return;
        if (scheduleDocSnap.exists()) { // Line 171
          const data = scheduleDocSnap.data() as ScheduleTanding;
          if (mounted) {
            setMatchDetails(data);
            setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
            setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
            setMatchDetailsLoaded(true);
          }
        } else {
          if (mounted) {
            setError(`Detail jadwal untuk ID ${currentMatchId} dari path '${SCHEDULE_TANDING_COLLECTION}/${currentMatchId}' tidak ditemukan.`);
            resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
            setMatchDetailsLoaded(false);
          }
          return;
        }

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        const unsubMatchData = onSnapshot(matchDocRef, async (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) {
              if (mounted) setTimerStatus(data.timer_status as TimerStatus);
            }
            const firestoreUnstruckKeys = new Set(data?.confirmed_unstruck_keys_log as string[] || []);
            const firestoreStruckKeys = new Set(data?.confirmed_struck_keys_log as string[] || []);
            if (mounted) {
              setPrevSavedUnstruckKeys(firestoreUnstruckKeys);
              setAllContributingEntryKeys(firestoreUnstruckKeys); // Initialize with saved unstruck keys
              setPrevSavedStruckKeys(firestoreStruckKeys);
              setPermanentlyStruckKeys(firestoreStruckKeys); // Initialize with saved struck keys
            }
          } else {
            if (mounted) {
              const initialDataForMatch = { 
                timer_status: initialTimerStatus, 
                confirmed_unstruck_keys_log: [],
                confirmed_struck_keys_log: [] 
              };
              try {
                await setDoc(matchDocRef, initialDataForMatch, { merge: true });
                setTimerStatus(initialTimerStatus);
                setPrevSavedUnstruckKeys(new Set());
                setAllContributingEntryKeys(new Set());
                setPrevSavedStruckKeys(new Set());
                setPermanentlyStruckKeys(new Set());
              } catch (setErr) {
                console.error(`[Dewan-1] Error setting initial match data at path '${MATCHES_TANDING_COLLECTION}/${currentMatchId}':`, setErr);
              }
            }
          }
        }, (err) => {
          if (mounted) console.error(`[Dewan-1] Error fetching match data (timer/logs) from path '${MATCHES_TANDING_COLLECTION}/${currentMatchId}':`, err);
        });
        if (mounted) unsubscribers.push(unsubMatchData);

        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocPath = `${MATCHES_TANDING_COLLECTION}/${currentMatchId}/juri_scores/${juriId}`;
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (!mounted) return;
            if (docSnap.exists()) {
              if (mounted) juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              if (mounted) juriSetters[index](null);
            }
          }, (err) => {
            if (mounted) {
              console.error(`[Dewan-1] Error fetching scores for ${juriId} from path '${juriDocPath}':`, err);
              juriSetters[index](null);
            }
          });
          if (mounted) unsubscribers.push(unsubJuri);
        });

        const ketuaActionsQuery = query(collection(db, MATCHES_TANDING_COLLECTION, currentMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc"));
        const unsubKetuaActions = onSnapshot(ketuaActionsQuery, (querySnapshot) => {
            if (!mounted) return;
            const actions: KetuaActionLogEntry[] = [];
            querySnapshot.forEach((doc) => {
                actions.push({ id: doc.id, ...doc.data() } as KetuaActionLogEntry);
            });
            if (mounted) setKetuaActionsLog(actions);
        }, (err) => {
            if (mounted) {
                 console.error(`[Dewan-1] Error fetching official actions from path '${MATCHES_TANDING_COLLECTION}/${currentMatchId}/${OFFICIAL_ACTIONS_SUBCOLLECTION}':`, err);
                 setKetuaActionsLog([]);
            }
        });
        if (mounted) unsubscribers.push(unsubKetuaActions);

      } catch (err) {
        if (mounted) {
          console.error("[Dewan-1] Error in loadData function:", err);
          setError("Gagal memuat data pertandingan.");
        }
      }
    };

    if (activeScheduleId) {
      loadData(activeScheduleId);
    }
    
    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]); 


  useEffect(() => { // Effect B: Score calculation and final loading status
    let shouldBeLoading = false;
    if (configMatchId === undefined) { // Still waiting for initial config
        shouldBeLoading = true;
    } else if (configMatchId === null) { // Config loaded, no active match
        shouldBeLoading = false;
    } else { // configMatchId is a string (active match ID is set)
        if (!activeScheduleId || activeScheduleId !== configMatchId) { // Waiting for activeScheduleId to sync with configMatchId
            shouldBeLoading = true;
        } else if (!matchDetailsLoaded || juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined) {
            // Data for the active match is still loading
            shouldBeLoading = true;
        } else { // All essential data for the active match is loaded
            shouldBeLoading = false;
        }
    }
    
    if (isLoading !== shouldBeLoading) {
        setIsLoading(shouldBeLoading);
    }

    if (shouldBeLoading) return; // Don't proceed to score calculation if still loading


    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];
    if (allJuriDataInput.length === 0 && prevSavedUnstruckKeys.size === 0 && prevSavedStruckKeys.size === 0 && ketuaActionsLog.length === 0 && activeScheduleId) {
        setConfirmedScoreBiru(0);
        setConfirmedScoreMerah(0);
        // If activeScheduleId exists but all scores are zero and logs empty, it means it's a fresh/reset match, not loading.
        // This check for activeScheduleId prevents setting loading to false too early if there's simply no active match.
        return;
    }
    
    const currentUnstruckKeys = new Set(prevSavedUnstruckKeys);
    const currentStruckKeys = new Set(prevSavedStruckKeys);
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
              console.warn(`[Dewan-1] Skipping entry due to invalid timestamp. Juri: ${juriData.juriId}, Color: ${pesilatColor}, Round: ${roundKey}`);
            }
          });
        });
      });
    });
    allRawEntries.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    const newlyProcessedInThisCycle = new Set<string>(); 

    for (let i = 0; i < allRawEntries.length; i++) {
      const e1 = allRawEntries[i];
      if (currentUnstruckKeys.has(e1.key) || currentStruckKeys.has(e1.key) || newlyProcessedInThisCycle.has(e1.key)) {
        continue;
      }

      for (let j = i + 1; j < allRawEntries.length; j++) {
        const e2 = allRawEntries[j];
        if (currentUnstruckKeys.has(e2.key) || currentStruckKeys.has(e2.key) || newlyProcessedInThisCycle.has(e2.key)) {
          continue;
        }

        if (e1.juriId !== e2.juriId &&
            e1.round === e2.round &&
            e1.color === e2.color &&
            e1.points === e2.points &&
            Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
          
          currentUnstruckKeys.add(e1.key);
          currentUnstruckKeys.add(e2.key);
          newlyProcessedInThisCycle.add(e1.key);
          newlyProcessedInThisCycle.add(e2.key);
          for (let k = j + 1; k < allRawEntries.length; k++) {
              const e3 = allRawEntries[k];
              if (currentUnstruckKeys.has(e3.key) || currentStruckKeys.has(e3.key) || newlyProcessedInThisCycle.has(e3.key)) continue;
              if (e3.juriId !== e1.juriId && e3.juriId !== e2.juriId &&
                  e3.round === e1.round && e3.color === e1.color && e3.points === e1.points &&
                  Math.abs(e3.timestamp.toMillis() - e1.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS && 
                  Math.abs(e3.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                  currentUnstruckKeys.add(e3.key);
                  newlyProcessedInThisCycle.add(e3.key);
                  break; 
              }
          }
          break; 
        }
      }
    }

    const now = Date.now();
    allRawEntries.forEach(entry => {
      if (!currentUnstruckKeys.has(entry.key) && !currentStruckKeys.has(entry.key)) { 
        if (now - entry.timestamp.toMillis() > GRACE_PERIOD_FOR_STRIKE_DECISION) {
          currentStruckKeys.add(entry.key);
        }
      }
    });
    
    setAllContributingEntryKeys(new Set(currentUnstruckKeys));
    setPermanentlyStruckEntryKeys(new Set(currentStruckKeys));

    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const scoredPairKeys = new Set<string>(); 

    const unstruckEntries = allRawEntries.filter(e => currentUnstruckKeys.has(e.key));

    for (let i = 0; i < unstruckEntries.length; i++) {
        const e1 = unstruckEntries[i];
        if (scoredPairKeys.has(e1.key)) continue;

        const agreeingPartners = [e1];
        for (let j = i + 1; j < unstruckEntries.length; j++) {
            const e2 = unstruckEntries[j];
            if (scoredPairKeys.has(e2.key)) continue;

            if (e1.juriId !== e2.juriId &&
                e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                agreeingPartners.push(e2);
            }
        }
        
        if (agreeingPartners.length >= 2) { 
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;
            
            agreeingPartners.forEach(p => scoredPairKeys.add(p.key));
        }
    }
    
    ketuaActionsLog.forEach(action => {
        if (action.pesilatColor === 'merah') {
            calculatedTotalMerah += action.points;
        } else if (action.pesilatColor === 'biru') {
            calculatedTotalBiru += action.points;
        }
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);


    if (activeScheduleId) {
      const newUnstruckLogArray = Array.from(currentUnstruckKeys);
      let unstruckChanged = newUnstruckLogArray.length !== prevSavedUnstruckKeys.size || !newUnstruckLogArray.every(k => prevSavedUnstruckKeys.has(k));
      
      const newStruckLogArray = Array.from(currentStruckKeys);
      let struckChanged = newStruckLogArray.length !== prevSavedStruckKeys.size || !newStruckLogArray.every(k => prevSavedStruckKeys.has(k));

      const updates: { [key: string]: any } = {};
      if (unstruckChanged) {
        updates.confirmed_unstruck_keys_log = newUnstruckLogArray;
      }
      if (struckChanged) {
        updates.confirmed_struck_keys_log = newStruckLogArray;
      }

      if (Object.keys(updates).length > 0) {
        const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
        updateDoc(doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId), updates)
          .then(() => {
            // Rely on onSnapshot to update prevSavedUnstruckKeys and prevSavedStruckKeys
          }).catch(err => console.error(`[Dewan-1] Error updating Firestore logs at path '${matchDocPath}':`, err));
      }
    }
  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetailsLoaded, prevSavedUnstruckKeys, prevSavedStruckKeys, ketuaActionsLog, configMatchId, isLoading]); 


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        if (activeScheduleId) { // Check activeScheduleId again inside interval, as it might change
            try {
                const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                const currentDBDoc = await getDoc(matchDocRef);

                if (!currentDBDoc.exists()) { // Document might have been deleted
                    if(interval) clearInterval(interval);
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Stop local timer if doc is gone
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                // Stop if dewan is no longer running the timer or if local state is out of sync
                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) {
                    setTimerStatus(prev => ({
                        ...prev,
                        isTimerRunning: false,
                        ...(currentDBTimerStatus && { // Sync with DB if it exists
                            timerSeconds: currentDBTimerStatus.timerSeconds,
                            matchStatus: currentDBTimerStatus.matchStatus,
                            currentRound: currentDBTimerStatus.currentRound
                        })
                    }));
                    if(interval) clearInterval(interval);
                    return;
                }
                 // Additional check: if the local component timer is not supposed to be running, clear interval.
                 if (!timerStatus.isTimerRunning) { 
                    if (interval) clearInterval(interval);
                    return;
                }


                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false; // Timer stops when it hits 0
                    newMatchStatus = `FinishedRound${currentDBTimerStatus.currentRound}` as TimerMatchStatus;
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
                // Local state timerStatus will be updated by the onSnapshot listener for matchDocRef
            } catch (e) {
                console.error(`[Dewan-1] Error updating timer in interval for path '${MATCHES_TANDING_COLLECTION}/${activeScheduleId}': `, e);
                 if(interval) clearInterval(interval); // Stop on error
                 setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Ensure local timer stops
            }
        } else {
             if(interval) clearInterval(interval); // activeScheduleId became null, stop.
        }
      }, 1000);
    } else if (!timerStatus.isTimerRunning || timerStatus.timerSeconds === 0) { // Ensure interval is cleared if not running or time is up
        if(interval) clearInterval(interval);
    }
    return () => { // Cleanup function
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, activeScheduleId]);


  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      const docSnap = await getDoc(matchDocRef);
      // Use current Firestore state as base if available, otherwise use local state
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status
                                   ? docSnap.data()?.timer_status as TimerStatus
                                   : timerStatus; // Fallback to local timerStatus if doc doesn't exist or has no timer_status

      const newFullStatus: TimerStatus = { 
        ...currentDBTimerStatus, // Base on DB or local if DB not available
        ...newStatusUpdates,
        roundDuration: currentDBTimerStatus.roundDuration || ROUND_DURATION_SECONDS // Ensure roundDuration is preserved or defaulted
      };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // Local state (timerStatus) will be updated by the onSnapshot listener
    } catch (e) {
      console.error(`[Dewan-1] Error updating timer status in Firestore at path '${matchDocPath}':`, e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); // timerStatus is a dep because it's used as fallback

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;

    if (action === 'start') {
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         // Ensure we are not in a "PausedForVerification" state before starting
         if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
            alert("Verifikasi sedang berlangsung. Timer tidak bisa dimulai.");
            return;
         }
         updateTimerStatusInFirestore({
             isTimerRunning: true,
             matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerMatchStatus
         });
      }
    } else if (action === 'pause') {
      if (timerStatus.isTimerRunning) {
        updateTimerStatusInFirestore({
            isTimerRunning: false,
            matchStatus: `PausedRound${timerStatus.currentRound}` as TimerMatchStatus
        });
      }
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;

    // Prevent changing round if current round is running or paused for verification
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
    if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
        alert("Verifikasi sedang berlangsung. Tidak bisa mengubah babak.");
        return;
    }


    let newMatchStatus: TimerMatchStatus = 'Pending';
    let newTimerSeconds = ROUND_DURATION_SECONDS;

    // If the match is already finished, and we are trying to set a round
    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) {
        newMatchStatus = `FinishedRound${round}` as TimerMatchStatus; // Reflect it as finished for that round
        newTimerSeconds = 0; // Time should be 0 for a finished round
    } 
    // If the current status is 'FinishedRoundX'
    else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { // Setting to a round that is already marked as finished or an earlier one
             newMatchStatus = `FinishedRound${round}` as TimerMatchStatus;
             newTimerSeconds = 0;
        } else { // Setting to a future round after a previous one was finished
            newMatchStatus = 'Pending'; // New round, should be pending
            newTimerSeconds = ROUND_DURATION_SECONDS;
        }
    }
    // If it's paused (not for verification), and we're setting a new round
    // or resetting the current round
    else if (timerStatus.matchStatus.startsWith('PausedRound')) {
        // If setting to a different round, or the same round, reset to pending
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    // If it's 'Pending' or 'Ongoing' for a *different* round than what's being set
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound !== round) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    // If it's 'Pending' or 'Ongoing' for the *same* round, reset its timer and status to Pending
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound === round) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }


     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: newTimerSeconds,
      isTimerRunning: false, // Always stop timer when setting/changing round manually
      matchStatus: newMatchStatus,
    });
  };

  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus || isLoading) return;

    // If timer is running, make them pause it first
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    const isCurrentRoundActuallyFinished = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;
    const isPausedForVerification = timerStatus.matchStatus.startsWith('PausedForVerificationRound');


    // If current round timer > 0 AND not already 'FinishedRoundX' AND not 'PausedForVerification'
    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished' && !isPausedForVerification) {
        // Confirm if they want to end the current round prematurely
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0 atau status belum 'Finished'). Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) {
            return;
        }
        // If confirmed, update current round to 'FinishedRoundX' and 0 seconds
        updateTimerStatusInFirestore({
            matchStatus: `FinishedRound${timerStatus.currentRound}` as TimerMatchStatus,
            timerSeconds: 0,
            isTimerRunning: false
        });
        // Then, the next click on "Next Action" will proceed to the next round or finish the match.
        return; // Exit here, let the user click "Next Action" again.
    }
    
    // If paused for verification, pressing "Next" (which would be "Lanjutkan Babak X")
    // should revert the status to 'Pending' for that round, keeping the current timer seconds.
    if (isPausedForVerification && timerStatus.currentRound <= TOTAL_ROUNDS) {
        updateTimerStatusInFirestore({
            // timerSeconds: timerStatus.timerSeconds, // Keep the current time
            isTimerRunning: false, // Ensure it's not running
            matchStatus: 'Pending', // Change status to Pending, Dewan can then start timer
        });
        return;
    }


    // If current round is less than total rounds and (it's finished OR it was pending/paused and now being forced next)
    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS, // Reset timer for new round
            isTimerRunning: false,
            matchStatus: 'Pending', // New round starts as pending
        });
    }
    // If it's the last round and it's not already marked as MatchFinished
    else if (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        // Mark the match as finished
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
    }
  };

  const handleResetMatch = async () => {
    if (!activeScheduleId || isLoading) {
        console.warn("[Dewan-1] Reset aborted: no active schedule ID or still loading.");
        return;
    }
    if (!confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    setIsLoading(true); // Set loading true during reset
    const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
    try {
        const batch = writeBatch(db);

        // Reset main match document (timer and logs)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, {
            timer_status: initialTimerStatus,
            confirmed_unstruck_keys_log: [],
            confirmed_struck_keys_log: []
        }, { merge: true }); // Use merge true to overwrite specific fields

        // Reset Juri scores
        const initialJuriDataContent: JuriMatchData = {
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(), // or serverTimestamp() if preferred
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriDataContent); // Overwrite juri scores
        });

        // Delete Ketua actions
        const ketuaActionsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, OFFICIAL_ACTIONS_SUBCOLLECTION);
        const ketuaActionsSnapshot = await getDocs(ketuaActionsCollectionRef);
        ketuaActionsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        
        // Delete Verifications
        const verificationsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'verifications');
        const verificationsSnapshot = await getDocs(verificationsCollectionRef);
        verificationsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // Local state reset is mostly handled by onSnapshot listeners reacting to Firestore changes.
        // However, explicitly setting some can make UI update faster.
        setTimerStatus(initialTimerStatus);
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        // setAllContributingEntryKeys(new Set()); // Will be reset by onSnapshot of matchDoc
        // setPermanentlyStruckEntryKeys(new Set()); // Will be reset by onSnapshot of matchDoc
        // setPrevSavedUnstruckKeys(new Set()); // Will be reset by onSnapshot of matchDoc
        // setPrevSavedStruckKeys(new Set()); // Will be reset by onSnapshot of matchDoc
        // setJuri1Scores(null); // Will be reset by onSnapshot of juriDoc
        // setJuri2Scores(null); // Will be reset by onSnapshot of juriDoc
        // setJuri3Scores(null); // Will be reset by onSnapshot of juriDoc
        // setKetuaActionsLog([]); // Will be reset by onSnapshot of ketuaActions

        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error(`[Dewan-1] Error resetting match at path '${matchDocPath}' and its subcollections:`, e);
      setError("Gagal mereset pertandingan.");
    } finally {
         setIsLoading(false); // Set loading false after reset
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
    if (timerStatus.matchStatus.startsWith("PausedForVerificationRound")) return `Babak ${timerStatus.currentRound} Verifikasi`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return `Babak ${timerStatus.currentRound} Menunggu`;
    return "Status Tidak Diketahui";
  };

  const getJuriScoreForDisplay = (
    juriId: string, 
    juriData: JuriMatchDataWithId | null,
    pesilatColor: 'merah' | 'biru',
    round: 1 | 2 | 3,
    unstruckKeys: Set<string>,
    struckKeys: Set<string>
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
        console.warn(`[Dewan-1] Invalid timestamp in getJuriScoreForDisplay. Entry:`, JSON.stringify(entry));
        return <span key={`${juriId}-${round}-${pesilatColor}-${index}-invalid`} className="mr-1.5 text-red-500">Inv!</span>;
      }

      const entryKey = `${juriData.juriId}_${entryTimestampMillis}_${entry.points}`;
      const isUnstruck = unstruckKeys.has(entryKey);
      const isPermanentlyStruck = struckKeys.has(entryKey);
      const isGracePeriodForDisplay = (Date.now() - entryTimestampMillis <= JURI_INPUT_VALIDITY_WINDOW_MS); // Visual grace, not decision grace

      const shouldDisplayAsStruck = isPermanentlyStruck || (!isUnstruck && !isGracePeriodForDisplay);

      return (
        <span key={`${juriData.juriId}-${round}-${pesilatColor}-${index}-${entryTimestampMillis}`} className={cn(shouldDisplayAsStruck && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
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

  if (isLoading && configMatchId === undefined) { // Only show initial full page loader if config ID is truly unknown
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
  
  if (isLoading && activeScheduleId && !matchDetailsLoaded) { // Loading data for a specific match
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


   if (!activeScheduleId && !isLoading && configMatchId === null) { // Config loaded, no active schedule
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

  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai' 
    : timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? `Lanjutkan Babak ${timerStatus.currentRound}`
    : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');

  const isNextActionPossible: boolean =
    (timerStatus.currentRound < TOTAL_ROUNDS || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') || timerStatus.matchStatus.startsWith('PausedForVerificationRound'));

  const isTimerStartDisabled: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound') || timerStatus.matchStatus.startsWith('PausedForVerificationRound');
  const isTimerPauseDisabled: boolean = !activeScheduleId || isLoading || !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound"); // Also disable if ongoing
  const isResetButtonDisabled: boolean = !activeScheduleId || isLoading;

  const isBabakButtonDisabled = (round: number): boolean => {
    if (!activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.matchStatus.startsWith('PausedForVerificationRound')) return true;
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
            <div className={cn(
                "text-3xl md:text-5xl font-mono font-bold",
                timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-500" : "text-gray-800 dark:text-gray-200"
                )}>{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerification') ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${
                    timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerification')
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
             <p className={cn("text-xs text-center px-1 font-semibold",
                timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"
             )}>{getMatchStatusText()}</p>
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
                 <CardDescription>
                    Nilai hanya sah jika dua juri atau lebih memberikan nilai yang sama (poin 1 atau 2) untuk warna dan babak yang sama dalam selang waktu {JURI_INPUT_VALIDITY_WINDOW_MS / 1000} detik.
                    Nilai yang SAH akan ditampilkan normal dan dihitung.
                    Nilai yang baru masuk akan memiliki masa tenggang {JURI_INPUT_VALIDITY_WINDOW_MS / 1000} detik sebelum dicoret jika tidak menemukan pasangan.
                    Jika sebuah nilai solo (tidak punya pasangan) setelah {GRACE_PERIOD_FOR_STRIKE_DECISION / 1000} detik, nilai tersebut akan DICORET PERMANEN.
                    Status TERCORER atau TIDAK TERCORER bersifat final setelah diputuskan.
                 </CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx];
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                            {jS && (
                                <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3, allContributingEntryKeys, permanentlyStruckEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3, allContributingEntryKeys, permanentlyStruckEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
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
