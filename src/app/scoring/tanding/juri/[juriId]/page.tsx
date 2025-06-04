
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
  matchStatus: string; // e.g., 'Pending', 'OngoingRound1', 'MatchFinished'
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
  const params = use(paramsPromise); // Next.js 13+ way to access params
  const { juriId } = params; // e.g., "juri-1"

  const juriDisplayName = `Juri ${juriId?.split('-')[1] || 'Tidak Dikenal'}`;

  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  
  const [configMatchId, setConfigMatchId] = useState<string | null>(null); // ID from app_settings
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); // Actual ID being worked on
  
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());
  const [isLoading, setIsLoading] = useState(true);
  
  // State for Dewan's control signals
  const [dewanControlledRound, setDewanControlledRound] = useState<1 | 2 | 3>(1);
  const [isTimerRunningByDewan, setIsTimerRunningByDewan] = useState<boolean>(false);
  const [dewanMatchStatus, setDewanMatchStatus] = useState<string>('Pending');

  // New state for confirmed entry keys from Dewan
  const [confirmedEntryKeysFromDewan, setConfirmedEntryKeysFromDewan] = useState<Set<string>>(new Set());


  useEffect(() => {
    // Listener for the active match ID configuration
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newConfigMatchId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newConfigMatchId !== configMatchId) { // Only update if the config ID actually changes
        console.log(`[Juri ${juriId}] Configured Match ID changed from ${configMatchId} to ${newConfigMatchId}`);
        setConfigMatchId(newConfigMatchId);
        // Reset states if configMatchId becomes null or changes
        if (!newConfigMatchId || newConfigMatchId !== activeMatchId) {
            setActiveMatchId(null); // Will trigger data reload or reset in the next useEffect
            setPesilatMerah(null);
            setPesilatBiru(null);
            setMatchDetailsLoaded(false);
            setScoresData(initialJuriMatchData());
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
            setConfirmedEntryKeysFromDewan(new Set());
            setIsLoading(!newConfigMatchId); // If no new ID, stop loading. If new ID, next effect loads.
        }
      } else if (!newConfigMatchId && !configMatchId) {
          // Case where it was null and remains null
          setIsLoading(false);
      }
    }, (error) => {
      console.error(`[Juri ${juriId}] Error fetching active schedule config:`, error);
      setConfigMatchId(null); // Reset on error
      // Trigger reset of other states if necessary by setting activeMatchId to null
      setActiveMatchId(null); 
      setIsLoading(false);
    });
    return () => unsubConfig();
  }, [juriId, configMatchId, activeMatchId]); // Include activeMatchId to help reset logic

  useEffect(() => {
    let unsubScores = () => {};
    let unsubTimerStatus = () => {};
    let unsubConfirmedKeys = () => {};

    if (!configMatchId) {
      // This ensures that if configMatchId becomes null, all data is cleared
      // and loading stops. This might already be handled by the config listener,
      // but good for safety.
      setActiveMatchId(null);
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
      setDewanControlledRound(1);
      setIsTimerRunningByDewan(false);
      setDewanMatchStatus('Pending');
      setConfirmedEntryKeysFromDewan(new Set());
      setIsLoading(false);
      return;
    }

    // If configMatchId is present, but it's different from the current activeMatchId,
    // it means we need to load data for a new match.
    if (configMatchId !== activeMatchId) {
        setActiveMatchId(configMatchId); // This will be the new match ID we operate on.
        // Reset dependent states before loading new data
        setPesilatMerah(null);
        setPesilatBiru(null);
        setMatchDetailsLoaded(false);
        setScoresData(initialJuriMatchData());
        setConfirmedEntryKeysFromDewan(new Set());
        // Dewantimer status will be fetched
        setIsLoading(true); // Start loading for the new activeMatchId
    } else if (!isLoading && matchDetailsLoaded) {
        // If configMatchId is the same as activeMatchId, and we are not loading,
        // and details are loaded, it means data is current, no need to reload all.
        // Listeners will keep things updated.
        return;
    }


    // This effect should now primarily run when activeMatchId is newly set (or to setup listeners)
    // Guard against running if activeMatchId is null after the above logic
    if (!activeMatchId) {
        setIsLoading(false);
        return;
    }

    console.log(`[Juri ${juriId}] useEffect for data loading triggered. ActiveMatchId: ${activeMatchId}`);
    setIsLoading(true); // Explicitly set loading to true when we intend to load.

    const loadAllData = async () => {
      try {
        // Fetch schedule details (pesilat names, contingents)
        console.log(`[Juri ${juriId}] Fetching schedule details for ${activeMatchId}`);
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId);
        const scheduleDoc = await getDoc(scheduleDocRef);

        if (!scheduleDoc.exists()) {
          console.error(`[Juri ${juriId}] Active schedule document not found for ID: ${activeMatchId}`);
          setPesilatMerah(null); setPesilatBiru(null); setMatchDetailsLoaded(false);
          // Consider setting activeMatchId back to null if the configured ID is invalid
          // setConfigMatchId(null); // This might cause a loop, be careful
          setScoresData(initialJuriMatchData());
          setIsLoading(false);
          return;
        }
        
        const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
        setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
        setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
        setMatchDetailsLoaded(true);
        console.log(`[Juri ${juriId}] Schedule details loaded for ${activeMatchId}`);

        // Listener for timer status and confirmed keys from Dewan (from the main match document)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
        unsubTimerStatus = onSnapshot(matchDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Timer Status
            if (data?.timer_status) {
              const dewanStatus = data.timer_status as TimerStatusFromDewan;
              setDewanControlledRound(dewanStatus.currentRound || 1);
              setIsTimerRunningByDewan(dewanStatus.isTimerRunning || false);
              setDewanMatchStatus(dewanStatus.matchStatus || 'Pending');
            } else { // Default if timer_status field is missing
              setDewanControlledRound(1);
              setIsTimerRunningByDewan(false);
              setDewanMatchStatus('Pending');
            }
            // Confirmed Entry Keys
            if (data?.confirmed_entry_keys_log) {
              const keysArray = data.confirmed_entry_keys_log as string[];
              setConfirmedEntryKeysFromDewan(new Set(keysArray));
            } else { // Default if field is missing
              setConfirmedEntryKeysFromDewan(new Set());
            }
          } else { // Document itself doesn't exist
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
            setConfirmedEntryKeysFromDewan(new Set());
          }
        }, (error) => {
            console.error(`[Juri ${juriId}] Error fetching timer status/confirmed keys for ${activeMatchId}:`, error);
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
            setConfirmedEntryKeysFromDewan(new Set());
        });
        
        // Listener for this Juri's scores
        const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
        console.log(`[Juri ${juriId}] Setting up score listener for ${juriScoreDocRef.path}`);
        unsubScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
          if (scoreDoc.exists()) {
            const data = scoreDoc.data() as JuriMatchData;
            const ensuredData: JuriMatchData = { // Ensure all rounds arrays exist
              merah: {
                round1: data.merah?.round1 || [],
                round2: data.merah?.round2 || [],
                round3: data.merah?.round3 || [],
              },
              biru: {
                round1: data.biru?.round1 || [],
                round2: data.biru?.round2 || [],
                round3: data.biru?.round3 || [],
              },
              lastUpdated: data.lastUpdated
            };
            setScoresData(ensuredData);
          } else {
            console.log(`[Juri ${juriId}] No score document found for this juri at ${juriScoreDocRef.path}. Initializing.`);
            setScoresData(initialJuriMatchData()); // Initialize if not exists
            // Optionally, create the document here if it's expected to always exist once a match is active
            // saveScoresToFirestore(initialJuriMatchData()); 
          }
          // Consider moving setIsLoading(false) here if this is the last piece of data to load
        }, (error) => {
          console.error(`[Juri ${juriId}] Error fetching/subscribing to juri scores:`, error);
          setScoresData(initialJuriMatchData());
        });

      } catch (error) {
        console.error(`[Juri ${juriId}] Error in loadAllData for ${activeMatchId}:`, error);
        setPesilatMerah(null); setPesilatBiru(null); setMatchDetailsLoaded(false);
        // setConfigMatchId(null); // Critical error, maybe reset config
        setActiveMatchId(null);
        setScoresData(initialJuriMatchData());
      } finally {
        // Set loading to false after all initial fetches attempt
        // This might be too soon if listeners are still initializing
        // A more robust way is to track multiple loading states or use a counter.
        // For now, let's assume schedule details are the primary blocker for initial UI.
         if (matchDetailsLoaded || !activeMatchId) { // If details loaded or no active match, stop loading.
            setIsLoading(false);
        }
      }
    };
    
    // Only call loadAllData if activeMatchId is set (which implies configMatchId was also set)
    if (activeMatchId) {
        loadAllData();
    } else {
        setIsLoading(false); // if somehow activeMatchId became null here
    }


    return () => {
      console.log(`[Juri ${juriId}] Cleaning up listeners for match: ${activeMatchId || configMatchId}`);
      unsubScores();
      unsubTimerStatus();
      unsubConfirmedKeys(); // Make sure to define this if it's a separate listener. For now, it's part of unsubTimerStatus.
    };
  }, [activeMatchId, juriId]); // Depend on activeMatchId to re-run when the match to operate on changes. Removed isLoading from deps


  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) {
        console.warn(`[Juri ${juriId}] Attempted to save scores but activeMatchId (${activeMatchId}) or juriId (${juriId}) is missing.`);
        return;
    }
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      const dataToSave = {
        merah: newScoresData.merah,
        biru: newScoresData.biru,
        lastUpdated: Timestamp.now()
      };
      await setDoc(juriScoreDocRef, dataToSave, { merge: true }); // Use merge true to avoid overwriting other fields if any
      console.log(`[Juri ${juriId}] Scores saved to Firestore for match ${activeMatchId}`);
    } catch (error) {
      console.error(`[Juri ${juriId}] Error saving scores to Firestore for match ${activeMatchId}:`, error);
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', pointsValue: 1 | 2) => {
    if (!activeMatchId || isLoading || !isTimerRunningByDewan || dewanMatchStatus === 'MatchFinished' || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused')) {
        console.log(`[Juri ${juriId}] Score input blocked. Reason: activeMatchId=${activeMatchId}, isLoading=${isLoading}, isTimerRunning=${isTimerRunningByDewan}, dewanMatchStatus=${dewanMatchStatus}`);
        return;
    }
    
    setScoresData(prevScores => {
      // Deep clone to avoid mutating previous state directly
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData; 
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      
      const newEntry: ScoreEntry = {
        points: pointsValue,
        timestamp: Timestamp.now() // Capture current time for the entry
      };

      // Ensure the round array exists
      if (!newScores[pesilatColor][roundKey]) {
        newScores[pesilatColor][roundKey] = [];
      }
      newScores[pesilatColor][roundKey].push(newEntry);
      
      saveScoresToFirestore(newScores); // Save the updated scores
      return newScores; // Return for local state update (though onSnapshot should also catch it)
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (!activeMatchId || isLoading || !isTimerRunningByDewan || dewanMatchStatus === 'MatchFinished' || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused')) {
        console.log(`[Juri ${juriId}] Delete score input blocked. Reason: activeMatchId=${activeMatchId}, isLoading=${isLoading}, isTimerRunning=${isTimerRunningByDewan}, dewanMatchStatus=${dewanMatchStatus}`);
        return;
    }
    
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData;
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      
      if (newScores[pesilatColor][roundKey] && newScores[pesilatColor][roundKey].length > 0) {
        newScores[pesilatColor][roundKey].pop(); // Remove the last score entry for that round
      }
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
      if (entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
        entryTimestampMillis = entry.timestamp.toMillis();
      } else {
        // console.warn(`[Juri ${juriId} Display] Invalid timestamp for entry in round:`, entry);
        entryTimestampMillis = Date.now(); // Fallback, should ideally not happen if data is clean
      }
      // Construct the key as Dewan 1 does, using this Juri's ID for their own scores
      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isConfirmed = confirmedEntryKeysFromDewan.has(entryKey);

      return (
        <span key={`${juriId}-roundEntry-${index}`} className={cn(!isConfirmed && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ' '}{curr}</>, <></>);
  };
  
  const isInputDisabled = isLoading || !activeMatchId || dewanMatchStatus === 'MatchFinished' || !isTimerRunningByDewan || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused');
  const inputDisabledReason = () => {
    if (isLoading && !matchDetailsLoaded) return "Memuat data pertandingan...";
    if (isLoading) return "Sinkronisasi data...";
    if (!activeMatchId) return "Tidak ada pertandingan aktif.";
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound') && parseInt(dewanMatchStatus.replace('FinishedRound','')) === dewanControlledRound) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused')) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (!isTimerRunningByDewan) return "Input nilai ditutup (timer tidak berjalan).";
    return "";
  };

  if (isLoading && !configMatchId && !activeMatchId) { // Initial loading before any config is known
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description="Memuat konfigurasi pertandingan..." />
          </div>
        </main>
      </div>
    );
  }

  if (!activeMatchId && !isLoading) { // No active match configured or error in config
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description="Tidak ada pertandingan yang aktif.">
            <Button variant="outline" asChild>
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
            </Button>
          </PageTitle>
          <Card className="mt-6"><CardContent className="p-6 text-center"><p>Silakan aktifkan jadwal pertandingan di halaman Admin dan mulai oleh Dewan.</p></CardContent></Card>
        </main>
      </div>
    );
  }
  
  if (isLoading && activeMatchId && !matchDetailsLoaded) { // Loading match details for a configured match
     return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
           <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description={`Memuat data untuk pertandingan...`} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title={`${juriDisplayName} - Scoring Tanding`}
          description={matchDetailsLoaded && activeMatchId ? `${pesilatMerah?.name || 'Merah'} vs ${pesilatBiru?.name || 'Biru'} - Babak ${dewanControlledRound}` : 'Menunggu info pertandingan...'}
        >
          <div className="flex items-center gap-2">
             {isInputDisabled ? <Lock className="h-5 w-5 text-red-500" /> : <Unlock className="h-5 w-5 text-green-500" />}
            <span className={`text-sm font-medium ${isInputDisabled ? 'text-red-500' : 'text-green-500'}`}>{inputDisabledReason() || "Input Nilai Terbuka"}</span>
            <Button variant="outline" asChild>
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
            </Button>
          </div>
        </PageTitle>

        {matchDetailsLoaded && activeMatchId ? ( // Render only if match details are loaded and there's an active match
          <>
            <Card className="mb-6 shadow-lg">
              <CardContent className="p-4">
                <div className="flex justify-between items-center text-sm mb-4">
                  <div className="text-red-600">
                    <p className="font-semibold text-lg">{pesilatMerah?.name || 'PESILAT MERAH'}</p>
                    <p>Kontingen: {pesilatMerah?.contingent || '-'}</p>
                  </div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                    Babak Aktif: <span className="text-primary">{dewanControlledRound}</span>
                  </div>
                  <div className="text-blue-600 text-right">
                    <p className="font-semibold text-lg">{pesilatBiru?.name || 'PESILAT BIRU'}</p>
                    <p>Kontingen: {pesilatBiru?.contingent || '-'}</p>
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
                        {renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                      </div>
                      <div className={`p-3 font-medium flex items-center justify-center border-r`}>
                        {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                      </div>
                      <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                        {renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-4 text-xl font-bold">
                  <p className="text-red-600">Total (Merah): {totalMerahDisplay}</p>
                  <p className="text-blue-600">Total (Biru): {totalBiruDisplay}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-3">
                <h3 className="text-center text-xl font-semibold text-red-600">{pesilatMerah?.name || 'PESILAT MERAH'}</h3>
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
                <h3 className="text-center text-xl font-semibold text-blue-600">{pesilatBiru?.name || 'PESILAT BIRU'}</h3>
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
          </>
        ) : (
            !isLoading && <Card className="mt-6"><CardContent className="p-6 text-center"><p>Menunggu detail pertandingan dari Dewan...</p></CardContent></Card>
        )}
      </main>
    </div>
  );
}
