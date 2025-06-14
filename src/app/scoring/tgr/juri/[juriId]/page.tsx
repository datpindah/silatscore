
"use client";

import { useState, useEffect, useCallback, use } from 'react'; 
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
// import { PageTitle } from '@/components/shared/PageTitle'; // Not used directly, remove if not needed
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Loader2, Info, CheckSquare, Square, XIcon, Check, AlertCircle } from 'lucide-react';
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
const STAMINA_BONUS_OPTIONS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];

const initialJuriScore: TGRJuriScore = {
  baseScore: BASE_SCORE_TGR,
  gerakanSalahCount: 0,
  staminaKemantapanBonus: 0.00,
  calculatedScore: BASE_SCORE_TGR,
  isReady: false,
};

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, 
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180,
};

export default function JuriTGRPage({ params: paramsPromise }: { params: Promise<{ juriId: string }> }) { 
  const params = use(paramsPromise); 
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
    return parseFloat((BASE_SCORE_TGR - (gsCount * GERAKAN_SALAH_DEDUCTION) + staminaBonus).toFixed(2));
  }, []);

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
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        unsubSchedule = onSnapshot(scheduleDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const rawData = docSnap.data();
            let processedDate: string;

            if (rawData.date instanceof Timestamp) {
                processedDate = rawData.date.toDate().toISOString().split('T')[0];
            } else if (typeof rawData.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawData.date)) {
                processedDate = rawData.date;
            } else if (rawData.date && typeof rawData.date.seconds === 'number' && typeof rawData.date.nanoseconds === 'number') {
                processedDate = new Date(rawData.date.seconds * 1000).toISOString().split('T')[0];
            } else {
                console.warn(`[${juriDisplayName}] Schedule TGR date is in unexpected format or missing for ID ${activeMatchId}. Defaulting to today.`);
                processedDate = new Date().toISOString().split('T')[0]; 
            }
            setScheduleDetails({ ...rawData, date: processedDate } as ScheduleTGR);
            setMatchDetailsLoaded(true);
          } else {
            setError(`Detail Jadwal TGR (ID: ${activeMatchId}) tidak ditemukan.`);
            setScheduleDetails(null);
            setMatchDetailsLoaded(false);
          }
        }, (err) => {
          if (mounted) setError(`Gagal memuat detail jadwal TGR: ${err.message}`);
        });

        const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
        unsubJuriScore = onSnapshot(juriScoreDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data() as TGRJuriScore;
            setJuriScore({
              ...data,
              isReady: data.isReady || false,
              calculatedScore: calculateScore(data.gerakanSalahCount, data.staminaKemantapanBonus)
            });
          } else {
            setJuriScore({...initialJuriScore, calculatedScore: calculateScore(initialJuriScore.gerakanSalahCount, initialJuriScore.staminaKemantapanBonus) });
          }
        }, (err) => {
          if (mounted) setError(`Gagal memuat skor juri: ${err.message}`);
        });
        
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
  }, [activeMatchId, juriId, calculateScore, juriDisplayName]);

  useEffect(() => {
     if (isLoading && matchDetailsLoaded) {
       setIsLoading(false);
     }
  }, [isLoading, matchDetailsLoaded]);

  const saveJuriScore = async (updatedScore: Partial<TGRJuriScore>) => {
    if (!activeMatchId || isSaving) return;
    setIsSaving(true);
    try {
      const scoreToSave: Partial<TGRJuriScore> = {
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

  const handleGerakanSalah = () => {
    setJuriScore(prev => {
      const newCount = prev.gerakanSalahCount + 1;
      const newCalculated = calculateScore(newCount, prev.staminaKemantapanBonus);
      const updatedScore = { ...prev, gerakanSalahCount: newCount, calculatedScore: newCalculated };
      saveJuriScore(updatedScore);
      return updatedScore;
    });
  };

  const handleStaminaBonusChange = (bonusValue: number) => {
    setJuriScore(prev => {
      const newCalculated = calculateScore(prev.gerakanSalahCount, bonusValue);
      const updatedScore = { ...prev, staminaKemantapanBonus: bonusValue, calculatedScore: newCalculated };
      saveJuriScore(updatedScore);
      return updatedScore;
    });
  };

  const toggleJuriReady = () => {
    setJuriScore(prev => {
        const newReadyState = !prev.isReady;
        const updatedScore = { ...prev, isReady: newReadyState };
        saveJuriScore({ isReady: newReadyState }); 
        return updatedScore;
    });
  };
  
  const formatDisplayDate = (dateString: string | undefined) => {
    if (!dateString) return 'Tanggal tidak tersedia';
    try {
      const date = new Date(dateString + 'T00:00:00'); 
      return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) {
      console.warn("Error formatting date in TGR Juri:", e, "Original date string:", dateString);
      return dateString; 
    }
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

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        {/* Header Info */}
        <Card className="mb-4 shadow-md">
          <CardContent className="p-3 md:p-4 space-y-1">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-semibold text-primary">{scheduleDetails?.pesilatMerahContingent || <Skeleton className="h-5 w-24" />}</div>
                <div className="text-xs text-muted-foreground">
                  {scheduleDetails?.category || <Skeleton className="h-4 w-20" />}
                  {scheduleDetails?.category === 'Jurus Tunggal Bebas' && scheduleDetails.pesilatBiruName && ` vs ${scheduleDetails.pesilatBiruName} (${scheduleDetails.pesilatBiruContingent})`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{scheduleDetails?.place || <Skeleton className="h-5 w-20" />}</div>
                <div className="text-xs text-muted-foreground">{formatDisplayDate(scheduleDetails?.date) || <Skeleton className="h-4 w-24" />}</div>
              </div>
            </div>
            <div className="text-center">
                 <div className="text-lg font-semibold">
                  {scheduleDetails?.pesilatMerahName ? 
                    (scheduleDetails.category === 'Jurus Tunggal Bebas' ? `Tunggal Jurus Bebas` : scheduleDetails.pesilatMerahName) 
                    : <Skeleton className="h-6 w-40 inline-block" />}
                </div>
                 <div className="text-sm text-muted-foreground">Partai No: {scheduleDetails?.lotNumber || <Skeleton className="h-4 w-10 inline-block" />}</div> 
            </div>
          </CardContent>
        </Card>

        {/* Main Interaction Area */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4 mb-4">
          {/* Kesalahan Gerakan Button */}
          <Button 
            variant="default" 
            className="h-40 md:h-64 text-5xl md:text-7xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
            onClick={handleGerakanSalah}
            disabled={isInputDisabled}
          >
            <XIcon className="w-20 h-20 md:w-28 md:h-28" />
          </Button>

          {/* Detail Gerakan & Siap Button */}
          <div className="flex flex-col gap-3">
            <Card className="flex-grow shadow">
              <CardHeader className="p-2 pb-1 md:p-3 md:pb-2">
                <CardTitle className="text-sm font-medium">Detail Gerakan (Placeholder)</CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3 text-xs">
                <p>Urutan Gerakan: ...</p>
                <p>Gerakan yang Terlewat: ...</p>
              </CardContent>
            </Card>
            <Button 
              onClick={toggleJuriReady} 
              disabled={isLoading || isSaving || !activeMatchId || !matchDetailsLoaded}
              className={cn(
                "w-full py-3 text-base font-semibold shadow-md",
                juriScore.isReady ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-300 hover:bg-gray-400 text-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-200"
              )}
            >
              {isSaving && juriScore.isReady !== undefined ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : (juriScore.isReady ? <Check className="mr-2 h-5 w-5"/> : <Square className="mr-2 h-5 w-5"/> )}
              {juriScore.isReady ? "Juri Siap" : "Tandai Siap"}
            </Button>
          </div>
        </div>
        
        {/* Skor Akurasi & Stamina */}
        <Card className="mb-4 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="text-center mb-3">
              <p className="text-sm font-semibold text-muted-foreground">TOTAL AKURASI SKOR</p>
              <p className="text-5xl md:text-6xl font-bold text-primary">{juriScore.calculatedScore.toFixed(2)}</p>
            </div>
            
            <div className="mb-2 text-center">
              <p className="text-xs font-medium text-muted-foreground">FLOW OF MOVEMENT / STAMINA (RANGE SKOR : 0.01 - 0.10)</p>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 md:gap-2">
              {STAMINA_BONUS_OPTIONS.map(bonus => (
                <Button
                  key={bonus}
                  variant={juriScore.staminaKemantapanBonus === bonus ? "default" : "outline"}
                  className={cn("text-xs md:text-sm h-9 md:h-10", juriScore.staminaKemantapanBonus === bonus && "bg-primary text-primary-foreground")}
                  onClick={() => handleStaminaBonusChange(bonus)}
                  disabled={isInputDisabled}
                >
                  {bonus.toFixed(2)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-center mt-1 text-muted-foreground">Pengurangan: {juriScore.gerakanSalahCount} x {GERAKAN_SALAH_DEDUCTION.toFixed(2)} = {(juriScore.gerakanSalahCount * GERAKAN_SALAH_DEDUCTION).toFixed(2)}. Bonus Stamina: {juriScore.staminaKemantapanBonus.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        {/* Footer Buttons */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
           <div className="w-full sm:w-auto">
            {error && <div className="text-sm text-red-500 flex items-center"><AlertCircle className="mr-1 h-4 w-4"/> {error}</div>}
             {inputDisabledReason() && !error && (
                <div className="text-sm text-yellow-700 dark:text-yellow-400 flex items-center"><Info className="mr-1 h-4 w-4"/> {inputDisabledReason()}</div>
             )}
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button variant="outline" asChild className="flex-1 sm:flex-none">
                <Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
            </Button>
            <Button className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white" disabled={isInputDisabled || tgrTimerStatus.matchStatus !== 'Finished'}>
              Jurus Selanjutnya
            </Button>
          </div>
        </div>

      </main>
    </div>
  );
}

