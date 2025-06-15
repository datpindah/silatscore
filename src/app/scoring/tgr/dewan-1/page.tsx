
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Loader2, MinusCircle } from 'lucide-react';
import type { ScheduleTGR, TGRDewanPenalty, TGRDewanPenaltyType, TGRJuriScore } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, addDoc, query, orderBy, limit, deleteDoc, serverTimestamp, Timestamp, where, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const MATCHES_TGR_COLLECTION = 'matches_tgr';
const DEWAN_PENALTIES_TGR_SUBCOLLECTION = 'dewan_penalties_tgr';
const JURI_SCORES_TGR_SUBCOLLECTION = 'juri_scores_tgr';


const TGR_JURI_IDS = ['juri-1', 'juri-2', 'juri-3', 'juri-4', 'juri-5', 'juri-6'] as const;
const BASE_SCORE_TGR = 9.90;
const GERAKAN_SALAH_DEDUCTION = 0.01;

interface PenaltyConfig {
  id: TGRDewanPenaltyType;
  description: string;
  points: number;
}

const PENALTY_TYPES: PenaltyConfig[] = [
  { id: 'arena_out', description: "Penampilan Keluar Gelanggang 10mx10m", points: -0.50 },
  { id: 'weapon_touch_floor', description: "Menjatuhkan Senjata Menyentuh Lantai", points: -0.50 },
  { id: 'time_tolerance_violation', description: "Penampilan melebihi atau kurang dari toleransi waktu 5 Detik S/d 10 Detik", points: -0.50 },
  { id: 'costume_violation', description: "Pakaian tidak sesuai aturan (kain samping jatuh, kain samping tidak 1 (satu) motif, baju atasan dan bawahan tidak 1 (satu) warna)", points: -0.50 },
  { id: 'movement_hold_violation', description: "Menahan gerakan lebih dari 5 (lima) detik.", points: -0.50 },
];

export default function DewanTGRPenaltyPage() {
  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [scheduleDetails, setScheduleDetails] = useState<ScheduleTGR | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);
  const [penaltiesLog, setPenaltiesLog] = useState<TGRDewanPenalty[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({}); // For individual penalty type processing
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch active schedule ID
  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      setConfigMatchId(prevId => prevId === newDbConfigId ? prevId : newDbConfigId);
    }, (err) => {
      console.error("Error fetching active TGR schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif TGR.");
      setConfigMatchId(null); // Explicitly set to null on error
    });
    return () => unsubConfig();
  }, []);

  // Reset data if active match changes or becomes null
  useEffect(() => {
    if (configMatchId === undefined) { setIsLoading(true); return; }
    
    if (configMatchId !== activeMatchId) {
      setScheduleDetails(null);
      setPenaltiesLog([]);
      setMatchDetailsLoaded(false);
      setError(null);
      setActiveMatchId(configMatchId); // This will trigger the next useEffect
      if (configMatchId) setIsLoading(true); else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false); // Already null, ensure loading is false
    }
  }, [configMatchId, activeMatchId, isLoading]);


  // Fetch schedule details and penalties log when activeMatchId is set
  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading && !configMatchId) setIsLoading(false); // Only stop loading if config is also null
      return;
    }

    let mounted = true;
    if (!matchDetailsLoaded) setIsLoading(true);

    const loadData = async () => {
      if (!mounted) return;
      try {
        // Load Schedule Details
        const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeMatchId);
        const scheduleDocSnap = await getDoc(scheduleDocRef);
        if (!mounted) return;

        if (scheduleDocSnap.exists()) {
          setScheduleDetails({ id: scheduleDocSnap.id, ...scheduleDocSnap.data() } as ScheduleTGR);
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal TGR (ID: ${activeMatchId}) tidak ditemukan.`);
          setScheduleDetails(null);
          setMatchDetailsLoaded(false);
        }
      } catch (err) {
        if (mounted) setError(`Error memuat detail jadwal TGR: ${err instanceof Error ? err.message : String(err)}`);
        setScheduleDetails(null);
        setMatchDetailsLoaded(false);
      }
    };
    
    loadData();
    
    // Listener for penalties log
    const penaltiesQuery = query(
      collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION),
      orderBy("timestamp", "asc")
    );
    const unsubPenalties = onSnapshot(penaltiesQuery, (snapshot) => {
      if (!mounted) return;
      const log: TGRDewanPenalty[] = [];
      snapshot.forEach(doc => log.push({ id: doc.id, ...doc.data() } as TGRDewanPenalty));
      setPenaltiesLog(log);
    }, (err) => {
      if (mounted) setError(`Gagal memuat log pelanggaran: ${err.message}`);
    });

    return () => {
      mounted = false;
      unsubPenalties();
    };
  }, [activeMatchId, matchDetailsLoaded]); // Added matchDetailsLoaded dependency

  useEffect(() => {
    if (isLoading && matchDetailsLoaded) {
      setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded]);


  const handleAddPenalty = async (penalty: PenaltyConfig) => {
    console.log(`[handleAddPenalty] Triggered for penalty: ${penalty.id}, activeMatchId: ${activeMatchId}`);
    if (!activeMatchId || activeMatchId.trim() === "" || isProcessing[penalty.id]) {
      if (!activeMatchId || activeMatchId.trim() === "") {
        console.error("handleAddPenalty aborted: activeMatchId is invalid.", { activeMatchId });
        setError("ID pertandingan aktif tidak valid. Tidak dapat menambah pelanggaran.");
      }
      return;
    }
    setIsProcessing(prev => ({ ...prev, [penalty.id]: true }));
    try {
      const penaltyData: Omit<TGRDewanPenalty, 'id' | 'timestamp'> & { timestamp: any } = {
        type: penalty.id,
        description: penalty.description,
        pointsDeducted: penalty.points,
        timestamp: serverTimestamp(),
      };

      const batch = writeBatch(db);
      
      // 1. Add Dewan Penalty
      const newPenaltyRef = doc(collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION));
      batch.set(newPenaltyRef, penaltyData);
      console.log(`[handleAddPenalty] Prepared to add penalty doc: ${newPenaltyRef.path}`);

      // 2. Update all Juri scores
      const deductionAmount = Math.abs(penalty.points); // e.g., 0.50

      for (const juriId of TGR_JURI_IDS) {
        const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
        console.log(`[handleAddPenalty] Preparing update for Juri: ${juriId}, path: ${juriDocRef.path}`);
        
        const juriDocSnap = await getDoc(juriDocRef);
        let currentJuriData: Partial<TGRJuriScore> = {
            baseScore: BASE_SCORE_TGR,
            gerakanSalahCount: 0,
            staminaKemantapanBonus: 0,
            externalDeductions: 0,
            isReady: false, 
        };

        if (juriDocSnap.exists()) {
            currentJuriData = juriDocSnap.data() as TGRJuriScore;
        }
        
        const newExternalDeductions = (currentJuriData.externalDeductions || 0) + deductionAmount;
        const newCalculatedScore = parseFloat(
            ( (currentJuriData.baseScore ?? BASE_SCORE_TGR) -
              ((currentJuriData.gerakanSalahCount ?? 0) * GERAKAN_SALAH_DEDUCTION) +
              (currentJuriData.staminaKemantapanBonus ?? 0) -
              newExternalDeductions
            ).toFixed(2)
        );

        const juriUpdateData = {
            baseScore: currentJuriData.baseScore ?? BASE_SCORE_TGR,
            gerakanSalahCount: currentJuriData.gerakanSalahCount ?? 0,
            staminaKemantapanBonus: currentJuriData.staminaKemantapanBonus ?? 0,
            externalDeductions: newExternalDeductions,
            calculatedScore: newCalculatedScore,
            isReady: currentJuriData.isReady ?? false,
            lastUpdated: serverTimestamp(),
        };
        console.log(`[handleAddPenalty] Data for Juri ${juriId}:`, juriUpdateData);
        batch.set(juriDocRef, juriUpdateData, { merge: true });
      }

      await batch.commit();
      console.log(`[handleAddPenalty] Batch commit successful for penalty ${penalty.id}`);

    } catch (err) {
      const firebaseError = err as any; // Cast to any to access potential code property
      console.error("[handleAddPenalty] Error processing penalty or updating Juri scores. ActiveMatchId:", activeMatchId, "Penalty:", penalty.id, "Error:", firebaseError);
      
      let errorMessage = `Gagal menambah pelanggaran & update skor juri: ${firebaseError.message || String(firebaseError)}`;
      if (firebaseError.code === 'permission-denied') {
        errorMessage += " Pastikan Anda telah login dan memiliki izin yang cukup. Periksa juga path Firestore yang diakses.";
      }
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsProcessing(prev => ({ ...prev, [penalty.id]: false }));
    }
  };

  const handleDeleteLastPenalty = async (penaltyType: TGRDewanPenaltyType) => {
    console.log(`[handleDeleteLastPenalty] Triggered for penaltyType: ${penaltyType}, activeMatchId: ${activeMatchId}`);
     if (!activeMatchId || activeMatchId.trim() === "" || isProcessing[penaltyType]) {
        if (!activeMatchId || activeMatchId.trim() === "") {
          console.error("[handleDeleteLastPenalty] Aborted: activeMatchId is invalid.", { activeMatchId });
          setError("ID pertandingan aktif tidak valid. Tidak dapat menghapus pelanggaran.");
        }
        return;
    }
    setIsProcessing(prev => ({ ...prev, [penaltyType]: true }));
    try {
      const q = query(
        collection(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION),
        where("type", "==", penaltyType),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docToDelete = snapshot.docs[0];
        const deletedPenaltyPoints = (docToDelete.data() as TGRDewanPenalty).pointsDeducted;
        console.log(`[handleDeleteLastPenalty] Found penalty to delete: ${docToDelete.id}, points: ${deletedPenaltyPoints}`);

        const batch = writeBatch(db);
        batch.delete(doc(db, MATCHES_TGR_COLLECTION, activeMatchId, DEWAN_PENALTIES_TGR_SUBCOLLECTION, docToDelete.id));
        console.log(`[handleDeleteLastPenalty] Prepared to delete penalty doc: ${docToDelete.ref.path}`);

        const deductionAmountToRevert = Math.abs(deletedPenaltyPoints);

        for (const juriId of TGR_JURI_IDS) {
            const juriDocRef = doc(db, MATCHES_TGR_COLLECTION, activeMatchId, JURI_SCORES_TGR_SUBCOLLECTION, juriId);
            console.log(`[handleDeleteLastPenalty] Preparing update for Juri: ${juriId}, path: ${juriDocRef.path}`);
            
            const juriDocSnap = await getDoc(juriDocRef); // Fetch current data

            if (juriDocSnap.exists()) {
                const currentJuriData = juriDocSnap.data() as TGRJuriScore;
                const newExternalDeductions = Math.max(0, (currentJuriData.externalDeductions || 0) - deductionAmountToRevert);
                
                const newCalculatedScore = parseFloat(
                    ( (currentJuriData.baseScore ?? BASE_SCORE_TGR) -
                      ((currentJuriData.gerakanSalahCount ?? 0) * GERAKAN_SALAH_DEDUCTION) +
                      (currentJuriData.staminaKemantapanBonus ?? 0) -
                      newExternalDeductions
                    ).toFixed(2)
                );
                
                const juriUpdateData = {
                    externalDeductions: newExternalDeductions,
                    calculatedScore: newCalculatedScore,
                    lastUpdated: serverTimestamp(),
                };
                console.log(`[handleDeleteLastPenalty] Data for Juri ${juriId}:`, juriUpdateData);
                batch.update(juriDocRef, juriUpdateData);
            } else {
                console.warn(`[handleDeleteLastPenalty] Juri doc not found for ${juriId}, skipping update for this juri.`);
            }
        }
        await batch.commit();
        console.log(`[handleDeleteLastPenalty] Batch commit successful for deleting penalty ${penaltyType}`);

      } else {
        alert(`Tidak ada pelanggaran tipe "${penaltyType}" yang bisa dihapus.`);
        console.log(`[handleDeleteLastPenalty] No penalty of type "${penaltyType}" found to delete.`);
      }
    } catch (err) {
      const firebaseError = err as any;
      console.error("[handleDeleteLastPenalty] Error processing penalty deletion or updating Juri scores. ActiveMatchId:", activeMatchId, "PenaltyType:", penaltyType, "Error:", firebaseError);
      let errorMessage = `Gagal menghapus pelanggaran & update skor juri: ${firebaseError.message || String(firebaseError)}`;
      if (firebaseError.code === 'permission-denied') {
        errorMessage += " Pastikan Anda telah login dan memiliki izin yang cukup. Periksa juga path Firestore yang diakses.";
      }
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsProcessing(prev => ({ ...prev, [penaltyType]: false }));
    }
  };

  const calculateTotalPointsForType = (penaltyType: TGRDewanPenaltyType): number => {
    return penaltiesLog
      .filter(p => p.type === penaltyType)
      .reduce((sum, p) => sum + p.pointsDeducted, 0);
  };

  const totalOverallPenalty = penaltiesLog.reduce((sum, p) => sum + p.pointsDeducted, 0);

  const mainParticipantName = scheduleDetails?.pesilatMerahName || 'Peserta';
  const mainParticipantContingent = scheduleDetails?.pesilatMerahContingent || 'Kontingen Tidak Diketahui';


  if (isLoading && configMatchId === undefined) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg text-muted-foreground">Memuat konfigurasi Panel Dewan TGR...</p>
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-2 py-4 md:p-6">
        <PageTitle title="Dewan Juri 1 - Pelanggaran TGR" description="Catat pelanggaran untuk penampilan kategori TGR.">
          <Button variant="outline" asChild>
            <Link href="/scoring/tgr"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link>
          </Button>
        </PageTitle>

        {isLoading && activeMatchId && !matchDetailsLoaded ? (
          <div className="text-center py-10">
            <Loader2 className="mx-auto h-16 w-16 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Memuat detail pertandingan TGR...</p>
          </div>
        ) : !activeMatchId ? (
          <div className="text-center py-10">
            <MinusCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
            <p className="text-xl font-semibold text-destructive">{error || "Tidak ada jadwal TGR yang aktif."}</p>
            <p className="text-muted-foreground mt-2">Silakan aktifkan jadwal TGR di halaman Admin.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 p-4 border rounded-lg shadow bg-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h2 className="text-xl font-bold text-primary">{mainParticipantContingent}</h2>
                  <p className="text-md text-foreground">{mainParticipantName} ({scheduleDetails?.category || 'N/A'})</p>
                </div>
                <div className="text-sm text-muted-foreground text-left sm:text-right">
                  <p>Partai/Undian: {scheduleDetails?.lotNumber || 'N/A'} | Babak: {scheduleDetails?.round || 'N/A'}</p>
                  <p>Gelanggang: {scheduleDetails?.place || 'N/A'}</p>
                </div>
              </div>
            </div>

            {error && <p className="text-red-500 text-center mb-4 p-2 bg-red-100 border border-red-300 rounded-md">{error}</p>}

            <div className="space-y-1 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center p-2 bg-gray-100 dark:bg-gray-800 font-semibold border-b border-gray-300 dark:border-gray-700">
                <div className="text-sm">Pelanggaran</div>
                <div className="text-sm text-center w-24">Hapus</div>
                <div className="text-sm text-center w-28">Skor</div>
                <div className="text-sm text-center w-20">Subtotal</div>
              </div>

              {PENALTY_TYPES.map((penalty) => (
                <div key={penalty.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center p-2 even:bg-gray-50 dark:even:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors duration-150">
                  <p className="text-sm text-foreground pr-2">{penalty.description}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-24 bg-blue-500 hover:bg-blue-600 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    onClick={() => handleDeleteLastPenalty(penalty.id)}
                    disabled={isProcessing[penalty.id] || penaltiesLog.filter(p => p.type === penalty.id).length === 0}
                  >
                    {isProcessing[penalty.id] && penaltiesLog.filter(p => p.type === penalty.id).length > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1 sm:mr-2" /> }
                     Hapus
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-28 mx-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => handleAddPenalty(penalty)}
                    disabled={isProcessing[penalty.id]}
                  >
                    {isProcessing[penalty.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : `${penalty.points.toFixed(2)}`}
                  </Button>
                  <div className="w-20 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                    {calculateTotalPointsForType(penalty.id).toFixed(2)}
                  </div>
                </div>
              ))}
              
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center p-3 bg-gray-200 dark:bg-gray-900 font-bold border-t-2 border-gray-400 dark:border-gray-600">
                <div className="text-md">TOTAL PELANGGARAN</div>
                <div></div> {/* Spacer */}
                <div></div> {/* Spacer */}
                <div className="text-md text-center w-20 text-red-600 dark:text-red-400">
                  {totalOverallPenalty.toFixed(2)}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

