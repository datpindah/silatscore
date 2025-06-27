
"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Shield, Swords, AlertTriangle } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, KetuaActionLogEntry, PesilatColorIdentity, JuriMatchData as LibJuriMatchData, RoundScores as LibRoundScoresType, ScoreEntry as LibScoreEntryType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption, TableFooter } from "@/components/ui/table";


const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const JURI_SCORES_SUBCOLLECTION = 'juri_scores';
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;
const JURI_INPUT_VALIDITY_WINDOW_MS = 2000;

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

interface JuriMatchDataForPage extends LibJuriMatchData {}
interface RoundScoresForPage extends LibRoundScoresType {}
interface ScoreEntryForPage extends LibScoreEntryType {}

interface CombinedScoreEntry extends ScoreEntryForPage {
  juriId: string;
  key: string;
  round: keyof LibRoundScoresType;
  color: 'merah' | 'biru';
}

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


// Calculates SUM of scores for a juri, color, and round. Used for "Total Nilai Juri" row.
const calculateJuriScoreForRound = (
    juriId: typeof JURI_IDS[number],
    pesilatColor: PesilatColorIdentity,
    round: 1 | 2 | 3,
    currentJuriScoresData: Record<string, JuriMatchDataForPage | null>
): number => {
  const juriData = currentJuriScoresData[juriId];
  if (!juriData) return 0;
  const roundKey = `round${round}` as keyof RoundScoresForPage;
  const scoresForColor = juriData[pesilatColor];
  if (!scoresForColor) return 0;
  const scores = scoresForColor[roundKey];
  return scores ? scores.reduce((sum, entry) => sum + entry.points, 0) : 0;
};

// Gets INDIVIDUAL score points as an array for a juri, color, and round.
const getJuriIndividualPointsArrayForRound = (
    juriId: typeof JURI_IDS[number],
    pesilatColor: PesilatColorIdentity,
    round: 1 | 2 | 3,
    currentJuriScoresData: Record<string, JuriMatchDataForPage | null>
): string => { // Returns string for display
  const juriData = currentJuriScoresData[juriId];
  if (!juriData) return '0';
  const roundKey = `round${round}` as keyof RoundScoresForPage;
  const scoresForColor = juriData[pesilatColor];
  if (!scoresForColor) return '0';
  const scoresInRound = scoresForColor[roundKey];
  return scoresInRound && scoresInRound.length > 0 ? scoresInRound.map(entry => entry.points).join(', ') : '0';
};

// Calculates SUM of points from Ketua for a specific action category (Jatuhan/Hukuman).
const calculateKetuaActionSumForRound = (
    pesilatColor: PesilatColorIdentity,
    actionCategory: 'Jatuhan' | 'Hukuman',
    round: 1 | 2 | 3,
    currentKetuaActionsLog: KetuaActionLogEntry[]
): number => {
  let totalPoints = 0;
  currentKetuaActionsLog.forEach(action => {
    if (action.pesilatColor === pesilatColor && action.round === round) {
      if (actionCategory === 'Jatuhan' && action.actionType === 'Jatuhan') {
        totalPoints += action.points;
      } else if (actionCategory === 'Hukuman' && (action.actionType === 'Teguran' || action.actionType === 'Peringatan')) {
        totalPoints += action.points; // Hukuman points are typically negative
      }
    }
  });
  return totalPoints;
};

// Gets INDIVIDUAL points from Ketua for a specific action category (Jatuhan/Hukuman).
const getKetuaIndividualActionPointsArrayForRound = (
    pesilatColor: PesilatColorIdentity,
    actionCategory: 'Jatuhan' | 'Hukuman',
    round: 1 | 2 | 3,
    currentKetuaActionsLog: KetuaActionLogEntry[]
): string => { // Returns string for display
  const points = currentKetuaActionsLog
    .filter(action => {
      if (action.pesilatColor !== pesilatColor || action.round !== round) return false;
      if (actionCategory === 'Jatuhan') return action.actionType === 'Jatuhan';
      if (actionCategory === 'Hukuman') return action.actionType === 'Teguran' || action.actionType === 'Peringatan';
      return false;
    })
    .map(action => action.points);
  return points.length > 0 ? points.join(', ') : '0';
};


const calculateRoundTotalScore = (
    color: PesilatColorIdentity,
    currentRoundNum: 1 | 2 | 3,
    currentJuriScoresData: Record<string, JuriMatchDataForPage | null>,
    currentKetuaActionsLog: KetuaActionLogEntry[]
) : number => {
  const totalNilaiJuri = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, color, currentRoundNum, currentJuriScoresData),0);
  const jatuhan = calculateKetuaActionSumForRound(color, 'Jatuhan', currentRoundNum, currentKetuaActionsLog);
  const hukuman = calculateKetuaActionSumForRound(color, 'Hukuman', currentRoundNum, currentKetuaActionsLog);
  return totalNilaiJuri + jatuhan + hukuman;
}


function DewanDuaPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  const [prevSavedUnstruckKeysFromDewan, setPrevSavedUnstruckKeysFromDewan] = useState<Set<string>>(new Set());

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
    setPrevSavedUnstruckKeysFromDewan(new Set());
    setKetuaActionsLog([]);
    setJuriScores({ 'juri-1': null, 'juri-2': null, 'juri-3': null });
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
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
      if (!newDbConfigId) {
         setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
      }
    }, (err) => {
      console.error("[Dewan2] Error fetching active matches by gelanggang map:", err);
      setError("Gagal memuat peta jadwal aktif per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);


  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetMatchDisplayData(); setActiveScheduleId(null); }
      setIsLoading(false); return;
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
            setPrevSavedUnstruckKeysFromDewan(new Set(data?.confirmed_unstruck_keys_log as string[] || []));
          } else {
            setTimerStatus(initialTimerStatus);
            setPrevSavedUnstruckKeysFromDewan(new Set());
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
  }, [activeScheduleId, matchDetailsLoaded, resetMatchDisplayData]);

 useEffect(() => {
    if (!activeScheduleId || Object.values(juriScores).every(data => data === null) && prevSavedUnstruckKeysFromDewan.size === 0) {
        let calculatedTotalMerah = 0;
        let calculatedTotalBiru = 0;
        ketuaActionsLog.forEach(action => {
            if (action.pesilatColor === 'merah') calculatedTotalMerah += action.points;
            else if (action.pesilatColor === 'biru') calculatedTotalBiru += action.points;
        });
        setConfirmedScoreMerah(calculatedTotalMerah);
        setConfirmedScoreBiru(calculatedTotalBiru);
        return;
    }

    const allRawEntries: CombinedScoreEntry[] = [];
    JURI_IDS.forEach(juriId => {
        const juriSpecificMatchData = juriScores[juriId];
        if (juriSpecificMatchData) {
            (['merah', 'biru'] as const).forEach(pesilatColor => {
                const pesilatColorScores = juriSpecificMatchData[pesilatColor];
                if (pesilatColorScores) {
                    (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
                        const roundScoresArray = pesilatColorScores[roundKey];
                        if (roundScoresArray) {
                            roundScoresArray.forEach(entry => {
                                if (entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
                                    const entryKey = `${juriId}_${entry.timestamp.toMillis()}_${entry.points}`;
                                    allRawEntries.push({
                                        ...entry,
                                        juriId: juriId,
                                        key: entryKey,
                                        round: roundKey,
                                        color: pesilatColor
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
    });
    
    const confirmedUnstruckEntries = allRawEntries.filter(e => prevSavedUnstruckKeysFromDewan.has(e.key));
    
    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const scoredPairKeys = new Set<string>();

    for (let i = 0; i < confirmedUnstruckEntries.length; i++) {
        const e1 = confirmedUnstruckEntries[i];
        if (scoredPairKeys.has(e1.key)) continue;

        const agreeingPartners = [e1];
        for (let j = i + 1; j < confirmedUnstruckEntries.length; j++) {
            const e2 = confirmedUnstruckEntries[j];
            if (scoredPairKeys.has(e2.key)) continue;

            if (e1.juriId !== e2.juriId &&
                e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                agreeingPartners.push(e2);
            }
        }

        if (agreeingPartners.length >= 2) {
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;
            agreeingPartners.forEach(p => scoredPairKeys.add(p.key));
        }
    }

    ketuaActionsLog.forEach(action => {
        if (action.pesilatColor === 'merah') calculatedTotalMerah += action.points;
        else if (action.pesilatColor === 'biru') calculatedTotalBiru += action.points;
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);

  }, [juriScores, ketuaActionsLog, activeScheduleId, prevSavedUnstruckKeysFromDewan]);


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

  const tableRowDefinitions = [
    { type: 'Juri 1', juriId: 'juri-1' as const },
    { type: 'Juri 2', juriId: 'juri-2' as const },
    { type: 'Juri 3', juriId: 'juri-3' as const },
    { type: 'Total Nilai Juri' },
    { type: 'Jatuhan' },
    { type: 'Hukuman' },
  ];

  if (!gelanggangName && !isLoading) {
    return (
        <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-foreground">
            <Header overrideBackgroundClass="bg-blue-100 dark:bg-gray-900" />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data pertandingan.</p>
                <Button asChild className="mt-6">
                    <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  if (isLoading && (!activeScheduleId || !matchDetailsLoaded)) {
    return (
        <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-foreground">
            <Header overrideBackgroundClass="bg-blue-100 dark:bg-gray-900" />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">
                  {configMatchId === undefined ? `Memuat konfigurasi untuk Gelanggang: ${gelanggangName || '...'}` : 
                   !activeScheduleId && configMatchId === null ? `Tidak ada jadwal aktif untuk Gelanggang: ${gelanggangName || '...'}` :
                   `Memuat data pertandingan untuk Gelanggang: ${gelanggangName || '...'}`}
                </p>
                {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
            </main>
        </div>
    );
  }
  
  if (!activeScheduleId && !isLoading && configMatchId === null) { 
    return (
      <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-foreground">
        <Header overrideBackgroundClass="bg-blue-100 dark:bg-gray-900" />
        <main className="flex-1 container mx-auto px-4 py-8">
           <Card className="mt-6 shadow-lg">
            <CardHeader><CardTitle className="text-xl font-headline text-center text-primary">Dewan Juri 2 - Skor Detail</CardTitle></CardHeader>
            <CardContent className="p-6 text-center">
                <p className="mb-4 text-muted-foreground">{error || `Tidak ada pertandingan yang aktif untuk Gelanggang: ${gelanggangName}.`}</p>
                <Button variant="outline" asChild>
                  <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login
                  </Link>
                </Button>
            </CardContent>
           </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-foreground">
      <Header overrideBackgroundClass="bg-blue-100 dark:bg-gray-900" />
      
      <main className="container mx-auto px-2 md:px-4 py-3 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-b from-blue-600 to-blue-800 text-white">
          <CardHeader className="pb-2 pt-3 px-3 md:pb-3 md:pt-4 md:px-4">
            <CardTitle className="text-xl md:text-2xl font-bold font-headline text-center">
              DEWAN JURI 2 - SKOR DETAIL (GEL: {gelanggangName || <Skeleton className="h-6 w-10 inline-block bg-blue-400" />})
            </CardTitle>
             {matchDetails && (
              <CardDescription className="text-xs md:text-sm text-blue-200 text-center">
                Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
              </CardDescription>
            )}
             {isLoading && !matchDetailsLoaded && activeScheduleId && (
              <div className="text-xs md:text-sm text-blue-200 text-center">
                <Skeleton className="h-4 w-16 inline-block bg-blue-400" /> | <Skeleton className="h-4 w-12 inline-block bg-blue-400" /> | <Skeleton className="h-4 w-20 inline-block bg-blue-400" />
              </div>
            )}
            {error && !isLoading && !matchDetailsLoaded && (
              <CardDescription className="text-xs md:text-sm text-yellow-300 mt-1 text-center">
                Gagal memuat detail pertandingan. {error}
              </CardDescription>
            )}
          </CardHeader>
        </Card>

        <div className="grid grid-cols-3 items-start text-center mb-4 md:mb-6">
          <div className="text-left">
            <div className="text-sm md:text-base font-semibold text-red-600 dark:text-red-400">KONTINGEN {pesilatMerahInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 bg-muted" /> : '-')}</div>
            <div className="text-lg md:text-2xl font-bold text-red-600 dark:text-red-400">{pesilatMerahInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 bg-muted" /> : 'PESILAT MERAH')}</div>
            <div className="mt-2 flex justify-start">
              <div className="bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 rounded-lg shadow-md w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
                {isLoading ? <Skeleton className="h-12 w-10 bg-gray-300 dark:bg-gray-600" /> : <span className="text-5xl md:text-6xl font-bold">{confirmedScoreMerah}</span>}
              </div>
            </div>
          </div>

          <div className="text-4xl md:text-6xl font-mono font-bold text-gray-700 dark:text-gray-300 pt-8">
            {isLoading ? <Skeleton className="h-12 w-40 mx-auto bg-muted" /> : formatTime(timerStatus.timerSeconds)}
          </div>

          <div className="text-right">
             <div className="text-sm md:text-base font-semibold text-blue-600 dark:text-blue-400">KONTINGEN {pesilatBiruInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 ml-auto bg-muted" /> : '-')}</div>
             <div className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400">{pesilatBiruInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 ml-auto bg-muted" /> : 'PESILAT BIRU')}</div>
            <div className="mt-2 flex justify-end">
              <div className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-lg shadow-md w-24 h-24 md:w-32 md:h-32 flex items-center justify-center">
                 {isLoading ? <Skeleton className="h-12 w-10 bg-gray-300 dark:bg-gray-600" /> : <span className="text-5xl md:text-6xl font-bold">{confirmedScoreBiru}</span>}
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md mb-4 dark:bg-red-900/30 dark:text-red-400">{error}</p>}

        <Card>
          <CardContent className="p-0 md:p-2">
            <Table>
              <TableCaption>Detail Skor Babak Saat Ini: {getRomanRound(timerStatus.currentRound)}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%] text-sm md:text-base px-2 py-2 md:px-3 md:py-3 text-red-700 dark:text-red-400">Merah - Detail Poin</TableHead>
                  <TableHead className="w-[10%] text-center text-sm md:text-base px-1 py-2 md:px-2 md:py-3 text-red-700 dark:text-red-400">Nilai</TableHead>
                  <TableHead className="w-[10%] text-center text-sm md:text-base px-1 py-2 md:px-2 md:py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100">Babak</TableHead>
                  <TableHead className="w-[35%] text-sm md:text-base px-2 py-2 md:px-3 md:py-3 text-blue-700 dark:text-blue-400">Biru - Detail Poin</TableHead>
                  <TableHead className="w-[10%] text-center text-sm md:text-base px-1 py-2 md:px-2 md:py-3 text-blue-700 dark:text-blue-400">Nilai</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRowDefinitions.map((rowData, index) => {
                  const currentRoundForCalc = timerStatus.currentRound;
                  let merahLabelText: React.ReactNode = rowData.type;
                  let biruLabelText: React.ReactNode = rowData.type;
                  
                  let merahDisplayValue: string | number;
                  let biruDisplayValue: string | number;
                  const showLoadingSkeleton = isLoading || !matchDetailsLoaded;

                  if (rowData.juriId) {
                    merahDisplayValue = getJuriIndividualPointsArrayForRound(rowData.juriId, 'merah', currentRoundForCalc, juriScores);
                    biruDisplayValue = getJuriIndividualPointsArrayForRound(rowData.juriId, 'biru', currentRoundForCalc, juriScores);
                  } else if (rowData.type === 'Total Nilai Juri') {
                    merahLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                    biruLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                    merahDisplayValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'merah', currentRoundForCalc, juriScores), 0);
                    biruDisplayValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'biru', currentRoundForCalc, juriScores), 0);
                  } else if (rowData.type === 'Jatuhan') {
                    merahDisplayValue = getKetuaIndividualActionPointsArrayForRound('merah', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                    biruDisplayValue = getKetuaIndividualActionPointsArrayForRound('biru', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                  } else { // Hukuman
                    merahDisplayValue = getKetuaIndividualActionPointsArrayForRound('merah', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                    biruDisplayValue = getKetuaIndividualActionPointsArrayForRound('biru', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                  }

                  return (
                    <TableRow key={rowData.type} className={cn("border-b border-gray-200 dark:border-gray-700", index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-800/50")}>
                      <TableCell className="px-2 py-2.5 md:px-3 md:py-3 text-xs md:text-sm align-top text-gray-700 dark:text-gray-300">{merahLabelText}</TableCell>
                      <TableCell className="text-center px-1 py-2.5 md:px-2 md:py-3 text-xs md:text-sm align-middle text-gray-800 dark:text-gray-100">
                        {showLoadingSkeleton ? <Skeleton className="h-5 w-8 mx-auto bg-muted" /> : merahDisplayValue}
                      </TableCell>
                      {index === 0 && (
                        <TableCell rowSpan={tableRowDefinitions.length} className="text-center align-middle font-bold text-xl md:text-3xl text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-700/50 border-x border-gray-300 dark:border-gray-600">
                          {showLoadingSkeleton ? <Skeleton className="h-8 w-8 mx-auto bg-muted" /> : getRomanRound(timerStatus.currentRound)}
                        </TableCell>
                      )}
                      <TableCell className="px-2 py-2.5 md:px-3 md:py-3 text-xs md:text-sm align-top text-gray-700 dark:text-gray-300">{biruLabelText}</TableCell>
                      <TableCell className="text-center px-1 py-2.5 md:px-2 md:py-3 text-xs md:text-sm align-middle text-gray-800 dark:text-gray-100">
                        {showLoadingSkeleton ? <Skeleton className="h-5 w-8 mx-auto bg-muted" /> : biruDisplayValue}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-gray-200 dark:bg-gray-700 font-bold">
                  <TableCell className="px-2 py-2.5 md:px-3 md:py-3 text-xs md:text-sm text-red-700 dark:text-red-400">TOTAL SKOR BABAK (MERAH)</TableCell>
                  <TableCell className="text-center px-1 py-2.5 md:px-2 md:py-3 text-xs md:text-sm text-red-700 dark:text-red-400">
                    {isLoading ? <Skeleton className="h-5 w-10 mx-auto bg-muted" /> : calculateRoundTotalScore('merah', timerStatus.currentRound, juriScores, ketuaActionsLog)}
                  </TableCell>
                  <TableCell className="text-center"></TableCell> 
                  <TableCell className="px-2 py-2.5 md:px-3 md:py-3 text-xs md:text-sm text-blue-700 dark:text-blue-400">TOTAL SKOR BABAK (BIRU)</TableCell>
                  <TableCell className="text-center px-1 py-2.5 md:px-2 md:py-3 text-xs md:text-sm text-blue-700 dark:text-blue-400">
                    {isLoading ? <Skeleton className="h-5 w-10 mx-auto bg-muted" /> : calculateRoundTotalScore('biru', timerStatus.currentRound, juriScores, ketuaActionsLog)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
         <div className="mt-8 text-center">
            <Button variant="outline" asChild className="bg-card hover:bg-muted text-card-foreground">
                <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link>
            </Button>
        </div>
      </main>
    </div>
  );
}

export default function DewanDuaPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900">
         <Header overrideBackgroundClass="bg-blue-100 dark:bg-gray-900" />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat halaman Dewan 2...</p>
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
  return <DewanDuaPageComponent gelanggangName={gelanggangName} />;
}
    

    







