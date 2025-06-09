
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogVerificationDescriptionElement } from "@/components/ui/dialog"; // Renamed to avoid conflict
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

    if (configMatchId === undefined) { // Condition 1: configMatchId is still being fetched
      setIsLoading(true);
      return () => { mounted = false; };
    }

    if (configMatchId === null) { // Condition 2: configMatchId is fetched and is null (no active match)
      if (activeScheduleId !== null) { // If there was a previous active match, reset everything
        resetAllMatchData("configMatchId became null");
        setActiveScheduleId(null);
      } else { // No previous active match, just ensure loading is false and error is set
         setIsLoading(false);
         setError("Tidak ada jadwal pertandingan yang aktif.");
      }
      return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
    }

    // Condition 3: configMatchId is fetched and is not null, BUT it's different from current activeScheduleId
    // This means the active match has changed. Reset data, set new activeScheduleId, and trigger loading.
    if (configMatchId !== activeScheduleId) {
      resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
      setActiveScheduleId(configMatchId);
      // setIsLoading(true); // Removed this line, loading state set before loadData
      return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
    }

    // If we reach here, configMatchId is valid, and activeScheduleId is in sync with it.
    // This is where data loading for the *current* active match happens.
    setIsLoading(true);

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;

      try {
        // Fetch Schedule Details
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
          return; // Stop further loading if schedule details not found
        }

        // Listen to Match Data (timer, confirmed keys log)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        const unsubMatchData = onSnapshot(matchDocRef, async (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Update timer status
            if (data?.timer_status) {
              if (mounted) setTimerStatus(data.timer_status as TimerStatus);
            }
            // Update confirmed keys logs
            const firestoreUnstruckKeys = new Set(data?.confirmed_unstruck_keys_log as string[] || []);
            const firestoreStruckKeys = new Set(data?.confirmed_struck_keys_log as string[] || []);
            if (mounted) {
              setPrevSavedUnstruckKeys(firestoreUnstruckKeys);
              setAllContributingEntryKeys(firestoreUnstruckKeys); // Initialize contributing keys with confirmed ones
              setPrevSavedStruckKeys(firestoreStruckKeys);
              setPermanentlyStruckEntryKeys(firestoreStruckKeys); // Initialize struck keys with confirmed ones
            }
          } else {
            // If match document doesn't exist, create it with initial data
            if (mounted) {
              const initialDataForMatch = {
                timer_status: initialTimerStatus,
                confirmed_unstruck_keys_log: [],
                confirmed_struck_keys_log: []
              };
              try {
                await setDoc(matchDocRef, initialDataForMatch, { merge: true });
                // Update local state after setting initial document
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

        // Listen to Juri Scores
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocPath = `${MATCHES_TANDING_COLLECTION}/${currentMatchId}/juri_scores/${juriId}`;
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (!mounted) return;
            if (docSnap.exists()) {
              if (mounted) juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              if (mounted) juriSetters[index](null); // Juri data not found
            }
          }, (err) => {
            if (mounted) {
              console.error(`[Dewan-1] Error fetching scores for ${juriId} from path '${juriDocPath}':`, err);
              juriSetters[index](null); // Set to null on error
            }
          });
          if (mounted) unsubscribers.push(unsubJuri);
        });

        // Listen to Ketua Actions Log
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
                 setKetuaActionsLog([]); // Reset to empty on error
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
              // If status is not pending (e.g. completed, cancelled), close the modal
              setActiveDisplayVerificationRequest(null);
              setIsDisplayVerificationModalOpen(false);
            }
          } else {
            // No verifications found or the latest is not pending
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

    // Only call loadData if activeScheduleId is valid.
    if (activeScheduleId) {
      loadData(activeScheduleId);
    } else {
      // This case should ideally be handled by Condition 2, but as a fallback:
      setIsLoading(false);
    }

    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]);


  useEffect(() => { // Effect B: Score calculation and final loading status
    // Determine if we should still be in a loading state
    let shouldBeLoading = false;
    if (configMatchId === undefined) { // Config still loading
        shouldBeLoading = true;
    } else if (configMatchId === null) { // No active match config
        shouldBeLoading = false;
    } else { // Active match config exists
        if (!activeScheduleId || activeScheduleId !== configMatchId) { // Syncing activeScheduleId with config
            shouldBeLoading = true;
        } else if (!matchDetailsLoaded || juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined) {
            // Data for the current activeScheduleId is still loading (match details or any juri score still undefined)
            shouldBeLoading = true;
        } else { // All necessary data for the current activeScheduleId is loaded
            shouldBeLoading = false;
        }
    }

    // Update isLoading state only if it needs to change
    if (isLoading !== shouldBeLoading) {
        setIsLoading(shouldBeLoading);
    }


    if (shouldBeLoading) return; // Don't proceed with calculations if still loading


    // Perform score calculations only when not loading and activeScheduleId is set
    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];
    // If no juri data, no saved keys, and no ketua actions for the active match, scores are 0.
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
            // Ensure timestamp is valid and has toMillis method
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
              // Log or handle invalid entry if necessary
              console.warn(`[Dewan-1] Skipping entry due to invalid timestamp. Juri: ${juriData.juriId}, Color: ${pesilatColor}, Round: ${roundKey}`);
            }
          });
        });
      });
    });
    allRawEntries.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    // Determine unstruck and struck keys
    const newlyProcessedInThisCycle = new Set<string>(); // To avoid double-processing within this same calculation cycle

    for (let i = 0; i < allRawEntries.length; i++) {
      const e1 = allRawEntries[i];
      if (currentUnstruckKeys.has(e1.key) || currentStruckKeys.has(e1.key) || newlyProcessedInThisCycle.has(e1.key)) {
        continue; // Already processed or part of a confirmed pair/strike
      }

      // Check for agreeing partners
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

          // Found a pair
          currentUnstruckKeys.add(e1.key);
          currentUnstruckKeys.add(e2.key);
          newlyProcessedInThisCycle.add(e1.key); // Mark as processed in this cycle
          newlyProcessedInThisCycle.add(e2.key);
          // Check for a third agreeing juri (optional, for 3/3 agreement)
          for (let k = j + 1; k < allRawEntries.length; k++) {
              const e3 = allRawEntries[k];
              if (currentUnstruckKeys.has(e3.key) || currentStruckKeys.has(e3.key) || newlyProcessedInThisCycle.has(e3.key)) continue;
              if (e3.juriId !== e1.juriId && e3.juriId !== e2.juriId &&
                  e3.round === e1.round && e3.color === e1.color && e3.points === e1.points &&
                  Math.abs(e3.timestamp.toMillis() - e1.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS &&
                  Math.abs(e3.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                  currentUnstruckKeys.add(e3.key);
                  newlyProcessedInThisCycle.add(e3.key);
                  break; // Found a third, no need to look further for this pair
              }
          }
          break; // Move to the next entry in allRawEntries
        }
      }
    }

    // Strike entries that are past the grace period and not unstruck
    const now = Date.now();
    allRawEntries.forEach(entry => {
      if (!currentUnstruckKeys.has(entry.key) && !currentStruckKeys.has(entry.key)) { // Not unstruck and not already struck
        if (now - entry.timestamp.toMillis() > GRACE_PERIOD_FOR_STRIKE_DECISION) {
          currentStruckKeys.add(entry.key);
        }
      }
    });

    // Update state for display
    setAllContributingEntryKeys(new Set(currentUnstruckKeys));
    setPermanentlyStruckEntryKeys(new Set(currentStruckKeys));

    // Calculate total scores based on *currentUnstruckKeys* only
    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const scoredPairKeys = new Set<string>(); // To ensure each point is scored once per agreement

    const unstruckEntries = allRawEntries.filter(e => currentUnstruckKeys.has(e.key));

    // Iterate through unstruck entries to find agreeing pairs/triplets for scoring
    for (let i = 0; i < unstruckEntries.length; i++) {
        const e1 = unstruckEntries[i];
        if (scoredPairKeys.has(e1.key)) continue; // Already part of a scored group

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

        // Score if at least 2 juri agree
        if (agreeingPartners.length >= 2) {
            const points = e1.points; // All partners have the same points
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;

            // Mark all contributing partners as scored for this specific agreement instance
            agreeingPartners.forEach(p => scoredPairKeys.add(p.key));
        }
    }

    // Add points from Ketua's actions
    ketuaActionsLog.forEach(action => {
        if (action.pesilatColor === 'merah') {
            calculatedTotalMerah += action.points;
        } else if (action.pesilatColor === 'biru') {
            calculatedTotalBiru += action.points;
        }
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);


    // Persist updated confirmed_unstruck_keys_log and confirmed_struck_keys_log to Firestore
    // Only if there's an active schedule and there's a change in keys
    if (activeScheduleId) {
      const newUnstruckLogArray = Array.from(currentUnstruckKeys);
      // Check if the new unstruck log is different from the previously saved one
      let unstruckChanged = newUnstruckLogArray.length !== prevSavedUnstruckKeys.size ||
                           !newUnstruckLogArray.every(k => prevSavedUnstruckKeys.has(k));

      const newStruckLogArray = Array.from(currentStruckKeys);
      // Check if the new struck log is different from the previously saved one
      let struckChanged = newStruckLogArray.length !== prevSavedStruckKeys.size ||
                         !newStruckLogArray.every(k => prevSavedStruckKeys.has(k));

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
            // The onSnapshot listener for matchDocRef will update prevSavedUnstruckKeys and prevSavedStruckKeys
            // So, no need to set them directly here.
          }).catch(err => console.error(`[Dewan-1] Error updating Firestore logs at path '${matchDocPath}':`, err));
      }
    }
  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetailsLoaded, prevSavedUnstruckKeys, prevSavedStruckKeys, ketuaActionsLog, configMatchId ]);


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        if (activeScheduleId) { // Ensure activeScheduleId is still valid
            try {
                const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                // Get the most recent timer status from Firestore *before* decrementing
                const currentDBDoc = await getDoc(matchDocRef);

                // If doc doesn't exist (e.g., match reset by another client), stop timer locally.
                if (!currentDBDoc.exists()) {
                    if(interval) clearInterval(interval);
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Stop local timer
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                // If timer is not running in DB (e.g., paused by another client), sync local state and stop.
                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) {
                    setTimerStatus(prev => ({
                        ...prev,
                        isTimerRunning: false,
                        ...(currentDBTimerStatus && { // Sync other timer fields if available
                            timerSeconds: currentDBTimerStatus.timerSeconds,
                            matchStatus: currentDBTimerStatus.matchStatus,
                            currentRound: currentDBTimerStatus.currentRound
                        })
                    }));
                    if(interval) clearInterval(interval);
                    return;
                }
                 // Defensive check: if local timerStatus.isTimerRunning became false for any reason, stop interval.
                 if (!timerStatus.isTimerRunning) {
                    if (interval) clearInterval(interval);
                    return;
                }


                // Proceed with decrementing timer based on DB's current state
                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus: TimerMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false; // Stop timer when it reaches 0
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

                // Update Firestore with the new decremented status
                await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
                // Local state will be updated by the onSnapshot listener for matchDocRef
            } catch (e) {
                console.error(`[Dewan-1] Error updating timer in interval for path '${MATCHES_TANDING_COLLECTION}/${activeScheduleId}': `, e);
                 if(interval) clearInterval(interval); // Stop on error
                 setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Attempt to stop local timer
            }
        } else {
             if(interval) clearInterval(interval); // Stop if activeScheduleId becomes null
        }
      }, 1000);
    } else if (!timerStatus.isTimerRunning || timerStatus.timerSeconds === 0) { // Ensure interval is cleared if timer shouldn't run
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
      // Get current DB state to merge with new updates, ensuring consistency
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status
                                   ? docSnap.data()?.timer_status as TimerStatus
                                   : timerStatus; // Fallback to local state if doc doesn't exist (should be rare)

      const newFullStatus: TimerStatus = {
        ...currentDBTimerStatus,
        ...newStatusUpdates,
        roundDuration: currentDBTimerStatus.roundDuration || ROUND_DURATION_SECONDS // Ensure roundDuration is preserved
      };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // Local state `timerStatus` will be updated by the onSnapshot listener.
    } catch (e) {
      console.error(`[Dewan-1] Error updating timer status in Firestore at path '${matchDocPath}':`, e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); // timerStatus is a dependency to ensure currentDBTimerStatus fallback is up-to-date if needed

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;

    if (action === 'start') {
      // Can only start if timer > 0, not already running, and not in a paused verification state
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
            alert("Verifikasi sedang berlangsung. Timer tidak bisa dimulai.");
            return;
         }
         // Update Firestore. Local state will follow via onSnapshot.
         updateTimerStatusInFirestore({
             isTimerRunning: true,
             matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerMatchStatus
         });
      }
    } else if (action === 'pause') {
      if (timerStatus.isTimerRunning) {
        // Update Firestore. Local state will follow.
        updateTimerStatusInFirestore({
            isTimerRunning: false,
            matchStatus: `PausedRound${timerStatus.currentRound}` as TimerMatchStatus
        });
      }
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;

    // Prevent changing babak if timer is running or verification is in progress
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

    // Logic to determine new status and seconds based on current state and target round
    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) {
        // If match finished but setting to a previous/current round, treat it as reviewing that finished round
        newMatchStatus = `FinishedRound${round}` as TimerMatchStatus;
        newTimerSeconds = 0; // Timer should be 0 for finished rounds
    }
    // If current status is a finished round
    else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { // Target round is the same or earlier finished round
             newMatchStatus = `FinishedRound${round}` as TimerMatchStatus;
             newTimerSeconds = 0;
        } else { // Target round is a future round, set to pending
            newMatchStatus = 'Pending';
            newTimerSeconds = ROUND_DURATION_SECONDS;
        }
    }
    // If current status is a paused round (not verification pause)
    else if (timerStatus.matchStatus.startsWith('PausedRound')) {
        // Changing babak from a paused state should reset to 'Pending' for the target babak
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    // If current status is 'Pending' or 'Ongoing', and target round is different
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound !== round) {
        newMatchStatus = 'Pending';
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }
    // If current status is 'Pending' or 'Ongoing', and target round is the same (e.g. "resetting" current round to pending)
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound')) && timerStatus.currentRound === round) {
        newMatchStatus = 'Pending'; // Reset to pending for the same round
        newTimerSeconds = ROUND_DURATION_SECONDS;
    }


    // Update Firestore. Local state will follow.
     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: newTimerSeconds,
      isTimerRunning: false, // Changing babak always stops the timer
      matchStatus: newMatchStatus,
    });
  };

  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus || isLoading) return;

    // If timer is running, it must be paused first
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    const isCurrentRoundActuallyFinished = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;
    const isPausedForVerification = timerStatus.matchStatus.startsWith('PausedForVerificationRound');


    // If the current round is not yet marked as 'FinishedRoundX' with timer 0,
    // and not paused for verification, then this action marks it as finished.
    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished' && !isPausedForVerification) {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0 atau status belum 'Finished'). Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) {
            return;
        }
        // Mark current round as finished
        updateTimerStatusInFirestore({
            matchStatus: `FinishedRound${timerStatus.currentRound}` as TimerMatchStatus,
            timerSeconds: 0,
            isTimerRunning: false
        });
        return; // Stop here, next press will advance to next round or finish match
    }

    // If paused for verification, this action resumes the flow for that round, setting it to 'Pending'
    if (isPausedForVerification && timerStatus.currentRound <= TOTAL_ROUNDS) {
        updateTimerStatusInFirestore({
            isTimerRunning: false, // Keep timer paused
            matchStatus: 'Pending', // Set to pending for the current round to allow Dewan to restart
        });
        return;
    }


    // If current round is finished (or was just marked finished above), advance to next round or finish match
    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS, // Reset timer for new round
            isTimerRunning: false,
            matchStatus: 'Pending', // New round starts as pending
        });
    }
    // If current round is the last round and it's finished, mark match as finished
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

    setIsLoading(true); // Indicate loading during reset
    const matchDocPath = `${MATCHES_TANDING_COLLECTION}/${activeScheduleId}`;
    try {
        const batch = writeBatch(db);

        // Reset main match document (timer status and score logs)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, {
            timer_status: initialTimerStatus,
            confirmed_unstruck_keys_log: [],
            confirmed_struck_keys_log: []
        }, { merge: true }); // Use merge:true to overwrite, or set to replace fully

        // Reset (or delete and recreate) juri_scores subcollection documents
        const initialJuriDataContent: JuriMatchData = {
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(), // Optional: mark when it was reset
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriDataContent); // Overwrite with initial empty scores
        });

        // Delete all documents in official_actions subcollection
        const ketuaActionsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, OFFICIAL_ACTIONS_SUBCOLLECTION);
        const ketuaActionsSnapshot = await getDocs(ketuaActionsCollectionRef);
        ketuaActionsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // Delete all documents in verifications subcollection
        const verificationsCollectionRef = collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, VERIFICATIONS_SUBCOLLECTION);
        const verificationsSnapshot = await getDocs(verificationsCollectionRef);
        verificationsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // Local state will be reset by onSnapshot listeners reacting to Firestore changes.
        // However, explicitly setting timerStatus and scores can make UI update faster.
        setTimerStatus(initialTimerStatus);
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        // setKetuaActionsLog([]); // Will be cleared by its onSnapshot
        // Juri scores will be cleared by their onSnapshots
        // Verification details will be cleared by its onSnapshot
        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error(`[Dewan-1] Error resetting match at path '${matchDocPath}' and its subcollections:`, e);
      setError("Gagal mereset pertandingan.");
    } finally {
         setIsLoading(false); // Reset loading state
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

  // Helper to get individual Juri scores for display, considering struck/unstruck status
  const getJuriScoreForDisplay = (
    juriId: string,
    juriData: JuriMatchDataWithId | null,
    pesilatColor: 'merah' | 'biru',
    round: 1 | 2 | 3,
    unstruckKeys: Set<string>, // from allContributingEntryKeys state
    struckKeys: Set<string>   // from permanentlyStruckEntryKeys state
  ): React.ReactNode => {
    if (!juriData) return '-'; // Juri data not loaded yet
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';

    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      // Ensure timestamp is valid and has toMillis method
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        console.warn(`[Dewan-1] Invalid timestamp in getJuriScoreForDisplay. Entry:`, JSON.stringify(entry));
        return <span key={`${juriId}-${round}-${pesilatColor}-${index}-invalid`} className="mr-1.5 text-red-500">Inv!</span>;
      }

      const entryKey = `${juriData.juriId}_${entryTimestampMillis}_${entry.points}`;
      const isUnstruck = unstruckKeys.has(entryKey);
      const isPermanentlyStruck = struckKeys.has(entryKey);
      // Check if entry is new and within grace period (e.g., 2 seconds for display before being struck if no partner)
      // JURI_INPUT_VALIDITY_WINDOW_MS is used here as a proxy for a short visual grace period for newly entered scores.
      const isGracePeriodForDisplay = (Date.now() - entryTimestampMillis <= JURI_INPUT_VALIDITY_WINDOW_MS);

      // Determine if the entry should be displayed as struck
      // It's struck if it's in permanentlyStruckKeys OR if it's not unstruck AND past the visual grace period.
      const shouldDisplayAsStruck = isPermanentlyStruck || (!isUnstruck && !isGracePeriodForDisplay);

      return (
        <span key={`${juriData.juriId}-${round}-${pesilatColor}-${index}-${entryTimestampMillis}`} className={cn(shouldDisplayAsStruck && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ', '}{curr}</>, <></>); // Join with comma, handle single entry
  };

  const getTotalJuriRawScoreForDisplay = (juriData: JuriMatchDataWithId | null, pesilatColor: 'merah' | 'biru'): number => {
    if (!juriData) return 0;
    let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        const scoresForRound = juriData[pesilatColor]?.[roundKey];
        if (scoresForRound && Array.isArray(scoresForRound)) {
            scoresForRound.forEach(s => {
                if (s && typeof s.points === 'number') { // Check for valid score entry
                    total += s.points;
                }
            });
        }
    });
    return total;
  };

  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-red-600 text-white";
    if (vote === 'biru') return "bg-blue-600 text-white";
    if (vote === 'invalid') return "bg-yellow-400 text-black";
    return "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100";
  };


  // Loading state determination
  if (isLoading && configMatchId === undefined) { // Still waiting for initial config ID
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

  // Show loading if activeScheduleId is set but details/juri scores are not yet loaded
  if (isLoading && activeScheduleId) { // activeScheduleId is set, but some data (matchDetails, juriScores) is still loading
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


   // If no active schedule ID and not loading, show "no active match" message
   if (!activeScheduleId && !isLoading && configMatchId === null) { // configMatchId is confirmed null
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

  // Determine button disabled states
  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai'
    : timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? `Lanjutkan Babak ${timerStatus.currentRound}`
    : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');

  const isNextActionPossible: boolean =
    (timerStatus.currentRound < TOTAL_ROUNDS || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') || timerStatus.matchStatus.startsWith('PausedForVerificationRound'));

  // Disable start if: no active ID, loading, timer running, match finished, timer is 0, round finished, or paused for verification.
  const isTimerStartDisabled: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound') || timerStatus.matchStatus.startsWith('PausedForVerificationRound');
  const isTimerPauseDisabled: boolean = !activeScheduleId || isLoading || !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound");
  const isResetButtonDisabled: boolean = !activeScheduleId || isLoading;

  const isBabakButtonDisabled = (round: number): boolean => {
    // Disable if: no active ID, loading, timer running, match finished, or paused for verification.
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

        {/* Pesilat Info and Scores */}
        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          {/* Pesilat Biru */}
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

          {/* Timer and Round Controls */}
          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className={cn(
                "text-3xl md:text-5xl font-mono font-bold",
                timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-500" : "text-gray-800 dark:text-gray-200"
                )}>{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${
                    timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerificationRound')
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
                timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"
             )}>{getMatchStatusText()}</p>
          </div>

          {/* Pesilat Merah */}
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

        {/* Main Controls */}
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

         {/* Juri Status & Raw Scores */}
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
        <Dialog open={isDisplayVerificationModalOpen} onOpenChange={(isOpen) => { if (!isOpen && activeDisplayVerificationRequest?.status === 'pending') return; setIsDisplayVerificationModalOpen(isOpen); }}>
          <DialogContent className="sm:max-w-lg md:max-w-xl" onPointerDownOutside={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}} onEscapeKeyDown={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}>
            <DialogHeader>
              <DialogTitle className="text-2xl md:text-3xl font-bold font-headline text-center">
                Verifikasi Juri
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 px-2 md:px-6">
              <div className="mb-6">
                <h3 className="text-lg md:text-xl font-semibold mb-1 text-center md:text-left text-foreground">
                  Detail Verifikasi
                </h3>
                {activeDisplayVerificationRequest && (
                  <div className="text-md md:text-lg text-muted-foreground text-center md:text-left">
                    <span>
                      {activeDisplayVerificationRequest.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                    </span>
                    <span className="mx-2">|</span>
                    <span>Babak {activeDisplayVerificationRequest.round}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 md:gap-4 items-start justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => {
                  const vote = activeDisplayVerificationRequest?.votes[juriKey] || null;
                  let voteText = 'Belum Vote';
                  if (vote === 'merah') voteText = 'SUDUT MERAH';
                  else if (vote === 'biru') voteText = 'SUDUT BIRU';
                  else if (vote === 'invalid') voteText = 'INVALID';

                  return (
                    <div key={`vote-display-dewan1-${juriKey}`} className="flex flex-col items-center space-y-1 w-full">
                      <p className="text-lg md:text-xl font-bold text-foreground">J{index + 1}</p>
                      <div
                        className={cn(
                          "w-full h-16 md:h-20 rounded-lg flex items-center justify-center text-xs md:text-sm font-bold p-2 shadow-md",
                          getJuriVoteDisplayBoxClass(vote)
                        )}
                      >
                        {voteText}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* This modal is display-only for Dewan, no footer/actions needed here. It closes when verification status is no longer 'pending' */}
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}
