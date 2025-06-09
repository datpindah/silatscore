
"use client";

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Shield, Swords } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, KetuaActionLogEntry, PesilatColorIdentity, JuriMatchData as LibJuriMatchData, RoundScores as LibRoundScoresType, KetuaActionType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const JURI_SCORES_SUBCOLLECTION = 'juri_scores';
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

// Renaming to avoid conflict with lib type if it was also named JuriMatchData
interface JuriMatchDataForPage extends LibJuriMatchData {}
interface RoundScoresForPage extends LibRoundScoresType {}


const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: 120,
};

const initialJuriData = (): JuriMatchDataForPage => ({
  merah: { round1: [], round2: [], round3: [] },
  biru: { round1: [], round2: [], round3: [] },
});

// Simple Logo Placeholder
const PlaceholderLogo = ({ className }: { className?: string }) => (
  <div className={cn("bg-red-500 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center text-white font-bold text-xs md:text-sm rounded", className)}>
    LOGO
  </div>
);

const calculateJuriScoreForRound = (
    juriId: string,
    pesilatColor: PesilatColorIdentity,
    round: 1 | 2 | 3,
    currentJuriScoresData: Record<string, JuriMatchDataForPage | null>
): number => {
  const juriData = currentJuriScoresData[juriId];
  if (!juriData) return 0;
  const roundKey = `round${round}` as keyof RoundScoresForPage;
  const scores = juriData[pesilatColor]?.[roundKey] || [];
  return scores.reduce((sum, entry) => sum + entry.points, 0);
};

const calculateKetuaActionForRound = (
    pesilatColor: PesilatColorIdentity,
    actionType: 'Jatuhan' | 'Hukuman',
    round: 1 | 2 | 3,
    currentKetuaActionsLog: KetuaActionLogEntry[]
): number => {
  let totalPoints = 0;
  currentKetuaActionsLog.forEach(action => {
    if (action.pesilatColor === pesilatColor && action.round === round) {
      if (actionType === 'Jatuhan' && action.actionType === 'Jatuhan') {
        totalPoints += action.points;
      } else if (actionType === 'Hukuman' && (action.actionType === 'Teguran' || action.actionType === 'Peringatan')) {
        totalPoints += action.points;
      }
    }
  });
  return totalPoints;
};

const calculateRoundTotalScore = (
    color: PesilatColorIdentity,
    currentRoundNum: 1 | 2 | 3,
    currentJuriScoresData: Record<string, JuriMatchDataForPage | null>,
    currentKetuaActionsLog: KetuaActionLogEntry[]
) : number => {
  const j1Score = calculateJuriScoreForRound('juri-1', color, currentRoundNum, currentJuriScoresData);
  const j2Score = calculateJuriScoreForRound('juri-2', color, currentRoundNum, currentJuriScoresData);
  const j3Score = calculateJuriScoreForRound('juri-3', color, currentRoundNum, currentJuriScoresData);
  const totalNilaiJuri = j1Score + j2Score + j3Score;
  const jatuhan = calculateKetuaActionForRound(color, 'Jatuhan', currentRoundNum, currentKetuaActionsLog);
  const hukuman = calculateKetuaActionForRound(color, 'Hukuman', currentRoundNum, currentKetuaActionsLog);
  return totalNilaiJuri + jatuhan + hukuman;
}


export default function DewanDuaPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0); // Overall confirmed score
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);   // Overall confirmed score

  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);
  const [juriScores, setJuriScores] = useState<Record<string, JuriMatchDataForPage | null>>({
    'juri-1': initialJuriData(),
    'juri-2': initialJuriData(),
    'juri-3': initialJuriData(),
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const resetMatchDisplayData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setTimerStatus(initialTimerStatus);
    setConfirmedScoreMerah(0);
    setConfirmedScoreBiru(0);
    setKetuaActionsLog([]);
    setJuriScores({ 'juri-1': null, 'juri-2': null, 'juri-3': null });
    setError(null);
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error("[Dewan2] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetMatchDisplayData(); setActiveScheduleId(null); }
      setIsLoading(false); setError("Tidak ada jadwal pertandingan yang aktif."); return;
    }
    if (configMatchId !== activeScheduleId) {
      resetMatchDisplayData();
      setActiveScheduleId(configMatchId);
    }
  }, [configMatchId, activeScheduleId, resetMatchDisplayData]);

  useEffect(() => {
    if (!activeScheduleId) {
      setIsLoading(false);
      if (!error?.includes("konfigurasi")) setError(null);
      return;
    }

    setIsLoading(true);
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal ID ${currentMatchId} tidak ditemukan.`);
          resetMatchDisplayData();
          setIsLoading(false);
          return;
        }

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        unsubscribers.push(onSnapshot(matchDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) setTimerStatus(data.timer_status as TimerStatus);
            // Read confirmed scores from Dewan 1 (or calculate if necessary, but Dewan 1 is source of truth)
            // For now, this assumes Dewan 1 writes the confirmed scores to matchDoc.
            // If not, this part needs to mirror Dewan 1's score calculation logic.
            // setConfirmedScoreMerah(data?.confirmed_score_merah || 0);
            // setConfirmedScoreBiru(data?.confirmed_score_biru || 0);
          } else {
            setTimerStatus(initialTimerStatus);
            setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
          }
        }, (err) => console.error("[Dewan2] Error fetching match document (timer/scores):", err)));

        unsubscribers.push(onSnapshot(query(collection(matchDocRef, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc")), (snap) => {
          if (!mounted) return;
          setKetuaActionsLog(snap.docs.map(d => ({ id: d.id, ...d.data() } as KetuaActionLogEntry)));
        }, (err) => console.error("[Dewan2] Error fetching official actions:", err)));

        JURI_IDS.forEach(juriId => {
          unsubscribers.push(onSnapshot(doc(matchDocRef, JURI_SCORES_SUBCOLLECTION, juriId), (juriDocSnap) => {
            if (!mounted) return;
            setJuriScores(prev => ({ ...prev, [juriId]: juriDocSnap.exists() ? juriDocSnap.data() as JuriMatchDataForPage : initialJuriData() }));
          }, (err) => console.error(`[Dewan2] Error fetching scores for ${juriId}:`, err)));
        });

      } catch (err) {
        if (mounted) { console.error("[Dewan2] Error in loadData:", err); setError("Gagal memuat data pertandingan."); }
      } finally {
        if (mounted && matchDetailsLoaded) setIsLoading(false); 
      }
    };

    loadData(activeScheduleId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId, matchDetailsLoaded]); 

 useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeScheduleId === null)) {
        setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeScheduleId]);


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const getRomanRound = (round: number): string => {
    if (round === 1) return "I";
    if (round === 2) return "II";
    if (round === 3) return "III";
    return "?";
  };

  const ScoreCell = ({ value, isLoadingValue }: { value: number | string | null, isLoadingValue?: boolean }) => (
    <td className="border border-black text-center p-1 md:p-2 h-10 md:h-12">
      {isLoadingValue ? <Skeleton className="h-5 w-8 mx-auto bg-gray-400" /> : value}
    </td>
  );

  const LabelCell = ({ children }: { children: React.ReactNode }) => (
    <td className="border border-black px-2 py-1 md:px-3 md:py-2 text-left text-xs md:text-sm h-10 md:h-12">{children}</td>
  );

  const tableRowDefinitions = [
    { type: 'Juri 1', juriId: 'juri-1' as const },
    { type: 'Juri 2', juriId: 'juri-2' as const },
    { type: 'Juri 3', juriId: 'juri-3' as const },
    { type: 'Total Nilai Juri' },
    { type: 'Jatuhan' },
    { type: 'Hukuman' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <div className="bg-blue-700 text-white p-3 md:p-4">
        <div className="container mx-auto flex items-center justify-between">
          <PlaceholderLogo />
          <div className="text-center">
            <h1 className="text-xl md:text-3xl font-bold uppercase">
              {matchDetails?.class || (isLoading ? <Skeleton className="h-8 w-48 inline-block bg-blue-500" /> : "Detail Pertandingan")}
            </h1>
            <div className="text-sm md:text-lg">
              {matchDetails?.round || (isLoading ? <Skeleton className="h-5 w-32 inline-block mt-1 bg-blue-500" /> : "Babak")}
            </div>
          </div>
          <PlaceholderLogo className="bg-blue-500" />
        </div>
      </div>

      <div className="container mx-auto px-2 md:px-4 py-3 md:py-6">
        <div className="grid grid-cols-3 items-center text-center mb-4 md:mb-8">
          <div className="text-left">
            <div className="text-sm md:text-base font-semibold text-red-600">KONTINGEN {pesilatMerahInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 bg-gray-300 dark:bg-gray-700" /> : '-')}</div>
            <div className="text-lg md:text-2xl font-bold text-red-600">{pesilatMerahInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 bg-gray-300 dark:bg-gray-700" /> : 'PESILAT MERAH')}</div>
            <p className="text-3xl md:text-5xl font-bold text-red-600 mt-1">{confirmedScoreMerah}</p>
          </div>
          
          <div className="text-4xl md:text-6xl font-mono font-bold text-gray-700 dark:text-gray-300">
            {isLoading ? <Skeleton className="h-12 w-40 mx-auto bg-gray-300 dark:bg-gray-700" /> : formatTime(timerStatus.timerSeconds)}
          </div>

          <div className="text-right">
             <div className="text-sm md:text-base font-semibold text-blue-600">KONTINGEN {pesilatBiruInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 ml-auto bg-gray-300 dark:bg-gray-700" /> : '-')}</div>
             <div className="text-lg md:text-2xl font-bold text-blue-600">{pesilatBiruInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 ml-auto bg-gray-300 dark:bg-gray-700" /> : 'PESILAT BIRU')}</div>
            <p className="text-3xl md:text-5xl font-bold text-blue-600 mt-1">{confirmedScoreBiru}</p>
          </div>
        </div>

        {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}

        <div className="overflow-x-auto shadow-lg rounded-md">
          <table className="w-full border-collapse border border-black bg-white dark:bg-gray-800">
            <thead>
              <tr>
                <th className="bg-red-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">TOTAL</th>
                <th className="bg-red-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm" colSpan={2}>MERAH - DETAIL POIN</th>
                <th className="bg-gray-700 text-white text-center p-1 md:p-2 border border-black align-middle text-xs md:text-sm row-span-2">BABAK</th>
                <th className="bg-blue-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm" colSpan={2}>BIRU - DETAIL POIN</th>
                <th className="bg-blue-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">TOTAL</th>
              </tr>
              <tr>
                <th className="bg-red-400 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">Skor Babak Ini</th>
                <th className="bg-red-400 text-white text-left px-2 py-1 md:px-3 md:py-2 border border-black text-xs md:text-sm">Sumber</th>
                <th className="bg-red-400 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">Nilai</th>
                <th className="bg-blue-400 text-white text-left px-2 py-1 md:px-3 md:py-2 border border-black text-xs md:text-sm">Sumber</th>
                <th className="bg-blue-400 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">Nilai</th>
                <th className="bg-blue-400 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm">Skor Babak Ini</th>
              </tr>
            </thead>
            <tbody>
              {tableRowDefinitions.map((rowData, index) => {
                const currentRoundForCalc = timerStatus.currentRound;
                let merahLabelText: React.ReactNode = rowData.type;
                let biruLabelText: React.ReactNode = rowData.type;
                let merahScoreValue: number;
                let biruScoreValue: number;

                if (rowData.juriId) {
                  merahScoreValue = calculateJuriScoreForRound(rowData.juriId, 'merah', currentRoundForCalc, juriScores);
                  biruScoreValue = calculateJuriScoreForRound(rowData.juriId, 'biru', currentRoundForCalc, juriScores);
                } else if (rowData.type === 'Total Nilai Juri') {
                  merahLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                  biruLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                  merahScoreValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'merah', currentRoundForCalc, juriScores), 0);
                  biruScoreValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'biru', currentRoundForCalc, juriScores), 0);
                } else if (rowData.type === 'Jatuhan') {
                  merahScoreValue = calculateKetuaActionForRound('merah', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                  biruScoreValue = calculateKetuaActionForRound('biru', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                } else { // Hukuman
                  merahScoreValue = calculateKetuaActionForRound('merah', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                  biruScoreValue = calculateKetuaActionForRound('biru', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                }
                
                const showLoadingSkeleton = isLoading || !matchDetailsLoaded;

                return (
                  <tr key={rowData.type}>
                    {index === 0 && (
                      <td className="border border-black text-center align-middle text-xl md:text-3xl font-bold p-1 md:p-2 h-full" rowSpan={tableRowDefinitions.length}>
                        {showLoadingSkeleton ? <Skeleton className="h-10 w-10 mx-auto bg-gray-400" /> : calculateRoundTotalScore('merah', currentRoundForCalc, juriScores, ketuaActionsLog)}
                      </td>
                    )}
                    <LabelCell>{merahLabelText}</LabelCell>
                    <ScoreCell value={merahScoreValue} isLoadingValue={showLoadingSkeleton} />
                    {index === 0 && (
                      <td className="border border-black text-center align-middle text-3xl md:text-5xl font-bold p-1 md:p-2" rowSpan={tableRowDefinitions.length}>
                        {showLoadingSkeleton ? <Skeleton className="h-10 w-8 mx-auto bg-gray-400" /> : getRomanRound(timerStatus.currentRound)}
                      </td>
                    )}
                    <LabelCell>{biruLabelText}</LabelCell>
                    <ScoreCell value={biruScoreValue} isLoadingValue={showLoadingSkeleton} />
                    {index === 0 && (
                      <td className="border border-black text-center align-middle text-xl md:text-3xl font-bold p-1 md:p-2 h-full" rowSpan={tableRowDefinitions.length}>
                        {showLoadingSkeleton ? <Skeleton className="h-10 w-10 mx-auto bg-gray-400" /> : calculateRoundTotalScore('biru', currentRoundForCalc, juriScores, ketuaActionsLog)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
         <div className="mt-8 text-center">
            <Button variant="outline" asChild className="bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200">
                <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link>
            </Button>
        </div>
      </div>
    </div>
  );
}

    