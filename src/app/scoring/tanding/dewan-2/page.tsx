
"use client";

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2, Shield, Swords } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, KetuaActionLogEntry, PesilatColorIdentity } from '@/lib/types';
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

const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: 120,
};

const initialJuriData = (): JuriMatchData => ({
  merah: { round1: [], round2: [], round3: [] },
  biru: { round1: [], round2: [], round3: [] },
});

// Simple Logo Placeholder
const PlaceholderLogo = ({ className }: { className?: string }) => (
  <div className={cn("bg-red-500 w-12 h-12 md:w-16 md:h-16 flex items-center justify-center text-white font-bold text-xs md:text-sm rounded", className)}>
    LOGO
  </div>
);


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
  const [juriScores, setJuriScores] = useState<Record<string, JuriMatchData | null>>({
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
            // For overall scores, we need to implement the full calculation logic or read from a confirmed field
            // For simplicity now, let's assume Dewan 1's confirmed scores are not directly readable here or complex to recalculate.
            // This part can be enhanced later. For now, the top scores will be 0 or need a dedicated source.
            // Let's placeholder them and focus on the table scores.
            // A more robust solution would be to have Dewan 1 write confirmed scores to the matchDoc.
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
            setJuriScores(prev => ({ ...prev, [juriId]: juriDocSnap.exists() ? juriDocSnap.data() as JuriMatchData : initialJuriData() }));
          }, (err) => console.error(`[Dewan2] Error fetching scores for ${juriId}:`, err)));
        });

      } catch (err) {
        if (mounted) { console.error("[Dewan2] Error in loadData:", err); setError("Gagal memuat data pertandingan."); }
      } finally {
        if (mounted && matchDetailsLoaded) setIsLoading(false); // Only stop loading if details are actually loaded
      }
    };

    loadData(activeScheduleId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId, matchDetailsLoaded]); // matchDetailsLoaded dependency helps re-trigger loading if it failed

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

  const calculateJuriScoreForRound = (juriId: string, pesilatColor: PesilatColorIdentity, round: 1 | 2 | 3): number => {
    const juriData = juriScores[juriId];
    if (!juriData) return 0;
    const roundKey = `round${round}` as keyof RoundScores;
    const scores = juriData[pesilatColor]?.[roundKey] || [];
    return scores.reduce((sum, entry) => sum + entry.points, 0);
  };

  const calculateKetuaActionForRound = (pesilatColor: PesilatColorIdentity, actionType: 'Jatuhan' | 'Hukuman', round: 1 | 2 | 3): number => {
    let totalPoints = 0;
    ketuaActionsLog.forEach(action => {
      if (action.pesilatColor === pesilatColor && action.round === round) {
        if (actionType === 'Jatuhan' && action.actionType === 'Jatuhan') {
          totalPoints += action.points;
        } else if (actionType === 'Hukuman' && (action.actionType === 'Teguran' || action.actionType === 'Peringatan')) {
          totalPoints += action.points; // Hukuman points are already negative
        }
      }
    });
    return totalPoints;
  };
  
  const getRomanRound = (round: number): string => {
    if (round === 1) return "I";
    if (round === 2) return "II";
    if (round === 3) return "III";
    return "?";
  };

  const ScoreCell = ({ value, isLoading }: { value: number | string | null, isLoading?: boolean }) => (
    <td className="border border-black text-center p-1 md:p-2 h-10 md:h-12">
      {isLoading ? <Skeleton className="h-5 w-8 mx-auto bg-gray-400" /> : value}
    </td>
  );

  const LabelCell = ({ children }: { children: React.ReactNode }) => (
    <td className="border border-black px-2 py-1 md:px-3 md:py-2 text-left text-xs md:text-sm h-10 md:h-12">{children}</td>
  );

  const renderTableRows = (color: PesilatColorIdentity) => {
    const currentRound = timerStatus.currentRound;
    const j1Score = calculateJuriScoreForRound('juri-1', color, currentRound);
    const j2Score = calculateJuriScoreForRound('juri-2', color, currentRound);
    const j3Score = calculateJuriScoreForRound('juri-3', color, currentRound);
    const totalNilaiJuri = j1Score + j2Score + j3Score;
    const jatuhan = calculateKetuaActionForRound(color, 'Jatuhan', currentRound);
    const hukuman = calculateKetuaActionForRound(color, 'Hukuman', currentRound);

    return (
      <>
        <tr>
          <LabelCell>Juri 1</LabelCell>
          <ScoreCell value={j1Score} isLoading={isLoading} />
        </tr>
        <tr>
          <LabelCell>Juri 2</LabelCell>
          <ScoreCell value={j2Score} isLoading={isLoading} />
        </tr>
        <tr>
          <LabelCell>Juri 3</LabelCell>
          <ScoreCell value={j3Score} isLoading={isLoading} />
        </tr>
        <tr>
          <LabelCell><span className="font-semibold">Total Nilai Juri</span></LabelCell>
          <ScoreCell value={totalNilaiJuri} isLoading={isLoading} />
        </tr>
        <tr>
          <LabelCell>Jatuhan</LabelCell>
          <ScoreCell value={jatuhan} isLoading={isLoading} />
        </tr>
        <tr>
          <LabelCell>Hukuman</LabelCell>
          <ScoreCell value={hukuman} isLoading={isLoading} />
        </tr>
      </>
    );
  };
  
  const calculateRoundTotalScore = (color: PesilatColorIdentity) : number => {
    const currentRound = timerStatus.currentRound;
    const j1Score = calculateJuriScoreForRound('juri-1', color, currentRound);
    const j2Score = calculateJuriScoreForRound('juri-2', color, currentRound);
    const j3Score = calculateJuriScoreForRound('juri-3', color, currentRound);
    const totalNilaiJuri = j1Score + j2Score + j3Score; // This is raw sum, Dewan 1 "Nilai" would be confirmed
    const jatuhan = calculateKetuaActionForRound(color, 'Jatuhan', currentRound);
    const hukuman = calculateKetuaActionForRound(color, 'Hukuman', currentRound);
    return totalNilaiJuri + jatuhan + hukuman;
  }

  return (
    <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      {/* Custom Header */}
      <div className="bg-blue-700 text-white p-3 md:p-4">
        <div className="container mx-auto flex items-center justify-between">
          <PlaceholderLogo />
          <div className="text-center">
            <h1 className="text-xl md:text-3xl font-bold uppercase">
              {matchDetails?.class || (isLoading ? <Skeleton className="h-8 w-48 inline-block bg-blue-500" /> : "Detail Pertandingan")}
            </h1>
            <p className="text-sm md:text-lg">
              {matchDetails?.round || (isLoading ? <Skeleton className="h-5 w-32 inline-block mt-1 bg-blue-500" /> : "Babak")}
            </p>
          </div>
          <PlaceholderLogo className="bg-blue-500" />
        </div>
      </div>

      {/* Pesilat Info, Timer, Overall Scores */}
      <div className="container mx-auto px-2 md:px-4 py-3 md:py-6">
        <div className="grid grid-cols-3 items-center text-center mb-4 md:mb-8">
          <div className="text-left">
            {isLoading && !pesilatMerahInfo ? (
              <>
                <Skeleton className="h-5 w-32 bg-gray-300 dark:bg-gray-700" />
                <Skeleton className="h-6 w-40 mt-1 bg-gray-300 dark:bg-gray-700" />
              </>
            ) : (
              <>
                <p className="text-sm md:text-base font-semibold text-red-600">KONTINGEN {pesilatMerahInfo?.contingent.toUpperCase()}</p>
                <p className="text-lg md:text-2xl font-bold text-red-600">{pesilatMerahInfo?.name.toUpperCase()}</p>
              </>
            )}
            <p className="text-3xl md:text-5xl font-bold text-red-600 mt-1">{confirmedScoreMerah}</p>
          </div>
          
          <div className="text-4xl md:text-6xl font-mono font-bold text-gray-700 dark:text-gray-300">
            {isLoading ? <Skeleton className="h-12 w-40 mx-auto bg-gray-300 dark:bg-gray-700" /> : formatTime(timerStatus.timerSeconds)}
          </div>

          <div className="text-right">
             {isLoading && !pesilatBiruInfo ? (
              <>
                <Skeleton className="h-5 w-32 ml-auto bg-gray-300 dark:bg-gray-700" />
                <Skeleton className="h-6 w-40 mt-1 ml-auto bg-gray-300 dark:bg-gray-700" />
              </>
            ) : (
              <>
                <p className="text-sm md:text-base font-semibold text-blue-600">KONTINGEN {pesilatBiruInfo?.contingent.toUpperCase()}</p>
                <p className="text-lg md:text-2xl font-bold text-blue-600">{pesilatBiruInfo?.name.toUpperCase()}</p>
              </>
            )}
            <p className="text-3xl md:text-5xl font-bold text-blue-600 mt-1">{confirmedScoreBiru}</p>
          </div>
        </div>

        {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}

        {/* Main Score Table */}
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
              <tr>
                <td className="border border-black text-center align-middle text-xl md:text-3xl font-bold p-1 md:p-2 h-full" rowSpan={6}>
                  {isLoading ? <Skeleton className="h-10 w-10 mx-auto bg-gray-400" /> : calculateRoundTotalScore('merah')}
                </td>
                {renderTableRows('merah').props.children.slice(0,2)} 
                <td className="border border-black text-center align-middle text-3xl md:text-5xl font-bold p-1 md:p-2" rowSpan={6}>
                  {isLoading ? <Skeleton className="h-10 w-8 mx-auto bg-gray-400" /> : getRomanRound(timerStatus.currentRound)}
                </td>
                 {renderTableRows('biru').props.children.slice(0,2)}
                <td className="border border-black text-center align-middle text-xl md:text-3xl font-bold p-1 md:p-2 h-full" rowSpan={6}>
                  {isLoading ? <Skeleton className="h-10 w-10 mx-auto bg-gray-400" /> : calculateRoundTotalScore('biru')}
                </td>
              </tr>
              {/* Juri 2 through Hukuman rows */}
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={`detail-row-${i}`}>
                  {renderTableRows('merah').props.children.slice(2 + i*2, 4 + i*2)}
                  {renderTableRows('biru').props.children.slice(2 + i*2, 4 + i*2)}
                </tr>
              ))}
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

