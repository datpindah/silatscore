

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

// --- TANDING MATCH RESULT TYPES ---
export type TandingVictoryType =
  | 'Menang Angka'
  | 'Menang Teknik'
  | 'Menang Diskualifikasi'
  | 'Menang Mutlak'
  | 'Menang RSC'
  | 'Menang WO'
  | 'Seri';

export interface TandingScoreBreakdown {
  peringatan1: number; // Points from Peringatan 1
  peringatan2: number; // Points from Peringatan 2
  teguran1: number;    // Points from Teguran 1
  teguran2: number;    // Points from Teguran 2
  jatuhan: number;     // Points from Jatuhan
  pukulanSah: number;  // Points from valid Juri 1-point strikes
  tendanganSah: number; // Points from valid Juri 2-point strikes
  totalAkhir: number;  // Overall final score for this pesilat
}

export interface MatchResultTanding {
  winner: PesilatColorIdentity | 'seri' | null;
  victoryType: TandingVictoryType;
  reason?: string;
  gelanggang: string;
  babak: string;
  kelas: string;
  namaSudutBiru?: string;
  kontingenBiru?: string;
  namaSudutMerah?: string;
  kontingenMerah?: string;
  skorAkhirMerah: number;
  skorAkhirBiru: number;
  detailSkorMerah?: TandingScoreBreakdown;
  detailSkorBiru?: TandingScoreBreakdown;
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
}
// --- END TANDING MATCH RESULT TYPES ---


// --- TGR Scoring Types ---
export interface TGRTimerStatus {
  isTimerRunning: boolean;
  matchStatus: 'Pending' | 'Ongoing' | 'Paused' | 'Finished';
  currentPerformingSide: 'biru' | 'merah' | null;
  // Time when the timer was last started/resumed. Uses a client-side `Date.now()` timestamp.
  startTimeMs: number | null; 
  // Total duration the timer has run before the current start time, in milliseconds.
  accumulatedDurationMs: number; 
  // Final recorded performance times in milliseconds.
  performanceDurationBiru?: number;
  performanceDurationMerah?: number;
}

export interface GandaElementScores {
  teknikSeranganBertahan: number; // Stores the 0.01-0.30 value
  firmnessHarmony: number;
  soulfulness: number;
}
export type GandaElementId = keyof GandaElementScores;


export interface SideSpecificTGRScore {
  // Common
  calculatedScore: number; // The final score for this side by this Juri
  isReady?: boolean;
  externalDeductions: number; // From Dewan penalties (not used directly in Juri page calc)

  // For Tunggal/Regu
  gerakanSalahCount?: number | null; // For 0.01 deductions
  staminaKemantapanBonus?: number | null; // For 0.01-0.10 bonus

  // For Ganda
  gandaElements?: GandaElementScores | null; // Stores the selected 0.01-0.30 for each
}

export const BASE_SCORE_TUNGGAL_REGU = 9.90;
export const BASE_SCORE_GANDA = 9.10;
export const GERAKAN_SALAH_DEDUCTION_TGR = 0.01; // Renamed for clarity

export interface TGRJuriScore {
  baseScore?: number; // Add base score in case it differs per Juri (unlikely for now but good for future)
  biru: SideSpecificTGRScore;
  merah: SideSpecificTGRScore;
  lastUpdated?: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number } | null;
}

export type TGRDewanPenaltyType =
  | 'arena_out'
  | 'weapon_touch_floor' // Deskripsi akan disesuaikan per kategori di UI
  | 'time_tolerance_violation'
  | 'costume_violation' // Deskripsi akan disesuaikan per kategori di UI
  | 'movement_hold_violation'
  | 'weapon_out_of_arena'
  | 'weapon_broken_detached';

export interface TGRDewanPenalty {
  id?: string;
  type: TGRDewanPenaltyType;
  description: string;
  pointsDeducted: number; // Should be negative
  side: 'biru' | 'merah'; // Indicates which side the penalty applies to
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
}

export interface TGRMatchResultDetail {
  standarDeviasi: number;
  waktuPenampilan: number; // in seconds
  pelanggaran: number; // total dewan penalty points
  poinKemenangan: number; // final score for this side
}

export interface TGRMatchResult {
  winner: 'biru' | 'merah' | 'seri';
  gelanggang: string;
  babak: string;
  kategori: TGRCategoryType | string;
  namaSudutBiru?: string;
  kontingenBiru?: string;
  namaSudutMerah?: string;
  kontingenMerah?: string;
  detailPoint: {
    biru?: TGRMatchResultDetail;
    merah?: TGRMatchResultDetail;
  };
  timestamp: FirebaseTimestamp | Date | { seconds: number; nanoseconds: number };
}

export interface TGRMatchData {
  id: string;
  scheduleDetails: ScheduleTGR;
  timerStatus: TGRTimerStatus;
  finalMedianScoreBiru?: number;
  finalMedianScoreMerah?: number;
  totalDewanPenaltyPointsBiru?: number;
  totalDewanPenaltyPointsMerah?: number;
  overallScoreBiru?: number;
  overallScoreMerah?: number;
  status: 'Pending' | 'OngoingBiru' | 'OngoingMerah' | 'PausedBiru' | 'PausedMerah' | 'FinishedBiru' | 'FinishedMerah' | 'MatchFinished';
  matchResult?: TGRMatchResult;
}
// --- End TGR Scoring Types ---


// --- SCHEME MANAGEMENT TYPES ---
export interface SchemeParticipant {
  id: string;
  name: string;
  contingent: string;
  seed?: number;
}

export interface SchemeMatch {
  matchInternalId: string;
  globalMatchNumber: number;
  roundName: string;
  participant1: { name: string; contingent: string } | null;
  participant2: { name: string; contingent: string } | null;
  winnerToMatchId: string | null;
  scheduleId?: string;
  status: 'PENDING' | 'SCHEDULED' | 'COMPLETED';
  winnerId?: string | null;
}

export interface SchemeRound {
  roundNumber: number;
  name: string;
  matches: SchemeMatch[];
}

export interface Scheme {
  id: string; // e.g., 'tanding-dewasa-kelas-a-putra'
  type: 'Tanding' | 'TGR';
  ageCategory: string;
  gelanggang: string;
  tandingClass?: string;
  tgrCategory?: TGRCategoryType;
  participantCount: number;
  participants: SchemeParticipant[];
  rounds: SchemeRound[];
  createdAt: FirebaseTimestamp;
}
// --- END SCHEME MANAGEMENT TYPES ---
