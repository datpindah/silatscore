
"use client";

import { useState, type FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import type { ScheduleTGR } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVE_TGR_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tgr';
const SCHEDULE_TGR_COLLECTION = 'schedules_tgr';
const NO_ACTIVE_TGR_SCHEDULE_VALUE = "NO_ACTIVE_TGR_SCHEDULE_SELECTED";

const defaultPartaiOptions = [
  { value: NO_ACTIVE_TGR_SCHEDULE_VALUE, label: 'Tidak ada jadwal TGR aktif' },
];

function TGRLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signIn, loading: authLoading, error: authError, setError: setAuthError } = useAuth();

  const [partaiOptions, setPartaiOptions] = useState<{value: string; label: string}[]>(defaultPartaiOptions);
  const [selectedPartai, setSelectedPartai] = useState<string>(NO_ACTIVE_TGR_SCHEDULE_VALUE);
  const [destinationPage, setDestinationPage] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(true);

  useEffect(() => {
    const dest = searchParams.get('destination');
    if (dest) {
      setDestinationPage(dest);
    } else {
      // Fallback if no destination is provided, e.g., redirect to TGR roles page
      setDestinationPage('/scoring/tgr'); 
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && destinationPage) {
        router.push(destinationPage);
    }
  }, [user, destinationPage, router]);
  
  useEffect(() => {
    setScheduleLoading(true);
    const unsub = onSnapshot(doc(db, ACTIVE_TGR_SCHEDULE_CONFIG_PATH), async (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const activeScheduleId = docSnap.data().activeScheduleId;
        if (activeScheduleId === null || activeScheduleId === "") {
            setPartaiOptions(defaultPartaiOptions);
            setSelectedPartai(NO_ACTIVE_TGR_SCHEDULE_VALUE);
            setScheduleLoading(false);
            return;
        }
        try {
          const scheduleDocRef = doc(db, SCHEDULE_TGR_COLLECTION, activeScheduleId);
          const scheduleDoc = await getDoc(scheduleDocRef);

          if (scheduleDoc.exists()) {
            const activeScheduleData = scheduleDoc.data() as ScheduleTGR;
            const formattedLabel = `Partai ${activeScheduleData.lotNumber}: ${activeScheduleData.pesilatMerahName} (${activeScheduleData.category})`;
            setPartaiOptions([{ value: activeScheduleId, label: formattedLabel }]);
            setSelectedPartai(activeScheduleId);
          } else {
            setPartaiOptions(defaultPartaiOptions);
            setSelectedPartai(NO_ACTIVE_TGR_SCHEDULE_VALUE);
          }
        } catch (err) {
          console.error("Error fetching active TGR schedule details:", err);
          setPartaiOptions(defaultPartaiOptions);
          setSelectedPartai(NO_ACTIVE_TGR_SCHEDULE_VALUE);
        }
      } else {
        setPartaiOptions(defaultPartaiOptions);
        setSelectedPartai(NO_ACTIVE_TGR_SCHEDULE_VALUE);
      }
      setScheduleLoading(false);
    }, (errorSub) => {
      console.error("Error subscribing to active TGR schedule config:", errorSub);
      setPartaiOptions(defaultPartaiOptions);
      setSelectedPartai(NO_ACTIVE_TGR_SCHEDULE_VALUE);
      setScheduleLoading(false);
    });

    return () => unsub();
  }, []);

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
    
    if (selectedPartai === NO_ACTIVE_TGR_SCHEDULE_VALUE && destinationPage && !destinationPage.startsWith('/admin')) {
      setPageError('Tidak ada jadwal TGR aktif yang bisa dipilih. Silakan aktifkan jadwal di halaman Admin.');
      return;
    }
    if (!destinationPage) {
      setPageError('Halaman tujuan tidak ditemukan. Silakan kembali dan pilih peran.');
      return;
    }
    if (!email || !password) {
      setPageError('Email dan password tidak boleh kosong.');
      return;
    }
    
    setIsSubmitting(true);
    await signIn(email, password);
    setIsSubmitting(false);
    // Redirection is handled by the useEffect hook monitoring `user` and `destinationPage`
  };

  const isLoadingOverall = authLoading || isSubmitting || scheduleLoading || !destinationPage;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel TGR</CardTitle>
            <CardDescription className="text-center font-body">
              Masukkan email dan password Firebase Anda.
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
                <Label htmlFor="email">Email (Firebase Auth)</Label>
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
                <Label htmlFor="password">Password (Firebase Auth)</Label>
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
                <Label htmlFor="partai-tgr" className="font-headline">Partai TGR Aktif</Label>
                 <Input
                  id="partai-tgr"
                  type="text"
                  value={partaiOptions[0]?.label || 'Memuat...'}
                  readOnly
                  disabled
                  className="bg-muted/50 text-muted-foreground"
                />
                 {scheduleLoading && partaiOptions[0]?.value === NO_ACTIVE_TGR_SCHEDULE_VALUE && <p className="text-xs text-muted-foreground">Memuat jadwal TGR aktif...</p>}
                 {!scheduleLoading && partaiOptions[0]?.value === NO_ACTIVE_TGR_SCHEDULE_VALUE && <p className="text-xs text-destructive">Tidak ada jadwal TGR aktif. Silakan atur di Admin.</p>}
              </div>
              {destinationPage && (
                <div className="space-y-1">
                  <Label className="font-headline">Halaman Tujuan</Label>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded-md">{destinationPage}</p>
                </div>
              )}
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

export default function TGRLoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <TGRLoginPageContent />
    </Suspense>
  )
}
