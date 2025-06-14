
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, PlusCircle, MinusCircle, Loader2, Info, CheckSquare, Square } from 'lucide-react';
import type { ScheduleTGR, TGRJuriScore, TGRTimerStatus } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';

const BASE_SCORE_TGR = 9.90;
const GERAKAN_SALAH_DEDUCTION = 0.01;
const MIN_STAMINA_BONUS = 0.00;
const MAX_STAMINA_BONUS = 0.10;

const initialJuriScore: TGRJuriScore = {
  baseScore: BASE_SCORE_TGR,
  gerakanSalahCount: 0,
  staminaKemantapanBonus: 0.00,
  calculatedScore: BASE_SCORE_TGR,
};

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, // Default for Tunggal
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180,
};

export default function JuriTGRPage({ params }: { params: { juriId: string } }) {
  const { juriId } = params;
  const juriDisplayName = `Juri ${juriId?.split('-')[1] || 'TGR Tidak Dikenal'}`;

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [juriScore, setJuriScore] = useState<TGRJuriScore>(initialJuriScore);
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateScore = useCallback((gsCount: number, staminaBonus: number) => {
    return BASE_SCORE_TGR - (gsCount * GERAKAN_SALAH_DEDUCTION) + staminaBonus;
  }, []);

  // Effect to listen for active TGR schedule config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error(`[${juriDisplayName}] Error fetching active TGR schedule config:`, err);
      setError("Gagal memuat konfigurasi jadwal aktif TGR.");
      setConfigMatchId(null);
    });
    return () => unsub();
  }, [juriDisplayName]);

  // Effect to handle activeMatchId changes and reset data
  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setJuriScore(initialJuriScore);
      setTgrTimerStatus(initialTgrTimerStatus);
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false);
      setError(null);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);

  // Effect to load schedule details and juri's score for the active match
  useEffect(() => {
    if (!activeMatchId) {
      if(isLoading) setIsLoading(false);
      return;
    }

    let mounted = true;
    let unsubSchedule: (() => void) | undefined;
    let unsubJuriScore: (() => void) | undefined;
    let unsubMatchData: (() => void) | undefined;

    const loadData = async () => {
      if (!mounted) return;
      setIsLoading(true);
      try {
        // Load Schedule Details
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        unsubSchedule = onSnapshot(scheduleDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            setScheduleDetails(docSnap.data() as ScheduleTGR);
            setMatchDetailsLoaded(true);
          } else {
            setError(`Detail Jadwal TGR (ID: ${activeMatchId}) tidak ditemukan.`);
            setScheduleDetails(null);
            setMatchDetailsLoaded(false);
          }
        }, (err) => {
          if (mounted) setError(`Gagal memuat detail jadwal TGR: ${err.message}`);
        });

        // Load Juri Score or initialize if not exists
        const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
        unsubJuriScore = onSnapshot(juriScoreDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data() as TGRJuriScore;
            setJuriScore({
              ...data,
              calculatedScore: calculateScore(data.gerakanSalahCount, data.staminaKemantapanBonus)
            });
          } else {
            // Initialize if document doesn't exist for this juri for this match
            setJuriScore({...initialJuriScore, calculatedScore: calculateScore(initialJuriScore.gerakanSalahCount, initialJuriScore.staminaKemantapanBonus) });
          }
        }, (err) => {
          if (mounted) setError(`Gagal memuat skor juri: ${err.message}`);
        });

        // Load TGR Match Data (for timer status)
        const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
        unsubMatchData = onSnapshot(matchDataDocRef, (docSnap) => {
            if(!mounted) return;
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data?.timerStatus) {
                    setTgrTimerStatus(data.timerStatus as TGRTimerStatus);
                } else {
                    setTgrTimerStatus(initialTgrTimerStatus);
                }
            } else {
                 setTgrTimerStatus(initialTgrTimerStatus);
            }
        }, (err) => {
            if (mounted) setError(`Gagal sinkronisasi status timer TGR: ${err.message}`);
        });

      } catch (err) {
        if (mounted) setError(`Error utama saat memuat data: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    
    loadData();
    
    return () => {
      mounted = false;
      if (unsubSchedule) unsubSchedule();
      if (unsubJuriScore) unsubJuriScore();
      if (unsubMatchData) unsubMatchData();
    };
  }, [activeMatchId, juriId, calculateScore]);

  useEffect(() => {
     if (isLoading && matchDetailsLoaded) {
       setIsLoading(false);
     }
  }, [isLoading, matchDetailsLoaded]);

  const saveJuriScore = async (updatedScore: TGRJuriScore) => {
    if (!activeMatchId || isSaving) return;
    setIsSaving(true);
    try {
      const scoreToSave = {
        ...updatedScore,
        lastUpdated: serverTimestamp(),
      };
      const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
      await setDoc(juriScoreDocRef, scoreToSave, { merge: true });
    } catch (err) {
      setError(`Gagal menyimpan skor: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Error saving Juri TGR score:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGerakanSalahChange = (increment: boolean) => {
    setJuriScore(prev => {
      const newCount = Math.max(0, prev.gerakanSalahCount + (increment ? 1 : -1));
      const newCalculated = calculateScore(newCount, prev.staminaKemantapanBonus);
      const updatedScore = { ...prev, gerakanSalahCount: newCount, calculatedScore: newCalculated };
      saveJuriScore(updatedScore);
      return updatedScore;
    });
  };

  const handleStaminaBonusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseFloat(e.target.value);
    if (isNaN(value)) value = 0;
    value = Math.max(MIN_STAMINA_BONUS, Math.min(MAX_STAMINA_BONUS, value));
    
    setJuriScore(prev => {
      const newCalculated = calculateScore(prev.gerakanSalahCount, value);
      const updatedScore = { ...prev, staminaKemantapanBonus: value, calculatedScore: newCalculated };
      saveJuriScore(updatedScore);
      return updatedScore;
    });
  };

  const isInputDisabled = isLoading || isSaving || !activeMatchId || !matchDetailsLoaded || tgrTimerStatus.matchStatus === 'Finished' || !tgrTimerStatus.isTimerRunning;
  
  const inputDisabledReason = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi global...";
    if (isLoading && activeMatchId) return "Sinkronisasi data pertandingan...";
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan TGR aktif.";
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (isSaving) return "Menyimpan skor...";
    if (error) return `Error: ${error}`;
    if (tgrTimerStatus.matchStatus === 'Finished') return "Penampilan telah Selesai.";
    if (!tgrTimerStatus.isTimerRunning) return "Penampilan belum dimulai atau dijeda oleh Dewan.";
    return "";
  };

  const pageDescription = () => {
    if (configMatchId === undefined && isLoading) return "Memuat...";
    if (isLoading && activeMatchId) return "Memuat data...";
    if (!activeMatchId && !isLoading) return "Tidak ada jadwal aktif.";
    if (matchDetailsLoaded && scheduleDetails) {
        const performer = scheduleDetails.category === 'Jurus Tunggal Bebas' 
            ? `${scheduleDetails.pesilatMerahName} (Merah) vs ${scheduleDetails.pesilatBiruName} (Biru)`
            : `${scheduleDetails.pesilatMerahName}`;
        return `${scheduleDetails.category} - ${performer} (${scheduleDetails.pesilatMerahContingent})`;
    }
    return "Menunggu info pertandingan...";
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle title={`${juriDisplayName} - Penilaian TGR`} description={pageDescription()}>
          <div className="flex items-center gap-2">
            {isLoading ? <Loader2 className="h-5 w-5 text-yellow-500 animate-spin"/> : 
             isInputDisabled ? <Info className="h-5 w-5 text-red-500"/> : 
             <CheckSquare className="h-5 w-5 text-green-500"/>}
            <span className={cn("text-sm font-medium", 
                isLoading ? "text-yellow-600" : 
                isInputDisabled ? "text-red-600" : 
                "text-green-600")}>
              {inputDisabledReason() || "Input Terbuka"}
            </span>
            <Button variant="outline" asChild>
              <Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
          </div>
        </PageTitle>

        {isLoading && !matchDetailsLoaded && (
          <Card>
            <CardHeader><CardTitle><Skeleton className="h-8 w-48" /></CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-32 mt-4" />
            </CardContent>
          </Card>
        )}

        {!isLoading && activeMatchId && matchDetailsLoaded && scheduleDetails && (
          <Card className="shadow-xl">
            <CardHeader>
                <CardTitle className="font-headline text-2xl text-primary">
                    Skor untuk: {scheduleDetails.category === 'Jurus Tunggal Bebas' ? `${scheduleDetails.pesilatMerahName} vs ${scheduleDetails.pesilatBiruName}` : scheduleDetails.pesilatMerahName}
                </CardTitle>
                 <p className="text-muted-foreground">Kontingen: {scheduleDetails.pesilatMerahContingent}</p>
                 <p className="text-muted-foreground">Kategori: {scheduleDetails.category} | No. Undian: {scheduleDetails.lotNumber}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-accent/10 p-4 rounded-lg text-center">
                <Label className="text-sm font-medium text-muted-foreground">SKOR AKHIR JURI</Label>
                <div className="text-6xl font-bold text-accent">{juriScore.calculatedScore.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Dasar: {BASE_SCORE_TGR.toFixed(2)} - ({juriScore.gerakanSalahCount} x {GERAKAN_SALAH_DEDUCTION.toFixed(2)}) + {juriScore.staminaKemantapanBonus.toFixed(2)}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="gerakanSalah" className="text-lg font-semibold font-headline">Pengurangan Kesalahan Gerakan</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <Button variant="outline" size="icon" onClick={() => handleGerakanSalahChange(false)} disabled={isInputDisabled || juriScore.gerakanSalahCount <= 0}>
                      <MinusCircle />
                    </Button>
                    <Input 
                      id="gerakanSalah" 
                      type="number" 
                      readOnly 
                      value={juriScore.gerakanSalahCount} 
                      className="w-20 text-center text-xl font-bold"
                    />
                    <Button variant="outline" size="icon" onClick={() => handleGerakanSalahChange(true)} disabled={isInputDisabled}>
                      <PlusCircle />
                    </Button>
                    <span className="text-sm text-muted-foreground">({(juriScore.gerakanSalahCount * GERAKAN_SALAH_DEDUCTION).toFixed(2)} poin)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Setiap kesalahan gerakan mengurangi {GERAKAN_SALAH_DEDUCTION} poin.</p>
                </div>

                <div>
                  <Label htmlFor="staminaBonus" className="text-lg font-semibold font-headline">Bonus Stamina & Kemantapan</Label>
                  <Input 
                    id="staminaBonus" 
                    type="number"
                    value={juriScore.staminaKemantapanBonus}
                    onChange={handleStaminaBonusChange}
                    min={MIN_STAMINA_BONUS}
                    max={MAX_STAMINA_BONUS}
                    step="0.01"
                    disabled={isInputDisabled}
                    className="mt-1 w-full md:w-1/2 text-xl"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Nilai antara {MIN_STAMINA_BONUS.toFixed(2)} sampai {MAX_STAMINA_BONUS.toFixed(2)}.</p>
                </div>
              </div>
              {isSaving && <p className="text-sm text-primary flex items-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>
        )}
        {!isLoading && !activeMatchId && (
            <Card>
                <CardContent className="p-6 text-center">
                    <Info className="mx-auto h-12 w-12 text-blue-500 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Tidak ada Pertandingan TGR yang Aktif</p>
                    <p className="text-sm text-muted-foreground">Silakan tunggu Ketua Pertandingan mengaktifkan jadwal TGR.</p>
                </CardContent>
            </Card>
        )}
      </main>
    </div>
  );
}
