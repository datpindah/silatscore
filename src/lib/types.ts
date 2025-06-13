
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
  pesilatMerahName: string;
  pesilatMerahContingent: string;
  pesilatBiruName: string;
  pesilatBiruContingent: string;
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
  timestamp: any;
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
  timestamp: any; // Firestore Timestamp
  votes: JuriVotes;
  result?: JuriVoteValue | 'tie'; // Final result of the verification
  requestingOfficial: 'ketua'; // Initially only Ketua can request
}
// --- END VERIFICATION TYPES ---

// --- TIMER STATUS for DEWAN 1 ---
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
  timestamp: any; // Firestore Timestamp
}

export interface RoundScores {
  round1: ScoreEntry[];
  round2: ScoreEntry[];
  round3: ScoreEntry[];
}

export interface JuriMatchData {
  merah: RoundScores;
  biru: RoundScores;
  lastUpdated?: any; // Firestore Timestamp
}
