
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
import { Skeleton } from '@/components/ui/skeleton'; // Added Skeleton import

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';

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
  matchStatus: string; // e.g., 'Pending', 'OngoingRound1', 'PausedRound1', 'FinishedRound1', 'MatchFinished'
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
  const [confirmedEntryKeysFromDewan, setConfirmedEntryKeysFromDewan] = useState<Set<string>>(new Set());

  useEffect(() => {
    console.log(`[Juri ${juriId}] Setting up config listener. Current configMatchId: ${configMatchId}`);
    setIsLoading(true); 
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      console.log(`[Juri ${juriId}] Firestore config updated. New DBConfigId: ${newDbConfigId}. Current state configMatchId: ${configMatchId}`);
      
      if (newDbConfigId !== configMatchId) { // Only update if it's different
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) { // Initial load and no active match
        setConfigMatchId(null); // Ensure it's not undefined anymore
        setIsLoading(false); // Stop loading if there's nothing to load
      }
    }, (error) => {
      console.error(`[Juri ${juriId}] Error fetching active schedule config:`, error);
      setConfigMatchId(null); 
      setIsLoading(false);
    });
    return () => {
      console.log(`[Juri ${juriId}] Cleaning up config listener.`);
      unsubConfig();
    };
  }, [juriId]); // Removed configMatchId from deps

  useEffect(() => {
    let unsubScores = () => {};
    let unsubMatchDoc = () => {};
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
      console.log(`[Juri ${juriId}] Resetting all match specific data. Reason: ${reason}`);
      setActiveMatchId(null);
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
      setDewanControlledRound(1);
      setIsTimerRunningByDewan(false);
      setDewanMatchStatus('Pending');
      setConfirmedEntryKeysFromDewan(new Set());
    };

    if (configMatchId === undefined) {
      console.log(`[Juri ${juriId}] Data loading useEffect: configMatchId is undefined. Waiting for initial config. Setting isLoading: true.`);
      setIsLoading(true);
      // No need to reset here as initial states are already default
      return;
    }

    if (configMatchId === null) {
      console.log(`[Juri ${juriId}] Data loading useEffect: configMatchId is null. No active match. Setting isLoading: false.`);
      resetAllMatchData("configMatchId is null");
      setIsLoading(false);
      return;
    }

    // If configMatchId is a string, it means there's an active match to load.
    console.log(`[Juri ${juriId}] Data loading useEffect: configMatchId is ${configMatchId}. Proceeding to load data. Setting isLoading: true.`);
    setIsLoading(true);
    
    // Reset previous match data if activeMatchId changes to the new configMatchId
    // or if activeMatchId is null and configMatchId is now set
    if (activeMatchId !== configMatchId) {
      console.log(`[Juri ${juriId}] Active match ID changing from ${activeMatchId} to ${configMatchId}. Resetting previous match state.`);
      resetAllMatchData(`Switching to new match ${configMatchId}`);
    }
    setActiveMatchId(configMatchId); // Set the current working match ID

    const loadData = async (currentMatchId: string) => {
      console.log(`[Juri ${juriId}] loadData called for matchId: ${currentMatchId}`);
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDoc = await getDoc(scheduleDocRef);

        if (!mounted) return;

        if (!scheduleDoc.exists()) {
          console.error(`[Juri ${juriId}] Active schedule document NOT FOUND for ID: ${currentMatchId}`);
          if (mounted) {
            resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
            // setIsLoading(false) will be handled by finally
          }
          return;
        }
        
        const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
        if (mounted) {
          setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
          setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
          console.log(`[Juri ${juriId}] Schedule details loaded for ${currentMatchId}`);
        }

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
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
              setDewanControlledRound(1);
              setIsTimerRunningByDewan(false);
              setDewanMatchStatus('Pending');
            }
            if (data?.confirmed_entry_keys_log) {
              setConfirmedEntryKeysFromDewan(new Set(data.confirmed_entry_keys_log as string[]));
            } else {
              setConfirmedEntryKeysFromDewan(new Set());
            }
            console.log(`[Juri ${juriId}] Updated timer status from Dewan for ${currentMatchId}: Round ${dewanControlledRound}, Running ${isTimerRunningByDewan}, Status ${dewanMatchStatus}`);
          } else {
            console.log(`[Juri ${juriId}] Match document ${currentMatchId} does not exist or no timer_status. Using defaults.`);
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
            setConfirmedEntryKeysFromDewan(new Set());
          }
        }, (error) => {
          console.error(`[Juri ${juriId}] Error fetching timer status/confirmed keys for ${currentMatchId}:`, error);
        });
        
        const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
        unsubScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
          if (!mounted) return;
          if (scoreDoc.exists()) {
            const data = scoreDoc.data() as JuriMatchData;
            setScoresData({
              merah: { round1: data.merah?.round1 || [], round2: data.merah?.round2 || [], round3: data.merah?.round3 || [] },
              biru: { round1: data.biru?.round1 || [], round2: data.biru?.round2 || [], round3: data.biru?.round3 || [] },
              lastUpdated: data.lastUpdated,
            });
            console.log(`[Juri ${juriId}] Juri scores updated for ${currentMatchId}`);
          } else {
            console.log(`[Juri ${juriId}] No juri_scores document for ${juriId} in match ${currentMatchId}. Initializing scores.`);
            setScoresData(initialJuriMatchData());
          }
        }, (error) => {
          console.error(`[Juri ${juriId}] Error fetching/subscribing to juri scores for ${currentMatchId}:`, error);
        });

      } catch (error) {
        console.error(`[Juri ${juriId}] Error in loadData for ${currentMatchId}:`, error);
        if (mounted) {
             resetAllMatchData(`Error in loadData: ${error}`);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          console.log(`[Juri ${juriId}] Data loading attempt finished for ${currentMatchId}. isLoading: ${false}, matchDetailsLoaded: ${matchDetailsLoaded}`);
        }
      }
    };

    loadData(configMatchId);

    return () => {
      mounted = false;
      console.log(`[Juri ${juriId}] Cleaning up data listeners for match: ${configMatchId}`);
      unsubScores();
      unsubMatchDoc();
    };
  }, [configMatchId, juriId]); // Added activeMatchId to re-run if it's reset externally or for clarity


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
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData; 
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const newEntry: ScoreEntry = { points: pointsValue, timestamp: Timestamp.now() };
      if (!newScores[pesilatColor][roundKey]) newScores[pesilatColor][roundKey] = [];
      newScores[pesilatColor][roundKey].push(newEntry);
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (isInputDisabled) return;
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData;
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      if (newScores[pesilatColor][roundKey]?.length > 0) newScores[pesilatColor][roundKey].pop();
      saveScoresToFirestore(newScores);
      return newScores;
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
      try {
        entryTimestampMillis = entry.timestamp.toMillis();
      } catch (e) {
        entryTimestampMillis = Date.now(); 
      }
      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isConfirmed = confirmedEntryKeysFromDewan.has(entryKey);
      return (
        <span key={`${juriId}-roundEntry-${index}-${entryTimestampMillis}`} className={cn(!isConfirmed && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ' '}{curr}</>, <></>);
  };
  
  const isInputDisabled = isLoading || !activeMatchId || dewanMatchStatus === 'MatchFinished' || !isTimerRunningByDewan || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused');
  
  const inputDisabledReason = () => {
    if (configMatchId === undefined) return "Memuat konfigurasi...";
    if (isLoading && activeMatchId) return "Sinkronisasi data pertandingan...";
    if (isLoading) return "Memuat..."; // Generic loading
    if (!activeMatchId) return "Tidak ada pertandingan aktif. Aktifkan di Admin & mulai oleh Dewan.";
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound') && parseInt(dewanMatchStatus.replace('FinishedRound','')) === dewanControlledRound) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused')) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (!isTimerRunningByDewan) return "Input nilai ditutup (timer tidak berjalan).";
    return "";
  };

  const pageDescription = () => {
    if (isLoading && !activeMatchId && configMatchId === undefined) return "Memuat konfigurasi...";
    if (isLoading && activeMatchId) return `Memuat data untuk pertandingan... Babak ${dewanControlledRound}`;
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan yang aktif.";
    if (matchDetailsLoaded && activeMatchId) return `${pesilatMerah?.name || 'Merah'} vs ${pesilatBiru?.name || 'Biru'} - Babak ${dewanControlledRound}`;
    return 'Menunggu info pertandingan...';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title={`${juriDisplayName} - Scoring Tanding`}
          description={pageDescription()}
        >
          <div className="flex items-center gap-2">
             {isLoading && activeMatchId ? <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/> : (isInputDisabled && activeMatchId ? <Lock className="h-5 w-5 text-red-500" /> : (!isInputDisabled && activeMatchId ? <Unlock className="h-5 w-5 text-green-500" /> :  <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>))}
            <span className={`text-sm font-medium ${isLoading && activeMatchId ? 'text-yellow-600' : (isInputDisabled && activeMatchId ? 'text-red-500' : (!isInputDisabled && activeMatchId ? 'text-green-500' : 'text-yellow-600'))}`}>
                {inputDisabledReason() || (activeMatchId ? "Input Nilai Terbuka" : "Menunggu Pertandingan Aktif")}
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
                <p className="font-semibold text-lg">{ (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.name || 'PESILAT MERAH') : (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT MERAH')}</p>
                <p>Kontingen: { (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.contingent || '-') : (isLoading && activeMatchId ? <Skeleton className="h-4 w-24 mt-1" /> : '-')}</p>
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                Babak Aktif: <span className="text-primary">{dewanControlledRound}</span>
              </div>
              <div className="text-blue-600 text-right">
                <p className="font-semibold text-lg">{(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.name || 'PESILAT BIRU') : (isLoading && activeMatchId ? <Skeleton className="h-6 w-32" /> : 'PESILAT BIRU')}</p>
                <p>Kontingen: {(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.contingent || '-') : (isLoading && activeMatchId ? <Skeleton className="h-4 w-24 mt-1" /> : '-')}</p>
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
                    {activeMatchId ? renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : '-'}
                  </div>
                  <div className={`p-3 font-medium flex items-center justify-center border-r`}>
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </div>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {activeMatchId ? renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : '-'}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-xl font-bold">
              <p className="text-red-600">Total (Merah): {activeMatchId ? totalMerahDisplay : 0}</p>
              <p className="text-blue-600">Total (Biru): {activeMatchId ? totalBiruDisplay : 0}</p>
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

    