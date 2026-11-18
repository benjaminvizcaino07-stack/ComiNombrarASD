export type AppSection = 'admin' | 'vote' | 'results';

export type PastorVoteOverride = 'auto' | 'enabled' | 'disabled';

export type DepartmentStatus = 'pending' | 'voting' | 'paused' | 'tie' | 'completed';

export type DepartmentVotingMode = 'standard' | 'grouped';

export type GroupedRoundStage = 'leader' | 'members_tiebreaker';

export type RoundStatus = 'open' | 'paused' | 'closed';

export interface SessionData {
  id: string;
  ownerId: string;
  ownerEmail: string;
  churchName: string;
  year: string;
  projectorKey: string;
  activeRoundId: string | null;
  showResultsOnProjector: boolean;
  pastorVoteEnabledOverride: PastorVoteOverride;
  enabledCommitteeCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EligibleMember {
  id: string;
  sessionId: string;
  name: string;
  notes?: string;
  active: boolean;
  createdAt?: unknown;
}

export interface DepartmentPosition {
  id: string;
  sessionId: string;
  department: string;
  roleTitle: string;
  votingMode?: DepartmentVotingMode;
  leaderRoleTitle?: string;
  membersRoleTitle?: string;
  seats: number;
  order: number;
  status: DepartmentStatus;
  activeRoundId?: string | null;
  leaderElectedName?: string | null;
  memberElectedNames?: string[];
  electedNames: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CommitteeMember {
  id: string; // document ID is the secret token
  sessionId: string;
  name: string;
  roleLabel?: string;
  enabled: boolean;
  createdAt?: unknown;
}

export interface RoundData {
  id: string;
  sessionId: string;
  departmentId: string;
  departmentName: string;
  roleTitle: string;
  votingMode?: DepartmentVotingMode;
  groupedStage?: GroupedRoundStage;
  leaderRoleTitle?: string;
  membersRoleTitle?: string;
  totalGroupSeats?: number;
  carryoverLeaderName?: string | null;
  seats: number;
  isTieBreaker: boolean;
  roundNumber: number;
  status: RoundStatus;
  proposalsOpen?: boolean;
  votingStarted?: boolean;
  observation?: string | null;
  pastorVoteAllowed: boolean;
  expectedVotersCount: number;
  votesCastCount: number;
  carryoverElectedNames: string[];
  tiedCandidateIds: string[];
  electedCandidateIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CandidateData {
  id: string;
  sessionId: string;
  roundId: string;
  name: string;
  proposedByToken: string;
  voteCount: number;
  elected: boolean;
  tied: boolean;
  createdAt?: unknown;
}

export interface SecretBallot {
  id: string;
  sessionId: string;
  roundId: string;
  candidateIds: string[];
  castAt?: unknown;
}

export interface ProjectorCandidate {
  id: string;
  name: string;
  voteCount: number | null;
  elected: boolean;
  tied: boolean;
  electedRoleLabel?: string | null;
}

export interface ProjectorState {
  sessionId: string;
  churchName: string;
  year: string;
  roundId?: string | null;
  departmentName?: string;
  roleTitle?: string;
  votingMode?: DepartmentVotingMode;
  groupedStage?: GroupedRoundStage;
  leaderRoleTitle?: string;
  membersRoleTitle?: string;
  totalGroupSeats?: number;
  seats?: number;
  isTieBreaker?: boolean;
  roundStatus: 'idle' | 'open' | 'paused' | 'closed' | 'tie';
  proposalsOpen?: boolean;
  votingStarted?: boolean;
  observation?: string | null;
  showResults: boolean;
  votesCastCount: number;
  expectedVotersCount: number;
  candidates: ProjectorCandidate[];
  updatedAt?: unknown;
}
