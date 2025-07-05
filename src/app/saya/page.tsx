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
import { LogIn, AlertCircle, Loader2, Users, Sword, Mail, Shield, UserPlus, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLogo } from '@/components/layout/AppLogo';

// Inline SVG for Google Icon
const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
);

// Inline SVG for Apple Icon
const AppleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19.16,11.45a3.34,3.34,0,0,0-3.33-3.27,3.42,3.42,0,0,0-3.42,3.38c0,2.15,1.38,3.29,3.35,3.29a3.53,3.53,0,0,0,3.39-3.4Zm-3.38-4.4a4.34,4.34,0,0,1,3.49,1.7,4.64,4.64,0,0,1-3.38,1.64A4.3,4.3,0,0,1,12.5,7a4.9,4.9,0,0,1,3.28.09ZM15.42,23a8.53,8.53,0,0,1-4.63-1.55A8.25,8.25,0,0,1,6.5,16.21a9,9,0,0,1,3-6.42,8.66,8.66,0,0,1,5.21-2.45,4.72,4.72,0,0,1,1.52.21,4.55,4.55,0,0,0-1.72,1.33,8.7,8.7,0,0,0-3.11,6.88,8.83,8.83,0,0,0,3.13,7A5.28,5.28,0,0,0,19.38,23a4.5,4.5,0,0,1-3.95,0Z"/></svg>
);

// New component for email/password form
function EmailLoginForm({ onBack }: { onBack: () => void }) {
  const { sendAuthLink, loading, error: authError, setError: setAuthError } = useAuth();
  const [email, setEmail] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authError) {
      setPageError(authError.message || 'Terjadi kesalahan.');
      setAuthError(null); // Clear error after displaying
    }
  }, [authError, setAuthError]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPageError(null);
    setMessage(null);

    if (!email.trim()) {
      setPageError('Email tidak boleh kosong.');
      return;
    }
    
    const result = await sendAuthLink(email);
    
    if (result.success) {
      setMessage(result.message);
    } else {
      setPageError(result.message);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-none border-none">
      <CardHeader>
        <CardTitle className="text-2xl font-headline text-primary text-center">
            Login dengan Tautan Email
        </CardTitle>
        <CardDescription className="text-center">
          Masukkan email Anda yang terdaftar. Jika valid, kami akan mengirimkan tautan untuk masuk.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {pageError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Gagal</AlertTitle>
              <AlertDescription>{pageError}</AlertDescription>
            </Alert>
          )}
          {message && (
             <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Informasi</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" required disabled={loading} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Kirim Tautan Login
          </Button>
          <Button type="button" variant="link" onClick={onBack}>Kembali ke pilihan lain</Button>
        </CardFooter>
      </form>
    </Card>
  );
}


function LoginSelection() {
    const { signInWithGoogle, signInWithApple, loading, error: authError, setError: setAuthError } = useAuth();
    const [pageError, setPageError] = useState<string | null>(null);
    const [showEmailForm, setShowEmailForm] = useState(false);

    useEffect(() => {
        if (authError) {
            // Handle specific OAuth errors if needed, e.g., auth/popup-closed-by-user
            setPageError(authError.message || 'Login gagal.');
            setAuthError(null);
        }
    }, [authError, setAuthError]);

    if (showEmailForm) {
        return <EmailLoginForm onBack={() => setShowEmailForm(false)} />;
    }

    return (
        <div className="w-full max-w-sm mx-auto flex flex-col items-center">
            <AppLogo />
            <div className="h-16"></div> {/* Spacer */}
            {pageError && (
                <Alert variant="destructive" className="mb-4 w-full">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Login Gagal</AlertTitle>
                    <AlertDescription>{pageError}</AlertDescription>
                </Alert>
            )}
            <div className="space-y-3 w-full">
                <Button variant="outline" className="w-full justify-start h-12 text-base gap-4" onClick={signInWithGoogle} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcon />}
                    Lanjutkan dengan Google
                </Button>
                <Button variant="outline" className="w-full justify-start h-12 text-base gap-4" onClick={signInWithApple} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <AppleIcon />}
                    Lanjutkan dengan Apple
                </Button>
                <Button className="w-full justify-start h-12 text-base gap-4" onClick={() => setShowEmailForm(true)} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail />}
                    Lanjutkan dengan Email
                </Button>
            </div>
             <p className="px-8 text-center text-sm text-muted-foreground mt-8">
                Dengan melanjutkan, Anda menyetujui {" "}
                <Link href="#" className="underline underline-offset-4 hover:text-primary">
                    Persyaratan Layanan
                </Link>{" "}
                dan{" "}
                <Link href="#" className="underline underline-offset-4 hover:text-primary">
                    Kebijakan Privasi
                </Link>
                {" "} kami.
            </p>
        </div>
    );
}

// Scoring selection component, shown after login
function ScoringSelection() {
  const { user, signOut } = useAuth();

  return (
    <div className="container mx-auto px-4 py-8 text-center w-full">
      <PageTitle
        title={`Selamat Datang, ${user?.displayName || user?.email || 'Pengguna'}`}
        description="Pilih panel yang ingin Anda akses di bawah ini."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8 max-w-5xl mx-auto">
        {/* Scoring Tanding Card */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col text-left">
          <CardHeader className="flex-grow">
            <CardTitle className="flex items-center font-headline text-primary">
              <Sword className="mr-3 h-6 w-6" />
              Scoring Tanding
            </CardTitle>
            <CardDescription className="font-body pt-2">
              Masuk ke panel scoring Tanding untuk memilih peran (Juri, Dewan, dll).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link href="/login">Buka Panel Tanding</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Scoring TGR Card */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col text-left">
          <CardHeader className="flex-grow">
            <CardTitle className="flex items-center font-headline text-primary">
              <Users className="mr-3 h-6 w-6" />
              Scoring TGR
            </CardTitle>
            <CardDescription className="font-body pt-2">
              Masuk ke panel scoring TGR untuk memilih peran spesifik.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link href="/scoring/tgr/login">Buka Panel TGR</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Admin Panel Card */}
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col text-left border-accent">
            <CardHeader className="flex-grow">
                <CardTitle className="flex items-center font-headline text-accent">
                    <Shield className="mr-3 h-6 w-6" />
                    Panel Admin
                </CardTitle>
                <CardDescription className="font-body pt-2">
                    Kelola jadwal, peserta, dan pengaturan pertandingan.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Link href="/admin">Buka Panel Admin</Link>
                </Button>
            </CardContent>
        </Card>
      </div>

      <div className="text-center mt-12">
        <Button variant="outline" onClick={signOut}>Logout</Button>
      </div>
    </div>
  );
}


function SayaPageComponent() {
  const { user, loading } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : user ? (
          <ScoringSelection />
        ) : (
          <LoginSelection />
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
