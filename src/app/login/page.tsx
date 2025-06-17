
"use client";

import { useState, type FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn, AlertCircle, Loader2, Landmark } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH = 'app_settings/active_tanding_matches_by_gelanggang';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const NO_ACTIVE_SCHEDULE_VALUE = "NO_ACTIVE_SCHEDULE_SELECTED";

const defaultPartaiInfo = 'Masukkan nama gelanggang untuk melihat partai aktif';

const halamanOptions = [
  { value: '/scoring/tanding/dewan-1', label: 'Dewan Juri 1 (Timer & Kontrol Tanding)' },
  { value: '/scoring/tanding/dewan-2', label: 'Dewan Juri 2 (Display Skor Detail Tanding)' },
  { value: '/scoring/tanding/juri/juri-1', label: 'Juri 1 (Tanding)' },
  { value: '/scoring/tanding/juri/juri-2', label: 'Juri 2 (Tanding)' },
  { value: '/scoring/tanding/juri/juri-3', label: 'Juri 3 (Tanding)' },
  { value: '/scoring/tanding/ketua-pertandingan', label: 'Ketua Pertandingan (Tanding)' },
  { value: '/scoring/tanding/monitoring-skor', label: 'Monitoring Skor (Display Umum Tanding)' },
  { value: '/admin', label: 'Admin Panel' }
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signIn, loading: authLoading, error: authError, setError: setAuthError } = useAuth();

  const [partaiInfo, setPartaiInfo] = useState<string>(defaultPartaiInfo);
  const [selectedPartaiId, setSelectedPartaiId] = useState<string>(NO_ACTIVE_SCHEDULE_VALUE);
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [gelanggang, setGelanggang] = useState<string>(searchParams.get('gelanggang') || '');
  
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(false);

  useEffect(() => {
    // Jika pengguna sudah login dan halaman tujuan serta gelanggang (jika perlu) sudah dipilih, redirect
    if (user) {
      if (selectedHalaman.startsWith('/admin')) {
        router.push(selectedHalaman);
      } else if (selectedHalaman && gelanggang.trim()) {
        router.push(`${selectedHalaman}?gelanggang=${encodeURIComponent(gelanggang.trim())}`);
      }
    }
  }, [user, selectedHalaman, gelanggang, router]);
  
  useEffect(() => {
    const redirectGelanggang = searchParams.get('gelanggang');
    if (redirectGelanggang && !gelanggang) {
      setGelanggang(redirectGelanggang);
    }
    const redirectPage = searchParams.get('redirect');
     if (redirectPage && !selectedHalaman) {
        // Ensure the redirect page is valid
        const isValidRedirect = halamanOptions.some(opt => opt.value === redirectPage);
        if (isValidRedirect) {
            setSelectedHalaman(redirectPage);
        }
    }

  }, [searchParams, gelanggang, selectedHalaman]);


  useEffect(() => {
    if (!gelanggang.trim()) {
      setPartaiInfo(defaultPartaiInfo);
      setSelectedPartaiId(NO_ACTIVE_SCHEDULE_VALUE);
      setScheduleLoading(false);
      return;
    }

    setScheduleLoading(true);
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_MATCHES_BY_GELANGGANG_PATH), async (docSnap) => {
      let activeScheduleIdForGelanggang: string | null = null;
      if (docSnap.exists()) {
        activeScheduleIdForGelanggang = docSnap.data()?.[gelanggang.trim()] || null;
      }

      if (activeScheduleIdForGelanggang) {
        try {
          const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleIdForGelanggang);
          const scheduleDoc = await getDoc(scheduleDocRef);

          if (scheduleDoc.exists()) {
            const activeScheduleData = scheduleDoc.data() as ScheduleTanding;
            const formattedLabel = `Partai ${activeScheduleData.matchNumber}: ${activeScheduleData.pesilatMerahName} vs ${activeScheduleData.pesilatBiruName} (${activeScheduleData.class}) di Gel. ${gelanggang.trim()}`;
            setPartaiInfo(formattedLabel);
            setSelectedPartaiId(activeScheduleIdForGelanggang);
          } else {
            setPartaiInfo(`Tidak ada jadwal Tanding aktif untuk gelanggang: ${gelanggang.trim()}`);
            setSelectedPartaiId(NO_ACTIVE_SCHEDULE_VALUE);
          }
        } catch (err) {
          console.error("Error fetching active Tanding schedule details:", err);
          setPartaiInfo(`Error memuat jadwal untuk gelanggang: ${gelanggang.trim()}`);
          setSelectedPartaiId(NO_ACTIVE_SCHEDULE_VALUE);
        }
      } else {
        setPartaiInfo(`Tidak ada jadwal Tanding aktif untuk gelanggang: ${gelanggang.trim()}`);
        setSelectedPartaiId(NO_ACTIVE_SCHEDULE_VALUE);
      }
      setScheduleLoading(false);
    }, (errorSub) => {
      console.error("Error subscribing to active Tanding matches by gelanggang:", errorSub);
      setPartaiInfo(`Error memuat peta jadwal gelanggang.`);
      setSelectedPartaiId(NO_ACTIVE_SCHEDULE_VALUE);
      setScheduleLoading(false);
    });

    return () => unsub();
  }, [gelanggang]);

  useEffect(() => {
    if (authError) {
      if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password') {
        setPageError('Email atau password salah.');
      } else {
        setPageError(`Login gagal: ${authError.message}`);
      }
      setAuthError(null);
    }
  }, [authError, setAuthError]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError(null);
    
    const targetGelanggang = gelanggang.trim();

    if (!targetGelanggang && !selectedHalaman.startsWith('/admin')) {
        setPageError('Nama gelanggang tidak boleh kosong untuk halaman scoring.');
        return;
    }
    if (selectedPartaiId === NO_ACTIVE_SCHEDULE_VALUE && !selectedHalaman.startsWith('/admin')) {
      setPageError(`Tidak ada jadwal Tanding aktif yang bisa dipilih untuk gelanggang: ${targetGelanggang}. Silakan aktifkan jadwal di halaman Admin atau periksa nama gelanggang.`);
      return;
    }
    if (!selectedHalaman) {
      setPageError('Silakan pilih halaman tujuan terlebih dahulu.');
      return;
    }
    if (!email || !password) {
      setPageError('Email dan password tidak boleh kosong.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const loggedInUser = await signIn(email, password);
      if (loggedInUser) {
        // Redirect is handled by the useEffect hook watching `user`, `selectedHalaman`, and `gelanggang`
      }
    } catch (submitError) {
        // signIn function now handles setting authError, so this catch might be redundant
        // unless signIn itself throws an error not caught internally.
        console.error("Error during login handleSubmit calling signIn:", submitError);
        setPageError("Terjadi kesalahan tak terduga saat mencoba login.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const isLoadingOverall = authLoading || isSubmitting || scheduleLoading;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel SilatScore</CardTitle>
            <CardDescription className="text-center font-body">
              Masukkan email, password, dan nama gelanggang. Pilih partai dan halaman tujuan jika relevan.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {pageError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Login Gagal</AlertTitle>
                  <AlertDescription>{pageError}</AlertDescription>
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password Anda"
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
                  placeholder="cth: Gelanggang A"
                  required={!selectedHalaman.startsWith('/admin')}
                  disabled={isLoadingOverall}
                  className="bg-background/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partai-info" className="font-headline">Partai Tanding Aktif di Gelanggang Ini</Label>
                 <div className="p-3 min-h-[3rem] rounded-md border border-input bg-muted/50 text-sm text-muted-foreground flex items-center">
                    {scheduleLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}
                    {partaiInfo}
                 </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="halaman" className="font-headline">Pilih Halaman Tujuan</Label>
                <Select onValueChange={setSelectedHalaman} value={selectedHalaman} disabled={isLoadingOverall}>
                  <SelectTrigger id="halaman">
                    <SelectValue placeholder="Pilih Halaman Tujuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {halamanOptions.map(option => (
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
                    <LogIn className="mr-2 h-4 w-4" />
                    Login & Lanjutkan
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

export default function LoginPage() {
  // Wrap with Suspense because LoginPageContent uses useSearchParams
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /> Memuat Halaman Login...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}

