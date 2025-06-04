
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, MinusSquare, Target, Shield } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, collection } from 'firebase/firestore';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface RoundScores {
  round1: number[];
  round2: number[];
  round3: number[];
}

interface JuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  activeRound: 1 | 2 | 3;
  lastUpdated?: Timestamp;
}

const initialRoundScores = (): RoundScores => ({
  round1: [],
  round2: [],
  round3: [],
});

const initialJuriMatchData = (): JuriMatchData => ({
  merah: initialRoundScores(),
  biru: initialRoundScores(),
  activeRound: 1,
});

export default function JuriDynamicPage({ params }: { params: { juriId: string } }) {
  const { juriId } = params; // e.g., "juri-1", "juri-2"
  const juriDisplayName = `Juri ${juriId.split('-')[1] || 'Tidak Dikenal'}`;

  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  
  const [configMatchId, setConfigMatchId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null); 
  
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        setConfigMatchId(docSnap.data().activeScheduleId);
      } else {
        setConfigMatchId(null);
        // If no active config, ensure we also clear dependent states
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
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
      setIsLoading(false);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    let unsubScores = () => {};

    if (!configMatchId) {
      setActiveMatchId(null);
      setPesilatMerah(null);
      setPesilatBiru(null);
      setMatchDetailsLoaded(false);
      setScoresData(initialJuriMatchData());
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
        
        const scheduleData = scheduleDoc.data() as ScheduleTanding;
        setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
        setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
        setMatchDetailsLoaded(true);

        const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, configMatchId, 'juri_scores', juriId);
        unsubScores = onSnapshot(juriScoreDocRef, (scoreDoc) => {
          if (scoreDoc.exists()) {
            const data = scoreDoc.data() as JuriMatchData;
            const ensuredData = {
              ...initialJuriMatchData(), 
              ...data,
              merah: { ...initialRoundScores(), ...data.merah },
              biru: { ...initialRoundScores(), ...data.biru },
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
        console.error("Error in loadAllData (fetching schedule details):", error);
        setPesilatMerah(null); setPesilatBiru(null); setMatchDetailsLoaded(false);
        setActiveMatchId(null);
        setScoresData(initialJuriMatchData());
        setIsLoading(false);
      }
    };

    loadAllData();

    return () => {
      unsubScores(); 
    };
  }, [configMatchId, juriId]);

  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId || !juriId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', juriId);
    try {
      await setDoc(juriScoreDocRef, { ...newScoresData, lastUpdated: Timestamp.now() }, { merge: true });
    } catch (error) {
      console.error("Error saving scores to Firestore:", error);
    }
  }, [activeMatchId, juriId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', points: 1 | 2) => {
    if (!activeMatchId || isLoading) return;
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)); 
      const roundKey = `round${prevScores.activeRound}` as keyof RoundScores;
      
      if (!newScores[pesilatColor][roundKey]) {
        newScores[pesilatColor][roundKey] = [];
      }
      newScores[pesilatColor][roundKey].push(points);
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    if (!activeMatchId || isLoading) return;
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)); 
      const roundKey = `round${prevScores.activeRound}` as keyof RoundScores;
      
      if (newScores[pesilatColor][roundKey] && newScores[pesilatColor][roundKey].length > 0) {
        newScores[pesilatColor][roundKey].pop();
      }
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const handleSetRound = (round: 1 | 2 | 3) => {
    if (!activeMatchId || isLoading) return;
    setScoresData(prevScores => {
        const newScores = { ...prevScores, activeRound: round };
        saveScoresToFirestore(newScores);
        return newScores;
    });
  };

  const calculateTotalScoreForPesilat = (roundScores: RoundScores): number => {
    return Object.values(roundScores).reduce((total, roundData) => 
      total + (roundData?.reduce((sum, score) => sum + score, 0) || 0), 0);
  };

  const totalMerah = calculateTotalScoreForPesilat(scoresData.merah);
  const totalBiru = calculateTotalScoreForPesilat(scoresData.biru);

  const renderRoundScores = (roundData: number[] | undefined) => {
    if (!roundData || roundData.length === 0) return '-';
    return roundData.join(' ');
  };
  
  if (isLoading && !matchDetailsLoaded && !activeMatchId) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`${juriDisplayName} - Scoring Tanding`} description="Memuat data pertandingan..." />
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
              <Link href="/scoring/tanding">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali ke Pilihan Peran
              </Link>
            </Button>
          </PageTitle>
          <Card className="mt-6">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">Silakan aktifkan jadwal pertandingan di halaman Admin.</p>
            </CardContent>
          </Card>
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
          description={`Input penilaian untuk ${juriDisplayName}. Pertandingan: ${activeMatchId || 'Memuat...'}`}
        >
          <Button variant="outline" asChild>
            <Link href="/scoring/tanding">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Pilihan Peran
            </Link>
          </Button>
        </PageTitle>

        <Card className="mb-6 shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-4">
              <div className="text-red-600">
                <p className="font-semibold">MERAH</p>
                <p>Kontingen: {pesilatMerah?.contingent || (isLoading ? 'Memuat...' : '-')}</p>
                <p>Pesilat: {pesilatMerah?.name || (isLoading ? 'Memuat...' : '-')}</p>
              </div>
              <div className="text-blue-600 text-right">
                <p className="font-semibold">BIRU</p>
                <p>Kontingen: {pesilatBiru?.contingent || (isLoading ? 'Memuat...' : '-')}</p>
                <p>Pesilat: {pesilatBiru?.name || (isLoading ? 'Memuat...' : '-')}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 text-center font-semibold">
                <div className="bg-red-500 text-white p-2">MERAH</div>
                <div className="bg-yellow-400 text-black p-2">BABAK</div>
                <div className="bg-blue-500 text-white p-2">BIRU</div>
              </div>
              {[1, 2, 3].map((round) => (
                <div key={round} className="grid grid-cols-3 text-center border-t">
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                    {isLoading && !scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores]?.length ? '...' : renderRoundScores(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                  </div>
                  <button 
                    onClick={() => handleSetRound(round as 1 | 2 | 3)}
                    disabled={isLoading || !activeMatchId}
                    className={`p-3 font-medium ${scoresData.activeRound === round ? 'bg-yellow-400 text-black scale-105 ring-2 ring-yellow-500' : 'bg-gray-100 hover:bg-gray-200'} transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </button>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {isLoading && !scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores]?.length ? '...' : renderRoundScores(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-lg font-semibold">
              <p className="text-red-600">Total Merah: {isLoading && totalMerah === 0 ? '...' : totalMerah}</p>
              <p className="text-blue-600">Total Biru: {isLoading && totalBiru === 0 ? '...' : totalBiru}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:gap-8">
          <div className="space-y-3">
            <Button 
              onClick={() => handleScore('merah', 1)} 
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading}
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
            </Button>
            <Button 
              onClick={() => handleScore('merah', 2)} 
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading}
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
            </Button>
            <Button 
              onClick={() => handleDeleteScore('merah')} 
              className="w-full bg-red-700 hover:bg-red-800 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading || (scoresData.merah[`round${scoresData.activeRound}` as keyof RoundScores]?.length === 0)}
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>

          <div className="space-y-3">
            <Button 
              onClick={() => handleScore('biru', 1)} 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading}
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan (+1)
            </Button>
            <Button 
              onClick={() => handleScore('biru', 2)} 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading}
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan (+2)
            </Button>
            <Button 
              onClick={() => handleDeleteScore('biru')} 
              className="w-full bg-blue-700 hover:bg-blue-800 text-white text-lg py-6 h-auto"
              disabled={!activeMatchId || isLoading || (scoresData.biru[`round${scoresData.activeRound}` as keyof RoundScores]?.length === 0)}
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

    