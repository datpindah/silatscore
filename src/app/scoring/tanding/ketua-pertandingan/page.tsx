
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Trash2, ShieldCheck, Trophy, Vote } from 'lucide-react';
import type { ScheduleTanding, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType } from '@/lib/types';
import { JATUHAN_POINTS, BINAAN_POINTS_SECOND_PRESS, TEGURAN_POINTS_FIRST_PRESS, TEGURAN_POINTS_SECOND_PRESS, PERINGATAN_POINTS_FIRST_PRESS, PERINGATAN_POINTS_SECOND_PRESS } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, Timestamp, collection, addDoc, query, orderBy, deleteDoc, limit, getDocs } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions'; // This will store KetuaActionLogEntry

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

interface TimerStatusFromDewan {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: string; // e.g., 'Pending', 'OngoingRound1', 'FinishedRound1', 'MatchFinished'
}

const initialTimerStatus: TimerStatusFromDewan = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
};

const ROUNDS = [1, 2, 3] as const;

// Helper function to count actions of a specific type for a pesilat in a specific round
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

// Helper function to get points for the next action based on previous counts
const getPointsForAction = (
  log: KetuaActionLogEntry[],
  pesilatColor: PesilatColorIdentity,
  actionType: KetuaActionType,
  round: 1 | 2 | 3
): number => {
  if (actionType === 'Jatuhan') return JATUHAN_POINTS;

  const count = countActionsInRound(log, pesilatColor, actionType, round);

  if (actionType === 'Binaan') {
    return count === 0 ? 0 : BINAAN_POINTS_SECOND_PRESS; // 1st press = 0 points, 2nd+ press = -1 point
  }
  if (actionType === 'Teguran') {
    return count === 0 ? TEGURAN_POINTS_FIRST_PRESS : TEGURAN_POINTS_SECOND_PRESS; // 1st = -1, 2nd+ = -2
  }
  if (actionType === 'Peringatan') {
    return count === 0 ? PERINGATAN_POINTS_FIRST_PRESS : PERINGATAN_POINTS_SECOND_PRESS; // 1st = -5, 2nd+ = -10
  }
  return 0; // Should not happen for defined types
};

// Helper to calculate display scores for the table
const calculateDisplayScoresForTable = (
  log: KetuaActionLogEntry[],
  pesilatColor: PesilatColorIdentity,
  round: 1 | 2 | 3
): { hukuman: number; binaan: number; jatuhan: number } => {
  const roundActions = log.filter(
    (action) => action.pesilatColor === pesilatColor && action.round === round
  );

  const hukuman = roundActions
    .filter((a) => a.actionType === 'Teguran' || a.actionType === 'Peringatan')
    .reduce((sum, a) => sum + a.points, 0);
  const binaan = roundActions
    .filter((a) => a.actionType === 'Binaan')
    .reduce((sum, a) => sum + a.points, 0);
  const jatuhan = roundActions
    .filter((a) => a.actionType === 'Jatuhan')
    .reduce((sum, a) => sum + a.points, 0);

  return { hukuman, binaan, jatuhan };
};


export default function KetuaPertandinganPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [dewanTimerStatus, setDewanTimerStatus] = useState<TimerStatusFromDewan>(initialTimerStatus);
  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);
  
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetAllMatchData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setDewanTimerStatus(initialTimerStatus);
    setKetuaActionsLog([]);
    setError(null);
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) setConfigMatchId(newDbConfigId);
      else if (configMatchId === undefined && newDbConfigId === null) setConfigMatchId(null);
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, [configMatchId]);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId !== activeMatchId) {
      resetAllMatchData();
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, resetAllMatchData, isLoading]);

  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading) setIsLoading(false);
      setError(null);
      setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
      setKetuaActionsLog([]); setDewanTimerStatus(initialTimerStatus);
      return;
    }

    let mounted = true;
    if (!isLoading && !matchDetailsLoaded) setIsLoading(true);

    const unsubscribers: (() => void)[] = [];

    const loadScheduleDetails = async () => {
      if (!mounted || !activeMatchId) return;
      try {
        const scheduleDoc = await getDoc(doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId));
        if (!mounted) return;
        if (scheduleDoc.exists()) {
          const data = scheduleDoc.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
        } else { setError(`Detail jadwal ${activeMatchId} tidak ditemukan.`); setMatchDetailsLoaded(false); }
      } catch (err) { console.error("Error fetching schedule details:", err); setError("Gagal memuat detail jadwal."); setMatchDetailsLoaded(false); }
    };
    loadScheduleDetails();

    const unsubTimer = onSnapshot(doc(db, MATCHES_TANDING_COLLECTION, activeMatchId), (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists() && docSnap.data()?.timer_status) setDewanTimerStatus(docSnap.data()?.timer_status as TimerStatusFromDewan);
      else setDewanTimerStatus(initialTimerStatus);
    }, (err) => { if (!mounted) return; console.error("Error fetching dewan timer:", err); setError("Gagal status timer dewan."); });
    unsubscribers.push(unsubTimer);

    const actionsQuery = query(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc"));
    const unsubActions = onSnapshot(actionsQuery, (snap) => {
      if (!mounted) return;
      const actions: KetuaActionLogEntry[] = [];
      snap.forEach((doc) => actions.push({ id: doc.id, ...doc.data() } as KetuaActionLogEntry));
      setKetuaActionsLog(actions);
    }, (err) => { if (!mounted) return; console.error("Error fetching official actions:", err); setError("Gagal memuat log tindakan."); });
    unsubscribers.push(unsubActions);
    
    if (matchDetailsLoaded && isLoading) setIsLoading(false);

    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId, isLoading, matchDetailsLoaded]);

  useEffect(() => { if (isLoading && (matchDetailsLoaded || activeMatchId === null)) setIsLoading(false); }, [isLoading, matchDetailsLoaded, activeMatchId]);

  const handleKetuaAction = async (pesilatColor: PesilatColorIdentity, actionType: KetuaActionType) => {
    if (!activeMatchId || isSubmittingAction || dewanTimerStatus.matchStatus === 'MatchFinished' || dewanTimerStatus.currentRound === undefined) {
      alert("Tidak bisa menambah tindakan: match belum aktif, sedang proses, match selesai, atau babak tidak valid.");
      return;
    }
    setIsSubmittingAction(true);
    try {
      const points = getPointsForAction(ketuaActionsLog, pesilatColor, actionType, dewanTimerStatus.currentRound);
      const actionData: Omit<KetuaActionLogEntry, 'id'> = {
        pesilatColor,
        actionType,
        round: dewanTimerStatus.currentRound,
        timestamp: Timestamp.now(),
        points,
      };
      await addDoc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), actionData);
    } catch (err) {
      console.error("Error adding official action:", err);
      alert(`Gagal menyimpan tindakan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeleteLastAction = async (pesilatColor: PesilatColorIdentity) => {
    if (!activeMatchId || isSubmittingAction || dewanTimerStatus.matchStatus === 'MatchFinished' || dewanTimerStatus.currentRound === undefined) {
      alert("Tidak bisa menghapus tindakan: match belum aktif, sedang proses, match selesai, atau babak tidak valid.");
      return;
    }
    setIsSubmittingAction(true);
    try {
      const q = query(
        collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      let docToDeleteId: string | null = null;
      querySnapshot.forEach((doc) => {
        const action = doc.data() as Omit<KetuaActionLogEntry, 'id'>;
        if (action.pesilatColor === pesilatColor && action.round === dewanTimerStatus.currentRound) {
          docToDeleteId = doc.id;
        }
      });

      if (docToDeleteId) {
        await deleteDoc(doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION, docToDeleteId));
      } else {
        alert("Tidak ada tindakan terakhir yang bisa dihapus untuk pesilat ini di babak ini.");
      }
    } catch (err) {
      console.error("Error deleting last action:", err);
      alert(`Gagal menghapus tindakan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };
  
  const handleVerifikasiJuri = () => alert("Fungsi Verifikasi Juri belum diimplementasikan.");
  const handleTentukanPemenang = () => alert("Fungsi Tentukan Pemenang belum diimplementasikan.");

  const isActionButtonDisabled = isSubmittingAction || dewanTimerStatus.matchStatus === 'MatchFinished' || isLoading || !dewanTimerStatus.isTimerRunning;

  if (configMatchId === undefined || (isLoading && activeMatchId)) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat Panel Ketua Pertandingan...</p>
        </main>
      </div>
    );
  }

  if (!activeMatchId && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto px-4 py-8 text-center">
           <h1 className="text-2xl font-bold text-primary mb-2">Ketua Pertandingan</h1>
           <p className="text-muted-foreground mb-4">Tidak ada pertandingan yang aktif.</p>
           <Button variant="outline" asChild><Link href="/admin/schedule-tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Admin</Link></Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-black">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Ketua Pertandingan</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">{matchDetails?.place || (isLoading ? <Skeleton className="h-4 w-24 inline-block" /> : 'Gelanggang A')}</p>
        </div>

        {/* Pesilat Info Row */}
        <div className="flex justify-between items-center mb-4 px-1">
          <div className="text-left">
            <div className="text-sm font-semibold text-red-600">KONTINGEN {pesilatMerahInfo?.contingent || <Skeleton className="h-4 w-16 inline-block" />}</div>
            <div className="text-lg font-bold text-red-600">{pesilatMerahInfo?.name || <Skeleton className="h-6 w-32" />}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-blue-600">KONTINGEN {pesilatBiruInfo?.contingent || <Skeleton className="h-4 w-16 inline-block" />}</div>
            <div className="text-lg font-bold text-blue-600">{pesilatBiruInfo?.name || <Skeleton className="h-6 w-32" />}</div>
          </div>
        </div>

        {/* Score Table */}
        <div className="mb-6 overflow-x-auto">
          <Table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <TableHeader>
              <TableRow className="bg-gray-100 dark:bg-gray-800">
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Hukuman (M)</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Binaan (M)</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Jatuhan (M)</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center py-2 px-1 text-xs sm:text-sm">Babak</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Jatuhan (B)</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Binaan (B)</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Hukuman (B)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROUNDS.map((round) => {
                const scoresMerah = calculateDisplayScoresForTable(ketuaActionsLog, 'merah', round);
                const scoresBiru = calculateDisplayScoresForTable(ketuaActionsLog, 'biru', round);
                return (
                  <TableRow key={`round-display-${round}`} className={dewanTimerStatus.currentRound === round ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-white dark:bg-gray-800/50'}>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.hukuman}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.binaan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.jatuhan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-bold py-2 px-1">{round === 1 ? 'I' : round === 2 ? 'II' : 'III'}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.jatuhan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.binaan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.hukuman}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {/* Action Buttons Grid */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-start">
          {/* Pesilat Merah Actions */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleKetuaAction('merah', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button>
            </div>
            <Button onClick={() => handleDeleteLastAction('merah')} className="w-full py-4 text-sm sm:text-base bg-red-800 hover:bg-red-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'merah' && a.round === dewanTimerStatus.currentRound).length === 0}>
              <Trash2 className="mr-2 h-4 w-4" /> Hapus (Merah)
            </Button>
          </div>

          {/* Central Timer Status and Buttons */}
          <div className="flex flex-col items-center justify-center space-y-3 md:pt-8 order-first md:order-none">
             <div className={cn("text-center p-2 rounded-md", dewanTimerStatus.isTimerRunning ? "bg-green-100 dark:bg-green-900" : "bg-gray-100 dark:bg-gray-700")}>
                <div className="text-2xl font-mono font-bold text-gray-800 dark:text-gray-100">{dewanTimerStatus.isTimerRunning ? formatTime(dewanTimerStatus.timerSeconds) : "JEDA"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Babak {dewanTimerStatus.currentRound} - {dewanTimerStatus.matchStatus}</div>
            </div>
            <Button onClick={handleVerifikasiJuri} className="w-full md:w-auto bg-yellow-500 hover:bg-yellow-600 text-black py-3 text-sm sm:text-base" disabled={isLoading}><Vote className="mr-2 h-4 w-4"/>Verifikasi Juri</Button>
            <Button onClick={handleTentukanPemenang} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white py-3 text-sm sm:text-base" disabled={isLoading || dewanTimerStatus.matchStatus !== 'MatchFinished'}><Trophy className="mr-2 h-4 w-4"/>Tentukan Pemenang</Button>
          </div>
          
          {/* Pesilat Biru Actions */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleKetuaAction('biru', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button>
            </div>
            <Button onClick={() => handleDeleteLastAction('biru')} className="w-full py-4 text-sm sm:text-base bg-blue-800 hover:bg-blue-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'biru' && a.round === dewanTimerStatus.currentRound).length === 0}>
              <Trash2 className="mr-2 h-4 w-4"/> Hapus (Biru)
            </Button>
          </div>
        </div>
        {error && <p className="text-red-500 text-center mt-4">Error: {error}</p>}
      </main>
    </div>
  );
}
