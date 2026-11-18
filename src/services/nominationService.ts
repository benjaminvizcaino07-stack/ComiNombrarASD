import {
  collection,
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { SdaManualRoleTemplate } from '../data/sdaManualPositions';
import {
  CandidateData,
  CommitteeMember,
  DepartmentPosition,
  PastorVoteOverride,
  ProjectorCandidate,
  RoundData,
  SecretBallot,
  SessionData,
} from '../types';
import { generateSecureId } from '../utils/id';
import { computePastorVoteAllowed, evaluateRoundTallies } from '../utils/tally';

function clampString(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export async function createSession(
  ownerId: string,
  ownerEmail: string,
  churchName: string,
  year: string
): Promise<string> {
  const sessionId = `s_${generateSecureId(20)}`;
  const projectorKey = `p_${generateSecureId(20)}`;
  const path = `sessions/${sessionId}`;

  try {
    await setDoc(doc(db, 'sessions', sessionId), {
      ownerId,
      ownerEmail: clampString(ownerEmail, 200),
      churchName: clampString(churchName, 140),
      year: clampString(year, 20),
      projectorKey,
      activeRoundId: null,
      showResultsOnProjector: false,
      pastorVoteEnabledOverride: 'auto',
      enabledCommitteeCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'sessions', sessionId, 'projector', projectorKey), {
      sessionId,
      churchName: clampString(churchName, 140),
      year: clampString(year, 20),
      roundId: null,
      departmentName: '',
      roleTitle: '',
      seats: 1,
      isTieBreaker: false,
      roundStatus: 'idle',
      showResults: false,
      votesCastCount: 0,
      expectedVotersCount: 0,
      candidates: [],
      updatedAt: serverTimestamp(),
    });

    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateSessionSettings(
  sessionId: string,
  updates: Partial<{
    churchName: string;
    year: string;
    showResultsOnProjector: boolean;
    pastorVoteEnabledOverride: PastorVoteOverride;
    activeRoundId: string | null;
    enabledCommitteeCount: number;
  }>
): Promise<void> {
  const path = `sessions/${sessionId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.churchName !== undefined) clean.churchName = clampString(updates.churchName, 140);
    if (updates.year !== undefined) clean.year = clampString(updates.year, 20);
    if (updates.showResultsOnProjector !== undefined)
      clean.showResultsOnProjector = updates.showResultsOnProjector;
    if (updates.pastorVoteEnabledOverride !== undefined)
      clean.pastorVoteEnabledOverride = updates.pastorVoteEnabledOverride;
    if (updates.activeRoundId !== undefined) clean.activeRoundId = updates.activeRoundId;
    if (updates.enabledCommitteeCount !== undefined)
      clean.enabledCommitteeCount = updates.enabledCommitteeCount;

    await updateDoc(doc(db, 'sessions', sessionId), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function addEligibleMember(
  sessionId: string,
  name: string,
  notes?: string
): Promise<void> {
  const memberId = `m_${generateSecureId(16)}`;
  const path = `sessions/${sessionId}/eligibleMembers/${memberId}`;
  try {
    const payload: Record<string, unknown> = {
      sessionId,
      name: clampString(name, 140),
      active: true,
      createdAt: serverTimestamp(),
    };
    if (notes && notes.trim()) {
      payload.notes = clampString(notes, 240);
    }
    await setDoc(doc(db, 'sessions', sessionId, 'eligibleMembers', memberId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function batchAddEligibleMembers(
  sessionId: string,
  rows: { name: string; notes?: string }[]
): Promise<number> {
  const path = `sessions/${sessionId}/eligibleMembers`;
  try {
    let added = 0;
    const chunkSize = 400;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const row of chunk) {
        const cleanName = clampString(row.name, 140);
        if (!cleanName) continue;
        const memberId = `m_${generateSecureId(16)}`;
        const payload: Record<string, unknown> = {
          sessionId,
          name: cleanName,
          active: true,
          createdAt: serverTimestamp(),
        };
        if (row.notes && row.notes.trim()) {
          payload.notes = clampString(row.notes, 240);
        }
        batch.set(doc(db, 'sessions', sessionId, 'eligibleMembers', memberId), payload);
        added += 1;
      }
      await batch.commit();
    }
    return added;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function toggleEligibleMember(
  sessionId: string,
  memberId: string,
  active: boolean
): Promise<void> {
  const path = `sessions/${sessionId}/eligibleMembers/${memberId}`;
  try {
    await updateDoc(doc(db, 'sessions', sessionId, 'eligibleMembers', memberId), { active });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteEligibleMember(sessionId: string, memberId: string): Promise<void> {
  const path = `sessions/${sessionId}/eligibleMembers/${memberId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId, 'eligibleMembers', memberId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addDepartmentPosition(
  sessionId: string,
  department: string,
  roleTitle: string,
  seats: number,
  order: number
): Promise<void> {
  const deptId = `d_${generateSecureId(16)}`;
  const path = `sessions/${sessionId}/departments/${deptId}`;
  try {
    await setDoc(doc(db, 'sessions', sessionId, 'departments', deptId), {
      sessionId,
      department: clampString(department, 120),
      roleTitle: clampString(roleTitle, 140),
      seats: Math.max(1, Math.min(50, Math.floor(seats))),
      order: Math.max(0, Math.min(2000, Math.floor(order))),
      status: 'pending',
      activeRoundId: null,
      electedNames: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function batchAddManualTemplates(
  sessionId: string,
  templates: SdaManualRoleTemplate[],
  startOrder: number
): Promise<void> {
  const path = `sessions/${sessionId}/departments`;
  try {
    const batch = writeBatch(db);
    templates.forEach((tpl, idx) => {
      const deptId = `d_${generateSecureId(16)}`;
      batch.set(doc(db, 'sessions', sessionId, 'departments', deptId), {
        sessionId,
        department: clampString(tpl.department, 120),
        roleTitle: clampString(tpl.roleTitle, 140),
        seats: Math.max(1, Math.min(50, tpl.defaultSeats)),
        order: startOrder + idx,
        status: 'pending',
        activeRoundId: null,
        electedNames: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateDepartmentPosition(
  sessionId: string,
  deptId: string,
  updates: Partial<{
    department: string;
    roleTitle: string;
    seats: number;
    status: DepartmentPosition['status'];
    electedNames: string[];
  }>
): Promise<void> {
  const path = `sessions/${sessionId}/departments/${deptId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.department !== undefined) clean.department = clampString(updates.department, 120);
    if (updates.roleTitle !== undefined) clean.roleTitle = clampString(updates.roleTitle, 140);
    if (updates.seats !== undefined)
      clean.seats = Math.max(1, Math.min(50, Math.floor(updates.seats)));
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.electedNames !== undefined) clean.electedNames = updates.electedNames.slice(0, 50);

    await updateDoc(doc(db, 'sessions', sessionId, 'departments', deptId), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteDepartmentPosition(sessionId: string, deptId: string): Promise<void> {
  const path = `sessions/${sessionId}/departments/${deptId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId, 'departments', deptId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addCommitteeMember(
  session: SessionData,
  name: string,
  roleLabel: string,
  currentCommittee: CommitteeMember[]
): Promise<string> {
  const token = `c_${generateSecureId(22)}`;
  const path = `sessions/${session.id}/committee/${token}`;
  const newEnabledCount = currentCommittee.filter((m) => m.enabled).length + 1;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'sessions', session.id, 'committee', token), {
      sessionId: session.id,
      name: clampString(name, 120),
      roleLabel: clampString(roleLabel || 'Miembro de Comisión', 80),
      enabled: true,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return token;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function toggleCommitteeMember(
  session: SessionData,
  token: string,
  enabled: boolean,
  currentCommittee: CommitteeMember[],
  activeRound: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}/committee/${token}`;
  const updatedList = currentCommittee.map((m) => (m.id === token ? { ...m, enabled } : m));
  const newEnabledCount = updatedList.filter((m) => m.enabled).length;
  const pastorAllowed = computePastorVoteAllowed(
    newEnabledCount,
    session.pastorVoteEnabledOverride
  );
  const expectedVotersCount = newEnabledCount + (pastorAllowed ? 1 : 0);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id, 'committee', token), { enabled });
    batch.update(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });
    if (activeRound && activeRound.status !== 'closed') {
      batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteCommitteeMember(
  session: SessionData,
  token: string,
  currentCommittee: CommitteeMember[],
  activeRound: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}/committee/${token}`;
  const updatedList = currentCommittee.filter((m) => m.id !== token);
  const newEnabledCount = updatedList.filter((m) => m.enabled).length;
  const pastorAllowed = computePastorVoteAllowed(
    newEnabledCount,
    session.pastorVoteEnabledOverride
  );
  const expectedVotersCount = newEnabledCount + (pastorAllowed ? 1 : 0);

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'sessions', session.id, 'committee', token));
    batch.update(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });
    if (activeRound && activeRound.status !== 'closed') {
      batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updatePastorOverrideAndSyncRound(
  session: SessionData,
  override: PastorVoteOverride,
  activeRound: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}`;
  const pastorAllowed = computePastorVoteAllowed(session.enabledCommitteeCount, override);
  const expectedVotersCount = session.enabledCommitteeCount + (pastorAllowed ? 1 : 0);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id), {
      pastorVoteEnabledOverride: override,
      updatedAt: serverTimestamp(),
    });
    if (activeRound && activeRound.status !== 'closed' && activeRound.votesCastCount === 0) {
      batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function startRoundForDepartment(params: {
  session: SessionData;
  dept: DepartmentPosition;
  roundNumber: number;
  seatsForRound: number;
  carryoverElectedNames: string[];
  isTieBreaker: boolean;
  seedCandidates?: { name: string }[];
}): Promise<string> {
  const {
    session,
    dept,
    roundNumber,
    seatsForRound,
    carryoverElectedNames,
    isTieBreaker,
    seedCandidates = [],
  } = params;

  const roundId = `r_${generateSecureId(18)}`;
  const path = `sessions/${session.id}/rounds/${roundId}`;
  const pastorVoteAllowed = computePastorVoteAllowed(
    session.enabledCommitteeCount,
    session.pastorVoteEnabledOverride
  );
  const expectedVotersCount = session.enabledCommitteeCount + (pastorVoteAllowed ? 1 : 0);

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'sessions', session.id, 'rounds', roundId), {
      sessionId: session.id,
      departmentId: dept.id,
      departmentName: clampString(dept.department, 120),
      roleTitle: clampString(dept.roleTitle, 140),
      seats: Math.max(1, Math.min(50, seatsForRound)),
      isTieBreaker,
      roundNumber,
      status: 'open',
      pastorVoteAllowed,
      expectedVotersCount,
      votesCastCount: 0,
      carryoverElectedNames: carryoverElectedNames.slice(0, 50),
      tiedCandidateIds: [],
      electedCandidateIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const projectorCandidates: ProjectorCandidate[] = [];
    for (const seed of seedCandidates) {
      const candidateId = `cand_${generateSecureId(16)}`;
      const cleanName = clampString(seed.name, 140);
      batch.set(doc(db, 'sessions', session.id, 'rounds', roundId, 'candidates', candidateId), {
        sessionId: session.id,
        roundId,
        name: cleanName,
        proposedByToken: `pastor_${session.ownerId}`,
        voteCount: 0,
        elected: false,
        tied: false,
        createdAt: serverTimestamp(),
      });
      projectorCandidates.push({
        id: candidateId,
        name: cleanName,
        voteCount: session.showResultsOnProjector ? 0 : null,
        elected: false,
        tied: false,
      });
    }

    batch.update(doc(db, 'sessions', session.id, 'departments', dept.id), {
      status: 'voting',
      activeRoundId: roundId,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'sessions', session.id), {
      activeRoundId: roundId,
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
      sessionId: session.id,
      churchName: session.churchName,
      year: session.year,
      roundId,
      departmentName: clampString(dept.department, 120),
      roleTitle: clampString(dept.roleTitle, 140),
      seats: Math.max(1, Math.min(50, seatsForRound)),
      isTieBreaker,
      roundStatus: 'open',
      showResults: session.showResultsOnProjector,
      votesCastCount: 0,
      expectedVotersCount,
      candidates: projectorCandidates,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return roundId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function proposeCandidate(
  sessionId: string,
  roundId: string,
  name: string,
  proposedByToken: string
): Promise<void> {
  const candidateId = `cand_${generateSecureId(16)}`;
  const path = `sessions/${sessionId}/rounds/${roundId}/candidates/${candidateId}`;
  try {
    await setDoc(doc(db, 'sessions', sessionId, 'rounds', roundId, 'candidates', candidateId), {
      sessionId,
      roundId,
      name: clampString(name, 140),
      proposedByToken,
      voteCount: 0,
      elected: false,
      tied: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function removeCandidate(
  sessionId: string,
  roundId: string,
  candidateId: string
): Promise<void> {
  const path = `sessions/${sessionId}/rounds/${roundId}/candidates/${candidateId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId, 'rounds', roundId, 'candidates', candidateId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function castSecretVote(
  sessionId: string,
  roundId: string,
  receiptId: string,
  candidateIds: string[]
): Promise<void> {
  const ballotId = `b_${generateSecureId(22)}`;
  const path = `sessions/${sessionId}/rounds/${roundId}/ballots/${ballotId}`;
  const uniqueIds = Array.from(new Set(candidateIds));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'sessions', sessionId, 'rounds', roundId, 'receipts', receiptId), {
      sessionId,
      roundId,
      castAt: serverTimestamp(),
    });

    // Strictly anonymous ballot: zero voter identity stored
    batch.set(doc(db, 'sessions', sessionId, 'rounds', roundId, 'ballots', ballotId), {
      sessionId,
      roundId,
      candidateIds: uniqueIds,
      castAt: serverTimestamp(),
    });

    batch.update(doc(db, 'sessions', sessionId, 'rounds', roundId), {
      votesCastCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function setRoundPauseState(
  session: SessionData,
  round: RoundData,
  paused: boolean
): Promise<void> {
  const path = `sessions/${session.id}/rounds/${round.id}`;
  const nextRoundStatus = paused ? 'paused' : 'open';
  const nextDeptStatus = paused ? 'paused' : 'voting';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), {
      status: nextRoundStatus,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
      status: nextDeptStatus,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
      roundStatus: nextRoundStatus,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function reopenRound(
  session: SessionData,
  round: RoundData,
  candidates: CandidateData[]
): Promise<void> {
  const path = `sessions/${session.id}/rounds/${round.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), {
      status: 'open',
      tiedCandidateIds: [],
      electedCandidateIds: [],
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
      status: 'voting',
      activeRoundId: round.id,
      electedNames: round.carryoverElectedNames,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id), {
      activeRoundId: round.id,
      updatedAt: serverTimestamp(),
    });
    for (const cand of candidates) {
      batch.update(
        doc(db, 'sessions', session.id, 'rounds', round.id, 'candidates', cand.id),
        {
          elected: false,
          tied: false,
        }
      );
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncRoundAndProjector(params: {
  session: SessionData;
  round: RoundData;
  candidates: CandidateData[];
  ballots: SecretBallot[];
  receiptsCount: number;
  forceClose?: boolean;
}): Promise<void> {
  const { session, round, candidates, ballots, receiptsCount, forceClose = false } = params;
  const path = `sessions/${session.id}/rounds/${round.id}`;
  const evalResult = evaluateRoundTallies(candidates, ballots, round.seats);

  const shouldClose =
    forceClose ||
    (round.status === 'open' &&
      round.expectedVotersCount > 0 &&
      receiptsCount >= round.expectedVotersCount);

  try {
    const batch = writeBatch(db);

    if (shouldClose) {
      const newlyElectedNames = candidates
        .filter((c) => evalResult.electedIds.includes(c.id))
        .map((c) => c.name);
      const combinedElectedNames = Array.from(
        new Set([...round.carryoverElectedNames, ...newlyElectedNames])
      ).slice(0, 50);

      for (const cand of candidates) {
        const count = evalResult.countsById[cand.id] ?? 0;
        const elected = evalResult.electedIds.includes(cand.id);
        const tied = evalResult.tiedIds.includes(cand.id);
        if (cand.voteCount !== count || cand.elected !== elected || cand.tied !== tied) {
          batch.update(
            doc(db, 'sessions', session.id, 'rounds', round.id, 'candidates', cand.id),
            {
              voteCount: count,
              elected,
              tied,
            }
          );
        }
      }

      batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), {
        status: 'closed',
        votesCastCount: receiptsCount,
        electedCandidateIds: evalResult.electedIds,
        tiedCandidateIds: evalResult.tiedIds,
        updatedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
        status: evalResult.hasTie ? 'tie' : 'completed',
        electedNames: combinedElectedNames,
        activeRoundId: evalResult.hasTie ? round.id : null,
        updatedAt: serverTimestamp(),
      });

      const projCandidates: ProjectorCandidate[] = [...candidates]
        .sort(
          (a, b) => (evalResult.countsById[b.id] ?? 0) - (evalResult.countsById[a.id] ?? 0)
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          voteCount: session.showResultsOnProjector ? (evalResult.countsById[c.id] ?? 0) : null,
          elected: session.showResultsOnProjector ? evalResult.electedIds.includes(c.id) : false,
          tied: session.showResultsOnProjector ? evalResult.tiedIds.includes(c.id) : false,
        }));

      batch.set(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
        sessionId: session.id,
        churchName: session.churchName,
        year: session.year,
        roundId: round.id,
        departmentName: round.departmentName,
        roleTitle: round.roleTitle,
        seats: round.seats,
        isTieBreaker: round.isTieBreaker,
        roundStatus: evalResult.hasTie ? 'tie' : 'closed',
        showResults: session.showResultsOnProjector,
        votesCastCount: receiptsCount,
        expectedVotersCount: round.expectedVotersCount,
        candidates: projCandidates,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return;
    }

    // Live sync while round is open/paused or updating projector visibility
    let anyCandidateCountChanged = false;
    for (const cand of candidates) {
      const count = evalResult.countsById[cand.id] ?? 0;
      if (cand.voteCount !== count) {
        anyCandidateCountChanged = true;
        batch.update(
          doc(db, 'sessions', session.id, 'rounds', round.id, 'candidates', cand.id),
          { voteCount: count }
        );
      }
    }

    if (round.votesCastCount !== receiptsCount) {
      batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), {
        votesCastCount: receiptsCount,
        updatedAt: serverTimestamp(),
      });
    }

    const projCandidates: ProjectorCandidate[] = [...candidates]
      .sort((a, b) => (evalResult.countsById[b.id] ?? 0) - (evalResult.countsById[a.id] ?? 0))
      .map((c) => ({
        id: c.id,
        name: c.name,
        voteCount: session.showResultsOnProjector ? (evalResult.countsById[c.id] ?? 0) : null,
        elected:
          round.status === 'closed' && session.showResultsOnProjector
            ? round.electedCandidateIds.includes(c.id)
            : false,
        tied:
          round.status === 'closed' && session.showResultsOnProjector
            ? round.tiedCandidateIds.includes(c.id)
            : false,
      }));

    const projStatus: 'idle' | 'open' | 'paused' | 'closed' | 'tie' =
      round.status === 'closed'
        ? round.tiedCandidateIds.length > 0
          ? 'tie'
          : 'closed'
        : round.status;

    batch.set(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
      sessionId: session.id,
      churchName: session.churchName,
      year: session.year,
      roundId: round.id,
      departmentName: round.departmentName,
      roleTitle: round.roleTitle,
      seats: round.seats,
      isTieBreaker: round.isTieBreaker,
      roundStatus: projStatus,
      showResults: session.showResultsOnProjector,
      votesCastCount: receiptsCount,
      expectedVotersCount: round.expectedVotersCount,
      candidates: projCandidates,
      updatedAt: serverTimestamp(),
    });

    if (anyCandidateCountChanged || round.votesCastCount !== receiptsCount || true) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function clearAllEligibleMembers(
  sessionId: string,
  memberIds: string[]
): Promise<void> {
  const path = `sessions/${sessionId}/eligibleMembers`;
  try {
    const chunkSize = 400;
    for (let i = 0; i < memberIds.length; i += chunkSize) {
      const batch = writeBatch(db);
      for (const id of memberIds.slice(i, i + chunkSize)) {
        batch.delete(doc(db, 'sessions', sessionId, 'eligibleMembers', id));
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteSessionCompletely(sessionId: string): Promise<void> {
  const path = `sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
