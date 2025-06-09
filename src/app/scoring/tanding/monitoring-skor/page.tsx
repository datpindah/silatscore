
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogVerificationDescription } from "@/components/ui/dialog";
import { ArrowLeft, Eye, Loader2, RadioTower, Users, ServerCrash } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, TimerMatchStatus, VerificationRequest, JuriVoteValue, PesilatColorIdentity } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { PageTitle } from '@/components/shared/PageTitle';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: 120,
};

export default function MonitoringSkorPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0); // Placeholder
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0); // Placeholder

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [activeDisplayVerificationRequest, setActiveDisplayVerificationRequest] = useState<VerificationRequest | null>(null);
  const [isDisplayVerificationModalOpen, setIsDisplayVerificationModalOpen] = useState(false);

  // Simplified reset function for monitoring
  const resetMatchDisplayData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setTimerStatus(initialTimerStatus);
    setConfirmedScoreMerah(0);
    setConfirmedScoreBiru(0);
    setActiveDisplayVerificationRequest(null);
    setIsDisplayVerificationModalOpen(false);
    setError(null);
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
    }, (err) => {
      console.error("[MonitoringSkor] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, []);

  useEffect(() => {
    if (configMatchId === undefined) {
      setIsLoading(true);
      return;
    }
    if (configMatchId === null) {
      if (activeScheduleId !== null) {
        resetMatchDisplayData();
        setActiveScheduleId(null);
      }
      setIsLoading(false);
      setError("Tidak ada jadwal pertandingan yang aktif.");
      return;
    }
    if (configMatchId !== activeScheduleId) {
      resetMatchDisplayData();
      setActiveScheduleId(configMatchId);
      // setIsLoading(true); // Will be handled by loadData
    }
  }, [configMatchId, activeScheduleId, resetMatchDisplayData]);

  useEffect(() => {
    if (!activeScheduleId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;
      try {
        // Fetch Schedule Details
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
          setError(`Detail jadwal untuk ID ${currentMatchId} tidak ditemukan.`);
          resetMatchDisplayData();
          return;
        }

        // Listen to Match Data (timer, scores - simplified for now)
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        const unsubMatchData = onSnapshot(matchDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) setTimerStatus(data.timer_status as TimerStatus);
            // TODO: Implement logic to derive confirmedScoreMerah/Biru based on Dewan-1's logic
            // For now, this will remain placeholder. A proper implementation
            // would listen to juri_scores and official_actions like dewan-1 page.
          } else {
            setTimerStatus(initialTimerStatus);
            // Reset scores if match doc disappears
            setConfirmedScoreMerah(0);
            setConfirmedScoreBiru(0);
          }
        }, (err) => {
          if (mounted) console.error("[MonitoringSkor] Error fetching match data:", err);
        });
        unsubscribers.push(unsubMatchData);

        // Listener for verification display
        const verificationQuery = query(
          collection(db, MATCHES_TANDING_COLLECTION, currentMatchId, VERIFICATIONS_SUBCOLLECTION),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const unsubVerificationDisplay = onSnapshot(verificationQuery, (snapshot) => {
          if (!mounted) return;
          if (!snapshot.empty) {
            const latestVerification = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
            if (latestVerification.status === 'pending') {
              setActiveDisplayVerificationRequest(latestVerification);
              setIsDisplayVerificationModalOpen(true);
            } else {
              setActiveDisplayVerificationRequest(null);
              setIsDisplayVerificationModalOpen(false);
            }
          } else {
            setActiveDisplayVerificationRequest(null);
            setIsDisplayVerificationModalOpen(false);
          }
        }, (err) => {
          if (mounted) console.error("[MonitoringSkor] Error fetching verification for display:", err);
          setActiveDisplayVerificationRequest(null);
          setIsDisplayVerificationModalOpen(false);
        });
        unsubscribers.push(unsubVerificationDisplay);

      } catch (err) {
        if (mounted) {
          console.error("[MonitoringSkor] Error in loadData:", err);
          setError("Gagal memuat data pertandingan.");
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadData(activeScheduleId);

    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeScheduleId, resetMatchDisplayData]);


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getMatchStatusText = (): string => {
    if (!timerStatus) return "Memuat status...";
    if (timerStatus.matchStatus.startsWith("OngoingRound")) return `Babak ${timerStatus.currentRound} Berlangsung`;
    if (timerStatus.matchStatus.startsWith("PausedRound")) return `Babak ${timerStatus.currentRound} Jeda`;
    if (timerStatus.matchStatus.startsWith("FinishedRound")) return `Babak ${timerStatus.currentRound} Selesai`;
    if (timerStatus.matchStatus.startsWith("PausedForVerificationRound")) return `Babak ${timerStatus.currentRound} Verifikasi`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return `Babak ${timerStatus.currentRound} Menunggu`;
    return "Status Tidak Diketahui";
  };
  
  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-red-500 text-white";
    if (vote === 'biru') return "bg-blue-500 text-white";
    if (vote === 'invalid') return "bg-yellow-400 text-black";
    return "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"; 
  };

  if (isLoading && configMatchId === undefined) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat konfigurasi monitor...</p>
        </main>
      </div>
    );
  }

  if (!activeScheduleId && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title="Monitoring Skor Tanding" />
          <Card className="mt-6 shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl font-headline text-center text-destructive">
                <ServerCrash className="inline-block mr-2 h-6 w-6" />
                Tidak Ada Pertandingan Aktif
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <p className="mb-4 text-muted-foreground">
                {error || "Tidak ada jadwal pertandingan yang aktif untuk dimonitor. Silakan aktifkan jadwal di panel admin."}
              </p>
              <Button variant="outline" asChild>
                <Link href="/admin/schedule-tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Ke Pengaturan Jadwal</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  if (isLoading && activeScheduleId) {
     return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat data pertandingan untuk monitor...</p>
           {matchDetails && <p className="text-sm text-muted-foreground">Partai: {matchDetails.pesilatMerahName} vs {matchDetails.pesilatBiruName}</p>}
        </main>
      </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-800 text-white font-sans">
      {/* Simplified Header for Monitoring - or use full Header */}
      <header className="py-3 px-4 bg-gray-900 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
           <div className="flex items-center gap-2">
            <Eye className="h-8 w-8 text-accent" />
            <h1 className="text-xl md:text-2xl font-bold font-headline">Monitoring Skor Pertandingan</h1>
           </div>
            <Button variant="outline" size="sm" asChild className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200">
              <Link href="/login"><ArrowLeft className="mr-1 h-4 w-4" />Keluar</Link>
            </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-gray-700 to-gray-800 border-gray-600">
          <CardContent className="p-3 md:p-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold font-headline text-accent">PENCAK SILAT</h2>
            {matchDetails ? (
              <p className="text-sm md:text-base text-gray-300">
                {matchDetails.place || "Arena Utama"} | Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
              </p>
            ) : (
              <p className="text-sm md:text-base text-gray-400 italic">Memuat detail pertandingan...</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between p-2 md:p-4">
              <CardHeader className="pb-1 pt-1 px-1 md:pb-2 md:pt-2 md:px-2">
                <CardTitle className="text-lg md:text-2xl font-semibold truncate font-headline">{pesilatBiruInfo?.name || 'PESILAT BIRU'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2">
                {/* TODO: Fetch and display actual score */}
                <span className="text-6xl md:text-9xl font-bold">{confirmedScoreBiru}</span> 
              </CardContent>
            </Card>
          </div>

          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className={cn(
                "text-4xl md:text-6xl font-mono font-bold",
                timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-400" : "text-gray-100"
            )}>{formatTime(timerStatus.timerSeconds)}</div>
            <div className="text-center w-full space-y-1">
                {[1, 2, 3].map((round) => (
                    <div key={`round-indicator-${round}`} 
                         className={cn("py-1 px-2 rounded-md text-sm md:text-base font-semibold w-full",
                                      timerStatus.currentRound === round && !timerStatus.matchStatus.startsWith('PausedForVerification') ? 'bg-accent text-accent-foreground' : 'bg-gray-700 text-gray-300'
                         )}>
                        Babak {round}
                    </div>
                ))}
            </div>
            <p className={cn("text-sm md:text-base text-center px-1 font-semibold",
                timerStatus.matchStatus.startsWith('PausedForVerification') ? "text-orange-400" : "text-gray-300"
             )}>{getMatchStatusText()}</p>
          </div>

          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between p-2 md:p-4">
              <CardHeader className="pb-1 pt-1 px-1 md:pb-2 md:pt-2 md:px-2 text-right">
                <CardTitle className="text-lg md:text-2xl font-semibold truncate font-headline">{pesilatMerahInfo?.name || 'PESILAT MERAH'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-1 md:p-2">
                 {/* TODO: Fetch and display actual score */}
                <span className="text-6xl md:text-9xl font-bold">{confirmedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {/* Score details and other info would go here in a full monitoring page */}
        {/* <Card className="mt-4 shadow-lg bg-gray-700/80 border-gray-600">
            <CardHeader><CardTitle className="text-gray-200">Detail Skor & Log (Segera Hadir)</CardTitle></CardHeader>
            <CardContent><p className="text-gray-400">Area ini akan menampilkan detail skor dari juri dan log tindakan dari ketua pertandingan.</p></CardContent>
        </Card> */}


        {/* Verification Display Modal for Monitoring */}
        <Dialog open={isDisplayVerificationModalOpen} onOpenChange={setIsDisplayVerificationModalOpen}>
          <DialogContent 
            className="sm:max-w-lg bg-gray-800 border-gray-700 text-white" 
            onPointerDownOutside={(e) => e.preventDefault()} 
            onEscapeKeyDown={(e) => e.preventDefault()}
            >
            <DialogHeader>
              <DialogTitle className="text-3xl font-bold font-headline text-center text-accent">Verifikasi Juri</DialogTitle>
              {activeDisplayVerificationRequest && (
                <DialogVerificationDescription className="text-center mt-2" asChild>
                  <div>
                    <div className="text-lg font-semibold text-gray-200">
                      {activeDisplayVerificationRequest.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                    </div>
                    <div className="text-md text-gray-400">Babak {activeDisplayVerificationRequest.round}</div>
                  </div>
                </DialogVerificationDescription>
              )}
            </DialogHeader>
            <div className="my-8 space-y-4">
              <div className="grid grid-cols-3 gap-4 items-stretch justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => (
                  <div key={`vote-display-monitor-${juriKey}`} className="flex flex-col items-center space-y-2">
                    <p className="text-xl font-semibold text-gray-100">J{index + 1}</p>
                    <div className={cn("w-full h-20 rounded-lg flex items-center justify-center text-md font-bold p-2 shadow-lg", 
                                      getJuriVoteDisplayBoxClass(activeDisplayVerificationRequest?.votes[juriKey] || null))}>
                      {activeDisplayVerificationRequest?.votes[juriKey] === 'merah' ? 'SUDUT MERAH' :
                       activeDisplayVerificationRequest?.votes[juriKey] === 'biru' ? 'SUDUT BIRU' :
                       activeDisplayVerificationRequest?.votes[juriKey] === 'invalid' ? 'INVALID' : 
                       'Belum Vote'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </main>
    </div>
  );
}

