
"use client";

import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useState, type FormEvent, type ChangeEvent, useEffect, useCallback } from 'react';
import { PlusCircle, Users, User, UserSquare, RotateCcw, Play, Pause, AlertTriangle, MinusCircle } from 'lucide-react';

type TGRCategory = 'Tunggal' | 'Ganda' | 'Regu';

interface ParticipantScores {
  baku: number;
  teknikKemantapan: number;
  penghayatan: number;
}

interface ParticipantHukuman {
  waktu: number;
  keluarArena: number;
  lainLain: number;
}

interface Participant {
  id: string;
  name: string;
  category: TGRCategory;
  scores: ParticipantScores;
  hukuman: ParticipantHukuman;
  totalScore: number;
}

const initialScores: ParticipantScores = { baku: 0, teknikKemantapan: 0, penghayatan: 0 };
const initialHukuman: ParticipantHukuman = { waktu: 0, keluarArena: 0, lainLain: 0 };

export default function ScoringTGRPage() {
  const [category, setCategory] = useState<TGRCategory>('Tunggal');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentParticipantName, setCurrentParticipantName] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(180); // 3 minutes for TGR
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchStatus, setMatchStatus] = useState<'Pending' | 'Ongoing' | 'Paused' | 'Finished'>('Pending');

  const calculateTotalScore = useCallback((scores: ParticipantScores, hukuman: ParticipantHukuman): number => {
    const positiveScore = scores.baku + scores.teknikKemantapan + scores.penghayatan;
    const totalHukuman = hukuman.waktu + hukuman.keluarArena + hukuman.lainLain;
    return Math.max(0, positiveScore - totalHukuman);
  }, []);

  useEffect(() => {
    setParticipants(prevParticipants => 
      prevParticipants.map(p => ({
        ...p,
        totalScore: calculateTotalScore(p.scores, p.hukuman)
      }))
    );
  }, [participants.map(p => p.scores), participants.map(p => p.hukuman), calculateTotalScore]);


  const handleAddParticipant = () => {
    if (!currentParticipantName.trim()) {
      alert('Nama peserta tidak boleh kosong.');
      return;
    }
    setParticipants(prev => [...prev, { 
      id: Date.now().toString(),
      name: currentParticipantName, 
      category,
      scores: { ...initialScores }, 
      hukuman: { ...initialHukuman },
      totalScore: calculateTotalScore(initialScores, initialHukuman)
    }]);
    setCurrentParticipantName('');
  };

  const updateParticipantScore = (id: string, criteria: keyof ParticipantScores, value: number) => {
    setParticipants(prev => 
      prev.map(p => 
        p.id === id ? { ...p, scores: { ...p.scores, [criteria]: Math.max(0,value) } } : p
      )
    );
  };

  const updateParticipantHukuman = (id: string, type: keyof ParticipantHukuman, value: number) => {
    setParticipants(prev => 
      prev.map(p => 
        p.id === id ? { ...p, hukuman: { ...p.hukuman, [type]: Math.max(0,value) } } : p
      )
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
      // Optionally reset participants or keep them for re-scoring
      // setParticipants([]); 
      setMatchStatus('Pending');
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
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

  const renderCategoryIcon = (cat: TGRCategory) => {
    if (cat === 'Tunggal') return <User className="mr-2 h-5 w-5" />;
    if (cat === 'Ganda') return <Users className="mr-2 h-5 w-5" />;
    if (cat === 'Regu') return <UserSquare className="mr-2 h-5 w-5" />;
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
              <Button onClick={() => handleTimerControl('reset')} variant="destructive"><RotateCcw className="mr-2 h-4 w-4" /> Reset Timer</Button>
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
              <Select 
                onValueChange={(value) => {
                  setCategory(value as TGRCategory);
                  // Optionally clear participants if category changes significantly
                  // setParticipants([]); 
                }} 
                value={category}
              >
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
                  placeholder={category === 'Tunggal' ? "Nama Pesilat" : category === 'Ganda' ? "Nama Pasangan Ganda" : "Nama Tim Regu"}
                />
              </div>
              <Button onClick={handleAddParticipant} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <PlusCircle className="mr-2 h-4 w-4" /> Tambah
              </Button>
            </div>
          </CardContent>
        </Card>

        {participants.map((participant) => (
          <Card key={participant.id} className="mb-6">
            <CardHeader>
              <CardTitle className="font-headline flex items-center justify-between">
                <div className="flex items-center">
                  {renderCategoryIcon(participant.category)}
                  {participant.name} ({participant.category})
                </div>
                <Button variant="outline" size="sm" onClick={() => setParticipants(ps => ps.filter(p => p.id !== participant.id))}>
                  <MinusCircle className="h-4 w-4 mr-1" /> Hapus Peserta
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold text-lg mb-2 font-headline text-primary">Nilai Penampilan</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`score-baku-${participant.id}`} className="font-headline">Nilai Baku</Label>
                    <Input id={`score-baku-${participant.id}`} type="number" value={participant.scores.baku} onChange={(e) => updateParticipantScore(participant.id, 'baku', parseInt(e.target.value) || 0)} placeholder="0-100" />
                  </div>
                  <div>
                    <Label htmlFor={`score-teknik-${participant.id}`} className="font-headline">Teknik & Kemantapan</Label>
                    <Input id={`score-teknik-${participant.id}`} type="number" value={participant.scores.teknikKemantapan} onChange={(e) => updateParticipantScore(participant.id, 'teknikKemantapan', parseInt(e.target.value) || 0)} placeholder="0-100" />
                  </div>
                  <div>
                    <Label htmlFor={`score-penghayatan-${participant.id}`} className="font-headline">Penghayatan</Label>
                    <Input id={`score-penghayatan-${participant.id}`} type="number" value={participant.scores.penghayatan} onChange={(e) => updateParticipantScore(participant.id, 'penghayatan', parseInt(e.target.value) || 0)} placeholder="0-100" />
                  </div>
                </div>
                 { (participant.category === 'Ganda' || participant.category === 'Regu') && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Untuk Ganda/Regu, pertimbangkan juga nilai Keserasian/Kekompakan dalam Teknik & Kemantapan.
                    </p>
                  )}
              </div>
              <Separator />
              <div>
                <h4 className="font-semibold text-lg mb-2 font-headline text-destructive">Hukuman</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`hukuman-waktu-${participant.id}`} className="font-headline">Pelanggaran Waktu</Label>
                    <Input id={`hukuman-waktu-${participant.id}`} type="number" value={participant.hukuman.waktu} onChange={(e) => updateParticipantHukuman(participant.id, 'waktu', parseInt(e.target.value) || 0)} placeholder="Poin Hukuman" />
                  </div>
                  <div>
                    <Label htmlFor={`hukuman-arena-${participant.id}`} className="font-headline">Keluar Arena</Label>
                    <Input id={`hukuman-arena-${participant.id}`} type="number" value={participant.hukuman.keluarArena} onChange={(e) => updateParticipantHukuman(participant.id, 'keluarArena', parseInt(e.target.value) || 0)} placeholder="Poin Hukuman" />
                  </div>
                  <div>
                    <Label htmlFor={`hukuman-lain-${participant.id}`} className="font-headline">Lain-lain</Label>
                    <Input id={`hukuman-lain-${participant.id}`} type="number" value={participant.hukuman.lainLain} onChange={(e) => updateParticipantHukuman(participant.id, 'lainLain', parseInt(e.target.value) || 0)} placeholder="Poin Hukuman" />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="text-right">
                <h4 className="font-headline text-xl">Total Skor Akhir: <span className="font-bold text-accent">{participant.totalScore.toFixed(2)}</span></h4>
              </div>
            </CardContent>
          </Card>
        ))}

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
