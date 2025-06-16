
"use client";

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header';
import { ArrowLeft, Loader2, Info, XIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ScheduleTGR, TGRJuriScore, TGRTimerStatus, SideSpecificTGRScore, GandaElementScores, GandaElementId, TGRCategoryType } from '@/lib/types';
import { BASE_SCORE_GANDA, BASE_SCORE_TUNGGAL_REGU, GERAKAN_SALAH_DEDUCTION_TGR } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';

const STAMINA_BONUS_OPTIONS_TUNGGAL_REGU = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];

const gandaScoringElementsConfig = [
  { id: 'teknikSeranganBertahan', label: 'Teknik Serangan dan Bertahan', range: '(0.01 - 0.30)' },
  { id: 'firmnessHarmony', label: 'Firmness & Harmony', range: '(0.01 - 0.30)' },
  { id: 'soulfulness', label: 'Soulfulness', range: '(0.01 - 0.30)' },
] as const;

const gandaElementButtonValues = Array.from({ length: 30 }, (_, i) => parseFloat(( (i + 1) * 0.01).toFixed(2)));


const initialGandaElementScores: GandaElementScores = {
  teknikSeranganBertahan: 0,
  firmnessHarmony: 0,
  soulfulness: 0,
};

const getInitialSideSpecificScore = (category?: TGRCategoryType): SideSpecificTGRScore => ({
  gerakanSalahCount: category === 'Ganda' ? undefined : 0,
  staminaKemantapanBonus: category === 'Ganda' ? undefined : 0,
  gandaElements: category === 'Ganda' ? { ...initialGandaElementScores } : undefined,
  externalDeductions: 0,
  calculatedScore: category === 'Ganda' ? BASE_SCORE_GANDA : BASE_SCORE_TUNGGAL_REGU,
  isReady: false,
});

const getInitialJuriScoreData = (category?: TGRCategoryType): TGRJuriScore => ({
  biru: getInitialSideSpecificScore(category),
  merah: getInitialSideSpecificScore(category),
  lastUpdated: null,
});


const defaultInitialTgrTimerStatus: TGRTimerStatus = {
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  performanceDurationBiru: 0,
  performanceDurationMerah: 0,
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

  const [juriScore, setJuriScore] = useState<TGRJuriScore>(getInitialJuriScoreData(scheduleDetails?.category));
  const [tgrTimerStatus, setTgrTimerStatus] = useState<TGRTimerStatus>(defaultInitialTgrTimerStatus);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentCategory = scheduleDetails?.category;
  const currentSide = tgrTimerStatus.currentPerformingSide;
  const currentSideScoreData = currentSide ? juriScore[currentSide] : null;


  const calculateSideScoreForJuriDisplay = useCallback((
    sideData: SideSpecificTGRScore | null | undefined,
    category: TGRCategoryType | undefined
  ): number => {
    if (!sideData || !category) {
      return category === 'Ganda' ? BASE_SCORE_GANDA : BASE_SCORE_TUNGGAL_REGU;
    }

    if (category === 'Ganda') {
      const elements = sideData.gandaElements || initialGandaElementScores;
      const elementSum = (elements.teknikSeranganBertahan || 0) +
                         (elements.firmnessHarmony || 0) +
                         (elements.soulfulness || 0);
      // External deductions (from Dewan) are not subtracted here for Juri's display, but on Ketua/Monitor page.
      return parseFloat((BASE_SCORE_GANDA + elementSum).toFixed(2));
    } else { // Tunggal or Regu
      // External deductions (from Dewan) are not subtracted here for Juri's display.
      return parseFloat(
        (BASE_SCORE_TUNGGAL_REGU -
        ((sideData.gerakanSalahCount || 0) * GERAKAN_SALAH_DEDUCTION_TGR) +
        (sideData.staminaKemantapanBonus || 0)
        ).toFixed(2)
      );
    }
  }, []);
  
  useEffect(() => {
    if (currentCategory && juriScore) {
        setJuriScore(prev => ({
            ...prev,
            biru: {
                ...prev.biru,
                calculatedScore: calculateSideScoreForJuriDisplay(prev.biru, currentCategory)
            },
            merah: {
                ...prev.merah,
                calculatedScore: calculateSideScoreForJuriDisplay(prev.merah, currentCategory)
            }
        }));
    }
  }, [juriScore.biru.gerakanSalahCount, juriScore.biru.staminaKemantapanBonus, juriScore.biru.gandaElements, 
      juriScore.merah.gerakanSalahCount, juriScore.merah.staminaKemantapanBonus, juriScore.merah.gandaElements,
      currentCategory, calculateSideScoreForJuriDisplay]);


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

  // Effect to manage overall loading state
  useEffect(() => {
    if (configMatchId === undefined) {
      setIsLoading(true); 
    } else if (activeMatchId === null) {
      setIsLoading(false); 
      setError(null); 
    } else {
      setIsLoading(!matchDetailsLoaded);
    }
  }, [configMatchId, activeMatchId, matchDetailsLoaded]);

  // Effect to sync activeMatchId with configMatchId and reset states
  useEffect(() => {
    if (configMatchId === undefined) {
      return; 
    }

    if (configMatchId !== activeMatchId) {
      setActiveMatchId(configMatchId);
      
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      setJuriScore(getInitialJuriScoreData(undefined)); 
      setTgrTimerStatus(defaultInitialTgrTimerStatus);
      setError(null);
      setIsSaving(false);
    }
  }, [configMatchId, activeMatchId]);


  useEffect(() => {
    if (!activeMatchId) {
      setScheduleDetails(null);
      setMatchDetailsLoaded(false);
      return;
    }
    let mounted = true;

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
          const loadedScheduleDetails = { ...rawData, id: scheduleDocSnap.id, date: processedDate } as ScheduleTGR;
          setScheduleDetails(loadedScheduleDetails);
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
      setJuriScore(getInitialJuriScoreData(undefined));
      return;
    }
    
    // If scheduleDetails is not yet loaded, we might not know the category.
    // Initialize with a generic base or wait for currentCategory to be defined.
    // This effect will re-run when currentCategory (derived from scheduleDetails) updates.
    if (!currentCategory && scheduleDetails) { 
        // Category might become available if scheduleDetails was just loaded
        setJuriScore(getInitialJuriScoreData(scheduleDetails.category));
    } else if (!scheduleDetails) {
        setJuriScore(getInitialJuriScoreData(undefined));
    }


    let mounted = true;
    const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
    const unsubJuriScore = onSnapshot(juriScoreDocRef, (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<TGRJuriScore>;
        const getSideData = (sideData: Partial<SideSpecificTGRScore> | undefined): SideSpecificTGRScore => {
            const initial = getInitialSideSpecificScore(currentCategory); 
            const merged = { ...initial, ...sideData };
            if (currentCategory === 'Ganda') {
                merged.gandaElements = { ...initialGandaElementScores, ...sideData?.gandaElements };
            }
            merged.calculatedScore = calculateSideScoreForJuriDisplay(merged, currentCategory);
            return merged;
        };
        setJuriScore({
          biru: getSideData(data.biru),
          merah: getSideData(data.merah),
          lastUpdated: data.lastUpdated,
        });
      } else {
        setJuriScore(getInitialJuriScoreData(currentCategory));
      }
    }, (err) => {
      if (mounted) setError(`Gagal memuat skor juri: ${err.message}`);
    });
    return () => { mounted = false; unsubJuriScore(); };
  }, [activeMatchId, juriId, currentCategory, calculateSideScoreForJuriDisplay, scheduleDetails]);


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


  const saveJuriScore = useCallback(async (scoreDataFromState: TGRJuriScore) => {
    if (!activeMatchId || isSaving || !currentSide || !currentCategory) {
      console.warn("Save aborted: No activeMatchId, isSaving, no currentSide, or no category.");
      return;
    }
    setIsSaving(true);
    try {
      const prepareSideDataForFirestore = (
        sideData: SideSpecificTGRScore | undefined, 
        category: TGRCategoryType
      ): SideSpecificTGRScore => {
        const initial = getInitialSideSpecificScore(category);
        const currentData = { ...initial, ...sideData }; // Merge current state over defaults

        // Ensure no 'undefined' values are passed for these specific fields.
        // Firestore accepts 'null' for fields that are not set or intentionally empty.
        if (currentData.gerakanSalahCount === undefined) {
          (currentData as any).gerakanSalahCount = null;
        }
        if (currentData.staminaKemantapanBonus === undefined) {
          (currentData as any).staminaKemantapanBonus = null;
        }
        
        if (currentData.gandaElements === undefined) {
          (currentData as any).gandaElements = null;
        } else if (category === 'Ganda' && currentData.gandaElements) {
            // For Ganda, ensure all sub-elements of gandaElements are numbers, not undefined
            const elements = currentData.gandaElements;
            elements.teknikSeranganBertahan = elements.teknikSeranganBertahan ?? 0;
            elements.firmnessHarmony = elements.firmnessHarmony ?? 0;
            elements.soulfulness = elements.soulfulness ?? 0;
        }

        currentData.externalDeductions = currentData.externalDeductions ?? 0;
        currentData.isReady = currentData.isReady ?? false;
        
        // Recalculate score based on this now-sanitized data before saving
        currentData.calculatedScore = calculateSideScoreForJuriDisplay(currentData, category);
        return currentData;
      };

      const scoreToSaveForFirestore: TGRJuriScore = {
        biru: prepareSideDataForFirestore(scoreDataFromState.biru, currentCategory),
        merah: prepareSideDataForFirestore(scoreDataFromState.merah, currentCategory),
        lastUpdated: serverTimestamp() as Timestamp,
      };

      const juriScoreDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
      await setDoc(juriScoreDocRef, scoreToSaveForFirestore, { merge: true });
    } catch (err) {
      setError(`Gagal menyimpan skor: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Error saving Juri TGR score:", err);
    } finally {
      setIsSaving(false);
    }
  }, [activeMatchId, juriId, currentSide, isSaving, currentCategory, calculateSideScoreForJuriDisplay]);


  const scoreActionButtonsDisabled =
    isLoading ||
    isSaving ||
    !activeMatchId ||
    !matchDetailsLoaded ||
    !currentSide || 
    (currentSideScoreData?.isReady && !(currentCategory === 'Ganda' && (tgrTimerStatus.matchStatus === 'Ongoing' || tgrTimerStatus.matchStatus === 'Paused'))) ||
    (tgrTimerStatus.matchStatus !== 'Ongoing' && tgrTimerStatus.matchStatus !== 'Paused') || 
    (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === currentSide); 

  const juriSiapButtonDisabled =
    isLoading ||
    isSaving ||
    !activeMatchId ||
    !matchDetailsLoaded ||
    !currentSide || 
    (currentSideScoreData?.isReady ?? false) || 
    (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === currentSide);


  const handleGerakanSalah = () => {
    if (scoreActionButtonsDisabled || !currentSide || !currentSideScoreData || currentCategory === 'Ganda') return;
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScoreData };
      updatedSideScore.gerakanSalahCount = (updatedSideScore.gerakanSalahCount || 0) + 1;
      const newFullScore = { ...prev, [currentSide]: updatedSideScore };
      saveJuriScore(newFullScore);
      return newFullScore;
    });
  };

  const handleStaminaBonusChange = (bonusValue: number) => {
    if (scoreActionButtonsDisabled || !currentSide || !currentSideScoreData || currentCategory === 'Ganda') return;
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScoreData };
      updatedSideScore.staminaKemantapanBonus = bonusValue;
      const newFullScore = { ...prev, [currentSide]: updatedSideScore };
      saveJuriScore(newFullScore);
      return newFullScore;
    });
  };

  const handleGandaElementScoreChange = (elementId: GandaElementId, scoreValue: number) => {
    if (scoreActionButtonsDisabled || !currentSide || !currentSideScoreData || currentCategory !== 'Ganda') return;
    setJuriScore(prev => {
        const updatedGandaElements = {
            ...(currentSideScoreData.gandaElements || initialGandaElementScores),
            [elementId]: scoreValue,
        };
        const updatedSideScore = { ...currentSideScoreData, gandaElements: updatedGandaElements };
        const newFullScore = { ...prev, [currentSide]: updatedSideScore };
        saveJuriScore(newFullScore);
        return newFullScore;
    });
  };


  const handleJuriSiap = () => {
    if (juriSiapButtonDisabled || !currentSide || !currentSideScoreData) return;
    setJuriScore(prev => {
      const updatedSideScore = { ...currentSideScoreData, isReady: true };
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

  const isJuriSideReady = currentSide && currentSideScoreData ? currentSideScoreData.isReady : false;

  const getStatusText = () => {
    if (configMatchId === undefined && isLoading) return "Memuat konfigurasi global...";
    if (isLoading && activeMatchId) return `Sinkronisasi data pertandingan...`;
    if (!activeMatchId && !isLoading && configMatchId === null) return "Tidak ada pertandingan TGR aktif.";
    if (activeMatchId && !matchDetailsLoaded && !isLoading) return "Menunggu detail pertandingan...";
    if (isSaving) return "Menyimpan skor...";
    if (error) return `Error: ${error}`;
    if (!currentSide) return "Menunggu arahan sisi dari Timer Kontrol.";

    if (currentSideScoreData?.isReady) {
      if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === currentSide) {
        return `Juri SIAP. Penampilan sisi ${currentSide === 'biru' ? 'Biru' : 'Merah'} telah selesai.`;
      }
      return `Juri SIAP. ${ (currentCategory === 'Ganda' && (tgrTimerStatus.matchStatus === 'Ongoing' || tgrTimerStatus.matchStatus === 'Paused')) ? 'Skor elemen Ganda masih dapat diubah.' : (tgrTimerStatus.matchStatus === 'Pending' ? 'Menunggu Timer Kontrol.' : '')}`;
    }
    if (tgrTimerStatus.matchStatus === 'Pending' && tgrTimerStatus.currentPerformingSide === currentSide) {
      return `Sisi ${currentSide === 'biru' ? 'Biru' : 'Merah'} menunggu Timer Kontrol. Tekan SIAP jika penilaian awal selesai.`;
    }
    if (tgrTimerStatus.matchStatus === 'Ongoing' || tgrTimerStatus.matchStatus === 'Paused') {
      return `Input Nilai Terbuka untuk sisi ${currentSide === 'biru' ? 'Biru' : 'Merah'}. Tekan SIAP jika penilaian selesai.`;
    }
    if (tgrTimerStatus.matchStatus === 'Finished' && tgrTimerStatus.currentPerformingSide === currentSide) {
      return `Penampilan sisi ${currentSide === 'biru' ? 'Biru' : 'Merah'} telah selesai. Input ditutup.`;
    }
    return "Status tidak diketahui.";
  };
  
  const displaySideName = tgrTimerStatus.currentPerformingSide ? (tgrTimerStatus.currentPerformingSide === 'biru' ? 'Sudut Biru' : 'Sudut Merah') : 'Belum Ada Sisi Aktif';
  const sideColorClass = currentSide === 'merah' ? 'text-red-600 dark:text-red-400' : currentSide === 'biru' ? 'text-blue-600 dark:text-blue-400' : 'text-primary';

  const getParticipantNameAndContingent = () => {
    if (!scheduleDetails) return { name: "N/A", contingent: "N/A" };
    if (currentSide === 'biru' && scheduleDetails.pesilatBiruName) {
        return { name: scheduleDetails.pesilatBiruName, contingent: scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "N/A" };
    }
    if (currentSide === 'merah' && scheduleDetails.pesilatMerahName) {
        return { name: scheduleDetails.pesilatMerahName, contingent: scheduleDetails.pesilatMerahContingent || "N/A" };
    }
    if (scheduleDetails.pesilatMerahName && !scheduleDetails.pesilatBiruName) {
        return { name: scheduleDetails.pesilatMerahName, contingent: scheduleDetails.pesilatMerahContingent || "N/A" };
    }
    if (scheduleDetails.pesilatBiruName && !scheduleDetails.pesilatMerahName) {
        return { name: scheduleDetails.pesilatBiruName, contingent: scheduleDetails.pesilatBiruContingent || scheduleDetails.pesilatMerahContingent || "N/A" };
    }
    return { name: "Peserta/Tim", contingent: "Kontingen" };
  };
  const { name: participantName, contingent: participantContingent } = getParticipantNameAndContingent();


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-900 font-sans">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <div className="mb-4 md:mb-6 text-center">
          <h1 className={cn("text-2xl md:text-3xl font-bold", sideColorClass)}>
            {juriDisplayName} - {displaySideName}
          </h1>
           <div className={cn("text-xl md:text-2xl font-semibold", sideColorClass)}>
            Kontingen: {participantContingent}
          </div>
          <div className={cn("text-lg md:text-xl", sideColorClass)}>
            {participantName}
          </div>
          <div className="text-xs md:text-sm text-gray-500 dark:text-gray-600">
            {scheduleDetails?.place || <Skeleton className="h-4 w-20 inline-block" />}
            , {formatDisplayDate(scheduleDetails?.date)} | Partai No: {scheduleDetails?.lotNumber || <Skeleton className="h-4 w-8 inline-block" />}
             | Kategori: {currentCategory || <Skeleton className="h-4 w-16 inline-block" />} | Babak: {scheduleDetails?.round || <Skeleton className="h-4 w-16 inline-block" />}
          </div>
        </div>

        {currentCategory === 'Ganda' && currentSide && currentSideScoreData ? (
          <div className="space-y-4 mb-6">
            {gandaScoringElementsConfig.map(element => (
              <Card key={element.id} className="shadow-md">
                <CardHeader className="pb-2 pt-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-md font-semibold">{element.label}</CardTitle>
                      <CardDescription className="text-xs">{element.range}</CardDescription>
                    </div>
                    <div className="text-lg font-bold text-primary">
                      SKOR: {(currentSideScoreData.gandaElements?.[element.id] || 0).toFixed(2)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                    {gandaElementButtonValues.map(val => (
                      <Button
                        key={`${element.id}-${val}`}
                        variant={currentSideScoreData.gandaElements?.[element.id] === val ? "default" : "outline"}
                        className={cn(
                            "text-xs h-7 sm:h-8",
                            currentSideScoreData.gandaElements?.[element.id] === val ? "bg-primary text-primary-foreground" : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                        )}
                        onClick={() => handleGandaElementScoreChange(element.id as GandaElementId, val)}
                        disabled={scoreActionButtonsDisabled}
                      >
                        {val.toFixed(2)}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : currentCategory && (currentCategory === 'Tunggal' || currentCategory === 'Regu') ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6">
            <Button
              className="w-full h-40 md:h-64 text-5xl md:text-7xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-lg flex items-center justify-center p-2"
              onClick={handleGerakanSalah}
              disabled={scoreActionButtonsDisabled}
              aria-label="Kesalahan Gerakan (-0.01)"
            >
              <XIcon className="w-36 h-36 md:w-60 md:h-60" strokeWidth={3} />
            </Button>
            <div className="w-full flex flex-col items-center justify-center p-3 md:p-4 rounded-lg bg-gray-200 dark:bg-gray-800/50 md:h-auto">
              <h3 className="text-sm md:text-base font-semibold text-gray-700 dark:text-gray-300">STAMINA & FLOW OF MOVEMENT</h3>
              <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2">Range Skor Bonus: 0.01 - 0.10</p>
              <div className="grid grid-cols-5 gap-1 md:gap-2 w-full max-w-xs">
                {STAMINA_BONUS_OPTIONS_TUNGGAL_REGU.map(bonus => (
                  <Button
                    key={bonus}
                    variant={currentSideScoreData?.staminaKemantapanBonus === bonus ? "default" : "outline"}
                    className={cn(
                      "text-xs h-7 sm:h-8",
                      currentSideScoreData?.staminaKemantapanBonus === bonus ? "bg-gray-600 dark:bg-gray-400 text-white dark:text-black" : "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-600 hover:bg-gray-400 dark:hover:bg-gray-600"
                    )}
                    onClick={() => handleStaminaBonusChange(bonus)}
                    disabled={scoreActionButtonsDisabled}
                  >
                    {bonus.toFixed(2)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        
        <div className="mb-4 md:mb-6">
            <div className="flex items-center justify-between bg-gray-200 dark:bg-gray-800 p-3 md:p-4 rounded-md shadow">
                <p className="text-md md:text-lg font-semibold text-gray-700 dark:text-gray-300">TOTAL SKOR ({displaySideName})</p>
                <div className="bg-gray-300 dark:bg-gray-700 h-8 w-24 md:h-10 md:w-32 rounded-sm flex items-center justify-center text-md md:text-lg font-bold text-gray-800 dark:text-gray-200">
                  {isLoading || !currentSideScoreData ? <Skeleton className="h-6 w-16 bg-gray-400 dark:bg-gray-600"/> : currentSideScoreData.calculatedScore.toFixed(2)}
                </div>
            </div>
            {currentCategory && (currentCategory === 'Tunggal' || currentCategory === 'Regu') && (
              <div className="text-xs text-center mt-1 text-gray-500 dark:text-gray-600">
                  Pengurangan: {currentSideScoreData?.gerakanSalahCount || 0} x {GERAKAN_SALAH_DEDUCTION_TGR.toFixed(2)} = {((currentSideScoreData?.gerakanSalahCount || 0) * GERAKAN_SALAH_DEDUCTION_TGR).toFixed(2)}.
                  Bonus Stamina: {(currentSideScoreData?.staminaKemantapanBonus ?? 0).toFixed(2)}.
              </div>
            )}
             {currentCategory === 'Ganda' && (
                <div className="text-xs text-center mt-1 text-gray-500 dark:text-gray-600">
                    Teknik: {(currentSideScoreData?.gandaElements?.teknikSeranganBertahan || 0).toFixed(2)},
                    Firmness: {(currentSideScoreData?.gandaElements?.firmnessHarmony || 0).toFixed(2)},
                    Soulfulness: {(currentSideScoreData?.gandaElements?.soulfulness || 0).toFixed(2)}.
                    Base: {BASE_SCORE_GANDA.toFixed(2)}.
                </div>
            )}
        </div>
        
        <Button
            id="tombol-siap-juri-tgr"
            className={cn(
                "w-full h-20 md:h-24 text-lg md:text-2xl font-semibold rounded-lg shadow-lg flex items-center justify-center p-2 sm:p-4 mb-4",
                isJuriSideReady ? "bg-green-600 hover:bg-green-700 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-black",
                juriSiapButtonDisabled && !isJuriSideReady ? "opacity-50 cursor-not-allowed" : "",
                isJuriSideReady ? "opacity-75 cursor-default" : ""
            )}
            onClick={handleJuriSiap}
            disabled={juriSiapButtonDisabled}
        >
            {isJuriSideReady ? <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 mr-2 md:mr-3" /> : <Info className="w-8 h-8 md:w-10 md:h-10 mr-2 md:mr-3" />}
            <span className="block text-center">{isJuriSideReady ? "JURI TELAH SIAP" : "KIRIM SKOR (SIAP)"}</span>
        </Button>

        <div className="flex flex-col items-center gap-3 mt-6">
          <div className="w-full max-w-md">
             {(scoreActionButtonsDisabled || juriSiapButtonDisabled) && (
                <div className={cn("text-xs text-center p-2 rounded-md mb-2 shadow", error ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" : "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700")}>
                    {error ? <AlertCircle className="inline mr-1 h-4 w-4"/> : <Info className="inline mr-1 h-4 w-4"/>}
                    {getStatusText()}
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

