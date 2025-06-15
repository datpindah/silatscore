
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
  pesilatBiruName?: string; // Optional: for Ganda second name, or Biru side in two-sided TGR
  pesilatBiruContingent?: string; // Optional: for Ganda second contingent, or Biru side
  babak?: string; // Duplicate of 'round', consider unifying
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
export const TEGURAN_POINTS = -1;
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
  id: string;
  matchId: string;
  type: VerificationType;
  status: VerificationStatus;
  round: 1 | 2 | 3;
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
  votes: JuriVotes;
  result?: JuriVoteValue | 'tie';
  requestingOfficial: 'ketua';
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
  timerSeconds: number; // Remaining time for current side's performance
  isTimerRunning: boolean;
  matchStatus: 'Pending' | 'Ongoing' | 'Paused' | 'Finished'; // Status for the currentPerformingSide or overall match
  performanceDuration: number; // Target duration for the round/category
  currentPerformingSide: 'biru' | 'merah' | null;
  performanceDurationBiru?: number; // Actual recorded performance time for Biru
  performanceDurationMerah?: number; // Actual recorded performance time for Merah
}

export interface SideSpecificTGRScore {
  gerakanSalahCount: number;
  staminaKemantapanBonus: number;
  externalDeductions: number; // Sum of dewan penalties for this side
  calculatedScore: number;
  isReady?: boolean; // Juri has finalized score for this side
}

export interface TGRJuriScore {
  id?: string;
  baseScore: number; // Default 9.90
  biru: SideSpecificTGRScore;
  merah: SideSpecificTGRScore;
  lastUpdated?: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number } | null;
}

export type TGRDewanPenaltyType =
  | 'arena_out'
  | 'weapon_touch_floor'
  | 'time_tolerance_violation'
  | 'costume_violation'
  | 'movement_hold_violation';

export interface TGRDewanPenalty {
  id?: string;
  type: TGRDewanPenaltyType;
  description: string;
  pointsDeducted: number; // Should be negative
  side: 'biru' | 'merah'; // Indicates which side the penalty applies to
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
}

export interface TGRMatchData { // This type might be less used if we manage status directly in TGRTimerStatus
  id: string;
  scheduleDetails: ScheduleTGR;
  timerStatus: TGRTimerStatus; // Centralized timer and status
  finalMedianScoreBiru?: number;
  finalMedianScoreMerah?: number;
  totalDewanPenaltyPointsBiru?: number;
  totalDewanPenaltyPointsMerah?: number;
  overallScoreBiru?: number;
  overallScoreMerah?: number;
  // status field below could be derived from TGRTimerStatus.matchStatus and TGRTimerStatus.currentPerformingSide
  status: 'Pending' | 'OngoingBiru' | 'OngoingMerah' | 'PausedBiru' | 'PausedMerah' | 'FinishedBiru' | 'FinishedMerah' | 'MatchFinished';
}
// --- End TGR Scoring Types ---
