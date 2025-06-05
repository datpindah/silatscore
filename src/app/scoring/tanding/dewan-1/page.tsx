
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, Play, Pause, RotateCcw, ChevronRight, CheckCircle2, RadioTower, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { cn } from '@/lib/utils';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const ROUND_DURATION_SECONDS = 120; // 2 minutes
const TOTAL_ROUNDS = 3;
const JURI_IDS = ['juri-1', 'juri-2', 'juri-3'];

interface PesilatInfo {
  name: string;
  contingent: string;
}

interface ScoreEntry {
  points: 1 | 2;
  timestamp: Timestamp; // Firebase Timestamp
}

// Ditambahkan 'key' untuk mempermudah pelacakan unik
interface CombinedScoreEntry extends ScoreEntry {
  juriId: string;
  key: string; 
}

interface JuriRoundScores {
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

interface JuriMatchData {
  merah: JuriRoundScores;
  biru: JuriRoundScores;
  lastUpdated?: Timestamp;
}

interface JuriMatchDataWithId extends JuriMatchData {
  juriId: string;
}

interface TimerStatus {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: 'Pending' | `OngoingRound${number}` | `PausedRound${number}` | `FinishedRound${number}` | 'MatchFinished';
  roundDuration: number;
}

const initialTimerStatus: TimerStatus = {
  currentRound: 1,
  timerSeconds: ROUND_DURATION_SECONDS,
  isTimerRunning: false,
  matchStatus: 'Pending',
  roundDuration: ROUND_DURATION_SECONDS,
};


export default function ScoringTandingDewanSatuPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined); 
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatInfo | null>(null);

  const [timerStatus, setTimerStatus] = useState<TimerStatus>(initialTimerStatus);
  
  const [juri1Scores, setJuri1Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri2Scores, setJuri2Scores] = useState<JuriMatchDataWithId | null>(null);
  const [juri3Scores, setJuri3Scores] = useState<JuriMatchDataWithId | null>(null);

  // allContributingEntryKeys: Untuk UI Dewan-1, bersifat akumulatif permanen.
  const [allContributingEntryKeys, setAllContributingEntryKeys] = useState<Set<string>>(new Set());
  // prevSavedConfirmedKeys: Snapshot dari Firestore, untuk deteksi perubahan.
  const [prevSavedConfirmedKeys, setPrevSavedConfirmedKeys] = useState<Set<string>>(new Set());
  
  const [confirmedScoreMerah, setConfirmedScoreMerah] = useState(0);
  const [confirmedScoreBiru, setConfirmedScoreBiru] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);


  useEffect(() => {
    setIsLoading(true); 
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) {
        console.log(`[Dewan-1] Config Match ID changed from ${configMatchId} to ${newDbConfigId}`);
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) {
        setConfigMatchId(null); 
      }
    }, (err) => {
      console.error("[Dewan-1] Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif.");
      setConfigMatchId(null); 
      // setIsLoading(false); // Ditangani di effect berikutnya
    });
    return () => unsubConfig();
  }, []); 

  useEffect(() => {
    let unsubscribers: (() => void)[] = [];
    let mounted = true;

    const resetAllMatchData = (reason: string) => {
        if (!mounted) return;
        console.log(`[Dewan-1] Resetting all match data due to: ${reason}`);
        setActiveScheduleId(null);
        setMatchDetails(null);
        setMatchDetailsLoaded(false);
        setPesilatMerahInfo(null);
        setPesilatBiruInfo(null);
        setTimerStatus(initialTimerStatus);
        setJuri1Scores(null); setJuri2Scores(null); setJuri3Scores(null);
        setConfirmedScoreMerah(0); setConfirmedScoreBiru(0);
        // Saat reset karena ganti match, allContributingEntryKeys & prevSaved juga direset
        setAllContributingEntryKeys(new Set());
        setPrevSavedConfirmedKeys(new Set());
        setError(null);
    };
    
    if (configMatchId === undefined) { 
        if (!isLoading) setIsLoading(true); 
        return;
    }

    if (configMatchId === null) { 
        if (activeScheduleId !== null) { 
            resetAllMatchData("configMatchId became null");
        }
        if (isLoading) setIsLoading(false); 
        setError("Tidak ada jadwal pertandingan yang aktif.");
        return;
    }
    
    if (configMatchId !== activeScheduleId) {
        resetAllMatchData(`configMatchId changed from ${activeScheduleId} to ${configMatchId}`);
        setActiveScheduleId(configMatchId); 
        if (!isLoading) setIsLoading(true); 
        return; // Biarkan effect berikutnya menangani loading setelah activeScheduleId diset
    }


    const loadData = async (currentMatchId: string) => {
      if (!mounted || !currentMatchId) return; 
      console.log(`[Dewan-1] Loading data for match: ${currentMatchId}`);
      
      if (!isLoading) setIsLoading(true);

      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, currentMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);

        if (!mounted) return;
        if (scheduleDocSnap.exists()) {
          const data = scheduleDocSnap.data() as ScheduleTanding;
          if(mounted) {
            setMatchDetails(data);
            setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
            setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
            setMatchDetailsLoaded(true);
          }
        } else {
          if(mounted) {
            setError(`Detail jadwal untuk ID ${currentMatchId} tidak ditemukan.`);
            resetAllMatchData(`Schedule doc ${currentMatchId} not found`);
            if(isLoading) setIsLoading(false);
          }
          return; 
        }

        const timerStatusDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId);
        const unsubTimer = onSnapshot(timerStatusDocRef, async (docSnap) => {
          if (!mounted) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data?.timer_status) {
              if(mounted) setTimerStatus(data.timer_status as TimerStatus);
            }
            // Inisialisasi allContributingEntryKeys dan prevSavedConfirmedKeys dari Firestore saat pertama kali load
            // atau jika data lokal belum ada tapi di Firestore ada.
            const firestoreKeysLog = new Set(data?.confirmed_entry_keys_log as string[] || []);
            if (mounted) {
                // Hanya set jika ini adalah load awal untuk match ini atau jika local state kosong
                if (allContributingEntryKeys.size === 0 && firestoreKeysLog.size > 0) {
                    console.log(`[Dewan-1] Initializing allContributingEntryKeys from Firestore log for ${currentMatchId}`, firestoreKeysLog);
                    setAllContributingEntryKeys(firestoreKeysLog);
                }
                 if (prevSavedConfirmedKeys.size === 0 && firestoreKeysLog.size > 0) {
                    setPrevSavedConfirmedKeys(firestoreKeysLog);   
                 } else if (firestoreKeysLog.size === 0 && prevSavedConfirmedKeys.size > 0) {
                    // Jika Firestore kosong (misal setelah reset) tapi lokal masih ada, sinkronkan lokal.
                    setPrevSavedConfirmedKeys(new Set());
                    if(allContributingEntryKeys.size > 0) setAllContributingEntryKeys(new Set());
                 }
            }
          } else {
            // Dokumen match belum ada, buat dengan initial state.
            if(mounted) {
                const initialDataForMatch = { timer_status: initialTimerStatus, confirmed_entry_keys_log: [] };
                await setDoc(timerStatusDocRef, initialDataForMatch, { merge: true });
                setTimerStatus(initialTimerStatus); 
                setAllContributingEntryKeys(new Set()); // Pastikan reset jika dokumen baru dibuat
                setPrevSavedConfirmedKeys(new Set());
            }
          }
        }, (err) => {
          if(mounted) console.error("[Dewan-1] Error fetching timer status/confirmed keys:", err);
        });
        if(mounted) unsubscribers.push(unsubTimer);
        
        const juriSetters = [setJuri1Scores, setJuri2Scores, setJuri3Scores];
        JURI_IDS.forEach((juriId, index) => {
          const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, currentMatchId, 'juri_scores', juriId);
          const unsubJuri = onSnapshot(juriDocRef, (docSnap) => {
            if (!mounted) return;
            if (docSnap.exists()) {
              if(mounted) juriSetters[index]({ ...(docSnap.data() as JuriMatchData), juriId });
            } else {
              if(mounted) juriSetters[index](null);
            }
          }, (err) => {
            if(mounted) {
                console.error(`[Dewan-1] Error fetching scores for ${juriId}:`, err);
                juriSetters[index](null);
            }
          });
          if(mounted) unsubscribers.push(unsubJuri);
        });
        
        // Pindahkan setIsLoading(false) ke effect kalkulasi skor
        // agar loading baru berhenti setelah kalkulasi awal selesai.
        
      } catch (err) {
        if(mounted){
            console.error("[Dewan-1] Error in loadData function:", err);
            setError("Gagal memuat data pertandingan.");
            if (isLoading) setIsLoading(false); 
        }
      }
    };

    if (activeScheduleId) { 
        loadData(activeScheduleId);
    } else if (isLoading && configMatchId === null){ 
        setIsLoading(false);
    }


    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [configMatchId, activeScheduleId]); // isLoading dihapus


  // Effect untuk Kalkulasi Skor dan Update Firestore
  useEffect(() => {
    if (!activeScheduleId || !matchDetailsLoaded || 
        juri1Scores === undefined || juri2Scores === undefined || juri3Scores === undefined) {
        if (activeScheduleId && !isLoading && (!matchDetailsLoaded || juri1Scores === undefined)) {
             // Jika ID aktif, tapi data belum ada, biarkan isLoading atau set true jika belum
             if(!isLoading) setIsLoading(true);
        } else if (!activeScheduleId && isLoading) {
            setIsLoading(false);
        }
        return;
    }
    // Jika semua data sudah siap (bukan undefined), maka kita bisa set isLoading = false
    if (isLoading) setIsLoading(false);

    const allJuriDataInput = [juri1Scores, juri2Scores, juri3Scores].filter(Boolean) as JuriMatchDataWithId[];

    // Kumpulkan semua entri mentah dengan key unik
    const allRawEntries: CombinedScoreEntry[] = [];
    allJuriDataInput.forEach(juriData => {
      (['merah', 'biru'] as const).forEach(pesilatColor => {
        (['round1', 'round2', 'round3'] as const).forEach(roundKey => {
          juriData[pesilatColor]?.[roundKey]?.forEach(entry => {
            const entryKey = `${juriData.juriId}_${entry.timestamp.toMillis()}_${entry.points}`;
            allRawEntries.push({
              ...entry,
              juriId: juriData.juriId,
              key: entryKey,
              // Tambahkan info babak & warna untuk pemrosesan lebih mudah
              round: roundKey,
              color: pesilatColor
            });
          });
        });
      });
    });
    allRawEntries.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    // --- Logika Baru untuk Kalkulasi Skor dan Kunci Kontributor ---
    // `currentAccumulatedValidKeys` akan menjadi dasar untuk `allContributingEntryKeys`
    // dan `confirmed_entry_keys_log`. Dimulai dari `prevSavedConfirmedKeys` agar bersifat akumulatif permanen.
    const currentAccumulatedValidKeys = new Set<string>(prevSavedConfirmedKeys);
    let calculatedTotalMerah = 0;
    let calculatedTotalBiru = 0;
    
    // Set untuk melacak entri mana yang sudah menjadi bagian dari pasangan yang menyumbang poin.
    const keysUsedForScoring = new Set<string>();

    for (let i = 0; i < allRawEntries.length; i++) {
        const e1 = allRawEntries[i];
        // Jika e1 sudah valid dan berkontribusi, atau sudah digunakan untuk skor, lewati.
        if (currentAccumulatedValidKeys.has(e1.key) || keysUsedForScoring.has(e1.key)) {
            continue;
        }

        // Cari pasangan untuk e1 dari entri lain yang belum valid atau belum digunakan.
        for (let j = i + 1; j < allRawEntries.length; j++) {
            const e2 = allRawEntries[j];
            if (currentAccumulatedValidKeys.has(e2.key) || keysUsedForScoring.has(e2.key)) {
                continue;
            }

            // Syarat pasangan: Beda juri, babak sama, warna sama, nilai sama, dalam 2 detik
            if (e1.juriId !== e2.juriId &&
                e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= 2000) {
                
                // Pasangan valid ditemukan!
                currentAccumulatedValidKeys.add(e1.key);
                currentAccumulatedValidKeys.add(e2.key);
                keysUsedForScoring.add(e1.key);
                keysUsedForScoring.add(e2.key);

                // Tambahkan poin (hanya sekali per pasangan)
                // e1.points sudah cukup karena e1 dan e2 poinnya sama
                // Tidak perlu lagi mengecek apakah ada juri ketiga, karena aturan hanya "dua juri atau lebih"
                // dan kita memproses secara berurutan.
                // Jika ada juri ketiga yang cocok dengan e1, ia akan membentuk pasangan dengan e1 di iterasi e1.
                // Jika juri ketiga cocok dengan e2, ia akan membentuk pasangan dengan e2.
                // Untuk menghindari double counting, kita hanya tambahkan poin jika ini adalah pasangan baru.
                // Dengan `keysUsedForScoring`, ini sudah ditangani.
                
                // Poinnya akan dihitung ulang di bawah berdasarkan `currentAccumulatedValidKeys`
                break; // e1 sudah menemukan pasangan, lanjut ke e1 berikutnya.
            }
        }
    }

    // Hitung ulang total skor berdasarkan `currentAccumulatedValidKeys` secara keseluruhan
    // untuk memastikan setiap "grup" kesepakatan hanya dihitung sekali.
    const scoreContributingGroups = new Map<string, number>(); // "round_color_timestampApprox_points" -> points
    const tempProcessedEntriesForScoreCalc = new Set<string>();

    allRawEntries.forEach(e1 => {
        if (!currentAccumulatedValidKeys.has(e1.key) || tempProcessedEntriesForScoreCalc.has(e1.key)) return;

        const agreeingPartners = [e1];
        for (const e2 of allRawEntries) {
            if (e1.key === e2.key || !currentAccumulatedValidKeys.has(e2.key) || tempProcessedEntriesForScoreCalc.has(e2.key)) continue;
            if (e1.juriId === e2.juriId) continue;

            if (e1.round === e2.round &&
                e1.color === e2.color &&
                e1.points === e2.points &&
                Math.abs(e1.timestamp.toMillis() - e2.timestamp.toMillis()) <= 2000) {
                agreeingPartners.push(e2);
            }
        }
        
        if (agreeingPartners.length >= 2) {
            // Valid group
            const points = e1.points;
            if (e1.color === 'merah') calculatedTotalMerah += points;
            else calculatedTotalBiru += points;
            
            agreeingPartners.forEach(p => tempProcessedEntriesForScoreCalc.add(p.key));
        }
    });

    setConfirmedScoreMerah(calculatedTotalMerah);
    setConfirmedScoreBiru(calculatedTotalBiru);
    setAllContributingEntryKeys(currentAccumulatedValidKeys);

    // Update Firestore jika `currentAccumulatedValidKeys` berbeda dari `prevSavedConfirmedKeys`
    if (activeScheduleId) {
        const newLogArray = Array.from(currentAccumulatedValidKeys);
        if (newLogArray.length !== prevSavedConfirmedKeys.size || 
            !newLogArray.every(key => prevSavedConfirmedKeys.has(key))) {
            
            updateDoc(doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId), {
                confirmed_entry_keys_log: newLogArray
            }).then(() => {
                setPrevSavedConfirmedKeys(new Set(newLogArray));
                console.log("[Dewan-1] PERMANENT LOGIC: Firestore updated with accumulated keys.");
            }).catch(err => {
                console.error("[Dewan-1] PERMANENT LOGIC: Error updating Firestore log:", err);
            });
        }
    }

  }, [juri1Scores, juri2Scores, juri3Scores, activeScheduleId, matchDetailsLoaded, prevSavedConfirmedKeys]); // isLoading dihilangkan agar effect ini bisa set isLoading


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerStatus.isTimerRunning && timerStatus.timerSeconds > 0 && activeScheduleId) {
      interval = setInterval(async () => { 
        if (activeScheduleId) { 
            try {
                const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
                const currentDBDoc = await getDoc(matchDocRef); 
                
                if (!currentDBDoc.exists()) {
                    if(interval) clearInterval(interval); 
                    setTimerStatus(prev => ({ ...prev, isTimerRunning: false }));
                    return;
                }

                const currentDBTimerStatus = currentDBDoc.data()?.timer_status as TimerStatus | undefined;

                if (!currentDBTimerStatus || !currentDBTimerStatus.isTimerRunning) { 
                    setTimerStatus(prev => ({ 
                        ...prev, 
                        isTimerRunning: false, 
                        ...(currentDBTimerStatus && { 
                            timerSeconds: currentDBTimerStatus.timerSeconds, 
                            matchStatus: currentDBTimerStatus.matchStatus, 
                            currentRound: currentDBTimerStatus.currentRound
                        }) 
                    })); 
                    if(interval) clearInterval(interval);
                    return;
                }
                // Tambahkan check jika timerStatus lokal sudah isTimerRunning: false
                // Ini untuk menghentikan interval jika ada update dari luar (misal, pause dari UI)
                if (!timerStatus.isTimerRunning) { 
                    if (interval) clearInterval(interval);
                    return;
                }


                const newSeconds = Math.max(0, currentDBTimerStatus.timerSeconds - 1);
                let newMatchStatus = currentDBTimerStatus.matchStatus;
                let newIsTimerRunning = currentDBTimerStatus.isTimerRunning;

                if (newSeconds === 0) {
                    newIsTimerRunning = false; 
                    newMatchStatus = `FinishedRound${currentDBTimerStatus.currentRound}` as TimerStatus['matchStatus'];
                    if (currentDBTimerStatus.currentRound === TOTAL_ROUNDS) {
                        newMatchStatus = 'MatchFinished';
                    }
                }
                
                const updatedStatusForFirestore: TimerStatus = {
                    ...currentDBTimerStatus, 
                    timerSeconds: newSeconds,
                    isTimerRunning: newIsTimerRunning,
                    matchStatus: newMatchStatus,
                };
                                
                await setDoc(matchDocRef, { timer_status: updatedStatusForFirestore }, { merge: true });
                // State lokal timerStatus akan diupdate oleh listener onSnapshot
            } catch (e) {
                console.error("[Dewan-1] Error updating timer in interval: ", e);
                 if(interval) clearInterval(interval);
                 // Revert local state if firestore update fails, or rely on onSnapshot
                 setTimerStatus(prev => ({ ...prev, isTimerRunning: false })); // Safety pause
            }
        } else {
             if(interval) clearInterval(interval); // No active match, stop interval
        }
      }, 1000);
    } else if (!timerStatus.isTimerRunning || timerStatus.timerSeconds === 0) {
        // Timer tidak berjalan atau sudah habis
        if(interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerStatus.isTimerRunning, timerStatus.timerSeconds, activeScheduleId]); // Dependensi timerStatus.timerSeconds agar interval re-evaluasi saat detik berubah


  const updateTimerStatusInFirestore = useCallback(async (newStatusUpdates: Partial<TimerStatus>) => {
    if (!activeScheduleId) return;
    try {
      const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
      // Ambil status terbaru dari DB sebelum update, untuk menghindari race condition
      // Meskipun onSnapshot akan update state lokal, operasi update ini harus se-atomik mungkin.
      const docSnap = await getDoc(matchDocRef);
      const currentDBTimerStatus = docSnap.exists() && docSnap.data()?.timer_status 
                                   ? docSnap.data()?.timer_status as TimerStatus 
                                   : timerStatus; // Fallback ke state lokal jika doc belum ada (jarang terjadi)
      
      const newFullStatus = { ...currentDBTimerStatus, ...newStatusUpdates };
      await setDoc(matchDocRef, { timer_status: newFullStatus }, { merge: true });
      // State timerStatus akan diupdate oleh listener onSnapshot
    } catch (e) {
      console.error("[Dewan-1] Error updating timer status in Firestore:", e);
      setError("Gagal memperbarui status timer di server.");
    }
  }, [activeScheduleId, timerStatus]); // timerStatus ditambahkan sbg dependensi jika digunakan sbg fallback

  const handleTimerControl = (action: 'start' | 'pause') => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
    if (action === 'start') {
      if (timerStatus.timerSeconds > 0 && !timerStatus.isTimerRunning) {
         // Update ke Firestore, state lokal akan diupdate oleh onSnapshot
         updateTimerStatusInFirestore({ 
             isTimerRunning: true, 
             matchStatus: `OngoingRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
         });
      }
    } else if (action === 'pause') {
      if (timerStatus.isTimerRunning) {
        updateTimerStatusInFirestore({ 
            isTimerRunning: false, 
            matchStatus: `PausedRound${timerStatus.currentRound}` as TimerStatus['matchStatus'] 
        });
      }
    }
  };

  const handleSetBabak = (round: 1 | 2 | 3) => {
    if (!activeScheduleId || !timerStatus || timerStatus.matchStatus === 'MatchFinished' || isLoading) return;
    // Cek jika timer sedang berjalan untuk babak yang sama
    if (timerStatus.isTimerRunning && timerStatus.currentRound === round) {
        alert("Babak sedang berjalan. Jeda dulu untuk pindah babak atau reset.");
        return;
    }
    
    // Tentukan matchStatus baru berdasarkan apakah babak yang dituju sudah selesai atau belum
    let newMatchStatus: TimerStatus['matchStatus'] = 'Pending';
    let newTimerSeconds = ROUND_DURATION_SECONDS;

    // Cek status babak sebelumnya jika ada.
    // Misal, jika sekarang babak 2 'Pending', dan user klik Babak 1,
    // kita harus tahu apakah Babak 1 sudah 'FinishedRound1'
    // Ini memerlukan pengetahuan tentang status akhir setiap babak, yang mungkin tidak disimpan secara eksplisit per babak.
    // Untuk sederhana, kita asumsikan jika pindah ke babak X, timer reset untuk babak X.
    // Kecuali jika kita tahu babak X sudah selesai.
    // Logika ini bisa lebih kompleks jika ingin mempertahankan state "selesai" per babak.

    // Penyederhanaan: saat set babak, selalu reset timer & status ke 'Pending' untuk babak itu.
    // Kecuali jika kita pindah ke babak yang currentRound-nya sudah finished.
    // Ini agak rumit. Kita akan asumsikan pindah babak selalu reset ke 'Pending' untuk babak baru,
    // kecuali jika babak itu adalah babak yang sama dengan matchStatus 'FinishedRoundX'.

    // Jika match sudah selesai, tidak bisa pindah babak.
    if (timerStatus.matchStatus === 'MatchFinished' && round <= TOTAL_ROUNDS) {
        // Jika match selesai, dan mencoba pindah ke babak sebelumnya, tampilkan status selesai babak tsb.
        newMatchStatus = `FinishedRound${round}` as TimerStatus['matchStatus'];
        newTimerSeconds = 0; // Timer 0 untuk babak yang sudah selesai
    } else if (timerStatus.matchStatus.startsWith('FinishedRound')) {
        const finishedRoundNumber = parseInt(timerStatus.matchStatus.replace('FinishedRound', ''));
        if (round <= finishedRoundNumber) { // Jika pindah ke babak yang sudah selesai atau sebelumnya
             newMatchStatus = `FinishedRound${round}` as TimerStatus['matchStatus'];
             newTimerSeconds = 0;
        } else { // Pindah ke babak setelah babak yang sudah selesai (belum dimulai)
            newMatchStatus = 'Pending';
            newTimerSeconds = ROUND_DURATION_SECONDS;
        }
    }


     updateTimerStatusInFirestore({
      currentRound: round,
      timerSeconds: newTimerSeconds, 
      isTimerRunning: false, 
      matchStatus: newMatchStatus, // Set ke pending untuk babak baru, kecuali jika sudah selesai
    });
  };
  
  const handleNextAction = () => {
    if (!activeScheduleId || !timerStatus || isLoading) return;
    if (timerStatus.isTimerRunning) {
        alert("Jeda dulu pertandingan sebelum melanjutkan.");
        return;
    }

    // Cek apakah babak saat ini sudah selesai (timer = 0 atau statusnya FinishedRoundX)
    const isCurrentRoundActuallyFinished = timerStatus.matchStatus === `FinishedRound${timerStatus.currentRound}` && timerStatus.timerSeconds === 0;

    if (timerStatus.timerSeconds > 0 && !isCurrentRoundActuallyFinished && timerStatus.currentRound <= TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        // Jika timer belum 0 dan status belum 'FinishedRoundX', minta konfirmasi
        if (!confirm(`Babak ${timerStatus.currentRound} belum selesai (timer belum 0 atau status belum 'Finished'). Yakin ingin melanjutkan? Ini akan menganggap babak saat ini selesai.`)) {
            return;
        }
    }

    if (timerStatus.currentRound < TOTAL_ROUNDS) {
        const nextRound = (timerStatus.currentRound + 1) as 1 | 2 | 3;
        updateTimerStatusInFirestore({
            currentRound: nextRound,
            timerSeconds: ROUND_DURATION_SECONDS,
            isTimerRunning: false,
            matchStatus: 'Pending', // Babak baru selalu dimulai dari Pending
        });
    } 
    // Jika ini babak terakhir dan belum selesai, atau sudah selesai tapi mau diklik lagi
    else if (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished') {
        updateTimerStatusInFirestore({ matchStatus: 'MatchFinished', isTimerRunning: false, timerSeconds: 0 });
    }
    // Jika match sudah finished, tombol ini seharusnya disabled.
  };

  const handleResetMatch = async () => {
    console.log("[Dewan-1] handleResetMatch called. ActiveScheduleId:", activeScheduleId);
    if (!activeScheduleId || isLoading) {
        console.warn("[Dewan-1] Reset aborted: no active schedule ID or still loading.");
        return;
    }
    if (!confirm("Apakah Anda yakin ingin mereset seluruh pertandingan? Semua skor dan status akan dikembalikan ke awal.")) return;
    
    if (!isLoading) setIsLoading(true); 
    try {
        const batch = writeBatch(db);
        
        const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId);
        batch.set(matchDocRef, { 
            timer_status: initialTimerStatus,
            confirmed_entry_keys_log: [] // Reset log kunci yang dikonfirmasi
        }, { merge: true }); // merge true untuk safety, tapi idealnya set akan overwrite

        const initialJuriDataContent: JuriMatchData = { 
            merah: { round1: [], round2: [], round3: [] },
            biru: { round1: [], round2: [], round3: [] },
            lastUpdated: Timestamp.now(), // Bisa juga null atau hapus field
        };
        JURI_IDS.forEach(juriId => {
            const juriDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeScheduleId, 'juri_scores', juriId);
            batch.set(juriDocRef, initialJuriDataContent); // Overwrite dengan data juri awal
        });
        
        await batch.commit();
        console.log("[Dewan-1] Firestore batch commit successful for reset.");
        
        // Reset state lokal Dewan-1 SETELAH Firestore commit
        // Listener onSnapshot akan mengambil data baru dari Firestore.
        // Namun, untuk responsivitas UI yang lebih cepat, beberapa state bisa direset manual.
        setTimerStatus(initialTimerStatus); 
        setConfirmedScoreMerah(0);
        setConfirmedScoreBiru(0);
        
        // Ini penting agar kalkulasi berikutnya mulai dari nol untuk kunci yang dikonfirmasi
        setAllContributingEntryKeys(new Set()); 
        setPrevSavedConfirmedKeys(new Set()); 
        
        // Juri scores akan di-reset oleh onSnapshot karena data di Firestore berubah.
        // Jika ingin lebih cepat, bisa set manual ke null:
        setJuri1Scores(null); 
        setJuri2Scores(null); 
        setJuri3Scores(null);
                
        alert("Pertandingan telah direset.");
    } catch (e) {
      console.error("[Dewan-1] Error resetting match:", e);
      setError("Gagal mereset pertandingan.");
    } finally {
        // isLoading akan diatur oleh effect kalkulasi skor jika data sudah kembali
        // atau oleh effect loadData jika configMatchId belum null.
        // Untuk safety, jika masih true, set false.
         if (isLoading) setIsLoading(false);
    }
  };

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
    if (timerStatus.matchStatus === 'MatchFinished') return "Pertandingan Selesai";
    if (timerStatus.matchStatus === 'Pending') return `Babak ${timerStatus.currentRound} Menunggu`;
    return "Status Tidak Diketahui";
  };

  const getJuriScoreForDisplay = (
    juriId: string,
    juriData: JuriMatchDataWithId | null,
    pesilatColor: 'merah' | 'biru',
    round: 1 | 2 | 3,
    // Menggunakan allContributingEntryKeys yang bersifat akumulatif permanen
    contributingKeysForDisplay: Set<string> 
  ): React.ReactNode => {
    if (!juriData) return '-';
    const roundKey = `round${round}` as keyof JuriRoundScores; // e.g. "round1"
    const scoresForRound = juriData[pesilatColor]?.[roundKey];
    if (!scoresForRound || !Array.isArray(scoresForRound) || scoresForRound.length === 0) return '0';
    
    const now = Date.now(); // Untuk logika grace period
    return scoresForRound.map((entry, index) => {
      let entryTimestampMillis: number;
      try {
        entryTimestampMillis = entry.timestamp.toMillis();
      } catch (e) {
        console.warn("[Dewan-1] Error converting timestamp for display:", entry.timestamp, e);
        entryTimestampMillis = Date.now(); // Fallback
      }

      const entryKey = `${juriId}_${entryTimestampMillis}_${entry.points}`;
      const isContributing = contributingKeysForDisplay.has(entryKey);
      
      // Logika "Masa Tenggang 2 Detik" untuk tampilan skor baru
      const isGracePeriod = (now - entryTimestampMillis) <= 2000; 
      const shouldStrike = !isContributing && !isGracePeriod; 

      return (
        <span key={`${juriId}-${round}-${pesilatColor}-${index}-${entryTimestampMillis}`} className={cn(shouldStrike && "line-through text-gray-400 dark:text-gray-600 opacity-70", "mr-1.5")}>
          {entry.points}
        </span>
      );
    }).reduce((prev, curr, idx) => <>{prev}{idx > 0 && ', '}{curr}</>, <></>);
  };

  const getTotalJuriRawScoreForDisplay = (juriData: JuriMatchDataWithId | null, pesilatColor: 'merah' | 'biru'): number => {
    if (!juriData) return 0;
    let total = 0;
    ([1,2,3] as const).forEach(roundNum => {
        const roundKey = `round${roundNum}` as keyof JuriRoundScores;
        const scoresForRound = juriData[pesilatColor]?.[roundKey];
        if (scoresForRound && Array.isArray(scoresForRound)) {
            scoresForRound.forEach(s => {
                if (s && typeof s.points === 'number') {
                    total += s.points;
                }
            });
        }
    });
    return total;
  };
  
  if (configMatchId === undefined && isLoading) { 
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat konfigurasi Dewan Kontrol...</p>
            </main>
        </div>
    );
  }
  
  // isLoading akan diatur false oleh effect kalkulasi skor
  if (isLoading && activeScheduleId) { 
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat data pertandingan...</p>
                {matchDetails && <p className="text-sm text-muted-foreground">Partai: {matchDetails.pesilatMerahName} vs {matchDetails.pesilatBiruName}</p>}
                {error && !matchDetails && <p className="text-sm text-red-500 mt-2">Error memuat detail: {error}</p>}
            </main>
        </div>
    );
  }

   if (!activeScheduleId && !isLoading) { 
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
           <Card className="mt-6 shadow-lg">
            <CardHeader>
                <CardTitle className="text-xl font-headline text-center text-primary">Scoring Tanding - Dewan Kontrol</CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center">
                <p className="mb-4 text-muted-foreground">{error || "Tidak ada pertandingan yang aktif atau detail tidak dapat dimuat."}</p>
                 {error && <p className="text-xs text-red-500 mt-2">Detail Error: {error}</p>}
                <Button variant="outline" asChild>
                    <Link href="/admin/schedule-tanding"><ArrowLeft className="mr-2 h-4 w-4" /> Atur Jadwal Aktif</Link>
                </Button>
            </CardContent>
           </Card>
        </main>
      </div>
    );
  }
  
  const nextButtonText: string = timerStatus.matchStatus === 'MatchFinished' ? 'Selesai' : (timerStatus.currentRound < TOTAL_ROUNDS ? `Lanjut Babak ${timerStatus.currentRound + 1}` : 'Selesaikan Match');
  
  const isNextActionPossible: boolean = 
    (timerStatus.currentRound < TOTAL_ROUNDS || (timerStatus.currentRound === TOTAL_ROUNDS && timerStatus.matchStatus !== 'MatchFinished'));

  const isTimerStartDisabled: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished' || timerStatus.timerSeconds === 0 || timerStatus.matchStatus.startsWith('FinishedRound');
  const isTimerPauseDisabled: boolean = !activeScheduleId || isLoading || !timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished';
  const isNextActionDisabledBtn: boolean = !activeScheduleId || isLoading || timerStatus.isTimerRunning || !isNextActionPossible || timerStatus.matchStatus.startsWith("OngoingRound");
  const isResetButtonDisabled: boolean = !activeScheduleId || isLoading;
  
  const isBabakButtonDisabled = (round: number): boolean => {
    if (!activeScheduleId || isLoading || timerStatus.isTimerRunning || timerStatus.matchStatus === 'MatchFinished') return true;
    // Tambahan: jika babak tersebut sudah selesai dan kita ingin mencegah kembali ke sana
    // if (timerStatus.matchStatus === `FinishedRound${round as 1 | 2 | 3}`) return true; // Ini opsional
    return false; 
  };


  const juriDataArray = [juri1Scores, juri2Scores, juri3Scores];

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 font-body">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:px-4 md:py-6">
        <Card className="mb-4 shadow-xl bg-gradient-to-r from-primary to-red-700 text-primary-foreground">
          <CardContent className="p-3 md:p-4 text-center">
            <h1 className="text-xl md:text-2xl font-bold font-headline">PENCAK SILAT</h1>
            {matchDetails && (
                <p className="text-xs md:text-sm">
                {matchDetails.place || "Gelanggang Utama"} | Partai No. {matchDetails.matchNumber} | {matchDetails.round} | {matchDetails.class}
                </p>
            )}
            {error && !isLoading && !matchDetails && <p className="text-xs md:text-sm text-yellow-300 mt-1">Gagal memuat detail pertandingan. {error}</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-12 gap-2 md:gap-4 mb-4">
          <div className="col-span-5">
            <Card className="h-full bg-blue-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4">
                <CardTitle className="text-base md:text-xl font-semibold truncate font-headline">{pesilatBiruInfo?.name || 'PESILAT BIRU'}</CardTitle>
                <CardDescription className="text-blue-200 text-xs md:text-sm truncate">{pesilatBiruInfo?.contingent || 'Kontingen Biru'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreBiru}</span>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-2 flex flex-col items-center justify-center space-y-2 md:space-y-3">
            <div className="text-3xl md:text-5xl font-mono font-bold text-gray-800 dark:text-gray-200">{formatTime(timerStatus.timerSeconds)}</div>
            <div className="flex flex-col space-y-1 w-full">
              {[1, 2, 3].map((round) => (
                <Button
                  key={round}
                  variant={timerStatus.currentRound === round ? "default" : "outline"}
                  className={`w-full text-xs md:text-sm py-1 md:py-2 h-auto transition-all ${
                    timerStatus.currentRound === round 
                      ? 'bg-accent text-accent-foreground ring-2 ring-offset-1 ring-accent dark:ring-offset-gray-800 font-semibold' 
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  } ${ isBabakButtonDisabled(round) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSetBabak(round as 1 | 2 | 3)}
                  disabled={isBabakButtonDisabled(round)}
                >
                  Babak {round}
                </Button>
              ))}
            </div>
             <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-1 md:mt-2 px-1 font-semibold">{getMatchStatusText()}</p>
          </div>

          <div className="col-span-5">
            <Card className="h-full bg-red-600 text-white shadow-lg flex flex-col justify-between">
              <CardHeader className="pb-2 pt-3 px-3 md:pb-4 md:pt-4 md:px-4 text-right">
                <CardTitle className="text-base md:text-xl font-semibold truncate font-headline">{pesilatMerahInfo?.name || 'PESILAT MERAH'}</CardTitle>
                <CardDescription className="text-red-200 text-xs md:text-sm truncate">{pesilatMerahInfo?.contingent || 'Kontingen Merah'}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow flex items-center justify-center p-2 md:p-4">
                <span className="text-5xl md:text-8xl font-bold">{confirmedScoreMerah}</span>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <Card className="shadow-lg mb-4 bg-white dark:bg-gray-800">
          <CardContent className="p-3 md:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
                <Button 
                    onClick={() => handleTimerControl('start')} 
                    disabled={isTimerStartDisabled}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-2 md:py-3 text-sm md:text-base"
                >
                  <Play className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Start
                </Button>
                <Button onClick={() => handleTimerControl('pause')} 
                        disabled={isTimerPauseDisabled}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 md:py-3 text-sm md:text-base">
                  <Pause className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Pause
                </Button>
              <Button 
                onClick={handleNextAction}
                disabled={isNextActionDisabledBtn}
                variant="outline"
                className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {nextButtonText} <ChevronRight className="ml-1 h-4 md:h-5 w-4 md:w-5" />
              </Button>
              <Button 
                onClick={handleResetMatch} 
                disabled={isResetButtonDisabled}
                variant="destructive" 
                className="w-full py-2 md:py-3 text-sm md:text-base"
              >
                <RotateCcw className="mr-2 h-4 md:h-5 w-4 md:w-5" /> Reset Match
              </Button>
               <Button variant="outline" asChild className="w-full py-2 md:py-3 text-sm md:text-base border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 col-span-2 sm:col-span-4">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 md:h-5 w-4 md:w-5" />
                  Keluar dari Panel Dewan
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

         <Card className="mt-4 shadow-lg bg-white dark:bg-gray-800">
            <CardHeader>
                <CardTitle className="text-lg font-headline flex items-center text-gray-800 dark:text-gray-200">
                    <RadioTower className="mr-2 h-5 w-5 text-primary"/> Status Juri &amp; Skor Mentah
                </CardTitle>
                 <CardDescription>Nilai hanya sah jika dua juri atau lebih memberikan nilai yang sama (poin 1 atau 2) untuk warna dan babak yang sama dalam selang waktu 2 detik. Nilai yang SAH akan ditampilkan normal dan dihitung. Nilai yang TIDAK SAH (misal, hanya 1 juri, atau beda nilai, atau beda waktu >2 detik) akan DICORET. Nilai yang baru masuk (kurang dari 2 detik) tidak langsung dicoret, menunggu potensi pasangan.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs md:text-sm grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                {juriDataArray.map((jS, idx) => {
                    const juriId = JURI_IDS[idx];
                    // `allContributingEntryKeys` yang digunakan di sini adalah state akumulatif permanen.
                    const keysForThisJuriDisplay = allContributingEntryKeys; 
                    return (
                        <div key={`juri-status-${juriId}`} className="border border-gray-200 dark:border-gray-700 p-2 md:p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
                            <p className="font-semibold text-primary mb-1">Juri {idx + 1}: {jS && jS.lastUpdated ? <CheckCircle2 className="inline h-4 w-4 text-green-500"/> : <span className="text-yellow-600 italic">Menunggu data...</span>}</p>
                            {jS && (
                                <div className="space-y-0.5 text-gray-700 dark:text-gray-300">
                                    <p><span className='font-medium text-red-500'>Merah:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'merah', 1, keysForThisJuriDisplay)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'merah', 2, keysForThisJuriDisplay)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'merah', 3, keysForThisJuriDisplay)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'merah')}</span></p>
                                    <p><span className='font-medium text-blue-500'>Biru:</span> R1:[{getJuriScoreForDisplay(juriId, jS, 'biru', 1, keysForThisJuriDisplay)}] R2:[{getJuriScoreForDisplay(juriId, jS, 'biru', 2, keysForThisJuriDisplay)}] R3:[{getJuriScoreForDisplay(juriId, jS, 'biru', 3, keysForThisJuriDisplay)}] = <span className='font-semibold'>{getTotalJuriRawScoreForDisplay(jS, 'biru')}</span></p>
                                    {jS.lastUpdated && <p className="text-gray-400 dark:text-gray-500 text-xxs">Update: {jS.lastUpdated.toDate().toLocaleTimeString()}</p>}
                                </div>
                            )}
                            {!jS && <p className="italic text-gray-500 dark:text-gray-400">Belum ada input dari Juri {idx+1} untuk pertandingan ini.</p>}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
      </main>
    </div>
  );
}

    