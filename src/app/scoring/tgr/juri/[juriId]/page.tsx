
"use client";

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { ArrowLeft, Loader2, Info, XIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ScheduleTGR, TGRJuriScore, TGRTimerStatus, SideSpecificTGRScore } from '@/lib/types';
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

const initialSideSpecificScore: SideSpecificTGRScore = {
  gerakanSalahCount: 0,
  staminaKemantapanBonus: 0.00,
  externalDeductions: 0,
  calculatedScore: BASE_SCORE_TGR,
  isReady: false,
};

const initialJuriScore: TGRJuriScore = {
  baseScore: BASE_SCORE_TGR,
  biru: { ...initialSideSpecificScore },
  merah: { ...initialSideSpecificScore },
  lastUpdated: null,
};

const defaultInitialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDuration: 0,
  currentPerformingSide: null,
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
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(defaultInitialTgrTimerStatus);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSide = tgrTimerStatus.currentPerformingSide;
  const currentSideScore = currentSide ? juriScore[currentSide] : null;

  const calculateSideScore = useCallback((gsCount: number, staminaBonus: number, externalDeductions: number = 0) => {
    return parseFloat((BASE_SCORE_TGR - (gsCount * GERAKAN_SALAH_DEDUCTION) + staminaBonus - externalDeductions).toFixed(2));
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
      setJuriScore(initialJuriScore);
      setTgrTimerStatus(defaultInitialTgrTimerStatus);
      setActiveMatchId(configMatchId);
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      setError(null);
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, isLoading]);

  useEffect(() => {
    if (!activeMatchId) {
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      if(isLoading) setIsLoading(false);
      return;
    }
    let mounted = true;
    if (!isLoading) setIsLoading(true);

    const loadSchedule = async () => {
      if (!mounted) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          const rawData = scheduleDocSnap.data();
          let processedDate: string;
          if (rawData.date instanceof Timestamp) {
            processedDate = rawData.date.toDate().toISOString().split('T')[0];
          } else if (typeof rawData.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawData.date)) {
            processedDate = rawData.date;
          } else if (rawData.date && typeof rawData.date.seconds === 'number' && typeof rawData.date.nanoseconds === 'number') {
            processedDate = new Date(rawData.date.seconds * 1000).toISOString().split('T')[0];
          } else {
            processedDate = new Date().toISOString().split('T')[0];
          }
          setScheduleDetails({ ...rawData, id: scheduleDocSnap.id, date: processedDate } as ScheduleTGR);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail Jadwal TGR (ID: ${activeMatchId}) tidak ditemukan.`);
          setScheduleDetails(null); setMatchDetailsLoaded(false);
        }
      } catch (err) {
        if (mounted) setError(`Error memuat detail jadwal TGR: ${err instanceof Error ? err.message : String(err)}`);
        setScheduleDetails(null); setMatchDetailsLoaded(false);
      }
    };
    loadSchedule();
    return () => { mounted = false; };
  }, [activeMatchId]);

  useEffect(() => {
    if (!activeMatchId || !juriId) {
      setJuriScore(initialJuriScore);
      return;
    }
    let mounted = true;
    const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
    const unsubJuriScore = onSnapshot(juriScoreDocRef, (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<TGRJuriScore>;
        const biruScore = data.biru ? { ...initialSideSpecificScore, ...data.biru } : { ...initialSideSpecificScore };
        const merahScore = data.merah ? { ...initialSideSpecificScore, ...data.merah } : { ...initialSideSpecificScore };

        biruScore.calculatedScore = calculateSideScore(biruScore.gerakanSalahCount, biruScore.staminaKemantapanBonus, biruScore.externalDeductions);
        merahScore.calculatedScore = calculateSideScore(merahScore.gerakanSalahCount, merahScore.staminaKemantapanBonus, merahScore.externalDeductions);

        setJuriScore({
          baseScore: data.baseScore ?? BASE_SCORE_TGR,
          biru: biruScore,
          merah: merahScore,
          lastUpdated: data.lastUpdated,
        });
      } else {
        setJuriScore(initialJuriScore);
      }
    }, (err) => {
      if (mounted) setError(`Gagal memuat skor juri: ${err.message}`);
    });
    return () => { mounted = false; unsubJuriScore(); };
  }, [activeMatchId, juriId, calculateSideScore]);

  useEffect(() => {
    if (!activeMatchId) {
      setTgrTimerStatus(defaultInitialTgrTimerStatus);
      return;
    }
    let mounted = true;
    const matchDataDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId);
    const unsubMatchData = onSnapshot(matchDataDocRef, (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data?.timerStatus) {
          setTgrTimerStatus(data.timerStatus as TGRTimerStatus);
        } else {
          setTgrTimerStatus(defaultInitialTgrTimerStatus);
        }
      } else {
        setTgrTimerStatus(defaultInitialTgrTimerStatus);
      }
    }, (err) => {
      if (mounted) setError(`Gagal sinkronisasi status timer TGR: ${err.message}`);
    });
    return () => { mounted = false; unsubMatchData(); };
  }, [activeMatchId]);

  useEffect(() => {
     if (isLoading && (matchDetailsLoaded || activeMatchId === null)) {
       setIsLoading(false);
     }
  }, [isLoading, matchDetailsLoaded, activeMatchId]);

  const saveJuriScore = async (updatedScoreData: TGRJuriScore) => {
    if (!activeMatchId || isSaving || !currentSide) return;
    setIsSaving(true);
    try {
      const scoreToSave: TGRJuriScore = {
        ...updatedScoreData,
        lastUpdated: serverTimestamp() as Timestamp,
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
    if (isInputDisabled || !currentSide || !currentSideScore) return;
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScore };
      updatedSideScore.gerakanSalahCount = (updatedSideScore.gerakanSalahCount || 0) + 1;
      updatedSideScore.calculatedScore = calculateSideScore(updatedSideScore.gerakanSalahCount, updatedSideScore.staminaKemantapanBonus, updatedSideScore.externalDeductions);
      const newFullScore = { ...prev, [currentSide]: updatedSideScore };
      saveJuriScore(newFullScore);
      return newFullScore;
    });
  };

  const handleStaminaBonusChange = (bonusValue: number) => {
    if (isInputDisabled || !currentSide || !currentSideScore) return;
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScore };
      updatedSideScore.staminaKemantapanBonus = bonusValue;
      updatedSideScore.calculatedScore = calculateSideScore(updatedSideScore.gerakanSalahCount, updatedSideScore.staminaKemantapanBonus, updatedSideScore.externalDeductions);
      const newFullScore = { ...prev, [currentSide]: updatedSideScore };
      saveJuriScore(newFullScore);
      return newFullScore;
    });
  };

  const handleJuriSiap = () => {
    if (buttonSiapDisabled || !currentSide || !currentSideScore) return; // Uses buttonSiapDisabled for its own check
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScore, isReady: true };
      const newFullScore = { ...prev, [currentSide]: updatedSideScore };
      saveJuriScore(newFullScore);
      return newFullScore;
    });
  };

  const formatDisplayDate = (dateString: string | undefined) => {
    if (!dateString) return <Skeleton className="h-4 w-28 inline-block" />;
    try {
      const date = new Date(dateString + 'T00:00:00');
      return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) { return dateString; }
  };

  const isJuriSideReady = currentSide && currentSideScore ? currentSideScore.isReady : false;
  // Scoring inputs are disabled if match is finished or no current side performing.
  const isInputDisabled = isLoading || isSaving || !activeMatchId || !matchDetailsLoaded || tgrTimerStatus.matchStatus === 'Finished' || !tgrTimerStatus.currentPerformingSide;
  // "SIAP" button has an additional condition: it's disabled if this Juri has already marked this side as ready.
  const buttonSiapDisabled = isInputDisabled || isJuriSideReady;


  const inputDisabledReason = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi global...";
    if (isLoading && activeMatchId) return "Sinkronisasi data pertandingan...";
    if (!activeMatchId && !isLoading) return "Tidak ada pertandingan TGR aktif.";
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (isSaving) return "Menyimpan skor...";
    if (error) return `Error: ${error}`;
    if (tgrTimerStatus.matchStatus === 'Finished' && !tgrTimerStatus.currentPerformingSide) return "Partai telah Selesai.";
    if (!tgrTimerStatus.currentPerformingSide) return "Menunggu arahan sisi (Biru/Merah) dari Timer Kontrol.";
    // If isJuriSideReady is true, but isInputDisabled is false, it means they can still input scores
    // We don't need a specific message here if scoring is allowed.
    return "";
  };

  const getCategorySpecificName = () => {
    if (!scheduleDetails) return <Skeleton className="h-6 w-48 inline-block" />;
    let name = "";
    let contingent = "";

    const sideToDisplay = tgrTimerStatus.currentPerformingSide || (scheduleDetails.pesilatBiruName ? 'biru' : 'merah');


    if (sideToDisplay === 'biru' && scheduleDetails.pesilatBiruName) {
        name = scheduleDetails.pesilatBiruName;
        contingent = scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "";
    } else if (scheduleDetails.pesilatMerahName) {
        name = scheduleDetails.pesilatMerahName;
        contingent = scheduleDetails.pesilatMerahContingent || "";
    }
    return (
      <>
        <div className="text-xl md:text-2xl font-semibold text-blue-600 dark:text-blue-400">
          Kontingen: {contingent || <Skeleton className="h-7 w-32 inline-block" />}
        </div>
        <div className="text-lg md:text-xl text-gray-700 dark:text-gray-300">
          {name || "Nama Pesilat/Tim"}
        </div>
      </>
    );
  };

  const displaySide = tgrTimerStatus.currentPerformingSide ? (tgrTimerStatus.currentPerformingSide === 'biru' ? 'Sudut Biru' : 'Sudut Merah') : 'Belum Ada Sisi Aktif';

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-900 font-sans">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="mb-4 md:mb-6 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">
            {juriDisplayName} - {displaySide}
          </h1>
          {getCategorySpecificName()}
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-600">
            {scheduleDetails?.place || <Skeleton className="h-4 w-20 inline-block" />}
            , {formatDisplayDate(scheduleDetails?.date)} | Partai No: {scheduleDetails?.lotNumber || <Skeleton className="h-4 w-8 inline-block" />}
             | Kategori: {scheduleDetails?.category || <Skeleton className="h-4 w-16 inline-block" />} | Babak: {scheduleDetails?.round || <Skeleton className="h-4 w-16 inline-block" />}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-4 mb-4 md:mb-6">
          <Button
            variant="default"
            className="w-full md:w-auto h-40 md:h-64 text-5xl md:text-7xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-lg flex items-center justify-center p-2 md:flex-[2_2_0%]"
            onClick={handleGerakanSalah}
            disabled={isInputDisabled}
            aria-label="Kesalahan Gerakan (-0.01)"
          >
            <XIcon className="w-36 h-36 md:w-60 md:h-60" strokeWidth={3} />
          </Button>

          <div className="w-full md:w-auto flex flex-col items-center justify-center text-center p-3 md:p-4 rounded-lg bg-gray-200 dark:bg-gray-800/50 md:h-auto md:flex-[1_1_0%] my-auto">
            <h3 className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-300">Detail Gerakan</h3>
            <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1">Urutan Gerakan</p>
            <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400">Gerakan yang terlewat</p>
          </div>

          <Button
            id="tombol-siap-juri-tgr"
            className={cn(
              "w-full md:w-auto h-40 md:h-64 text-lg md:text-2xl font-semibold rounded-lg shadow-lg flex flex-col items-center justify-center p-2 sm:p-4 md:flex-[2_2_0%]",
              isJuriSideReady ? "bg-green-600 hover:bg-green-700 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-black",
              buttonSiapDisabled && !isJuriSideReady ? "opacity-50 cursor-not-allowed" : "",
              isJuriSideReady ? "opacity-75 cursor-default" : "" // Still allow click if not fully disabled by match state
            )}
            onClick={handleJuriSiap}
            disabled={buttonSiapDisabled} // This button specifically uses buttonSiapDisabled
          >
            {isJuriSideReady ? <CheckCircle2 className="w-8 h-8 md:w-12 md:h-12 mb-1 md:mb-2" /> : <Info className="w-8 h-8 md:w-12 md:h-12 mb-1 md:mb-2" />}
            <span className="block text-center">{isJuriSideReady ? "MENILAI" : "SIAP"}</span>
          </Button>
        </div>

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
                  variant={currentSideScore?.staminaKemantapanBonus === bonus ? "default" : "outline"}
                  className={cn(
                    "text-xs md:text-sm h-8 md:h-9 rounded-md",
                    currentSideScore?.staminaKemantapanBonus === bonus ? "bg-gray-600 dark:bg-gray-400 text-white dark:text-black" : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-600 hover:bg-gray-400 dark:hover:bg-gray-600"
                  )}
                  onClick={() => handleStaminaBonusChange(bonus)}
                  disabled={isInputDisabled}
                >
                  {bonus.toFixed(2)}
                </Button>
              ))}
            </div>
             <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 p-3 md:p-4 rounded-md shadow mt-2">
                <p className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-300">TOTAL SKOR ({displaySide})</p>
                <div className="bg-gray-300 dark:bg-gray-700 h-6 w-24 md:h-8 md:w-32 rounded-sm flex items-center justify-center text-sm md:text-base font-bold text-gray-800 dark:text-gray-200">
                  {isLoading || !currentSideScore ? <Skeleton className="h-5 w-16 bg-gray-400 dark:bg-gray-600"/> : currentSideScore.calculatedScore.toFixed(2)}
                </div>
            </div>
            <div className="text-xs text-center mt-1 text-gray-500 dark:text-gray-600">
                Pengurangan: {currentSideScore?.gerakanSalahCount || 0} x {GERAKAN_SALAH_DEDUCTION.toFixed(2)} = {((currentSideScore?.gerakanSalahCount || 0) * GERAKAN_SALAH_DEDUCTION).toFixed(2)}.
                Bonus Stamina: {(currentSideScore?.staminaKemantapanBonus ?? 0).toFixed(2)}.
                Penalti Dewan: {(currentSideScore?.externalDeductions ?? 0).toFixed(2)}.
            </div>
        </div>

        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="w-full max-w-md">
             {inputDisabledReason() && (
                <div className={cn("text-xs text-center p-2 rounded-md mb-2 shadow", error ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" : "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700")}>
                    {error ? <AlertCircle className="inline mr-1 h-4 w-4"/> : <Info className="inline mr-1 h-4 w-4"/>}
                    {inputDisabledReason()}
                </div>
             )}
          </div>
           <Link href="/scoring/tgr/login" className="text-xs text-blue-600 hover:underline mt-4 dark:text-blue-400">
                <ArrowLeft className="inline mr-1 h-3 w-3" /> Kembali ke Login Panel TGR
           </Link>
        </div>
      </main>
    </div>
  );
}
