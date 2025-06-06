
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


// --- TYPES FOR KETUA PERTANDINGAN ACTIONS (NEW UI) ---
export type PesilatColorIdentity = 'merah' | 'biru';
export type KetuaActionType = 'Jatuhan' | 'Binaan' | 'Teguran' | 'Peringatan';

export interface KetuaActionLogEntry {
  id: string; // Firestore document ID
  pesilatColor: PesilatColorIdentity;
  actionType: KetuaActionType;
  round: 1 | 2 | 3;
  timestamp: any; // Firestore Timestamp
  points: number; // Actual points for THIS action instance (-1, -2, -5, -10, 0, or 3)
}

export const JATUHAN_POINTS = 3;
export const BINAAN_POINTS_SECOND_PRESS = -1; // First press is 0
export const TEGURAN_POINTS_FIRST_PRESS = -1;
export const TEGURAN_POINTS_SECOND_PRESS = -2;
export const PERINGATAN_POINTS_FIRST_PRESS = -5;
export const PERINGATAN_POINTS_SECOND_PRESS = -10;

// The old OfficialActionRecord, OfficialFoulType, etc., are being replaced by the above for Ketua Pertandingan page.
// If other parts of the app use them, they might need to be kept or refactored.
// For now, assuming Ketua Pertandingan new logic is self-contained with KetuaActionLogEntry.

// --- END NEW TYPES ---

// Icons for fouls - could be actual SVGs or Lucide names
// This might need to be updated if the old system is still used elsewhere
export const foulIcons: Record<string, string> = {
  'Teguran': 'MinusCircle',
  'Peringatan I': 'AlertTriangle',
  'Peringatan II': 'ShieldAlert',
  'Diskualifikasi': 'Ban',
  'Binaan': 'Info',
  'Peringatan Ketua': 'Megaphone',
  // New types for Ketua specific display if needed, but table aggregates points.
};
