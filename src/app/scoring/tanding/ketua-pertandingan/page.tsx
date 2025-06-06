
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Trash2, ShieldCheck, Trophy, Vote, Play, Pause } from 'lucide-react';
import type { ScheduleTanding, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType } from '@/lib/types';
import { JATUHAN_POINTS, TEGURAN_POINTS, PERINGATAN_POINTS_FIRST_PRESS, PERINGATAN_POINTS_SECOND_PRESS } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, Timestamp, collection, addDoc, query, orderBy, deleteDoc, limit, getDocs } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions'; 

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

interface TimerStatusFromDewan {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: string; 
}

const initialTimerStatus: TimerStatusFromDewan = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
};

const ROUNDS = [1, 2, 3] as const;

// Fungsi ini tidak lagi menghitung poin Binaan/Teguran bertingkat, logika itu pindah ke handleKetuaAction
// Fungsi ini dipertahankan untuk Peringatan dan Jatuhan, atau jika ada logika poin lain di masa depan.
// Namun, untuk Binaan dan Teguran, poin akan ditentukan langsung di handleKetuaAction.
// Untuk Peringatan, kita masih bisa menggunakan countActionsInRound
const countActionsInRound = (
  log: KetuaActionLogEntry[],
  pesilatColor: PesilatColorIdentity,
  actionType: KetuaActionType, // Menghitung actionType yang tercatat
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

  let hukuman = 0;
  let binaan = 0;
  let jatuhan = 0;

  roundActions.forEach(action => {
    // Poin sudah tercatat dengan benar di action.points
    if (action.actionType === 'Teguran' || action.actionType === 'Peringatan') {
      hukuman += action.points;
    } else if (action.actionType === 'Binaan') { // Binaan yang tercatat akan memiliki poin 0
      binaan += action.points;
    } else if (action.actionType === 'Jatuhan') {
      jatuhan += action.points;
    }
  });

  return { hukuman, binaan, jatuhan };
};

const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
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

  const handleKetuaAction = async (pesilatColor: PesilatColorIdentity, actionTypeButtonPressed: KetuaActionType) => {
    if (!activeMatchId || activeMatchId.trim() === "") {
      alert("Tidak bisa menambah tindakan: ID pertandingan aktif tidak valid.");
      return;
    }
    if (isSubmittingAction) {
      alert("Sedang memproses tindakan sebelumnya, harap tunggu.");
      return;
    }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') {
      alert("Tidak bisa menambah tindakan: Pertandingan telah selesai.");
      return;
    }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) {
      alert(`Tidak bisa menambah tindakan: Babak tidak valid (${dewanTimerStatus.currentRound || 'tidak diketahui'}). Harap tunggu Dewan memulai babak.`);
      return;
    }

    setIsSubmittingAction(true);
    try {
        let pointsToLog = 0;
        let actionTypeToLog: KetuaActionType = actionTypeButtonPressed;
        let originalActionTypeForLog: KetuaActionType | undefined = undefined;

        if (actionTypeButtonPressed === 'Teguran') {
            pointsToLog = TEGURAN_POINTS; // Selalu -1
        } else if (actionTypeButtonPressed === 'Binaan') {
            originalActionTypeForLog = 'Binaan'; // Tandai bahwa tombol Binaan yang ditekan
            
            // Hitung berapa kali tombol Binaan (yang menghasilkan Binaan atau Teguran) telah ditekan SEBELUMNYA
            const binaanEventsInRound = ketuaActionsLog.filter(
                logEntry =>
                    logEntry.pesilatColor === pesilatColor &&
                    logEntry.round === dewanTimerStatus.currentRound &&
                    (logEntry.actionType === 'Binaan' || logEntry.originalActionType === 'Binaan')
            ).length;

            // Jika ini adalah tekanan tombol Binaan ke-2, ke-4, dst. (genap)
            if ((binaanEventsInRound + 1) % 2 === 0) {
                actionTypeToLog = 'Teguran'; // Catat sebagai Teguran
                pointsToLog = TEGURAN_POINTS; // Poinnya -1
            } else {
                actionTypeToLog = 'Binaan'; // Catat sebagai Binaan
                pointsToLog = 0; // Poinnya 0
            }
        } else if (actionTypeButtonPressed === 'Peringatan') {
            // Hitung berapa banyak Peringatan yang sudah tercatat untuk pesilat ini di babak ini
            const peringatanCount = countActionsInRound(ketuaActionsLog, pesilatColor, 'Peringatan', dewanTimerStatus.currentRound);
            pointsToLog = peringatanCount === 0 ? PERINGATAN_POINTS_FIRST_PRESS : PERINGATAN_POINTS_SECOND_PRESS;
        } else if (actionTypeButtonPressed === 'Jatuhan') {
            pointsToLog = JATUHAN_POINTS;
        }

        const actionData: Omit<KetuaActionLogEntry, 'id'> = {
            pesilatColor,
            actionType: actionTypeToLog,
            round: dewanTimerStatus.currentRound,
            timestamp: Timestamp.now(),
            points: pointsToLog,
        };

        if (originalActionTypeForLog) {
            // TypeScript needs assertion here if originalActionType is not part of Omit<>
            (actionData as Partial<KetuaActionLogEntry>).originalActionType = originalActionTypeForLog;
        }

        await addDoc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), actionData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Error adding official action for match ${activeMatchId}:`, errorMessage, err);
      setError(`Gagal menyimpan tindakan: ${errorMessage}`);
      alert(`Gagal menyimpan tindakan: ${errorMessage}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeleteLastAction = async (pesilatColor: PesilatColorIdentity) => {
    if (!activeMatchId || activeMatchId.trim() === "") {
      alert("Tidak bisa menghapus tindakan: ID pertandingan aktif tidak valid.");
      return;
    }
    if (isSubmittingAction) {
        alert("Sedang memproses tindakan sebelumnya, harap tunggu.");
        return;
    }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') {
      alert("Tidak bisa menghapus tindakan: Pertandingan telah selesai.");
      return;
    }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) {
      alert("Tidak bisa menghapus tindakan: Babak tidak valid. Harap tunggu Dewan memulai babak.");
      return;
    }

    setIsSubmittingAction(true);
    try {
      const q = query(
        collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION),
        orderBy("timestamp", "desc") 
      );
      
      const querySnapshot = await getDocs(q);
      let docToDeleteId: string | null = null;

      for (const doc of querySnapshot.docs) {
          const action = { id: doc.id, ...doc.data() } as KetuaActionLogEntry;
          if (action.pesilatColor === pesilatColor && action.round === dewanTimerStatus.currentRound) {
              docToDeleteId = doc.id;
              break; 
          }
      }

      if (docToDeleteId) {
        await deleteDoc(doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION, docToDeleteId));
      } else {
        alert(`Tidak ada tindakan terakhir yang bisa dihapus untuk pesilat ${pesilatColor} di babak ${dewanTimerStatus.currentRound}.`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Error deleting last action for match ${activeMatchId}:`, errorMessage, err);
      setError(`Gagal menghapus tindakan: ${errorMessage}`);
      alert(`Gagal menghapus tindakan: ${errorMessage}`);
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
           <div className="text-muted-foreground mb-4">{error || "Tidak ada pertandingan yang aktif."}</div>
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
          <div className="text-sm text-gray-600 dark:text-gray-400">
             {isLoading && !matchDetailsLoaded ? <Skeleton className="h-4 w-32 inline-block" /> : (matchDetails?.place || `Gelanggang ${matchDetails?.matchNumber || 'A'}`)}
          </div>
        </div>

        {/* Pesilat Info Row */}
        <div className="flex justify-between items-center mb-4 px-1">
          <div className="text-left">
            <div className="text-sm font-semibold text-red-600">KONTINGEN {pesilatMerahInfo?.contingent || (isLoading && activeMatchId ? <Skeleton className="h-4 w-16 inline-block" /> : '-')}</div>
            <div className="text-lg font-bold text-red-600">{pesilatMerahInfo?.name || (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT MERAH')}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-blue-600">KONTINGEN {pesilatBiruInfo?.contingent || (isLoading && activeMatchId ? <Skeleton className="h-4 w-16 inline-block" /> : '-')}</div>
            <div className="text-lg font-bold text-blue-600">{pesilatBiruInfo?.name || (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT BIRU')}</div>
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
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.hukuman}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.binaan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresMerah.jatuhan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-bold py-2 px-1">{round === 1 ? 'I' : round === 2 ? 'II' : 'III'}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.jatuhan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.binaan}</TableCell>
                    <TableCell className="border border-gray-300 dark:border-gray-700 text-center font-medium py-2 px-1">{isLoading && !matchDetailsLoaded ? <Skeleton className="h-5 w-8 mx-auto"/> : scoresBiru.hukuman}</TableCell>
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
                <div className="text-xs text-gray-500 dark:text-gray-400">Babak {dewanTimerStatus.currentRound || '?'} - {dewanTimerStatus.matchStatus || 'Menunggu'}</div>
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
        {error && <div className="text-red-500 text-center mt-4 p-2 bg-red-100 border border-red-500 rounded-md">Error: {error}</div>}
         {/* Display Ketua Actions Log for debugging */}
        {/* <Card className="mt-6">
            <CardHeader><CardTitle>Log Tindakan Ketua (Debug)</CardTitle></CardHeader>
            <CardContent>
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(ketuaActionsLog, null, 2)}</pre>
            </CardContent>
        </Card> */}
      </main>
    </div>
  );
}

