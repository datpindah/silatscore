
"use client";

import { useState, useEffect } from 'react';
import { PageTitle } from '@/components/shared/PageTitle';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataRecapTable, type RecapMatchItem } from '@/components/admin/DataRecapTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Filter, AlertTriangle, Loader2 } from 'lucide-react';
import { ageCategories, type AgeCategory, type ScheduleTanding, type ScheduleTGR, type TimerStatus, type TGRTimerStatus, type MatchResultTanding } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';

const ALL_CATEGORIES_VALUE = "ALL_CATEGORIES";

export default function AdminDashboardPage() {
  const [selectedAgeCategory, setSelectedAgeCategory] = useState<string>(ALL_CATEGORIES_VALUE);
  const [allMatches, setAllMatches] = useState<RecapMatchItem[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<RecapMatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);

  const parseAgeCategory = (className: string): AgeCategory | string => {
    const lowerClassName = className.toLowerCase();
    if (lowerClassName.includes('pra usia dini')) return 'Pra-Usia Dini';
    if (lowerClassName.includes('usia dini')) return 'Usia Dini';
    if (lowerClassName.includes('pra remaja') || lowerClassName.includes('praremaja')) return 'Pra-Remaja';
    if (lowerClassName.includes('remaja')) return 'Remaja';
    if (lowerClassName.includes('dewasa')) return 'Dewasa';
    if (lowerClassName.includes('master')) return 'Master';
    return "Lainnya"; // Atau biarkan kosong jika tidak ada age info
  };

  useEffect(() => {
    const fetchMatches = async () => {
      setIsLoading(true);
      setDataLoadError(null);
      try {
        const tandingSchedulesSnap = await getDocs(collection(db, 'schedules_tanding'));
        const tgrSchedulesSnap = await getDocs(collection(db, 'schedules_tgr'));

        const recapItems: RecapMatchItem[] = [];

        for (const scheduleDoc of tandingSchedulesSnap.docs) {
          const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as ScheduleTanding;
          let status: RecapMatchItem['status'] = 'Akan Datang';
          let matchSpecificData;

          try {
            const matchStatusDoc = await getDoc(doc(db, 'matches_tanding', schedule.id));
            if (matchStatusDoc.exists()) {
              matchSpecificData = matchStatusDoc.data();
              const timerStatus = matchSpecificData?.timer_status as TimerStatus | undefined;
              const matchResult = matchSpecificData?.matchResult as MatchResultTanding | undefined;

              if (matchResult) {
                  if (matchResult.winner === 'merah') {
                      status = 'Selesai (Pemenang Merah)';
                  } else if (matchResult.winner === 'biru') {
                      status = 'Selesai (Pemenang Biru)';
                  } else if (matchResult.winner === 'seri') {
                      status = 'Selesai (Seri)';
                  } else {
                      status = 'Selesai';
                  }
              } else if (timerStatus) {
                if (timerStatus.matchStatus === 'MatchFinished') {
                  status = 'Selesai';
                } else if (timerStatus.matchStatus.startsWith('OngoingRound')) {
                  status = 'Berlangsung';
                } else if (timerStatus.matchStatus.startsWith('PausedForVerificationRound')) {
                    status = 'Berlangsung (Verifikasi)';
                } else {
                  status = 'Akan Datang';
                }
              } else {
                status = 'Menunggu Data';
              }
            }
          } catch (e) {
            console.warn(`Could not fetch status for tanding match ${schedule.id}:`, e);
            status = 'Menunggu Data';
          }
          
          let dateDisplay = schedule.date;
          if (schedule.date instanceof Timestamp) {
            dateDisplay = schedule.date.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
          } else if (typeof schedule.date === 'string') {
             try {
                dateDisplay = new Date(schedule.date + "T00:00:00").toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
             } catch (e) { /* keep original string if invalid */ }
          }


          recapItems.push({
            id: schedule.id,
            type: 'Tanding',
            identifier: String(schedule.matchNumber),
            categoryDisplay: schedule.class,
            ageCategoryDerived: parseAgeCategory(schedule.class),
            participantsDisplay: `${schedule.pesilatMerahName} (${schedule.pesilatMerahContingent}) vs ${schedule.pesilatBiruName} (${schedule.pesilatBiruContingent})`,
            status,
            date: dateDisplay,
            gelanggang: schedule.place,
            originalData: schedule,
            matchSpecificData,
          });
        }

        for (const scheduleDoc of tgrSchedulesSnap.docs) {
          const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as ScheduleTGR;
          let status: RecapMatchItem['status'] = 'Akan Datang';
          let matchSpecificData;

          try {
            const matchStatusDoc = await getDoc(doc(db, 'matches_tgr', schedule.id));
            if (matchStatusDoc.exists()) {
                matchSpecificData = matchStatusDoc.data();
                if (matchSpecificData?.matchResult) {
                    const winner = matchSpecificData.matchResult.winner;
                    if (winner === 'merah') {
                        status = 'Selesai (Pemenang Merah)';
                    } else if (winner === 'biru') {
                        status = 'Selesai (Pemenang Biru)';
                    } else if (winner === 'seri') {
                        status = 'Selesai (Seri)';
                    } else {
                        status = 'Selesai';
                    }
                } else {
                    const timerStatus = matchSpecificData?.timerStatus as TGRTimerStatus | undefined;
                    if (timerStatus) {
                        if (timerStatus.matchStatus === 'Finished' && timerStatus.currentPerformingSide === null) {
                            status = 'Selesai';
                        } else if (timerStatus.matchStatus === 'Ongoing') {
                            status = 'Berlangsung';
                        } else if (timerStatus.matchStatus === 'Paused') {
                             status = 'Berlangsung (Jeda)';
                        } else if (timerStatus.matchStatus === 'Finished' && timerStatus.currentPerformingSide){
                            status = `Selesai (${timerStatus.currentPerformingSide})`;
                        } else {
                           status = 'Akan Datang';
                        }
                    } else {
                        status = 'Menunggu Data';
                    }
                }
            }
          } catch (e) {
            console.warn(`Could not fetch status for TGR match ${schedule.id}:`, e);
            status = 'Menunggu Data';
          }
          
          let dateDisplay = schedule.date;
          if (schedule.date instanceof Timestamp) {
            dateDisplay = schedule.date.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
          } else if (typeof schedule.date === 'string') {
             try {
                dateDisplay = new Date(schedule.date + "T00:00:00").toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
             } catch (e) { /* keep original string if invalid */ }
          }

          let participants = schedule.pesilatMerahName;
          if (schedule.pesilatBiruName) participants += ` & ${schedule.pesilatBiruName}`;
          participants += ` (${schedule.pesilatMerahContingent})`;


          recapItems.push({
            id: schedule.id,
            type: 'TGR',
            identifier: String(schedule.lotNumber),
            categoryDisplay: schedule.category,
            ageCategoryDerived: "N/A", // TGR age category not directly available in schedule
            participantsDisplay: participants,
            status,
            date: dateDisplay,
            gelanggang: schedule.place,
            originalData: schedule,
            matchSpecificData,
          });
        }
        
        recapItems.sort((a,b) => {
            const dateA = new Date(a.originalData.date).getTime();
            const dateB = new Date(b.originalData.date).getTime();
            if (dateA !== dateB) return dateA - dateB;
            if (a.type === 'Tanding' && b.type === 'Tanding') {
                 return (a.originalData as ScheduleTanding).matchNumber - (b.originalData as ScheduleTanding).matchNumber;
            }
            if (a.type === 'TGR' && b.type === 'TGR') {
                 return (a.originalData as ScheduleTGR).lotNumber - (b.originalData as ScheduleTGR).lotNumber;
            }
            return a.type.localeCompare(b.type); // Group Tanding before TGR if dates are same
        });

        setAllMatches(recapItems);
      } catch (e) {
        console.error("Failed to fetch matches:", e);
        if (e instanceof Error) setDataLoadError(e.message);
        else setDataLoadError("An unknown error occurred while fetching match data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, []);

  useEffect(() => {
    if (selectedAgeCategory === ALL_CATEGORIES_VALUE) {
      setFilteredMatches(allMatches);
    } else {
      setFilteredMatches(
        allMatches.filter(match => match.ageCategoryDerived === selectedAgeCategory)
      );
    }
  }, [selectedAgeCategory, allMatches]);

  const handleDownloadData = () => {
    // This function might need adjustment if data for download needs to be different from display
    const categoryToDownload = selectedAgeCategory === ALL_CATEGORIES_VALUE ? 'Semua Kategori' : selectedAgeCategory;
    if (dataLoadError) {
      alert(`Tidak dapat mengunduh data: ${dataLoadError}.`);
      return;
    }
    alert(`Fitur download data rekapitulasi untuk kategori: ${categoryToDownload} belum diimplementasikan sepenuhnya.`);
    // Placeholder for actual XLSX generation with `filteredMatches`
    console.log("Data to download:", filteredMatches);
  };

  return (
    <>
      <PageTitle title="Admin Dashboard" description="Manajemen data dan jadwal pertandingan Pencak Silat.">
          <Button onClick={handleDownloadData} className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading || !!dataLoadError}>
            <Download className="mr-2 h-4 w-4" />
            Download Rekap
          </Button>
      </PageTitle>

      {dataLoadError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Gagal Memuat Data Rekap</AlertTitle>
          <AlertDescription>
            {dataLoadError}
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-headline">
            <Filter className="h-5 w-5 text-primary" />
            Filter Data (Kategori Tanding)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Select onValueChange={(value) => setSelectedAgeCategory(value)} value={selectedAgeCategory} disabled={isLoading}>
              <SelectTrigger id="age-category">
                <SelectValue placeholder="Pilih Kategori Usia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>Semua Kategori Usia (Tanding)</SelectItem>
                {ageCategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              Pilih kategori usia untuk memfilter data Tanding yang ditampilkan. Filter ini belum berlaku untuk TGR.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Rekapitulasi Pertandingan</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
              Memuat data rekapitulasi...
            </div>
          ) : (
            <DataRecapTable matches={filteredMatches} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
