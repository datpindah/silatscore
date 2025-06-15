
import type { Timestamp as FirebaseTimestamp } from 'firebase/firestore';

export type PesilatColor = 'Merah' | 'Biru';

export interface Pesilat {
  id: string;
  name: string;
  contingent: string;
  color: PesilatColor;
}

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

export interface Match {
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
  id:string;
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

export type TGRCategoryType = 'Tunggal' | 'Ganda' | 'Regu' | 'Jurus Tunggal Bebas';
export const tgrCategoriesList: TGRCategoryType[] = ['Tunggal', 'Ganda', 'Regu', 'Jurus Tunggal Bebas'];


export interface ScheduleTGR {
  id: string;
  lotNumber: number; // Nomor Partai/Undian
  category: TGRCategoryType;
  date: string; // YYYY-MM-DD
  place: string;
  round: string; // Babak (e.g., Penyisihan, Final)
  pesilatMerahName: string; // For Tunggal, or primary name for Ganda/Regu
  pesilatMerahContingent: string;
  pesilatBiruName: string; // Optional: for Ganda second name, or if TGR is structured as Biru vs Merah
  pesilatBiruContingent: string; // Optional: for Ganda second contingent
}


export type AgeCategory = 'Pra-Usia Dini' | 'Usia Dini' | 'Pra-Remaja' | 'Remaja' | 'Dewasa' | 'Master';
export const ageCategories: AgeCategory[] = ['Pra-Usia Dini', 'Usia Dini', 'Pra-Remaja', 'Remaja', 'Dewasa', 'Master'];

export type PesilatColorIdentity = 'merah' | 'biru';
export type KetuaActionType = 'Jatuhan' | 'Binaan' | 'Teguran' | 'Peringatan';

export interface KetuaActionLogEntry {
  id: string;
  pesilatColor: PesilatColorIdentity;
  actionType: KetuaActionType;
  originalActionType?: KetuaActionType;
  round: 1 | 2 | 3;
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
  points: number;
}

export const JATUHAN_POINTS = 3;
export const TEGURAN_POINTS = -1; // Teguran selalu -1
// Binaan pertama 0 poin, binaan kedua (dan seterusnya dalam babak yg sama) jadi teguran -1
export const PERINGATAN_POINTS_FIRST_PRESS = -5;
export const PERINGATAN_POINTS_SECOND_PRESS = -10;


// --- VERIFICATION TYPES ---
export type VerificationType = 'jatuhan' | 'pelanggaran';
export type VerificationStatus = 'pending' | 'completed' | 'cancelled';
export type JuriVoteValue = 'merah' | 'biru' | 'invalid' | null;

export interface JuriVotes {
  'juri-1': JuriVoteValue;
  'juri-2': JuriVoteValue;
  'juri-3': JuriVoteValue;
}

export interface VerificationRequest {
  id: string; // Firestore document ID
  matchId: string;
  type: VerificationType;
  status: VerificationStatus;
  round: 1 | 2 | 3;
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number }; // Firestore Timestamp
  votes: JuriVotes;
  result?: JuriVoteValue | 'tie'; // Final result of the verification
  requestingOfficial: 'ketua'; // Initially only Ketua can request
}
// --- END VERIFICATION TYPES ---

// --- TIMER STATUS for DEWAN 1 TANDING ---
export type TimerMatchStatus =
  | 'Pending'
  | `OngoingRound${number}`
  | `PausedRound${number}`
  | `FinishedRound${number}`
  | `PausedForVerificationRound${number}`
  | 'MatchFinished';

export interface TimerStatus {
  currentRound: 1 | 2 | 3;
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: TimerMatchStatus;
  roundDuration: number;
}
// --- END TIMER STATUS ---


export const foulIcons: Record<string, string> = {
  'Teguran': 'MinusCircle',
  'Peringatan I': 'AlertTriangle',
  'Peringatan II': 'ShieldAlert',
  'Diskualifikasi': 'Ban',
  'Binaan': 'Info',
  'Peringatan Ketua': 'Megaphone',
};

// Juri Tanding Types
export interface ScoreEntry {
  points: 1 | 2;
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number }; 
}

export interface RoundScores {
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

export interface JuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  lastUpdated?: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number } | null;
}

// --- TGR Scoring Types ---
export interface TGRTimerStatus {
  timerSeconds: number;
  isTimerRunning: boolean;
  matchStatus: 'Pending' | 'Ongoing' | 'Paused' | 'Finished'; // Status for the current side, or overall
  performanceDuration: number; 
  currentPerformingSide?: 'biru' | 'merah' | null; // null if overall match finished or not applicable for the current phase
}

export interface TGRJuriScore {
  id?: string; // juriId, e.g., 'juri-1'
  baseScore: number; // Default 9.90
  gerakanSalahCount: number;
  staminaKemantapanBonus: number; // 0.00 to 0.10
  externalDeductions: number; // Sum of absolute values of Dewan penalties
  calculatedScore: number; // baseScore - (gerakanSalahCount * 0.01) + staminaKemantapanBonus - externalDeductions
  isReady?: boolean; // Juri status kesiapan
  lastUpdated?: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number } | null;
}

export type TGRDewanPenaltyType =
  | 'arena_out' // Penampilan Keluar Gelanggang 10mx10m
  | 'weapon_touch_floor' // Menjatuhkan Senjata Menyentuh Lantai
  | 'time_tolerance_violation' // Penampilan melebihi atau kurang dari toleransi waktu 5 Detik S/d 10 Detik
  | 'costume_violation' // Pakaian tidak sesuai aturan
  | 'movement_hold_violation'; // Menahan gerakan lebih dari 5 (lima) detik.

export interface TGRDewanPenalty {
  id?: string; // Firestore document ID
  type: TGRDewanPenaltyType;
  description: string; // Can be denormalized from PenaltyConfig
  pointsDeducted: number; // e.g., -0.50
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
}

export interface TGRMatchData {
  id: string; // Corresponds to ScheduleTGR id
  scheduleDetails: ScheduleTGR; // Denormalized or linked
  timerStatus: TGRTimerStatus;
  // Juri scores will be in a subcollection: juri_scores_tgr/{juriId} -> TGRJuriScore
  // Dewan penalties will be in a subcollection: dewan_penalties_tgr/{penaltyId} -> TGRDewanPenalty
  finalMedianScore?: number; // Calculated by Ketua
  totalDewanPenaltyPoints?: number; // Calculated by Ketua
  overallScore?: number; // finalMedianScore + totalDewanPenaltyPoints
  status: 'Pending' | 'Ongoing' | 'Paused' | 'Finished';
}
// --- End TGR Scoring Types ---

