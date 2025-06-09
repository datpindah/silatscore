
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogVerificationDescription } from "@/components/ui/dialog";
import { ArrowLeft, Eye, Loader2, RadioTower, AlertTriangle, Sun, Moon } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, VerificationRequest, JuriVoteValue, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType, RoundScores, TimerMatchStatus } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const JURI_SCORES_SUBCOLLECTION = 'juri_scores';
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

interface DisplayJuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  lastUpdated?: Timestamp;
}

export default function MonitoringSkorPage() {
  const [pageTheme, setPageTheme] = useState<'light' | 'dark'>('light');
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);

  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);
  const [juriScoresData, setJuriScoresData] = useState<Record<string, DisplayJuriMatchData | null>>({
    'juri-1': null, 'juri-2': null, 'juri-3': null
  });
  const prevJuriScoresDataRef = useRef<Record<string, DisplayJuriMatchData | null>>(juriScoresData);

  const [activeJuriHighlights, setActiveJuriHighlights] = useState<Record<string, boolean>>({});
  const highlightTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [activeDisplayVerificationRequest, setActiveDisplayVerificationRequest] = useState<VerificationRequest | null>(null);
  const [isDisplayVerificationModalOpen, setIsDisplayVerificationModalOpen] = useState(false);

  const resetMatchDisplayData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setTimerStatus(initialTimerStatus);
    setConfirmedScoreMerah(0);
    setConfirmedScoreBiru(0);
    setKetuaActionsLog([]);
    setJuriScoresData({'juri-1': null, 'juri-2': null, 'juri-3': null});
    prevJuriScoresDataRef.current = {'juri-1': null, 'juri-2': null, 'juri-3': null};
    setActiveJuriHighlights({});
    Object.values(highlightTimeoutsRef.current).forEach(clearTimeout);
    highlightTimeoutsRef.current = {};
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
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetMatchDisplayData(); setActiveScheduleId(null); }
      setIsLoading(false); setError("Tidak ada jadwal pertandingan yang aktif."); return;
    }
    if (configMatchId !== activeScheduleId) {
        resetMatchDisplayData();
        setActiveScheduleId(configMatchId);
    }
  }, [configMatchId, activeScheduleId, resetMatchDisplayData]);

  useEffect(() => {
    if (!activeScheduleId) {
        setIsLoading(false);
        if (!error?.includes("konfigurasi")) setError(null);
        return;
    }

    setIsLoading(true);
    let mounted = true;
    const unsubscribers: (() => void)[] = [];

    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return;
      try {
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
            setError(`Detail jadwal ID ${currentMatchId} tidak ditemukan.`);
            setMatchDetails(null);
            setPesilatMerahInfo(null);
            setPesilatBiruInfo(null);
            setMatchDetailsLoaded(false);
            setIsLoading(false);
            return;
        }

        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        unsubscribers.push(onSnapshot(matchDocRef, (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) setTimerStatus(data.timer_status as TimerStatus);
            // TODO: Implement score calculation similar to Dewan 1 if needed for confirmed scores
            // For now, confirmed scores are placeholders.
          } else {
            setTimerStatus(initialTimerStatus);
            setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
          }
        }, (err) => {
          if (mounted) console.error("[MonitoringSkor] Error fetching match document (timer/scores):", err);
        }));

        unsubscribers.push(onSnapshot(query(collection(matchDocRef, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc")), (snap) => {
          if (!mounted) return;
          setKetuaActionsLog(snap.docs.map(d => ({ id: d.id, ...d.data() } as KetuaActionLogEntry)));
        }, (err) => {
           if (mounted) console.error("[MonitoringSkor] Error fetching official actions:", err);
        }));

        JURI_IDS.forEach(juriId => {
          unsubscribers.push(onSnapshot(doc(matchDocRef, JURI_SCORES_SUBCOLLECTION, juriId), (juriDocSnap) => {
            if (!mounted) return;
            const newJuriData = juriDocSnap.exists() ? juriDocSnap.data() as DisplayJuriMatchData : null;
            setJuriScoresData(prev => ({ ...prev, [juriId]: newJuriData }));
          },(err) => {
             if (mounted) console.error(`[MonitoringSkor] Error fetching scores for ${juriId}:`, err);
          }));
        });

        unsubscribers.push(onSnapshot(query(collection(matchDocRef, VERIFICATIONS_SUBCOLLECTION), orderBy('timestamp', 'desc'), limit(1)), (snapshot) => {
          if (!mounted) return;
          if (!snapshot.empty) {
            const latestVerification = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VerificationRequest;
            if (latestVerification.status === 'pending') {
              setActiveDisplayVerificationRequest(latestVerification);
              setIsDisplayVerificationModalOpen(true);
            } else {
              // If the latest verification is NOT pending (completed, cancelled),
              // then NO verification modal should be open.
              setActiveDisplayVerificationRequest(null);
              setIsDisplayVerificationModalOpen(false);
            }
          } else {
            // No verifications found
            setActiveDisplayVerificationRequest(null);
            setIsDisplayVerificationModalOpen(false);
          }
        },(err) => {
          if (mounted) {
            console.error("[MonitoringSkor] Error fetching verifications:", err);
            setActiveDisplayVerificationRequest(null);
            setIsDisplayVerificationModalOpen(false);
          }
        }));

      } catch (err) {
          if (mounted) {
              console.error("[MonitoringSkor] Error in loadData:", err);
              setError("Gagal memuat data pertandingan.");
          }
      } finally {
          if (mounted && matchDetailsLoaded) setIsLoading(false);
      }
    };

    loadData(activeScheduleId);
    return () => { mounted = false; unsubscribers.forEach(unsub => unsub()); };
  }, [activeScheduleId, matchDetailsLoaded]);

  useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeScheduleId === null)) {
        setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeScheduleId]);


  useEffect(() => {
    const currentJuriData = juriScoresData;
    const prevJuriData = prevJuriScoresDataRef.current;

    if (!timerStatus || !timerStatus.currentRound) return;
    const roundKey = `round${timerStatus.currentRound}` as keyof RoundScores;

    JURI_IDS.forEach(juriId => {
      const currentScores = currentJuriData[juriId];
      const prevScores = prevJuriData[juriId];

      if (currentScores && timerStatus.currentRound) {
        (['merah', 'biru'] as PesilatColorIdentity[]).forEach(color => {
          const currentRoundEntries = currentScores[color]?.[roundKey] || [];
          const prevRoundEntries = prevScores?.[color]?.[roundKey] || [];

          if (currentRoundEntries.length > prevRoundEntries.length) {
            const newEntry = currentRoundEntries[currentRoundEntries.length - 1];
            if (newEntry) {
              const type = newEntry.points === 1 ? 'pukulan' : 'tendangan';
              const highlightKey = `${color}-${type}-${juriId}`;

              setActiveJuriHighlights(prev => ({ ...prev, [highlightKey]: true }));

              if (highlightTimeoutsRef.current[highlightKey]) {
                clearTimeout(highlightTimeoutsRef.current[highlightKey]);
              }
              highlightTimeoutsRef.current[highlightKey] = setTimeout(() => {
                setActiveJuriHighlights(prev => ({ ...prev, [highlightKey]: false }));
              }, 1000);
            }
          }
        });
      }
    });
    prevJuriScoresDataRef.current = currentJuriData;
  }, [juriScoresData, timerStatus.currentRound, timerStatus]);


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getFoulStatus = (pesilatColor: PesilatColorIdentity, type: KetuaActionType, count: number): boolean => {
    if (!timerStatus || !timerStatus.currentRound) return false;
    const actionsInRound = ketuaActionsLog.filter(
      action => action.pesilatColor === pesilatColor &&
                action.round === timerStatus.currentRound &&
                action.actionType === type
    );
    if (type === "Binaan") {
       const binaanAsliCount = ketuaActionsLog.filter(
        log => log.pesilatColor === pesilatColor &&
               log.round === timerStatus.currentRound &&
               log.actionType === 'Binaan' &&
               !log.originalActionType
      ).length;
      return binaanAsliCount >= count;
    }
    if (type === "Teguran") {
        const teguranCount = ketuaActionsLog.filter(
            log => log.pesilatColor === pesilatColor &&
                   log.round === timerStatus.currentRound &&
                   (log.actionType === 'Teguran' || (log.actionType === 'Teguran' && log.originalActionType === 'Binaan'))
        ).length;
        return teguranCount >= count;
    }
    return actionsInRound.length >= count;
  };

  const FoulBox = ({ label, isActive }: { label: string; isActive: boolean }) => (
    <div className={cn(
      "w-full h-full flex items-center justify-center rounded-sm border text-[9px] md:text-[10px] font-medium leading-tight",
      isActive
        ? "bg-[var(--monitor-foulbox-active-bg)] text-[var(--monitor-foulbox-active-text)] border-[var(--monitor-foulbox-active-border)]"
        : "bg-[var(--monitor-foulbox-inactive-bg)] text-[var(--monitor-foulbox-inactive-text)] border-[var(--monitor-foulbox-inactive-border)] dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500"
    )}>
      {label}
    </div>
  );

  const JuriInputIndicator = ({ juri, type, pesilatColor }: { juri: string; type: 'pukulan' | 'tendangan'; pesilatColor: PesilatColorIdentity }) => {
    const isActive = activeJuriHighlights[`${pesilatColor}-${type}-${juri}`];
    return (
      <div className={cn("flex-1 border py-1 md:py-2 text-center text-xs md:text-sm font-medium rounded-sm dark:border-gray-500",
        isActive ? "bg-[var(--monitor-juri-indicator-active-bg)] text-[var(--monitor-juri-indicator-active-text)] border-[var(--monitor-juri-indicator-inactive-border)]"
                 : "bg-[var(--monitor-juri-indicator-inactive-bg)] text-[var(--monitor-juri-indicator-inactive-text)] border-[var(--monitor-juri-indicator-inactive-border)]")}>
        {juri.toUpperCase().replace('JURI-','J')}
      </div>
    );
  };

  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-[var(--monitor-dialog-vote-merah-bg)] text-[var(--monitor-dialog-vote-merah-text)]";
    if (vote === 'biru') return "bg-[var(--monitor-dialog-vote-biru-bg)] text-[var(--monitor-dialog-vote-biru-text)]";
    if (vote === 'invalid') return "bg-[var(--monitor-dialog-vote-invalid-bg)] text-[var(--monitor-dialog-vote-invalid-text)]";
    return "bg-[var(--monitor-dialog-vote-null-bg)] text-[var(--monitor-dialog-vote-null-text)]";
  };

  const getMatchStatusTextForMonitor = (): string => {
    if (!timerStatus) return "Memuat status...";
    if (timerStatus.matchStatus.startsWith("OngoingRound")) return `Babak ${timerStatus.currentRound} Berlangsung`;
    if (timerStatus.matchStatus.startsWith("PausedRound")) return `Babak ${timerStatus.currentRound} Jeda`;
    if (timerStatus.matchStatus.startsWith("FinishedRound")) return `Babak ${timerStatus.currentRound} Selesai`;
    if (timerStatus.matchStatus.startsWith("PausedForVerificationRound")) return `Verifikasi Babak ${timerStatus.currentRound}`;
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return `Babak ${timerStatus.currentRound} Menunggu`;
    return timerStatus.matchStatus || "Status Tidak Diketahui";
  };


  if (isLoading && configMatchId === undefined) {
    return (
        <div className={cn("flex flex-col min-h-screen items-center justify-center", pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark', "bg-[var(--monitor-bg)] text-[var(--monitor-text)]")}>
            <Loader2 className="h-16 w-16 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-xl">Memuat Konfigurasi Monitor...</p>
        </div>
    );
  }

  return (
    <div className={cn("flex flex-col min-h-screen font-sans overflow-hidden relative", pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark', "bg-[var(--monitor-bg)] text-[var(--monitor-text)]")}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setPageTheme(prev => prev === 'light' ? 'dark' : 'light')}
        className="absolute top-2 right-2 z-[100] bg-[var(--monitor-dialog-bg)] text-[var(--monitor-text)] border-[var(--monitor-border)] hover:bg-[var(--monitor-neutral-bg)]"
        aria-label={pageTheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      >
        {pageTheme === 'dark' ? (
          <Sun className="h-[1.2rem] w-[1.2rem]" />
        ) : (
          <Moon className="h-[1.2rem] w-[1.2rem]" />
        )}
      </Button>
      <div className="bg-[var(--monitor-header-section-bg)] p-4 md:p-5 text-center">
        <div className="grid grid-cols-3 gap-1 md:gap-2 text-xs md:text-sm font-semibold">
          <div>{matchDetails?.place || <Skeleton className="h-4 w-20 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
          <div>{matchDetails?.round || <Skeleton className="h-4 w-20 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
          <div>{matchDetails?.class || <Skeleton className="h-4 w-32 inline-block bg-[var(--monitor-skeleton-bg)]" />}</div>
        </div>
      </div>

      <div className="flex-grow grid grid-cols-[1fr_auto_1fr] gap-1 md:gap-2 p-1 md:p-2 items-stretch">
        {/* Pesilat Biru Side */}
        <div className="flex flex-col items-center flex-1">
          <div className="text-center mb-1 md:mb-2">
            <div className="font-bold text-sm md:text-xl text-[var(--monitor-pesilat-biru-name-text)]">{pesilatBiruInfo?.name || <Skeleton className="h-6 w-32 bg-[var(--monitor-skeleton-bg)]" />}</div>
            <div className="text-xs md:text-base text-[var(--monitor-pesilat-biru-contingent-text)]">{pesilatBiruInfo?.contingent || <Skeleton className="h-4 w-24 bg-[var(--monitor-skeleton-bg)] mt-1" />}</div>
          </div>

          <div className="flex w-full items-stretch gap-1 md:gap-2 mb-1 md:mb-2 h-48 md:h-60">
             <div className="flex flex-col gap-1 p-0.5 w-14 md:w-16 h-full">
                <div className="grid grid-cols-2 gap-1 flex-1">
                    <FoulBox label="B1" isActive={getFoulStatus('biru', 'Binaan', 1)} />
                    <FoulBox label="B2" isActive={getFoulStatus('biru', 'Binaan', 2)} />
                </div>
                <div className="grid grid-cols-2 gap-1 flex-1">
                    <FoulBox label="T1" isActive={getFoulStatus('biru', 'Teguran', 1)} />
                    <FoulBox label="T2" isActive={getFoulStatus('biru', 'Teguran', 2)} />
                </div>
                <div className="grid grid-cols-3 gap-1 flex-1">
                    <FoulBox label="P1" isActive={getFoulStatus('biru', 'Peringatan', 1)} />
                    <FoulBox label="P2" isActive={getFoulStatus('biru', 'Peringatan', 2)} />
                    <FoulBox label="P3" isActive={getFoulStatus('biru', 'Peringatan', 3)} />
                </div>
            </div>
            <div className="flex-grow h-full bg-[var(--monitor-skor-biru-bg)] flex items-center justify-center text-5xl md:text-8xl font-bold rounded-md text-[var(--monitor-skor-text)]">
                {confirmedScoreBiru}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 md:gap-1 w-full">
            <div className="flex gap-0.5 md:gap-1">
              {JURI_IDS.map(id => <JuriInputIndicator key={`biru-pukulan-${id}`} juri={id} type="pukulan" pesilatColor="biru" />)}
            </div>
            <div className="flex gap-0.5 md:gap-1">
              {JURI_IDS.map(id => <JuriInputIndicator key={`biru-tendangan-${id}`} juri={id} type="tendangan" pesilatColor="biru" />)}
            </div>
          </div>
        </div>

        {/* Central Column: Timer, Babak Indicators, Match Status */}
        <div className="flex flex-col items-center justify-start space-y-2 md:space-y-3 px-1 md:px-2 pt-2 md:pt-4">
           <div className="text-4xl md:text-6xl font-mono font-bold text-[var(--monitor-timer-text)] mb-2 md:mb-4">
            {formatTime(timerStatus.timerSeconds)}
          </div>
          <div className="space-y-1 md:space-y-2 w-full max-w-[120px] md:max-w-[180px]">
            {[1, 2, 3].map(b => (
              <div
                key={`babak-indicator-${b}`}
                className={cn(
                  "w-full py-1 md:py-1.5 border-2 flex items-center justify-center text-xs md:text-sm font-semibold rounded-md",
                  timerStatus.currentRound === b
                    ? "bg-[var(--monitor-babak-indicator-active-bg)] text-[var(--monitor-babak-indicator-active-text)] border-[var(--monitor-babak-indicator-active-border)]"
                    : "bg-[var(--monitor-babak-indicator-inactive-bg)] text-[var(--monitor-babak-indicator-inactive-text)] border-[var(--monitor-babak-indicator-inactive-border)]"
                )}
              >
                {b === 1 ? 'I' : b === 2 ? 'II' : 'III'}
              </div>
            ))}
          </div>
          <div className="text-xs md:text-sm text-[var(--monitor-status-text)] mt-1 md:mt-2 text-center">
            {getMatchStatusTextForMonitor()}
          </div>
        </div>

        {/* Pesilat Merah Side */}
        <div className="flex flex-col items-center flex-1">
          <div className="text-center mb-1 md:mb-2">
            <div className="font-bold text-sm md:text-xl text-[var(--monitor-pesilat-merah-name-text)]">{pesilatMerahInfo?.name || <Skeleton className="h-6 w-32 bg-[var(--monitor-skeleton-bg)]" />}</div>
            <div className="text-xs md:text-base text-[var(--monitor-pesilat-merah-contingent-text)]">{pesilatMerahInfo?.contingent || <Skeleton className="h-4 w-24 bg-[var(--monitor-skeleton-bg)] mt-1" />}</div>
          </div>

          <div className="flex w-full items-stretch gap-1 md:gap-2 mb-1 md:mb-2 h-48 md:h-60">
            <div className="flex-grow h-full bg-[var(--monitor-skor-merah-bg)] flex items-center justify-center text-5xl md:text-8xl font-bold rounded-md text-[var(--monitor-skor-text)]">
                {confirmedScoreMerah}
            </div>
             <div className="flex flex-col gap-1 p-0.5 w-14 md:w-16 h-full">
                <div className="grid grid-cols-2 gap-1 flex-1">
                    <FoulBox label="B1" isActive={getFoulStatus('merah', 'Binaan', 1)} />
                    <FoulBox label="B2" isActive={getFoulStatus('merah', 'Binaan', 2)} />
                </div>
                <div className="grid grid-cols-2 gap-1 flex-1">
                    <FoulBox label="T1" isActive={getFoulStatus('merah', 'Teguran', 1)} />
                    <FoulBox label="T2" isActive={getFoulStatus('merah', 'Teguran', 2)} />
                </div>
                <div className="grid grid-cols-3 gap-1 flex-1">
                    <FoulBox label="P1" isActive={getFoulStatus('merah', 'Peringatan', 1)} />
                    <FoulBox label="P2" isActive={getFoulStatus('merah', 'Peringatan', 2)} />
                    <FoulBox label="P3" isActive={getFoulStatus('merah', 'Peringatan', 3)} />
                </div>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 md:gap-1 w-full">
            <div className="flex gap-0.5 md:gap-1">
              {JURI_IDS.map(id => <JuriInputIndicator key={`merah-pukulan-${id}`} juri={id} type="pukulan" pesilatColor="merah" />)}
            </div>
            <div className="flex gap-0.5 md:gap-1">
              {JURI_IDS.map(id => <JuriInputIndicator key={`merah-tendangan-${id}`} juri={id} type="tendangan" pesilatColor="merah" />)}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDisplayVerificationModalOpen} onOpenChange={(isOpen) => {
          if (!isOpen && activeDisplayVerificationRequest?.status === 'pending') return;
          setIsDisplayVerificationModalOpen(isOpen);
      }}>
         <DialogContent
            className={cn("sm:max-w-lg md:max-w-xl bg-[var(--monitor-dialog-bg)] border-[var(--monitor-dialog-border)] text-[var(--monitor-dialog-text)]", pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark')}
            onPointerDownOutside={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}
            onEscapeKeyDown={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}
          >
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl md:text-3xl font-bold font-headline text-[var(--monitor-dialog-title-text)]">
                Verifikasi Juri
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 px-2 md:px-6">
                <div className="text-center mt-2">
                  <div className="text-lg font-semibold">
                    {activeDisplayVerificationRequest?.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                  </div>
                  <div className="text-sm text-[var(--monitor-text-muted)]">Babak {activeDisplayVerificationRequest?.round}</div>
                </div>
              <div className="mt-6 grid grid-cols-3 gap-3 md:gap-4 items-start justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => {
                  const vote = activeDisplayVerificationRequest?.votes[juriKey] || null;
                  let voteText = 'Belum Vote';
                  let voteBoxColorClass = getJuriVoteDisplayBoxClass(vote);
                  if (vote === 'merah') { voteText = 'MERAH'; }
                  else if (vote === 'biru') { voteText = 'BIRU'; }
                  else if (vote === 'invalid') { voteText = 'INVALID';}
                  return (
                    <div key={`vote-display-monitor-${juriKey}`} className="flex flex-col items-center space-y-1 w-full">
                      <p className="text-base md:text-lg font-bold">J{index + 1}</p>
                      <div className={cn("w-full h-12 md:h-16 rounded-md flex items-center justify-center text-[10px] md:text-xs font-bold p-1 shadow-md", voteBoxColorClass)}>
                        {voteText}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
      </Dialog>
      {isLoading && activeScheduleId && !matchDetailsLoaded && (
         <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50">
            <Loader2 className="h-12 w-12 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-lg text-[var(--monitor-overlay-text-primary)]">Memuat Data Monitor...</p>
         </div>
      )}
       {!activeScheduleId && !isLoading && (
         <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50 p-4">
            <AlertTriangle className="h-16 w-16 text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-xl text-center text-[var(--monitor-overlay-text-primary)] mb-2">{error || "Tidak ada pertandingan yang aktif untuk dimonitor."}</p>
            <p className="text-sm text-center text-[var(--monitor-overlay-text-secondary)] mb-6">Silakan aktifkan jadwal di panel admin atau tunggu pertandingan dimulai.</p>
            <Button variant="outline" asChild className="bg-[var(--monitor-overlay-button-bg)] border-[var(--monitor-overlay-button-border)] hover:bg-[var(--monitor-overlay-button-hover-bg)] text-[var(--monitor-overlay-button-text)]">
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
            </Button>
         </div>
      )}
    </div>
  );
}
