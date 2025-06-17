
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle as RadixDialogTitle, DialogDescription as DialogVerificationDescriptionElement } from "@/components/ui/dialog";
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2, Vote, Settings, TimerIcon, ChevronsRight, AlertTriangle } from 'lucide-react';
import type { ScheduleTanding, KetuaActionLogEntry, TimerStatus, TimerMatchStatus, VerificationRequest, JuriVoteValue, JuriMatchData as LibJuriMatchData, RoundScores as LibRoundScores, ScoreEntry as LibScoreEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, updateDoc, writeBatch, collection, query, orderBy, getDocs, deleteDoc, limit, where, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const DEFAULT_ROUND_DURATION_SECONDS = 120;
const TOTAL_ROUNDS = 3;
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;
const GRACE_PERIOD_FOR_STRIKE_DECISION = 5000;
const JURI_INPUT_VALIDITY_WINDOW_MS = 2000; 

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface ScoreEntry extends LibScoreEntry {}
interface JuriRoundScores extends LibRoundScores {}
interface JuriMatchData extends LibJuriMatchData {}
interface JuriMatchDataWithId extends JuriMatchData {
  juriId: string;
}

const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: DEFAULT_ROUND_DURATION_SECONDS,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: DEFAULT_ROUND_DURATION_SECONDS,
};

const formatLastUpdatedTimestamp = (timestamp: JuriMatchData['lastUpdated']): string => {
    if (!timestamp) return '';
    if (timestamp instanceof Date) return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (timestamp instanceof Timestamp) return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (typeof timestamp === 'object' && timestamp !== null && typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.warn("Unknown lastUpdated timestamp format:", timestamp);
    return 'Invalid Date';
};

function DewanSatuPageComponent() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined); 
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null); 
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [inputRoundDurationMinutes, setInputRoundDurationMinutes] = useState<string>((DEFAULT_ROUND_DURATION_SECONDS / 60).toString());

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
  const [isNavigatingNextMatch, setIsNavigatingNextMatch] = useState(false);

  useEffect(() => {
    if (timerStatus && timerStatus.roundDuration) {
      setInputRoundDurationMinutes((timerStatus.roundDuration / 60).toString());
    }
  }, [timerStatus.roundDuration]);

  useEffect(() => { 
    if (!gelanggangName) {
      setError("Nama gelanggang tidak ditemukan di URL.");
      setConfigMatchId(null); 
      setIsLoading(false);
      return;
    }
    setError(null); 
    setIsLoading(true);

    const unsubGelanggangMap = onSnapshot(doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      let newDbConfigId: string | null = null;
      if (docSnap.exists()) {
        newDbConfigId = docSnap.data()?.[gelanggangName] || null;
      }
      
      setConfigMatchId(prevId => {
        if (prevId === newDbConfigId) return prevId;
        return newDbConfigId;
      });

      if (!newDbConfigId) {
         setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
      }

    }, (err) => {
      console.error(`[Dewan-1] Error fetching active matches by gelanggang map from path '${ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH}':`, err);
      setError("Gagal memuat peta jadwal aktif per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);


  useEffect(() => { 
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
      if (!mounted) return;
      setMatchDetails(null); setMatchDetailsLoaded(false);
      setPesilatMerahInfo(null); setPesilatBiruInfo(null);
      setTimerStatus(prev => ({...initialTimerStatus, roundDuration: prev.roundDuration}));
      setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
      setKetuaActionsLog([]);
      setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
      setAllContributingEntryKeys(new Set()); setPermanentlyStruckEntryKeys(new Set());
      setPrevSavedUnstruckKeys(new Set()); setPrevSavedStruckKeys(new Set());
      setActiveDisplayVerificationRequest(null); setIsDisplayVerificationModalOpen(false);
      if (!error?.includes("gelanggang")) setError(null);
      setIsNavigatingNextMatch(false);
    };

    if (configMatchId === undefined) { 
      if (gelanggangName) setIsLoading(true);
      else setIsLoading(false);
      return () => { mounted = false; };
    }

    if (configMatchId === null) { 
      if (activeScheduleId !== null) {
        resetAllMatchData("configMatchId became null");
        setActiveScheduleId(null);
      }
      setIsLoading(false);
      return () => { mounted = false; };
    }

    if (configMatchId !== activeScheduleId) {
      resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
      setActiveScheduleId(configMatchId);
      return () => { mounted = false; };
    }
    
    return () => { mounted = false; };
  }, [configMatchId, activeScheduleId, gelanggangName, error]); 
  
  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status ? docSnap.data()?.timer_status as TimerStatus : initialTimerStatus;
      const newFullStatus: TimerStatus = { ...currentDBTimerStatus, ...newStatusUpdates, roundDuration: newStatusUpdates.roundDuration ?? currentDBTimerStatus.roundDuration ?? DEFAULT_ROUND_DURATION_SECONDS };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
    } catch (e) { console.error(`[Dewan-1] Error updating timer status in Firestore:`, e); setError("Gagal memperbarui status timer di server."); }
  }, [activeScheduleId]); 

  useEffect(() => { 
    if (!activeScheduleId) {
      setIsLoading(false); 
      return;
    }

    setIsLoading(true);
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async () => {
      if (!mounted) return;
      setError(null); 

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal untuk ID ${activeScheduleId} tidak ditemukan.`);
          setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
          setMatchDetailsLoaded(false);
          setIsLoading(false);
          return;
        }

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        unsubscribers.push(onSnapshot(matchDocRef, async (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) {
              const newTimerStatus = data.timer_status as TimerStatus;
              setTimerStatus(newTimerStatus);
              setInputRoundDurationMinutes((newTimerStatus.roundDuration / 60).toString());
            }
            const firestoreUnstruckKeys = new Set(data?.confirmed_unstruck_keys_log as string[] || []);
            const firestoreStruckKeys = new Set(data?.confirmed_struck_keys_log as string[] || []);
            setPrevSavedUnstruckKeys(firestoreUnstruckKeys);
            setAllContributingEntryKeys(firestoreUnstruckKeys);
            setPrevSavedStruckKeys(firestoreStruckKeys);
            setPermanentlyStruckEntryKeys(firestoreStruckKeys);
          } else {
            const initialDataForMatch = { timer_status: initialTimerStatus, confirmed_unstruck_keys_log: [], confirmed_struck_keys_log: [] };
            try {
              await setDoc(matchDocRef, initialDataForMatch, { merge: true });
              setTimerStatus(initialTimerStatus);
              setInputRoundDurationMinutes((initialTimerStatus.roundDuration / 60).toString());
              setPrevSavedUnstruckKeys(new Set()); setAllContributingEntryKeys(new Set());
              setPrevSavedStruckKeys(new Set()); setPermanentlyStruckEntryKeys(new Set());
            } catch (setErr) { console.error(`[Dewan-1] Error setting initial match data:`, setErr); }
          }
        }, (err) => { if (mounted) console.error(`[Dewan-1] Error fetching match data (timer/logs):`, err); }));
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
          unsubscribers.push(onSnapshot(juriDocRef, (docSnap) => {
            if (!mounted) return;
            if (docSnap.exists()) juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            else juriSetters[index](null);
          }, (err) => { if (mounted) { console.error(`[Dewan-1] Error fetching scores for ${juriId}:`, err); juriSetters[index](null); }}));
        });

        const ketuaActionsQuery = query(collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc"));
        unsubscribers.push(onSnapshot(ketuaActionsQuery, (querySnapshot) => {
            if (!mounted) return;
            const actions: KetuaActionLogEntry[] = querySnapshot.docs.map(d => ({ id: d.id, ...d.data(), timestamp: d.data().timestamp } as KetuaActionLogEntry));
            setKetuaActionsLog(actions);
        }, (err) => { if (mounted) { console.error(`[Dewan-1] Error fetching official actions:`, err); setKetuaActionsLog([]); }}));
        
        const verificationQuery = query(collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, VERIFICATIONS_SUBCOLLECTION), where('status', '==', 'pending'), orderBy('timestamp', 'desc'), limit(1));
        unsubscribers.push(onSnapshot(verificationQuery, (snapshot) => {
          if (!mounted) return;

          if (snapshot.empty) { // No 'pending' verifications
            if (isDisplayVerificationModalOpen) { // If modal was open for a verification that's now resolved/deleted
                 setActiveDisplayVerificationRequest(null);
                 setIsDisplayVerificationModalOpen(false);
            }
            // If match was paused for ANY verification, and no verification is NOW pending, reset to 'Pending' state.
            if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
              updateTimerStatusInFirestore({
                isTimerRunning: false,
                matchStatus: 'Pending',
                timerSeconds: timerStatus.roundDuration,
              });
            }
          } else { // There is at least one 'pending' verification
            const latestPendingVerification = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
            setActiveDisplayVerificationRequest(latestPendingVerification);
            setIsDisplayVerificationModalOpen(true);

            // Ensure timer is paused specifically for THIS verification's round
            const expectedPausedStatus: TimerMatchStatus = `PausedForVerificationRound${latestPendingVerification.round}`;
            if (timerStatus.isTimerRunning || timerStatus.matchStatus !== expectedPausedStatus) {
               updateTimerStatusInFirestore({
                  isTimerRunning: false,
                  matchStatus: expectedPausedStatus
               });
            }
          }
        }, (err) => { 
          if (mounted) { 
            console.error(`[Dewan-1] Error fetching verification for display:`, err); 
            setActiveDisplayVerificationRequest(null); 
            setIsDisplayVerificationModalOpen(false); 
            // Potentially reset timer status if it was stuck in PausedForVerification
            if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
                updateTimerStatusInFirestore({
                  isTimerRunning: false,
                  matchStatus: 'Pending',
                  timerSeconds: timerStatus.roundDuration,
                });
            }
          }
        }));

      } catch (err) {
        if (mounted) { console.error("[Dewan-1] Error in loadData function:", err); setError("Gagal memuat data pertandingan."); }
      } finally {
        if (mounted) setIsLoading(false); 
      }
    };
    loadData();
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId, updateTimerStatusInFirestore]);


  useEffect(() => {
    if (isLoading) return; 
    
    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];
    if (allJuriDataInput.length === 0 && prevSavedUnstruckKeys.size === 0 && prevSavedStruckKeys.size === 0 && ketuaActionsLog.length === 0 && activeScheduleId) {
        setConfirmedScoreBiru(0); setConfirmedScoreMerah(0);
        return;
    }

    const currentUnstruckKeys = new Set(prevSavedUnstruckKeys);
    const currentStruckKeys = new Set(prevSavedStruckKeys);
    const allRawEntries: CombinedScoreEntry[] = [];

    allJuriDataInput.forEach(juriData => {
      (['merah', 'biru'] as const).forEach(pesilatColor => {
        (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
          juriData[pesilatColor]?.[roundKey]?.forEach(entry => {
            let entryTimestampMillis: number | null = null;
            if (entry.timestamp) {
                if (entry.timestamp instanceof Timestamp) entryTimestampMillis = entry.timestamp.toMillis();
                else if (entry.timestamp instanceof Date) entryTimestampMillis = entry.timestamp.getTime();
                else if (typeof entry.timestamp === 'object' && entry.timestamp !== null && typeof entry.timestamp.seconds === 'number') entryTimestampMillis = entry.timestamp.seconds * 1000 + (entry.timestamp.nanoseconds || 0) / 1000000;
            }
            if (entryTimestampMillis !== null) {
              const entryKey = `${juriData.juriId}_${entryTimestampMillis}_${entry.points}`;
              allRawEntries.push({ ...entry, juriId: juriData.juriId, key: entryKey, round: roundKey, color: pesilatColor, timestamp: entry.timestamp });
            } else { console.warn(`[Dewan-1] Skipping entry due to invalid timestamp. Juri: ${juriData.juriId}, Color: ${pesilatColor}, Round: ${roundKey}`);}
          });
        });
      });
    });

    allRawEntries.sort((a, b) => {
        const tsA = a.timestamp instanceof Timestamp ? a.timestamp.toMillis() : (a.timestamp instanceof Date ? a.timestamp.getTime() : (a.timestamp as {seconds: number}).seconds * 1000);
        const tsB = b.timestamp instanceof Timestamp ? b.timestamp.toMillis() : (b.timestamp instanceof Date ? b.timestamp.getTime() : (b.timestamp as {seconds: number}).seconds * 1000);
        return tsA - tsB;
    });

    const newlyProcessedInThisCycle = new Set<string>();
    for (let i = 0; i < allRawEntries.length; i++) {
      const e1 = allRawEntries[i];
      if (currentUnstruckKeys.has(e1.key) || currentStruckKeys.has(e1.key) || newlyProcessedInThisCycle.has(e1.key)) continue;
      const ts1 = e1.timestamp instanceof Timestamp ? e1.timestamp.toMillis() : (e1.timestamp instanceof Date ? e1.timestamp.getTime() : (e1.timestamp as {seconds: number}).seconds * 1000);

      for (let j = i + 1; j < allRawEntries.length; j++) {
        const e2 = allRawEntries[j];
        if (currentUnstruckKeys.has(e2.key) || currentStruckKeys.has(e2.key) || newlyProcessedInThisCycle.has(e2.key)) continue;
        const ts2 = e2.timestamp instanceof Timestamp ? e2.timestamp.toMillis() : (e2.timestamp instanceof Date ? e2.timestamp.getTime() : (e2.timestamp as {seconds: number}).seconds * 1000);

        if (e1.juriId !== e2.juriId && e1.round === e2.round && e1.color === e2.color && e1.points === e2.points && Math.abs(ts1 - ts2) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
          currentUnstruckKeys.add(e1.key); currentUnstruckKeys.add(e2.key);
          newlyProcessedInThisCycle.add(e1.key); newlyProcessedInThisCycle.add(e2.key);
          for (let k = j + 1; k < allRawEntries.length; k++) {
              const e3 = allRawEntries[k];
              if (currentUnstruckKeys.has(e3.key) || currentStruckKeys.has(e3.key) || newlyProcessedInThisCycle.has(e3.key)) continue;
              const ts3 = e3.timestamp instanceof Timestamp ? e3.timestamp.toMillis() : (e3.timestamp instanceof Date ? e3.timestamp.getTime() : (e3.timestamp as {seconds: number}).seconds * 1000);
              if (e3.juriId !== e1.juriId && e3.juriId !== e2.juriId && e3.round === e1.round && e3.color === e1.color && e3.points === e1.points && Math.abs(ts3 - ts1) <= JURI_INPUT_VALIDITY_WINDOW_MS && Math.abs(ts3 - ts2) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                  currentUnstruckKeys.add(e3.key); newlyProcessedInThisCycle.add(e3.key); break;
              }
          }
          break;
        }
      }
    }

    const now = Date.now();
    allRawEntries.forEach(entry => {
      if (!currentUnstruckKeys.has(entry.key) && !currentStruckKeys.has(entry.key)) {
        const tsEntry = entry.timestamp instanceof Timestamp ? entry.timestamp.toMillis() : (entry.timestamp instanceof Date ? entry.timestamp.getTime() : (entry.timestamp as {seconds: number}).seconds * 1000);
        if (now - tsEntry > GRACE_PERIOD_FOR_STRIKE_DECISION) currentStruckKeys.add(entry.key);
      }
    });

    setAllContributingEntryKeys(new Set(currentUnstruckKeys));
    setPermanentlyStruckEntryKeys(new Set(currentStruckKeys));

    let calculatedTotalMerah = 0; let calculatedTotalBiru = 0;
    const scoredPairKeys = new Set<string>();
    const unstruckEntries = allRawEntries.filter(e => currentUnstruckKeys.has(e.key));

    for (let i = 0; i < unstruckEntries.length; i++) {
        const e1 = unstruckEntries[i];
        if (scoredPairKeys.has(e1.key)) continue;
        const ts1 = e1.timestamp instanceof Timestamp ? e1.timestamp.toMillis() : (e1.timestamp instanceof Date ? e1.timestamp.getTime() : (e1.timestamp as {seconds: number}).seconds * 1000);
        const agreeingPartners = [e1];
        for (let j = i + 1; j < unstruckEntries.length; j++) {
            const e2 = unstruckEntries[j];
            if (scoredPairKeys.has(e2.key)) continue;
            const ts2 = e2.timestamp instanceof Timestamp ? e2.timestamp.toMillis() : (e2.timestamp instanceof Date ? e2.timestamp.getTime() : (e2.timestamp as {seconds: number}).seconds * 1000);
            if (e1.juriId !== e2.juriId && e1.round === e2.round && e1.color === e2.color && e1.points === e2.points && Math.abs(ts1 - ts2) <= JURI_INPUT_VALIDITY_WINDOW_MS) agreeingPartners.push(e2);
        }
        if (agreeingPartners.length >= 2) {
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points; else calculatedTotalBiru += points;
            agreeingPartners.forEach(p => scoredPairKeys.add(p.key));
        }
    }

    ketuaActionsLog.forEach(action => {
        if (action.pesilatColor === 'merah') calculatedTotalMerah += action.points;
        else if (action.pesilatColor === 'biru') calculatedTotalBiru += action.points;
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);

    if (activeScheduleId) {
      const newUnstruckLogArray = Array.from(currentUnstruckKeys);
      let unstruckChanged = newUnstruckLogArray.length !== prevSavedUnstruckKeys.size || !newUnstruckLogArray.every(k => prevSavedUnstruckKeys.has(k));
      const newStruckLogArray = Array.from(currentStruckKeys);
      let struckChanged = newStruckLogArray.length !== prevSavedStruckKeys.size || !newStruckLogArray.every(k => prevSavedStruckKeys.has(k));
      const updates: { [key: string]: any } = {};
      if (unstruckChanged) updates.confirmed_unstruck_keys_log = newUnstruckLogArray;
      if (struckChanged) updates.confirmed_struck_keys_log = newStruckLogArray;
      if (Object.keys(updates).length > 0) {
        updateDoc(doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId), updates).catch(err => console.error(`[Dewan-1] Error updating Firestore logs:`, err));
      }
    }
  }, [isLoading, juri1Scores, juri2Scores, juri3Scores, activeScheduleId, prevSavedUnstruckKeys, prevSavedStruckKeys, ketuaActionsLog]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => {
        if (activeScheduleId) {
            try {
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                const currentDBDoc = await getDoc(matchDocRef);
                if (!currentDBDoc.exists()) { if(interval) clearInterval(interval); setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); return; }
                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;
                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) {
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false, ...(currentDBTimerStatus && { timerSeconds: currentDBTimerStatus.timerSeconds, matchStatus: currentDBTimerStatus.matchStatus, currentRound: currentDBTimerStatus.currentRound, roundDuration: currentDBTimerStatus.roundDuration, })}));
                    if(interval) clearInterval(interval); return;
                }
                if (!timerStatus.isTimerRunning) { if (interval) clearInterval(interval); return; } 

                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus: TimerMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false;
                    newMatchStatus = `FinishedRound${currentDBTimerStatus.currentRound}` as TimerMatchStatus;
                    if (currentDBTimerStatus.currentRound === TOTAL_ROUNDS) newMatchStatus = 'MatchFinished';
                }
                const updatedStatusForFirestore: TimerStatus = { ...currentDBTimerStatus, timerSeconds: newSeconds, isTimerRunning: newIsTimerRunning, matchStatus: newMatchStatus, };
                await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
            } catch (e) { console.error(`[Dewan-1] Error updating timer in interval: `, e); if(interval) clearInterval(interval); setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); }
        } else { if(interval) clearInterval(interval); }
      }, 1000);
    } else if (!timerStatus.isTimerRunning || timerStatus.timerSeconds === 0) { if(interval) clearInterval(interval); }
    return () => { if (interval) clearInterval(interval); };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, activeScheduleId]);


  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
    if (action === 'start') {
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) { alert("Verifikasi sedang berlangsung. Timer tidak bisa dimulai."); return; }
         updateTimerStatusInFirestore({ isTimerRunning: true, matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerMatchStatus });
      }
    } else if (action === 'pause') {
      if (timerStatus.isTimerRunning) updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: `PausedRound${timerStatus.currentRound}` as TimerMatchStatus });
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) { alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset."); return; }
    if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) { alert("Verifikasi sedang berlangsung. Tidak bisa mengubah babak."); return; }

    let newMatchStatus: TimerMatchStatus = 'Pending'; let newTimerSeconds = timerStatus.roundDuration;
    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) { newMatchStatus = `FinishedRound${round}` as TimerMatchStatus; newTimerSeconds = 0; }
    else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { newMatchStatus = `FinishedRound${round}` as TimerMatchStatus; newTimerSeconds = 0;}
        else { newMatchStatus = 'Pending'; newTimerSeconds = timerStatus.roundDuration; }
    }
    else if (timerStatus.matchStatus.startsWith('PausedRound')) { newMatchStatus = 'Pending'; newTimerSeconds = timerStatus.roundDuration; }
    else if ((timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('OngoingRound'))) { newMatchStatus = 'Pending'; newTimerSeconds = timerStatus.roundDuration; }
    updateTimerStatusInFirestore({ currentRound: round, timerSeconds: newTimerSeconds, isTimerRunning: false, matchStatus: newMatchStatus });
  };

  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus || isLoading) return;
    if (timerStatus.isTimerRunning) { alert("Jeda dulu pertandingan sebelum melanjutkan."); return; }

    const isCurrentRoundActuallyFinished = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;
    const isPausedForVerification = timerStatus.matchStatus.startsWith('PausedForVerificationRound');

    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished' && !isPausedForVerification) {
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai. Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) return;
        updateTimerStatusInFirestore({ matchStatus: `FinishedRound${timerStatus.currentRound}` as TimerMatchStatus, timerSeconds: 0, isTimerRunning: false }); return; 
    }
    if (isPausedForVerification && timerStatus.currentRound <= TOTAL_ROUNDS) {
        updateTimerStatusInFirestore({ isTimerRunning: false, matchStatus: 'Pending', timerSeconds: timerStatus.roundDuration }); return;
    }
    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({ currentRound: nextRound, timerSeconds: timerStatus.roundDuration, isTimerRunning: false, matchStatus: 'Pending' });
    } else if (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
    }
  };

  const handleResetMatch = async () => {
    if (!activeScheduleId || isLoading) return;
    if (!confirm("Yakin ingin mereset seluruh pertandingan? Semua skor dan status akan kembali ke awal.")) return;
    setIsLoading(true); 
    try {
        const batch = writeBatch(db);
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { timer_status: initialTimerStatus, confirmed_unstruck_keys_log: [], confirmed_struck_keys_log: [] }, { merge: true }); 
        const initialJuriDataContent: JuriMatchData = { merah: { round1: [], round2: [], round3: [] }, biru: { round1: [], round2: [], round3: [] }, lastUpdated: serverTimestamp() as Timestamp };
        JURI_IDS.forEach(juriId => batch.set(doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId), initialJuriDataContent));
        const ketuaActionsSnapshot = await getDocs(collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, OFFICIAL_ACTIONS_SUBCOLLECTION));
        ketuaActionsSnapshot.forEach((d) => batch.delete(d.ref));
        const verificationsSnapshot = await getDocs(collection(db, MATCHES_TANDING_COLLECTION, activeScheduleId, VERIFICATIONS_SUBCOLLECTION));
        verificationsSnapshot.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        setTimerStatus(initialTimerStatus); setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
        alert("Pertandingan telah direset.");
    } catch (e) { console.error(`[Dewan-1] Error resetting match:`, e); setError("Gagal mereset pertandingan."); }
    finally { setIsLoading(false); }
  };

  const handleApplyDuration = () => {
    if (!activeScheduleId || isLoading) return;
    const durationMinutes = parseFloat(inputRoundDurationMinutes);
    if (isNaN(durationMinutes) || durationMinutes <= 0) { alert("Durasi babak tidak valid."); return; }
    const newDurationSeconds = Math.round(durationMinutes * 60);
    const updates: Partial<TimerStatus> = { roundDuration: newDurationSeconds };
    if (!timerStatus.isTimerRunning && (timerStatus.matchStatus === 'Pending' || timerStatus.matchStatus.startsWith('PausedRound') || timerStatus.matchStatus.startsWith('FinishedRound'))) {
        updates.timerSeconds = newDurationSeconds;
    }
    updateTimerStatusInFirestore(updates);
    alert(`Durasi babak diatur ke ${durationMinutes} menit.`);
  };

  const formatTime = (seconds: number): string => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
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

  const getJuriScoreForDisplay = (juriId: string, juriData: JuriMatchDataWithId | null, pesilatColor: 'merah' | 'biru', round: 1 | 2 | 3, unstruckKeys: Set<string>, struckKeys: Set<string>): React.ReactNode => {
    if (!juriData) return '-'; 
    const roundKey = `round${round}` as keyof JuriRoundScores;
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';
    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number | null = null;
      if (entry.timestamp) {
        if (entry.timestamp instanceof Timestamp) entryTimestampMillis = entry.timestamp.toMillis();
        else if (entry.timestamp instanceof Date) entryTimestampMillis = entry.timestamp.getTime();
        else if (typeof entry.timestamp === 'object' && entry.timestamp !== null && typeof entry.timestamp.seconds === 'number') entryTimestampMillis = entry.timestamp.seconds * 1000 + (entry.timestamp.nanoseconds || 0) / 1000000;
      }
      if (entryTimestampMillis === null) return <span key={`${juriId}-${round}-${pesilatColor}-${index}-invalid`} className="mr-1.5 text-red-500">Inv!</span>;
      const entryKey = `${juriData.juriId}_${entryTimestampMillis}_${entry.points}`;
      const isUnstruck = unstruckKeys.has(entryKey); const isPermanentlyStruck = struckKeys.has(entryKey);
      const isGracePeriodForDisplay = (Date.now() - entryTimestampMillis <= JURI_INPUT_VALIDITY_WINDOW_MS);
      const shouldDisplayAsStruck = isPermanentlyStruck || (!isUnstruck && !isGracePeriodForDisplay);
      return <span key={`${juriData.juriId}-${round}-${pesilatColor}-${index}-${entryTimestampMillis}`} className={cn(shouldDisplayAsStruck && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>{entry.points}</span>;
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ', '}{curr}</>, <></>); 
  };

  const getTotalJuriRawScoreForDisplay = (juriData: JuriMatchDataWithId | null, pesilatColor: 'merah' | 'biru'): number => {
    if (!juriData) return 0; let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        const scoresForRound = juriData[pesilatColor]?.[roundKey];
        if (scoresForRound && Array.isArray(scoresForRound)) scoresForRound.forEach(s => { if (s && typeof s.points === 'number') total += s.points; });
    });
    return total;
  };

  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-red-600 text-white"; if (vote === 'biru') return "bg-blue-600 text-white";
    if (vote === 'invalid') return "bg-yellow-400 text-black"; return "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100";
  };

  const handleNextMatchNavigation = async () => {
    if (!activeScheduleId || !matchDetails || timerStatus.matchStatus !== 'MatchFinished' || !gelanggangName) { alert("Pertandingan saat ini belum selesai atau detail/gelanggang tidak tersedia."); return; }
    setIsNavigatingNextMatch(true);
    try {
        const currentMatchNumber = matchDetails.matchNumber;
        const schedulesRef = collection(db, SCHEDULE_TANDING_COLLECTION);
        const q = query(schedulesRef, where('place', '==', gelanggangName), where('matchNumber', '>', currentMatchNumber), orderBy('matchNumber', 'asc'), limit(1));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            alert(`Tidak ada partai berikutnya untuk Gelanggang: ${gelanggangName}.`);
        } else {
            const nextMatchDoc = querySnapshot.docs[0];
            const venueMapRef = doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH);
            await updateDoc(venueMapRef, { [gelanggangName]: nextMatchDoc.id }); 
            alert(`Berpindah ke Partai No. ${nextMatchDoc.data().matchNumber} (${nextMatchDoc.data().pesilatMerahName} vs ${nextMatchDoc.data().pesilatBiruName}) di ${gelanggangName}.`);
        }
    } catch (err) { console.error("Error navigating to next match:", err); alert("Gagal berpindah ke partai berikutnya."); }
    finally { setIsNavigatingNextMatch(false); }
  };

  if (!gelanggangName && !isLoading) {
    return (
        <div className="flex flex-col min-h-screen"> <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Nama Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data pertandingan tanpa nama gelanggang.</p>
                <Button asChild className="mt-6">
                    <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  if (isLoading && (!activeScheduleId || !matchDetailsLoaded)) { 
    return (
        <div className="flex flex-col min-h-screen"> <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">
                  {configMatchId === undefined ? `Memuat konfigurasi untuk Gelanggang: ${gelanggangName || '...'}` : 
                   !activeScheduleId && configMatchId === null ? `Tidak ada jadwal aktif untuk Gelanggang: ${gelanggangName || '...'}` :
                   `Memuat data pertandingan untuk Gelanggang: ${gelanggangName || '...'}`}
                </p>
                {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
            </main>
        </div>
    );
  }

  if (!activeScheduleId && !isLoading && configMatchId === null) { 
    return (
      <div className="flex flex-col min-h-screen"> <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
           <Card className="mt-6 shadow-lg">
            <CardHeader><CardTitle className="text-xl font-headline text-center text-primary">Scoring Tanding - Dewan Kontrol</CardTitle></CardHeader>
            <CardContent className="p-6 text-center">
                <p className="mb-4 text-muted-foreground">{error || `Tidak ada pertandingan yang aktif untuk Gelanggang: ${gelanggangName}.`}</p>
                <Button variant="outline" asChild><Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link></Button>
            </CardContent>
           </Card>
        </main>
      </div>
    );
  }

  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai'
    : timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? `Lanjutkan Babak ${timerStatus.currentRound}`
    : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');
  const isNextActionPossible: boolean = (timerStatus.currentRound < TOTAL_ROUNDS || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') || timerStatus.matchStatus.startsWith('PausedForVerificationRound'));
  const isTimerStartDisabled: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound') || timerStatus.matchStatus.startsWith('PausedForVerificationRound');
  const isTimerPauseDisabled: boolean = !activeScheduleId || isLoading || !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound");
  const isResetButtonDisabled: boolean = !activeScheduleId || isLoading;
  const isBabakButtonDisabled = (round: number): boolean => { if (!activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.matchStatus.startsWith('PausedForVerificationRound')) return true; return false; };
  const juriDataArray = [juri1Scores, juri2Scores, juri3Scores];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 font-body">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-red-700 text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT - GELANGGANG: {gelanggangName || <Loader2 className="inline h-5 w-5 animate-spin"/>}</h1>
            {matchDetails && (<p className="text-xs md:text-sm">Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}</p>)}
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
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4"><span className="text-5xl md:text-8xl font-bold">{confirmedScoreBiru}</span></CardContent>
            </Card>
          </div>
          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className={cn("text-3xl md:text-5xl font-mono font-bold", timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-500" : "text-gray-800 dark:text-gray-200")}>{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button key={round} variant={timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent dark:ring-offset-gray-800 font-semibold' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'} ${ isBabakButtonDisabled(round) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)} disabled={isBabakButtonDisabled(round)}> Babak {round} </Button>
              ))}
            </div>
             <p className={cn("text-xs text-center px-1 font-semibold", timerStatus.matchStatus.startsWith('PausedForVerificationRound') ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400")}>{getMatchStatusText()}</p>
          </div>
          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-base md:text-xl font-semibold truncate font-headline">{pesilatMerahInfo?.name || 'PESILAT MERAH'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4"><span className="text-5xl md:text-8xl font-bold">{confirmedScoreMerah}</span></CardContent>
            </Card>
          </div>
        </div>

        <Card className="shadow-lg mb-4 bg-white dark:bg-gray-800">
          <CardHeader><CardTitle className="text-lg font-headline text-gray-800 dark:text-gray-200 flex items-center gap-2"><Settings className="h-5 w-5 text-primary"/>Pengaturan & Kontrol</CardTitle></CardHeader>
          <CardContent className="p-3 md:p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                    <Label htmlFor="roundDurationMinutes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"><TimerIcon className="inline-block mr-1 h-4 w-4" /> Durasi Babak (menit)</Label>
                    <Input id="roundDurationMinutes" type="number" value={inputRoundDurationMinutes} onChange={(e) => setInputRoundDurationMinutes(e.target.value)} placeholder="Cth: 2" className="bg-background/80 dark:bg-gray-700 dark:text-white" min="1" step="0.5"/>
                </div>
                <Button onClick={handleApplyDuration} disabled={isLoading || !activeScheduleId} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground" title="Terapkan durasi babak"><CheckCircle2 className="mr-2 h-4 w-4" /> Terapkan Durasi</Button>
            </div>
            <hr className="border-gray-200 dark:border-gray-700"/>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
                <Button onClick={() => handleTimerControl('start')} disabled={isTimerStartDisabled} className="w-full bg-green-500 hover:bg-green-600 text-white py-2 md:py-3 text-sm md:text-base"><Play className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Start</Button>
                <Button onClick={() => handleTimerControl('pause')} disabled={isTimerPauseDisabled} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-3 text-sm md:text-base"><Pause className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Pause</Button>
                <Button onClick={handleNextAction} disabled={isNextActionDisabledBtn} variant="outline" className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">{nextButtonText} <ChevronRight className="ml-1 h-4 md:h-5 w-4 md:w-5" /></Button>
                <Button onClick={handleResetMatch} disabled={isResetButtonDisabled} variant="destructive" className="w-full py-2 md:py-3 text-sm md:text-base"><RotateCcw className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Reset Match</Button>
            </div>
             <Button variant="outline" asChild className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"><Link href="/login"><ArrowLeft className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Kembali ke Login</Link></Button>
          </CardContent>
        </Card>

        <Card className="mt-4 shadow-lg bg-white dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center text-gray-800 dark:text-gray-200"><RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri & Skor Mentah</CardTitle>
                 <CardDescription className="text-gray-600 dark:text-gray-400 text-xs">Nilai SAH jika min. 2 juri setuju (poin, warna, babak) dalam ${JURI_INPUT_VALIDITY_WINDOW_MS / 1000} detik. Nilai solo DICORET setelah ${GRACE_PERIOD_FOR_STRIKE_DECISION / 1000} detik.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx]; const lastUpdatedString = jS?.lastUpdated ? formatLastUpdatedTimestamp(jS.lastUpdated) : '';
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu...</span>}</p>
                            {jS && (<div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>M:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3, allContributingEntryKeys, permanentlyStruckEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>B:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2, allContributingEntryKeys, permanentlyStruckEntryKeys)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3, allContributingEntryKeys, permanentlyStruckEntryKeys)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
                                    {lastUpdatedString && <p className="text-gray-400 dark:text-gray-500 text-xxs">Update: {lastUpdatedString}</p>}</div>)}
                            {!jS && <p className="italic text-gray-500 dark:text-gray-400">Belum ada input dari Juri {idx+1}.</p>}
                        </div>);
                })}
            </CardContent>
        </Card>

        <Dialog open={isDisplayVerificationModalOpen} onOpenChange={(isOpen) => { if (!isOpen && activeDisplayVerificationRequest?.status === 'pending') return; setIsDisplayVerificationModalOpen(isOpen); }}>
          <DialogContent className="sm:max-w-lg md:max-w-xl" onPointerDownOutside={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}} onEscapeKeyDown={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}>
            <RadixDialogTitle className="sr-only">Detail Verifikasi Juri</RadixDialogTitle>
            <DialogHeader><RadixDialogTitle className="text-2xl md:text-3xl font-bold font-headline text-center">Verifikasi Juri</RadixDialogTitle></DialogHeader>
            <div className="py-4 px-2 md:px-6">
              <div className="mb-6">
                <h3 className="text-lg md:text-xl font-semibold mb-1 text-center md:text-left text-foreground">Detail Verifikasi</h3>
                {activeDisplayVerificationRequest && (<div className="text-md md:text-lg text-muted-foreground text-center md:text-left"><span>{activeDisplayVerificationRequest.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}</span><span className="mx-2">|</span><span>Babak {activeDisplayVerificationRequest.round}</span></div>)}
              </div>
              <div className="grid grid-cols-3 gap-3 md:gap-4 items-start justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => {
                  const vote = activeDisplayVerificationRequest?.votes[juriKey] || null; let voteText = 'Belum Vote';
                  if (vote === 'merah') voteText = 'SUDUT MERAH'; else if (vote === 'biru') voteText = 'SUDUT BIRU'; else if (vote === 'invalid') voteText = 'INVALID';
                  return (<div key={`vote-display-dewan1-${juriKey}`} className="flex flex-col items-center space-y-1 w-full">
                      <p className="text-lg md:text-xl font-bold text-foreground">J{index + 1}</p>
                      <div className={cn("w-full h-16 md:h-20 rounded-lg flex items-center justify-center text-xs md:text-sm font-bold p-2 shadow-md", getJuriVoteDisplayBoxClass(vote))}>{voteText}</div>
                    </div>);})}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        {timerStatus.matchStatus === 'MatchFinished' && (
            <Button onClick={handleNextMatchNavigation} disabled={isNavigatingNextMatch || isLoading} className="fixed bottom-6 right-6 z-50 shadow-lg bg-green-600 hover:bg-green-700 text-white py-3 px-4 text-sm md:text-base rounded-full" title="Lanjut ke Partai Berikutnya">
                {isNavigatingNextMatch ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ChevronsRight className="mr-2 h-5 w-5" />} Partai Berikutnya
            </Button>
        )}
      </main>
    </div>
  );
}

export default function ScoringTandingDewanSatuPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen"> <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat halaman Dewan Kontrol...</p>
        </main>
      </div>
    }>
      <DewanSatuPageComponent />
    </Suspense>
  );
}

interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
  key: string;
  round: keyof LibRoundScores;
  color: 'merah' | 'biru';
}

