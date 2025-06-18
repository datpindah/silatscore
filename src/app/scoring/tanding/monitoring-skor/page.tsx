
"use client";

import { useState, useEffect, useCallback, useRef, Suspense, type PointerEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/Header'; 
import { ArrowLeft, Eye, Loader2, RadioTower, AlertTriangle, Sun, Moon, ChevronsRight } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, VerificationRequest, JuriVoteValue, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType } from '@/lib/types';
import type { ScoreEntry as LibScoreEntryType, RoundScores as LibRoundScoresType } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy, limit, Timestamp, setDoc, where, getDocs, updateDoc, deleteField } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle as RadixDialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from '@/components/ui/card';


const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const VERIFICATIONS_SUBCOLLECTION = 'verifications';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';
const JURI_SCORES_SUBCOLLECTION = 'juri_scores';
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'] as const;
const JURI_INPUT_VALIDITY_WINDOW_MS = 2000;


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

interface ScoreEntry extends LibScoreEntryType {}

interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
  key: string;
  round: keyof LibRoundScoresType;
  color: 'merah' | 'biru';
}

function MonitoringSkorPageComponent({ gelanggangName }: { gelanggangName: string | null }) {
  const [pageTheme, setPageTheme] = useState<'light' | 'dark'>('light');
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  const [prevSavedUnstruckKeysFromDewan, setPrevSavedUnstruckKeysFromDewan] = useState<Set<string>>(new Set());


  const [ketuaActionsLog, setKetuaActionsLog] = useState<KetuaActionLogEntry[]>([]);
  const [juriScoresData, setJuriScoresData] = useState<Record<string, LibRoundScoresType | null>>({
    'juri-1': null, 'juri-2': null, 'juri-3': null
  });
  const prevJuriScoresDataRef = useRef<Record<string, LibRoundScoresType | null>>(juriScoresData);

  const [activeJuriHighlights, setActiveJuriHighlights] = useState<Record<string, boolean>>({});
  const highlightTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [activeDisplayVerificationRequest, setActiveDisplayVerificationRequest] = useState<VerificationRequest | null>(null);
  const [isDisplayVerificationModalOpen, setIsDisplayVerificationModalOpen] = useState(false);
  const [isNavigatingNextMatch, setIsNavigatingNextMatch] = useState(false);

  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isMouseOverPageHeader, setIsMouseOverPageHeader] = useState(false);
  const PAGE_HEADER_ACTIVATION_THRESHOLD_PX = 50;


  const resetMatchDisplayData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setTimerStatus(initialTimerStatus);
    setConfirmedScoreMerah(0);
    setConfirmedScoreBiru(0);
    setPrevSavedUnstruckKeysFromDewan(new Set());
    setKetuaActionsLog([]);
    setJuriScoresData({'juri-1': null, 'juri-2': null, 'juri-3': null});
    prevJuriScoresDataRef.current = {'juri-1': null, 'juri-2': null, 'juri-3': null};
    setActiveJuriHighlights({});
    Object.values(highlightTimeoutsRef.current).forEach(clearTimeout);
    highlightTimeoutsRef.current = {};
    setActiveDisplayVerificationRequest(null);
    setIsDisplayVerificationModalOpen(false);
    setError(null);
    setIsNavigatingNextMatch(false);
  }, []);

 useEffect(() => {
    if (!gelanggangName) {
      setError("Nama gelanggang tidak ditemukan di URL.");
      setConfigMatchId(null);
      setIsLoading(false);
      return;
    }
    setError(null);
    setIsLoading(true);

    const unsubGelanggangMap = onSnapshot(doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH), (docSnap) => {
      let newDbConfigId: string | null = null;
      if (docSnap.exists()) {
        newDbConfigId = docSnap.data()?.[gelanggangName] || null;
      }
      setConfigMatchId(prevId => (prevId === newDbConfigId ? prevId : newDbConfigId));
      if (!newDbConfigId) {
         setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
      }
    }, (err) => {
      console.error(`[MonitorSkor] Error fetching active matches by gelanggang map:`, err);
      setError("Gagal memuat peta jadwal aktif per gelanggang.");
      setConfigMatchId(null);
    });
    return () => unsubGelanggangMap();
  }, [gelanggangName]);


  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    if (configMatchId === null) {
      if (activeScheduleId !== null) { resetMatchDisplayData(); setActiveScheduleId(null); }
      setIsLoading(false); 
      if (!error && gelanggangName) setError(`Tidak ada jadwal Tanding aktif untuk Gelanggang: ${gelanggangName}.`);
      return;
    }
    if (configMatchId !== activeScheduleId) {
        resetMatchDisplayData();
        setActiveScheduleId(configMatchId);
    }
  }, [configMatchId, activeScheduleId, resetMatchDisplayData, gelanggangName, error]);

  useEffect(() => {
    if (!activeScheduleId) {
        setIsLoading(false);
        if (!error?.includes("konfigurasi") && !error?.includes("Tidak ada jadwal")) setError(null);
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
            setPrevSavedUnstruckKeysFromDewan(new Set(data?.confirmed_unstruck_keys_log as string[] || []));
          } else {
            setTimerStatus(initialTimerStatus);
            setPrevSavedUnstruckKeysFromDewan(new Set());
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
            const newJuriData = juriDocSnap.exists() ? juriDocSnap.data() as LibRoundScoresType : null;
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
              setActiveDisplayVerificationRequest(null);
              setIsDisplayVerificationModalOpen(false);
            }
          } else {
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
  }, [activeScheduleId, matchDetailsLoaded, resetMatchDisplayData]);

 useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeScheduleId === null)) {
        setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeScheduleId]);


  useEffect(() => {
    if (!activeScheduleId || Object.values(juriScoresData).every(data => data === null) && prevSavedUnstruckKeysFromDewan.size === 0) {
        let calculatedTotalMerah = 0;
        let calculatedTotalBiru = 0;
        ketuaActionsLog.forEach(action => {
            if (action.pesilatColor === 'merah') calculatedTotalMerah += action.points;
            else if (action.pesilatColor === 'biru') calculatedTotalBiru += action.points;
        });
        setConfirmedScoreMerah(calculatedTotalMerah);
        setConfirmedScoreBiru(calculatedTotalBiru);
        return;
    }

    const allRawEntries: CombinedScoreEntry[] = [];
    JURI_IDS.forEach(juriId => {
        const juriData = juriScoresData[juriId];
        if (juriData) {
            (['merah', 'biru'] as const).forEach(pesilatColor => {
                (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
                    const roundSpecificScores = (juriData as any)[pesilatColor]?.[roundKey] as ScoreEntry[] | undefined;
                    roundSpecificScores?.forEach(entry => {
                        if (entry && entry.timestamp && typeof entry.timestamp.toMillis === 'function') {
                            const entryKey = `${juriId}_${entry.timestamp.toMillis()}_${entry.points}`;
                            allRawEntries.push({
                                ...entry,
                                juriId: juriId,
                                key: entryKey,
                                round: roundKey,
                                color: pesilatColor
                            });
                        }
                    });
                });
            });
        }
    });

    const confirmedUnstruckEntries = allRawEntries.filter(e => prevSavedUnstruckKeysFromDewan.has(e.key));

    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    const scoredPairKeys = new Set<string>();

    for (let i = 0; i < confirmedUnstruckEntries.length; i++) {
        const e1 = confirmedUnstruckEntries[i];
        if (scoredPairKeys.has(e1.key)) continue;

        const agreeingPartners = [e1];
        for (let j = i + 1; j < confirmedUnstruckEntries.length; j++) {
            const e2 = confirmedUnstruckEntries[j];
            if (scoredPairKeys.has(e2.key)) continue;

            if (e1.juriId !== e2.juriId &&
                e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= JURI_INPUT_VALIDITY_WINDOW_MS) {
                agreeingPartners.push(e2);
            }
        }

        if (agreeingPartners.length >= 2) {
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;
            agreeingPartners.forEach(p => scoredPairKeys.add(p.key));
        }
    }

    ketuaActionsLog.forEach(action => {
        if (action.pesilatColor === 'merah') calculatedTotalMerah += action.points;
        else if (action.pesilatColor === 'biru') calculatedTotalBiru += action.points;
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);

}, [juriScoresData, prevSavedUnstruckKeysFromDewan, ketuaActionsLog, activeScheduleId]);


  useEffect(() => {
    const currentJuriData = juriScoresData;
    const prevJuriData = prevJuriScoresDataRef.current;

    if (!timerStatus || !timerStatus.currentRound) return;
    const roundKey = `round${timerStatus.currentRound}` as keyof LibRoundScoresType;

    JURI_IDS.forEach(juriId => {
      const currentJuriScoresForId = currentJuriData[juriId];
      const prevJuriScoresForId = prevJuriData[juriId];

      if (currentJuriScoresForId && timerStatus.currentRound) {
        (['merah', 'biru'] as PesilatColorIdentity[]).forEach(color => {
          const currentRoundEntries = (currentJuriScoresForId as any)[color]?.[roundKey] || [];
          const prevRoundEntries = (prevJuriScoresForId as any)?.[color]?.[roundKey] || [];

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

  useEffect(() => {
    const handlePageHeaderMouseMove = (event: MouseEvent) => {
      if (event.clientY < PAGE_HEADER_ACTIVATION_THRESHOLD_PX) {
        setIsHeaderVisible(true);
      } else {
        if (!isMouseOverPageHeader) {
          setIsHeaderVisible(false);
        }
      }
    };
    const handlePageHeaderDocumentMouseLeave = () => {
      if (!isMouseOverPageHeader) {
        setIsHeaderVisible(false);
      }
    };
    document.addEventListener('mousemove', handlePageHeaderMouseMove);
    document.documentElement.addEventListener('mouseleave', handlePageHeaderDocumentMouseLeave);
    return () => {
      document.removeEventListener('mousemove', handlePageHeaderMouseMove);
      document.documentElement.removeEventListener('mouseleave', handlePageHeaderDocumentMouseLeave);
    };
  }, [isMouseOverPageHeader]);

  const handlePageHeaderMouseEnter = () => {
    setIsMouseOverPageHeader(true);
    setIsHeaderVisible(true);
  };

  const handlePageHeaderMouseLeave = (event: PointerEvent<HTMLElement>) => {
    setIsMouseOverPageHeader(false);
    if (event.clientY >= PAGE_HEADER_ACTIVATION_THRESHOLD_PX) {
      setIsHeaderVisible(false);
    }
  };


  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

 const getFoulStatus = (pesilatColor: PesilatColorIdentity, type: KetuaActionType, count: number): boolean => {
    if (!timerStatus || !timerStatus.currentRound) return false;

    if (type === "Binaan") {
      const pureBinaanActions = ketuaActionsLog.filter(
        log => log.pesilatColor === pesilatColor &&
               log.round === timerStatus.currentRound &&
               log.actionType === 'Binaan' &&
               typeof log.originalActionType === 'undefined'
      );
      const convertedBinaanToTeguranActions = ketuaActionsLog.filter(
        log => log.pesilatColor === pesilatColor &&
               log.round === timerStatus.currentRound &&
               log.actionType === 'Teguran' &&
               log.originalActionType === 'Binaan'
      );

      if (count === 1) {
        return pureBinaanActions.length >= 1;
      }
      if (count === 2) {
        return pureBinaanActions.length >= 1 && convertedBinaanToTeguranActions.length >= 1;
      }
      return false;
    }

    const actionsInRound = ketuaActionsLog.filter(
      action => action.pesilatColor === pesilatColor &&
                action.round === timerStatus.currentRound &&
                action.actionType === type
    );

    if (type === "Teguran") {
        const teguranCount = ketuaActionsLog.filter(
            log => log.pesilatColor === pesilatColor &&
                   log.round === timerStatus.currentRound &&
                   log.actionType === 'Teguran' &&
                   (typeof log.originalActionType === 'undefined' || log.originalActionType === null)
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

  const handleNextMatchNavigation = async () => {
    if (!activeScheduleId || !matchDetails || timerStatus.matchStatus !== 'MatchFinished' || !gelanggangName) {
        alert("Pertandingan saat ini belum selesai atau detail/gelanggang tidak tersedia.");
        return;
    }
    setIsNavigatingNextMatch(true);
    try {
        const currentMatchNumber = matchDetails.matchNumber;
        const schedulesRef = collection(db, SCHEDULE_TANDING_COLLECTION);
        const q = query(
            schedulesRef,
            where('place', '==', gelanggangName),
            where('matchNumber', '>', currentMatchNumber),
            orderBy('matchNumber', 'asc'),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        const venueMapRef = doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH);

        if (querySnapshot.empty) {
            alert(`Ini adalah partai terakhir untuk Gelanggang: ${gelanggangName}. Tidak ada partai berikutnya.`);
             await updateDoc(venueMapRef, { [gelanggangName]: deleteField() });
        } else {
            const nextMatchDoc = querySnapshot.docs[0];
            await updateDoc(venueMapRef, { [gelanggangName]: nextMatchDoc.id });
        }
    } catch (err) {
        console.error("Error navigating to next match:", err);
        alert("Gagal berpindah ke partai berikutnya.");
    } finally {
        setIsNavigatingNextMatch(false);
    }
  };

  if (!gelanggangName && !isLoading) {
    return (
      <div className={cn("flex flex-col min-h-screen items-center justify-center", pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark', "bg-gray-100 dark:bg-gray-900 text-[var(--monitor-text)]")}>
        <AlertTriangle className="h-16 w-16 text-[var(--monitor-overlay-accent-text)] mb-4" />
        <p className="text-xl text-center text-[var(--monitor-overlay-text-primary)] mb-2">Gelanggang Tidak Ditemukan</p>
        <p className="text-sm text-center text-[var(--monitor-overlay-text-secondary)] mb-6">Parameter 'gelanggang' tidak ada di URL. Halaman monitor tidak bisa memuat data.</p>
        <Button variant="outline" asChild className="bg-[var(--monitor-overlay-button-bg)] border-[var(--monitor-overlay-button-border)] hover:bg-[var(--monitor-overlay-button-hover-bg)] text-[var(--monitor-overlay-button-text)]">
          <Link href={`/login?redirect=/scoring/tanding/monitoring-skor`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
        </Button>
      </div>
    );
  }

  if (isLoading && configMatchId === undefined) {
    return (
        <div className={cn("flex flex-col min-h-screen items-center justify-center", pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark', "bg-gray-100 dark:bg-gray-900 text-[var(--monitor-text)]")}>
            <Loader2 className="h-16 w-16 animate-spin text-[var(--monitor-overlay-accent-text)] mb-4" />
            <p className="text-xl">Memuat Konfigurasi Monitor untuk Gelanggang: {gelanggangName || '...'}</p>
        </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900">
      <Header overrideBackgroundClass="bg-gray-100 dark:bg-gray-900" />
      <div
        className={cn(
          "flex flex-col flex-1 font-sans",
          pageTheme === 'light' ? 'monitoring-theme-light' : 'monitoring-theme-dark',
          "bg-[var(--monitor-bg)] text-[var(--monitor-text)]" 
        )}
      >
        <Card
          onMouseEnter={handlePageHeaderMouseEnter}
          onMouseLeave={handlePageHeaderMouseLeave}
          className={cn(
            "sticky top-0 z-40 mb-2 md:mb-4 shadow-xl bg-gradient-to-r from-primary to-red-700 text-primary-foreground mx-1 md:mx-2 mt-1 md:mt-2",
            "transition-transform duration-300 ease-in-out",
            isHeaderVisible ? "transform-none" : "-translate-y-full"
          )}
        >
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">
              GELANGGANG: {gelanggangName || <Skeleton className="h-6 w-20 inline-block bg-red-400" />}
            </h1>
            {matchDetails && matchDetailsLoaded && (
              <div className="text-xs md:text-sm">
                Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
              </div>
            )}
            {isLoading && !matchDetailsLoaded && activeScheduleId && (
              <div className="text-xs md:text-sm">
                <Skeleton className="h-4 w-16 inline-block bg-red-400" /> | <Skeleton className="h-4 w-12 inline-block bg-red-400" /> | <Skeleton className="h-4 w-20 inline-block bg-red-400" />
              </div>
            )}
             {error && !isLoading && !matchDetailsLoaded && (
              <div className="text-xs md:text-sm text-yellow-300 mt-1">
                Gagal memuat detail pertandingan. {error}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-grow flex flex-col p-1 md:p-2">
          <div className="grid grid-cols-[minmax(0,_1fr)_minmax(0,_0.6fr)_minmax(0,_1fr)] gap-1 items-stretch mb-2 md:mb-4">
            <div className="flex flex-col items-center flex-1">
              <div className="text-center mb-1 md:mb-2 w-full">
                <div className="font-bold text-sm md:text-xl text-[var(--monitor-pesilat-biru-name-text)]">{pesilatBiruInfo?.name || <Skeleton className="h-6 w-32 bg-[var(--monitor-skeleton-bg)]" />}</div>
                <div className="text-xs md:text-base text-[var(--monitor-pesilat-biru-contingent-text)]">{pesilatBiruInfo?.contingent || <Skeleton className="h-4 w-24 bg-[var(--monitor-skeleton-bg)] mt-1" />}</div>
              </div>
              <div className="flex w-full items-stretch gap-1 md:gap-2 mb-1 md:mb-2 h-56 md:h-72">
                <div className="flex flex-col gap-2 p-0.5 w-20 md:w-24 h-full">
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
                    {isLoading && !matchDetailsLoaded ? <Skeleton className="h-16 w-20 bg-blue-400" /> : confirmedScoreBiru}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-start space-y-2 md:space-y-3 pt-1 md:pt-2">
               <div className="text-5xl md:text-7xl font-mono font-bold text-[var(--monitor-timer-text)] mb-2 md:mb-4">
                {isLoading && !matchDetailsLoaded ? <Skeleton className="h-16 w-48 bg-[var(--monitor-skeleton-bg)]" /> : formatTime(timerStatus.timerSeconds)}
              </div>
              <div className="space-y-1 md:space-y-2 w-full max-w-[180px]">
                {[1, 2, 3].map(b => (
                  <div
                    key={`babak-indicator-${b}`}
                    className={cn(
                      "w-full py-1.5 md:py-2 border-2 flex items-center justify-center text-xs md:text-sm font-semibold rounded-md",
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
                {isLoading && !matchDetailsLoaded ? <Skeleton className="h-4 w-40 bg-[var(--monitor-skeleton-bg)]" /> : getMatchStatusTextForMonitor()}
              </div>
            </div>

            <div className="flex flex-col items-center flex-1">
              <div className="text-center mb-1 md:mb-2 w-full">
                <div className="font-bold text-sm md:text-xl text-[var(--monitor-pesilat-merah-name-text)]">{pesilatMerahInfo?.name || <Skeleton className="h-6 w-32 bg-[var(--monitor-skeleton-bg)]" />}</div>
                <div className="text-xs md:text-base text-[var(--monitor-pesilat-merah-contingent-text)]">{pesilatMerahInfo?.contingent || <Skeleton className="h-4 w-24 bg-[var(--monitor-skeleton-bg)] mt-1" />}</div>
              </div>
              <div className="flex w-full items-stretch gap-1 md:gap-2 mb-1 md:mb-2 h-56 md:h-72">
                <div className="flex-grow h-full bg-[var(--monitor-skor-merah-bg)] flex items-center justify-center text-5xl md:text-8xl font-bold rounded-md text-[var(--monitor-skor-text)]">
                    {isLoading && !matchDetailsLoaded ? <Skeleton className="h-16 w-20 bg-red-400" /> : confirmedScoreMerah}
                </div>
                <div className="flex flex-col gap-2 p-0.5 w-20 md:w-24 h-full">
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
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,_1fr)_minmax(0,_0.6fr)_minmax(0,_1fr)] gap-1 items-start">
            <div className="flex flex-col items-center flex-1">
              <div className="flex flex-col gap-0.5 md:gap-1 w-full">
                <div className="flex gap-0.5 md:gap-1">
                  {JURI_IDS.map(id => <JuriInputIndicator key={`biru-pukulan-${id}`} juri={id} type="pukulan" pesilatColor="biru" />)}
                </div>
                <div className="flex gap-0.5 md:gap-1">
                  {JURI_IDS.map(id => <JuriInputIndicator key={`biru-tendangan-${id}`} juri={id} type="tendangan" pesilatColor="biru" />)}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-start w-full">
              <div className="w-full max-w-[180px] flex flex-col space-y-1 md:space-y-2">
                  <div className="py-1 md:py-2 border border-[var(--monitor-border)] rounded-md flex items-center justify-center text-xs md:text-sm text-[var(--monitor-text)] bg-[var(--monitor-babak-indicator-inactive-bg)] shadow-sm">
                      Pukulan
                  </div>
                  <div className="py-1 md:py-2 border border-[var(--monitor-border)] rounded-md flex items-center justify-center text-xs md:text-sm text-[var(--monitor-text)] bg-[var(--monitor-babak-indicator-inactive-bg)] shadow-sm">
                      Tendangan
                  </div>
              </div>
            </div>

            <div className="flex flex-col items-center flex-1">
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
              <RadixDialogTitle className="sr-only">Konfirmasi Verifikasi Juri</RadixDialogTitle>
              <DialogHeader className="text-center">
                <div className="text-2xl md:text-3xl font-bold font-headline text-[var(--monitor-dialog-title-text)]">
                  Verifikasi Juri
                </div>
              </DialogHeader>
              <div className="py-4 px-2 md:px-6">
                  <div className="text-center mt-2">
                    <div className="text-lg font-semibold text-[var(--monitor-text)]">
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
                        <p className="text-base md:text-lg font-bold text-[var(--monitor-text)]">J{index + 1}</p>
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
              <p className="text-lg text-[var(--monitor-overlay-text-primary)]">Memuat Data Monitor untuk Gelanggang: {gelanggangName || '...'}</p>
           </div>
        )}
         {!activeScheduleId && !isLoading && gelanggangName && (
           <div className="absolute inset-0 bg-[var(--monitor-overlay-bg)] flex flex-col items-center justify-center z-50 p-4">
              <AlertTriangle className="h-16 w-16 text-[var(--monitor-overlay-accent-text)] mb-4" />
              <p className="text-xl text-center text-[var(--monitor-overlay-text-primary)] mb-2">{error || `Tidak ada pertandingan yang aktif untuk dimonitor di Gelanggang: ${gelanggangName}.`}</p>
              <p className="text-sm text-center text-[var(--monitor-overlay-text-secondary)] mb-6">Silakan aktifkan jadwal di panel admin atau tunggu pertandingan dimulai.</p>
              <Button variant="outline" asChild className="bg-[var(--monitor-overlay-button-bg)] border-[var(--monitor-overlay-button-border)] hover:bg-[var(--monitor-overlay-button-hover-bg)] text-[var(--monitor-overlay-button-text)]">
                <Link href={`/login?redirect=/scoring/tanding/monitoring-skor&gelanggang=${gelanggangName || ''}`}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
              </Button>
           </div>
        )}

          {timerStatus.matchStatus === 'MatchFinished' && gelanggangName && (
              <Button
                  onClick={handleNextMatchNavigation}
                  disabled={isNavigatingNextMatch || isLoading}
                  className="fixed bottom-6 right-6 z-50 shadow-lg bg-green-600 hover:bg-green-700 text-white py-3 px-4 text-sm md:text-base rounded-full"
                  title="Lanjut ke Partai Berikutnya"
              >
                  {isNavigatingNextMatch ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                      <ChevronsRight className="mr-2 h-5 w-5" />
                  )}
                  Partai Berikutnya
              </Button>
          )}
      </div>
    </div>
  );
}


export default function MonitoringSkorPageSuspended() {
  return (
    <Suspense fallback={
      <div className={cn("flex flex-col min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900")}>
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Memuat Halaman Monitor Skor...</p>
      </div>
    }>
      <PageWithSearchParams />
    </Suspense>
  );
}

function PageWithSearchParams() {
  const searchParams = useSearchParams();
  const gelanggangName = searchParams.get('gelanggang');
  return <MonitoringSkorPageComponent gelanggangName={gelanggangName} />;
}
