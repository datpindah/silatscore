
"use client";

import type { ChangeEvent } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, MinusCircle, Play, Pause, RotateCcw, AlertTriangle, ShieldAlert, Ban, Info } from 'lucide-react';
import type { PesilatColor, Foul, Warning, ScoreDetail } from '@/lib/types';
import { foulIcons } from '@/lib/types'; // Assuming foulIcons is exported from types

const ROUND_DURATION_SECONDS = 120; // 2 minutes per round
const TOTAL_ROUNDS = 3;

interface PesilatState {
  name: string;
  contingent: string;
  score: number;
  fouls: Foul[];
  warnings: Warning[];
  scoresLog: ScoreDetail[];
}

const initialPesilatState = (name: string, contingent: string): PesilatState => ({
  name,
  contingent,
  score: 0,
  fouls: [],
  warnings: [],
  scoresLog: [],
});

// Mapping from icon string names to actual Lucide components
const foulIconComponentsMap: Record<string, React.ElementType> = {
  'MinusCircle': MinusCircle,
  'AlertTriangle': AlertTriangle,
  'ShieldAlert': ShieldAlert,
  'Ban': Ban,
};

export default function ScoringPage() {
  const [pesilatMerah, setPesilatMerah] = useState<PesilatState>(initialPesilatState('Pesilat Merah', 'Kontingen A'));
  const [pesilatBiru, setPesilatBiru] = useState<PesilatState>(initialPesilatState('Pesilat Biru', 'Kontingen B'));
  
  const [currentRound, setCurrentRound] = useState(1);
  const [timerSeconds, setTimerSeconds] = useState(ROUND_DURATION_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchStatus, setMatchStatus] = useState<'Pending' | 'Ongoing' | 'Paused' | 'Finished'>('Pending');

  const [selectedFoulPesilat, setSelectedFoulPesilat] = useState<PesilatColor | null>(null);
  const [selectedFoulType, setSelectedFoulType] = useState<Foul['type'] | ''>('');
  const [foulDescription, setFoulDescription] = useState('');


  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prevSeconds) => prevSeconds - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      if (currentRound < TOTAL_ROUNDS) {
        // Optionally auto-pause or auto-proceed to next round setup
        setMatchStatus('Paused');
        alert(`Babak ${currentRound} selesai!`);
      } else {
        setMatchStatus('Finished');
        alert('Pertandingan Selesai!');
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerSeconds, currentRound]);

  const handleTimerControl = (action: 'start' | 'pause' | 'reset' | 'next_round') => {
    if (action === 'start') {
      if (matchStatus === 'Finished') return;
      setIsTimerRunning(true);
      setMatchStatus('Ongoing');
    } else if (action === 'pause') {
      setIsTimerRunning(false);
      if (matchStatus !== 'Finished') setMatchStatus('Paused');
    } else if (action === 'reset') {
      setIsTimerRunning(false);
      setTimerSeconds(ROUND_DURATION_SECONDS);
      setCurrentRound(1);
      setPesilatMerah(initialPesilatState(pesilatMerah.name, pesilatMerah.contingent));
      setPesilatBiru(initialPesilatState(pesilatBiru.name, pesilatBiru.contingent));
      setMatchStatus('Pending');
    } else if (action === 'next_round') {
      if (currentRound < TOTAL_ROUNDS) {
        setCurrentRound(prev => prev + 1);
        setTimerSeconds(ROUND_DURATION_SECONDS);
        setIsTimerRunning(false); // Or true if auto-start next round
        setMatchStatus('Pending');
      } else {
        alert('Pertandingan sudah selesai.');
        setMatchStatus('Finished');
      }
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const updatePesilatDetails = (color: PesilatColor, field: 'name' | 'contingent', value: string) => {
    const setter = color === 'Merah' ? setPesilatMerah : setPesilatBiru;
    setter(prev => ({ ...prev, [field]: value }));
  };

  const addScore = (color: PesilatColor, points: number, type: ScoreDetail['type']) => {
    const setter = color === 'Merah' ? setPesilatMerah : setPesilatBiru;
    setter(prev => ({
      ...prev,
      score: prev.score + points,
      scoresLog: [...prev.scoresLog, { id: Date.now().toString(), type, points, timestamp: new Date() }]
    }));
  };
  
  const deductScore = (color: PesilatColor, points: number, type: ScoreDetail['type']) => {
    const setter = color === 'Merah' ? setPesilatMerah : setPesilatBiru;
     setter(prev => ({
      ...prev,
      score: Math.max(0, prev.score - points), // Ensure score doesn't go below 0
      // Optionally log deductions too, or adjust existing score log
    }));
  };

  const addFoul = () => {
    if (!selectedFoulPesilat || !selectedFoulType) {
      alert('Pilih pesilat dan tipe pelanggaran.');
      return;
    }

    const pointsDeductedMap: Record<Foul['type'], number> = {
      'Teguran': 1,
      'Peringatan I': 2,
      'Peringatan II': 3,
      'Diskualifikasi': 5, // Or sets score to 0 / match ends
    };
    const pointsDeducted = pointsDeductedMap[selectedFoulType];

    const newFoul: Foul = {
      id: Date.now().toString(),
      type: selectedFoulType,
      description: foulDescription,
      pointsDeducted,
      timestamp: new Date(),
    };

    const setter = selectedFoulPesilat === 'Merah' ? setPesilatMerah : setPesilatBiru;
    setter(prev => ({
      ...prev,
      fouls: [...prev.fouls, newFoul],
      score: Math.max(0, prev.score - pointsDeducted),
    }));
    
    setSelectedFoulPesilat(null);
    setSelectedFoulType('');
    setFoulDescription('');
  };
  
  const renderFoulIcon = (foulType: Foul['type']) => {
    const iconNameString = foulIcons[foulType]; // Get the string name e.g., "MinusCircle"
    const IconComponent = foulIconComponentsMap[iconNameString] || Info; // Look up the component, fallback to Info
    return <IconComponent className="h-4 w-4 mr-1" />;
  };


  const PesilatCard = ({ color, state, onAddScore, onDeductScore, onUpdateDetails }: { color: PesilatColor, state: PesilatState, onAddScore: (points: number, type: ScoreDetail['type']) => void, onDeductScore: (points: number, type: ScoreDetail['type']) => void, onUpdateDetails: (field: 'name' | 'contingent', value: string) => void }) => {
    const cardBg = color === 'Merah' ? 'bg-red-600/20 border-red-600' : 'bg-blue-600/20 border-blue-600';
    const textMain = color === 'Merah' ? 'text-red-700' : 'text-blue-700';
    const textScore = color === 'Merah' ? 'text-red-800' : 'text-blue-800';
    const buttonClass = color === 'Merah' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600';

    return (
      <Card className={`flex-1 ${cardBg}`}>
        <CardHeader className="pb-2">
          <CardTitle className={`text-3xl font-headline ${textMain}`}>{state.name}</CardTitle>
          <Input 
            type="text" 
            value={state.name} 
            onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdateDetails('name', e.target.value)}
            className="text-sm mt-1 bg-background/80"
            placeholder="Nama Pesilat"
          />
          <Input 
            type="text" 
            value={state.contingent} 
            onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdateDetails('contingent', e.target.value)}
            className="text-sm mt-1 bg-background/80"
            placeholder="Kontingen"
          />
        </CardHeader>
        <CardContent className="text-center">
          <p className={`text-8xl font-bold ${textScore} my-4`}>{state.score}</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button onClick={() => onAddScore(1, 'Pukulan')} className={`${buttonClass} text-primary-foreground`}><PlusCircle className="mr-2 h-4 w-4" /> Pukulan (+1)</Button>
            <Button onClick={() => onAddScore(2, 'Tendangan')} className={`${buttonClass} text-primary-foreground`}><PlusCircle className="mr-2 h-4 w-4" /> Tendangan (+2)</Button>
            <Button onClick={() => onAddScore(3, 'Jatuhan')} className={`${buttonClass} text-primary-foreground`}><PlusCircle className="mr-2 h-4 w-4" /> Jatuhan (+3)</Button>
            <Button onClick={() => onDeductScore(1, 'Teknik Lain')} variant="outline" className={`border-${color === 'Merah' ? 'red' : 'blue'}-500 text-${color === 'Merah' ? 'red' : 'blue'}-500 hover:bg-${color === 'Merah' ? 'red' : 'blue'}-500/10`}><MinusCircle className="mr-2 h-4 w-4" /> Hapus Poin (-1)</Button>
          </div>
           <Separator className="my-4" />
           <div className="text-left">
            <h4 className="font-headline text-lg mb-2">Pelanggaran:</h4>
            {state.fouls.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada pelanggaran.</p>}
            <ul className="space-y-1">
              {state.fouls.map(foul => (
                <li key={foul.id} className="text-sm flex items-center">
                  {renderFoulIcon(foul.type)}
                  {foul.type} (-{foul.pointsDeducted})
                  {foul.description && <span className="text-xs text-muted-foreground ml-2">({foul.description})</span>}
                </li>
              ))}
            </ul>
           </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <PageTitle title="Scoring Pertandingan" description={`Babak ${currentRound} dari ${TOTAL_ROUNDS} - Status: ${matchStatus}`} />

        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="text-center font-headline text-2xl text-primary">Timer Pertandingan</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-6xl font-bold font-mono text-accent mb-4">{formatTime(timerSeconds)}</div>
            <div className="flex justify-center gap-2 flex-wrap">
              <Button onClick={() => handleTimerControl('start')} disabled={isTimerRunning || matchStatus === 'Finished'} className="bg-green-500 hover:bg-green-600 text-white"><Play className="mr-2 h-4 w-4" /> Start</Button>
              <Button onClick={() => handleTimerControl('pause')} disabled={!isTimerRunning || matchStatus === 'Finished'} className="bg-yellow-500 hover:bg-yellow-600 text-white"><Pause className="mr-2 h-4 w-4" /> Pause</Button>
              <Button onClick={() => handleTimerControl('next_round')} disabled={currentRound >= TOTAL_ROUNDS || isTimerRunning} className="bg-blue-500 hover:bg-blue-600 text-white">Babak Selanjutnya</Button>
              <Button onClick={() => handleTimerControl('reset')} variant="destructive"><RotateCcw className="mr-2 h-4 w-4" /> Reset Match</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <PesilatCard 
            color="Merah" 
            state={pesilatMerah} 
            onAddScore={(points, type) => addScore('Merah', points, type)} 
            onDeductScore={(points, type) => deductScore('Merah', points, type)}
            onUpdateDetails={(field, value) => updatePesilatDetails('Merah', field, value)} 
          />
          <PesilatCard 
            color="Biru" 
            state={pesilatBiru} 
            onAddScore={(points, type) => addScore('Biru', points, type)} 
            onDeductScore={(points, type) => deductScore('Biru', points, type)}
            onUpdateDetails={(field, value) => updatePesilatDetails('Biru', field, value)}
          />
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-xl text-primary">Input Pelanggaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pesilat-foul" className="font-headline">Pesilat</Label>
              <Select onValueChange={(value) => setSelectedFoulPesilat(value as PesilatColor)} value={selectedFoulPesilat || ''}>
                <SelectTrigger id="pesilat-foul">
                  <SelectValue placeholder="Pilih Pesilat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Merah">Pesilat Merah</SelectItem>
                  <SelectItem value="Biru">Pesilat Biru</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="foul-type" className="font-headline">Tipe Pelanggaran</Label>
              <Select onValueChange={(value) => setSelectedFoulType(value as Foul['type'])} value={selectedFoulType}>
                <SelectTrigger id="foul-type">
                  <SelectValue placeholder="Pilih Tipe Pelanggaran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Teguran">Teguran (-1 poin)</SelectItem>
                  <SelectItem value="Peringatan I">Peringatan I (-2 poin)</SelectItem>
                  <SelectItem value="Peringatan II">Peringatan II (-3 poin)</SelectItem>
                  <SelectItem value="Diskualifikasi">Diskualifikasi (-5 poin / Selesai)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="foul-description" className="font-headline">Deskripsi (Opsional)</Label>
              <Textarea id="foul-description" value={foulDescription} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFoulDescription(e.target.value)} placeholder="Detail pelanggaran..." />
            </div>
            <Button onClick={addFoul} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Tambah Pelanggaran</Button>
          </CardContent>
        </Card>
        
      </main>
    </div>
  );
}

    