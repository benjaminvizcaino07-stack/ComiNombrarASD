import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  MessageSquareText,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  castSecretVote,
  deleteRoundObservation,
  proposeCandidate,
  removeCandidate,
  reopenRound,
  setObservationsRevealed,
  setRoundPauseState,
  setSessionLifecycleStatus,
  submitRoundObservation,
  syncRoundAndProjector,
  updateDepartmentMaxProposals,
  updateMemberParticipationPermissions,
  updateRoundControl,
} from '../services/nominationService';
import {
  CandidateData,
  CommitteeMember,
  DepartmentPosition,
  EligibleMember,
  RoundData,
  RoundObservation,
  SecretBallot,
  SessionData,
} from '../types';

interface VoteSectionProps {
  session: SessionData | null;
  isAdmin: boolean;
  adminUid: string | null;
  committeeMember: CommitteeMember | null;
  departments: DepartmentPosition[];
  activeRound: RoundData | null;
  candidates: CandidateData[];
  observations: RoundObservation[];
  eligibleMembers: EligibleMember[];
  hasVotedCurrentRound: boolean;
  receiptsCount: number;
  ballots: SecretBallot[];
  onGoToResults: () => void;
}

export const VoteSection: React.FC<VoteSectionProps> = ({
  session,
  isAdmin,
  adminUid,
  committeeMember,
  departments,
  activeRound,
  candidates,
  observations,
  eligibleMembers,
  hasVotedCurrentRound,
  receiptsCount,
  ballots,
  onGoToResults,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [proposalInput, setProposalInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [savingControl, setSavingControl] = useState(false);
  const [observationDraft, setObservationDraft] = useState('');
  const [memberObsInput, setMemberObsInput] = useState('');
  const [memberObsCandidate, setMemberObsCandidate] = useState('');
  const [submittingObs, setSubmittingObs] = useState(false);
  const [togglingReveal, setTogglingReveal] = useState(false);
  const [localSentObs, setLocalSentObs] = useState<
    { roundId: string; candidateName: string | null; text: string }[]
  >([]);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [showProposalLimitModal, setShowProposalLimitModal] = useState(false);
  const [selectedDeptIdForLimit, setSelectedDeptIdForLimit] = useState('');
  const [limitMode, setLimitMode] = useState<'unlimited' | 'limited'>('unlimited');
  const [limitValue, setLimitValue] = useState<number>(3);
  const [savingProposalLimit, setSavingProposalLimit] = useState(false);
  const [proposalLimitNotice, setProposalLimitNotice] = useState<string | null>(null);

  useEffect(() => {
    setObservationDraft(activeRound?.observation ?? '');
  }, [activeRound?.id, activeRound?.observation]);

  useEffect(() => {
    setSelectedIds([]);
    setMemberObsCandidate('');
    setMemberObsInput('');
  }, [activeRound?.id]);

  const canCommitteeVote = Boolean(committeeMember && committeeMember.enabled);
  const canPastorVote = Boolean(
    isAdmin && adminUid && activeRound && activeRound.pastorVoteAllowed
  );
  const voterReceiptId = canCommitteeVote
    ? committeeMember!.id
    : canPastorVote
      ? `pastor_${adminUid}`
      : null;

  const activeEligible = useMemo(() => {
    const existingNames = new Set(candidates.map((c) => c.name.trim().toLowerCase()));
    const q = proposalInput.trim().toLowerCase();
    return eligibleMembers
      .filter((m) => m.active && !existingNames.has(m.name.trim().toLowerCase()))
      .filter((m) => (!q ? true : m.name.toLowerCase().includes(q)));
  }, [eligibleMembers, candidates, proposalInput]);

  const orderedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.order - b.order),
    [departments]
  );

  const memberProposalsEnabled = activeRound
    ? (activeRound.memberProposalsEnabled ?? session?.allowMemberProposals ?? true)
    : (session?.allowMemberProposals ?? true);
  const memberObservationsEnabled = activeRound
    ? (activeRound.memberObservationsEnabled ?? session?.allowMemberObservations ?? true)
    : (session?.allowMemberObservations ?? true);

  const handleToggleMemberPermission = async (
    field: 'allowMemberProposals' | 'allowMemberObservations',
    nextValue: boolean
  ) => {
    if (!session || !isAdmin) return;
    setSavingControl(true);
    setVoteError(null);
    try {
      await updateMemberParticipationPermissions(
        session,
        { [field]: nextValue },
        activeRound
      );
    } catch {
      setVoteError('No se pudo actualizar los permisos de participación de los miembros.');
    } finally {
      setSavingControl(false);
    }
  };

  const loadDeptLimitIntoModal = (deptId: string) => {
    const dept = orderedDepartments.find((d) => d.id === deptId);
    const currentLimit =
      activeRound && activeRound.departmentId === deptId
        ? (activeRound.maxProposals ?? dept?.maxProposals ?? null)
        : (dept?.maxProposals ?? null);
    setSelectedDeptIdForLimit(deptId);
    if (typeof currentLimit === 'number' && currentLimit >= 1) {
      setLimitMode('limited');
      setLimitValue(currentLimit);
    } else {
      setLimitMode('unlimited');
      setLimitValue(Math.max(2, (dept?.seats ?? 1) + 1));
    }
  };

  const openProposalLimitModal = (initialDeptId?: string) => {
    const targetId =
      initialDeptId || activeRound?.departmentId || orderedDepartments[0]?.id || '';
    if (!targetId) return;
    setProposalLimitNotice(null);
    loadDeptLimitIntoModal(targetId);
    setShowProposalLimitModal(true);
  };

  const handleSaveProposalLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedDeptIdForLimit) return;
    setSavingProposalLimit(true);
    setVoteError(null);
    setProposalLimitNotice(null);
    try {
      const nextValue =
        limitMode === 'unlimited'
          ? null
          : Math.max(1, Math.min(50, Math.floor(limitValue || 1)));
      await updateDepartmentMaxProposals(
        session,
        selectedDeptIdForLimit,
        nextValue,
        activeRound
      );
      const targetDept = orderedDepartments.find((d) => d.id === selectedDeptIdForLimit);
      const label = targetDept ? `${targetDept.department} (${targetDept.roleTitle})` : 'el departamento';
      setProposalLimitNotice(
        nextValue === null
          ? `Sin límite de propuestas para ${label}.`
          : `Límite guardado: hasta ${nextValue} ${nextValue === 1 ? 'propuesta' : 'propuestas'} para ${label}.`
      );
      if (activeRound && activeRound.departmentId === selectedDeptIdForLimit) {
        setShowProposalLimitModal(false);
      }
    } catch {
      setVoteError('No se pudo guardar la cantidad de propuestas. Intenta nuevamente.');
    } finally {
      setSavingProposalLimit(false);
    }
  };

  const proposalLimitModal =
    showProposalLimitModal && isAdmin && session ? (
      <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Cantidad de propuestas por departamento
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Define cuántas propuestas de nombres se pueden registrar antes o durante la votación.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowProposalLimitModal(false)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveProposalLimit} className="p-5 space-y-4">
            <div>
              <label
                htmlFor="proposal-limit-dept"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Departamento / Cargo
              </label>
              <select
                id="proposal-limit-dept"
                value={selectedDeptIdForLimit}
                onChange={(e) => {
                  setProposalLimitNotice(null);
                  loadDeptLimitIntoModal(e.target.value);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
              >
                {orderedDepartments.map((dept) => {
                  const deptLimit =
                    activeRound && activeRound.departmentId === dept.id
                      ? (activeRound.maxProposals ?? dept.maxProposals ?? null)
                      : (dept.maxProposals ?? null);
                  return (
                    <option key={dept.id} value={dept.id}>
                      {dept.department} — {dept.roleTitle}
                      {deptLimit != null ? ` (Máx. ${deptLimit} propuestas)` : ' (Sin límite)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {activeRound && activeRound.departmentId === selectedDeptIdForLimit && (
              <p className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2.5">
                Departamento en votación actual · Propuestas registradas hasta ahora:{' '}
                <strong className="font-mono tabular-nums">{candidates.length}</strong>
              </p>
            )}

            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-slate-700">
                Límite de propuestas permitidas
              </span>
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setLimitMode('unlimited')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] ${
                    limitMode === 'unlimited'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sin límite
                </button>
                <button
                  type="button"
                  onClick={() => setLimitMode('limited')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[40px] ${
                    limitMode === 'limited'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Definir cantidad
                </button>
              </div>
            </div>

            {limitMode === 'limited' && (
              <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-700">
                    Máximo de propuestas:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLimitValue((v) => Math.max(1, v - 1))}
                      aria-label="Disminuir cantidad"
                      className="w-10 h-10 rounded-xl border border-slate-300 bg-white text-slate-800 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={limitValue}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setLimitValue(Number.isNaN(n) ? 1 : Math.max(1, Math.min(50, n)));
                      }}
                      className="w-16 text-center py-2 rounded-xl border border-slate-300 bg-white font-mono font-bold text-base text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                    <button
                      type="button"
                      onClick={() => setLimitValue((v) => Math.min(50, v + 1))}
                      aria-label="Aumentar cantidad"
                      className="w-10 h-10 rounded-xl border border-slate-300 bg-white text-slate-800 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[2, 3, 4, 5, 6, 8, 10, 12].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLimitValue(preset)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border cursor-pointer transition-colors tabular-nums ${
                        limitValue === preset
                          ? 'bg-blue-800 border-blue-800 text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {activeRound &&
                  activeRound.departmentId === selectedDeptIdForLimit &&
                  candidates.length > limitValue && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Ya hay {candidates.length} propuestas registradas en esta ronda; no se podrán
                      agregar nuevas hasta ajustar el límite o quitar nombres.
                    </p>
                  )}
              </div>
            )}

            {proposalLimitNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
                {proposalLimitNotice}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowProposalLimitModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={savingProposalLimit || !selectedDeptIdForLimit}
                className="px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {savingProposalLimit ? 'Guardando...' : 'Guardar cantidad'}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-3">
          <Users className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">No hay una sesión activa</h2>
          <p className="text-sm text-slate-600">
            Si eres integrante de la comisión, abre el enlace personal que te envió el pastor o
            secretario. Si eres el pastor, ingresa en Administrar para iniciar una sesión.
          </p>
        </div>
      </div>
    );
  }

  if (committeeMember && !committeeMember.enabled) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 space-y-3">
          <Lock className="w-10 h-10 text-amber-700 mx-auto" />
          <h2 className="text-xl font-bold text-amber-950">
            Enlace temporalmente deshabilitado
          </h2>
          <p className="text-sm text-amber-900">
            Hola {committeeMember.name}, tu participación en esta votación ha sido deshabilitada
            momentáneamente por el administrador de la comisión.
          </p>
        </div>
      </div>
    );
  }

  const sessionStatus = session.sessionStatus ?? 'active';

  if (!isAdmin && sessionStatus === 'paused') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
            <Pause className="w-6 h-6" />
          </div>
          <p className="text-xs font-medium text-slate-500">
            {session.churchName} · Período {session.year}
          </p>
          <h2 className="text-xl font-bold text-slate-900">Sesión de votación en pausa</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {committeeMember ? `Hola ${committeeMember.name}, el ` : 'El '}
            pastor o secretario pausó la sesión de nombramientos para continuar en otro momento o en
            otro día. Todo lo avanzado está guardado y{' '}
            <strong>tu enlace personal seguirá funcionando sin cambios</strong> cuando se reanude la
            sesión.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onGoToResults}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
            >
              Ver resultados guardados
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin && sessionStatus === 'ended') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-xs font-medium text-slate-500">
            {session.churchName} · Período {session.year}
          </p>
          <h2 className="text-xl font-bold text-slate-900">Sesión de nombramientos finalizada</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            La sesión de votación ha concluido. Puedes consultar la lista de nombramientos elegidos
            en la sección Resultados.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onGoToResults}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer min-h-[44px]"
            >
              Ver Resultados
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeRound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <Shield className="w-10 h-10 text-blue-800 mx-auto" />
          <p className="text-xs font-medium text-slate-500">
            {session.churchName} · Período {session.year}
          </p>
          <h2 className="text-xl font-bold text-slate-900">
            {committeeMember
              ? `Bienvenido(a), ${committeeMember.name}`
              : 'Esperando inicio de votación'}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            En este momento no hay un cargo abierto para votar. Cuando el pastor inicie el
            siguiente cargo o departamento, aparecerá aquí automáticamente.
          </p>
          {isAdmin && (
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {orderedDepartments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openProposalLimitModal()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-blue-800" />
                    Cantidad de propuestas por departamento
                  </button>
                )}
                <button
                  type="button"
                  disabled={savingControl}
                  onClick={async () => {
                    setSavingControl(true);
                    setVoteError(null);
                    try {
                      await setSessionLifecycleStatus(
                        session,
                        sessionStatus === 'active' ? 'paused' : 'active',
                        null
                      );
                    } catch {
                      setVoteError('No se pudo actualizar el estado de la sesión.');
                    } finally {
                      setSavingControl(false);
                    }
                  }}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 min-h-[44px] ${
                    sessionStatus === 'active'
                      ? 'border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                      : 'bg-blue-800 text-white hover:bg-blue-900'
                  }`}
                >
                  {sessionStatus === 'active' ? (
                    <>
                      <Pause className="w-4 h-4" /> Pausar sesión (otro día)
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />{' '}
                      {sessionStatus === 'paused' ? 'Reanudar sesión' : 'Reabrir sesión'}
                    </>
                  )}
                </button>
              </div>
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  Permisos para miembros (Pastor / Secretario)
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={savingControl}
                    onClick={() =>
                      handleToggleMemberPermission('allowMemberProposals', !memberProposalsEnabled)
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] ${
                      memberProposalsEnabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                    }`}
                  >
                    {memberProposalsEnabled ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" /> Propuestas miembros: Permitidas
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" /> Propuestas miembros: Solo Pastor/Sec.
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={savingControl}
                    onClick={() =>
                      handleToggleMemberPermission(
                        'allowMemberObservations',
                        !memberObservationsEnabled
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] ${
                      memberObservationsEnabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                    }`}
                  >
                    {memberObservationsEnabled ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" /> Observaciones miembros: Permitidas
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" /> Observaciones miembros: Limitadas
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {proposalLimitModal}
      </div>
    );
  }

  const displayedVotesCast = isAdmin ? receiptsCount : activeRound.votesCastCount;
  const remainingVoters = Math.max(0, activeRound.expectedVotersCount - displayedVotesCast);
  const progressPct =
    activeRound.expectedVotersCount > 0
      ? Math.min(100, Math.round((displayedVotesCast / activeRound.expectedVotersCount) * 100))
      : 0;

  const isGroupedRound = activeRound.votingMode === 'grouped';
  const isMembersTieBreaker =
    isGroupedRound && activeRound.groupedStage === 'members_tiebreaker';
  const totalGroupSeats = activeRound.totalGroupSeats ?? activeRound.seats;
  const leaderTitle = activeRound.leaderRoleTitle || 'Cargo Principal';
  const membersTitle = activeRound.membersRoleTitle || 'Integrantes';
  const proposalsOpen = activeRound.isTieBreaker
    ? false
    : (activeRound.proposalsOpen ?? true);
  const votingStarted = activeRound.votingStarted ?? true;
  const maxProposals = !activeRound.isTieBreaker ? (activeRound.maxProposals ?? null) : null;
  const proposalLimitReached = maxProposals !== null && candidates.length >= maxProposals;

  const handleControlUpdate = async (updates: {
    proposalsOpen?: boolean;
    votingStarted?: boolean;
    observation?: string | null;
  }) => {
    setSavingControl(true);
    setVoteError(null);
    try {
      await updateRoundControl(session, activeRound, updates);
    } catch {
      setVoteError('No se pudo actualizar el control de la votación. Intenta nuevamente.');
    } finally {
      setSavingControl(false);
    }
  };

  const toggleSelection = (candidateId: string) => {
    if (
      hasVotedCurrentRound ||
      activeRound.status !== 'open' ||
      !votingStarted ||
      !voterReceiptId
    ) {
      return;
    }
    setVoteError(null);

    if (activeRound.seats === 1) {
      setSelectedIds((prev) => (prev[0] === candidateId ? [] : [candidateId]));
      return;
    }

    setSelectedIds((prev) => {
      if (prev.includes(candidateId)) {
        return prev.filter((id) => id !== candidateId);
      }
      if (prev.length >= activeRound.seats) {
        setVoteError(
          `Solo puedes seleccionar hasta ${activeRound.seats} personas para este cargo.`
        );
        return prev;
      }
      return [...prev, candidateId];
    });
  };

  const handlePropose = async (nameToPropose: string) => {
    if (!proposalsOpen || activeRound.status !== 'open' || activeRound.isTieBreaker) return;
    if (!isAdmin && !memberProposalsEnabled) {
      setVoteError(
        'Las propuestas desde usuarios de miembros están limitadas por el pastor o secretario.'
      );
      return;
    }
    if (proposalLimitReached) {
      setVoteError(
        `Se alcanzó el límite de ${maxProposals} propuestas configurado para este departamento.`
      );
      return;
    }
    const clean = nameToPropose.trim();
    if (!clean) return;
    const duplicate = candidates.some(
      (c) => c.name.trim().toLowerCase() === clean.toLowerCase()
    );
    if (duplicate) {
      setVoteError('Este candidato ya fue propuesto en la ronda actual.');
      return;
    }

    const token = committeeMember?.id ?? (isAdmin && adminUid ? `pastor_${adminUid}` : null);
    if (!token) return;

    setProposing(true);
    setVoteError(null);
    try {
      await proposeCandidate(session.id, activeRound.id, clean, token);
      setProposalInput('');
      setShowSuggestions(false);
    } catch {
      setVoteError(
        'No se pudo agregar la propuesta. Verifica tu conexión o si las propuestas siguen abiertas.'
      );
    } finally {
      setProposing(false);
    }
  };

  const handleCastVote = async () => {
    if (
      !voterReceiptId ||
      selectedIds.length === 0 ||
      activeRound.status !== 'open' ||
      !votingStarted
    ) {
      return;
    }
    if (selectedIds.length > activeRound.seats) return;

    setSubmittingVote(true);
    setVoteError(null);
    try {
      await castSecretVote(session.id, activeRound.id, voterReceiptId, selectedIds);
      setSelectedIds([]);
    } catch {
      setVoteError(
        'No se pudo registrar el voto. Verifica tu conexión o si ya votaste en esta ronda.'
      );
    } finally {
      setSubmittingVote(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5 pb-24 sm:pb-10">
      {/* Voter Identity Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-blue-900">{activeRound.departmentName}</span>
            <span aria-hidden="true">·</span>
            {isGroupedRound ? (
              <span className="font-mono tabular-nums">
                Agrupado · {totalGroupSeats} integrantes en total
              </span>
            ) : (
              <span>
                Elegir <strong className="font-mono">{activeRound.seats}</strong>{' '}
                {activeRound.seats === 1 ? 'persona' : 'personas'}
              </span>
            )}
            {maxProposals !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700">
                  Propuestas: {candidates.length}/{maxProposals}
                </span>
              </>
            )}
            {activeRound.isTieBreaker && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-amber-800">
                  Desempate (Ronda {activeRound.roundNumber})
                </span>
              </>
            )}
            {activeRound.status === 'open' && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    !votingStarted ? 'text-amber-800' : 'text-emerald-800'
                  }`}
                >
                  {!votingStarted
                    ? proposalsOpen
                      ? 'Fase: Propuestas y observación'
                      : 'Fase: Observación previa al voto'
                    : proposalsOpen
                      ? 'Votación abierta · Propuestas abiertas'
                      : 'Votación abierta · Propuestas cerradas'}
                </span>
              </>
            )}
          </div>
          <span className="text-xs font-medium text-slate-500">
            {committeeMember
              ? `Enlace personal: ${committeeMember.name}`
              : isAdmin
                ? 'Vista de Pastor / Secretario'
                : 'Solo lectura'}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
          {isGroupedRound
            ? isMembersTieBreaker
              ? `Desempate: ${membersTitle}`
              : `Elegir ${leaderTitle}`
            : activeRound.roleTitle}
        </h1>

        {isGroupedRound && (
          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs sm:text-sm text-blue-950 leading-relaxed">
            {isMembersTieBreaker ? (
              <p>
                <strong>{activeRound.carryoverLeaderName || leaderTitle}</strong> ya fue elegido(a)
                para <strong>{leaderTitle}</strong>. Selecciona hasta{' '}
                <strong>{activeRound.seats}</strong>{' '}
                {activeRound.seats === 1 ? 'candidato' : 'candidatos'} para completar{' '}
                <strong>{membersTitle}</strong>.
              </p>
            ) : (
              <p>
                Propongan los nombres para <strong>{activeRound.departmentName}</strong> (
                <span className="font-mono tabular-nums">{totalGroupSeats}</span> puestos totales).
                Cada integrante vota por <strong>1 persona</strong> para{' '}
                <strong>{leaderTitle}</strong>; los demás propuestos quedarán elegidos
                automáticamente como <strong>{membersTitle}</strong> (hasta{' '}
                <span className="font-mono tabular-nums">{Math.max(1, totalGroupSeats - 1)}</span>{' '}
                puestos).
              </p>
            )}
          </div>
        )}

        {/* Participation Counter */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-800 tabular-nums">
              {displayedVotesCast} de {activeRound.expectedVotersCount} han votado
            </span>
            <span className="text-slate-600 tabular-nums">
              {activeRound.status === 'closed'
                ? 'Votación finalizada'
                : activeRound.status === 'paused'
                  ? 'Votación pausada'
                  : `Faltan ${remainingVoters}`}
            </span>
          </div>
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-800 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Admin Quick Round Controls */}
        {isAdmin && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {activeRound.status !== 'closed' ? (
                  <>
                    {!votingStarted ? (
                      <>
                        <button
                          type="button"
                          disabled={savingControl}
                          onClick={() =>
                            handleControlUpdate({ proposalsOpen: false, votingStarted: true })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[40px]"
                        >
                          <Play className="w-4 h-4" />
                          {proposalsOpen && !activeRound.isTieBreaker
                            ? 'Cerrar propuestas e iniciar votación'
                            : 'Iniciar votación'}
                        </button>
                        {!activeRound.isTieBreaker && (
                          <button
                            type="button"
                            disabled={savingControl}
                            onClick={() =>
                              handleControlUpdate({ proposalsOpen: !proposalsOpen })
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50 min-h-[40px]"
                          >
                            {proposalsOpen ? (
                              <>
                                <Lock className="w-4 h-4" /> Cerrar propuestas (observación)
                              </>
                            ) : (
                              <>
                                <Unlock className="w-4 h-4" /> Reabrir propuestas
                              </>
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      !activeRound.isTieBreaker && (
                        <button
                          type="button"
                          disabled={savingControl}
                          onClick={() =>
                            handleControlUpdate({ proposalsOpen: !proposalsOpen })
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50 min-h-[40px]"
                        >
                          {proposalsOpen ? (
                            <>
                              <Lock className="w-4 h-4" /> Cerrar propuestas
                            </>
                          ) : (
                            <>
                              <Unlock className="w-4 h-4" /> Reabrir propuestas
                            </>
                          )}
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setRoundPauseState(session, activeRound, activeRound.status === 'open')
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer min-h-[40px]"
                    >
                      {activeRound.status === 'open' ? (
                        <>
                          <Pause className="w-4 h-4" /> Pausar votación
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> Reanudar
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await syncRoundAndProjector({
                          session,
                          round: activeRound,
                          candidates,
                          ballots,
                          receiptsCount,
                          observations,
                          forceClose: true,
                        });
                        onGoToResults();
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer min-h-[40px]"
                    >
                      <Lock className="w-4 h-4" /> Cerrar votación ahora
                    </button>
                    {!activeRound.isTieBreaker && orderedDepartments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openProposalLimitModal(activeRound.departmentId)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer min-h-[40px]"
                      >
                        <SlidersHorizontal className="w-4 h-4 text-blue-800" />
                        {maxProposals !== null
                          ? `Propuestas: máx. ${maxProposals}`
                          : 'Cantidad de propuestas'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={savingControl}
                      onClick={async () => {
                        setSavingControl(true);
                        setVoteError(null);
                        try {
                          await setSessionLifecycleStatus(
                            session,
                            sessionStatus === 'active' ? 'paused' : 'active',
                            activeRound
                          );
                        } catch {
                          setVoteError('No se pudo actualizar el estado de la sesión.');
                        } finally {
                          setSavingControl(false);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] ${
                        sessionStatus === 'active'
                          ? 'border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                          : 'bg-blue-800 text-white hover:bg-blue-900'
                      }`}
                    >
                      {sessionStatus === 'active' ? (
                        <>
                          <Pause className="w-4 h-4" /> Pausar sesión (otro día)
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />{' '}
                          {sessionStatus === 'paused' ? 'Reanudar sesión' : 'Reabrir sesión'}
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => reopenRound(session, activeRound, candidates)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer min-h-[40px]"
                    >
                      <RotateCcw className="w-4 h-4" /> Reabrir votación
                    </button>
                    <button
                      type="button"
                      onClick={onGoToResults}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 cursor-pointer min-h-[40px]"
                    >
                      Ver resultados
                    </button>
                  </>
                )}
              </div>
              {!activeRound.pastorVoteAllowed && (
                <span className="text-xs text-slate-500">
                  Voto del pastor deshabilitado (comisión impar)
                </span>
              )}
            </div>

            {activeRound.status !== 'closed' && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  Permisos para miembros (Pastor / Secretario)
                </p>
                <div className="flex flex-wrap gap-2">
                  {!activeRound.isTieBreaker && (
                    <button
                      type="button"
                      disabled={savingControl}
                      onClick={() =>
                        handleToggleMemberPermission(
                          'allowMemberProposals',
                          !memberProposalsEnabled
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] ${
                        memberProposalsEnabled
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                          : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                      }`}
                    >
                      {memberProposalsEnabled ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" /> Propuestas miembros: Permitidas
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" /> Propuestas miembros: Solo Pastor/Sec.
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={savingControl}
                    onClick={() =>
                      handleToggleMemberPermission(
                        'allowMemberObservations',
                        !memberObservationsEnabled
                      )
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] ${
                      memberObservationsEnabled
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                    }`}
                  >
                    {memberObservationsEnabled ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" /> Observaciones miembros: Permitidas
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" /> Observaciones miembros: Limitadas
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeRound.status !== 'closed' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleControlUpdate({
                    observation: observationDraft.trim() ? observationDraft.trim() : null,
                  });
                }}
                className="pt-2 border-t border-slate-100 space-y-2"
              >
                <label
                  htmlFor="round-observation"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <MessageSquareText className="w-3.5 h-3.5 text-blue-800" />
                  Observación para la comisión (visible en Votar y Proyector)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="round-observation"
                    type="text"
                    maxLength={500}
                    value={observationDraft}
                    onChange={(e) => setObservationDraft(e.target.value)}
                    placeholder="Ej. Evaluar disponibilidad y servicio previo antes de emitir el voto..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[42px]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingControl}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-50 min-h-[42px] whitespace-nowrap"
                    >
                      {savingControl ? 'Guardando...' : 'Guardar observación'}
                    </button>
                    {activeRound.observation && (
                      <button
                        type="button"
                        disabled={savingControl}
                        onClick={() => {
                          setObservationDraft('');
                          void handleControlUpdate({ observation: null });
                        }}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer disabled:opacity-50 min-h-[42px]"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Pastor Observation Banner (Visible to all members) */}
      {activeRound.observation && activeRound.observation.trim() && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-amber-950">
          <MessageSquareText className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-xs uppercase tracking-wide text-amber-900">
              Observación del pastor / comisión
            </p>
            <p className="mt-0.5 leading-relaxed">{activeRound.observation}</p>
          </div>
        </div>
      )}

      {/* Special Pastor Secret Vote Notice when enabled */}
      {isAdmin &&
        activeRound.pastorVoteAllowed &&
        activeRound.status === 'open' &&
        votingStarted &&
        !hasVotedCurrentRound && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 text-sm text-blue-950">
            <Shield className="w-5 h-5 text-blue-800 shrink-0" />
            <p>
              <strong>Opción especial de voto del pastor habilitada:</strong> Tu voto tiene el mismo
              valor que el de los demás integrantes (1 voto ordinario) y es completamente secreto.
            </p>
          </div>
        )}

      {/* Propose Candidate Box */}
      {activeRound.status === 'open' &&
        !activeRound.isTieBreaker &&
        proposalsOpen &&
        (canCommitteeVote || isAdmin) && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-800" />
                  Proponer candidato(a)
                  {maxProposals !== null && (
                    <span className="text-xs font-mono font-semibold text-blue-900 tabular-nums">
                      ({candidates.length} de {maxProposals})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {!isAdmin && !memberProposalsEnabled
                    ? 'El pastor o secretario limitó temporalmente las propuestas desde cuentas de miembros.'
                    : isAdmin && !memberProposalsEnabled
                      ? 'Propuestas limitadas a Pastor y Secretario · Los miembros no pueden proponer desde su enlace.'
                      : maxProposals !== null
                        ? `Se permiten hasta ${maxProposals} ${
                            maxProposals === 1 ? 'propuesta' : 'propuestas'
                          } para este departamento.`
                        : 'Elige un nombre de la lista de miembros aptos o escribe tu propuesta manualmente.'}
                </p>
              </div>
              {(isAdmin || memberProposalsEnabled) &&
                !proposalLimitReached &&
                eligibleMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions((prev) => !prev)}
                    className="text-xs font-semibold text-blue-800 hover:underline cursor-pointer"
                  >
                    {showSuggestions
                      ? 'Ocultar lista'
                      : `Ver lista de miembros (${activeEligible.length})`}
                  </button>
                )}
            </div>

            {!isAdmin && !memberProposalsEnabled ? (
              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs sm:text-sm text-slate-700 flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                <span>
                  Las propuestas desde los usuarios de miembros están limitadas en este momento.
                  Solo el pastor o secretario puede registrar propuestas.
                </span>
              </div>
            ) : proposalLimitReached ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>
                  Se alcanzó el límite de <strong>{maxProposals}</strong>{' '}
                  {maxProposals === 1 ? 'propuesta' : 'propuestas'} para este departamento.
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openProposalLimitModal(activeRound.departmentId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-950 text-xs font-semibold hover:bg-amber-100 cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Cambiar cantidad
                  </button>
                )}
              </div>
            ) : (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handlePropose(proposalInput);
                  }}
                  className="relative flex flex-col sm:flex-row gap-2.5"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={140}
                      value={proposalInput}
                      onFocus={() => setShowSuggestions(true)}
                      onChange={(e) => {
                        setProposalInput(e.target.value);
                        setShowSuggestions(true);
                      }}
                      placeholder="Busca en la lista de miembros o escribe un nombre..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[48px]"
                    />
                    {showSuggestions && activeEligible.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                        {activeEligible.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handlePropose(m.name)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 flex items-center justify-between cursor-pointer min-h-[44px]"
                          >
                            <span className="font-medium text-slate-900">{m.name}</span>
                            <span className="text-xs text-blue-800 font-semibold">Proponer</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={proposing || !proposalInput.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-50 min-h-[48px] whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    {proposing ? 'Agregando...' : 'Agregar propuesta'}
                  </button>
                </form>
                {showSuggestions && activeEligible.length === 0 && proposalInput.trim() && (
                  <p className="text-xs text-slate-600">
                    No coincide con un miembro pendiente de la lista. Presiona{' '}
                    <strong>Agregar propuesta</strong> para proponer a &ldquo;{proposalInput.trim()}
                    &rdquo;.
                  </p>
                )}
              </>
            )}
          </div>
        )}

      {/* Secret Ballot Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Candidatos Propuestos ({candidates.length})
            </h2>
            <p className="text-xs text-slate-600">
              {isGroupedRound && !isMembersTieBreaker
                ? `Selecciona 1 candidato para ${leaderTitle} (voto secreto).`
                : activeRound.seats === 1
                  ? 'Selecciona 1 candidato para emitir tu voto secreto.'
                  : `Puedes seleccionar hasta ${activeRound.seats} candidatos (${selectedIds.length} seleccionados).`}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Lock className="w-3.5 h-3.5" /> Voto 100% secreto
          </span>
        </div>

        {voteError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
            {voteError}
          </div>
        )}

        {activeRound.status === 'open' && !votingStarted && (
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-950 font-medium">
            {proposalsOpen
              ? 'Fase de propuestas y observación: propongan y revisen los candidatos. El pastor cerrará las propuestas y dará inicio a la votación cuando corresponda.'
              : 'Propuestas cerradas · Fase de observación previa al voto. La votación se habilitará cuando el pastor dé inicio.'}
          </div>
        )}

        {activeRound.status === 'paused' && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-950 font-medium">
            La votación está pausada temporalmente por el pastor. Espera a que se reanude para
            votar.
          </div>
        )}

        {activeRound.status === 'closed' && (
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-800 flex items-center justify-between gap-3">
            <span className="font-semibold">
              {isAdmin
                ? 'Esta ronda ha finalizado. Los resultados están listos para el pastor.'
                : 'Esta votación ha finalizado. Puedes consultar los resultados en la pestaña Resultados.'}
            </span>
            <button
              type="button"
              onClick={onGoToResults}
              className="px-4 py-2 rounded-xl bg-blue-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Ver Resultados
            </button>
          </div>
        )}

        {hasVotedCurrentRound && (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-950">
            <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
            <div>
              <p className="font-bold text-base">Tu voto secreto ha sido registrado</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Nadie puede ver tu elección y tu enlace quedó bloqueado para evitar votos
                duplicados en este cargo.
              </p>
            </div>
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Aún no se han propuesto candidatos para este cargo.
          </div>
        ) : (
          <div className="space-y-2.5">
            {candidates.map((cand) => {
              const isSelected = selectedIds.includes(cand.id);
              const disabled =
                hasVotedCurrentRound ||
                activeRound.status !== 'open' ||
                !votingStarted ||
                !voterReceiptId;

              return (
                <div
                  key={cand.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-1 transition-colors ${
                    isSelected
                      ? 'border-blue-800 bg-blue-50/70'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleSelection(cand.id)}
                    className="flex-1 flex items-center gap-3.5 px-3.5 py-3 text-left cursor-pointer disabled:cursor-default min-h-[56px]"
                  >
                    <div
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-800 border-blue-800 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <span className="font-bold text-base text-slate-900">{cand.name}</span>
                  </button>

                  {isAdmin && activeRound.status === 'open' && receiptsCount === 0 && (
                    <button
                      type="button"
                      aria-label="Quitar candidato"
                      onClick={() => removeCandidate(session.id, activeRound.id, cand.id)}
                      className="p-3 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer mr-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Submit Ballot Button */}
        {voterReceiptId &&
          !hasVotedCurrentRound &&
          activeRound.status === 'open' &&
          votingStarted &&
          candidates.length > 0 && (
            <div className="pt-3">
              <button
                type="button"
                disabled={submittingVote || selectedIds.length === 0}
                onClick={handleCastVote}
                className="w-full py-4 px-6 rounded-xl bg-blue-800 text-white font-bold text-base hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-50 min-h-[54px]"
              >
                {submittingVote
                  ? 'Registrando voto secreto...'
                  : `Emitir Voto Secreto (${selectedIds.length} ${
                      selectedIds.length === 1 ? 'seleccionado' : 'seleccionados'
                    })`}
              </button>
            </div>
          )}
      </div>

      {/* Member Observations Box (Directly after Proposed Candidates; locked when closed until a new vote starts) */}
      {(canCommitteeVote || isAdmin || Boolean(activeRound.observationsRevealed)) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquareText className="w-4 h-4 text-blue-800" />
                Observaciones a las propuestas de nombres
                {isAdmin && (
                  <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                    ({observations.length})
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {activeRound.observationsRevealed
                  ? 'Observaciones visibles para toda la comisión.'
                  : 'Si lo deseas, puedes enviar una observación privada sobre los nombres propuestos; solo será visible para todos cuando el pastor las revele.'}
              </p>
            </div>

            {isAdmin && (
              <button
                type="button"
                disabled={togglingReveal}
                onClick={async () => {
                  setTogglingReveal(true);
                  setVoteError(null);
                  try {
                    await setObservationsRevealed(
                      session,
                      activeRound,
                      observations,
                      !activeRound.observationsRevealed
                    );
                  } catch {
                    setVoteError(
                      'No se pudo actualizar la visibilidad de las observaciones. Intenta nuevamente.'
                    );
                  } finally {
                    setTogglingReveal(false);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 min-h-[40px] whitespace-nowrap shrink-0 ${
                  activeRound.observationsRevealed
                    ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    : 'bg-blue-800 text-white hover:bg-blue-900'
                }`}
              >
                {activeRound.observationsRevealed ? (
                  <>
                    <EyeOff className="w-4 h-4" /> Ocultar observaciones
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" /> Revelar observaciones
                  </>
                )}
              </button>
            )}
          </div>

          {/* Observation Submission Box: ONLY enabled while activeRound.status === 'open' */}
          {activeRound.status === 'open' ? (
            !isAdmin && canCommitteeVote && !memberObservationsEnabled ? (
              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                <span>
                  El pastor o secretario ha limitado temporalmente el envío de observaciones por
                  parte de los miembros.
                </span>
              </div>
            ) : (
              (canCommitteeVote || isAdmin) && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!isAdmin && !memberObservationsEnabled) return;
                    const cleanText = memberObsInput.trim();
                    if (!cleanText) return;
                    const authorToken = committeeMember?.id
                      ? committeeMember.id
                      : isAdmin && adminUid
                        ? `pastor_${adminUid}`
                        : null;
                    if (!authorToken) return;

                    const authorRole: 'member' | 'pastor' = committeeMember?.id
                      ? 'member'
                      : 'pastor';
                    const candidateName = memberObsCandidate.trim() || null;

                    setSubmittingObs(true);
                    setVoteError(null);
                    try {
                      const wasRevealed = await submitRoundObservation({
                        sessionId: session.id,
                        roundId: activeRound.id,
                        authorToken,
                        authorRole,
                        candidateName,
                        text: cleanText,
                        revealed: Boolean(activeRound.observationsRevealed),
                      });
                      if (!wasRevealed && !isAdmin) {
                        setLocalSentObs((prev) => [
                          ...prev,
                          { roundId: activeRound.id, candidateName, text: cleanText },
                        ]);
                      }
                      setMemberObsInput('');
                      setMemberObsCandidate('');
                    } catch {
                      setVoteError(
                        'No se pudo enviar la observación. Verifica tu conexión o si la votación sigue abierta.'
                      );
                    } finally {
                      setSubmittingObs(false);
                    }
                  }}
                  className="space-y-3"
                >
                  {isAdmin && !memberObservationsEnabled && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      Observaciones de miembros limitadas · Como pastor o secretario puedes seguir
                      enviando observaciones o volver a habilitarlas arriba.
                    </p>
                  )}
                {candidates.length > 0 ? (
                  <div>
                    <label
                      htmlFor="obs-candidate-select"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Propuesta de nombre (opcional)
                    </label>
                    <select
                      id="obs-candidate-select"
                      value={memberObsCandidate}
                      onChange={(e) => setMemberObsCandidate(e.target.value)}
                      className="w-full sm:w-80 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                    >
                      <option value="">Observación general de este cargo</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.name}>
                          Sobre: {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Cuando se propongan nombres podrás seleccionar uno específico o enviar una
                    observación general para este cargo.
                  </p>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="member-observation-box"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Tu observación (opcional)
                    </label>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {memberObsInput.length}/500
                    </span>
                  </div>
                  <textarea
                    id="member-observation-box"
                    rows={3}
                    maxLength={500}
                    value={memberObsInput}
                    onChange={(e) => setMemberObsInput(e.target.value)}
                    placeholder="Escribe aquí tu observación sobre las propuestas de nombres para este cargo..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 resize-y min-h-[84px]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingObs || !memberObsInput.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer disabled:opacity-50 min-h-[44px]"
                  >
                    <Send className="w-4 h-4" />
                    {submittingObs ? 'Enviando...' : 'Enviar observación'}
                  </button>
                </div>
              </form>
              )
            )
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-slate-600 shrink-0" />
              <span>
                {activeRound.status === 'closed'
                  ? 'La votación de este cargo se ha cerrado. No se pueden enviar más observaciones hasta que se inicie una nueva votación de otro cargo o departamento.'
                  : 'La votación está pausada temporalmente. El envío de observaciones se habilitará al reanudar.'}
              </span>
            </div>
          )}

          {/* Member's own pending confirmation before Pastor reveals */}
          {!isAdmin &&
            !activeRound.observationsRevealed &&
            localSentObs.some((item) => item.roundId === activeRound.id) && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Tus observaciones enviadas (ocultas hasta que el pastor las revele):
                </p>
                <ul className="space-y-1.5">
                  {localSentObs
                    .filter((item) => item.roundId === activeRound.id)
                    .map((item, idx) => (
                      <li key={idx} className="text-xs text-slate-700">
                        {item.candidateName && (
                          <strong className="text-blue-900">[{item.candidateName}] </strong>
                        )}
                        {item.text}
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {/* Observations List: Pastor always sees all; Members ONLY see when observationsRevealed is true */}
          {isAdmin ? (
            observations.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no hay observaciones enviadas por los integrantes en esta ronda.
              </p>
            ) : (
              <div className="space-y-2">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 ${
                      obs.revealed
                        ? 'bg-blue-50/50 border-blue-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {obs.authorRole === 'pastor'
                            ? 'Pastor / Secretario'
                            : 'Miembro de comisión'}
                        </span>
                        {obs.candidateName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-blue-900">
                              Sobre: {obs.candidateName}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            obs.revealed
                              ? 'font-semibold text-emerald-800'
                              : 'font-semibold text-amber-800'
                          }
                        >
                          {obs.revealed ? 'Visible a todos' : 'Oculta'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-900 leading-relaxed">{obs.text}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Eliminar observación"
                      onClick={() => deleteRoundObservation(session.id, activeRound.id, obs.id)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : activeRound.observationsRevealed ? (
            observations.length === 0 ? (
              <p className="text-xs text-slate-500">
                El pastor habilitó las observaciones, pero aún no se han registrado comentarios.
              </p>
            ) : (
              <div className="space-y-2">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">
                        {obs.authorRole === 'pastor'
                          ? 'Pastor / Secretario'
                          : 'Miembro de comisión'}
                      </span>
                      {obs.candidateName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-blue-900">
                            Sobre: {obs.candidateName}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-900 leading-relaxed">{obs.text}</p>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-amber-800 shrink-0" />
              <span>
                Las observaciones enviadas permanecerán ocultas hasta que el pastor presione{' '}
                <strong>Revelar observaciones</strong>.
              </span>
            </div>
          )}
        </div>
      )}
      {proposalLimitModal}
    </div>
  );
};
