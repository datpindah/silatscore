
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

const ACTIVE_TANDING_SCHEDULE_KEY = 'SILATSCORE_ACTIVE_TANDING_SCHEDULE';

const defaultPartaiOptions = [
  { value: '', label: 'Tidak ada jadwal aktif' },
  // { value: 'partai-1-static', label: 'Partai Pertandingan 1 (Contoh Statis)' }, // Can be kept if needed
];

const halamanOptions = [
  { value: '/scoring/tanding/dewan-1', label: 'Scoring - Dewan 1 (Tanding)' },
  { value: '/scoring/tanding/dewan-2', label: 'Scoring - Dewan 2 (Tanding)' },
  { value: '/scoring/tanding/juri-1', label: 'Scoring - Juri 1 (Tanding)' },
  { value: '/scoring/tanding/juri-2', label: 'Scoring - Juri 2 (Tanding)' },
  { value: '/scoring/tanding/juri-3', label: 'Scoring - Juri 3 (Tanding)' },
  { value: '/scoring/tanding/monitoring-skor', label: 'Scoring - Monitoring Skor (Tanding)' },
  { value: '/scoring/tanding/ketua-pertandingan', label: 'Scoring - Ketua Pertandingan (Tanding)' },
];

const CORRECT_PASSWORD = "123456";

export default function LoginPage() {
  const router = useRouter();
  const [partaiOptions, setPartaiOptions] = useState<{value: string; label: string}[]>(defaultPartaiOptions);
  const [selectedPartai, setSelectedPartai] = useState<string>('');
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const storedActiveSchedule = localStorage.getItem(ACTIVE_TANDING_SCHEDULE_KEY);
    if (storedActiveSchedule) {
      try {
        const activeSchedule: ScheduleTanding = JSON.parse(storedActiveSchedule);
        const formattedLabel = `Partai ${activeSchedule.matchNumber}: ${activeSchedule.pesilatMerahName} vs ${activeSchedule.pesilatBiruName} (${activeSchedule.class} - ${new Date(activeSchedule.date).toLocaleDateString('id-ID')})`;
        setPartaiOptions([{ value: activeSchedule.id, label: formattedLabel }]);
        setSelectedPartai(activeSchedule.id); // Auto-select the active schedule
      } catch (err) {
        console.error("Error parsing active schedule from localStorage:", err);
        setPartaiOptions(defaultPartaiOptions);
        localStorage.removeItem(ACTIVE_TANDING_SCHEDULE_KEY); // Clear corrupted data
      }
    } else {
      setPartaiOptions(defaultPartaiOptions);
    }
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!selectedPartai && partaiOptions[0]?.value !== '') { // if there's an active schedule, it must be selected
      setError('Silakan pilih partai terlebih dahulu.');
      return;
    }
    if (partaiOptions[0]?.value === '' && selectedPartai === '') {
        setError('Tidak ada jadwal aktif yang bisa dipilih.');
        return;
    }
    if (!selectedHalaman) {
      setError('Silakan pilih halaman tujuan terlebih dahulu.');
      return;
    }
    if (!password) {
      setError('Password tidak boleh kosong.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (password === CORRECT_PASSWORD) {
        // Store selected partai info for the target page if needed
        // For now, just navigate
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
            <CardTitle className="text-3xl font-headline text-primary text-center">Login Panel</CardTitle>
            <CardDescription className="text-center font-body">
              Pilih partai, halaman tujuan, dan masukkan password untuk melanjutkan.
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
                <Label htmlFor="partai" className="font-headline">Pilih Partai</Label>
                <Select onValueChange={setSelectedPartai} value={selectedPartai} disabled={isLoading || (partaiOptions.length === 1 && partaiOptions[0]?.value === '')}>
                  <SelectTrigger id="partai">
                    <SelectValue placeholder="Pilih Partai Pertandingan" />
                  </SelectTrigger>
                  <SelectContent>
                    {partaiOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} disabled={option.value === ''}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="halaman" className="font-headline">Pilih Halaman Tujuan</Label>
                <Select onValueChange={setSelectedHalaman} value={selectedHalaman} disabled={isLoading}>
                  <SelectTrigger id="halaman">
                    <SelectValue placeholder="Pilih Halaman yang Akan Dikunjungi" />
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

    