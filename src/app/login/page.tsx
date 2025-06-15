
"use client";

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext'; // Menggunakan AuthContext

const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const NO_ACTIVE_SCHEDULE_VALUE = "NO_ACTIVE_SCHEDULE_SELECTED";

const defaultPartaiOptions = [
  { value: NO_ACTIVE_SCHEDULE_VALUE, label: 'Tidak ada jadwal Tanding aktif' },
];

const halamanOptions = [
  { value: '/scoring/tanding/dewan-1', label: 'Dewan Juri 1 (Timer & Kontrol Tanding)' },
  { value: '/scoring/tanding/dewan-2', label: 'Dewan Juri 2 (Display Skor Detail Tanding)' },
  { value: '/scoring/tanding/juri/juri-1', label: 'Juri 1 (Tanding)' },
  { value: '/scoring/tanding/juri/juri-2', label: 'Juri 2 (Tanding)' },
  { value: '/scoring/tanding/juri/juri-3', label: 'Juri 3 (Tanding)' },
  { value: '/scoring/tanding/ketua-pertandingan', label: 'Ketua Pertandingan (Tanding)' },
  { value: '/scoring/tanding/monitoring-skor', label: 'Monitoring Skor (Display Umum Tanding)' },
  // Admin roles can be added here if needed, or handled separately
  { value: '/admin', label: 'Admin Panel' }
];

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, loading: authLoading, error: authError, setError: setAuthError } = useAuth(); // Dari AuthContext

  const [partaiOptions, setPartaiOptions] = useState<{value: string; label: string}[]>(defaultPartaiOptions);
  const [selectedPartai, setSelectedPartai] = useState<string>(NO_ACTIVE_SCHEDULE_VALUE);
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(true);

  useEffect(() => {
    if (user && selectedHalaman) { // Jika sudah login dan halaman tujuan dipilih, redirect
        router.push(selectedHalaman);
    }
  }, [user, selectedHalaman, router]);
  
  useEffect(() => {
    setScheduleLoading(true);
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), async (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const activeScheduleId = docSnap.data().activeScheduleId;
        if (activeScheduleId === null || activeScheduleId === "") {
            setPartaiOptions(defaultPartaiOptions);
            setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
            setScheduleLoading(false);
            return;
        }
        try {
          const scheduleDocRef = doc(db, SCHEDULE_TANDING_COLLECTION, activeScheduleId);
          const scheduleDoc = await getDoc(scheduleDocRef);

          if (scheduleDoc.exists()) {
            const activeScheduleData = scheduleDoc.data() as ScheduleTanding;
            const formattedLabel = `Partai ${activeScheduleData.matchNumber}: ${activeScheduleData.pesilatMerahName} vs ${activeScheduleData.pesilatBiruName} (${activeScheduleData.class})`;
            setPartaiOptions([{ value: activeScheduleId, label: formattedLabel }]);
            setSelectedPartai(activeScheduleId);
          } else {
            setPartaiOptions(defaultPartaiOptions);
            setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
          }
        } catch (err) {
          console.error("Error fetching active Tanding schedule details:", err);
          setPartaiOptions(defaultPartaiOptions);
          setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
        }
      } else {
        setPartaiOptions(defaultPartaiOptions);
        setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
      }
      setScheduleLoading(false);
    }, (errorSub) => {
      console.error("Error subscribing to active Tanding schedule config:", errorSub);
      setPartaiOptions(defaultPartaiOptions);
      setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
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
      setAuthError(null); // Clear authError from context after displaying
    }
  }, [authError, setAuthError]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError(null);
    
    if (selectedPartai === NO_ACTIVE_SCHEDULE_VALUE && !selectedHalaman.startsWith('/admin')) {
      setPageError('Tidak ada jadwal Tanding aktif yang bisa dipilih. Silakan aktifkan jadwal di halaman Admin.');
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
    const loggedInUser = await signIn(email, password);
    setIsSubmitting(false);

    if (loggedInUser) {
      // User will be redirected by the useEffect hook monitoring `user` and `selectedHalaman`
    } 
    // If login failed, authError effect will set pageError
  };

  const isLoading = authLoading || isSubmitting || scheduleLoading;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel SilatScore</CardTitle>
            <CardDescription className="text-center font-body">
              Masukkan email dan password Anda. Pilih partai dan halaman tujuan jika relevan.
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
                  disabled={isLoading}
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
                  disabled={isLoading}
                  className="bg-background/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partai" className="font-headline">Pilih Partai Tanding (Opsional untuk Admin)</Label>
                <Select
                  onValueChange={setSelectedPartai}
                  value={selectedPartai}
                  disabled={isLoading || (partaiOptions.length === 1 && partaiOptions[0]?.value === NO_ACTIVE_SCHEDULE_VALUE)}
                >
                  <SelectTrigger id="partai">
                    <SelectValue placeholder="Pilih Partai Pertandingan Tanding" />
                  </SelectTrigger>
                  <SelectContent>
                    {partaiOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} disabled={option.value === NO_ACTIVE_SCHEDULE_VALUE && option.label.includes('Tidak ada jadwal')}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 {scheduleLoading && partaiOptions[0]?.value === NO_ACTIVE_SCHEDULE_VALUE && <p className="text-xs text-muted-foreground">Memuat jadwal Tanding aktif...</p>}
                 {!scheduleLoading && partaiOptions[0]?.value === NO_ACTIVE_SCHEDULE_VALUE && <p className="text-xs text-destructive">Tidak ada jadwal Tanding aktif. Silakan atur di Admin.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="halaman" className="font-headline">Pilih Halaman Tujuan</Label>
                <Select onValueChange={setSelectedHalaman} value={selectedHalaman} disabled={isLoading}>
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
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                {isLoading ? ( 
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Login
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
