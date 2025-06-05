
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
import { doc, onSnapshot, getDoc, Timestamp, setDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const JURI_VISUAL_GRACE_PERIOD_MS = 2000; // 2 seconds for local visual feedback

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

  // Configuration state from global settings
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);

  // Active match this page is operating on
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // Match specific data
  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());

  // Dewan controlled states
  const [dewanControlledRound, setDewanControlledRound] = useState<1 | 2 | 3>(1);
  const [isTimerRunningByDewan, setIsTimerRunningByDewan] = useState<boolean>(false);
  const [dewanMatchStatus, setDewanMatchStatus] = useState<string>('Pending');
  const [confirmedUnstruckKeysFromDewan, setConfirmedUnstruckKeysFromDewan] = useState<Set<string>>(new Set());
  const [confirmedStruckKeysFromDewan, setConfirmedStruckKeysFromDewan] = useState<Set<string>>(new Set());
  
  // UI states
  const [isLoading, setIsLoading] = useState(true);


  // Listener for global active match configuration
  useEffect(() => {
    setIsLoading(true); 
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(newDbConfigId);
    }, (error) => {
      console.error(`[Juri ${juriId}] Error fetching active schedule config:`, error);
      setConfigMatchId(null); 
    });
    return () => unsubConfig();
  }, [juriId]);


  const resetAllMatchData = useCallback((reason: string) => {
    // console.log(`[Juri ${juriId}] Resetting local match data due to: ${reason}`);
    setPesilatMerah(null);
    setPesilatBiru(null);
    // matchDetailsLoaded will be set by the loading effect
    setScoresData(initialJuriMatchData());
    setDewanControlledRound(1);
    setIsTimerRunningByDewan(false);
    setDewanMatchStatus('Pending');
    setConfirmedUnstruckKeysFromDewan(new Set());
    setConfirmedStruckKeysFromDewan(new Set());
  }, []); // juriId is stable from props, no need to include if not used directly inside.


  // Effect to react to configMatchId changes (e.g., new match activated by Admin)
  useEffect(() => {
    if (configMatchId === undefined) { // Still waiting for the first config read
      setIsLoading(true);
      return;
    }

    if (configMatchId === null) { // No active match globally
      if (activeMatchId !== null) { // If there was a previous match, clean up
        resetAllMatchData("configMatchId became null (no active match)");
        setActiveMatchId(null);
      }
      setMatchDetailsLoaded(false);
      setIsLoading(false);
      return;
    }

    // A match is configured globally. Check if it's different from the current one.
    if (activeMatchId !== configMatchId) {
      // console.log(`[Juri ${juriId}] New match detected by config. Old: ${activeMatchId}, New: ${configMatchId}.`);
      resetAllMatchData(`Switching to new match ${configMatchId}`);
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false); // Indicate that details for the new match need to be loaded
      setIsLoading(true); // Start loading process for the new match
    }
    // If activeMatchId is already === configMatchId, the data loading/listening effect will handle it.
  }, [configMatchId, activeMatchId, resetAllMatchData]);


  // Effect for data loading (one-time fetch) and setting up Firestore listeners
  useEffect(() => {
    let mounted = true;
    let unsubscribeMatchDoc: (() => void) | null = null;
    let unsubscribeJuriScores: (() => void) | null = null;

    const cleanupListeners = () => {
      if (unsubscribeMatchDoc) {
        // console.log(`[Juri ${juriId}] Cleaning up MatchDoc listener for ${activeMatchId}.`);
        unsubscribeMatchDoc();
        unsubscribeMatchDoc = null;
      }
      if (unsubscribeJuriScores) {
        // console.log(`[Juri ${juriId}] Cleaning up JuriScores listener for ${activeMatchId}/${juriId}.`);
        unsubscribeJuriScores();
        unsubscribeJuriScores = null;
      }
    };

    if (!activeMatchId) {
      // No active match, ensure everything is clean and not loading
      setMatchDetailsLoaded(false);
      setIsLoading(false);
      return cleanupListeners; // Cleanup any previous listeners just in case
    }

    // This effect should run when activeMatchId is set and we need to load data/listeners.
    // Typically, isLoading would be true here, or matchDetailsLoaded would be false.
    // console.log(`[Juri ${juriId}] Data/Listener useEffect. ActiveMatchId: ${activeMatchId}, isLoading: ${isLoading}, matchDetailsLoaded: ${matchDetailsLoaded}`);

    // Ensure we are in a loading state if details aren't loaded
    if (!matchDetailsLoaded && !isLoading) {
        setIsLoading(true);
    }
    
    let scheduleFetched = matchDetailsLoaded; // Assume true if already loaded
    let matchListenerAttached = false;
    let juriListenerAttached = false;

    const trySetLoadingFalse = () => {
        // console.log(`[Juri ${juriId}] trySetLoadingFalse called. scheduleFetched: ${scheduleFetched}, matchListenerAttached: ${matchListenerAttached}, juriListenerAttached: ${juriListenerAttached}`);
        if (mounted && scheduleFetched && matchListenerAttached && juriListenerAttached) {
            // console.log(`[Juri ${juriId}] All sources loaded/attached for ${activeMatchId}. Setting isLoading = false.`);
            setIsLoading(false);
        }
    };
    
    const loadAndListen = async () => {
      if (!mounted || !activeMatchId) return;
      // console.log(`[Juri ${juriId}] loadAndListen for ${activeMatchId}`);

      try {
        // 1. Fetch Schedule Details (one-time if not already loaded)
        if (!matchDetailsLoaded) {
          const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId);
          const scheduleDoc = await getDoc(scheduleDocRef);
          if (!mounted) return;

          if (scheduleDoc.exists()) {
            const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
            setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
            setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
            setMatchDetailsLoaded(true);
            scheduleFetched = true;
            // console.log(`[Juri ${juriId}] Schedule details loaded for ${activeMatchId}`);
          } else {
            console.error(`[Juri ${juriId}] Schedule document NOT FOUND for ID: ${activeMatchId}`);
            if (mounted) {
                resetAllMatchData(`Schedule doc ${activeMatchId} not found`);
                // setActiveMatchId(null); // Let the primary effect handle this if config changes
                setIsLoading(false);
            }
            return; 
          }
          trySetLoadingFalse();
        } else {
            scheduleFetched = true; // Already loaded
            trySetLoadingFalse(); // Try to set loading false if other listeners also get attached quickly
        }

        // 2. Listen to Match Document (timer, dewan keys)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
        // console.log(`[Juri ${juriId}] Setting up MatchDoc listener for ${activeMatchId}`);
        unsubscribeMatchDoc = onSnapshot(matchDocRef, (docSnap) => {
          if (!mounted) return;
        //   console.log(`[Juri ${juriId}] MatchDoc snapshot for ${activeMatchId}. Exists: ${docSnap.exists()}`);
          if (docSnap.exists()) {
            const data = docSnap.data();
            // console.log(`[Juri ${juriId}] Raw data from matchDoc for ${activeMatchId}:`, JSON.stringify(data));
            if (data?.timer_status) {
              const dewanStatus = data.timer_status as TimerStatusFromDewan;
            //   console.log(`[Juri ${juriId}] Received timer_status from Dewan for ${activeMatchId}:`, dewanStatus);
              if(mounted){
                setDewanControlledRound(dewanStatus.currentRound || 1);
                setIsTimerRunningByDewan(dewanStatus.isTimerRunning || false);
                setDewanMatchStatus(dewanStatus.matchStatus || 'Pending');
                // console.log(`[Juri ${juriId}] Juri states updated from dewan: round=${dewanStatus.currentRound || 1}, isRunning=${dewanStatus.isTimerRunning || false}, status=${dewanStatus.matchStatus || 'Pending'}`);
              }
            } else {
            //   console.log(`[Juri ${juriId}] timer_status not found in matchDoc for ${activeMatchId}. Resetting to defaults.`);
              if(mounted){
                  setDewanControlledRound(1);
                  setIsTimerRunningByDewan(false);
                  setDewanMatchStatus('Pending');
                }
            }
            setConfirmedUnstruckKeysFromDewan(new Set(data?.confirmed_unstruck_keys_log as string[] || []));
            setConfirmedStruckKeysFromDewan(new Set(data?.confirmed_struck_keys_log as string[] || []));
          } else {
            // console.log(`[Juri ${juriId}] Match document ${activeMatchId} does not exist. Resetting dewan status & keys.`);
            if(mounted){ 
              setDewanControlledRound(1);
              setIsTimerRunningByDewan(false);
              setDewanMatchStatus('Pending');
              setConfirmedUnstruckKeysFromDewan(new Set());
              setConfirmedStruckKeysFromDewan(new Set());
            }
          }
          if (!matchListenerAttached) { 
              matchListenerAttached = true;
              trySetLoadingFalse();
          }
        }, (error) => {
          console.error(`[Juri ${juriId}] Error fetching/subscribing to match doc for ${activeMatchId}:`, error);
          if(mounted){
            setDewanControlledRound(1); 
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
            setConfirmedUnstruckKeysFromDewan(new Set());
            setConfirmedStruckKeysFromDewan(new Set());
            if (!matchListenerAttached) {
              matchListenerAttached = true; 
              trySetLoadingFalse();
            }
          }
        });

        // 3. Listen to Own Juri Scores
        const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
        // console.log(`[Juri ${juriId}] Setting up JuriScores listener for ${activeMatchId}/${juriId}`);
        unsubscribeJuriScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
          if (!mounted) return;
        //   console.log(`[Juri ${juriId}] JuriScores snapshot for ${activeMatchId}/${juriId}. Exists: ${scoreDoc.exists()}`);
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
          if (!juriListenerAttached) {
              juriListenerAttached = true;
              trySetLoadingFalse();
          }
        }, (error) => {
          console.error(`[Juri ${juriId}] Error fetching/subscribing to juri scores for ${activeMatchId}:`, error);
          if(mounted) {
              setScoresData(initialJuriMatchData()); 
              if(!juriListenerAttached) {
                  juriListenerAttached = true; 
                  trySetLoadingFalse();
              }
          }
        });

      } catch (error) {
        console.error(`[Juri ${juriId}] Error in loadAndListen for ${activeMatchId}:`, error);
        if (mounted) {
          resetAllMatchData(`Unhandled error in loadAndListen: ${error}`);
          setIsLoading(false);
        }
      }
    };
    
    if (isLoading || !matchDetailsLoaded) { // Condition to trigger loading
        loadAndListen();
    }


    return () => {
      mounted = false;
      // console.log(`[Juri ${juriId}] Cleaning up listeners for ${activeMatchId} from data/listener effect.`);
      cleanupListeners();
    };
  }, [activeMatchId, juriId, isLoading, matchDetailsLoaded, resetAllMatchData]);


  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      const sanitizeScores = (roundScores: RoundScores): RoundScores => ({
        round1: roundScores.round1.filter(e => e.timestamp instanceof Timestamp),
        round2: roundScores.round2.filter(e => e.timestamp instanceof Timestamp),
        round3: roundScores.round3.filter(e => e.timestamp instanceof Timestamp),
      });

      const sanitizedDataToSave: JuriMatchData = {
        merah: sanitizeScores(newScoresData.merah),
        biru: sanitizeScores(newScoresData.biru),
        lastUpdated: Timestamp.now(),
      };
      await setDoc(juriScoreDocRef, sanitizedDataToSave, { merge: true });
    } catch (error) {
      console.error(`[Juri ${juriId}] Error saving scores:`, error);
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', pointsValue: 1 | 2) => {
    if (isInputDisabled) return;

    setScoresData(prevScores => {
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      const newEntry: ScoreEntry = { points: pointsValue, timestamp: Timestamp.now() };
      
      const updatedColorScores = { 
        ...prevScores[pesilatColor],
        [roundKey]: [...(prevScores[pesilatColor]?.[roundKey] || []), newEntry]
      };
      
      const newScoresData: JuriMatchData = {
        ...prevScores,
        [pesilatColor]: updatedColorScores,
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

      if (currentRoundArray.length === 0) {
        return prevScores; 
      }
      
      const newRoundArray = currentRoundArray.slice(0, -1);
      const updatedColorScores = { 
        ...prevScores[pesilatColor],
        [roundKey]: newRoundArray
      };

      const newScoresData: JuriMatchData = {
        ...prevScores,
        [pesilatColor]: updatedColorScores,
      };
      saveScoresToFirestore(newScoresData);
      return newScoresData;
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
      
      const isNewLocalEntryInGrace = 
        !isUnstruckByDewan && 
        !isPermanentlyStruckByDewan && 
        (Date.now() - entryTimestampMillis <= JURI_VISUAL_GRACE_PERIOD_MS);

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
    if (isLoading && (activeMatchId || configMatchId === undefined)) return `Sinkronisasi data pertandingan... (Babak Dewan: ${dewanControlledRound})`;
    if (!activeMatchId && !isLoading && configMatchId === null) return "Tidak ada pertandingan aktif.";
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan..."; 
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound') && parseInt(dewanMatchStatus.replace('FinishedRound','')) === dewanControlledRound) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused') && isTimerRunningByDewan === false) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (activeMatchId && matchDetailsLoaded && dewanMatchStatus === `OngoingRound${dewanControlledRound}` && !isTimerRunningByDewan) return `Timer Babak ${dewanControlledRound} belum berjalan dari Dewan.`;
    if (activeMatchId && matchDetailsLoaded && dewanMatchStatus === 'Pending') return `Babak ${dewanControlledRound} Menunggu Dewan memulai.`
    if (activeMatchId && matchDetailsLoaded && !isTimerRunningByDewan && dewanMatchStatus !== 'Pending' && dewanMatchStatus !== 'MatchFinished' && !dewanMatchStatus.startsWith('FinishedRound')) return "Input nilai ditutup (timer tidak berjalan).";
    return "";
  };
  
  const pageDescription = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi...";
    if (isLoading && (activeMatchId || configMatchId === undefined)) return `Memuat data... (Babak Dewan: ${dewanControlledRound})`;
    if (!activeMatchId && !isLoading && configMatchId === null) return "Tidak ada pertandingan yang aktif.";
    if (matchDetailsLoaded && activeMatchId) return `${pesilatMerah?.name || 'Merah'} vs ${pesilatBiru?.name || 'Biru'} - Babak Aktif (Dewan): ${dewanControlledRound}`;
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    return `Menunggu info pertandingan... (Babak Dewan: ${dewanControlledRound})`;
  };


  const getStatusIcon = () => {
    if (isLoading || (activeMatchId && !matchDetailsLoaded)) return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>;
    if (isInputDisabled) return <Lock className="h-5 w-5 text-red-500" />;
    if (!isInputDisabled && activeMatchId && matchDetailsLoaded) return <Unlock className="h-5 w-5 text-green-500" />;
    return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/>; 
  };
  
  const getStatusText = () => {
    const reason = inputDisabledReason();
    if (reason) return reason;
    if (activeMatchId && matchDetailsLoaded && !isInputDisabled) return "Input Nilai Terbuka";
    if (isLoading || (activeMatchId && !matchDetailsLoaded)) return `Memuat data... (Babak Dewan: ${dewanControlledRound})`;
    return `Memeriksa status... (Babak Dewan: ${dewanControlledRound})`;
  };
  
  // useEffect(() => {
  //   console.log(`[Juri ${juriId}] FINAL RENDER STATE: isLoading=${isLoading}, activeMatchId=${activeMatchId}, matchDetailsLoaded=${matchDetailsLoaded}, dewanMatchStatus='${dewanMatchStatus}', isTimerRunningByDewan=${isTimerRunningByDewan}, dewanControlledRound=${dewanControlledRound}, calculated isInputDisabled=${isInputDisabled}`);
  //   const reasonLog = inputDisabledReason();
  //   if(reasonLog) console.log(`[Juri ${juriId}] Input disabled reason: ${reasonLog}`);
  // }, [isLoading, activeMatchId, matchDetailsLoaded, dewanMatchStatus, isTimerRunningByDewan, dewanControlledRound, isInputDisabled, juriId]);


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
                (isLoading || (activeMatchId && !matchDetailsLoaded)) ? 'text-yellow-600 dark:text-yellow-400' :
                isInputDisabled ? 'text-red-500' :
                'text-green-500'
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
                <div className="font-semibold text-lg">{ (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.name || 'PESILAT MERAH') : (isLoading && (activeMatchId || configMatchId === undefined) ? <Skeleton className="h-6 w-32" /> : 'PESILAT MERAH')}</div>
                <div>Kontingen: { (activeMatchId && matchDetailsLoaded) ? (pesilatMerah?.contingent || '-') : (isLoading && (activeMatchId || configMatchId === undefined) ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
              </div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                Babak (Dewan): <span className="text-primary">{dewanControlledRound}</span>
              </div>
              <div className="text-blue-600 text-right">
                <div className="font-semibold text-lg">{(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.name || 'PESILAT BIRU') : (isLoading && (activeMatchId || configMatchId === undefined) ? <Skeleton className="h-6 w-32" /> : 'PESILAT BIRU')}</div>
                <div>Kontingen: {(activeMatchId && matchDetailsLoaded) ? (pesilatBiru?.contingent || '-') : (isLoading && (activeMatchId || configMatchId === undefined) ? <Skeleton className="h-4 w-24 mt-1" /> : '-') }</div>
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
                    {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : ((isLoading || !activeMatchId) ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                  <div className={`p-3 font-medium flex items-center justify-center border-r`}>
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </div>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {activeMatchId && matchDetailsLoaded ? renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores]) : ((isLoading || !activeMatchId) ? <Skeleton className="h-5 w-20"/> : '-')}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-xl font-bold">
              <div className="text-red-600">Total (Merah): {activeMatchId && matchDetailsLoaded ? totalMerahDisplay : ((isLoading || !activeMatchId) ? "..." : 0)}</div>
              <div className="text-blue-600">Total (Biru): {activeMatchId && matchDetailsLoaded ? totalBiruDisplay : ((isLoading || !activeMatchId) ? "..." : 0)}</div>
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
