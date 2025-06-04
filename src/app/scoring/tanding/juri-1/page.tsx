
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card'; // Removed CardHeader, CardTitle
import { ArrowLeft, MinusSquare, Target, Shield } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp } from 'firebase/firestore';

const JURI_ID = 'juri-1';
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

export default function JuriSatuPage() {
  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [scoresData, setScoresData] = useState<JuriMatchData>(initialJuriMatchData());
  const [isLoading, setIsLoading] = useState(true);

  // Effect to fetch active match ID and then schedule details
  useEffect(() => {
    setIsLoading(true);
    const unsubActiveMatch = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), async (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const currentActiveMatchId = docSnap.data().activeScheduleId;
        if (activeMatchId !== currentActiveMatchId) { // Only refetch if match ID changes
          setActiveMatchId(currentActiveMatchId);
          // Fetch schedule details
          try {
            const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentActiveMatchId);
            const scheduleDoc = await getDoc(scheduleDocRef);
            if (scheduleDoc.exists()) {
              const scheduleData = scheduleDoc.data() as ScheduleTanding;
              setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
              setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
              setMatchDetailsLoaded(true);
            } else {
              console.error("Active schedule document not found.");
              setPesilatMerah(null);
              setPesilatBiru(null);
              setActiveMatchId(null);
              setMatchDetailsLoaded(false);
            }
          } catch (error) {
            console.error("Error fetching schedule details:", error);
            setPesilatMerah(null);
            setPesilatBiru(null);
            setActiveMatchId(null);
            setMatchDetailsLoaded(false);
          }
        } else if (activeMatchId === currentActiveMatchId && !matchDetailsLoaded) {
          // If match ID is the same but details weren't loaded (e.g. on initial load after ID is set)
           try {
            const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentActiveMatchId);
            const scheduleDoc = await getDoc(scheduleDocRef);
            if (scheduleDoc.exists()) {
              const scheduleData = scheduleDoc.data() as ScheduleTanding;
              setPesilatMerah({ name: scheduleData.pesilatMerahName, contingent: scheduleData.pesilatMerahContingent });
              setPesilatBiru({ name: scheduleData.pesilatBiruName, contingent: scheduleData.pesilatBiruContingent });
              setMatchDetailsLoaded(true);
            }
          } catch (error) {
            console.error("Error refetching schedule details:", error);
          }
        }
      } else {
        console.log("No active tanding schedule found or ID is null.");
        setPesilatMerah(null);
        setPesilatBiru(null);
        setActiveMatchId(null);
        setMatchDetailsLoaded(false);
        setScoresData(initialJuriMatchData()); // Reset scores if no active match
      }
    });
    return () => unsubActiveMatch();
  }, [activeMatchId, matchDetailsLoaded]);


  // Effect to fetch/subscribe to juri scores once activeMatchId is set
  useEffect(() => {
    if (!activeMatchId) {
      setScoresData(initialJuriMatchData()); // Reset scores if no active match
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', JURI_ID);
    const unsubScores = onSnapshot(juriScoreDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as JuriMatchData;
        // Ensure all rounds exist, even if empty
        const ensuredData = {
          ...initialJuriMatchData(), // provides default for activeRound
          ...data,
          merah: {
            ...initialRoundScores(),
            ...data.merah,
          },
          biru: {
            ...initialRoundScores(),
            ...data.biru,
          },
        };
        setScoresData(ensuredData);
      } else {
        setScoresData(initialJuriMatchData()); // No scores yet for this juri/match, use initial
      }
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching scores for ${JURI_ID}:`, error);
      setScoresData(initialJuriMatchData());
      setIsLoading(false);
    });

    return () => unsubScores();
  }, [activeMatchId]);


  const saveScoresToFirestore = useCallback(async (newScoresData: JuriMatchData) => {
    if (!activeMatchId) return;
    const juriScoreDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId, 'juri_scores', JURI_ID);
    try {
      await setDoc(juriScoreDocRef, { ...newScoresData, lastUpdated: Timestamp.now() }, { merge: true });
    } catch (error) {
      console.error("Error saving scores to Firestore:", error);
    }
  }, [activeMatchId]);

  const handleScore = (pesilatColor: 'merah' | 'biru', points: 1 | 2) => {
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)); // Deep copy
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
    setScoresData(prevScores => {
      const newScores = JSON.parse(JSON.stringify(prevScores)); // Deep copy
      const roundKey = `round${prevScores.activeRound}` as keyof RoundScores;
      
      if (newScores[pesilatColor][roundKey] && newScores[pesilatColor][roundKey].length > 0) {
        newScores[pesilatColor][roundKey].pop();
      }
      saveScoresToFirestore(newScores);
      return newScores;
    });
  };

  const handleSetRound = (round: 1 | 2 | 3) => {
    setScoresData(prevScores => {
        const newScores = { ...prevScores, activeRound: round };
        saveScoresToFirestore(newScores);
        return newScores;
    });
  };


  const calculateTotalScoreForPesilat = (roundScores: RoundScores): number => {
    return Object.values(roundScores).reduce((total, round) => 
      total + (round?.reduce((sum, score) => sum + score, 0) || 0), 0);
  };

  const totalMerah = calculateTotalScoreForPesilat(scoresData.merah);
  const totalBiru = calculateTotalScoreForPesilat(scoresData.biru);

  const renderRoundScores = (roundData: number[] | undefined) => {
    if (!roundData || roundData.length === 0) return '-';
    return roundData.join(' ');
  };
  
  if (isLoading && !matchDetailsLoaded) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`Juri ${JURI_ID.split('-')[1]} - Scoring Tanding`} description="Memuat data pertandingan..." />
          <p>Loading...</p>
        </main>
      </div>
    );
  }

  if (!activeMatchId && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title={`Juri ${JURI_ID.split('-')[1]} - Scoring Tanding`} description="Tidak ada pertandingan yang aktif.">
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
          title={`Juri ${JURI_ID.split('-')[1]} - Scoring Tanding`}
          description={`Input penilaian untuk ${JURI_ID}. Pertandingan: ${activeMatchId || 'Belum Ada'}`}
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
                <p>Kontingen: {pesilatMerah?.contingent || '-'}</p>
                <p>Pesilat: {pesilatMerah?.name || '-'}</p>
              </div>
              <div className="text-blue-600 text-right">
                <p className="font-semibold">BIRU</p>
                <p>Kontingen: {pesilatBiru?.contingent || '-'}</p>
                <p>Pesilat: {pesilatBiru?.name || '-'}</p>
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
                    {renderRoundScores(scoresData.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                  </div>
                  <button 
                    onClick={() => handleSetRound(round as 1 | 2 | 3)}
                    className={`p-3 font-medium ${scoresData.activeRound === round ? 'bg-yellow-400 text-black scale-105 ring-2 ring-yellow-500' : 'bg-gray-100 hover:bg-gray-200'} transition-all`}
                  >
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </button>
                  <div className="p-3 tabular-nums min-h-[3rem] flex items-center justify-center">
                     {renderRoundScores(scoresData.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores])}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-lg font-semibold">
              <p className="text-red-600">Total Merah: {totalMerah}</p>
              <p className="text-blue-600">Total Biru: {totalBiru}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:gap-8">
          {/* Kolom Merah */}
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

          {/* Kolom Biru */}
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
