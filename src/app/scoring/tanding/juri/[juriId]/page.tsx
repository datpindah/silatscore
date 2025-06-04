
"use client";

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, MinusSquare, Target, Shield, Lock, Unlock } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp } from 'firebase/firestore';

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

interface TimerStatus { // For listening to Dewan's control
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
  
  const [configMatchId, setConfigMatchId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); 
  
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());
  const [isLoading, setIsLoading] = useState(true);
  
  const [dewanControlledRound, setDewanControlledRound] = useState<1 | 2 | 3>(1);
  const [isTimerRunningByDewan, setIsTimerRunningByDewan] = useState<boolean>(false);
  const [dewanMatchStatus, setDewanMatchStatus] = useState<string>('Pending');

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        setConfigMatchId(docSnap.data().activeScheduleId);
      } else {
        setConfigMatchId(null);
        setActiveMatchId(null);
        setPesilatMerah(null);
        setPesilatBiru(null);
        setMatchDetailsLoaded(false);
        setScoresData(initialJuriMatchData());
        setIsLoading(false);
      }
    }, (error) => {
      console.error("Error fetching active schedule config:", error);
      setConfigMatchId(null);
      setActiveMatchId(null);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    let unsubScores = () => {};
    let unsubTimerStatus = () => {};

    if (!configMatchId) {
      setActiveMatchId(null);
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
      setDewanControlledRound(1);
      setIsTimerRunningByDewan(false);
      setDewanMatchStatus('Pending');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setActiveMatchId(configMatchId);

    const loadAllData = async () => {
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, configMatchId);
        const scheduleDoc = await getDoc(scheduleDocRef);

        if (!scheduleDoc.exists()) {
          console.error("Active schedule document not found for ID:", configMatchId);
          setPesilatMerah(null); setPesilatBiru(null); setMatchDetailsLoaded(false);
          setActiveMatchId(null);
          setScoresData(initialJuriMatchData());
          setIsLoading(false);
          return;
        }
        
        const scheduleData = scheduleDoc.data() as Omit<ScheduleTanding, 'id' | 'date'> & { date: Timestamp | string };
        setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
        setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
        setMatchDetailsLoaded(true);

        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, configMatchId);
        unsubTimerStatus = onSnapshot(timerStatusDocRef, (docSnap) => {
          if (docSnap.exists() && docSnap.data()?.timer_status) {
            const dewanStatus = docSnap.data()?.timer_status as TimerStatus;
            setDewanControlledRound(dewanStatus.currentRound || 1);
            setIsTimerRunningByDewan(dewanStatus.isTimerRunning || false);
            setDewanMatchStatus(dewanStatus.matchStatus || 'Pending');
          } else {
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
          }
        }, (error) => {
            console.error("Error fetching timer status:", error);
            setDewanControlledRound(1);
            setIsTimerRunningByDewan(false);
            setDewanMatchStatus('Pending');
        });
        
        const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, configMatchId, 'juri_scores', juriId);
        unsubScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
          if (scoreDoc.exists()) {
            const data = scoreDoc.data() as JuriMatchData;
            const ensuredData: JuriMatchData = {
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
            setScoresData(initialJuriMatchData());
          }
          setIsLoading(false); 
        }, (error) => {
          console.error(`Error fetching/subscribing to juri scores for ${juriId}:`, error);
          setScoresData(initialJuriMatchData());
          setIsLoading(false);
        });

      } catch (error) {
        console.error("Error in loadAllData:", error);
        setPesilatMerah(null); setPesilatBiru(null); setMatchDetailsLoaded(false);
        setActiveMatchId(null);
        setScoresData(initialJuriMatchData());
        setIsLoading(false);
      }
    };

    loadAllData();

    return () => {
      unsubScores();
      unsubTimerStatus();
    };
  }, [configMatchId, juriId]);

  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      const dataToSave = {
        merah: newScoresData.merah,
        biru: newScoresData.biru,
        lastUpdated: Timestamp.now()
      };
      await setDoc(juriScoreDocRef, dataToSave, { merge: true });
    } catch (error) {
      console.error("Error saving scores to Firestore:", error);
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', pointsValue: 1 | 2) => {
    if (!activeMatchId || isLoading || !isTimerRunningByDewan || dewanMatchStatus === 'MatchFinished' || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused')) return;
    
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData; 
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      
      const newEntry: ScoreEntry = {
        points: pointsValue,
        timestamp: Timestamp.now()
      };

      if (!newScores[pesilatColor][roundKey]) {
        newScores[pesilatColor][roundKey] = [];
      }
      newScores[pesilatColor][roundKey].push(newEntry);
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (!activeMatchId || isLoading || !isTimerRunningByDewan || dewanMatchStatus === 'MatchFinished' || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused')) return;
    
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)) as JuriMatchData;
      const roundKey = `round${dewanControlledRound}` as keyof RoundScores;
      
      if (newScores[pesilatColor][roundKey] && newScores[pesilatColor][roundKey].length > 0) {
        newScores[pesilatColor][roundKey].pop();
      }
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const calculateTotalScoreForPesilatDisplay = (roundScores: RoundScores): number => {
    return Object.values(roundScores).reduce((total, roundDataArray) => 
      total + (roundDataArray?.reduce((sum, scoreEntry) => sum + scoreEntry.points, 0) || 0), 0);
  };

  const totalMerahDisplay = calculateTotalScoreForPesilatDisplay(scoresData.merah);
  const totalBiruDisplay = calculateTotalScoreForPesilatDisplay(scoresData.biru);

  const renderRoundScoresDisplay = (roundData: ScoreEntry[] | undefined) => {
    if (!roundData || roundData.length === 0) return '-';
    return roundData.map(entry => entry.points).join(' ');
  };
  
  const isInputDisabled = isLoading || !activeMatchId || dewanMatchStatus === 'MatchFinished' || !isTimerRunningByDewan || dewanMatchStatus.startsWith('FinishedRound') || dewanMatchStatus.startsWith('Paused');
  const inputDisabledReason = () => {
    if (isLoading) return "Memuat data...";
    if (!activeMatchId) return "Tidak ada pertandingan aktif.";
    if (dewanMatchStatus === 'MatchFinished') return "Pertandingan telah Selesai.";
    if (dewanMatchStatus.startsWith('FinishedRound')) return `Babak ${dewanControlledRound} Selesai. Input ditutup.`;
    if (dewanMatchStatus.startsWith('Paused')) return `Babak ${dewanControlledRound} Jeda. Input ditutup.`;
    if (!isTimerRunningByDewan) return "Input nilai ditutup (timer tidak berjalan).";
    return "";
  };

  if (isLoading && !configMatchId) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description="Memuat konfigurasi pertandingan..." />
          <Card className="mt-6"><CardContent className="p-6 text-center">Loading...</CardContent></Card>
        </main>
      </div>
    );
  }

  if (!activeMatchId && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description="Tidak ada pertandingan yang aktif.">
            <Button variant="outline" asChild>
              <Link href="/scoring/tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
          </PageTitle>
          <Card className="mt-6"><CardContent className="p-6 text-center"><p>Silakan aktifkan jadwal pertandingan di halaman Admin dan mulai oleh Dewan.</p></CardContent></Card>
        </main>
      </div>
    );
  }
  
  if (isLoading && activeMatchId) { // Changed condition to allow rendering skeleton when activeMatchId is set but data is loading
     return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description={`Memuat data untuk pertandingan...`} />
          <Card className="mt-6"><CardContent className="p-6 text-center">Loading match details...</CardContent></Card>
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
            <span className={`text-sm ${isInputDisabled ? 'text-red-500' : 'text-green-500'}`}>{inputDisabledReason() || "Input Nilai Terbuka"}</span>
            <Button variant="outline" asChild>
              <Link href="/scoring/tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
          </div>
        </PageTitle>

        {matchDetailsLoaded && !isLoading && activeMatchId ? (
          <>
            <Card className="mb-6 shadow-lg">
              <CardContent className="p-4">
                <div className="flex justify-between text-sm mb-4">
                  <div className="text-red-600">
                    <p className="font-semibold text-lg">{pesilatMerah?.name || 'PESILAT MERAH'}</p>
                    <p>Kontingen: {pesilatMerah?.contingent || '-'}</p>
                  </div>
                  <div className="text-blue-600 text-right">
                    <p className="font-semibold text-lg">{pesilatBiru?.name || 'PESILAT BIRU'}</p>
                    <p>Kontingen: {pesilatBiru?.contingent || '-'}</p>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-3 text-center font-semibold">
                    <div className="bg-red-500 text-white p-2">MERAH</div>
                    <div className="bg-yellow-400 text-black p-2">BABAK (Aktif: {dewanControlledRound})</div>
                    <div className="bg-blue-500 text-white p-2">BIRU</div>
                  </div>
                  {[1, 2, 3].map((round) => (
                    <div key={round} className={`grid grid-cols-3 text-center border-t ${dewanControlledRound === round ? 'bg-yellow-100 font-semibold' : ''}`}>
                      <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                        {renderRoundScoresDisplay(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                      </div>
                      <div className={`p-3 font-medium flex items-center justify-center`}>
                        {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                      </div>
                      <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                        {renderRoundScoresDisplay(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-4 text-xl font-bold">
                  <p className="text-red-600">Total Poin Juri (Merah): {totalMerahDisplay}</p>
                  <p className="text-blue-600">Total Poin Juri (Biru): {totalBiruDisplay}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-3">
                <Button 
                  onClick={() => handleScore('merah', 1)} 
                  className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled}
                >
                  <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
                </Button>
                <Button 
                  onClick={() => handleScore('merah', 2)} 
                  className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled}
                >
                  <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
                </Button>
                <Button 
                  onClick={() => handleDeleteScore('merah')} 
                  className="w-full bg-red-700 hover:bg-red-800 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled || (scoresData.merah[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)}
                >
                  <MinusSquare className="mr-2 h-5 w-5" /> Hapus
                </Button>
              </div>

              <div className="space-y-3">
                <Button 
                  onClick={() => handleScore('biru', 1)} 
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled}
                >
                  <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
                </Button>
                <Button 
                  onClick={() => handleScore('biru', 2)} 
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled}
                >
                  <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
                </Button>
                <Button 
                  onClick={() => handleDeleteScore('biru')} 
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white text-lg py-6 h-auto"
                  disabled={isInputDisabled || (scoresData.biru[`round${dewanControlledRound}` as keyof RoundScores]?.length === 0)}
                >
                  <MinusSquare className="mr-2 h-5 w-5" /> Hapus
                </Button>
              </div>
            </div>
          </>
        ) : null }
      </main>
    </div>
  );
}

    