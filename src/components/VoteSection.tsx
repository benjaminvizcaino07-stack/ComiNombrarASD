import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  castSecretVote,
  proposeCandidate,
  removeCandidate,
  reopenRound,
  setRoundPauseState,
  syncRoundAndProjector,
} from '../services/nominationService';
import {
  CandidateData,
  CommitteeMember,
  EligibleMember,
  RoundData,
  SecretBallot,
  SessionData,
} from '../types';

interface VoteSectionProps {
  session: SessionData | null;
  isAdmin: boolean;
  adminUid: string | null;
  committeeMember: CommitteeMember | null;
  activeRound: RoundData | null;
  candidates: CandidateData[];
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
  activeRound,
  candidates,
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
  const [voteError, setVoteError] = useState<string | null>(null);

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

  if (!activeRound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
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
        </div>
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

  const toggleSelection = (candidateId: string) => {
    if (hasVotedCurrentRound || activeRound.status !== 'open' || !voterReceiptId) return;
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
        'No se pudo agregar la propuesta. Verifica tu conexión o si la votación sigue abierta.'
      );
    } finally {
      setProposing(false);
    }
  };

  const handleCastVote = async () => {
    if (!voterReceiptId || selectedIds.length === 0 || activeRound.status !== 'open') return;
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
            {activeRound.isTieBreaker && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-amber-800">
                  Desempate (Ronda {activeRound.roundNumber})
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
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {activeRound.status !== 'closed' ? (
                <>
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
                        forceClose: true,
                      });
                      onGoToResults();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer min-h-[40px]"
                  >
                    <Lock className="w-4 h-4" /> Cerrar votación ahora
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
        )}
      </div>

      {/* Special Pastor Secret Vote Notice when enabled */}
      {isAdmin && activeRound.pastorVoteAllowed && activeRound.status === 'open' && !hasVotedCurrentRound && (
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
        (canCommitteeVote || isAdmin) && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-blue-800" />
                  Proponer candidato(a)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Elige un nombre de la lista de miembros aptos o escribe tu propuesta manualmente.
                </p>
              </div>
              {eligibleMembers.length > 0 && (
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
                hasVotedCurrentRound || activeRound.status !== 'open' || !voterReceiptId;

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
    </div>
  );
};
