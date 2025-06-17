
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
): number[] => {
  const juriData = currentJuriScoresData[juriId];
  if (!juriData) return [];
  const roundKey = `round${round}` as keyof RoundScoresForPage;
  const scoresForColor = juriData[pesilatColor];
  if (!scoresForColor) return [];
  const scoresInRound = scoresForColor[roundKey];
  return scoresInRound ? scoresInRound.map(entry => entry.points) : [];
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
): number[] => {
  return currentKetuaActionsLog
    .filter(action => {
      if (action.pesilatColor !== pesilatColor || action.round !== round) return false;
      if (actionCategory === 'Jatuhan') return action.actionType === 'Jatuhan';
      if (actionCategory === 'Hukuman') return action.actionType === 'Teguran' || action.actionType === 'Peringatan';
      return false;
    })
    .map(action => action.points);
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

  const ScoreCell = ({ value, isLoadingValue }: { value: string | number | null, isLoadingValue?: boolean }) => (
    <td className="border border-black text-center p-1 md:p-2 h-10 md:h-12">
      {isLoadingValue ? <Skeleton className="h-5 w-8 mx-auto bg-gray-400" /> : (value === null || value === undefined ? '-' : String(value))}
    </td>
  );

  const LabelCell = ({ children }: { children: React.ReactNode }) => (
    <td className="border border-black px-2 py-1 md:px-3 md:py-2 text-left text-xs md:text-sm h-10 md:h-12 align-top">{children}</td>
  );

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
        <div className="flex flex-col min-h-screen">
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                <h1 className="text-xl font-semibold text-destructive">Gelanggang Diperlukan</h1>
                <p className="text-muted-foreground mt-2">Parameter 'gelanggang' tidak ditemukan di URL. Halaman ini tidak dapat memuat data pertandingan tanpa nama gelanggang.</p>
                <Button asChild className="mt-6">
                    <Link href={`/login?redirect=/scoring/tanding/dewan-2`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Halaman Login</Link>
                </Button>
            </main>
        </div>
    );
  }

  if (isLoading && (!activeScheduleId || !matchDetailsLoaded)) {
    return (
        <div className="flex flex-col min-h-screen">
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
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 container mx-auto px-4 py-8">
           <div className="mt-6 shadow-lg bg-card text-card-foreground rounded-lg">
            <div className="p-6 text-center">
                <p className="mb-4 text-muted-foreground">{error || `Tidak ada pertandingan yang aktif untuk Gelanggang: ${gelanggangName}.`}</p>
                <Button variant="outline" asChild>
                  <Link href={`/login?redirect=/scoring/tanding/dewan-2${gelanggangName ? `&gelanggang=${encodeURIComponent(gelanggangName)}` : ''}`}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login
                  </Link>
                </Button>
            </div>
           </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-blue-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <div className="bg-blue-700 text-white p-3 md:p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Swords className="h-8 w-8 md:h-10 md:w-10" />
          <div className="text-center">
            <h1 className="text-xl md:text-3xl font-bold uppercase">
              {matchDetails?.class || (isLoading ? <Skeleton className="h-8 w-48 inline-block bg-blue-500" /> : "Detail Pertandingan")}
            </h1>
            <div className="text-sm md:text-lg">
              {matchDetails?.round || (isLoading ? <Skeleton className="h-5 w-32 inline-block mt-1 bg-blue-500" /> : "Babak")}
              {' - '} Gelanggang: {gelanggangName || (isLoading ? <Skeleton className="h-5 w-20 inline-block mt-1 bg-blue-500" /> : 'N/A')}
            </div>
          </div>
          <Shield className="h-8 w-8 md:h-10 md:w-10" />
        </div>
      </div>

      <div className="container mx-auto px-2 md:px-4 py-3 md:py-6">
        <div className="grid grid-cols-3 items-center text-center mb-4 md:mb-8">
          <div className="text-left">
            <div className="text-sm md:text-base font-semibold text-red-600">KONTINGEN {pesilatMerahInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 bg-gray-300 dark:bg-gray-700" /> : '-')}</div>
            <div className="text-lg md:text-2xl font-bold text-red-600">{pesilatMerahInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 bg-gray-300 dark:bg-gray-700" /> : 'PESILAT MERAH')}</div>
            <div className="text-3xl md:text-5xl font-bold text-red-600 mt-1">{isLoading ? <Skeleton className="h-10 w-10 bg-gray-300 dark:bg-gray-700"/> : confirmedScoreMerah}</div>
          </div>

          <div className="text-4xl md:text-6xl font-mono font-bold text-gray-700 dark:text-gray-300">
            {isLoading ? <Skeleton className="h-12 w-40 mx-auto bg-gray-300 dark:bg-gray-700" /> : formatTime(timerStatus.timerSeconds)}
          </div>

          <div className="text-right">
             <div className="text-sm md:text-base font-semibold text-blue-600">KONTINGEN {pesilatBiruInfo?.contingent.toUpperCase() || (isLoading ? <Skeleton className="h-5 w-24 ml-auto bg-gray-300 dark:bg-gray-700" /> : '-')}</div>
             <div className="text-lg md:text-2xl font-bold text-blue-600">{pesilatBiruInfo?.name.toUpperCase() || (isLoading ? <Skeleton className="h-6 w-32 ml-auto bg-gray-300 dark:bg-gray-700" /> : 'PESILAT BIRU')}</div>
            <div className="text-3xl md:text-5xl font-bold text-blue-600 mt-1">{isLoading ? <Skeleton className="h-10 w-10 ml-auto bg-gray-300 dark:bg-gray-700"/> : confirmedScoreBiru}</div>
          </div>
        </div>

        {error && <p className="text-center text-red-500 bg-red-100 p-3 rounded-md mb-4">{error}</p>}

        <div className="overflow-x-auto shadow-lg rounded-md">
          <table className="w-full border-collapse border border-black bg-white dark:bg-gray-800">
            <thead>
              <tr>
                <th className="bg-red-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm align-top">TOTAL</th>
                <th className="bg-red-600 text-white text-left px-2 py-1 md:px-3 md:py-2 border border-black text-xs md:text-sm align-top">MERAH - DETAIL POIN</th>
                <th className="bg-red-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm align-top">Nilai</th>
                <th className="bg-gray-700 text-white text-center p-1 md:p-2 border border-black align-middle text-xs md:text-sm row-span-2">BABAK</th>
                <th className="bg-blue-600 text-white text-left px-2 py-1 md:px-3 md:py-2 border border-black text-xs md:text-sm align-top">BIRU - DETAIL POIN</th>
                <th className="bg-blue-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm align-top">Nilai</th>
                <th className="bg-blue-600 text-white text-center p-1 md:p-2 border border-black text-xs md:text-sm align-top">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {tableRowDefinitions.map((rowData, index) => {
                const currentRoundForCalc = timerStatus.currentRound;
                let merahLabelText: React.ReactNode = rowData.type;
                let biruLabelText: React.ReactNode = rowData.type;
                
                let merahDisplayValue: string | number;
                let biruDisplayValue: string | number;

                const showLoadingSkeleton = isLoading || !matchDetailsLoaded;

                if (rowData.juriId) {
                  const merahPointsArray = getJuriIndividualPointsArrayForRound(rowData.juriId, 'merah', currentRoundForCalc, juriScores);
                  merahDisplayValue = merahPointsArray.length > 0 ? merahPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                  const biruPointsArray = getJuriIndividualPointsArrayForRound(rowData.juriId, 'biru', currentRoundForCalc, juriScores);
                  biruDisplayValue = biruPointsArray.length > 0 ? biruPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                } else if (rowData.type === 'Total Nilai Juri') {
                  merahLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                  biruLabelText = <span className="font-semibold">Total Nilai Juri</span>;
                  merahDisplayValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'merah', currentRoundForCalc, juriScores), 0);
                  biruDisplayValue = JURI_IDS.reduce((sum, id) => sum + calculateJuriScoreForRound(id, 'biru', currentRoundForCalc, juriScores), 0);
                } else if (rowData.type === 'Jatuhan') {
                  const merahPointsArray = getKetuaIndividualActionPointsArrayForRound('merah', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                  merahDisplayValue = merahPointsArray.length > 0 ? merahPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                  const biruPointsArray = getKetuaIndividualActionPointsArrayForRound('biru', 'Jatuhan', currentRoundForCalc, ketuaActionsLog);
                  biruDisplayValue = biruPointsArray.length > 0 ? biruPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                } else { // Hukuman
                  const merahPointsArray = getKetuaIndividualActionPointsArrayForRound('merah', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                  merahDisplayValue = merahPointsArray.length > 0 ? merahPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                  const biruPointsArray = getKetuaIndividualActionPointsArrayForRound('biru', 'Hukuman', currentRoundForCalc, ketuaActionsLog);
                  biruDisplayValue = biruPointsArray.length > 0 ? biruPointsArray.join(', ') : (showLoadingSkeleton ? '' : '0');
                }

                return (
                  <tr key={rowData.type}>
                    {index === 0 && (
                      <td className="border border-black text-center align-middle text-xl md:text-3xl font-bold p-1 md:p-2 h-full" rowSpan={tableRowDefinitions.length}>
                        {showLoadingSkeleton ? <Skeleton className="h-10 w-10 mx-auto bg-gray-400" /> : calculateRoundTotalScore('merah', currentRoundForCalc, juriScores, ketuaActionsLog)}
                      </td>
                    )}
                    <LabelCell>{merahLabelText}</LabelCell>
                    <ScoreCell value={merahDisplayValue} isLoadingValue={showLoadingSkeleton} />
                    {index === 0 && (
                      <td className="border border-black text-center align-middle text-3xl md:text-5xl font-bold p-1 md:p-2" rowSpan={tableRowDefinitions.length}>
                        {showLoadingSkeleton ? <Skeleton className="h-10 w-8 mx-auto bg-gray-400" /> : getRomanRound(timerStatus.currentRound)}
                      </td>
                    )}
                    <LabelCell>{biruLabelText}</LabelCell>
                    <ScoreCell value={biruDisplayValue} isLoadingValue={showLoadingSkeleton} />
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
                <Link href={`/login?redirect=/scoring/tanding/dewan-2${gelanggangName ? `&gelanggang=${encodeURIComponent(gelanggangName)}` : ''}`}><ArrowLeft className="mr-2 h-4 w-4"/> Kembali ke Login</Link>
            </Button>
        </div>
      </div>
    </div>
  );
}

export default function DewanDuaPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-screen">
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
    

    
