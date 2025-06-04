
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MinusSquare, Target, Shield } from 'lucide-react'; // Using Shield as placeholder for "Hapus"
import type { ScheduleTanding } from '@/lib/types';

const ACTIVE_TANDING_SCHEDULE_KEY = 'SILATSCORE_ACTIVE_TANDING_SCHEDULE';
const JURI_ID = 'juri-1'; // This should be dynamic or set per juri page

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
}

const initialRoundScores = (): RoundScores => ({
  round1: [],
  round2: [],
  round3: [],
});

export default function JuriSatuPage() {
  const [pesilatMerah, setPesilatMerah] = useState<PesilatInfo | null>(null);
  const [pesilatBiru, setPesilatBiru] = useState<PesilatInfo | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [scores, setScores] = useState<JuriMatchData>({
    merah: initialRoundScores(),
    biru: initialRoundScores(),
  });
  const [activeRound, setActiveRound] = useState<1 | 2 | 3>(1);

  const getLocalStorageKey = useCallback(() => {
    if (!activeMatchId) return null;
    return `juriScores_${activeMatchId}_${JURI_ID}`;
  }, [activeMatchId]);

  // Load active schedule and juri scores
  useEffect(() => {
    const storedActiveSchedule = localStorage.getItem(ACTIVE_TANDING_SCHEDULE_KEY);
    if (storedActiveSchedule) {
      try {
        const activeSchedule: ScheduleTanding = JSON.parse(storedActiveSchedule);
        setPesilatMerah({ name: activeSchedule.pesilatMerahName, contingent: activeSchedule.pesilatMerahContingent });
        setPesilatBiru({ name: activeSchedule.pesilatBiruName, contingent: activeSchedule.pesilatBiruContingent });
        setActiveMatchId(activeSchedule.id);
      } catch (error) {
        console.error("Error parsing active schedule from localStorage:", error);
      }
    }

    if (activeMatchId) {
      const lsKey = getLocalStorageKey();
      if (lsKey) {
        const storedScores = localStorage.getItem(lsKey);
        if (storedScores) {
          try {
            setScores(JSON.parse(storedScores));
          } catch (error) {
            console.error("Error parsing juri scores from localStorage:", error);
          }
        }
      }
    }
  }, [activeMatchId, getLocalStorageKey]);

  // Save scores to localStorage
  useEffect(() => {
    if (activeMatchId) {
      const lsKey = getLocalStorageKey();
      if (lsKey) {
        localStorage.setItem(lsKey, JSON.stringify(scores));
      }
    }
  }, [scores, activeMatchId, getLocalStorageKey]);

  const handleScore = (pesilatColor: 'merah' | 'biru', points: 1 | 2) => {
    setScores(prevScores => {
      const newScores = { ...prevScores };
      const roundKey = `round${activeRound}` as keyof RoundScores;
      newScores[pesilatColor][roundKey] = [...newScores[pesilatColor][roundKey], points];
      return newScores;
    });
  };

  const handleDeleteScore = (pesilatColor: 'merah' | 'biru') => {
    setScores(prevScores => {
      const newScores = { ...prevScores };
      const roundKey = `round${activeRound}` as keyof RoundScores;
      newScores[pesilatColor][roundKey] = newScores[pesilatColor][roundKey].slice(0, -1);
      return newScores;
    });
  };

  const calculateTotalScore = (roundScores: RoundScores): number => {
    return Object.values(roundScores).reduce((total, round) => 
      total + round.reduce((sum, score) => sum + score, 0), 0);
  };

  const totalMerah = calculateTotalScore(scores.merah);
  const totalBiru = calculateTotalScore(scores.biru);

  const renderRoundScores = (roundData: number[]) => {
    return roundData.join(' ') || '-';
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Juri 1 - Scoring Tanding"
          description="Input penilaian untuk Juri 1."
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
                <p>Kontingen Merah: {pesilatMerah?.contingent || '-'}</p>
                <p>Pesilat Merah: {pesilatMerah?.name || '-'}</p>
              </div>
              <div className="text-blue-600 text-right">
                <p>Kontingen Biru: {pesilatBiru?.contingent || '-'}</p>
                <p>Pesilat Biru: {pesilatBiru?.name || '-'}</p>
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
                  <div className="p-3 tabular-nums">{renderRoundScores(scores.merah[`round${round as 1 | 2 | 3}` as keyof RoundScores])}</div>
                  <button 
                    onClick={() => setActiveRound(round as 1 | 2 | 3)}
                    className={`p-3 font-medium ${activeRound === round ? 'bg-yellow-400 text-black scale-105' : 'bg-gray-100 hover:bg-gray-200'} transition-all`}
                  >
                    {round === 1 ? 'I' : round === 2 ? 'II' : 'III'}
                  </button>
                  <div className="p-3 tabular-nums">{renderRoundScores(scores.biru[`round${round as 1 | 2 | 3}` as keyof RoundScores])}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4 text-lg font-semibold">
              <p>Total Merah: {totalMerah}</p>
              <p>Total Biru: {totalBiru}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:gap-8">
          {/* Kolom Merah */}
          <div className="space-y-3">
            <Button 
              onClick={() => handleScore('merah', 1)} 
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan
            </Button>
            <Button 
              onClick={() => handleScore('merah', 2)} 
              className="w-full bg-red-500 hover:bg-red-600 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan 
            </Button>
            <Button 
              onClick={() => handleDeleteScore('merah')} 
              className="w-full bg-red-700 hover:bg-red-800 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>

          {/* Kolom Biru */}
          <div className="space-y-3">
            <Button 
              onClick={() => handleScore('biru', 1)} 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <Target className="mr-2 h-5 w-5" /> Pukulan
            </Button>
            <Button 
              onClick={() => handleScore('biru', 2)} 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <Shield className="mr-2 h-5 w-5" /> Tendangan
            </Button>
            <Button 
              onClick={() => handleDeleteScore('biru')} 
              className="w-full bg-blue-700 hover:bg-blue-800 text-white text-lg py-3"
              disabled={!activeMatchId}
            >
              <MinusSquare className="mr-2 h-5 w-5" /> Hapus
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

    