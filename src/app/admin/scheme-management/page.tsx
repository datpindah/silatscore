"use client";

import { useState, type FormEvent } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Wand2, Copy } from 'lucide-react';
import { generateBracket, type BracketGeneratorInput, type BracketGeneratorOutput } from '@/ai/flows/bracket-generator-flow';

export default function BracketGeneratorPage() {
  const [participants, setParticipants] = useState('');
  const [bracketData, setBracketData] = useState<BracketGeneratorOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const participantList = participants.split('\n').map(p => p.trim()).filter(Boolean);
    const participantCount = participantList.length;

    if (participantCount < 3 || participantCount > 32) {
      setError('Jumlah peserta harus antara 3 dan 32.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setBracketData(null);

    try {
      const input: BracketGeneratorInput = {
        participantCount,
        participantList,
      };
      const result = await generateBracket(input);
      setBracketData(result);
    } catch (err) {
      console.error("Error generating bracket:", err);
      setError(err instanceof Error ? err.message : 'Gagal membuat bagan. Silakan coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyJson = () => {
    if (bracketData) {
      navigator.clipboard.writeText(JSON.stringify(bracketData, null, 2));
      alert('Struktur JSON bagan disalin ke clipboard!');
    }
  };

  return (
    <>
      <PageTitle title="Generator Bagan Pertandingan" description="Buat struktur bagan sistem gugur secara otomatis berdasarkan daftar peserta." />

      <Card>
        <CardHeader>
          <CardTitle>Input Peserta</CardTitle>
          <CardDescription>Masukkan nama peserta, satu per baris. Urutan menentukan seeding (peserta teratas akan mendapat prioritas bye).</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="participants-input" className="font-semibold">Daftar Nama Peserta</Label>
              <Textarea
                id="participants-input"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Peserta 1\nPeserta 2\nPeserta 3\n..."
                rows={12}
                className="mt-2 font-mono"
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground mt-2">Jumlah Peserta: {participants.split('\n').map(p => p.trim()).filter(Boolean).length}</p>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Buat Bagan
            </Button>
          </CardContent>
        </form>
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Terjadi Kesalahan</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {bracketData && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Hasil Struktur Bagan (JSON)</CardTitle>
                <CardDescription>Berikut adalah struktur data bagan yang dihasilkan. Anda bisa menyalinnya untuk digunakan lebih lanjut.</CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyJson}>
                <Copy className="h-4 w-4" />
                <span className="sr-only">Salin JSON</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
              <code>{JSON.stringify(bracketData, null, 2)}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </>
  );
}
