
"use client";

import { use, useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from "@/components/ui/table";
import { ArrowLeft, Loader2, AlertCircle, Megaphone, MinusCircle, ShieldAlert, AlertTriangle as AlertTriangleIcon, Ban, Info, ListChecks } from 'lucide-react';
import type { ScheduleTanding, OfficialActionRecord, OfficialFoulType, OfficialWarningType } from '@/lib/types';
import { FOUL_TYPES, WARNING_TYPES, FOUL_POINT_DEDUCTIONS, WARNING_POINT_DEDUCTIONS, foulIcons } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, Timestamp, collection, addDoc, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const MATCHES_TANDING_COLLECTION = 'matches_tanding';
const OFFICIAL_ACTIONS_SUBCOLLECTION = 'official_actions';

interface PesilatDisplayInfo {
  name: string;
  contingent: string;
}

interface TimerStatusFromDewan {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: string;
}

const initialTimerStatus: TimerStatusFromDewan = {
  currentRound: 1,
  timerSeconds: 0,
  isTimerRunning: false,
  matchStatus: 'Pending',
};

export default function KetuaPertandinganPage({ params: paramsPromise }: { params: Promise<{}> }) {
  // const params = use(paramsPromise); // Not using params for this page

  const [configMatchId, setConfigMatchId] = useState<string | null | undefined>(undefined);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const [matchDetails, setMatchDetails] = useState<ScheduleTanding | null>(null);
  const [pesilatMerahInfo, setPesilatMerahInfo] = useState<PesilatDisplayInfo | null>(null);
  const [pesilatBiruInfo, setPesilatBiruInfo] = useState<PesilatDisplayInfo | null>(null);
  const [matchDetailsLoaded, setMatchDetailsLoaded] = useState(false);

  const [dewanTimerStatus, setDewanTimerStatus] = useState<TimerStatusFromDewan>(initialTimerStatus);
  const [officialActionsLog, setOfficialActionsLog] = useState<OfficialActionRecord[]>([]);

  // States for the dialog
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [targetPesilatForAction, setTargetPesilatForAction] = useState<'merah' | 'biru' | null>(null);
  const [actionCategory, setActionCategory] = useState<'pelanggaran' | 'binaan_peringatan'>('pelanggaran');
  const [selectedFoulType, setSelectedFoulType] = useState<OfficialFoulType | ''>('');
  const [selectedWarningType, setSelectedWarningType] = useState<OfficialWarningType | ''>('');
  const [actionNotes, setActionNotes] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetAllMatchData = useCallback(() => {
    setMatchDetails(null);
    setPesilatMerahInfo(null);
    setPesilatBiruInfo(null);
    setMatchDetailsLoaded(false);
    setDewanTimerStatus(initialTimerStatus);
    setOfficialActionsLog([]);
    setError(null);
  }, []);

  useEffect(() => {
    const unsubConfig = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), (docSnap) => {
      const newDbConfigId = docSnap.exists() ? docSnap.data()?.activeScheduleId : null;
      if (newDbConfigId !== configMatchId) {
        setConfigMatchId(newDbConfigId);
      } else if (configMatchId === undefined && newDbConfigId === null) {
        setConfigMatchId(null);
      }
    }, (err) => {
      console.error("Error fetching active schedule config:", err);
      setError("Gagal memuat konfigurasi jadwal aktif global.");
      setConfigMatchId(null);
    });
    return () => unsubConfig();
  }, [configMatchId]);

  useEffect(() => {
    if (configMatchId === undefined) {
      setIsLoading(true);
      return;
    }
    if (configMatchId !== activeMatchId) {
      resetAllMatchData();
      setActiveMatchId(configMatchId);
      setMatchDetailsLoaded(false);
      if (configMatchId) setIsLoading(true);
      else setIsLoading(false);
    } else if (configMatchId === null && activeMatchId === null && isLoading) {
      setIsLoading(false);
    }
  }, [configMatchId, activeMatchId, resetAllMatchData, isLoading]);

  useEffect(() => {
    if (!activeMatchId) {
      if (isLoading) setIsLoading(false);
      setError(null);
      setMatchDetails(null); // Clear details if no active match
      setPesilatMerahInfo(null);
      setPesilatBiruInfo(null);
      setOfficialActionsLog([]);
      setDewanTimerStatus(initialTimerStatus);
      return;
    }

    let mounted = true;
    if (!isLoading && !matchDetailsLoaded) setIsLoading(true); // Start loading if we have an ID but no details yet

    const unsubscribers: (() => void)[] = [];

    const loadScheduleDetails = async () => {
      if (!mounted || !activeMatchId) return;
      try {
        const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeMatchId);
        const scheduleDoc = await getDoc(scheduleDocRef);
        if (!mounted) return;
        if (scheduleDoc.exists()) {
          const data = scheduleDoc.data() as ScheduleTanding;
          setMatchDetails(data);
          setPesilatMerahInfo({ name: data.pesilatMerahName, contingent: data.pesilatMerahContingent });
          setPesilatBiruInfo({ name: data.pesilatBiruName, contingent: data.pesilatBiruContingent });
          setMatchDetailsLoaded(true);
        } else {
          setError(`Detail jadwal untuk ID ${activeMatchId} tidak ditemukan.`);
          setMatchDetailsLoaded(false);
        }
      } catch (err) {
        console.error("Error fetching schedule details:", err);
        setError("Gagal memuat detail jadwal.");
        setMatchDetailsLoaded(false);
      }
    };
    loadScheduleDetails();

    const matchDocRef = doc(db, MATCHES_TANDING_COLLECTION, activeMatchId);
    const unsubTimer = onSnapshot(matchDocRef, (docSnap) => {
      if (!mounted) return;
      if (docSnap.exists() && docSnap.data()?.timer_status) {
        setDewanTimerStatus(docSnap.data()?.timer_status as TimerStatusFromDewan);
      } else {
        setDewanTimerStatus(initialTimerStatus);
      }
    }, (error) => {
      if (!mounted) return;
      console.error("Error fetching dewan timer status:", error);
      setError("Gagal mendapatkan status timer dari dewan.");
    });
    unsubscribers.push(unsubTimer);

    const actionsQuery = query(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), orderBy("timestamp", "asc"));
    const unsubActions = onSnapshot(actionsQuery, (querySnapshot) => {
      if (!mounted) return;
      const actions: OfficialActionRecord[] = [];
      querySnapshot.forEach((doc) => {
        actions.push({ id: doc.id, ...doc.data() } as OfficialActionRecord);
      });
      setOfficialActionsLog(actions);
    }, (error) => {
      if (!mounted) return;
      console.error("Error fetching official actions:", error);
      setError("Gagal memuat log tindakan resmi.");
    });
    unsubscribers.push(unsubActions);
    
    // Check if loading can be stopped
    if (matchDetailsLoaded && isLoading) {
        setIsLoading(false);
    }


    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => unsub());
    };
  }, [activeMatchId]);
  
  // Effect to stop loading once details are loaded or if no active matchId
  useEffect(() => {
    if (isLoading && (matchDetailsLoaded || activeMatchId === null)) {
      setIsLoading(false);
    }
  }, [isLoading, matchDetailsLoaded, activeMatchId]);


  const handleOpenActionDialog = (pesilat: 'merah' | 'biru') => {
    setTargetPesilatForAction(pesilat);
    setActionCategory('pelanggaran'); // Default
    setSelectedFoulType('');
    setSelectedWarningType('');
    setActionNotes('');
    setIsActionDialogOpen(true);
  };

  const handleSubmitAction = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeMatchId || !targetPesilatForAction || dewanTimerStatus.matchStatus === 'MatchFinished') {
      alert("Tidak bisa menambah tindakan: tidak ada match aktif, target pesilat, atau match sudah selesai.");
      return;
    }

    let typeForRecord: OfficialFoulType | OfficialWarningType | '' = '';
    let pointDeduction = 0;

    if (actionCategory === 'pelanggaran') {
      if (!selectedFoulType) {
        alert("Pilih jenis pelanggaran.");
        return;
      }
      typeForRecord = selectedFoulType;
      pointDeduction = FOUL_POINT_DEDUCTIONS[selectedFoulType];
      if (selectedFoulType === 'Diskualifikasi') {
        // Handle disqualification logic if needed, e.g., confirm match end
        alert(`Pesilat ${targetPesilatForAction} didiskualifikasi. Pertandingan akan dihentikan (fitur belum otomatis).`);
      }
    } else { // binaan_peringatan
      if (!selectedWarningType) {
        alert("Pilih jenis binaan/peringatan.");
        return;
      }
      typeForRecord = selectedWarningType;
      pointDeduction = WARNING_POINT_DEDUCTIONS[selectedWarningType];
    }

    setIsSubmittingAction(true);
    try {
      const actionData: Omit<OfficialActionRecord, 'id' | 'timestamp'> & { timestamp: Timestamp } = {
        actionCategory,
        pesilatColor: targetPesilatForAction,
        type: typeForRecord,
        pointDeduction,
        round: dewanTimerStatus.currentRound,
        timestamp: Timestamp.now(),
        notes: actionNotes.trim() || undefined,
      };
      await addDoc(collection(db, MATCHES_TANDING_COLLECTION, activeMatchId, OFFICIAL_ACTIONS_SUBCOLLECTION), actionData);
      setIsActionDialogOpen(false);
    } catch (err) {
      console.error("Error adding official action:", err);
      alert(`Gagal menyimpan tindakan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };
  
  const getIconForAction = (action: OfficialActionRecord) => {
    const iconName = foulIcons[action.type as keyof typeof foulIcons];
    if (iconName === 'MinusCircle') return <MinusCircle className="h-4 w-4" />;
    if (iconName === 'AlertTriangle') return <AlertTriangleIcon className="h-4 w-4" />;
    if (iconName === 'ShieldAlert') return <ShieldAlert className="h-4 w-4" />;
    if (iconName === 'Ban') return <Ban className="h-4 w-4" />;
    if (iconName === 'Info') return <Info className="h-4 w-4" />;
    if (iconName === 'Megaphone') return <Megaphone className="h-4 w-4" />;
    return <ListChecks className="h-4 w-4" />;
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const totalDeductionsMerah = officialActionsLog
    .filter(a => a.pesilatColor === 'merah')
    .reduce((sum, a) => sum + (a.pointDeduction || 0), 0);
  const totalDeductionsBiru = officialActionsLog
    .filter(a => a.pesilatColor === 'biru')
    .reduce((sum, a) => sum + (a.pointDeduction || 0), 0);

  if (configMatchId === undefined || (isLoading && activeMatchId)) {
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 container mx-auto p-4 md:p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">Memuat data Ketua Pertandingan...</p>
            </main>
        </div>
    );
  }

  if (!activeMatchId && !isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          <PageTitle title="Ketua Pertandingan - Tanding" description="Panel untuk Ketua Pertandingan." />
          <Card className="mt-6 shadow-lg">
            <CardHeader className="items-center">
              <AlertCircle className="h-12 w-12 text-yellow-500 mb-2" />
              <CardTitle className="text-xl font-headline text-center text-primary">Tidak Ada Pertandingan Aktif</CardTitle>
            </CardHeader>
            <CardContent className="p-6 text-center">
              <p className="mb-4 text-muted-foreground">Silakan aktifkan jadwal pertandingan di halaman Admin untuk menggunakan panel ini.</p>
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle
          title="Ketua Pertandingan - Tanding"
          description={matchDetails ? `${matchDetails.pesilatMerahName} vs ${matchDetails.pesilatBiruName} (${matchDetails.class})` : "Memuat detail..."}
        >
          <Button variant="outline" asChild>
            <Link href="/login"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Login</Link>
          </Button>
        </PageTitle>

        {/* Match Info and Timer */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="font-headline text-center text-primary">Status Pertandingan (Dewan)</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            {isLoading && !matchDetailsLoaded ? (
              <> <Skeleton className="h-8 w-3/4 mx-auto" /> <Skeleton className="h-10 w-1/2 mx-auto" /> </>
            ) : (
              <>
              <p className="text-lg">Babak: <span className="font-semibold">{dewanTimerStatus.currentRound}</span></p>
              <p className="text-3xl font-mono font-bold">{formatTime(dewanTimerStatus.timerSeconds)}</p>
              <p className="text-sm text-muted-foreground">Status: {dewanTimerStatus.isTimerRunning ? 'Berjalan' : dewanTimerStatus.matchStatus}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pesilat Sections */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Pesilat Merah */}
          <Card className="border-red-500 border-2">
            <CardHeader>
              <CardTitle className="text-red-600 font-headline">
                {pesilatMerahInfo?.name || (isLoading ? <Skeleton className="h-6 w-32" /> : "Pesilat Merah")}
              </CardTitle>
              <CardDescription>
                {pesilatMerahInfo?.contingent || (isLoading ? <Skeleton className="h-4 w-24" /> : "Kontingen Merah")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-2 font-semibold">Total Pengurangan Poin: <span className="text-red-600">{totalDeductionsMerah}</span></p>
              <Button onClick={() => handleOpenActionDialog('merah')} className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={dewanTimerStatus.matchStatus === 'MatchFinished' || isLoading}>
                Tambah Tindakan untuk Merah
              </Button>
            </CardContent>
          </Card>

          {/* Pesilat Biru */}
          <Card className="border-blue-500 border-2">
            <CardHeader>
              <CardTitle className="text-blue-600 font-headline">
                {pesilatBiruInfo?.name || (isLoading ? <Skeleton className="h-6 w-32" /> : "Pesilat Biru")}
              </CardTitle>
              <CardDescription>
                {pesilatBiruInfo?.contingent || (isLoading ? <Skeleton className="h-4 w-24" /> : "Kontingen Biru")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-2 font-semibold">Total Pengurangan Poin: <span className="text-blue-600">{totalDeductionsBiru}</span></p>
              <Button onClick={() => handleOpenActionDialog('biru')} className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={dewanTimerStatus.matchStatus === 'MatchFinished' || isLoading}>
                Tambah Tindakan untuk Biru
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Log Tindakan Resmi */}
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Log Tindakan Resmi</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Daftar pelanggaran dan binaan yang dicatat.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Babak</TableHead>
                  <TableHead>Pesilat</TableHead>
                  <TableHead>Jenis Tindakan</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Poin</TableHead>
                  <TableHead>Catatan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officialActionsLog.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center">Belum ada tindakan tercatat.</TableCell></TableRow>
                ) : (
                  officialActionsLog.map(action => (
                    <TableRow key={action.id}>
                      <TableCell>{action.timestamp instanceof Timestamp ? action.timestamp.toDate().toLocaleTimeString() : 'N/A'}</TableCell>
                      <TableCell>{action.round}</TableCell>
                      <TableCell className={cn(action.pesilatColor === 'merah' ? 'text-red-600' : 'text-blue-600', "font-semibold")}>
                        {action.pesilatColor === 'merah' ? pesilatMerahInfo?.name : pesilatBiruInfo?.name}
                      </TableCell>
                      <TableCell>{action.actionCategory === 'pelanggaran' ? 'Pelanggaran' : 'Binaan/Peringatan'}</TableCell>
                      <TableCell className="flex items-center gap-1">
                        {getIconForAction(action)} {action.type}
                      </TableCell>
                      <TableCell>{action.pointDeduction}</TableCell>
                      <TableCell>{action.notes || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog Tambah Tindakan */}
        <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Tambah Tindakan untuk Pesilat {targetPesilatForAction === 'merah' ? pesilatMerahInfo?.name : pesilatBiruInfo?.name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitAction}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="actionCategory" className="text-right col-span-1">Kategori</Label>
                  <Select value={actionCategory} onValueChange={(v) => setActionCategory(v as any)} >
                    <SelectTrigger className="col-span-3" id="actionCategory">
                      <SelectValue placeholder="Pilih kategori tindakan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pelanggaran">Pelanggaran</SelectItem>
                      <SelectItem value="binaan_peringatan">Binaan / Peringatan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {actionCategory === 'pelanggaran' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="selectedFoulType" className="text-right col-span-1">Jenis Pelanggaran</Label>
                    <Select value={selectedFoulType} onValueChange={(v) => setSelectedFoulType(v as any)}>
                      <SelectTrigger className="col-span-3" id="selectedFoulType">
                        <SelectValue placeholder="Pilih jenis pelanggaran" />
                      </SelectTrigger>
                      <SelectContent>
                        {FOUL_TYPES.map(foul => <SelectItem key={foul} value={foul}>{foul} ({FOUL_POINT_DEDUCTIONS[foul]})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {actionCategory === 'binaan_peringatan' && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="selectedWarningType" className="text-right col-span-1">Jenis Binaan</Label>
                    <Select value={selectedWarningType} onValueChange={(v) => setSelectedWarningType(v as any)}>
                      <SelectTrigger className="col-span-3" id="selectedWarningType">
                        <SelectValue placeholder="Pilih jenis binaan/peringatan" />
                      </SelectTrigger>
                      <SelectContent>
                        {WARNING_TYPES.map(warn => <SelectItem key={warn} value={warn}>{warn} ({WARNING_POINT_DEDUCTIONS[warn]})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="actionNotes" className="text-right col-span-1">Catatan</Label>
                  <Textarea id="actionNotes" value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} className="col-span-3" placeholder="Catatan tambahan (opsional)" />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Batal</Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmittingAction}>
                  {isSubmittingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Tindakan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
