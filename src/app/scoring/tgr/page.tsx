
"use client";

import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent, type ChangeEvent } from 'react';
import { PlusCircle, Users, User, UserSquare, RotateCcw, Play, Pause, AlertTriangle } from 'lucide-react';

// Placeholder types, adjust as needed for TGR scoring
interface Participant {
  name: string;
  score: number;
  // Add other TGR specific fields: e.g., correctness, stamina, expression for Tunggal
}

type TGRCategory = 'Tunggal' | 'Ganda' | 'Regu';

export default function ScoringTGRPage() {
  const [category, setCategory] = useState<TGRCategory>('Tunggal');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipantName, setCurrentParticipantName] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(180); // 3 minutes for TGR
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchStatus, setMatchStatus] = useState<'Pending' | 'Ongoing' | 'Paused' | 'Finished'>('Pending');

  const handleAddParticipant = () => {
    if (!currentParticipantName.trim()) {
      alert('Nama peserta tidak boleh kosong.');
      return;
    }
    setParticipants(prev => [...prev, { name: currentParticipantName, score: 0 }]);
    setCurrentParticipantName('');
  };

  const updateParticipantScore = (index: number, newScore: number) => {
    setParticipants(prev => 
      prev.map((p, i) => i === index ? { ...p, score: Math.max(0, newScore) } : p)
    );
  };
  
  const handleTimerControl = (action: 'start' | 'pause' | 'reset') => {
    if (action === 'start') {
      if (matchStatus === 'Finished') return;
      setIsTimerRunning(true);
      setMatchStatus('Ongoing');
    } else if (action === 'pause') {
      setIsTimerRunning(false);
      if (matchStatus !== 'Finished') setMatchStatus('Paused');
    } else if (action === 'reset') {
      setIsTimerRunning(false);
      setTimerSeconds(180);
      setParticipants([]); // Reset participants as well or based on specific logic
      setMatchStatus('Pending');
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Effect for timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      setMatchStatus('Finished');
      alert('Waktu penampilan TGR Selesai!');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerSeconds]);


  const renderCategoryIcon = () => {
    if (category === 'Tunggal') return <User className="mr-2 h-5 w-5" />;
    if (category === 'Ganda') return <Users className="mr-2 h-5 w-5" />;
    if (category === 'Regu') return <UserSquare className="mr-2 h-5 w-5" />;
    return null;
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle title="Scoring Pertandingan TGR" description={`Kategori: ${category} - Status: ${matchStatus}`} />
        
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-center font-headline text-2xl text-primary">Timer Penampilan</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-6xl font-bold font-mono text-accent mb-4">{formatTime(timerSeconds)}</div>
            <div className="flex justify-center gap-2 flex-wrap">
              <Button onClick={() => handleTimerControl('start')} disabled={isTimerRunning || matchStatus === 'Finished'} className="bg-green-500 hover:bg-green-600 text-white"><Play className="mr-2 h-4 w-4" /> Start</Button>
              <Button onClick={() => handleTimerControl('pause')} disabled={!isTimerRunning || matchStatus === 'Finished'} className="bg-yellow-500 hover:bg-yellow-600 text-white"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
              <Button onClick={() => handleTimerControl('reset')} variant="destructive"><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="font-headline">Pengaturan Kategori & Peserta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="tgr-category" className="font-headline">Pilih Kategori TGR</Label>
              <Select onValueChange={(value) => setCategory(value as TGRCategory)} value={category}>
                <SelectTrigger id="tgr-category">
                  <SelectValue placeholder="Pilih Kategori TGR" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tunggal"><User className="inline-block mr-2 h-4 w-4" />Tunggal</SelectItem>
                  <SelectItem value="Ganda"><Users className="inline-block mr-2 h-4 w-4" />Ganda</SelectItem>
                  <SelectItem value="Regu"><UserSquare className="inline-block mr-2 h-4 w-4" />Regu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-grow">
                <Label htmlFor="participant-name" className="font-headline">Nama Peserta/Tim</Label>
                <Input 
                  id="participant-name" 
                  value={currentParticipantName} 
                  onChange={(e) => setCurrentParticipantName(e.target.value)}
                  placeholder={category === 'Tunggal' ? "Nama Pesilat" : category === 'Ganda' ? "Nama Tim Ganda" : "Nama Tim Regu"}
                />
              </div>
              <Button onClick={handleAddParticipant} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah
              </Button>
            </div>
          </CardContent>
        </Card>

        {participants.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center">
                {renderCategoryIcon()}
                Input Nilai - {category}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {participants.map((participant, index) => (
                <div key={index} className="p-4 border rounded-md">
                  <h3 className="font-semibold text-lg mb-2">{participant.name}</h3>
                  {/* TODO: Add TGR specific scoring inputs here */}
                  {/* Example for a generic score input */}
                  <Label htmlFor={`score-${index}`} className="font-headline">Nilai</Label>
                  <Input 
                    id={`score-${index}`} 
                    type="number" 
                    value={participant.score} 
                    onChange={(e) => updateParticipantScore(index, parseInt(e.target.value) || 0)}
                    placeholder="Masukkan Nilai"
                    className="w-full md:w-1/3"
                  />
                   <p className="text-xs text-muted-foreground mt-1">Detail penilaian TGR akan ditambahkan.</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {participants.length === 0 && matchStatus !== 'Pending' && (
            <Card>
                <CardContent className="p-6 text-center">
                    <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
                    <p className="text-muted-foreground">Belum ada peserta yang ditambahkan untuk kategori {category}.</p>
                    <p className="text-muted-foreground">Silakan tambahkan peserta terlebih dahulu.</p>
                </CardContent>
            </Card>
        )}

      </main>
    </div>
  );
}

    