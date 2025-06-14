
"use client";

import { useState, useEffect, useCallback, use } from 'react'; 
import Link from 'next/link';
// import { Header } from '@/components/layout/Header'; // Removed, new design is full-screen specific
import { Button } from '@/components/ui/button';
// import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Old UI, removing
import { ArrowLeft, Loader2, Info, XIcon, AlertCircle, CheckCircle2 } from 'lucide-react'; // Using XIcon for the large button, added CheckCircle2
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
  lastUpdated: null,
};

const initialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 180, 
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 180,
};

export default function JuriTGRPage({ params: paramsPromise }: { params: Promise<{ juriId: string }> }) { 
  const resolvedParams = use(paramsPromise); 
  const { juriId } = resolvedParams; 
  const juriDisplayName = `Juri ${juriId?.split('-')[1] || 'TGR Tidak Dikenal'}`;

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [juriScore, setJuriScore] = useState<TGRJuriScore>(initialJuriScore);
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(initialTgrTimerStatus);
  const [isJuriReady, setIsJuriReady] = useState(false);

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
      setIsJuriReady(false);
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
            setScheduleDetails({ ...rawData, id: docSnap.id, date: processedDate } as ScheduleTGR);
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
            const data = docSnap.data() as Partial<TGRJuriScore>;
            const baseScore = data.baseScore ?? initialJuriScore.baseScore;
            const gsCount = data.gerakanSalahCount ?? initialJuriScore.gerakanSalahCount;
            const staminaBonus = data.staminaKemantapanBonus ?? initialJuriScore.staminaKemantapanBonus;
            const juriIsReadyFirestore = data.isReady ?? false;
            
            setJuriScore({
              baseScore: baseScore,
              gerakanSalahCount: gsCount,
              staminaKemantapanBonus: staminaBonus,
              calculatedScore: calculateScore(gsCount, staminaBonus),
              isReady: juriIsReadyFirestore,
              lastUpdated: data.lastUpdated 
            });
            setIsJuriReady(juriIsReadyFirestore);
          } else {
             const newCalculatedScore = calculateScore(initialJuriScore.gerakanSalahCount, initialJuriScore.staminaKemantapanBonus);
            setJuriScore({...initialJuriScore, calculatedScore: newCalculatedScore });
            setIsJuriReady(false);
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

  const saveJuriScore = async (updatedScoreFields: Partial<TGRJuriScore>) => {
    if (!activeMatchId || isSaving) return;
    setIsSaving(true);
    try {
      const scoreToSave: Partial<TGRJuriScore> & { lastUpdated: any } = {
        ...updatedScoreFields, 
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
    if (isInputDisabled) return;
    setJuriScore(prev => {
      const newCount = prev.gerakanSalahCount + 1;
      const newCalculated = calculateScore(newCount, prev.staminaKemantapanBonus);
      const updatedScore = { ...prev, gerakanSalahCount: newCount, calculatedScore: newCalculated };
      saveJuriScore({ gerakanSalahCount: newCount, calculatedScore: newCalculated, isReady: prev.isReady });
      return updatedScore;
    });
  };

  const handleStaminaBonusChange = (bonusValue: number) => {
    if (isInputDisabled) return;
    setJuriScore(prev => {
      const newCalculated = calculateScore(prev.gerakanSalahCount, bonusValue);
      const updatedScore = { ...prev, staminaKemantapanBonus: bonusValue, calculatedScore: newCalculated };
      saveJuriScore({ staminaKemantapanBonus: bonusValue, calculatedScore: newCalculated, isReady: prev.isReady });
      return updatedScore;
    });
  };

  const handleJuriSiap = () => {
    if (!activeMatchId || isSaving || isJuriReady || buttonSiapDisabled) return;
    setIsJuriReady(true);
    const scoreUpdateForFirestore: Partial<TGRJuriScore> = {
        isReady: true,
        baseScore: juriScore.baseScore,
        gerakanSalahCount: juriScore.gerakanSalahCount,
        staminaKemantapanBonus: juriScore.staminaKemantapanBonus,
        calculatedScore: juriScore.calculatedScore,
    };
    saveJuriScore(scoreUpdateForFirestore);
    setJuriScore(prev => ({...prev, isReady: true}));
  };
  
  const formatDisplayDate = (dateString: string | undefined) => {
    if (!dateString) return <Skeleton className="h-4 w-28 inline-block" />;
    try {
      const date = new Date(dateString + 'T00:00:00'); 
      return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) {
      console.warn("Error formatting date in TGR Juri:", e, "Original date string:", dateString);
      return dateString; 
    }
  };

  const isInputDisabled = isLoading || isSaving || !activeMatchId || !matchDetailsLoaded || tgrTimerStatus.matchStatus === 'Finished' || !isJuriReady;
  
  const buttonSiapDisabled = isLoading || isSaving || !activeMatchId || !matchDetailsLoaded || tgrTimerStatus.matchStatus === 'Finished' || isJuriReady;

  const inputDisabledReason = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi global...";
    if (isLoading && activeMatchId) return "Sinkronisasi data pertandingan...";
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan TGR aktif.";
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (isSaving) return "Menyimpan skor...";
    if (error) return `Error: ${error}`;
    if (tgrTimerStatus.matchStatus === 'Finished') return "Penampilan telah Selesai.";
    if (!isJuriReady && activeMatchId && matchDetailsLoaded && tgrTimerStatus.matchStatus !== 'Finished') return "Tekan tombol 'SIAP' untuk memulai penilaian.";
    return "";
  };
  
  const getCategorySpecificName = () => {
    if (!scheduleDetails) return <Skeleton className="h-6 w-48 inline-block" />;
    if (scheduleDetails.category === 'Jurus Tunggal Bebas') {
      return <div className="text-xl md:text-2xl font-semibold text-gray-700 dark:text-gray-300">Tunggal Jurus Bebas</div>;
    }
    return <div className="text-xl md:text-2xl font-semibold text-gray-700 dark:text-gray-300">{scheduleDetails.pesilatMerahName || "Nama Pesilat/Tim"}</div>;
  };
  

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-900 font-sans">
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        {/* Header Info */}
        <div className="mb-4 md:mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
            Kontingen {scheduleDetails?.pesilatMerahContingent || <Skeleton className="h-8 w-40 inline-block" />}
          </h1>
          <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Kategori: {scheduleDetails?.category || <Skeleton className="h-5 w-24 inline-block" />}
          </div>
          {getCategorySpecificName()}
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-600">
            {scheduleDetails?.place || <Skeleton className="h-4 w-20 inline-block" />}
            , {formatDisplayDate(scheduleDetails?.date)} | Partai No: {scheduleDetails?.lotNumber || <Skeleton className="h-4 w-8 inline-block" />}
          </div>
        </div>

        {/* Main Interaction Area */}
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4 md:gap-6 mb-4 md:mb-6 items-stretch">
          {/* Combined Area for X button and SIAP button */}
          <div className="flex flex-col sm:flex-row items-stretch gap-2">
            {/* Kesalahan Gerakan Button */}
            <Button
              variant="default"
              className="flex-grow h-40 md:h-64 text-5xl md:text-7xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-lg flex items-center justify-center"
              onClick={handleGerakanSalah}
              disabled={isInputDisabled}
              aria-label="Kesalahan Gerakan (-0.01)"
            >
              <XIcon className="w-20 h-20 md:w-28 md:h-28" strokeWidth={3}/>
            </Button>

            {/* SIAP Button */}
            <Button
              id="tombol-siap-juri-tgr"
              className={cn(
                "sm:w-32 md:w-40 h-auto sm:h-full text-lg md:text-2xl font-semibold rounded-lg shadow-lg flex flex-col items-center justify-center p-2",
                isJuriReady ? "bg-green-600 hover:bg-green-700 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-black",
                buttonSiapDisabled && !isJuriReady ? "opacity-50 cursor-not-allowed" : "",
                isJuriReady ? "opacity-75 cursor-default" : "" 
              )}
              onClick={handleJuriSiap}
              disabled={buttonSiapDisabled} 
            >
              {isJuriReady ? <CheckCircle2 className="w-8 h-8 md:w-12 md:w-12 mb-2" /> : <Info className="w-8 h-8 md:w-12 md:w-12 mb-2"/>}
              <span className="block text-center">{isJuriReady ? "MENILAI" : "SIAP"}</span>
            </Button>
          </div>

          {/* Detail Gerakan & Placeholder Visual */}
          <div className="flex flex-col bg-gray-200 dark:bg-gray-800 p-3 md:p-4 rounded-lg shadow min-h-[200px] md:h-64">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detail Gerakan</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Urutan Gerakan</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Gerakan yang terlewat</p>
            </div>
            <div className="flex-grow flex items-center justify-center bg-gray-500 dark:bg-gray-700 rounded-md min-h-[100px] md:min-h-[150px]">
              <div className="w-3/5 h-3/5 bg-white dark:bg-gray-200 rounded-full opacity-50"></div>
            </div>
          </div>
        </div>
        
        {/* Skor Akurasi & Stamina */}
        <div className="mb-4 md:mb-6 space-y-2">
            <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 p-3 md:p-4 rounded-md shadow">
                <p className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-300">TOTAL AKURASI SKOR</p>
                <div className="bg-gray-300 dark:bg-gray-700 h-6 w-16 md:h-8 md:w-20 rounded-sm"></div>
            </div>
            
            <div className="text-center my-1">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-500">FLOW OF MOVEMENT / STAMINA (RANGE SKOR : 0.01 - 0.10)</p>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 md:gap-2 px-1">
              {STAMINA_BONUS_OPTIONS.map(bonus => (
                <Button
                  key={bonus}
                  variant={juriScore.staminaKemantapanBonus === bonus ? "default" : "outline"}
                  className={cn(
                    "text-xs md:text-sm h-8 md:h-9 rounded-md", 
                    juriScore.staminaKemantapanBonus === bonus ? "bg-gray-600 dark:bg-gray-400 text-white dark:text-black" : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-600 hover:bg-gray-400 dark:hover:bg-gray-600"
                  )}
                  onClick={() => handleStaminaBonusChange(bonus)}
                  disabled={isInputDisabled}
                >
                  {bonus.toFixed(2)}
                </Button>
              ))}
            </div>
             <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 p-3 md:p-4 rounded-md shadow mt-2">
                <p className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-300">TOTAL SKOR</p>
                <div className="bg-gray-300 dark:bg-gray-700 h-6 w-24 md:h-8 md:w-32 rounded-sm flex items-center justify-center text-sm md:text-base font-bold text-gray-800 dark:text-gray-200">
                  {isLoading ? <Skeleton className="h-5 w-16 bg-gray-400 dark:bg-gray-600"/> : juriScore.calculatedScore.toFixed(2)}
                </div>
            </div>
            <div className="text-xs text-center mt-1 text-gray-500 dark:text-gray-600">
                Pengurangan: {juriScore.gerakanSalahCount} x {GERAKAN_SALAH_DEDUCTION.toFixed(2)} = {(juriScore.gerakanSalahCount * GERAKAN_SALAH_DEDUCTION).toFixed(2)}. Bonus Stamina: {juriScore.staminaKemantapanBonus === undefined ? '0.00' : juriScore.staminaKemantapanBonus.toFixed(2)}
            </div>
        </div>
        
        {/* Footer Buttons & Info */}
        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="w-full max-w-md">
             {inputDisabledReason() && (
                <div className={cn("text-xs text-center p-2 rounded-md mb-2 shadow", error ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" : "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700")}>
                    {error ? <AlertCircle className="inline mr-1 h-4 w-4"/> : <Info className="inline mr-1 h-4 w-4"/>} 
                    {inputDisabledReason()}
                </div>
             )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
            <Button 
                className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 text-sm md:text-base rounded-lg shadow-md" 
                disabled={isLoading || !isJuriReady || tgrTimerStatus.matchStatus !== 'Finished' || isSaving}
            >
              Jurus Selanjutnya
            </Button>
          </div>
           <Link href="/scoring/tgr" className="text-xs text-blue-600 hover:underline mt-4 dark:text-blue-400">
                <ArrowLeft className="inline mr-1 h-3 w-3" /> Kembali ke Pemilihan Peran TGR
           </Link>
        </div>

      </main>
    </div>
  );
}
