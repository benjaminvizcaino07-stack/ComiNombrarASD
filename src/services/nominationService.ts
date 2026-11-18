import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  DepartmentVotingMode,
  GroupedRoundStage,
  PastorVoteOverride,
  ProjectorCandidate,
  ProjectorObservation,
  RoundData,
  RoundObservation,
  SecretBallot,
  SessionData,
  SessionStatus,
} from '../types';
import { generateSecureId } from '../utils/id';
import {
  computePastorVoteAllowed,
  evaluateGroupedRoundTallies,
  evaluateRoundTallies,
} from '../utils/tally';

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
      allowMemberProposals: true,
      allowMemberObservations: true,
      sessionStatus: 'active',
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
      sessionStatus: 'active',
      roundStatus: 'idle',
      memberProposalsEnabled: true,
      memberObservationsEnabled: true,
      observationsRevealed: false,
      revealedObservations: [],
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
    pastorName: string;
    secretaryName: string;
    meetingDate: string;
    meetingTime: string;
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
    if (updates.pastorName !== undefined) clean.pastorName = clampString(updates.pastorName, 140);
    if (updates.secretaryName !== undefined)
      clean.secretaryName = clampString(updates.secretaryName, 140);
    if (updates.meetingDate !== undefined) clean.meetingDate = clampString(updates.meetingDate, 40);
    if (updates.meetingTime !== undefined) clean.meetingTime = clampString(updates.meetingTime, 40);
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
  order: number,
  options?: {
    votingMode?: DepartmentVotingMode;
    leaderRoleTitle?: string;
    membersRoleTitle?: string;
  }
): Promise<void> {
  const deptId = `d_${generateSecureId(16)}`;
  const path = `sessions/${sessionId}/departments/${deptId}`;
  const mode: DepartmentVotingMode = options?.votingMode === 'grouped' ? 'grouped' : 'standard';
  const clampedSeats =
    mode === 'grouped'
      ? Math.max(2, Math.min(50, Math.floor(seats)))
      : Math.max(1, Math.min(50, Math.floor(seats)));

  try {
    const payload: Record<string, unknown> = {
      sessionId,
      department: clampString(department, 120),
      roleTitle: clampString(roleTitle, 140),
      votingMode: mode,
      seats: clampedSeats,
      order: Math.max(0, Math.min(2000, Math.floor(order))),
      status: 'pending',
      activeRoundId: null,
      electedNames: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (mode === 'grouped') {
      payload.leaderRoleTitle = clampString(
        options?.leaderRoleTitle || 'Cargo Principal',
        140
      );
      payload.membersRoleTitle = clampString(options?.membersRoleTitle || 'Integrantes', 140);
      payload.leaderElectedName = null;
      payload.memberElectedNames = [];
    }
    await setDoc(doc(db, 'sessions', sessionId, 'departments', deptId), payload);
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
      const mode: DepartmentVotingMode = tpl.votingMode === 'grouped' ? 'grouped' : 'standard';
      const seats =
        mode === 'grouped'
          ? Math.max(2, Math.min(50, tpl.defaultSeats))
          : Math.max(1, Math.min(50, tpl.defaultSeats));
      const payload: Record<string, unknown> = {
        sessionId,
        department: clampString(tpl.department, 120),
        roleTitle: clampString(tpl.roleTitle, 140),
        votingMode: mode,
        seats,
        order: startOrder + idx,
        status: 'pending',
        activeRoundId: null,
        electedNames: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (mode === 'grouped') {
        payload.leaderRoleTitle = clampString(tpl.leaderRoleTitle || 'Cargo Principal', 140);
        payload.membersRoleTitle = clampString(tpl.membersRoleTitle || 'Integrantes', 140);
        payload.leaderElectedName = null;
        payload.memberElectedNames = [];
      }
      batch.set(doc(db, 'sessions', sessionId, 'departments', deptId), payload);
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
    votingMode: DepartmentVotingMode;
    leaderRoleTitle: string;
    membersRoleTitle: string;
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
    if (updates.votingMode !== undefined) clean.votingMode = updates.votingMode;
    if (updates.leaderRoleTitle !== undefined)
      clean.leaderRoleTitle = clampString(updates.leaderRoleTitle, 140);
    if (updates.membersRoleTitle !== undefined)
      clean.membersRoleTitle = clampString(updates.membersRoleTitle, 140);
    if (updates.seats !== undefined) {
      const minSeats = updates.votingMode === 'grouped' ? 2 : 1;
      clean.seats = Math.max(minSeats, Math.min(50, Math.floor(updates.seats)));
    }
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
  currentCommittee: CommitteeMember[],
  activeRound?: RoundData | null
): Promise<string> {
  const token = `c_${generateSecureId(22)}`;
  const path = `sessions/${session.id}/committee/${token}`;
  const newEnabledCount = currentCommittee.filter((m) => m.enabled).length + 1;
  const pastorAllowed = computePastorVoteAllowed(
    newEnabledCount,
    session.pastorVoteEnabledOverride
  );
  const expectedVotersCount = newEnabledCount + (pastorAllowed ? 1 : 0);

  try {
    await setDoc(doc(db, 'sessions', session.id, 'committee', token), {
      sessionId: session.id,
      name: clampString(name, 120),
      roleLabel: clampString(roleLabel || 'Miembro de Comisión', 80),
      enabled: true,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });

    if (activeRound && activeRound.status !== 'closed') {
      await updateDoc(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }

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
    await updateDoc(doc(db, 'sessions', session.id, 'committee', token), { enabled });
    await updateDoc(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });
    if (activeRound && activeRound.status !== 'closed') {
      await updateDoc(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }
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
    await deleteDoc(doc(db, 'sessions', session.id, 'committee', token));
    await updateDoc(doc(db, 'sessions', session.id), {
      enabledCommitteeCount: newEnabledCount,
      updatedAt: serverTimestamp(),
    });
    if (activeRound && activeRound.status !== 'closed') {
      await updateDoc(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        pastorVoteAllowed: pastorAllowed,
        expectedVotersCount,
        updatedAt: serverTimestamp(),
      });
    }
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
  groupedStage?: GroupedRoundStage;
  carryoverLeaderName?: string | null;
}): Promise<string> {
  const {
    session,
    dept,
    roundNumber,
    seatsForRound,
    carryoverElectedNames,
    isTieBreaker,
    seedCandidates = [],
    groupedStage,
    carryoverLeaderName = null,
  } = params;

  const roundId = `r_${generateSecureId(18)}`;
  const path = `sessions/${session.id}/rounds/${roundId}`;
  const pastorVoteAllowed = computePastorVoteAllowed(
    session.enabledCommitteeCount,
    session.pastorVoteEnabledOverride
  );
  const expectedVotersCount = session.enabledCommitteeCount + (pastorVoteAllowed ? 1 : 0);

  const isGrouped = dept.votingMode === 'grouped' && dept.seats >= 2;
  const effectiveStage: GroupedRoundStage | undefined = isGrouped
    ? groupedStage ?? 'leader'
    : undefined;
  const ballotSeats = isGrouped
    ? effectiveStage === 'leader'
      ? 1
      : Math.max(1, Math.min(50, seatsForRound))
    : Math.max(1, Math.min(50, seatsForRound));
  const totalGroupSeats = isGrouped ? Math.max(2, Math.min(50, dept.seats)) : undefined;
  const leaderRoleTitle = isGrouped
    ? clampString(dept.leaderRoleTitle || 'Cargo Principal', 140)
    : undefined;
  const membersRoleTitle = isGrouped
    ? clampString(dept.membersRoleTitle || 'Integrantes', 140)
    : undefined;

  const maxProposals =
    !isTieBreaker && typeof dept.maxProposals === 'number'
      ? Math.max(1, Math.min(50, Math.floor(dept.maxProposals)))
      : null;
  const memberProposalsEnabled = session.allowMemberProposals ?? true;
  const memberObservationsEnabled = session.allowMemberObservations ?? true;

  try {
    const batch = writeBatch(db);

    const roundPayload: Record<string, unknown> = {
      sessionId: session.id,
      departmentId: dept.id,
      departmentName: clampString(dept.department, 120),
      roleTitle: clampString(dept.roleTitle, 140),
      votingMode: isGrouped ? 'grouped' : 'standard',
      seats: ballotSeats,
      maxProposals,
      isTieBreaker,
      roundNumber,
      status: 'open',
      proposalsOpen: !isTieBreaker,
      votingStarted: isTieBreaker,
      memberProposalsEnabled,
      memberObservationsEnabled,
      observation: null,
      observationsRevealed: false,
      pastorVoteAllowed,
      expectedVotersCount,
      votesCastCount: 0,
      carryoverElectedNames: carryoverElectedNames.slice(0, 50),
      tiedCandidateIds: [],
      electedCandidateIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (isGrouped && effectiveStage) {
      roundPayload.groupedStage = effectiveStage;
      roundPayload.leaderRoleTitle = leaderRoleTitle;
      roundPayload.membersRoleTitle = membersRoleTitle;
      roundPayload.totalGroupSeats = totalGroupSeats;
      roundPayload.carryoverLeaderName = carryoverLeaderName
        ? clampString(carryoverLeaderName, 140)
        : null;
    }

    batch.set(doc(db, 'sessions', session.id, 'rounds', roundId), roundPayload);

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
        electedRoleLabel: null,
      });
    }

    const deptUpdates: Record<string, unknown> = {
      status: 'voting',
      activeRoundId: roundId,
      updatedAt: serverTimestamp(),
    };
    if (!isTieBreaker) {
      deptUpdates.electedNames = [];
      if (isGrouped) {
        deptUpdates.leaderElectedName = null;
        deptUpdates.memberElectedNames = [];
      }
    }
    batch.update(doc(db, 'sessions', session.id, 'departments', dept.id), deptUpdates);

    batch.update(doc(db, 'sessions', session.id), {
      activeRoundId: roundId,
      sessionStatus: 'active',
      updatedAt: serverTimestamp(),
    });

    const projectorPayload: Record<string, unknown> = {
      sessionId: session.id,
      churchName: session.churchName,
      year: session.year,
      roundId,
      departmentName: clampString(dept.department, 120),
      roleTitle: clampString(dept.roleTitle, 140),
      votingMode: isGrouped ? 'grouped' : 'standard',
      seats: ballotSeats,
      maxProposals,
      isTieBreaker,
      sessionStatus: 'active',
      roundStatus: 'open',
      proposalsOpen: !isTieBreaker,
      votingStarted: isTieBreaker,
      memberProposalsEnabled,
      memberObservationsEnabled,
      observation: null,
      observationsRevealed: false,
      revealedObservations: [],
      showResults: session.showResultsOnProjector,
      votesCastCount: 0,
      expectedVotersCount,
      candidates: projectorCandidates,
      updatedAt: serverTimestamp(),
    };
    if (isGrouped && effectiveStage) {
      projectorPayload.groupedStage = effectiveStage;
      projectorPayload.leaderRoleTitle = leaderRoleTitle;
      projectorPayload.membersRoleTitle = membersRoleTitle;
      projectorPayload.totalGroupSeats = totalGroupSeats;
    }

    batch.set(doc(db, 'sessions', session.id, 'projector', session.projectorKey), projectorPayload);

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
    const projectorUpdates: Record<string, unknown> = {
      roundStatus: nextRoundStatus,
      updatedAt: serverTimestamp(),
    };
    if (!paused) {
      batch.update(doc(db, 'sessions', session.id), {
        sessionStatus: 'active',
        updatedAt: serverTimestamp(),
      });
      projectorUpdates.sessionStatus = 'active';
    }
    batch.update(
      doc(db, 'sessions', session.id, 'projector', session.projectorKey),
      projectorUpdates
    );
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateRoundControl(
  session: SessionData,
  round: RoundData,
  updates: Partial<{
    proposalsOpen: boolean;
    votingStarted: boolean;
    observation: string | null;
    maxProposals: number | null;
  }>
): Promise<void> {
  const path = `sessions/${session.id}/rounds/${round.id}`;
  try {
    const batch = writeBatch(db);
    const roundUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const projectorUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (updates.proposalsOpen !== undefined) {
      roundUpdates.proposalsOpen = updates.proposalsOpen;
      projectorUpdates.proposalsOpen = updates.proposalsOpen;
    }
    if (updates.votingStarted !== undefined) {
      roundUpdates.votingStarted = updates.votingStarted;
      projectorUpdates.votingStarted = updates.votingStarted;
    }
    if (updates.observation !== undefined) {
      const cleanObs = updates.observation ? clampString(updates.observation, 500) : null;
      roundUpdates.observation = cleanObs;
      projectorUpdates.observation = cleanObs;
    }
    if (updates.maxProposals !== undefined) {
      const cleanMax =
        updates.maxProposals === null
          ? null
          : Math.max(1, Math.min(50, Math.floor(updates.maxProposals)));
      roundUpdates.maxProposals = cleanMax;
      projectorUpdates.maxProposals = cleanMax;
      batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
        maxProposals: cleanMax,
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), roundUpdates);
    batch.update(
      doc(db, 'sessions', session.id, 'projector', session.projectorKey),
      projectorUpdates
    );
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateDepartmentMaxProposals(
  session: SessionData,
  deptId: string,
  maxProposals: number | null,
  activeRound?: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}/departments/${deptId}`;
  const cleanMax =
    maxProposals === null ? null : Math.max(1, Math.min(50, Math.floor(maxProposals)));
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id, 'departments', deptId), {
      maxProposals: cleanMax,
      updatedAt: serverTimestamp(),
    });
    if (
      activeRound &&
      activeRound.departmentId === deptId &&
      activeRound.status !== 'closed' &&
      !activeRound.isTieBreaker
    ) {
      batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
        maxProposals: cleanMax,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
        maxProposals: cleanMax,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateMemberParticipationPermissions(
  session: SessionData,
  updates: {
    allowMemberProposals?: boolean;
    allowMemberObservations?: boolean;
  },
  activeRound?: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}`;
  try {
    const batch = writeBatch(db);
    const sessionUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const roundUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const projectorUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (updates.allowMemberProposals !== undefined) {
      sessionUpdates.allowMemberProposals = updates.allowMemberProposals;
      roundUpdates.memberProposalsEnabled = updates.allowMemberProposals;
      projectorUpdates.memberProposalsEnabled = updates.allowMemberProposals;
    }
    if (updates.allowMemberObservations !== undefined) {
      sessionUpdates.allowMemberObservations = updates.allowMemberObservations;
      roundUpdates.memberObservationsEnabled = updates.allowMemberObservations;
      projectorUpdates.memberObservationsEnabled = updates.allowMemberObservations;
    }

    batch.update(doc(db, 'sessions', session.id), sessionUpdates);
    if (activeRound && activeRound.status !== 'closed') {
      batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), roundUpdates);
      batch.update(
        doc(db, 'sessions', session.id, 'projector', session.projectorKey),
        projectorUpdates
      );
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function setSessionLifecycleStatus(
  session: SessionData,
  nextStatus: SessionStatus,
  activeRound?: RoundData | null
): Promise<void> {
  const path = `sessions/${session.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id), {
      sessionStatus: nextStatus,
      updatedAt: serverTimestamp(),
    });

    const projectorUpdates: Record<string, unknown> = {
      sessionStatus: nextStatus,
      updatedAt: serverTimestamp(),
    };

    if (activeRound) {
      if ((nextStatus === 'paused' || nextStatus === 'ended') && activeRound.status === 'open') {
        batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
          status: 'paused',
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'sessions', session.id, 'departments', activeRound.departmentId), {
          status: 'paused',
          updatedAt: serverTimestamp(),
        });
        projectorUpdates.roundStatus = 'paused';
      } else if (nextStatus === 'active' && activeRound.status === 'paused') {
        batch.update(doc(db, 'sessions', session.id, 'rounds', activeRound.id), {
          status: 'open',
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'sessions', session.id, 'departments', activeRound.departmentId), {
          status: 'voting',
          updatedAt: serverTimestamp(),
        });
        projectorUpdates.roundStatus = 'open';
      }
    }

    batch.update(
      doc(db, 'sessions', session.id, 'projector', session.projectorKey),
      projectorUpdates
    );

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

function buildProjectorObservations(
  observations: RoundObservation[],
  revealed: boolean
): ProjectorObservation[] {
  if (!revealed) return [];
  return observations.slice(0, 50).map((obs) => ({
    id: obs.id,
    authorRole: obs.authorRole,
    candidateName: obs.candidateName ?? null,
    text: clampString(obs.text, 500),
  }));
}

export async function submitRoundObservation(params: {
  sessionId: string;
  roundId: string;
  authorToken: string;
  authorRole: 'member' | 'pastor';
  candidateName?: string | null;
  text: string;
  revealed: boolean;
}): Promise<boolean> {
  const { sessionId, roundId, authorToken, authorRole, candidateName, text, revealed } = params;
  const cleanText = clampString(text, 500);
  if (!cleanText) return false;

  const obsId = `obs_${generateSecureId(16)}`;
  const path = `sessions/${sessionId}/rounds/${roundId}/observations/${obsId}`;
  try {
    const roundSnap = await getDoc(doc(db, 'sessions', sessionId, 'rounds', roundId));
    const currentRevealed = roundSnap.exists()
      ? Boolean(roundSnap.data()?.observationsRevealed)
      : revealed;

    await setDoc(doc(db, 'sessions', sessionId, 'rounds', roundId, 'observations', obsId), {
      sessionId,
      roundId,
      authorToken,
      authorRole,
      candidateName: candidateName ? clampString(candidateName, 140) : null,
      text: cleanText,
      revealed: currentRevealed,
      createdAt: serverTimestamp(),
    });
    return currentRevealed;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteRoundObservation(
  sessionId: string,
  roundId: string,
  observationId: string
): Promise<void> {
  const path = `sessions/${sessionId}/rounds/${roundId}/observations/${observationId}`;
  try {
    await deleteDoc(doc(db, 'sessions', sessionId, 'rounds', roundId, 'observations', observationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function setObservationsRevealed(
  session: SessionData,
  round: RoundData,
  observations: RoundObservation[],
  revealed: boolean
): Promise<void> {
  const path = `sessions/${session.id}/rounds/${round.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'sessions', session.id, 'rounds', round.id), {
      observationsRevealed: revealed,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
      observationsRevealed: revealed,
      revealedObservations: buildProjectorObservations(observations, revealed),
      updatedAt: serverTimestamp(),
    });

    const toUpdate = observations.filter((obs) => obs.revealed !== revealed);
    const firstChunk = toUpdate.slice(0, 400);
    for (const obs of firstChunk) {
      batch.update(
        doc(db, 'sessions', session.id, 'rounds', round.id, 'observations', obs.id),
        { revealed }
      );
    }
    await batch.commit();

    for (let i = 400; i < toUpdate.length; i += 400) {
      const extraBatch = writeBatch(db);
      for (const obs of toUpdate.slice(i, i + 400)) {
        extraBatch.update(
          doc(db, 'sessions', session.id, 'rounds', round.id, 'observations', obs.id),
          { revealed }
        );
      }
      await extraBatch.commit();
    }
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
    const deptReset: Record<string, unknown> = {
      status: 'voting',
      activeRoundId: round.id,
      electedNames: round.carryoverElectedNames,
      updatedAt: serverTimestamp(),
    };
    if (round.votingMode === 'grouped') {
      deptReset.leaderElectedName = round.carryoverLeaderName ?? null;
      deptReset.memberElectedNames = round.carryoverElectedNames;
      deptReset.electedNames = round.carryoverLeaderName
        ? [round.carryoverLeaderName, ...round.carryoverElectedNames]
        : round.carryoverElectedNames;
    }
    batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), deptReset);
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
  observations?: RoundObservation[];
  forceClose?: boolean;
}): Promise<void> {
  const {
    session,
    round,
    candidates,
    ballots,
    receiptsCount,
    observations = [],
    forceClose = false,
  } = params;
  const path = `sessions/${session.id}/rounds/${round.id}`;
  const isGrouped = round.votingMode === 'grouped';
  const groupedEval = isGrouped
    ? evaluateGroupedRoundTallies({
        candidates,
        ballots,
        totalGroupSeats: round.totalGroupSeats ?? round.seats,
        groupedStage: round.groupedStage ?? 'leader',
        carryoverLeaderName: round.carryoverLeaderName ?? null,
        carryoverElectedNames: round.carryoverElectedNames ?? [],
      })
    : null;
  const standardEval = !isGrouped
    ? evaluateRoundTallies(candidates, ballots, round.seats)
    : null;

  const evalResult = groupedEval ?? standardEval!;

  const shouldClose =
    forceClose ||
    (round.status === 'open' &&
      round.expectedVotersCount > 0 &&
      receiptsCount >= round.expectedVotersCount);

  const buildGroupedFieldsForProjector = (): Record<string, unknown> => {
    if (!isGrouped) return {};
    const out: Record<string, unknown> = {
      votingMode: 'grouped',
      groupedStage: round.groupedStage ?? 'leader',
      totalGroupSeats: round.totalGroupSeats ?? round.seats,
    };
    if (round.leaderRoleTitle) out.leaderRoleTitle = round.leaderRoleTitle;
    if (round.membersRoleTitle) out.membersRoleTitle = round.membersRoleTitle;
    return out;
  };

  try {
    const batch = writeBatch(db);

    if (shouldClose) {
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

      if (isGrouped && groupedEval) {
        const leaderName = groupedEval.leaderName ?? round.carryoverLeaderName ?? null;
        const memberNames = groupedEval.memberNames;
        const combinedElectedNames = Array.from(
          new Set([...(leaderName ? [leaderName] : []), ...memberNames])
        ).slice(0, 50);

        batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
          status: groupedEval.hasTie ? 'tie' : 'completed',
          leaderElectedName: leaderName,
          memberElectedNames: memberNames.slice(0, 50),
          electedNames: combinedElectedNames,
          activeRoundId: groupedEval.hasTie ? round.id : null,
          updatedAt: serverTimestamp(),
        });
      } else {
        const newlyElectedNames = candidates
          .filter((c) => evalResult.electedIds.includes(c.id))
          .map((c) => c.name);
        const combinedElectedNames = Array.from(
          new Set([...round.carryoverElectedNames, ...newlyElectedNames])
        ).slice(0, 50);

        batch.update(doc(db, 'sessions', session.id, 'departments', round.departmentId), {
          status: evalResult.hasTie ? 'tie' : 'completed',
          electedNames: combinedElectedNames,
          activeRoundId: evalResult.hasTie ? round.id : null,
          updatedAt: serverTimestamp(),
        });
      }

      const projCandidates: ProjectorCandidate[] = [...candidates]
        .sort(
          (a, b) => (evalResult.countsById[b.id] ?? 0) - (evalResult.countsById[a.id] ?? 0)
        )
        .map((c) => {
          const isElected = evalResult.electedIds.includes(c.id);
          let electedRoleLabel: string | null = null;
          if (session.showResultsOnProjector && isGrouped && groupedEval && isElected) {
            if (groupedEval.leaderId === c.id) {
              electedRoleLabel = round.leaderRoleTitle || 'Cargo Principal';
            } else if (groupedEval.memberIds.includes(c.id)) {
              electedRoleLabel = round.membersRoleTitle || 'Integrante';
            }
          }
          return {
            id: c.id,
            name: c.name,
            voteCount: session.showResultsOnProjector ? (evalResult.countsById[c.id] ?? 0) : null,
            elected: session.showResultsOnProjector ? isElected : false,
            tied: session.showResultsOnProjector ? evalResult.tiedIds.includes(c.id) : false,
            electedRoleLabel,
          };
        });

      batch.set(doc(db, 'sessions', session.id, 'projector', session.projectorKey), {
        sessionId: session.id,
        churchName: session.churchName,
        year: session.year,
        roundId: round.id,
        departmentName: round.departmentName,
        roleTitle: round.roleTitle,
        ...buildGroupedFieldsForProjector(),
        seats: round.seats,
        maxProposals: round.maxProposals ?? null,
        isTieBreaker: round.isTieBreaker,
        sessionStatus: session.sessionStatus ?? 'active',
        roundStatus: evalResult.hasTie ? 'tie' : 'closed',
        proposalsOpen: false,
        votingStarted: round.votingStarted ?? true,
        memberProposalsEnabled:
          round.memberProposalsEnabled ?? session.allowMemberProposals ?? true,
        memberObservationsEnabled:
          round.memberObservationsEnabled ?? session.allowMemberObservations ?? true,
        observation: round.observation ?? null,
        observationsRevealed: Boolean(round.observationsRevealed),
        revealedObservations: buildProjectorObservations(
          observations,
          Boolean(round.observationsRevealed)
        ),
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
      .map((c) => {
        const isElected =
          round.status === 'closed' && session.showResultsOnProjector
            ? round.electedCandidateIds.includes(c.id)
            : false;
        let electedRoleLabel: string | null = null;
        if (isElected && isGrouped && groupedEval) {
          if (groupedEval.leaderId === c.id) {
            electedRoleLabel = round.leaderRoleTitle || 'Cargo Principal';
          } else if (groupedEval.memberIds.includes(c.id)) {
            electedRoleLabel = round.membersRoleTitle || 'Integrante';
          }
        }
        return {
          id: c.id,
          name: c.name,
          voteCount: session.showResultsOnProjector ? (evalResult.countsById[c.id] ?? 0) : null,
          elected: isElected,
          tied:
            round.status === 'closed' && session.showResultsOnProjector
              ? round.tiedCandidateIds.includes(c.id)
              : false,
          electedRoleLabel,
        };
      });

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
      ...buildGroupedFieldsForProjector(),
      seats: round.seats,
      maxProposals: round.maxProposals ?? null,
      isTieBreaker: round.isTieBreaker,
      sessionStatus: session.sessionStatus ?? 'active',
      roundStatus: projStatus,
      proposalsOpen: round.proposalsOpen ?? !round.isTieBreaker,
      votingStarted: round.votingStarted ?? true,
      memberProposalsEnabled:
        round.memberProposalsEnabled ?? session.allowMemberProposals ?? true,
      memberObservationsEnabled:
        round.memberObservationsEnabled ?? session.allowMemberObservations ?? true,
      observation: round.observation ?? null,
      observationsRevealed: Boolean(round.observationsRevealed),
      revealedObservations: buildProjectorObservations(
        observations,
        Boolean(round.observationsRevealed)
      ),
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
