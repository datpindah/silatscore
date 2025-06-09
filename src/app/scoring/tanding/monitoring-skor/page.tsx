
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription as DialogVerificationDescription } from "@/components/ui/dialog";
import { ArrowLeft, Eye, Loader2, RadioTower, AlertTriangle } from 'lucide-react';
import type { ScheduleTanding, TimerStatus, VerificationRequest, JuriVoteValue, KetuaActionLogEntry, PesilatColorIdentity, KetuaActionType, RoundScores, JuriMatchData as FullJuriMatchData } from '@/lib/types';
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

// Simplified JuriMatchData for monitoring, full score calculation is complex here
interface DisplayJuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  lastUpdated?: Timestamp;
}


const FistIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 md:w-6 md:h-6 inline-block">
    <path d="M16.5 9.4C16.5 8.29543 17.3954 7.4 18.5 7.4C19.6046 7.4 20.5 8.29543 20.5 9.4V12.4C20.5 13.5046 19.6046 14.4 18.5 14.4H15.5C14.3954 14.4 13.5 13.5046 13.5 12.4V9.4C13.5 8.29543 14.3954 7.4 15.5 7.4C16.6046 7.4 17.5 8.29543 17.5 9.4H16.5ZM9.5 9.4C9.5 8.29543 10.3954 7.4 11.5 7.4C12.6046 7.4 13.5 8.29543 13.5 9.4V12.4C13.5 13.5046 12.6046 14.4 11.5 14.4H8.5C7.39543 14.4 6.5 13.5046 6.5 12.4V9.4C6.5 8.29543 7.39543 7.4 8.5 7.4C9.60457 7.4 10.5 8.29543 10.5 9.4H9.5ZM4.5 11.4C4.5 10.2954 5.39543 9.4 6.5 9.4C7.60457 9.4 8.5 10.2954 8.5 11.4V13.4C8.5 14.5046 7.60457 15.4 6.5 15.4H4C2.89543 15.4 2 14.5046 2 13.4V12.9C2 11.8333 2.56667 11.4 4.5 11.4Z"/>
  </svg>
);

const KickIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 md:w-6 md:h-6 inline-block">
    <path d="M14.07 13.02L12.66 11.61L8.5 15.77L9.91 17.18L14.07 13.02M17.71 5.29L16.29 6.71L12.13 10.87L13.54 12.28L19.13 6.7L17.71 5.29M6.46 8.09L5.05 9.5L2 12.54L3.41 13.95L6.46 10.91L9.29 13.75L10.71 12.33L6.46 8.09Z"/>
  </svg>
);


export default function MonitoringSkorPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);

  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0); // Placeholder
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0); // Placeholder

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
            // TODO: Replicate Dewan 1's score calculation logic here if precise scores are needed.
            // For now, using placeholders or direct values if available.
            // setConfirmedScoreMerah(data.calculatedMerahScore || 0); 
            // setConfirmedScoreBiru(data.calculatedBiruScore || 0);
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
            } else { setActiveDisplayVerificationRequest(null); setIsDisplayVerificationModalOpen(false); }
          } else { setActiveDisplayVerificationRequest(null); setIsDisplayVerificationModalOpen(false); }
        },(err) => {
          if (mounted) console.error("[MonitoringSkor] Error fetching verifications:", err);
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
  }, [activeScheduleId]);

  useEffect(() => {
    if (activeScheduleId && !matchDetailsLoaded && !error?.includes("Detail jadwal ID")) {
        setIsLoading(true);
    } else if (activeScheduleId && matchDetailsLoaded) {
        setIsLoading(false);
    } else if (!activeScheduleId) {
        setIsLoading(false);
    }
  }, [activeScheduleId, matchDetailsLoaded, error]);


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
    <div className={cn("text-center border border-gray-400 py-0.5 px-1 text-[10px] md:text-xs leading-tight", isActive ? "bg-yellow-400 text-black" : "bg-gray-200 text-gray-700")}>
      {label}
    </div>
  );

  const JuriInputIndicator = ({ juri, type, pesilatColor }: { juri: string; type: 'pukulan' | 'tendangan'; pesilatColor: PesilatColorIdentity }) => {
    const isActive = activeJuriHighlights[`${pesilatColor}-${type}-${juri}`];
    return (
      <div className={cn("flex-1 border border-gray-400 py-1 md:py-2 text-center text-xs md:text-sm font-medium", isActive ? "bg-yellow-400 text-black" : "bg-gray-200 text-gray-700")}>
        {juri.toUpperCase().replace('JURI-','J')}
      </div>
    );
  };

  const getJuriVoteDisplayBoxClass = (vote: JuriVoteValue): string => {
    if (vote === 'merah') return "bg-red-600 text-white";
    if (vote === 'biru') return "bg-blue-600 text-white";
    if (vote === 'invalid') return "bg-yellow-400 text-black";
    return "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100";
  };

  if (isLoading && configMatchId === undefined) { 
    return (
        <div className="flex flex-col min-h-screen bg-gray-700 text-white items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-yellow-300 mb-4" />
            <p className="text-xl">Memuat Konfigurasi Monitor...</p>
        </div>
    ); 
  }


  return (
    <div className="flex flex-col min-h-screen bg-gray-700 text-white font-sans overflow-hidden">
      <div className="bg-gray-800 p-2 md:p-3 text-center">
        <div className="grid grid-cols-3 gap-1 md:gap-2 text-xs md:text-sm font-semibold">
          <div>{matchDetails?.place || <Skeleton className="h-4 w-20 inline-block bg-gray-600" />}</div>
          <div>{matchDetails?.round || <Skeleton className="h-4 w-20 inline-block bg-gray-600" />}</div>
          <div>{matchDetails?.class || <Skeleton className="h-4 w-32 inline-block bg-gray-600" />}</div>
        </div>
      </div>

      <div className="flex-grow grid grid-cols-[1fr_auto_1fr] gap-1 md:gap-2 p-1 md:p-2 items-stretch">
        {/* Pesilat Biru Side */}
        <div className="flex flex-col items-center flex-1">
          <div className="text-center mb-1 md:mb-2">
            <div className="font-bold text-sm md:text-xl text-blue-300">{pesilatBiruInfo?.name || <Skeleton className="h-6 w-32 bg-gray-600" />}</div>
            <div className="text-xs md:text-base text-blue-400">{pesilatBiruInfo?.contingent || <Skeleton className="h-4 w-24 bg-gray-600 mt-1" />}</div>
          </div>
          
          <div className="flex w-full items-center gap-1 md:gap-2 mb-1 md:mb-2">
            <div className="grid grid-cols-2 gap-0.5 md:gap-1 w-16 md:w-20">
                <FoulBox label="B1" isActive={getFoulStatus('biru', 'Binaan', 1)} />
                <FoulBox label="B2" isActive={getFoulStatus('biru', 'Binaan', 2)} />
                <FoulBox label="T1" isActive={getFoulStatus('biru', 'Teguran', 1)} />
                <FoulBox label="T2" isActive={getFoulStatus('biru', 'Teguran', 2)} />
                <FoulBox label="P1" isActive={getFoulStatus('biru', 'Peringatan', 1)} />
                <FoulBox label="P2" isActive={getFoulStatus('biru', 'Peringatan', 2)} />
                <FoulBox label="P3" isActive={getFoulStatus('biru', 'Peringatan', 3)} />
            </div>
            <div className="flex-grow h-32 md:h-64 bg-blue-600 flex items-center justify-center text-5xl md:text-8xl font-bold">
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

        <div className="flex flex-col items-center justify-center space-y-2 md:space-y-4 px-1 md:px-2">
          <div className="text-4xl md:text-7xl font-mono font-bold text-yellow-300">
            {formatTime(timerStatus.timerSeconds)}
          </div>
          <div className="space-y-1 md:space-y-2">
            {[1, 2, 3].map(b => (
              <div key={`babak-${b}`} className={cn("w-6 h-6 md:w-8 md:h-8 border-2 border-gray-400 flex items-center justify-center text-sm md:text-lg font-bold", timerStatus.currentRound === b ? "bg-yellow-300 text-black border-yellow-300" : "text-gray-400")}>
                {b === 1 ? 'I' : b === 2 ? 'II' : 'III'}
              </div>
            ))}
          </div>
          <FistIcon />
          <KickIcon />
        </div>

        {/* Pesilat Merah Side */}
        <div className="flex flex-col items-center flex-1">
          <div className="text-center mb-1 md:mb-2">
            <div className="font-bold text-sm md:text-xl text-red-300">{pesilatMerahInfo?.name || <Skeleton className="h-6 w-32 bg-gray-600" />}</div>
            <div className="text-xs md:text-base text-red-400">{pesilatMerahInfo?.contingent || <Skeleton className="h-4 w-24 bg-gray-600 mt-1" />}</div>
          </div>

          <div className="flex w-full items-center gap-1 md:gap-2 mb-1 md:mb-2">
            <div className="flex-grow h-32 md:h-64 bg-red-600 flex items-center justify-center text-5xl md:text-8xl font-bold">
                {confirmedScoreMerah}
            </div>
            <div className="grid grid-cols-2 gap-0.5 md:gap-1 w-16 md:w-20">
                <FoulBox label="B1" isActive={getFoulStatus('merah', 'Binaan', 1)} />
                <FoulBox label="B2" isActive={getFoulStatus('merah', 'Binaan', 2)} />
                <FoulBox label="T1" isActive={getFoulStatus('merah', 'Teguran', 1)} />
                <FoulBox label="T2" isActive={getFoulStatus('merah', 'Teguran', 2)} />
                <FoulBox label="P1" isActive={getFoulStatus('merah', 'Peringatan', 1)} />
                <FoulBox label="P2" isActive={getFoulStatus('merah', 'Peringatan', 2)} />
                <FoulBox label="P3" isActive={getFoulStatus('merah', 'Peringatan', 3)} />
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
      
      <Dialog open={isDisplayVerificationModalOpen} onOpenChange={(isOpen) => { if (!isOpen && activeDisplayVerificationRequest?.status === 'pending') return; setIsDisplayVerificationModalOpen(isOpen); }}>
         <DialogContent
            className="sm:max-w-lg md:max-w-xl bg-gray-800 border-gray-700 text-white"
            onPointerDownOutside={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}
            onEscapeKeyDown={(e) => {if (activeDisplayVerificationRequest?.status === 'pending') e.preventDefault();}}
          >
            <DialogHeader className="text-center">
              <DialogTitle className="text-2xl md:text-3xl font-bold font-headline text-yellow-300">
                Verifikasi Juri
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 px-2 md:px-6">
                {activeDisplayVerificationRequest && (
                    <div className="mb-6 text-center">
                        <div className="text-lg md:text-xl font-semibold text-gray-100">
                            {activeDisplayVerificationRequest.type === 'jatuhan' ? 'Verifikasi Jatuhan' : 'Verifikasi Pelanggaran'}
                        </div>
                        <div className="text-sm text-gray-300">Babak {activeDisplayVerificationRequest.round}</div>
                    </div>
                )}
              <div className="grid grid-cols-3 gap-3 md:gap-4 items-start justify-items-center text-center">
                {JURI_IDS.map((juriKey, index) => {
                  const vote = activeDisplayVerificationRequest?.votes[juriKey] || null;
                  let voteText = 'Belum Vote';
                  let voteBoxColorClass = getJuriVoteDisplayBoxClass(vote);
                  if (vote === 'merah') { voteText = 'MERAH'; }
                  else if (vote === 'biru') { voteText = 'BIRU'; }
                  else if (vote === 'invalid') { voteText = 'INVALID';}
                  return (
                    <div key={`vote-display-monitor-${juriKey}`} className="flex flex-col items-center space-y-1 w-full">
                      <p className="text-base md:text-lg font-bold text-gray-100">J{index + 1}</p>
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
         <div className="absolute inset-0 bg-gray-800/50 flex flex-col items-center justify-center z-50">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-300 mb-4" />
            <p className="text-lg text-gray-200">Memuat Data Monitor...</p>
         </div>
      )}
       {!activeScheduleId && !isLoading && (
         <div className="absolute inset-0 bg-gray-800/80 flex flex-col items-center justify-center z-50 p-4">
            <AlertTriangle className="h-16 w-16 text-yellow-400 mb-4" />
            <p className="text-xl text-center text-gray-200 mb-2">{error || "Tidak ada pertandingan yang aktif untuk dimonitor."}</p>
            <p className="text-sm text-center text-gray-300 mb-6">Silakan aktifkan jadwal di panel admin atau tunggu pertandingan dimulai.</p>
            <Button variant="outline" asChild className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-200">
              <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
            </Button>
         </div>
      )}
    </div>
  );
}
