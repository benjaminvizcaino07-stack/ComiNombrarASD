import { CandidateData, PastorVoteOverride, SecretBallot } from '../types';

export function computePastorVoteAllowed(
  enabledCommitteeCount: number,
  override: PastorVoteOverride
): boolean {
  if (override === 'enabled') return true;
  if (override === 'disabled') return false;
  return enabledCommitteeCount > 0 && enabledCommitteeCount % 2 === 0;
}

export function isCommitteeCountEven(enabledCommitteeCount: number): boolean {
  return enabledCommitteeCount > 0 && enabledCommitteeCount % 2 === 0;
}

export interface TallyEvaluation {
  countsById: Record<string, number>;
  electedIds: string[];
  tiedIds: string[];
  hasTie: boolean;
  remainingSeats: number;
}

/**
 * Evaluates ballot results for `seats` open positions.
 * If multiple candidates tie at the cutoff boundary for the last seat(s),
 * candidates strictly above the cutoff are elected and those at the cutoff
 * are flagged as tied so the pastor can launch a tie-breaker round.
 */
export function evaluateRoundTallies(
  candidates: CandidateData[],
  ballots: SecretBallot[],
  seats: number
): TallyEvaluation {
  const countsById: Record<string, number> = {};
  for (const c of candidates) {
    countsById[c.id] = 0;
  }

  for (const ballot of ballots) {
    const uniqueSelections = Array.from(new Set(ballot.candidateIds));
    for (const cid of uniqueSelections) {
      if (cid in countsById) {
        countsById[cid] += 1;
      }
    }
  }

  if (candidates.length === 0 || ballots.length === 0) {
    return {
      countsById,
      electedIds: [],
      tiedIds: [],
      hasTie: false,
      remainingSeats: seats,
    };
  }

  const sorted = [...candidates].sort((a, b) => {
    const diff = (countsById[b.id] ?? 0) - (countsById[a.id] ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'es');
  });

  // If fewer or equal candidates than seats and all have > 0 votes (or only 1 round), elect those with > 0 votes
  if (sorted.length <= seats) {
    const withVotes = sorted.filter((c) => (countsById[c.id] ?? 0) > 0);
    return {
      countsById,
      electedIds: withVotes.map((c) => c.id),
      tiedIds: [],
      hasTie: false,
      remainingSeats: Math.max(0, seats - withVotes.length),
    };
  }

  const cutoffCount = countsById[sorted[seats - 1].id] ?? 0;
  const nextCount = countsById[sorted[seats].id] ?? 0;

  if (cutoffCount === nextCount) {
    // Tie at the cutoff boundary
    const strictlyAbove = sorted.filter((c) => (countsById[c.id] ?? 0) > cutoffCount);
    const atCutoff = sorted.filter((c) => (countsById[c.id] ?? 0) === cutoffCount);
    const remainingSeats = Math.max(1, seats - strictlyAbove.length);

    return {
      countsById,
      electedIds: strictlyAbove.map((c) => c.id),
      tiedIds: atCutoff.map((c) => c.id),
      hasTie: atCutoff.length > 1,
      remainingSeats,
    };
  }

  // Clean separation at the cutoff
  const elected = sorted
    .slice(0, seats)
    .filter((c) => (countsById[c.id] ?? 0) > 0)
    .map((c) => c.id);

  return {
    countsById,
    electedIds: elected,
    tiedIds: [],
    hasTie: false,
    remainingSeats: Math.max(0, seats - elected.length),
  };
}
