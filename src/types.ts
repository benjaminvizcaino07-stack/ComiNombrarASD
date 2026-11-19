export type AppSection = 'admin' | 'vote' | 'results';

export type PastorVoteOverride = 'auto' | 'enabled' | 'disabled';

export type DepartmentStatus = 'pending' | 'voting' | 'paused' | 'tie' | 'completed';

export type DepartmentVotingMode = 'standard' | 'grouped';

export type GroupedRoundStage = 'leader' | 'members_tiebreaker';

export type RoundStatus = 'open' | 'paused' | 'closed';

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface SessionData {
  id: string;
  ownerId: string;
  ownerEmail: string;
  churchName: string;
  year: string;
  pastorName?: string;
  secretaryName?: string;
  meetingDate?: string;
  meetingTime?: string;
  projectorKey: string;
  activeRoundId: string | null;
  showResultsOnProjector: boolean;
  pastorVoteEnabledOverride: PastorVoteOverride;
  enabledCommitteeCount: number;
  allowMemberProposals?: boolean;
  allowMemberObservations?: boolean;
  sessionStatus?: SessionStatus;
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
  maxProposals?: number | null;
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
  maxProposals?: number | null;
  isTieBreaker: boolean;
  isTestRound?: boolean;
  roundNumber: number;
  status: RoundStatus;
  proposalsOpen?: boolean;
  votingStarted?: boolean;
  memberProposalsEnabled?: boolean;
  memberObservationsEnabled?: boolean;
  observation?: string | null;
  observationsRevealed?: boolean;
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

export interface RoundObservation {
  id: string;
  sessionId: string;
  roundId: string;
  authorToken: string;
  authorRole: 'member' | 'pastor';
  candidateName?: string | null;
  text: string;
  revealed: boolean;
  createdAt?: unknown;
}

export interface ProjectorObservation {
  id: string;
  authorRole: 'member' | 'pastor';
  candidateName?: string | null;
  text: string;
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
  maxProposals?: number | null;
  isTieBreaker?: boolean;
  isTestRound?: boolean;
  sessionStatus?: SessionStatus;
  roundStatus: 'idle' | 'open' | 'paused' | 'closed' | 'tie';
  proposalsOpen?: boolean;
  votingStarted?: boolean;
  memberProposalsEnabled?: boolean;
  memberObservationsEnabled?: boolean;
  observation?: string | null;
  observationsRevealed?: boolean;
  revealedObservations?: ProjectorObservation[];
  showResults: boolean;
  votesCastCount: number;
  expectedVotersCount: number;
  candidates: ProjectorCandidate[];
  updatedAt?: unknown;
}
