"use client";

import { useState, type FormEvent, type ChangeEvent, useRef, useEffect } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Wand2, Copy, Upload, Minus, Plus } from 'lucide-react';
import { generateBracket, type BracketGeneratorInput, type BracketGeneratorOutput } from '@/ai/flows/bracket-generator-flow';
import * as XLSX from 'xlsx';

export default function BracketGeneratorPage() {
  const [participantCount, setParticipantCount] = useState(8);
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [bracketData, setBracketData] = useState<BracketGeneratorOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setParticipantNames(currentNames => {
        const newNames = Array(participantCount).fill('');
        for (let i = 0; i < Math.min(participantCount, currentNames.length); i++) {
            newNames[i] = currentNames[i];
        }
        return newNames;
    });
  }, [participantCount]);

  const handleParticipantNameChange = (index: number, value: string) => {
    const newNames = [...participantNames];
    newNames[index] = value;
    setParticipantNames(newNames);
  };

  const adjustParticipantCount = (amount: number) => {
    setParticipantCount(prev => {
        const newCount = prev + amount;
        if (newCount >= 3 && newCount <= 32) {
            return newCount;
        }
        return prev;
    });
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const processUploadedFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target?.result;
            if (!data) throw new Error("Gagal membaca file.");

            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as string[][];

            const uploadedNames = jsonData.map(row => String(row[0]).trim()).filter(Boolean);
            
            if (uploadedNames.length < 3) {
                setError("File harus berisi setidaknya 3 nama peserta.");
                return;
            }
            if (uploadedNames.length > 32) {
                 setError("Jumlah peserta tidak boleh lebih dari 32.");
                return;
            }

            setParticipantCount(uploadedNames.length);
            setParticipantNames(uploadedNames);
            setError(null);

        } catch (err) {
            console.error("Error processing file:", err);
            setError(err instanceof Error ? err.message : "Gagal memproses file XLSX.");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const participantList = participantNames
      .map((name, index) => name.trim() || `Peserta ${index + 1}`)
      .filter(Boolean);

    if (participantList.length < 3 || participantList.length > 32) {
      setError('Jumlah peserta harus antara 3 dan 32.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setBracketData(null);

    try {
      const input: BracketGeneratorInput = {
        participantCount: participantList.length,
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
          <CardDescription>Atur jumlah peserta, lalu masukkan nama atau unggah file XLSX. Urutan menentukan seeding.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className='flex-1 space-y-2'>
                    <Label htmlFor="participant-count">Jumlah Peserta</Label>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="icon" onClick={() => adjustParticipantCount(-1)} disabled={participantCount <= 3}>
                            <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                            id="participant-count"
                            type="number"
                            className="w-16 text-center"
                            value={participantCount}
                            onChange={(e) => {
                                const count = parseInt(e.target.value);
                                if (!isNaN(count) && count >= 3 && count <= 32) {
                                    setParticipantCount(count);
                                }
                            }}
                            min="3" max="32"
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => adjustParticipantCount(1)} disabled={participantCount >= 32}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className='sm:pt-8'>
                    <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={processUploadedFile} className="hidden" />
                    <Button type="button" variant="outline" onClick={handleFileUploadClick} disabled={isLoading}>
                        <Upload className="mr-2 h-4 w-4"/>
                        Unggah Daftar Peserta (.xlsx)
                    </Button>
                </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Daftar Nama Peserta</Label>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2'>
                {participantNames.map((name, index) => (
                    <div key={index} className="flex items-center gap-3">
                        <Label htmlFor={`participant-${index}`} className="text-sm text-muted-foreground min-w-[2rem] text-right">{index + 1}.</Label>
                        <Input
                            id={`participant-${index}`}
                            value={name}
                            onChange={(e) => handleParticipantNameChange(index, e.target.value)}
                            placeholder={`Nama Peserta ${index + 1}`}
                            disabled={isLoading}
                        />
                    </div>
                ))}
              </div>
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
