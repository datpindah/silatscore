
export type PesilatColor = 'Merah' | 'Biru'; // Tetap, tapi mungkin lebih baik 'merah' | 'biru' (lowercase) untuk konsistensi di kode

export interface Pesilat {
  id: string;
  name: string;
  contingent: string;
  color: PesilatColor; // Atau 'merah' | 'biru'
}

// Foul and Warning types below are more for data structure within a match summary
// We will define more specific types for Official Actions input by Ketua
export interface Foul {
  id: string;
  type: 'Teguran' | 'Peringatan I' | 'Peringatan II' | 'Diskualifikasi';
  description: string;
  pointsDeducted: number;
  timestamp: Date;
}

export interface Warning {
  id: string;
  type: 'Binaan' | 'Peringatan';
  timestamp: Date;
}

export interface ScoreDetail {
  type: 'Pukulan' | 'Tendangan' | 'Jatuhan' | 'Kuncian' | 'Teknik Lain';
  points: number;
  timestamp: Date;
}

export interface PesilatMatchData {
  pesilatInfo: Pesilat;
  score: number;
  scores: ScoreDetail[];
  fouls: Foul[];
  warnings: Warning[];
}

export interface Match { // This is a good overall structure for a completed match
  id: string;
  matchNumber: number;
  round: number;
  class: string;
  pesilatMerah: PesilatMatchData;
  pesilatBiru: PesilatMatchData;
  timer: {
    startTime: Date | null;
    elapsedSeconds: number;
    isRunning: boolean;
    currentRound: number;
    totalRounds: number;
  };
  status: 'Pending' | 'Ongoing' | 'Finished' | 'Paused';
  venue: string;
  date: Date;
}

export interface ScheduleTanding {
  id: string;
  date: string; // YYYY-MM-DD
  place: string;
  pesilatMerahName: string;
  pesilatMerahContingent: string;
  pesilatBiruName: string;
  pesilatBiruContingent: string;
  round: string; // Babak
  class: string; // Kelas
  matchNumber: number;
}

export interface ScheduleTGR {
  id: string;
  group: string; // Pool
  lotNumber: number;
  category: 'Tunggal' | 'Ganda' | 'Regu';
  participantNames: string[];
  contingent: string;
}

export type AgeCategory = 'Pra-Usia Dini' | 'Usia Dini' | 'Pra-Remaja' | 'Remaja' | 'Dewasa' | 'Master';
export const ageCategories: AgeCategory[] = ['Pra-Usia Dini', 'Usia Dini', 'Pra-Remaja', 'Remaja', 'Dewasa', 'Master'];


// --- NEW TYPES FOR KETUA PERTANDINGAN ACTIONS ---
export type OfficialFoulType = 'Teguran' | 'Peringatan I' | 'Peringatan II' | 'Diskualifikasi';
export type OfficialWarningType = 'Binaan' | 'Peringatan Ketua'; // 'Peringatan Ketua' to distinguish from automated system warnings if any

export const FOUL_TYPES: OfficialFoulType[] = ['Teguran', 'Peringatan I', 'Peringatan II', 'Diskualifikasi'];
export const WARNING_TYPES: OfficialWarningType[] = ['Binaan', 'Peringatan Ketua'];

export const FOUL_POINT_DEDUCTIONS: Record<OfficialFoulType, number> = {
  'Teguran': -1,
  'Peringatan I': -5,
  'Peringatan II': -10,
  'Diskualifikasi': 0, // Points are not deducted, match ends. Special handling.
};

export const WARNING_POINT_DEDUCTIONS: Record<OfficialWarningType, number> = {
  'Binaan': 0,
  'Peringatan Ketua': 0,
};

export interface OfficialActionRecord {
  id: string; // Firestore document ID
  actionCategory: 'pelanggaran' | 'binaan_peringatan';
  pesilatColor: 'merah' | 'biru'; // Lowercase for consistency
  type: OfficialFoulType | OfficialWarningType;
  pointDeduction: number;
  round: 1 | 2 | 3;
  timestamp: any; // Firestore Timestamp will be used here
  notes?: string;
}
// --- END NEW TYPES ---


// Icons for fouls - could be actual SVGs or Lucide names
// Using the OfficialFoulType now
export const foulIcons: Record<OfficialFoulType | OfficialWarningType, string> = {
  'Teguran': 'MinusCircle',
  'Peringatan I': 'AlertTriangle',
  'Peringatan II': 'ShieldAlert',
  'Diskualifikasi': 'Ban',
  'Binaan': 'Info',
  'Peringatan Ketua': 'Megaphone',
};
