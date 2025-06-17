
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Trash2, ShieldCheck, Trophy, Vote, Play, Pause, Info, Eye, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ScheduleTanding, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType, VerificationType, VerificationRequest, JuriVoteValue, JuriVotes, TimerStatus as DewanTimerType, TimerMatchStatus } from '@/lib/types';
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

  let hukuman = 0;
  let binaan = 0; 
  let jatuhan = 0;

  roundActions.forEach(action => {
    if (action.actionType === 'Teguran' || action.actionType === 'Peringatan') {
      hukuman += action.points; 
    } else if (action.actionType === 'Binaan') {
       binaan += 1; 
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

const formatFirestoreTimestamp = (timestamp: KetuaActionLogEntry['timestamp']): string => {
  if (!timestamp) return '-';
  if (timestamp instanceof Date) {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (timestamp instanceof Timestamp) { // Firestore Timestamp
    return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (typeof timestamp === 'object' && timestamp !== null && typeof timestamp.seconds === 'number') { // Plain object
    return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  console.warn("Unknown timestamp format in formatFirestoreTimestamp:", timestamp);
  return 'Invalid Date';
};


function KetuaPertandinganPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined); // ID dari peta gelanggang
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); // ID yang sedang diproses

  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [dewanTimerStatus, setDewanTimerStatus] = useState<DewanTimerType>(initialDewanTimerStatus);
  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isVerificationCreationDialogOpen, setIsVerificationCreationDialogOpen] = useState(false);
  const [selectedVerificationTypeForCreation, setSelectedVerificationTypeForCreation] = useState<VerificationType | ''>('');
  const [isCreatingVerification, setIsCreatingVerification] = useState(false);
  
  const [activeVerificationDetails, setActiveVerificationDetails] = useState<VerificationRequest | null>(null);
  const [isVoteResultModalOpen, setIsVoteResultModalOpen] = useState(false);
  const [ketuaSelectedDecision, setKetuaSelectedDecision] = useState<JuriVoteValue>(null);
  const [isConfirmingVerification, setIsConfirmingVerification] = useState(false);


  const resetAllMatchData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setDewanTimerStatus(initialDewanTimerStatus);
    setKetuaActionsLog([]);
    setActiveVerificationDetails(null);
    setIsVoteResultModalOpen(false);
    setKetuaSelectedDecision(null);
    setError(null);
  }, []);

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
      console.error(`[KetuaTanding] Error fetching active matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);


  useEffect(() => {
    if (configMatchId === undefined) {
      setIsLoading(true); 
      return; 
    }
    if (configMatchId !== activeMatchId) {
      resetAllMatchData();
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false); 
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading, resetAllMatchData]);


  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading) setIsLoading(false);
      setError(null); 
      setMatchDetails(null); setPesilatMerahInfo(null); setPesilatBiruInfo(null);
      setKetuaActionsLog([]); setDewanTimerStatus(initialDewanTimerStatus);
      setActiveVerificationDetails(null); setIsVoteResultModalOpen(false);
      setMatchDetailsLoaded(false);
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
    if (!matchDetailsLoaded) loadScheduleDetails();


    const unsubTimer = onSnapshot(doc(db, MATCHES_TANDING_COLLECTION, activeMatchId), (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists() && docSnap.data()?.timer_status) setDewanTimerStatus(docSnap.data()?.timer_status as DewanTimerType);
      else setDewanTimerStatus(initialDewanTimerStatus);
    }, (err) => { if (!mounted) return; console.error("Error fetching dewan timer:", err); setError("Gagal status timer dewan."); });
    unsubscribers.push(unsubTimer);

    const actionsQuery = query(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc"));
    const unsubActions = onSnapshot(actionsQuery, (snap) => {
      if (!mounted) return;
      const actions: KetuaActionLogEntry[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        actions.push({ 
            id: doc.id, 
            ...data,
            timestamp: data.timestamp 
        } as KetuaActionLogEntry)
    });
      setKetuaActionsLog(actions);
    }, (err) => { if (!mounted) return; console.error("Error fetching official actions:", err); setError("Gagal memuat log tindakan."); });
    unsubscribers.push(unsubActions);

    const verificationsQuery = query(
        collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION),
        orderBy('timestamp', 'desc'),
        limit(1)
    );
    const unsubActiveVerification = onSnapshot(verificationsQuery, (snapshot) => {
        if (!mounted) return;
        if (!snapshot.empty) {
            const latestVerification = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
            setActiveVerificationDetails(latestVerification);
            if (latestVerification.status === 'pending') {
                setIsVoteResultModalOpen(true);
            } else {
                setIsVoteResultModalOpen(false);
            }
        } else {
            setActiveVerificationDetails(null);
            setIsVoteResultModalOpen(false);
        }
    }, (err) => {
        if (!mounted) return;
        console.error("Error fetching active verification details:", err);
        setError("Gagal memuat detail verifikasi aktif.");
    });
    unsubscribers.push(unsubActiveVerification);


    if (matchDetailsLoaded && isLoading) setIsLoading(false);

    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeMatchId, isLoading, matchDetailsLoaded, resetAllMatchData]); 

  useEffect(() => { if (isLoading && (matchDetailsLoaded || activeMatchId === null)) setIsLoading(false); }, [isLoading, matchDetailsLoaded, activeMatchId]);

  const handleKetuaAction = async (pesilatColor: PesilatColorIdentity, actionTypeButtonPressed: KetuaActionType) => {
    if (!activeMatchId || activeMatchId.trim() === "") { alert("Tidak bisa menambah tindakan: ID pertandingan aktif tidak valid."); return; }
    if (isSubmittingAction) { alert("Sedang memproses tindakan sebelumnya, harap tunggu."); return; }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') { alert("Tidak bisa menambah tindakan: Pertandingan telah selesai."); return; }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) { alert(`Tidak bisa menambah tindakan: Babak tidak valid (${dewanTimerStatus.currentRound || 'tidak diketahui'}). Harap tunggu Dewan memulai babak.`); return; }

    setIsSubmittingAction(true);
    try {
      let pointsToLog = 0;
      let actionTypeToLog: KetuaActionType = actionTypeButtonPressed;
      let currentOriginalActionType: KetuaActionType | undefined = undefined; 

      if (actionTypeButtonPressed === 'Teguran') {
        actionTypeToLog = 'Teguran';
        pointsToLog = TEGURAN_POINTS; 
      } else if (actionTypeButtonPressed === 'Binaan') {
        const binaanAsliCount = ketuaActionsLog.filter(
          log => log.pesilatColor === pesilatColor &&
                 log.round === dewanTimerStatus.currentRound &&
                 log.actionType === 'Binaan' &&
                 typeof log.originalActionType === 'undefined' // Ensure it's a "pure" Binaan
        ).length;

        if (binaanAsliCount < 1) { 
          actionTypeToLog = 'Binaan';
          pointsToLog = 0; 
        } else { 
          actionTypeToLog = 'Teguran'; 
          pointsToLog = TEGURAN_POINTS;
          currentOriginalActionType = 'Binaan'; 
        }
      } else if (actionTypeButtonPressed === 'Peringatan') {
        const peringatanCount = countActionsInRound(ketuaActionsLog, pesilatColor, 'Peringatan', dewanTimerStatus.currentRound);
        pointsToLog = peringatanCount === 0 ? PERINGATAN_POINTS_FIRST_PRESS : PERINGATAN_POINTS_SECOND_PRESS;
        actionTypeToLog = 'Peringatan';
      } else if (actionTypeButtonPressed === 'Jatuhan') {
        pointsToLog = JATUHAN_POINTS;
        actionTypeToLog = 'Jatuhan';
      }

      const baseActionData: Omit<KetuaActionLogEntry, 'id' | 'timestamp'> & { timestamp: any } = {
        pesilatColor,
        actionType: actionTypeToLog,
        round: dewanTimerStatus.currentRound,
        timestamp: serverTimestamp(),
        points: pointsToLog,
      };
      

      const actionDataWithOptionalField = currentOriginalActionType !== undefined
        ? { ...baseActionData, originalActionType: currentOriginalActionType }
        : baseActionData;

      await addDoc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), actionDataWithOptionalField);
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
    if (!activeMatchId || activeMatchId.trim() === "") { alert("Tidak bisa menghapus tindakan: ID pertandingan aktif tidak valid."); return; }
    if (isSubmittingAction) { alert("Sedang memproses tindakan sebelumnya, harap tunggu."); return; }
    if (dewanTimerStatus.matchStatus === 'MatchFinished') { alert("Tidak bisa menghapus tindakan: Pertandingan telah selesai."); return; }
    if (!dewanTimerStatus.currentRound || ![1, 2, 3].includes(dewanTimerStatus.currentRound)) { alert("Tidak bisa menghapus tindakan: Babak tidak valid. Harap tunggu Dewan memulai babak."); return; }

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

  const handleCreateVerificationRequest = async () => {
    if (!selectedVerificationTypeForCreation) {
      alert("Silakan pilih jenis verifikasi terlebih dahulu.");
      return;
    }
    if (!activeMatchId) {
      alert("Tidak ada pertandingan aktif untuk memulai verifikasi.");
      return;
    }
    if (!dewanTimerStatus.currentRound || ![1,2,3].includes(dewanTimerStatus.currentRound) ) {
        alert("Babak saat ini tidak valid untuk memulai verifikasi.");
        return;
    }

    setIsCreatingVerification(true);
    try {
      const verificationData: Omit<VerificationRequest, 'id' | 'timestamp'> & {timestamp: any} = {
        matchId: activeMatchId,
        type: selectedVerificationTypeForCreation,
        status: 'pending',
        round: dewanTimerStatus.currentRound,
        timestamp: serverTimestamp(), 
        votes: { 'juri-1': null, 'juri-2': null, 'juri-3': null },
        result: null,
        requestingOfficial: 'ketua',
      };
      
      const batch = writeBatch(db);
      
      const verificationsRef = collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION);
      const qPending = query(verificationsRef, where("status", "==", "pending"));
      const pendingSnapshot = await getDocs(qPending);
      pendingSnapshot.forEach(docSnap => { 
        batch.update(docSnap.ref, { status: 'cancelled' }); 
      });
      
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
      const currentTimerStatusForPause: TimerMatchStatus = `PausedForVerificationRound${dewanTimerStatus.currentRound}`;
      batch.update(matchDocRef, {
          "timer_status.isTimerRunning": false,
          "timer_status.matchStatus": currentTimerStatusForPause
      });
      
      const newVerificationRef = doc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION));
      batch.set(newVerificationRef, verificationData);

      await batch.commit();

      alert(`Verifikasi untuk ${selectedVerificationTypeForCreation === 'jatuhan' ? 'Jatuhan' : 'Pelanggaran'} telah dimulai. Timer pertandingan dijeda.`);
      setIsVerificationCreationDialogOpen(false); 
      setSelectedVerificationTypeForCreation('');
    } catch (err) {
      console.error("Error creating verification:", err);
      setError(err instanceof Error ? `Gagal memulai verifikasi: ${err.message}` : "Gagal memulai verifikasi.");
      alert(err instanceof Error ? `Gagal memulai verifikasi: ${err.message}` : "Gagal memulai verifikasi.");
    } finally {
      setIsCreatingVerification(false);
    }
  };

  const handleConfirmVerificationDecision = async () => {
    if (!activeVerificationDetails || !ketuaSelectedDecision || !activeMatchId) {
      alert("Tidak ada verifikasi aktif atau keputusan belum dipilih.");
      return;
    }
    setIsConfirmingVerification(true);
    try {
      const verificationDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION, activeVerificationDetails.id);
      
      const batch = writeBatch(db);
      batch.update(verificationDocRef, {
        status: 'completed',
        result: ketuaSelectedDecision,
      });

      let pointsAwardedMessage = "";
      if (activeVerificationDetails.type === 'jatuhan' && (ketuaSelectedDecision === 'merah' || ketuaSelectedDecision === 'biru')) {
        const actionData: Omit<KetuaActionLogEntry, 'id' | 'timestamp'> & { timestamp: any } = {
            pesilatColor: ketuaSelectedDecision as PesilatColorIdentity,
            actionType: 'Jatuhan',
            round: activeVerificationDetails.round,
            timestamp: serverTimestamp(),
            points: JATUHAN_POINTS,
        };
        const newActionRef = doc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION));
        batch.set(newActionRef, actionData);
        pointsAwardedMessage = ` Poin +${JATUHAN_POINTS} diberikan untuk Jatuhan.`;
      }
      
      await batch.commit();

      alert(`Verifikasi ${activeVerificationDetails.type} dikonfirmasi dengan hasil: ${ketuaSelectedDecision}.${pointsAwardedMessage}`);
      setKetuaSelectedDecision(null);
      // The useEffect listening to verifications will auto-close the modal when status changes from 'pending'
    } catch (err) {
      console.error("Error confirming verification:", err);
      setError(err instanceof Error ? `Gagal mengkonfirmasi verifikasi: ${err.message}` : "Gagal mengkonfirmasi verifikasi.");
    } finally {
      setIsConfirmingVerification(false);
    }
  };

  const handleCancelCurrentVerification = async () => {
    if (!activeVerificationDetails || !activeMatchId) {
      alert("Tidak ada verifikasi aktif untuk dibatalkan.");
      return;
    }
    setIsConfirmingVerification(true); 
    try {
      const verificationDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION, activeVerificationDetails.id);
      await updateDoc(verificationDocRef, { status: 'cancelled' });
      alert(`Verifikasi ${activeVerificationDetails.type} telah dibatalkan.`);
      setKetuaSelectedDecision(null);
      // The useEffect listening to verifications will auto-close the modal
    } catch (err) {
       console.error("Error cancelling verification:", err);
       setError(err instanceof Error ? `Gagal membatalkan verifikasi: ${err.message}` : "Gagal membatalkan verifikasi.");
    } finally {
      setIsConfirmingVerification(false);
    }
  };


  const handleTentukanPemenang = () => alert("Fungsi Tentukan Pemenang belum diimplementasikan.");

  const isActionButtonDisabled = isSubmittingAction || dewanTimerStatus.matchStatus === 'MatchFinished' || isLoading || !dewanTimerStatus.isTimerRunning;

  const getJuriVoteBoxClass = (vote: JuriVoteValue) => {
    if (vote === 'merah') return "bg-red-500";
    if (vote === 'biru') return "bg-blue-500";
    if (vote === 'invalid') return "bg-yellow-400";
    return "bg-white dark:bg-gray-700"; 
  };

  if (!gelanggangName && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
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
  
  if (isLoading && (!activeMatchId || !matchDetailsLoaded)) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">
            {configMatchId === undefined ? `Memuat konfigurasi untuk Gelanggang: ${gelanggangName || '...'}` : 
             !activeMatchId && configMatchId === null ? `Tidak ada jadwal aktif untuk Gelanggang: ${gelanggangName || '...'}` :
             `Memuat data pertandingan untuk Gelanggang: ${gelanggangName || '...'}`}
          </p>
          {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
        </main>
      </div>
    );
  }

  if (!activeMatchId && !isLoading && configMatchId === null) {
    return (
      <div className="flex flex-col min-h-screen"><Header />
        <main className="flex-1 container mx-auto px-4 py-8 text-center">
           <h1 className="text-2xl font-bold text-primary mb-2">Ketua Pertandingan (Gel: {gelanggangName || 'N/A'})</h1>
           <div className="text-muted-foreground mb-4">{error || `Tidak ada pertandingan yang aktif untuk Gelanggang: ${gelanggangName}.`}</div>
           <Button variant="outline" asChild>
            <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login
            </Link>
           </Button>
        </main>
      </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-black">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Ketua Pertandingan (Gel: {gelanggangName || 'N/A'})</h1>
          <div className="text-sm text-gray-600 dark:text-gray-400">
             {isLoading && !matchDetailsLoaded ? <Skeleton className="h-4 w-32 inline-block" /> : (matchDetails?.place || `Partai No. ${matchDetails?.matchNumber || 'N/A'}`)}
             {matchDetails && matchDetailsLoaded && ` - ${matchDetails.class} (${matchDetails.round})`}
          </div>
        </div>

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

        <div className="mb-6 overflow-x-auto">
          <Table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
            <TableHeader>
              <TableRow className="bg-gray-100 dark:bg-gray-800">
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Hukuman </TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Binaan </TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-red-600 py-2 px-1 text-xs sm:text-sm">Jatuhan </TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center py-2 px-1 text-xs sm:text-sm">Babak</TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Jatuhan </TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Binaan </TableHead>
                <TableHead className="border border-gray-300 dark:border-gray-700 text-center text-blue-600 py-2 px-1 text-xs sm:text-sm">Hukuman </TableHead>
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
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Log Tindakan Ketua</CardTitle>
          </CardHeader>
          <CardContent>
            {ketuaActionsLog.length === 0 ? (
              <p className="text-muted-foreground">Belum ada tindakan tercatat.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Waktu</TableHead>
                      <TableHead>Babak</TableHead>
                      <TableHead>Pesilat</TableHead>
                      <TableHead>Tindakan</TableHead>
                      <TableHead className="text-right">Poin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ketuaActionsLog.map((action) => (
                      <TableRow key={action.id}>
                        <TableCell>{formatFirestoreTimestamp(action.timestamp)}</TableCell>
                        <TableCell>{action.round}</TableCell>
                        <TableCell>
                          <Badge variant={action.pesilatColor === 'merah' ? 'destructive' : 'default'} className={action.pesilatColor === 'biru' ? 'bg-blue-500 text-white' : ''}>
                            {action.pesilatColor === 'merah' ? pesilatMerahInfo?.name || 'Merah' : pesilatBiruInfo?.name || 'Biru'}
                          </Badge>
                        </TableCell>
                        <TableCell>{action.actionType}{action.originalActionType ? ` (dari ${action.originalActionType})` : ''}</TableCell>
                        <TableCell className="text-right">{action.points}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>


        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-start">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleKetuaAction('merah', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button>
              <Button onClick={() => handleKetuaAction('merah', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button>
            </div>
            <Button onClick={() => handleDeleteLastAction('merah')} className="w-full py-4 text-sm sm:text-base bg-red-800 hover:bg-red-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'merah' && a.round === dewanTimerStatus.currentRound).length === 0}>
              <Trash2 className="mr-2 h-4 w-4" /> Hapus
            </Button>
          </div>

          <div className="flex flex-col items-center justify-center space-y-3 md:pt-8 order-first md:order-none">
             <div className={cn("text-center p-2 rounded-md w-full", 
                dewanTimerStatus.matchStatus.startsWith('PausedForVerification') ? "bg-orange-100 dark:bg-orange-900" :
                dewanTimerStatus.isTimerRunning ? "bg-green-100 dark:bg-green-900" : 
                "bg-gray-100 dark:bg-gray-700"
              )}>
                <div className="text-2xl font-mono font-bold text-gray-800 dark:text-gray-100">
                    {dewanTimerStatus.isTimerRunning ? formatTime(dewanTimerStatus.timerSeconds) : "JEDA"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    Babak {dewanTimerStatus.currentRound || '?'} - {
                        dewanTimerStatus.matchStatus.startsWith('PausedForVerification') ? `Verifikasi Babak ${dewanTimerStatus.currentRound}` :
                        dewanTimerStatus.matchStatus || 'Menunggu'
                    }
                </div>
            </div>

            <Dialog open={isVerificationCreationDialogOpen} onOpenChange={setIsVerificationCreationDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="w-full md:w-auto bg-yellow-500 hover:bg-yellow-600 text-black py-3 text-sm sm:text-base"
                  disabled={isLoading || dewanTimerStatus.matchStatus === 'MatchFinished' || isCreatingVerification || (activeVerificationDetails !== null && activeVerificationDetails.status === 'pending')}
                  onClick={() => setSelectedVerificationTypeForCreation('')}
                >
                  {isCreatingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Vote className="mr-2 h-4 w-4"/>}
                  Mulai Verifikasi
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogTitle className="sr-only">Mulai Verifikasi Juri</DialogTitle>
                <DialogHeader>
                  <DialogTitle>Mulai Verifikasi Juri</DialogTitle>
                  <DialogDescription>
                    Pilih jenis verifikasi. Ini akan menjeda timer dan mengirim permintaan ke juri. Verifikasi sebelumnya yang masih 'pending' akan dibatalkan.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <RadioGroup value={selectedVerificationTypeForCreation} onValueChange={(value) => setSelectedVerificationTypeForCreation(value as VerificationType)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="jatuhan" id="v-jatuhan-create" />
                      <Label htmlFor="v-jatuhan-create">Verifikasi Jatuhan</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pelanggaran" id="v-pelanggaran-create" />
                      <Label htmlFor="v-pelanggaran-create">Verifikasi Pelanggaran</Label>
                    </div>
                  </RadioGroup>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isCreatingVerification}>
                      Tutup
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={handleCreateVerificationRequest} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isCreatingVerification || !selectedVerificationTypeForCreation}>
                    {isCreatingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Buat & Jeda Timer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <Button onClick={handleTentukanPemenang} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white py-3 text-sm sm:text-base" disabled={isLoading || dewanTimerStatus.matchStatus !== 'MatchFinished'}><Trophy className="mr-2 h-4 w-4"/>Tentukan Pemenang</Button>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleKetuaAction('biru', 'Jatuhan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Jatuhan</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Teguran')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Teguran</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Binaan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Binaan</Button>
              <Button onClick={() => handleKetuaAction('biru', 'Peringatan')} className="w-full py-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white" disabled={isActionButtonDisabled}>Peringatan</Button>
            </div>
            <Button onClick={() => handleDeleteLastAction('biru')} className="w-full py-4 text-sm sm:text-base bg-blue-800 hover:bg-blue-900 text-white" disabled={isActionButtonDisabled || ketuaActionsLog.filter(a => a.pesilatColor === 'biru' && a.round === dewanTimerStatus.currentRound).length === 0}>
              <Trash2 className="mr-2 h-4 w-4"/> Hapus
            </Button>
          </div>
        </div>
        {error && <div className="text-red-500 text-center mt-4 p-2 bg-red-100 border border-red-500 rounded-md">Error: {error}</div>}

        <Dialog 
          open={isVoteResultModalOpen} 
          onOpenChange={(isOpenFromRadix) => {
            if (!isOpenFromRadix) {
                // Allow closing if verification is not strictly pending anymore,
                // or if the modal is explicitly closed by Ketua actions later.
                if (!activeVerificationDetails || activeVerificationDetails.status !== 'pending') {
                    setIsVoteResultModalOpen(false);
                }
                // If still pending, onPointerDownOutside/onEscapeKeyDown should prevent external close.
            }
            // No action needed if isOpenFromRadix is true, as isVoteResultModalOpen controls the open prop.
          }}
        >
          <DialogContent 
            className="sm:max-w-lg" 
            onPointerDownOutside={(e) => { if(activeVerificationDetails?.status === 'pending') e.preventDefault(); }} 
            onEscapeKeyDown={(e) => { if(activeVerificationDetails?.status === 'pending') e.preventDefault(); }}
          >
            <DialogTitle className="sr-only">Hasil Verifikasi Juri</DialogTitle>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold font-headline text-center">Hasil Verifikasi Juri</DialogTitle>
              {activeVerificationDetails && (
                <DialogDescription className="text-center text-lg">
                  {activeVerificationDetails.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'} (Babak {activeVerificationDetails.round})
                </DialogDescription>
              )}
            </DialogHeader>
            
            <div className="my-4 space-y-3">
              <h3 className="font-semibold text-center text-lg">Vote Juri:</h3>
              <div className="grid grid-cols-3 gap-3 items-center justify-items-center">
                {(['juri-1', 'juri-2', 'juri-3'] as const).map((juriKey, index) => (
                  <div key={juriKey} className="flex flex-col items-center space-y-1">
                    <div className={cn("w-16 h-16 rounded-md border-2 border-gray-400 flex items-center justify-center", getJuriVoteBoxClass(activeVerificationDetails?.votes[juriKey] || null))}>
                       
                    </div>
                    <p className="text-xs font-medium">Juri {index + 1}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="my-6 space-y-3">
                <p className="text-center font-semibold text-lg">Keputusan Ketua Pertandingan:</p>
                <div className="flex justify-around gap-2">
                    <Button 
                        onClick={() => setKetuaSelectedDecision('merah')} 
                        className={cn("flex-1 text-white py-3 text-base", ketuaSelectedDecision === 'merah' ? "ring-4 ring-offset-2 ring-red-700 bg-red-700" : "bg-red-500 hover:bg-red-600")}
                        disabled={isConfirmingVerification}
                    >
                        SUDUT MERAH
                    </Button>
                    <Button 
                        onClick={() => setKetuaSelectedDecision('biru')} 
                        className={cn("flex-1 text-white py-3 text-base", ketuaSelectedDecision === 'biru' ? "ring-4 ring-offset-2 ring-blue-700 bg-blue-700" : "bg-blue-500 hover:bg-blue-600")}
                        disabled={isConfirmingVerification}
                    >
                        SUDUT BIRU
                    </Button>
                    <Button 
                        onClick={() => setKetuaSelectedDecision('invalid')} 
                        className={cn("flex-1 text-black py-3 text-base", ketuaSelectedDecision === 'invalid' ? "ring-4 ring-offset-2 ring-yellow-600 bg-yellow-600" : "bg-yellow-400 hover:bg-yellow-500")}
                        disabled={isConfirmingVerification}
                    >
                        INVALID
                    </Button>
                </div>
            </div>

            <DialogFooter className="sm:justify-between mt-6">
              <Button type="button" variant="outline" onClick={handleCancelCurrentVerification} disabled={isConfirmingVerification}>
                {isConfirmingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Batalkan Verifikasi Ini
              </Button>
              <Button 
                type="button" 
                onClick={handleConfirmVerificationDecision} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!ketuaSelectedDecision || isConfirmingVerification}
              >
                {isConfirmingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Konfirmasi Keputusan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="mt-8 text-center">
            <Button variant="outline" asChild>
                <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link>
            </Button>
        </div>
      </main>
    </div>
  );
}

export default function KetuaPertandinganTandingPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen"> <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat halaman Ketua Pertandingan...</p>
        </main>
      </div>
    }>
      <PageWithSearchParams />
    </Suspense>
  );
}

function PageWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <KetuaPertandinganPageComponent gelanggangName={gelanggangName} />;
}

