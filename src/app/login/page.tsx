
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
import { LogIn, AlertCircle } from 'lucide-react';
import type { ScheduleTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';


const ACTIVE_TANDING_SCHEDULE_CONFIG_PATH = 'app_settings/active_match_tanding';
const SCHEDULE_TANDING_COLLECTION = 'schedules_tanding';
const NO_ACTIVE_SCHEDULE_VALUE = "NO_ACTIVE_SCHEDULE_SELECTED";

const defaultPartaiOptions = [
  { value: NO_ACTIVE_SCHEDULE_VALUE, label: 'Tidak ada jadwal Tanding aktif' },
];

const halamanOptions = [
  { value: '/scoring/tanding/dewan-1', label: 'Dewan Juri 1 (Timer & Kontrol)' },
  { value: '/scoring/tanding/dewan-2', label: 'Dewan Juri 2 (Display Skor)' },
  { value: '/scoring/tanding/juri/juri-1', label: 'Juri 1' },
  { value: '/scoring/tanding/juri/juri-2', label: 'Juri 2' },
  { value: '/scoring/tanding/juri/juri-3', label: 'Juri 3' },
  { value: '/scoring/tanding/ketua-pertandingan', label: 'Ketua Pertandingan' },
  { value: '/scoring/tanding/monitoring-skor', label: 'Monitoring Skor (Display Umum)' },
];

const CORRECT_PASSWORD = "123"; // Ganti dengan password yang aman

export default function LoginPage() {
  const router = useRouter();
  const [partaiOptions, setPartaiOptions] = useState<{value: string; label: string}[]>(defaultPartaiOptions);
  const [selectedPartai, setSelectedPartai] = useState<string>(NO_ACTIVE_SCHEDULE_VALUE);
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    const unsub = onSnapshot(doc(db, ACTIVE_TANDING_SCHEDULE_CONFIG_PATH), async (docSnap) => {
      if (docSnap.exists() && docSnap.data()?.activeScheduleId) {
        const activeScheduleId = docSnap.data().activeScheduleId;
        if (activeScheduleId === null || activeScheduleId === "") {
            setPartaiOptions(defaultPartaiOptions);
            setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
            setIsLoading(false);
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
            console.warn("Active Tanding schedule document not found:", activeScheduleId);
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
      setIsLoading(false);
    }, (error) => {
      console.error("Error subscribing to active Tanding schedule config:", error);
      setPartaiOptions(defaultPartaiOptions);
      setSelectedPartai(NO_ACTIVE_SCHEDULE_VALUE);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (selectedPartai === NO_ACTIVE_SCHEDULE_VALUE) {
      setError('Tidak ada jadwal Tanding aktif yang bisa dipilih. Silakan aktifkan jadwal di halaman Admin.');
      setIsLoading(false);
      return;
    }
     if (!selectedPartai) {
      setError('Silakan pilih partai Tanding terlebih dahulu.');
      setIsLoading(false);
      return;
    }
    if (!selectedHalaman) {
      setError('Silakan pilih halaman tujuan terlebih dahulu.');
      setIsLoading(false);
      return;
    }
    if (!password) {
      setError('Password tidak boleh kosong.');
      setIsLoading(false);
      return;
    }

    setTimeout(() => {
      if (password === CORRECT_PASSWORD) {
        router.push(selectedHalaman);
      } else {
        setError('Password yang Anda masukkan salah.');
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/50">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel Scoring Tanding</CardTitle>
            <CardDescription className="text-center font-body">
              Pilih partai Tanding, halaman tujuan, dan masukkan password untuk melanjutkan.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Login Gagal</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="partai" className="font-headline">Pilih Partai Tanding</Label>
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
                      <SelectItem key={option.value} value={option.value} disabled={option.value === NO_ACTIVE_SCHEDULE_VALUE && option.label === 'Tidak ada jadwal Tanding aktif'}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 {isLoading && partaiOptions[0]?.value === NO_ACTIVE_SCHEDULE_VALUE && <p className="text-xs text-muted-foreground">Memuat jadwal Tanding aktif...</p>}
                 {!isLoading && partaiOptions[0]?.value === NO_ACTIVE_SCHEDULE_VALUE && <p className="text-xs text-destructive">Tidak ada jadwal Tanding aktif. Silakan atur di Admin.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="halaman" className="font-headline">Pilih Halaman Tujuan</Label>
                <Select onValueChange={setSelectedHalaman} value={selectedHalaman} disabled={isLoading}>
                  <SelectTrigger id="halaman">
                    <SelectValue placeholder="Pilih Halaman Scoring Tanding" />
                  </SelectTrigger>
                  <SelectContent>
                    {halamanOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <LogIn className="mr-2 h-4 w-4 animate-pulse" />
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
