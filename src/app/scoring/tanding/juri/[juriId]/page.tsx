
"use client";

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, MinusSquare, Target, Shield, Lock, Unlock, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const JURI_VISUAL_GRACE_PERIOD_MS = 2000; // How long a new local entry remains un-struck visually before Dewan's decision is prioritized

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface ScoreEntry {
  points: 1 | 2;
  timestamp: Timestamp;
}

interface RoundScores {
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

interface JuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  lastUpdated?: Timestamp;
}

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
});

export default function JuriDynamicPage({ params: paramsPromise }: { params: Promise<{ juriId: string }> }) {
  const params = use(paramsPromise);
  const { juriId } = params;

  const juriDisplayName = `Juri ${juriId?.split('-')[1] || 'Tidak Dikenal'}`;

  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());
  const [isLoading, setIsLoading] = useState(true);

  const [dewanControlledRound, setDewanControlledRound] = useState<1 | 2 | 3>(1);
  const [isTimerRunningByDewan, setIsTimerRunningByDewan] = useState<boolean>(false);
  const [dewanMatchStatus, setDewanMatchStatus] = useState<string>('Pending');

  const [confirmedUnstruckKeysFromDewan, setConfirmedUnstruckKeysFromDewan] = useState<Set<string>>(new Set());
  const [confirmedStruckKeysFromDewan, setConfirmedStruckKeysFromDewan] = useState<Set<string>>(new Set());


  useEffect(() => {
    if(!isLoading) setIsLoading(true);
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) {
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) {
        setConfigMatchId(null);
      }
    }, (error) => {
      console.error(`[Juri ${juriId}] Error fetching active schedule config:`, error);
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, [juriId]); // configMatchId removed as per react-hooks/exhaustive-deps advice if it causes re-runs

  useEffect(() => {
    let unsubScores = () => {};
    let unsubMatchDoc = () => {};
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
      if (!mounted) return;
      setActiveMatchId(null);
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
      setDewanControlledRound(1);
      setIsTimerRunningByDewan(false);
      setDewanMatchStatus('Pending');
      setConfirmedUnstruckKeysFromDewan(new Set());
      setConfirmedStruckKeysFromDewan(new Set());
    };

    if (configMatchId === undefined) {
      if (!isLoading) setIsLoading(true);
      return;
    }

    if (configMatchId === null) {
      if (activeMatchId !== null) {
        resetAllMatchData("configMatchId became null");
      }
      if (isLoading) setIsLoading(false);
      return;
    }

    if (activeMatchId !== configMatchId) {
        if (!isLoading) setIsLoading(true);
        resetAllMatchData(`Switching to new match ${configMatchId}`);
        setActiveMatchId(configMatchId);
        return;
    }

    if (activeMatchId && (isLoading || !matchDetailsLoaded)) {
        const loadData = async (currentMatchId: string) => {
          if (!mounted) return;
          let scheduleLoaded = false;
          let ownScoresListenerSet = false;
          let matchDocListenerSet = false;

          const checkAndStopLoading = () => {
            if (mounted && scheduleLoaded && ownScoresListenerSet && matchDocListenerSet && isLoading) {
              setIsLoading(false);
            }
          };

          try {
            const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
            const scheduleDoc = await getDoc(scheduleDocRef);

            if (!mounted) return;
            if (!scheduleDoc.exists()) {
              console.error(`[Juri ${juriId}] Active schedule document NOT FOUND for ID: ${currentMatchId}`);
              if (mounted) {
                resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
                if(isLoading) setIsLoading(false);
              }
              return;
            }
            const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
            if (mounted) {
              setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
              setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
              setMatchDetailsLoaded(true);
              scheduleLoaded = true;
              checkAndStopLoading();
            }

            const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
            unsubMatchDoc = onSnapshot(matchDocRef, (docSnap) => {
              if (!mounted) return;
              matchDocListenerSet = true;
              if (docSnap.exists()) {
                const data = docSnap.data();
                // console.log(`[Juri ${juriId}] Raw data from matchDoc for ${currentMatchId}:`, JSON.stringify(data));
                if (data?.timer_status) {
                  const dewanStatus = data.timer_status as TimerStatusFromDewan;
                  // console.log(`[Juri ${juriId}] Received timer_status from Dewan for ${currentMatchId}:`, dewanStatus);
                  if(mounted){
                    setDewanControlledRound(dewanStatus.currentRound || 1);
                    setIsTimerRunningByDewan(dewanStatus.isTimerRunning || false);
                    setDewanMatchStatus(dewanStatus.matchStatus || 'Pending');
                  }
                } else {
                   if(mounted){
                    setDewanControlledRound(1);
                    setIsTimerRunningByDewan(false);
                    setDewanMatchStatus('Pending');
                  }
                }
                if (data?.confirmed_unstruck_keys_log) {
                  const newUnstruckKeys = new Set(data.confirmed_unstruck_keys_log as string[]);
                  if(mounted) setConfirmedUnstruckKeysFromDewan(newUnstruckKeys);
                } else {
                  if(mounted) setConfirmedUnstruckKeysFromDewan(new Set());
                }
                if (data?.confirmed_struck_keys_log) {
                  const newStruckKeys = new Set(data.confirmed_struck_keys_log as string[]);
                  if(mounted) setConfirmedStruckKeysFromDewan(newStruckKeys);
                } else {
                  if(mounted) setConfirmedStruckKeysFromDewan(new Set());
                }

              } else {
                if(mounted){
                  setDewanControlledRound(1);
                  setIsTimerRunningByDewan(false);
                  setDewanMatchStatus('Pending');
                  setConfirmedUnstruckKeysFromDewan(new Set());
                  setConfirmedStruckKeysFromDewan(new Set());
                }
              }
              checkAndStopLoading();
            }, (error) => {
              console.error(`[Juri ${juriId}] Error fetching match doc for ${currentMatchId}:`, error);
               if(mounted){
                  setDewanControlledRound(1);
                  setIsTimerRunningByDewan(false);
                  setDewanMatchStatus('Pending');
                  setConfirmedUnstruckKeysFromDewan(new Set());
                  setConfirmedStruckKeysFromDewan(new Set());
                  matchDocListenerSet = true;
                  checkAndStopLoading();
              }
            });

            const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
            unsubScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
              if (!mounted) return;
              ownScoresListenerSet = true;
              if (scoreDoc.exists()) {
                const data = scoreDoc.data() as JuriMatchData;
                if(mounted) {
                  setScoresData({
                    merah: { round1: data.merah?.round1 || [], round2: data.merah?.round2 || [], round3: data.merah?.round3 || [] },
                    biru: { round1: data.biru?.round1 || [], round2: data.biru?.round2 || [], round3: data.biru?.round3 || [] },
                    lastUpdated: data.lastUpdated,
                  });
                }
              } else {
                if(mounted) setScoresData(initialJuriMatchData());
              }
              checkAndStopLoading();
            }, (error) => {
              console.error(`[Juri ${juriId}] Error fetching/subscribing to juri scores for ${currentMatchId}:`, error);
              if(mounted) {
                setScoresData(initialJuriMatchData());
                ownScoresListenerSet = true;
                checkAndStopLoading();
              }
            });

          } catch (error) {
            console.error(`[Juri ${juriId}] Error in loadData for ${currentMatchId}:`, error);
            if (mounted) {
                resetAllMatchData(`Error in loadData: ${error}`);
                if (isLoading) setIsLoading(false);
            }
          }
        };
        loadData(activeMatchId);
    }

    return () => {
      mounted = false;
      unsubScores();
      unsubMatchDoc();
    };
  }, [configMatchId, juriId, activeMatchId, isLoading, matchDetailsLoaded]);


  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      await setDoc(juriScoreDocRef, { ...newScoresData, lastUpdated: Timestamp.now() }, { merge: true });
    } catch (error) {
      console.error(`[Juri ${juriId}] Error saving scores:`, error);
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', pointsValue: 1 | 2) => {
    if (isInputDisabled) return;

    setScoresData(prevScores => {
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const newEntry: ScoreEntry = { points: pointsValue, timestamp: Timestamp.now() };

      const updatedColorScores = { ...prevScores[pesilatColor] };
      const currentRoundArray = updatedColorScores[roundKey] || [];
      updatedColorScores[roundKey] = [...currentRoundArray, newEntry];

      const updatedScores: JuriMatchData = {
        ...prevScores,
        [pesilatColor]: updatedColorScores,
      };

      saveScoresToFirestore(updatedScores);
      return updatedScores;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (isInputDisabled) return;
    setScoresData(prevScores => {
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const updatedColorScores = { ...prevScores[pesilatColor] };
      const currentRoundArray = updatedColorScores[roundKey] || [];

      if (currentRoundArray.length === 0) {
        return prevScores; // No scores to delete
      }

      updatedColorScores[roundKey] = currentRoundArray.slice(0, -1); // Remove the last score

      const updatedScores: JuriMatchData = {
        ...prevScores,
        [pesilatColor]: updatedColorScores,
      };
      saveScoresToFirestore(updatedScores);
      return updatedScores;
    });
  };

  const calculateTotalScoreForPesilatDisplay = (roundScores: RoundScores): number => {
    if (!roundScores) return 0;
    return Object.values(roundScores).reduce((total, roundDataArray) =>
      total + (roundDataArray?.reduce((sum, scoreEntry) => sum + scoreEntry.points, 0) || 0), 0);
  };

  const totalMerahDisplay = calculateTotalScoreForPesilatDisplay(scoresData.merah);
  const totalBiruDisplay = calculateTotalScoreForPesilatDisplay(scoresData.biru);

  const renderRoundScoresDisplay = (roundData: ScoreEntry[] | undefined) => {
    if (!roundData || roundData.length === 0) return '-';

    return roundData.map((entry, index) => {
      let entryTimestampMillis: number;
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        console.warn(`[Juri ${juriId}] Invalid timestamp in renderRoundScoresDisplay for entry:`, JSON.stringify(entry));
        return <span key={`${juriId}-roundEntry-${index}-invalid`} className="mr-1.5 text-red-500">Inv!</span>;
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isUnstruckByDewan = confirmedUnstruckKeysFromDewan.has(entryKey);
      const isPermanentlyStruckByDewan = confirmedStruckKeysFromDewan.has(entryKey);
      
      // A new local entry gets a brief visual grace period if Dewan hasn't decided its fate yet
      const isNewLocalEntryInGrace = !isUnstruckByDewan && !isPermanentlyStruckByDewan && (Date.now() - entryTimestampMillis <= JURI_VISUAL_GRACE_PERIOD_MS);

      const shouldDisplayAsStruck = isPermanentlyStruckByDewan || (!isUnstruckByDewan && !isNewLocalEntryInGrace);

      return (
        <span key={`${juriId}-roundEntry-${index}-${entryTimestampMillis}`} className={cn(shouldDisplayAsStruck && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ' '}{curr}</>, <></>);
  };

  const isInputDisabled = isLoading ||
                          !activeMatchId ||
                          !matchDetailsLoaded ||
                          dewanMatchStatus === 'MatchFinished' ||
                          !isTimerRunningByDewan ||
                          dewanMatchStatus.startsWith('FinishedRound') ||
                          dewanMatchStatus.startsWith('Paused') ||
                          dewanMatchStatus === 'Pending';

  const inputDisabledReason = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi...";
    if (isLoading && (activeMatchId || configMatchId)) return "Sinkronisasi data pertandingan...";
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan aktif. Aktifkan di Admin & mulai oleh Dewan.";
    if (!matchDetailsLoaded && activeMatchId && !isLoading) return "Menunggu detail pertandingan dari Dewan...";
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound') && parseInt(dewanMatchStatus.replace('FinishedRound','')) === dewanControlledRound) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused') && isTimerRunningByDewan === false) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (!isTimerRunningByDewan && activeMatchId && matchDetailsLoaded && dewanMatchStatus === `OngoingRound${dewanControlledRound}`) return "Timer belum berjalan dari Dewan.";
    if (dewanMatchStatus === 'Pending' && activeMatchId && matchDetailsLoaded) return "Menunggu Dewan memulai babak."
    if (!isTimerRunningByDewan && dewanMatchStatus !== 'Pending' && dewanMatchStatus !== 'MatchFinished' && !dewanMatchStatus.startsWith('FinishedRound')) return "Input nilai ditutup (timer tidak berjalan dari Dewan).";
    return "";
  };

  const pageDescription = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi...";
    if (isLoading && activeMatchId && !matchDetailsLoaded) return `Memuat data untuk pertandingan... Babak ${dewanControlledRound}`;
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan yang aktif.";
    if (matchDetailsLoaded && activeMatchId) return `${pesilatMerah?.name || 'Merah'} vs ${pesilatBiru?.name || 'Biru'} - Babak ${dewanControlledRound}`;
    if (!matchDetailsLoaded && activeMatchId && !isLoading) return "Menunggu detail pertandingan dari Dewan...";
    return 'Menunggu info pertandingan...';
  };

  const getStatusIcon = () => {
    if (configMatchId === undefined && isLoading) return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
    if (isLoading && (activeMatchId || configMatchId)) return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
    if (isInputDisabled && (activeMatchId || !isLoading)) return <Lock className="h-5 w-5 text-red-500" />; // Changed condition
    if (!isInputDisabled && activeMatchId && matchDetailsLoaded) return <Unlock className="h-5 w-5 text-green-500" />;
    return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
  };

  const getStatusText = () => {
    const reason = inputDisabledReason();
    if (reason) return reason;
    if (activeMatchId && matchDetailsLoaded && !isInputDisabled) return "Input Nilai Terbuka";
    return "Memeriksa status...";
  };

  // For debugging:
  // useEffect(() => {
  //   console.log(`[Juri ${juriId}] FINAL RENDER STATE: isLoading=${isLoading}, activeMatchId=${activeMatchId}, matchDetailsLoaded=${matchDetailsLoaded}, dewanMatchStatus='${dewanMatchStatus}', isTimerRunningByDewan=${isTimerRunningByDewan}, calculated isInputDisabled=${isInputDisabled}`);
  //   console.log(`[Juri ${juriId}] Unstruck keys from Dewan:`, confirmedUnstruckKeysFromDewan);
  //   console.log(`[Juri ${juriId}] Struck keys from Dewan:`, confirmedStruckKeysFromDewan);
  // }, [isLoading, activeMatchId, matchDetailsLoaded, dewanMatchStatus, isTimerRunningByDewan, isInputDisabled, confirmedUnstruckKeysFromDewan, confirmedStruckKeysFromDewan, juriId]);


  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title={`${juriDisplayName} - Scoring Tanding`}
          description={pageDescription()}
        >
          <div className="flex items-center gap-2">
             {getStatusIcon()}
            <span className={cn("text-sm font-medium",
                (configMatchId === undefined && isLoading) || (isLoading && (activeMatchId || configMatchId)) ? 'text-yellow-600 dark:text-yellow-400' :
                (isInputDisabled && (activeMatchId || !isLoading)) ? 'text-red-500' :
                (!isInputDisabled && activeMatchId && matchDetailsLoaded) ? 'text-green-500' :
                'text-yellow-600 dark:text-yellow-400'
            )}>
                {getStatusText()}
            </span>
            <Button variant="outline" asChild>
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
            </Button>
          </div>
        </PageTitle>

        <Card className="mb-6 shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-between items-center text-sm mb-4">
              <div className="text-red-600">
                <div className="font-semibold text-lg">{ (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.name || 'PESILAT MERAH') : (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT MERAH')}</div>
                <div>Kontingen: { (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.contingent || '-') : (isLoading && activeMatchId ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                Babak Aktif (Dewan): <span className="text-primary">{dewanControlledRound}</span>
              </div>
              <div className="text-blue-600 text-right">
                <div className="font-semibold text-lg">{(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.name || 'PESILAT BIRU') : (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT BIRU')}</div>
                <div>Kontingen: {(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.contingent || '-') : (isLoading && activeMatchId ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 text-center font-semibold">
                <div className="bg-red-500 text-white p-2">MERAH</div>
                <div className="bg-yellow-400 text-black p-2">BABAK (Skor Anda)</div>
                <div className="bg-blue-500 text-white p-2">BIRU</div>
              </div>
              {[1, 2, 3].map((round) => (
                <div key={round} className={`grid grid-cols-3 text-center border-t ${dewanControlledRound === round ? 'bg-yellow-100 dark:bg-yellow-700/30 font-semibold' : 'bg-white dark:bg-gray-800'}`}>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center border-r">
                    {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : (isLoading && activeMatchId ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                  <div className={`p-3 font-medium flex items-center justify-center border-r`}>
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </div>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : (isLoading && activeMatchId ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-xl font-bold">
              <div className="text-red-600">Total (Merah): {activeMatchId && matchDetailsLoaded ? totalMerahDisplay : (isLoading && activeMatchId ? "..." : 0)}</div>
              <div className="text-blue-600">Total (Biru): {activeMatchId && matchDetailsLoaded ? totalBiruDisplay : (isLoading && activeMatchId ? "..." : 0)}</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:gap-8">
          <div className="space-y-3">
            <h3 className="text-center text-xl font-semibold text-red-600">{(activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.name || 'PESILAT MERAH') : 'PESILAT MERAH'}</h3>
            <Button
              onClick={() => handleScore('merah', 1)}
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled}
              aria-label="Pukulan Merah (+1)"
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
            </Button>
            <Button
              onClick={() => handleScore('merah', 2)}
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled}
              aria-label="Tendangan Merah (+2)"
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
            </Button>
            <Button
              onClick={() => handleDeleteScore('merah')}
              className="w-full bg-red-700 hover:bg-red-800 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled || (scoresData.merah[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)}
              aria-label="Hapus Skor Terakhir Merah"
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-center text-xl font-semibold text-blue-600">{(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.name || 'PESILAT BIRU') : 'PESILAT BIRU'}</h3>
            <Button
              onClick={() => handleScore('biru', 1)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled}
              aria-label="Pukulan Biru (+1)"
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
            </Button>
            <Button
              onClick={() => handleScore('biru', 2)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled}
              aria-label="Tendangan Biru (+2)"
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
            </Button>
            <Button
              onClick={() => handleDeleteScore('biru')}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white text-lg py-6 h-auto disabled:opacity-70"
              disabled={isInputDisabled || (scoresData.biru[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)}
              aria-label="Hapus Skor Terakhir Biru"
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
