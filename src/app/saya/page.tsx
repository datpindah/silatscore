"use client";

import { useState, type FormEvent, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LogIn, AlertCircle, Loader2, Users, Sword } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Login form component, adapted for general login
function LoginForm() {
  const { signIn, loading, error: authError, setError: setAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (authError) {
      if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password') {
        setPageError('Email atau password salah.');
      } else {
        setPageError(authError.message || 'Login gagal.');
      }
      setAuthError(null); // Clear error after displaying
    }
  }, [authError, setAuthError]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError(null);
    if (!email || !password) {
      setPageError('Email dan password tidak boleh kosong.');
      return;
    }
    await signIn(email, password);
    // The parent component will re-render upon successful login
  };

  return (
    <Card className="w-full max-w-md shadow-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-3xl font-headline text-primary text-center">Login</CardTitle>
        <CardDescription className="text-center font-body">
          Silakan login untuk mengakses panel scoring.
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
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com" required disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password Anda" required disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
            Login
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// Scoring selection component, shown after login
function ScoringSelection() {
  const { user, signOut } = useAuth();

  return (
    <>
      <PageTitle
        title={`Selamat Datang, ${user?.email || 'Pengguna'}`}
        description="Pilih jenis pertandingan Pencak Silat yang ingin Anda nilai atau kelola."
      />

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center font-headline text-primary">
                <Sword className="mr-3 h-7 w-7" />
                Scoring Tanding
              </CardTitle>
              <CardDescription className="font-body">
                Masuk ke halaman login panel Tanding untuk memilih peran spesifik (Juri, Dewan, dll).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/login">Buka Panel Tanding</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="flex items-center font-headline text-primary">
                <Users className="mr-3 h-7 w-7" />
                Scoring TGR
              </CardTitle>
              <CardDescription className="font-body">
                Masuk ke halaman login panel TGR untuk memilih peran spesifik.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Link href="/scoring/tgr/login">Buka Panel TGR</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="text-center mt-8">
            <Button variant="outline" onClick={signOut}>Logout</Button>
        </div>
    </>
  );
}

function SayaPageComponent() {
  const { user, loading } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : user ? (
          <ScoringSelection />
        ) : (
          <>
            <PageTitle title="Halaman Saya" />
            <LoginForm />
          </>
        )}
      </main>
    </div>
  );
}

export default function SayaPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <SayaPageComponent />
    </Suspense>
  )
}
