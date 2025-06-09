
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogVerificationDescription } from "@/components/ui/dialog";
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2, Vote } from 'lucide-react';
import type { ScheduleTanding, KetuaActionLogEntry, TimerStatus, TimerMatchStatus, VerificationRequest, JuriVoteValue } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, updateDoc, writeBatch, collection, query, orderBy, getDocs, deleteDoc, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions'; 
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const ROUND_DURATION_SECONDS = 120; 
const TOTAL_ROUNDS = 3;
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;
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

  const [activeDisplayVerificationRequest, setActiveDisplayVerificationRequest] = useState<VerificationRequest | null>(null);
  const [isDisplayVerificationModalOpen, setIsDisplayVerificationModalOpen] = useState(false);


  useEffect(() => { // Effect C: Listens to Firestore for active match config
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => { 
        if (prevId === newDbConfigId) { 
          return prevId;
        }
        return newDbConfigId; 
      });
    }, (err) => {
      console.error(`[Dewan-1] Error fetching active schedule config from path '${ACTIVE_TANDING_SCHEDULE_CONFIG_PATH}':`, err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null); 
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
      setActiveDisplayVerificationRequest(null);
      setIsDisplayVerificationModalOpen(false);
      setError(null);
    };

    if (configMatchId === undefined) {
      setIsLoading(true);
      return () => { mounted = false; };
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

    if (configMatchId !== activeScheduleId) {
      resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
      setActiveScheduleId(configMatchId);
      // setIsLoading(true); // Removed as per previous fix
      return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
    }

    setIsLoading(true); 
    
    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (!mounted) return;
        if (scheduleDocSnap.exists()) { 
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
              setAllContributingEntryKeys(firestoreUnstruckKeys); 
              setPrevSavedStruckKeys(firestoreStruckKeys);
              setPermanentlyStruckEntryKeys(firestoreStruckKeys); 
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
                if (mounted) {
                    setTimerStatus(initialTimerStatus);
                    setPrevSavedUnstruckKeys(new Set());
                    setAllContributingEntryKeys(new Set());
                    setPrevSavedStruckKeys(new Set());
                    setPermanentlyStruckEntryKeys(new Set());
                }
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

        // Listener for verification display
        const verificationQuery = query(
          collection(db, MATCHES_TANDING_COLLECTION, currentMatchId, VERIFICATIONS_SUBCOLLECTION),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const unsubVerificationDisplay = onSnapshot(verificationQuery, (snapshot) => {
          if (!mounted) return;
          if (!snapshot.empty) {
            const latestVerification = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
            if (latestVerification.status === 'pending') {
              setActiveDisplayVerificationRequest(latestVerification);
              setIsDisplayVerificationModalOpen(true);
            } else {
              setActiveDisplayVerificationRequest(null);
              setIsDisplayVerificationModalOpen(false);
            }
          } else {
            setActiveDisplayVerificationRequest(null);
            setIsDisplayVerificationModalOpen(false);
          }
        }, (err) => {
          if (mounted) {
            console.error(`[Dewan-1] Error fetching verification for display:`, err);
            setActiveDisplayVerificationRequest(null);
            setIsDisplayVerificationModalOpen(false);
          }
        });
        if (mounted) unsubscribers.push(unsubVerificationDisplay);


      } catch (err) {
        if (mounted) {
          console.error("[Dewan-1] Error in loadData function:", err);
          setError("Gagal memuat data pertandingan.");
        }
      }
    };

    if (activeScheduleId) { 
      loadData(activeScheduleId);
    } else {
      setIsLoading(false); 
    }
    
    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]); 


  useEffect(() => { // Effect B: Score calculation and final loading status
    let shouldBeLoading = false;
    if (configMatchId === undefined) { 
        shouldBeLoading = true;
    } else if (configMatchId === null) { 
        shouldBeLoading = false;
    } else { 
        if (!activeScheduleId || activeScheduleId !== configMatchId) { 
            shouldBeLoading = true;
        } else if (!matchDetailsLoaded || juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined) {
            shouldBeLoading = true;
        } else { 
            shouldBeLoading = false;
        }
    }
    
    if (isLoading !== shouldBeLoading) {
        setIsLoading(shouldBeLoading);
    }


    if (shouldBeLoading) return; 


    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];
    if (allJuriDataInput.length === 0 && prevSavedUnstruckKeys.size === 0 && prevSavedStruckKeys.size === 0 && ketuaActionsLog.length === 0 && activeScheduleId) {
        setConfirmedScoreBiru(0);
        setConfirmedScoreMerah(0);
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
  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetailsLoaded, prevSavedUnstruckKeys, prevSavedStruckKeys, ketuaActionsLog, configMatchId ]); 


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        if (activeScheduleId) { 
            try {
                const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
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
            } catch (e) {
                console.error(`[Dewan-1] Error updating timer in interval for path '${MATCHES_TANDING_COLLECTION}/${activeScheduleId}': `, e);
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
    const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status
                                   ? docSnap.data()?.timer_status as TimerStatus
                                   : timerStatus; 

      const newFullStatus: TimerStatus = { 
        ...currentDBTimerStatus, 
        ...newStatusUpdates,
        roundDuration: currentDBTimerStatus.roundDuration || ROUND_DURATION_SECONDS 
      };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
    } catch (e) {
      console.error(`[Dewan-1] Error updating timer status in Firestore at path '${matchDocPath}':`, e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); 

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;

    if (action === 'start') {
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
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

    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) {
        newMatchStatus = `FinishedRound${round}` as TimerMatchStatus; 
        newTimerSeconds = 0; 
    } 
    else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { 
             newMatchStatus = `FinishedRound${round}` as TimerMatchStatus;
             newTimerSeconds = 0;
        } else { 
            newMatchStatus = 'Pending'; 
            newTimerSeconds = ROUND_DURATION_SECONDS;
        }
    }
    else if (timerStatus.matchStatus.startsWith('PausedRound')) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound !== round) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound === round) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
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
    const isPausedForVerification = timerStatus.matchStatus.startsWith('PausedForVerificationRound');


    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished' && !isPausedForVerification) {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0 atau status belum 'Finished'). Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) {
            return;
        }
        updateTimerStatusInFirestore({
            matchStatus: `FinishedRound${timerStatus.currentRound}` as TimerMatchStatus,
            timerSeconds: 0,
            isTimerRunning: false
        });
        return; 
    }
    
    if (isPausedForVerification && timerStatus.currentRound <= TOTAL_ROUNDS) {
        updateTimerStatusInFirestore({
            isTimerRunning: false, 
            matchStatus: 'Pending', 
        });
        return;
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
    if (!activeScheduleId || isLoading) {
        console.warn("[Dewan-1] Reset aborted: no active schedule ID or still loading.");
        return;
    }
    if (!confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;

    setIsLoading(true); 
    const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
    try {
        const batch = writeBatch(db);

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, {
            timer_status: initialTimerStatus,
            confirmed_unstruck_keys_log: [],
            confirmed_struck_keys_log: []
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

        const ketuaActionsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, OFFICIAL_ACTIONS_SUBCOLLECTION);
        const ketuaActionsSnapshot = await getDocs(ketuaActionsCollectionRef);
        ketuaActionsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        
        const verificationsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, VERIFICATIONS_SUBCOLLECTION);
        const verificationsSnapshot = await getDocs(verificationsCollectionRef);
        verificationsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        setTimerStatus(initialTimerStatus);
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error(`[Dewan-1] Error resetting match at path '${matchDocPath}' and its subcollections:`, e);
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
      const isGracePeriodForDisplay = (Date.now() - entryTimestampMillis <= JURI_INPUT_VALIDITY_WINDOW_MS); 

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

  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-red-500 text-white";
    if (vote === 'biru') return "bg-blue-500 text-white";
    if (vote === 'invalid') return "bg-yellow-400 text-black";
    return "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"; // Default for no vote
  };


  if (isLoading && configMatchId === undefined) { 
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
  
  if (isLoading && activeScheduleId && !matchDetailsLoaded) { 
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


   if (!activeScheduleId && !isLoading && configMatchId === null) { 
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
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound"); 
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

        {/* Verification Display Modal */}
        <Dialog open={isDisplayVerificationModalOpen} onOpenChange={setIsDisplayVerificationModalOpen}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold font-headline text-center">Verifikasi Juri</DialogTitle>
              {activeDisplayVerificationRequest && (
                <DialogVerificationDescription className="text-center mt-2">
                  <div className="text-lg font-semibold">
                    {activeDisplayVerificationRequest.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                  </div>
                  <div className="text-sm text-muted-foreground">Babak {activeDisplayVerificationRequest.round}</div>
                </DialogVerificationDescription>
              )}
            </DialogHeader>
            <div className="my-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 items-stretch justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => (
                  <div key={`vote-display-${juriKey}`} className="flex flex-col items-center space-y-2">
                    <p className="text-lg font-semibold">J{index + 1}</p>
                    <div className={cn("w-full h-16 rounded-md flex items-center justify-center text-sm font-medium p-2 shadow", 
                                      getJuriVoteDisplayBoxClass(activeDisplayVerificationRequest?.votes[juriKey] || null))}>
                      {activeDisplayVerificationRequest?.votes[juriKey] === 'merah' ? 'SUDUT MERAH' :
                       activeDisplayVerificationRequest?.votes[juriKey] === 'biru' ? 'SUDUT BIRU' :
                       activeDisplayVerificationRequest?.votes[juriKey] === 'invalid' ? 'INVALID' : 
                       'Belum Vote'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* This modal is display-only for Dewan, no footer/actions needed here */}
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}

