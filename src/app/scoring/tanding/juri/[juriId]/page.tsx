
"use client";

import { useState, useEffect, useCallback, Suspense, use } from 'react'; // Added 'use'
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ArrowLeft, MinusSquare, Target, Shield, Lock, Unlock, Loader2, Vote, AlertTriangle } from 'lucide-react';
import type { ScheduleTanding, VerificationRequest, JuriVoteValue, JuriMatchData as LibJuriMatchData, RoundScores as LibRoundScoresType, ScoreEntry as LibScoreEntryType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, Timestamp, setDoc, updateDoc, collection, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang'; 
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const JURI_VISUAL_GRACE_PERIOD_MS = 2000;

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface ScoreEntry extends LibScoreEntryType {}
interface RoundScores extends LibRoundScoresType {}
interface JuriMatchData extends LibJuriMatchData {}

interface TimerStatusFromDewan {
  currentRound: 1 | 2 | 3;
  isTimerRunning: boolean;
  matchStatus: string;
}

const initialRoundScores = (): RoundScores => ({
  round1: [],
  round2: [],
  round3: [],
});

const initialJuriMatchData = (): JuriMatchData => ({
  merah: initialRoundScores(),
  biru: initialRoundScores(),
  lastUpdated: null,
});

function JuriPageComponent({ juriId, gelanggangName }: { juriId: string; gelanggangName: string | null }) {
  const juriDisplayName = `Juri ${juriId?.split('-')[1] || 'Tidak Dikenal'}`;

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined); 
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); 

  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());

  const [dewanControlledRound, setDewanControlledRound] = useState<1 | 2 | 3>(1);
  const [isTimerRunningByDewan, setIsTimerRunningByDewan] = useState<boolean>(false);
  const [dewanMatchStatus, setDewanMatchStatus] = useState<string>('Pending');
  const [confirmedUnstruckKeysFromDewan, setConfirmedUnstruckKeysFromDewan] = useState<Set<string>>(new Set());
  const [confirmedStruckKeysFromDewan, setConfirmedStruckKeysFromDewan] = useState<Set<string>>(new Set());

  const [activeVerification, setActiveVerification] = useState<VerificationRequest | null>(null);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetAllMatchData = useCallback(() => {
    setPesilatMerah(null);
    setPesilatBiru(null);
    setScoresData(initialJuriMatchData());
    setDewanControlledRound(1);
    setIsTimerRunningByDewan(false);
    setDewanMatchStatus('Pending');
    setConfirmedUnstruckKeysFromDewan(new Set());
    setConfirmedStruckKeysFromDewan(new Set());
    setActiveVerification(null);
    setIsVerificationModalOpen(false);
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
      console.error(`[Juri ${juriId}] Error fetching active matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName, juriId]);

  useEffect(() => {
    if (configMatchId === undefined) {
      return;
    }
    if (configMatchId !== activeMatchId) {
      resetAllMatchData();
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false); 
    }
  }, [configMatchId, activeMatchId, resetAllMatchData]);


  useEffect(() => {
    let mounted = true;
    
    if (!activeMatchId) {
      if (!gelanggangName) { 
        setIsLoading(false);
      } else if (configMatchId === null) { 
        setIsLoading(false);
      } else if (configMatchId === undefined) { 
        setIsLoading(true);
      }
      setMatchDetailsLoaded(false); 
      return;
    }

    setIsLoading(true);
    setError(null); 

    let unsubMatchDoc: (() => void) | null = null;
    let unsubJuriScores: (() => void) | null = null;
    let unsubVerifications: (() => void) | null = null;

    let detailsFetched = false;
    let matchListenerReady = false;
    let juriListenerReady = false;
    let verificationListenerReady = false;

    const tryStopLoading = () => {
      if (mounted && detailsFetched && matchListenerReady && juriListenerReady && verificationListenerReady) {
        setIsLoading(false);
      }
    };

    const loadScheduleDetails = async () => {
      if (!mounted || !activeMatchId) { detailsFetched = true; tryStopLoading(); return; }
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId);
        const scheduleDoc = await getDoc(scheduleDocRef);
        if (!mounted) return;
        if (scheduleDoc.exists()) {
          const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
          setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
          setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
          detailsFetched = true;
        } else {
          setError(`Detail jadwal untuk ID ${activeMatchId} tidak ditemukan.`);
          setMatchDetailsLoaded(false);
          detailsFetched = true;
        }
      } catch (err) {
        if(mounted) setError("Gagal memuat detail jadwal.");
        setMatchDetailsLoaded(false);
        detailsFetched = true;
      }
      tryStopLoading();
    };
    loadScheduleDetails();

    const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
    unsubMatchDoc = onSnapshot(matchDocRef, (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data?.timer_status) {
          const dewanStatus = data.timer_status as TimerStatusFromDewan;
          setDewanControlledRound(dewanStatus.currentRound || 1);
          setIsTimerRunningByDewan(dewanStatus.isTimerRunning || false);
          setDewanMatchStatus(dewanStatus.matchStatus || 'Pending');
        } else {
          setDewanControlledRound(1); setIsTimerRunningByDewan(false); setDewanMatchStatus('Pending');
        }
        setConfirmedUnstruckKeysFromDewan(new Set(data?.confirmed_unstruck_keys_log as string[] || []));
        setConfirmedStruckKeysFromDewan(new Set(data?.confirmed_struck_keys_log as string[] || []));
      } else {
        setDewanControlledRound(1); setIsTimerRunningByDewan(false); setDewanMatchStatus('Pending');
        setConfirmedUnstruckKeysFromDewan(new Set()); setConfirmedStruckKeysFromDewan(new Set());
      }
      if (!matchListenerReady) matchListenerReady = true;
      tryStopLoading();
    }, (error) => {
      if (!mounted) return; setError("Gagal mendapatkan status dari dewan.");
      if (!matchListenerReady) matchListenerReady = true; tryStopLoading();
    });

    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    unsubJuriScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
      if (!mounted) return;
      if (scoreDoc.exists()) {
        const data = scoreDoc.data() as JuriMatchData;
        setScoresData({
          merah: { round1: data.merah?.round1 || [], round2: data.merah?.round2 || [], round3: data.merah?.round3 || [] },
          biru: { round1: data.biru?.round1 || [], round2: data.biru?.round2 || [], round3: data.biru?.round3 || [] },
          lastUpdated: data.lastUpdated,
        });
      } else { setScoresData(initialJuriMatchData()); }
      if (!juriListenerReady) juriListenerReady = true;
      tryStopLoading();
    }, (error) => {
      if (!mounted) return; setError("Gagal mendapatkan data skor juri.");
      if (!juriListenerReady) juriListenerReady = true; tryStopLoading();
    });

    const verificationsQuery = query(
      collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, VERIFICATIONS_SUBCOLLECTION),
      where('status', '==', 'pending'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    unsubVerifications = onSnapshot(verificationsQuery, (snapshot) => {
      if (!mounted) return;
      if (!snapshot.empty) {
        const verificationData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
        if (verificationData.votes[juriId as keyof VerificationRequest['votes']] === null) {
          setActiveVerification(verificationData);
          setIsVerificationModalOpen(true);
        } else {
           if (activeVerification && activeVerification.id === verificationData.id) {
           } else {
             setActiveVerification(null);
             setIsVerificationModalOpen(false);
           }
        }
      } else {
        setActiveVerification(null);
        setIsVerificationModalOpen(false);
      }
      if (!verificationListenerReady) verificationListenerReady = true;
      tryStopLoading();
    }, (error) => {
      if (!mounted) return;
      console.error(`[Juri ${juriId}] Error listening to verifications:`, error);
      setError("Gagal mendapatkan status verifikasi.");
      if (!verificationListenerReady) verificationListenerReady = true; tryStopLoading();
    });


    return () => {
      mounted = false;
      if (unsubMatchDoc) unsubMatchDoc();
      if (unsubJuriScores) unsubJuriScores();
      if (unsubVerifications) unsubVerifications();
    };
  }, [activeMatchId, juriId, resetAllMatchData, gelanggangName]); 

  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      const dataToSave: JuriMatchData = {
        ...newScoresData,
        lastUpdated: serverTimestamp() as Timestamp, 
      };
      await setDoc(juriScoreDocRef, dataToSave, { merge: true });
    } catch (error) {
      console.error(`[Juri ${juriId}] Error saving scores:`, error);
      setError("Gagal menyimpan skor ke server.");
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', pointsValue: 1 | 2) => {
    if (isInputDisabled) return;
    setScoresData(prevScores => {
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const newEntry: ScoreEntry = { 
        points: pointsValue, 
        timestamp: Timestamp.now(),
      };
      const updatedColorScoresForRound = [...(prevScores[pesilatColor]?.[roundKey] || []), newEntry];
      const newScoresData: JuriMatchData = {
        ...prevScores,
        [pesilatColor]: { ...prevScores[pesilatColor], [roundKey]: updatedColorScoresForRound },
      };
      saveScoresToFirestore(newScoresData); 
      return newScoresData;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (isInputDisabled) return;
    setScoresData(prevScores => {
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const currentRoundArray = prevScores[pesilatColor]?.[roundKey] || [];
      if (currentRoundArray.length === 0) return prevScores;
      const newRoundArray = currentRoundArray.slice(0, -1);
      const updatedColorScores = { ...prevScores[pesilatColor], [roundKey]: newRoundArray };
      const newScoresData: JuriMatchData = { ...prevScores, [pesilatColor]: updatedColorScores };
      saveScoresToFirestore(newScoresData);
      return newScoresData;
    });
  };
  
  const handleJuriVote = async (vote: JuriVoteValue) => {
    if (!activeVerification || !juriId || isSubmittingVote) return;
    setIsSubmittingVote(true);
    try {
      const verificationDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeVerification.matchId, VERIFICATIONS_SUBCOLLECTION, activeVerification.id);
      await updateDoc(verificationDocRef, {
        [`votes.${juriId}`]: vote,
      });
      setIsVerificationModalOpen(false);
      setActiveVerification(null); 
    } catch (err) {
      console.error(`[Juri ${juriId}] Error submitting vote:`, err);
      setError(err instanceof Error ? `Gagal mengirim vote: ${err.message}` : "Gagal mengirim vote.");
      alert(err instanceof Error ? `Gagal mengirim vote: ${err.message}` : "Gagal mengirim vote.");
    } finally {
      setIsSubmittingVote(false);
    }
  };

  const renderRoundScoresDisplay = (roundData: ScoreEntry[] | undefined) => {
    if (!roundData || roundData.length === 0) return '-';
    return roundData.map((entry, index) => {
      let entryTimestampMillis: number | null = null;
      if (entry.timestamp) {
        if (entry.timestamp instanceof Timestamp) {
          entryTimestampMillis = entry.timestamp.toMillis();
        } else if (entry.timestamp instanceof Date) {
          entryTimestampMillis = entry.timestamp.getTime();
        } else if (typeof entry.timestamp === 'object' && entry.timestamp !== null && typeof (entry.timestamp as {seconds: number}).seconds === 'number') {
          entryTimestampMillis = (entry.timestamp as {seconds: number}).seconds * 1000 + ((entry.timestamp as {nanoseconds: number}).nanoseconds || 0) / 1000000;
        }
      }

      if (entryTimestampMillis === null) {
        return <span key={`${juriId}-roundEntry-${index}-pending`} className="mr-1.5 text-yellow-500 italic">Baru!</span>;
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isPermanentlyStruckByDewan = confirmedStruckKeysFromDewan.has(entryKey);
      
      const shouldDisplayAsStruck = isPermanentlyStruckByDewan; 

      return (
        <span key={`${juriId}-roundEntry-${index}-${entryTimestampMillis}`} className={cn(shouldDisplayAsStruck && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ' '}{curr}</>, <></>);
  };

  const isInputDisabled = isLoading || !activeMatchId || !matchDetailsLoaded || dewanMatchStatus === 'MatchFinished' || !isTimerRunningByDewan || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused') || dewanMatchStatus === 'Pending';

  const inputDisabledReason = () => {
    if (configMatchId === undefined && isLoading && !gelanggangName) return "Memuat konfigurasi global...";
    if (!gelanggangName) return "Gelanggang tidak ditemukan di URL.";
    if (isLoading && (activeMatchId || (configMatchId === undefined && gelanggangName))) return `Sinkronisasi untuk Gelanggang: ${gelanggangName || '...'} (Babak Dewan: ${dewanControlledRound})`;
    if (!activeMatchId && !isLoading && configMatchId === null) return `Tidak ada pertandingan aktif untuk Gelanggang: ${gelanggangName}.`;
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (error) return `Error: ${error}`;
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound') && parseInt(dewanMatchStatus.replace('FinishedRound','')) === dewanControlledRound) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused') && isTimerRunningByDewan === false) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (activeMatchId && matchDetailsLoaded && dewanMatchStatus === `OngoingRound${dewanControlledRound}` && !isTimerRunningByDewan) return `Timer Babak ${dewanControlledRound} belum berjalan dari Dewan.`;
    if (activeMatchId && matchDetailsLoaded && dewanMatchStatus === 'Pending') return `Babak ${dewanControlledRound} Menunggu Dewan memulai.`
    if (activeMatchId && matchDetailsLoaded && !isTimerRunningByDewan && dewanMatchStatus !== 'Pending' && dewanMatchStatus !== 'MatchFinished' && !dewanMatchStatus.startsWith('FinishedRound')) return "Input nilai ditutup (timer tidak berjalan).";
    return "";
  };

  const pageDescription = () => {
    if (configMatchId === undefined && isLoading && !gelanggangName) return "Memuat konfigurasi...";
    if (!gelanggangName) return "Gelanggang tidak valid.";
    if (isLoading && (activeMatchId || (configMatchId === undefined && gelanggangName))) return `Memuat data untuk Gelanggang: ${gelanggangName}... (Babak Dewan: ${dewanControlledRound})`;
    if (!activeMatchId && !isLoading && configMatchId === null) return `Tidak ada pertandingan aktif untuk Gelanggang: ${gelanggangName}.`;
    if (matchDetailsLoaded && activeMatchId) return `${pesilatMerah?.name || 'Merah'} vs ${pesilatBiru?.name || 'Biru'} - Babak Aktif: ${dewanControlledRound}`;
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (error) return `Error: ${error}`;
    return `Menunggu info pertandingan untuk Gelanggang: ${gelanggangName || '...'} (Babak Dewan: ${dewanControlledRound})`;
  };

  const getStatusIcon = () => {
    if (!gelanggangName) return <AlertTriangle className="h-5 w-5 text-red-500" />;
    if (error) return <AlertTriangle className="h-5 w-5 text-red-500" />;
    if (isLoading || (activeMatchId && !matchDetailsLoaded)) return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
    if (isInputDisabled) return <Lock className="h-5 w-5 text-red-500" />;
    if (!isInputDisabled && activeMatchId && matchDetailsLoaded) return <Unlock className="h-5 w-5 text-green-500" />;
    return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
  };

  const getStatusText = () => {
    const reason = inputDisabledReason();
    if (reason) return reason;
    if (activeMatchId && matchDetailsLoaded && !isInputDisabled) return "Input Nilai Terbuka";
    if (isLoading || (activeMatchId && !matchDetailsLoaded)) return `Memuat data untuk Gelanggang ${gelanggangName || '...'} (Babak Dewan: ${dewanControlledRound})`;
    return `Memeriksa status untuk Gelanggang: ${gelanggangName || '...'} (Babak Dewan: ${dewanControlledRound})`;
  };

  if (!gelanggangName && !isLoading) {
    return (
        <div className="flex flex-col min-h-screen"> <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman Juri tidak dapat memuat data pertandingan tanpa nama gelanggang.</p>
                <Button asChild className="mt-6">
                    <Link href={`/login?redirect=/scoring/tanding/juri/${juriId}`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title={`${juriDisplayName} - Scoring Tanding (Gel: ${gelanggangName || 'N/A'})`}
          description={pageDescription()}
        >
          <div className="flex items-center gap-2">
             {getStatusIcon()}
            <span className={cn("text-sm font-medium",
                error ? 'text-red-600 dark:text-red-400' :
                (isLoading || (activeMatchId && !matchDetailsLoaded)) ? 'text-yellow-600 dark:text-yellow-400' :
                isInputDisabled ? 'text-red-500' :
                'text-green-500'
            )}>
                {getStatusText()}
            </span>
            <Button variant="outline" asChild>
              <Link href={`/login?redirect=/scoring/tanding/juri/${juriId}&gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
          </div>
        </PageTitle>

        <Card className="mb-6 shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-between items-center text-sm mb-4">
              <div className="text-red-600">
                <div className="font-semibold text-lg">{ (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.name || 'PESILAT MERAH') : ((isLoading && activeMatchId) ? <Skeleton className="h-6 w-32" /> : 'PESILAT MERAH')}</div>
                <div>Kontingen: { (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.contingent || '-') : ((isLoading && activeMatchId) ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                Babak: <span className="text-primary">{dewanControlledRound}</span>
              </div>
              <div className="text-blue-600 text-right">
                <div className="font-semibold text-lg">{(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.name || 'PESILAT BIRU') : ((isLoading && activeMatchId) ? <Skeleton className="h-6 w-32" /> : 'PESILAT BIRU')}</div>
                <div>Kontingen: {(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.contingent || '-') : ((isLoading && activeMatchId) ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 text-center font-semibold">
                <div className="bg-red-500 text-white p-2">MERAH</div>
                <div className="bg-yellow-400 text-black p-2">BABAK</div>
                <div className="bg-blue-500 text-white p-2">BIRU</div>
              </div>
              {[1, 2, 3].map((round) => (
                <div key={round} className={`grid grid-cols-3 text-center border-t ${dewanControlledRound === round ? 'bg-yellow-100 dark:bg-yellow-700/30 font-semibold' : 'bg-white dark:bg-gray-800'}`}>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center border-r">
                    {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : (((isLoading && activeMatchId) || (!activeMatchId && configMatchId === undefined)) ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                  <div className={`p-3 font-medium flex items-center justify-center border-r`}>
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </div>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : (((isLoading && activeMatchId) || (!activeMatchId && configMatchId === undefined)) ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:gap-8">
          <div className="space-y-3">
            <Button onClick={() => handleScore('merah', 1)} className="w-full bg-red-500 hover:bg-red-600 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled} aria-label="Pukulan Merah">
              <Target className="mr-2 h-5 w-5" /> Pukulan
            </Button>
            <Button onClick={() => handleScore('merah', 2)} className="w-full bg-red-500 hover:bg-red-600 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled} aria-label="Tendangan Merah">
              <Shield className="mr-2 h-5 w-5" /> Tendangan
            </Button>
            <Button onClick={() => handleDeleteScore('merah')} className="w-full bg-red-700 hover:bg-red-800 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled || (scoresData.merah[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)} aria-label="Hapus Skor Terakhir Merah">
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>

          <div className="space-y-3">
            <Button onClick={() => handleScore('biru', 1)} className="w-full bg-blue-500 hover:bg-blue-600 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled} aria-label="Pukulan Biru">
              <Target className="mr-2 h-5 w-5" /> Pukulan
            </Button>
            <Button onClick={() => handleScore('biru', 2)} className="w-full bg-blue-500 hover:bg-blue-600 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled} aria-label="Tendangan Biru">
              <Shield className="mr-2 h-5 w-5" /> Tendangan
            </Button>
            <Button onClick={() => handleDeleteScore('biru')} className="w-full bg-blue-700 hover:bg-blue-800 text-white text-base py-4 h-auto disabled:opacity-70" disabled={isInputDisabled || (scoresData.biru[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)} aria-label="Hapus Skor Terakhir Biru">
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>
        </div>
        {error && (<Card className="mt-6 bg-destructive/10 border-destructive"><CardContent className="p-4 text-center text-destructive-foreground"><p className="font-semibold">Terjadi Kesalahan:</p><p>{error}</p></CardContent></Card>)}

        <Dialog open={isVerificationModalOpen && activeVerification !== null && activeVerification.votes[juriId as keyof VerificationRequest['votes']] === null} onOpenChange={(open) => { if(!open && activeVerification) { setIsVerificationModalOpen(false); } else { setIsVerificationModalOpen(open); }}}>
          <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogTitle className="sr-only">Verifikasi Keputusan Juri</DialogTitle>
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl font-bold font-headline">Verifikasi Juri</DialogTitle>
              {activeVerification && (
                <DialogDescription className="text-xl font-semibold mt-2">
                  {activeVerification.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                </DialogDescription>
              )}
              <p className="text-sm text-muted-foreground">Silahkan Pilih Dari 3 Pilihan</p>
            </DialogHeader>
            <div className="flex justify-around items-center py-6 space-x-2">
              <Button
                onClick={() => handleJuriVote('biru')}
                className="flex-1 py-6 text-base h-auto bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isSubmittingVote}
              >
                {isSubmittingVote ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sudut Biru'}
              </Button>
              <Button
                onClick={() => handleJuriVote('merah')}
                className="flex-1 py-6 text-base h-auto bg-red-600 hover:bg-red-700 text-white"
                disabled={isSubmittingVote}
              >
                {isSubmittingVote ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sudut Merah'}
              </Button>
              <Button
                onClick={() => handleJuriVote('invalid')}
                className="flex-1 py-6 text-base h-auto bg-yellow-500 hover:bg-yellow-600 text-black"
                disabled={isSubmittingVote}
              >
                {isSubmittingVote ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Invalid'}
              </Button>
            </div>
             <DialogFooter className="sm:justify-center">
                 <p className="text-xs text-muted-foreground">Pilihan Anda akan direkam.</p>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}


export default function DynamicJuriPageWithSuspense({ params: paramsProp }: { params: { juriId: string } }) {
  // Use React.use to unwrap params if it's a Promise-like structure, as hinted by Next.js
  const params = use(paramsProp); 
  const juriId = params.juriId;

  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen"> <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat halaman Juri ({juriId}) untuk gelanggang...</p>
        </main>
      </div>
    }>
      <JuriPageComponent juriId={juriId} gelanggangName={gelanggangName} />
    </Suspense>
  );
}


    