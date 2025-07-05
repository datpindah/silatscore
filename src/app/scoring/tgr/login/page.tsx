
"use client";

import { useState, type FormEvent, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn, AlertCircle, Loader2, Landmark, Send } from 'lucide-react';
import type { ScheduleTGR } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tgr_matches_by_gelanggang';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const NO_ACTIVE_TGR_SCHEDULE_VALUE = "NO_ACTIVE_TGR_SCHEDULE_SELECTED";

const defaultPartaiInfo = 'Masukkan nama gelanggang untuk melihat partai aktif';

const tgrHalamanOptions = [
  { value: '/scoring/tgr/timer-control', label: 'Kontrol Timer TGR' },
  { value: '/scoring/tgr/juri/juri-1', label: 'Juri 1 (TGR)' },
  { value: '/scoring/tgr/juri/juri-2', label: 'Juri 2 (TGR)' },
  { value: '/scoring/tgr/juri/juri-3', label: 'Juri 3 (TGR)' },
  { value: '/scoring/tgr/juri/juri-4', label: 'Juri 4 (TGR)' },
  { value: '/scoring/tgr/juri/juri-5', label: 'Juri 5 (TGR)' },
  { value: '/scoring/tgr/juri/juri-6', label: 'Juri 6 (TGR)' },
  { value: '/scoring/tgr/dewan-1', label: 'Dewan 1 (Input Penalti TGR)' },
  { value: '/scoring/tgr/ketua-pertandingan', label: 'Ketua Pertandingan (TGR)' },
  { value: '/scoring/tgr/monitoring-skor', label: 'Monitoring Skor (Display Umum TGR)' },
  { value: '/admin', label: 'Admin Panel' }
];


function TGRLoginPageContent() {
  const router = useRouter();
  const { user, loading: authLoading, error: authError, setError: setAuthError, sendAuthLink } = useAuth();

  const [partaiInfo, setPartaiInfo] = useState<string>(defaultPartaiInfo);
  const [selectedPartaiId, setSelectedPartaiId] = useState<string>(NO_ACTIVE_TGR_SCHEDULE_VALUE);
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [gelanggang, setGelanggang] = useState<string>('');
  
  const [pageError, setPageError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);

  useEffect(() => {
    if (user && selectedHalaman) {
      if (selectedHalaman.startsWith('/admin')) {
        router.push(selectedHalaman);
      } else if (gelanggang.trim()) {
        router.push(`${selectedHalaman}?gelanggang=${encodeURIComponent(gelanggang.trim())}`);
      }
    }
  }, [user, selectedHalaman, gelanggang, router]);
  
  useEffect(() => {
    if (!gelanggang.trim()) {
      setPartaiInfo(defaultPartaiInfo);
      setSelectedPartaiId(NO_ACTIVE_TGR_SCHEDULE_VALUE);
      setScheduleLoading(false);
      return;
    }

    setScheduleLoading(true);
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_MATCHES_BY_GELANGGANG_PATH), async (docSnap) => {
      let activeScheduleIdForGelanggang: string | null = null;
      if (docSnap.exists()) {
        activeScheduleIdForGelanggang = docSnap.data()?.[gelanggang.trim()] || null;
      }

      if (activeScheduleIdForGelanggang) {
        try {
          const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeScheduleIdForGelanggang);
          const scheduleDoc = await getDoc(scheduleDocRef);

          if (scheduleDoc.exists()) {
            const activeScheduleData = scheduleDoc.data() as ScheduleTGR;
            let displayLabel = `Partai ${activeScheduleData.lotNumber}: ${activeScheduleData.pesilatMerahName}`;
            if (activeScheduleData.pesilatBiruName) {
              displayLabel += ` & ${activeScheduleData.pesilatBiruName}`;
            }
            displayLabel += ` (${activeScheduleData.category}) di Gel. ${gelanggang.trim()}`;
            setPartaiInfo(displayLabel);
            setSelectedPartaiId(activeScheduleIdForGelanggang);
          } else {
            setPartaiInfo(`Tidak ada jadwal TGR aktif untuk gelanggang: ${gelanggang.trim()}`);
            setSelectedPartaiId(NO_ACTIVE_TGR_SCHEDULE_VALUE);
          }
        } catch (err) {
          console.error("Error fetching active TGR schedule details:", err);
          setPartaiInfo(`Error memuat jadwal untuk gelanggang: ${gelanggang.trim()}`);
          setSelectedPartaiId(NO_ACTIVE_TGR_SCHEDULE_VALUE);
        }
      } else {
        setPartaiInfo(`Tidak ada jadwal TGR aktif untuk gelanggang: ${gelanggang.trim()}`);
        setSelectedPartaiId(NO_ACTIVE_TGR_SCHEDULE_VALUE);
      }
      setScheduleLoading(false);
    }, (errorSub) => {
      console.error("Error subscribing to active TGR matches by gelanggang:", errorSub);
      setPartaiInfo(`Error memuat peta jadwal gelanggang.`);
      setSelectedPartaiId(NO_ACTIVE_TGR_SCHEDULE_VALUE);
      setScheduleLoading(false);
    });

    return () => unsub();
  }, [gelanggang]);

  useEffect(() => {
    if (authError) {
      setPageError(authError.message);
      setAuthError(null);
    }
  }, [authError, setAuthError]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError(null);
    setInfoMessage(null);
    
    if (!gelanggang.trim() && selectedHalaman && !selectedHalaman.startsWith('/admin')) {
        setPageError('Nama gelanggang tidak boleh kosong untuk halaman scoring.');
        return;
    }
    if (selectedPartaiId === NO_ACTIVE_TGR_SCHEDULE_VALUE && selectedHalaman && !selectedHalaman.startsWith('/admin')) {
      setPageError(`Tidak ada jadwal TGR aktif yang bisa dipilih untuk gelanggang: ${gelanggang.trim()}. Silakan aktifkan jadwal di halaman Admin atau periksa nama gelanggang.`);
      return;
    }
    if (!selectedHalaman) {
      setPageError('Silakan pilih halaman tujuan TGR terlebih dahulu.');
      return;
    }
    if (!email) {
      setPageError('Email tidak boleh kosong.');
      return;
    }
    
    setIsSubmitting(true);
    const result = await sendAuthLink(email);
    if(result.success) {
        setInfoMessage(result.message);
    } else {
        setPageError(result.message);
    }
    setIsSubmitting(false);
  };

  const isLoadingOverall = authLoading || isSubmitting || scheduleLoading;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel Scoring TGR</CardTitle>
            <CardDescription className="text-center font-body">
              Masukkan email Anda. Tautan login akan dikirimkan jika email terdaftar.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {pageError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Gagal</AlertTitle>
                  <AlertDescription>{pageError}</AlertDescription>
                </Alert>
              )}
               {infoMessage && (
                <Alert>
                  <LogIn className="h-4 w-4" />
                  <AlertTitle>Informasi</AlertTitle>
                  <AlertDescription>{infoMessage}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  disabled={isLoadingOverall}
                  className="bg-background/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gelanggang" className="font-headline">
                  <Landmark className="inline-block mr-1 h-4 w-4 text-primary" /> Nama Gelanggang
                </Label>
                <Input
                  id="gelanggang"
                  type="text"
                  value={gelanggang}
                  onChange={(e) => setGelanggang(e.target.value)}
                  placeholder="cth: Gelanggang TGR 1"
                  required={!selectedHalaman.startsWith('/admin')}
                  disabled={isLoadingOverall}
                  className="bg-background/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partai-tgr-info" className="font-headline">Partai TGR Aktif di Gelanggang Ini</Label>
                 <div className="p-3 min-h-[3rem] rounded-md border border-input bg-muted/50 text-sm text-muted-foreground flex items-center">
                    {scheduleLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
                    {partaiInfo}
                 </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="halaman-tgr" className="font-headline">Pilih Halaman Tujuan TGR</Label>
                <Select onValueChange={setSelectedHalaman} value={selectedHalaman} disabled={isLoadingOverall}>
                  <SelectTrigger id="halaman-tgr">
                    <SelectValue placeholder="Pilih Halaman Tujuan TGR" />
                  </SelectTrigger>
                  <SelectContent>
                    {tgrHalamanOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoadingOverall}>
                {isLoadingOverall ? ( 
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Kirim Tautan Login
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}

export default function TGRLoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /> Memuat Halaman Login TGR...</div>}>
      <TGRLoginPageContent />
    </Suspense>
  )
}
