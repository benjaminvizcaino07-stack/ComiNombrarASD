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

export interface GroupedTallyEvaluation extends TallyEvaluation {
  leaderId: string | null;
  leaderName: string | null;
  memberIds: string[];
  memberNames: string[];
  tieStage: 'leader' | 'members_tiebreaker' | null;
  guaranteedOtherNamesForTie: string[];
}

/**
 * Evaluates a grouped department round:
 * - Stage 'leader': Voters cast 1 vote for the primary leader role (e.g. Primer Anciano).
 *   The #1 highest-voted candidate wins the leader role (or triggers a #1 tie-breaker).
 *   Once the leader is chosen, the remaining proposed candidates fill up to
 *   (totalGroupSeats - 1) member spots (e.g. Ancianos de Iglesia). If more candidates
 *   were proposed than totalGroupSeats, ranked vote counts fill the remaining spots
 *   with tie detection at the last member slot.
 * - Stage 'members_tiebreaker': Resolves a cutoff tie among remaining member candidates
 *   while preserving the already-elected leader.
 */
export function evaluateGroupedRoundTallies(params: {
  candidates: CandidateData[];
  ballots: SecretBallot[];
  totalGroupSeats: number;
  groupedStage: 'leader' | 'members_tiebreaker';
  carryoverLeaderName?: string | null;
  carryoverElectedNames?: string[];
}): GroupedTallyEvaluation {
  const {
    candidates,
    ballots,
    totalGroupSeats,
    groupedStage,
    carryoverLeaderName = null,
    carryoverElectedNames = [],
  } = params;

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

  const sorted = [...candidates].sort((a, b) => {
    const diff = (countsById[b.id] ?? 0) - (countsById[a.id] ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, 'es');
  });

  if (candidates.length === 0 || ballots.length === 0) {
    return {
      countsById,
      electedIds: [],
      tiedIds: [],
      hasTie: false,
      remainingSeats: Math.max(
        0,
        totalGroupSeats - (carryoverLeaderName ? 1 : 0) - carryoverElectedNames.length
      ),
      leaderId: null,
      leaderName: carryoverLeaderName,
      memberIds: [],
      memberNames: [...carryoverElectedNames],
      tieStage: null,
      guaranteedOtherNamesForTie: [...carryoverElectedNames],
    };
  }

  if (groupedStage === 'members_tiebreaker') {
    const slotsLeft = Math.max(1, totalGroupSeats - 1 - carryoverElectedNames.length);
    const base = evaluateRoundTallies(candidates, ballots, slotsLeft);
    const newlyElectedMembers = candidates
      .filter((c) => base.electedIds.includes(c.id))
      .map((c) => c.name);
    const memberNames = Array.from(new Set([...carryoverElectedNames, ...newlyElectedMembers]));

    return {
      ...base,
      leaderId: null,
      leaderName: carryoverLeaderName,
      memberIds: base.electedIds,
      memberNames,
      tieStage: base.hasTie ? 'members_tiebreaker' : null,
      guaranteedOtherNamesForTie: memberNames,
    };
  }

  // Stage 'leader': pick #1 leader, then remaining proposed candidates fill up to totalGroupSeats - 1
  const topCount = countsById[sorted[0].id] ?? 0;
  const topCandidates = topCount > 0 ? sorted.filter((c) => (countsById[c.id] ?? 0) === topCount) : [];

  if (topCandidates.length === 0) {
    return {
      countsById,
      electedIds: [],
      tiedIds: [],
      hasTie: false,
      remainingSeats: totalGroupSeats,
      leaderId: null,
      leaderName: null,
      memberIds: [],
      memberNames: [...carryoverElectedNames],
      tieStage: null,
      guaranteedOtherNamesForTie: [...carryoverElectedNames],
    };
  }

  // Tie for #1 Leader
  if (topCandidates.length > 1) {
    const topIds = new Set(topCandidates.map((c) => c.id));
    const nonTop = sorted.filter((c) => !topIds.has(c.id));
    const slotsAvailableAfterAllTiedLeaders = Math.max(
      0,
      totalGroupSeats - topCandidates.length - carryoverElectedNames.length
    );
    let guaranteedOthers = [...carryoverElectedNames];
    if (nonTop.length <= slotsAvailableAfterAllTiedLeaders) {
      guaranteedOthers = Array.from(
        new Set([...guaranteedOthers, ...nonTop.map((c) => c.name)])
      );
    } else if (slotsAvailableAfterAllTiedLeaders > 0) {
      const cutoffCount = countsById[nonTop[slotsAvailableAfterAllTiedLeaders - 1].id] ?? 0;
      const strictlyAbove = nonTop
        .filter((c) => (countsById[c.id] ?? 0) > cutoffCount)
        .map((c) => c.name);
      guaranteedOthers = Array.from(new Set([...guaranteedOthers, ...strictlyAbove]));
    }

    return {
      countsById,
      electedIds: [],
      tiedIds: topCandidates.map((c) => c.id),
      hasTie: true,
      remainingSeats: 1,
      leaderId: null,
      leaderName: null,
      memberIds: [],
      memberNames: guaranteedOthers,
      tieStage: 'leader',
      guaranteedOtherNamesForTie: guaranteedOthers,
    };
  }

  // Clear #1 Leader Winner
  const leader = topCandidates[0];
  const others = sorted.filter((c) => c.id !== leader.id);
  const slotsForOthers = Math.max(0, totalGroupSeats - 1 - carryoverElectedNames.length);

  if (slotsForOthers === 0) {
    return {
      countsById,
      electedIds: [leader.id],
      tiedIds: [],
      hasTie: false,
      remainingSeats: 0,
      leaderId: leader.id,
      leaderName: leader.name,
      memberIds: [],
      memberNames: [...carryoverElectedNames],
      tieStage: null,
      guaranteedOtherNamesForTie: [...carryoverElectedNames],
    };
  }

  // If proposed candidates fit within the remaining seats, ALL other proposed candidates are elected!
  if (others.length <= slotsForOthers) {
    const memberIds = others.map((c) => c.id);
    const memberNames = Array.from(
      new Set([...carryoverElectedNames, ...others.map((c) => c.name)])
    );
    return {
      countsById,
      electedIds: [leader.id, ...memberIds],
      tiedIds: [],
      hasTie: false,
      remainingSeats: Math.max(0, slotsForOthers - others.length),
      leaderId: leader.id,
      leaderName: leader.name,
      memberIds,
      memberNames,
      tieStage: null,
      guaranteedOtherNamesForTie: memberNames,
    };
  }

  // More candidates proposed than totalGroupSeats: select top slotsForOthers by vote count, checking cutoff tie
  const cutoffCount = countsById[others[slotsForOthers - 1].id] ?? 0;
  const nextCount = countsById[others[slotsForOthers].id] ?? 0;

  if (cutoffCount === nextCount) {
    const strictlyAbove = others.filter((c) => (countsById[c.id] ?? 0) > cutoffCount);
    const atCutoff = others.filter((c) => (countsById[c.id] ?? 0) === cutoffCount);
    const memberIds = strictlyAbove.map((c) => c.id);
    const memberNames = Array.from(
      new Set([...carryoverElectedNames, ...strictlyAbove.map((c) => c.name)])
    );
    const remainingSeats = Math.max(1, slotsForOthers - strictlyAbove.length);

    return {
      countsById,
      electedIds: [leader.id, ...memberIds],
      tiedIds: atCutoff.map((c) => c.id),
      hasTie: atCutoff.length > 1,
      remainingSeats,
      leaderId: leader.id,
      leaderName: leader.name,
      memberIds,
      memberNames,
      tieStage: atCutoff.length > 1 ? 'members_tiebreaker' : null,
      guaranteedOtherNamesForTie: memberNames,
    };
  }

  const picked = others.slice(0, slotsForOthers);
  const memberIds = picked.map((c) => c.id);
  const memberNames = Array.from(
    new Set([...carryoverElectedNames, ...picked.map((c) => c.name)])
  );

  return {
    countsById,
    electedIds: [leader.id, ...memberIds],
    tiedIds: [],
    hasTie: false,
    remainingSeats: 0,
    leaderId: leader.id,
    leaderName: leader.name,
    memberIds,
    memberNames,
    tieStage: null,
    guaranteedOtherNamesForTie: memberNames,
  };
}
