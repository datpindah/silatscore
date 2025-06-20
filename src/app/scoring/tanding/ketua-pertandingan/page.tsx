
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Trash2, ShieldCheck, Trophy, Vote, Play, Pause, Info, Eye, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle as RadixDialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ScheduleTanding, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType, VerificationType, VerificationRequest, JuriVoteValue, JuriVotes, TimerStatus as DewanTimerType, TimerMatchStatus, MatchResultTanding, TandingScoreBreakdown, JuriMatchData as LibJuriMatchData, ScoreEntry as LibScoreEntry } from '@/lib/types';
import { JATUHAN_POINTS, TEGURAN_POINTS, PERINGATAN_POINTS_FIRST_PRESS, PERINGATAN_POINTS_SECOND_PRESS } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, Timestamp, collection, addDoc, query, orderBy, deleteDoc, limit, getDocs, serverTimestamp, writeBatch, where, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const JURI_SCORES_SUBCOLLECTION = 'juri_scores';
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

const initialDewanTimerStatus: DewanTimerType = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: 120,
};

const ROUNDS = [1, 2, 3] as const;

const initialScoreBreakdown: TandingScoreBreakdown = {
  peringatan1: 0, peringatan2: 0, teguran1: 0, teguran2: 0,
  jatuhan: 0, pukulanSah: 0, tendanganSah: 0, totalAkhir: 0,
};

const victoryTypeOptions: TandingVictoryType[] = [
  'Menang Angka', 'Menang Teknik', 'Menang Diskualifikasi',
  'Menang Mutlak', 'Menang RSC', 'Menang WO', 'Seri'
];

const countActionsInRound = (
  log: KetuaActionLogEntry[],
  pesilatColor: PesilatColorIdentity,
  actionType: KetuaActionType,
  round: 1 | 2 | 3
): number => {
  return log.filter(
    (action) =>
      action.pesilatColor === pesilatColor &&
      action.actionType === actionType &&
      action.round === round
  ).length;
};

const calculateDisplayScoresForTable = (
  log: KetuaActionLogEntry[],
  pesilatColor: PesilatColorIdentity,
  round: 1 | 2 | 3
): { hukuman: number; binaan: number; jatuhan: number } => {
  const roundActions = log.filter(
    (action) => action.pesilatColor === pesilatColor && action.round === round
  );
  let hukuman = 0; let binaan = 0; let jatuhan = 0;
  roundActions.forEach(action => {
    if (action.actionType === 'Teguran' || action.actionType === 'Peringatan') hukuman += action.points;
    else if (action.actionType === 'Binaan') binaan += 1; // Binaan itself doesn't carry points, but its occurrence is noted.
    else if (action.actionType === 'Jatuhan') jatuhan += action.points;
  });
  return { hukuman, binaan, jatuhan };
};

const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatFirestoreTimestamp = (timestamp: KetuaActionLogEntry['timestamp']): string => {
  if (!timestamp) return '-';
  if (timestamp instanceof Date) return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (timestamp instanceof Timestamp) return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (typeof timestamp === 'object' && timestamp !== null && typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.warn("Unknown timestamp format in formatFirestoreTimestamp:", timestamp);
  return 'Invalid Date';
};


function KetuaPertandinganPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [dewanTimerStatus, setDewanTimerStatus] = useState<DewanTimerType>(initialDewanTimerStatus);
  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);
  const [allJuriScores, setAllJuriScores] = useState<Record<string, LibJuriMatchData | null>>({'juri-1': null, 'juri-2': null, 'juri-3': null });
  const [confirmedUnstruckKeys, setConfirmedUnstruckKeys] = useState<Set<string>>(new Set());

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isVerificationCreationDialogOpen, setIsVerificationCreationDialogOpen] = useState(false);
  const [selectedVerificationTypeForCreation, setSelectedVerificationTypeForCreation] = useState<VerificationType | ''>('');
  const [isCreatingVerification, setIsCreatingVerification] = useState(false);

  const [activeVerificationDetails, setActiveVerificationDetails] = useState<VerificationRequest | null>(null);
  const [isVoteResultModalOpen, setIsVoteResultModalOpen] = useState(false);
  const [ketuaSelectedDecision, setKetuaSelectedDecision] = useState<JuriVoteValue>(null);
  const [isConfirmingVerification, setIsConfirmingVerification] = useState(false);

  const [isWinnerModalOpen, setIsWinnerModalOpen] = useState(false);
  const [summaryScoresMerah, setSummaryScoresMerah] = useState<TandingScoreBreakdown>(initialScoreBreakdown);
  const [summaryScoresBiru, setSummaryScoresBiru] = useState<TandingScoreBreakdown>(initialScoreBreakdown);
  const [winnerSelectionDialog, setWinnerSelectionDialog] = useState<PesilatColorIdentity | 'seri' | null>(null);
  const [victoryTypeDialog, setVictoryTypeDialog] = useState<TandingVictoryType | ''>('');
  const [victoryReasonDialog, setVictoryReasonDialog] = useState('');
  const [matchResultSaved, setMatchResultSaved] = useState<MatchResultTanding | null>(null);
  const [isSavingResult, setIsSavingResult] = useState(false);


  const resetPageData = useCallback(() => {
    setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false); setDewanTimerStatus(initialDewanTimerStatus);
    setKetuaActionsLog([]); setAllJuriScores({'juri-1': null, 'juri-2': null, 'juri-3': null });
    setConfirmedUnstruckKeys(new Set());
    setActiveVerificationDetails(null); setIsVoteResultModalOpen(false); setKetuaSelectedDecision(null);
    setError(null);
    setIsWinnerModalOpen(false); setSummaryScoresMerah(initialScoreBreakdown); setSummaryScoresBiru(initialScoreBreakdown);
    setWinnerSelectionDialog(null); setVictoryTypeDialog(''); setVictoryReasonDialog('');
    setMatchResultSaved(null);
  }, []);

  useEffect(() => {
    if (!gelanggangName) {
      setError("Nama gelanggang tidak ditemukan di URL.");
      setConfigMatchId(null); setIsLoadingPage(false); return;
    }
    setError(null); setIsLoadingPage(true);
    const unsubGelanggangMap = onSnapshot(doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      let newDbConfigId: string | null = null;
      if (docSnap.exists()) newDbConfigId = docSnap.data()?.[gelanggangName] || null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
      if (!newDbConfigId) setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
    }, (err) => {
      console.error(`[KetuaTanding] Error fetching active matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif per gelanggang."); setConfigMatchId(null); setIsLoadingPage(false);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoadingPage(true); return; }
    if (configMatchId !== activeMatchId) {
      resetPageData(); setActiveMatchId(configMatchId); setMatchDetailsLoaded(false);
    }
    if (configMatchId === null && activeMatchId === null) {
      setIsLoadingPage(false);
      if (!error) setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
    }
  }, [configMatchId, activeMatchId, resetPageData, gelanggangName, error]);

  useEffect(() => {
    if (!activeMatchId) {
      setMatchDetailsLoaded(false); setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
      setDewanTimerStatus(initialDewanTimerStatus); setKetuaActionsLog([]); setActiveVerificationDetails(null);
      setAllJuriScores({'juri-1':null, 'juri-2':null, 'juri-3':null}); setConfirmedUnstruckKeys(new Set());
      setMatchResultSaved(null);
      if (configMatchId === null) setIsLoadingPage(false);
      return;
    }
    let mounted = true;
    if (!matchDetailsLoaded) setIsLoadingPage(true);
    const unsubscribers: (() => void)[] = [];
    const loadAllDataForMatch = async () => {
      if (!mounted) return;
      let currentScheduleDetailsLoaded = false;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          setMatchDetails(data); setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
          setMatchDetailsLoaded(true); currentScheduleDetailsLoaded = true;
        } else {
          setError(`Detail jadwal ${activeMatchId} tidak ditemukan.`); setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
          setMatchDetailsLoaded(false); if (mounted) setIsLoadingPage(false); return;
        }
      } catch (err) {
        if (mounted) setError("Gagal memuat detail jadwal."); setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
        setMatchDetailsLoaded(false); if (mounted) setIsLoadingPage(false); return;
      }
      if (currentScheduleDetailsLoaded) {
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
        unsubscribers.push(onSnapshot(matchDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) setDewanTimerStatus(data.timer_status as DewanTimerType); else setDewanTimerStatus(initialDewanTimerStatus);
            setConfirmedUnstruckKeys(new Set(data?.confirmed_unstruck_keys_log as string[] || []));
            if (data?.matchResult) setMatchResultSaved(data.matchResult as MatchResultTanding); else setMatchResultSaved(null);
          } else {
            setDewanTimerStatus(initialDewanTimerStatus); setConfirmedUnstruckKeys(new Set()); setMatchResultSaved(null);
          }
        }, (err) => { if (mounted) console.error("Error fetching match main data:", err); }));
        unsubscribers.push(onSnapshot(query(collection(matchDocRef, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc")), (snap) => {
          if (!mounted) return;
          setKetuaActionsLog(snap.docs.map(d => ({ id: d.id, ...d.data(), timestamp: d.data().timestamp } as KetuaActionLogEntry)));
        }, (err) => { if (mounted) console.error("Error fetching official actions:", err);}));
        JURI_IDS.forEach(juriId => {
          unsubscribers.push(onSnapshot(doc(matchDocRef, JURI_SCORES_SUBCOLLECTION, juriId), (juriScoreDoc) => {
            if (!mounted) return;
            setAllJuriScores(prev => ({ ...prev, [juriId]: juriScoreDoc.exists() ? juriScoreDoc.data() as LibJuriMatchData : null }));
          }, (err) => { if(mounted) console.error(`Error fetching scores for ${juriId}:`, err); }));
        });
        unsubscribers.push(onSnapshot(query(collection(matchDocRef, VERIFICATIONS_SUBCOLLECTION), orderBy('timestamp', 'desc'), limit(1)), (snapshot) => {
            if (!mounted) return;
            if (!snapshot.empty) {
                const newVerificationData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
                setActiveVerificationDetails(currentDetails => (!currentDetails || currentDetails.id !== newVerificationData.id || currentDetails.status !== newVerificationData.status || JSON.stringify(currentDetails.votes) !== JSON.stringify(newVerificationData.votes)) ? newVerificationData : currentDetails);
            } else {
                setActiveVerificationDetails(currentDetails => currentDetails !== null ? null : currentDetails);
            }
        }, (err) => { if (mounted) console.error("Error fetching active verification details:", err); }));
      }
      if (mounted && currentScheduleDetailsLoaded) setIsLoadingPage(false);
    };
    loadAllDataForMatch();
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId]);

  useEffect(() => {
    if (activeVerificationDetails && activeVerificationDetails.status === 'pending') setIsVoteResultModalOpen(true);
    else { setIsVoteResultModalOpen(false); if (activeVerificationDetails && activeVerificationDetails.status !== 'pending') setKetuaSelectedDecision(null); }
  }, [activeVerificationDetails]);

  const calculateScoreBreakdownForDialog = useCallback(() => {
    const newSummaryMerah: TandingScoreBreakdown = { ...initialScoreBreakdown };
    const newSummaryBiru: TandingScoreBreakdown = { ...initialScoreBreakdown };

    let peringatanMerahCount = 0; let teguranMerahCount = 0;
    let peringatanBiruCount = 0; let teguranBiruCount = 0;

    ketuaActionsLog.forEach(action => {
      if (action.pesilatColor === 'merah') {
        if (action.actionType === 'Peringatan') {
          peringatanMerahCount++;
          if (peringatanMerahCount === 1) newSummaryMerah.peringatan1 += action.points;
          else if (peringatanMerahCount === 2) newSummaryMerah.peringatan2 += action.points;
        } else if (action.actionType === 'Teguran' || action.originalActionType === 'Binaan') { // Adjusted: also count Binaan->Teguran as Teguran
          teguranMerahCount++;
          if (teguranMerahCount === 1) newSummaryMerah.teguran1 += action.points;
          else if (teguranMerahCount === 2) newSummaryMerah.teguran2 += action.points;
        } else if (action.actionType === 'Jatuhan') {
          newSummaryMerah.jatuhan += action.points;
        }
      } else if (action.pesilatColor === 'biru') {
        if (action.actionType === 'Peringatan') {
          peringatanBiruCount++;
          if (peringatanBiruCount === 1) newSummaryBiru.peringatan1 += action.points;
          else if (peringatanBiruCount === 2) newSummaryBiru.peringatan2 += action.points;
        } else if (action.actionType === 'Teguran' || action.originalActionType === 'Binaan') { // Adjusted: also count Binaan->Teguran as Teguran
          teguranBiruCount++;
          if (teguranBiruCount === 1) newSummaryBiru.teguran1 += action.points;
          else if (teguranBiruCount === 2) newSummaryBiru.teguran2 += action.points;
        } else if (action.actionType === 'Jatuhan') {
          newSummaryBiru.jatuhan += action.points;
        }
      }
    });

    JURI_IDS.forEach(juriId => {
      const juriData = allJuriScores[juriId];
      if (juriData) {
        (['merah', 'biru'] as PesilatColorIdentity[]).forEach(color => {
          const targetSummary = color === 'merah' ? newSummaryMerah : newSummaryBiru;
          (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
            juriData[color]?.[roundKey]?.forEach(entry => {
              let entryTimestampMillis: number | null = null;
              if (entry.timestamp) {
                if (entry.timestamp instanceof Timestamp) entryTimestampMillis = entry.timestamp.toMillis();
                else if (entry.timestamp instanceof Date) entryTimestampMillis = entry.timestamp.getTime();
                else if (typeof entry.timestamp === 'object' && (entry.timestamp as {seconds: number}).seconds !== undefined) entryTimestampMillis = (entry.timestamp as {seconds: number}).seconds * 1000 + ((entry.timestamp as {nanoseconds: number}).nanoseconds || 0) / 1000000;
              }
              if (entryTimestampMillis !== null) {
                const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
                if (confirmedUnstruckKeys.has(entryKey)) {
                  if (entry.points === 1) targetSummary.pukulanSah += 1;
                  else if (entry.points === 2) targetSummary.tendanganSah += 2;
                }
              }
            });
          });
        });
      }
    });
    newSummaryMerah.totalAkhir = newSummaryMerah.peringatan1 + newSummaryMerah.peringatan2 + newSummaryMerah.teguran1 + newSummaryMerah.teguran2 + newSummaryMerah.jatuhan + newSummaryMerah.pukulanSah + newSummaryMerah.tendanganSah;
    newSummaryBiru.totalAkhir = newSummaryBiru.peringatan1 + newSummaryBiru.peringatan2 + newSummaryBiru.teguran1 + newSummaryBiru.teguran2 + newSummaryBiru.jatuhan + newSummaryBiru.pukulanSah + newSummaryBiru.tendanganSah;

    setSummaryScoresMerah(newSummaryMerah);
    setSummaryScoresBiru(newSummaryBiru);

    if (newSummaryMerah.totalAkhir > newSummaryBiru.totalAkhir) setWinnerSelectionDialog('merah');
    else if (newSummaryBiru.totalAkhir > newSummaryMerah.totalAkhir) setWinnerSelectionDialog('biru');
    else setWinnerSelectionDialog('seri');
    setVictoryTypeDialog('Menang Angka');

  }, [ketuaActionsLog, allJuriScores, confirmedUnstruckKeys]);

  const handleTentukanPemenang = () => {
    calculateScoreBreakdownForDialog();
    setIsWinnerModalOpen(true);
  };

  const handleConfirmMatchResult = async () => {
    if (!activeMatchId || !matchDetails || !winnerSelectionDialog || !victoryTypeDialog) {
      alert("Data tidak lengkap untuk menyimpan hasil."); return;
    }
    setIsSavingResult(true);
    const resultData: MatchResultTanding = {
      winner: winnerSelectionDialog === 'seri' ? 'seri' : winnerSelectionDialog,
      victoryType: victoryTypeDialog,
      reason: victoryReasonDialog,
      gelanggang: matchDetails.place,
      babak: matchDetails.round,
      kelas: matchDetails.class,
      namaSudutBiru: matchDetails.pesilatBiruName,
      kontingenBiru: matchDetails.pesilatBiruContingent,
      namaSudutMerah: matchDetails.pesilatMerahName,
      kontingenMerah: matchDetails.pesilatMerahContingent,
      skorAkhirMerah: summaryScoresMerah.totalAkhir,
      skorAkhirBiru: summaryScoresBiru.totalAkhir,
      detailSkorMerah: summaryScoresMerah,
      detailSkorBiru: summaryScoresBiru,
      timestamp: serverTimestamp(),
    };
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
      await updateDoc(matchDocRef, { matchResult: resultData });
      setMatchResultSaved(resultData); // Update local state
      setIsWinnerModalOpen(false);
      alert("Hasil pertandingan berhasil disimpan.");
    } catch (e) {
      console.error("Error saving match result:", e);
      setError("Gagal menyimpan hasil pertandingan.");
    } finally {
      setIsSavingResult(false);
    }
  };


  const handleKetuaAction = async (pesilatColor: PesilatColorIdentity, actionTypeButtonPressed: KetuaActionType) => {
    if (!activeMatchId || activeMatchId.trim() === "") { alert("Tidak bisa menambah tindakan: ID pertandingan aktif tidak valid."); return; }
    if (isSubmittingAction) { alert("Sedang memproses tindakan sebelumnya, harap tunggu."); return; }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') { alert("Tidak bisa menambah tindakan: Pertandingan telah selesai."); return; }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) { alert(`Tidak bisa menambah tindakan: Babak tidak valid (${dewanTimerStatus.currentRound || 'tidak diketahui'}). Harap tunggu Dewan memulai babak.`); return; }
    setIsSubmittingAction(true);
    try {
      let pointsToLog = 0; let actionTypeToLog: KetuaActionType = actionTypeButtonPressed; let currentOriginalActionType: KetuaActionType | undefined = undefined;
      if (actionTypeButtonPressed === 'Teguran') { actionTypeToLog = 'Teguran'; pointsToLog = TEGURAN_POINTS;
      } else if (actionTypeButtonPressed === 'Binaan') {
        const binaanAsliCount = ketuaActionsLog.filter(log => log.pesilatColor === pesilatColor && log.round === dewanTimerStatus.currentRound && log.actionType === 'Binaan' && typeof log.originalActionType === 'undefined').length;
        if (binaanAsliCount < 2) { // Changed from < 1 to < 2
            actionTypeToLog = 'Binaan'; pointsToLog = 0; 
        } else { 
            actionTypeToLog = 'Teguran'; pointsToLog = TEGURAN_POINTS; currentOriginalActionType = 'Binaan'; 
        }
      } else if (actionTypeButtonPressed === 'Peringatan') {
        const peringatanCount = countActionsInRound(ketuaActionsLog, pesilatColor, 'Peringatan', dewanTimerStatus.currentRound);
        pointsToLog = peringatanCount === 0 ? PERINGATAN_POINTS_FIRST_PRESS : PERINGATAN_POINTS_SECOND_PRESS; actionTypeToLog = 'Peringatan';
      } else if (actionTypeButtonPressed === 'Jatuhan') { pointsToLog = JATUHAN_POINTS; actionTypeToLog = 'Jatuhan'; }
      const baseActionData: Omit<KetuaActionLogEntry, 'id' | 'timestamp'> & { timestamp: any } = { pesilatColor, actionType: actionTypeToLog, round: dewanTimerStatus.currentRound, timestamp: serverTimestamp(), points: pointsToLog, };
      const actionDataWithOptionalField = currentOriginalActionType !== undefined ? { ...baseActionData, originalActionType: currentOriginalActionType } : baseActionData;
      await addDoc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), actionDataWithOptionalField);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err); console.error(`Error adding official action for match ${activeMatchId}:`, errorMessage, err);
      setError(`Gagal menyimpan tindakan: ${errorMessage}`); alert(`Gagal menyimpan tindakan: ${errorMessage}`);
    } finally { setIsSubmittingAction(false); }
  };

  const handleDeleteLastAction = async (pesilatColor: PesilatColorIdentity) => {
    if (!activeMatchId || activeMatchId.trim() === "") { alert("Tidak bisa menghapus tindakan: ID pertandingan aktif tidak valid."); return; }
    if (isSubmittingAction) { alert("Sedang memproses tindakan sebelumnya, harap tunggu."); return; }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') { alert("Tidak bisa menghapus tindakan: Pertandingan telah selesai."); return; }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) { alert("Tidak bisa menghapus tindakan: Babak tidak valid. Harap tunggu Dewan memulai babak."); return; }
    setIsSubmittingAction(true);
    try {
      const q = query(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q); let docToDeleteId: string | null = null;
      for (const doc of querySnapshot.docs) {
        const action = { id: doc.id, ...doc.data() } as KetuaActionLogEntry;
        if (action.pesilatColor === pesilatColor && action.round === dewanTimerStatus.currentRound) { docToDeleteId = doc.id; break; }
      }
      if (docToDeleteId) await deleteDoc(doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION, docToDeleteId));
      else alert(`Tidak ada tindakan terakhir yang bisa dihapus untuk pesilat ${pesilatColor} di babak ${dewanTimerStatus.currentRound}.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err); console.error(`Error deleting last action for match ${activeMatchId}:`, errorMessage, err);
      setError(`Gagal menghapus tindakan: ${errorMessage}`); alert(`Gagal menghapus tindakan: ${errorMessage}`);
    } finally { setIsSubmittingAction(false); }
  };

  const handleCreateVerificationRequest = async () => {
    if (!selectedVerificationTypeForCreation) { alert("Silakan pilih jenis verifikasi terlebih dahulu."); return; }
    if (!activeMatchId) { alert("Tidak ada pertandingan aktif untuk memulai verifikasi."); return; }
    if (!dewanTimerStatus.currentRound || ![1,2,3].includes(dewanTimerStatus.currentRound) ) { alert("Babak saat ini tidak valid untuk memulai verifikasi."); return; }
    setIsCreatingVerification(true);
    try {
      const verificationData: Omit<VerificationRequest, 'id' | 'timestamp'> & {timestamp: any} = { matchId: activeMatchId, type: selectedVerificationTypeForCreation, status: 'pending', round: dewanTimerStatus.currentRound, timestamp: serverTimestamp(), votes: { 'juri-1': null, 'juri-2': null, 'juri-3': null }, requestingOfficial: 'ketua', };
      const batch = writeBatch(db); const verificationsRef = collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION);
      const qPending = query(verificationsRef, where("status", "==", "pending")); const pendingSnapshot = await getDocs(qPending);
      pendingSnapshot.forEach(docSnap => { batch.update(docSnap.ref, { status: 'cancelled' }); });
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
      const currentTimerStatusForPause: TimerMatchStatus = `PausedForVerificationRound${dewanTimerStatus.currentRound}`;
      batch.update(matchDocRef, { "timer_status.isTimerRunning": false, "timer_status.matchStatus": currentTimerStatusForPause });
      const newVerificationRef = doc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION));
      batch.set(newVerificationRef, verificationData); await batch.commit();
      alert(`Verifikasi untuk ${selectedVerificationTypeForCreation === 'jatuhan' ? 'Jatuhan' : 'Pelanggaran'} telah dimulai. Timer pertandingan dijeda.`);
      setIsVerificationCreationDialogOpen(false); setSelectedVerificationTypeForCreation('');
    } catch (err) {
      console.error("Error creating verification:", err);
      setError(err instanceof Error ? `Gagal memulai verifikasi: ${err.message}` : "Gagal memulai verifikasi.");
      alert(err instanceof Error ? `Gagal memulai verifikasi: ${err.message}` : "Gagal memulai verifikasi.");
    } finally { setIsCreatingVerification(false); }
  };

  const handleConfirmVerificationDecision = async () => {
    if (!activeVerificationDetails || !ketuaSelectedDecision || !activeMatchId) { alert("Tidak ada verifikasi aktif atau keputusan belum dipilih."); return; }
    setIsConfirmingVerification(true);
    try {
      const verificationDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION, activeVerificationDetails.id);
      const batch = writeBatch(db); batch.update(verificationDocRef, { status: 'completed', result: ketuaSelectedDecision, });
      let pointsAwardedMessage = "";
      if (activeVerificationDetails.type === 'jatuhan' && (ketuaSelectedDecision === 'merah' || ketuaSelectedDecision === 'biru')) {
        const actionData: Omit<KetuaActionLogEntry, 'id' | 'timestamp'> & { timestamp: any } = { pesilatColor: ketuaSelectedDecision as PesilatColorIdentity, actionType: 'Jatuhan', round: activeVerificationDetails.round, timestamp: serverTimestamp(), points: JATUHAN_POINTS, };
        const newActionRef = doc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION));
        batch.set(newActionRef, actionData); pointsAwardedMessage = ` Poin +${JATUHAN_POINTS} diberikan untuk Jatuhan.`;
      }
      await batch.commit(); alert(`Verifikasi ${activeVerificationDetails.type} dikonfirmasi dengan hasil: ${ketuaSelectedDecision}.${pointsAwardedMessage}`); setKetuaSelectedDecision(null);
    } catch (err) {
      console.error("Error confirming verification:", err);
      setError(err instanceof Error ? `Gagal mengkonfirmasi verifikasi: ${err.message}` : "Gagal mengkonfirmasi verifikasi.");
    } finally { setIsConfirmingVerification(false); }
  };

  const handleCancelCurrentVerification = async () => {
    if (!activeVerificationDetails || !activeMatchId) { alert("Tidak ada verifikasi aktif untuk dibatalkan."); return; }
    setIsConfirmingVerification(true);
    try {
      const verificationDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION, activeVerificationDetails.id);
      await updateDoc(verificationDocRef, { status: 'cancelled' }); alert(`Verifikasi ${activeVerificationDetails.type} telah dibatalkan.`); setKetuaSelectedDecision(null);
    } catch (err) {
       console.error("Error cancelling verification:", err);
       setError(err instanceof Error ? `Gagal membatalkan verifikasi: ${err.message}` : "Gagal membatalkan verifikasi.");
    } finally { setIsConfirmingVerification(false); }
  };

  const isActionButtonDisabled = isSubmittingAction || dewanTimerStatus.matchStatus === 'MatchFinished' || isLoadingPage || !dewanTimerStatus.isTimerRunning;
  const getJuriVoteBoxClass = (vote: JuriVoteValue) => {
    if (vote === 'merah') return "bg-red-500"; if (vote === 'biru') return "bg-blue-500";
    if (vote === 'invalid') return "bg-yellow-400"; return "bg-white dark:bg-gray-700";
  };

  const summaryTableHeaders = ["Sudut", "Peringatan 1", "Peringatan 2", "Teguran 1", "Teguran 2", "Jatuhan", "Tendangan Sah", "Pukulan Sah", "Total Skor Akhir"];

  if (!gelanggangName && !isLoadingPage) {
    return ( <div className="flex flex-col min-h-screen"> <Header overrideBackgroundClass="bg-gray-50 dark:bg-black" /> <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center"> <AlertTriangle className="h-12 w-12 text-destructive mb-4" /> <h1 className="text-xl font-semibold text-destructive">Nama Gelanggang Diperlukan</h1> <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data pertandingan tanpa nama gelanggang.</p> <Button asChild className="mt-6"> <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link> </Button> </main> </div> );
  }
  if (isLoadingPage && (!activeMatchId || !matchDetailsLoaded)) {
    return ( <div className="flex flex-col min-h-screen"> <Header overrideBackgroundClass="bg-gray-50 dark:bg-black" /> <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center"> <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /> <p className="text-lg text-muted-foreground"> {configMatchId === undefined ? `Memuat konfigurasi untuk Gelanggang: ${gelanggangName || '...'}` : !activeMatchId && configMatchId === null ? `Tidak ada jadwal aktif untuk Gelanggang: ${gelanggangName || '...'}` : `Memuat data pertandingan untuk Gelanggang: ${gelanggangName || '...'}`} </p> {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>} </main> </div> );
  }
  if (!activeMatchId && !isLoadingPage && configMatchId === null) {
    return ( <div className="flex flex-col min-h-screen"> <Header overrideBackgroundClass="bg-gray-50 dark:bg-black" /> <main className="flex-1 container mx-auto px-4 py-8"> <Card className="bg-primary text-primary-foreground text-center mb-6 shadow-xl"> <CardContent className="p-3 md:p-4"> <h1 className="text-xl md:text-2xl font-bold font-headline">Ketua Pertandingan (Gel: {gelanggangName || 'N/A'})</h1> </CardContent> </Card> <div className="text-center"> <div className="text-muted-foreground mb-4">{error || `Tidak ada pertandingan yang aktif untuk Gelanggang: ${gelanggangName}.`}</div> <Button variant="outline" asChild> <Link href="/login"> <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login </Link> </Button> </div> </main> </div> );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-black">
      <Header overrideBackgroundClass="bg-gray-50 dark:bg-black" />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <Card className="bg-primary text-primary-foreground text-center mb-4 shadow-xl"> <CardContent className="p-3 md:p-4"> <h1 className="text-xl md:text-2xl font-bold font-headline">Ketua Pertandingan (Gel: {gelanggangName || 'N/A'})</h1> <div className="text-xs md:text-sm opacity-90"> {isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-4 w-32 inline-block bg-primary-foreground/30" /> : (matchDetails?.place || `Partai No. ${matchDetails?.matchNumber || 'N/A'}`)} {matchDetails && matchDetailsLoaded && ` - ${matchDetails.class} (${matchDetails.round})`} </div> </CardContent> </Card>
        <div className="flex justify-between items-center mb-4 px-1"> <div className="text-left"> <div className="text-sm font-semibold text-red-600 dark:text-red-400">KONTINGEN {pesilatMerahInfo?.contingent || (isLoadingPage && activeMatchId ? <Skeleton className="h-4 w-16 inline-block bg-muted" /> : '-')}</div> <div className="text-lg font-bold text-red-600 dark:text-red-400">{pesilatMerahInfo?.name || (isLoadingPage && activeMatchId ? <Skeleton className="h-6 w-32 bg-muted" /> : 'PESILAT MERAH')}</div> </div> <div className="text-right"> <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">KONTINGEN {pesilatBiruInfo?.contingent || (isLoadingPage && activeMatchId ? <Skeleton className="h-4 w-16 inline-block bg-muted" /> : '-')}</div> <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{pesilatBiruInfo?.name || (isLoadingPage && activeMatchId ? <Skeleton className="h-6 w-32 bg-muted" /> : 'PESILAT BIRU')}</div> </div> </div>
        <div className="mb-6 overflow-x-auto">
          <Table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
            <TableHeader><TableRow className="bg-gray-100 dark:bg-gray-700"><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-red-600 dark:text-red-400 py-2 px-1 text-xs sm:text-sm">Hukuman </TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-red-600 dark:text-red-400 py-2 px-1 text-xs sm:text-sm">Binaan </TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-red-600 dark:text-red-400 py-2 px-1 text-xs sm:text-sm">Jatuhan </TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center py-2 px-1 text-xs sm:text-sm text-gray-700 dark:text-gray-200">Babak</TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-blue-600 dark:text-blue-400 py-2 px-1 text-xs sm:text-sm">Jatuhan </TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-blue-600 dark:text-blue-400 py-2 px-1 text-xs sm:text-sm">Binaan </TableHead><TableHead className="border border-gray-300 dark:border-gray-600 text-center text-blue-600 dark:text-blue-400 py-2 px-1 text-xs sm:text-sm">Hukuman </TableHead></TableRow></TableHeader>
            <TableBody>{ROUNDS.map((round) => { const scoresMerah = calculateDisplayScoresForTable(ketuaActionsLog, 'merah', round); const scoresBiru = calculateDisplayScoresForTable(ketuaActionsLog, 'biru', round); return ( <TableRow key={`round-display-${round}`} className={dewanTimerStatus.currentRound === round ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''}><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresMerah.hukuman}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresMerah.binaan}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresMerah.jatuhan}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-bold py-2 px-1 text-gray-800 dark:text-gray-100">{round === 1 ? 'I' : round === 2 ? 'II' : 'III'}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresBiru.jatuhan}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresBiru.binaan}</TableCell><TableCell className="border border-gray-300 dark:border-gray-600 text-center font-medium py-2 px-1 text-gray-800 dark:text-gray-100">{isLoadingPage && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto bg-muted"/> : scoresBiru.hukuman}</TableCell></TableRow> ); })}</TableBody>
          </Table>
        </div>
        <Card className="mb-6 bg-white dark:bg-gray-800"> <CardHeader> <CardTitle className="text-lg text-gray-800 dark:text-gray-100">Log Tindakan Ketua</CardTitle> </CardHeader> <CardContent> {ketuaActionsLog.length === 0 ? ( <p className="text-muted-foreground">Belum ada tindakan tercatat.</p> ) : ( <div className="max-h-48 overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="w-[100px] text-gray-600 dark:text-gray-300">Waktu</TableHead><TableHead className="text-gray-600 dark:text-gray-300">Babak</TableHead><TableHead className="text-gray-600 dark:text-gray-300">Pesilat</TableHead><TableHead className="text-gray-600 dark:text-gray-300">Tindakan</TableHead><TableHead className="text-right text-gray-600 dark:text-gray-300">Poin</TableHead></TableRow></TableHeader><TableBody>{ketuaActionsLog.map((action) => ( <TableRow key={action.id} className="text-gray-700 dark:text-gray-200"><TableCell>{formatFirestoreTimestamp(action.timestamp)}</TableCell><TableCell>{action.round}</TableCell><TableCell><Badge variant={action.pesilatColor === 'merah' ? 'destructive' : 'default'} className={action.pesilatColor === 'biru' ? 'bg-blue-500 text-white' : ''}>{action.pesilatColor === 'merah' ? pesilatMerahInfo?.name || 'Merah' : pesilatBiruInfo?.name || 'Biru'}</Badge></TableCell><TableCell>{action.actionType}{action.originalActionType ? ` (dari ${action.originalActionType})` : ''}</TableCell><TableCell className="text-right">{action.points}</TableCell></TableRow> ))}</TableBody></Table></div> )} </CardContent> </Card>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-start"> <div className="space-y-2"> <div className="grid grid-cols-2 gap-2"> <Button onClick={() => handleKetuaAction('merah', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button> <Button onClick={() => handleKetuaAction('merah', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button> <Button onClick={() => handleKetuaAction('merah', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button> <Button onClick={() => handleKetuaAction('merah', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button> </div> <Button onClick={() => handleDeleteLastAction('merah')} className="w-full py-4 text-sm sm:text-base bg-red-800 hover:bg-red-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'merah' && a.round === dewanTimerStatus.currentRound).length === 0}> <Trash2 className="mr-2 h-4 w-4" /> Hapus </Button> </div>
          <div className="flex flex-col items-center justify-center space-y-3 md:pt-8 order-first md:order-none"> <div className={cn("text-center p-2 rounded-md w-full bg-white dark:bg-gray-800 shadow", dewanTimerStatus.matchStatus.startsWith('PausedForVerification') ? "border-2 border-orange-500" : dewanTimerStatus.isTimerRunning ? "border-2 border-green-500" : "border border-gray-300 dark:border-gray-700" )}> <div className="text-2xl font-mono font-bold text-gray-800 dark:text-gray-100"> {dewanTimerStatus.isTimerRunning ? formatTime(dewanTimerStatus.timerSeconds) : "JEDA"} </div> <div className="text-xs text-gray-500 dark:text-gray-400"> Babak {dewanTimerStatus.currentRound || '?'} - { dewanTimerStatus.matchStatus.startsWith('PausedForVerification') ? `Verifikasi Babak ${dewanTimerStatus.currentRound}` : dewanTimerStatus.matchStatus || 'Menunggu' } </div> </div>
            <Dialog open={isVerificationCreationDialogOpen} onOpenChange={setIsVerificationCreationDialogOpen}><DialogTrigger asChild><Button className="w-full md:w-auto bg-yellow-500 hover:bg-yellow-600 text-black py-3 text-sm sm:text-base" disabled={isLoadingPage || dewanTimerStatus.matchStatus === 'MatchFinished' || isCreatingVerification || (activeVerificationDetails !== null && activeVerificationDetails.status === 'pending')} onClick={() => setSelectedVerificationTypeForCreation('')}><><span className="flex items-center">{isCreatingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Vote className="mr-2 h-4 w-4"/>}Mulai Verifikasi</span></></Button></DialogTrigger><DialogContent className="sm:max-w-[425px] bg-white dark:bg-gray-800"> <RadixDialogTitle className="sr-only">Mulai Verifikasi Juri</RadixDialogTitle> <DialogHeader> <RadixDialogTitle className="text-gray-800 dark:text-gray-100">Mulai Verifikasi Juri</RadixDialogTitle> <DialogDescription className="text-gray-600 dark:text-gray-300"> Pilih jenis verifikasi. Ini akan menjeda timer dan mengirim permintaan ke juri. Verifikasi sebelumnya yang masih 'pending' akan dibatalkan. </DialogDescription> </DialogHeader> <div className="py-4"> <RadioGroup value={selectedVerificationTypeForCreation} onValueChange={(value) => setSelectedVerificationTypeForCreation(value as VerificationType)} className="text-gray-700 dark:text-gray-200"> <div className="flex items-center space-x-2"> <RadioGroupItem value="jatuhan" id="v-jatuhan-create" /> <Label htmlFor="v-jatuhan-create">Verifikasi Jatuhan</Label> </div> <div className="flex items-center space-x-2"> <RadioGroupItem value="pelanggaran" id="v-pelanggaran-create" /> <Label htmlFor="v-pelanggaran-create">Verifikasi Pelanggaran</Label> </div> </RadioGroup> </div> <DialogFooter> <DialogClose asChild> <Button type="button" variant="outline" disabled={isCreatingVerification}>Tutup</Button> </DialogClose> <Button type="button" onClick={handleCreateVerificationRequest} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isCreatingVerification || !selectedVerificationTypeForCreation}> {isCreatingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Buat & Jeda Timer </Button> </DialogFooter> </DialogContent> </Dialog>
            <Button onClick={handleTentukanPemenang} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white py-3 text-sm sm:text-base" disabled={isLoadingPage || (dewanTimerStatus.matchStatus !== 'MatchFinished' && !matchResultSaved) || !!matchResultSaved || isSavingResult}><Trophy className="mr-2 h-4 w-4"/>{matchResultSaved ? 'Hasil Telah Disimpan' : 'Tentukan Pemenang'}</Button>
          </div>
          <div className="space-y-2"> <div className="grid grid-cols-2 gap-2"> <Button onClick={() => handleKetuaAction('biru', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button> <Button onClick={() => handleKetuaAction('biru', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button> <Button onClick={() => handleKetuaAction('biru', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button> <Button onClick={() => handleKetuaAction('biru', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button> </div> <Button onClick={() => handleDeleteLastAction('biru')} className="w-full py-4 text-sm sm:text-base bg-blue-800 hover:bg-blue-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'biru' && a.round === dewanTimerStatus.currentRound).length === 0}> <Trash2 className="mr-2 h-4 w-4"/> Hapus </Button> </div> </div>
        {error && !isLoadingPage && <div className="text-red-500 dark:text-red-400 text-center mt-4 p-2 bg-red-100 dark:bg-red-900/30 border border-red-500 dark:border-red-700 rounded-md">Error: {error}</div>}

        <Dialog open={isVoteResultModalOpen} onOpenChange={(openStateFromDialog) => { if (!openStateFromDialog) { if (!activeVerificationDetails || activeVerificationDetails.status !== 'pending') { setIsVoteResultModalOpen(false); setKetuaSelectedDecision(null); } } }} > <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-800" onPointerDownOutside={(e) => { if(activeVerificationDetails?.status === 'pending') e.preventDefault(); }} onEscapeKeyDown={(e) => { if(activeVerificationDetails?.status === 'pending') e.preventDefault(); }} > <RadixDialogTitle className="sr-only">Hasil Verifikasi Juri</RadixDialogTitle> <DialogHeader> <RadixDialogTitle className="text-2xl font-bold font-headline text-center text-gray-800 dark:text-gray-100">Hasil Verifikasi Juri</RadixDialogTitle> {activeVerificationDetails && ( <DialogDescription className="text-center text-lg text-gray-600 dark:text-gray-300"> {activeVerificationDetails.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'} (Babak {activeVerificationDetails.round}) </DialogDescription> )} </DialogHeader> <div className="my-4 space-y-3"> <h3 className="font-semibold text-center text-lg text-gray-700 dark:text-gray-200">Vote Juri:</h3> <div className="grid grid-cols-3 gap-3 items-center justify-items-center"> {(['juri-1', 'juri-2', 'juri-3'] as const).map((juriKey, index) => ( <div key={juriKey} className="flex flex-col items-center space-y-1"> <div className={cn("w-16 h-16 rounded-md border-2 border-gray-400 dark:border-gray-500 flex items-center justify-center", getJuriVoteBoxClass(activeVerificationDetails?.votes[juriKey] || null))}></div> <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Juri {index + 1}</p> </div> ))} </div> </div> <div className="my-6 space-y-3"> <p className="text-center font-semibold text-lg text-gray-700 dark:text-gray-200">Keputusan Ketua Pertandingan:</p> <div className="flex justify-around gap-2"> <Button onClick={() => setKetuaSelectedDecision('merah')} className={cn("flex-1 text-white py-3 text-base", ketuaSelectedDecision === 'merah' ? "ring-4 ring-offset-2 ring-red-700 bg-red-700" : "bg-red-500 hover:bg-red-600")} disabled={isConfirmingVerification} > SUDUT MERAH </Button> <Button onClick={() => setKetuaSelectedDecision('biru')} className={cn("flex-1 text-white py-3 text-base", ketuaSelectedDecision === 'biru' ? "ring-4 ring-offset-2 ring-blue-700 bg-blue-700" : "bg-blue-500 hover:bg-blue-600")} disabled={isConfirmingVerification} > SUDUT BIRU </Button> <Button onClick={() => setKetuaSelectedDecision('invalid')} className={cn("flex-1 text-black py-3 text-base", ketuaSelectedDecision === 'invalid' ? "ring-4 ring-offset-2 ring-yellow-600 bg-yellow-600" : "bg-yellow-400 hover:bg-yellow-500")} disabled={isConfirmingVerification} > INVALID </Button> </div> </div> <DialogFooter className="sm:justify-between mt-6"> <Button type="button" variant="outline" onClick={handleCancelCurrentVerification} disabled={isConfirmingVerification}> {isConfirmingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Batalkan Verifikasi Ini </Button> <Button type="button" onClick={handleConfirmVerificationDecision} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={!ketuaSelectedDecision || isConfirmingVerification} > {isConfirmingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Konfirmasi Keputusan </Button> </DialogFooter> </DialogContent> </Dialog>

        <Dialog open={isWinnerModalOpen} onOpenChange={setIsWinnerModalOpen}>
          <DialogContent className="sm:max-w-2xl bg-card">
            <RadixDialogTitle className="sr-only">Konfirmasi Pemenang Pertandingan</RadixDialogTitle>
            <DialogHeader>
              <RadixDialogTitle className="text-2xl font-headline text-primary text-center">Konfirmasi Pemenang Pertandingan</RadixDialogTitle>
              <DialogDescription className="text-center text-muted-foreground">
                Partai No. {matchDetails?.matchNumber} - {matchDetails?.class} ({matchDetails?.round})
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="overflow-x-auto"><Table><TableHeader><TableRow>{summaryTableHeaders.map(header => <TableHead key={header} className={header === "Sudut" ? "text-left" : "text-center"}>{header}</TableHead>)}</TableRow></TableHeader><TableBody><TableRow><TableCell className="font-semibold text-red-600">MERAH</TableCell><TableCell className="text-center">{summaryScoresMerah.peringatan1}</TableCell><TableCell className="text-center">{summaryScoresMerah.peringatan2}</TableCell><TableCell className="text-center">{summaryScoresMerah.teguran1}</TableCell><TableCell className="text-center">{summaryScoresMerah.teguran2}</TableCell><TableCell className="text-center">{summaryScoresMerah.jatuhan}</TableCell><TableCell className="text-center">{summaryScoresMerah.tendanganSah}</TableCell><TableCell className="text-center">{summaryScoresMerah.pukulanSah}</TableCell><TableCell className="text-center font-bold text-lg">{summaryScoresMerah.totalAkhir}</TableCell></TableRow><TableRow><TableCell className="font-semibold text-blue-600">BIRU</TableCell><TableCell className="text-center">{summaryScoresBiru.peringatan1}</TableCell><TableCell className="text-center">{summaryScoresBiru.peringatan2}</TableCell><TableCell className="text-center">{summaryScoresBiru.teguran1}</TableCell><TableCell className="text-center">{summaryScoresBiru.teguran2}</TableCell><TableCell className="text-center">{summaryScoresBiru.jatuhan}</TableCell><TableCell className="text-center">{summaryScoresBiru.tendanganSah}</TableCell><TableCell className="text-center">{summaryScoresBiru.pukulanSah}</TableCell><TableCell className="text-center font-bold text-lg">{summaryScoresBiru.totalAkhir}</TableCell></TableRow></TableBody></Table></div>
              <div className="space-y-4">
                <div>
                  <Label className="font-semibold text-foreground">Pesilat yang Menang</Label>
                  <RadioGroup value={winnerSelectionDialog || ''} onValueChange={(value) => setWinnerSelectionDialog(value as PesilatColorIdentity | 'seri')} className="flex gap-4 mt-2">
                    <div className="flex items-center space-x-2"> <RadioGroupItem value="merah" id="win-merah" /> <Label htmlFor="win-merah" className="text-red-600">Sudut Merah</Label> </div>
                    <div className="flex items-center space-x-2"> <RadioGroupItem value="biru" id="win-biru" /> <Label htmlFor="win-biru" className="text-blue-600">Sudut Biru</Label> </div>
                    <div className="flex items-center space-x-2"> <RadioGroupItem value="seri" id="win-seri" /> <Label htmlFor="win-seri">Seri</Label> </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label className="font-semibold text-foreground">Jenis Kemenangan</Label>
                  <RadioGroup value={victoryTypeDialog} onValueChange={(value) => setVictoryTypeDialog(value as TandingVictoryType)} className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2">
                    {victoryTypeOptions.map(vt => (
                      <div key={vt} className="flex items-center space-x-2"> <RadioGroupItem value={vt} id={`vt-${vt.replace(/\s+/g, '-')}`} /> <Label htmlFor={`vt-${vt.replace(/\s+/g, '-')}`}>{vt}</Label> </div>
                    ))}
                  </RadioGroup>
                </div>
                <div>
                  <Label htmlFor="victoryReason" className="font-semibold text-foreground">Keterangan Kemenangan (Opsional)</Label>
                  <Input id="victoryReason" value={victoryReasonDialog} onChange={(e) => setVictoryReasonDialog(e.target.value)} placeholder="Contoh: Menang Teknik karena lawan tidak dapat melanjutkan" className="mt-1" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsWinnerModalOpen(false)} disabled={isSavingResult}>Batal</Button>
              <Button onClick={handleConfirmMatchResult} className="bg-green-600 hover:bg-green-700 text-white" disabled={!winnerSelectionDialog || !victoryTypeDialog || isSavingResult}>
                {isSavingResult ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Konfirmasi Pemenang
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="mt-8 text-center"> <Button variant="outline" asChild> <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link> </Button> </div>
      </main>
    </div>
  );
}

export default function KetuaPertandinganTandingPage() {
  return ( <Suspense fallback={ <div className="flex flex-col min-h-screen"> <Header overrideBackgroundClass="bg-gray-50 dark:bg-black" /> <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center"> <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /> <p className="text-lg text-muted-foreground">Memuat halaman Ketua Pertandingan...</p> </main> </div> }> <PageWithSearchParams /> </Suspense> );
}
function PageWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <KetuaPertandinganPageComponent gelanggangName={gelanggangName} />;
}
