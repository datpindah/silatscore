
"use client";

import { useState, type FormEvent } from 'react';
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

const partaiOptions = [
  { value: 'partai-1', label: 'Partai Pertandingan 1' },
  { value: 'partai-2', label: 'Partai Pertandingan 2' },
  { value: 'partai-final-a', label: 'Partai Final A Putra' },
  { value: 'partai-final-b', label: 'Partai Final B Putri' },
];

const halamanOptions = [
  { value: '/', label: 'Halaman Utama' },
  { value: '/admin', label: 'Admin Dashboard' },
  { value: '/admin/schedule-tanding', label: 'Admin - Jadwal Tanding' },
  { value: '/admin/schedule-tgr', label: 'Admin - Jadwal TGR' },
  { value: '/admin/rule-clarifier', label: 'Admin - Klarifikasi Aturan' },
  { value: '/scoring', label: 'Scoring - Pilihan Mode' },
  { value: '/scoring/tanding', label: 'Scoring - Pilihan Peran Tanding' },
  { value: '/scoring/tanding/dewan-1', label: 'Scoring - Dewan 1 (Tanding)' },
  { value: '/scoring/tanding/dewan-2', label: 'Scoring - Dewan 2 (Tanding)' },
  { value: '/scoring/tanding/juri-1', label: 'Scoring - Juri 1 (Tanding)' },
  { value: '/scoring/tanding/juri-2', label: 'Scoring - Juri 2 (Tanding)' },
  { value: '/scoring/tanding/juri-3', label: 'Scoring - Juri 3 (Tanding)' },
  { value: '/scoring/tanding/monitoring-skor', label: 'Scoring - Monitoring Skor (Tanding)' },
  { value: '/scoring/tanding/ketua-pertandingan', label: 'Scoring - Ketua Pertandingan (Tanding)' },
  { value: '/scoring/tgr', label: 'Scoring - TGR' },
];

const CORRECT_PASSWORD = "123456";

export default function LoginPage() {
  const router = useRouter();
  const [selectedPartai, setSelectedPartai] = useState<string>('');
  const [selectedHalaman, setSelectedHalaman] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!selectedPartai) {
      setError('Silakan pilih partai terlebih dahulu.');
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

    // Simulate API call
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
                <Select onValueChange={setSelectedPartai} value={selectedPartai} disabled={isLoading}>
                  <SelectTrigger id="partai">
                    <SelectValue placeholder="Pilih Partai Pertandingan" />
                  </SelectTrigger>
                  <SelectContent>
                    {partaiOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
