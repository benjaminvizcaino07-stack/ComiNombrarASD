import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Monitor,
  Pause,
  Pencil,
  Play,
  Printer,
  RotateCcw,
  Swords,
  X,
} from 'lucide-react';
import {
  isTestPracticeRound,
  reopenRound,
  setRoundPauseState,
  startRoundForDepartment,
  syncRoundAndProjector,
  updateSessionSettings,
} from '../services/nominationService';
import {
  CandidateData,
  DepartmentPosition,
  RoundData,
  SecretBallot,
  SessionData,
} from '../types';
import {
  exportFinalListExcel,
  exportFinalListPDF,
  formatMeetingDate,
  formatMeetingTime,
  groupDepartmentsForReport,
  ReportMetadata,
} from '../utils/exportReports';
import { evaluateGroupedRoundTallies, evaluateRoundTallies } from '../utils/tally';

interface ResultsSectionProps {
  session: SessionData | null;
  isAdmin: boolean;
  departments: DepartmentPosition[];
  activeRound: RoundData | null;
  activeCandidates: CandidateData[];
  allRounds: RoundData[];
  ballots: SecretBallot[];
  receiptsCount: number;
  onNavigateToVote: () => void;
}

export const ResultsSection: React.FC<ResultsSectionProps> = ({
  session,
  isAdmin,
  departments,
  activeRound,
  activeCandidates,
  allRounds,
  ballots,
  receiptsCount,
  onNavigateToVote,
}) => {
  const [copiedProjector, setCopiedProjector] = useState(false);
  const [launchingTieBreaker, setLaunchingTieBreaker] = useState(false);

  const [reportModalMode, setReportModalMode] = useState<'pdf' | 'excel' | 'edit' | null>(null);
  const [formChurchName, setFormChurchName] = useState('');
  const [formPastorName, setFormPastorName] = useState('');
  const [formSecretaryName, setFormSecretaryName] = useState('');
  const [formMeetingDate, setFormMeetingDate] = useState('');
  const [formMeetingTime, setFormMeetingTime] = useState('');
  const [savingReportMeta, setSavingReportMeta] = useState(false);

  const groupedFinalList = useMemo(
    () => groupDepartmentsForReport(departments),
    [departments]
  );

  const openReportModal = (mode: 'pdf' | 'excel' | 'edit') => {
    if (!session) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const currentHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    setFormChurchName(session.churchName);
    setFormPastorName(session.pastorName ?? '');
    setFormSecretaryName(session.secretaryName ?? '');
    setFormMeetingDate(session.meetingDate || todayIso);
    setFormMeetingTime(session.meetingTime || currentHm);
    setReportModalMode(mode);
  };

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-2">
          <Monitor className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Sin resultados disponibles</h2>
          <p className="text-sm text-slate-600">
            Inicia o abre una comisión para visualizar la proyección y la lista final de
            nombramientos.
          </p>
        </div>
      </div>
    );
  }

  const projectorUrl = `${window.location.origin}/?view=projector&s=${encodeURIComponent(
    session.id
  )}&k=${encodeURIComponent(session.projectorKey)}`;

  const activeDepartment = activeRound
    ? departments.find((d) => d.id === activeRound.departmentId) ?? null
    : null;

  const isGroupedRound = Boolean(activeRound && activeRound.votingMode === 'grouped');

  const groupedEval =
    activeRound && isAdmin && isGroupedRound
      ? evaluateGroupedRoundTallies({
          candidates: activeCandidates,
          ballots,
          totalGroupSeats: activeRound.totalGroupSeats ?? activeRound.seats,
          groupedStage: activeRound.groupedStage ?? 'leader',
          carryoverLeaderName: activeRound.carryoverLeaderName ?? null,
          carryoverElectedNames: activeRound.carryoverElectedNames ?? [],
        })
      : null;

  const liveEval =
    groupedEval ??
    (activeRound && isAdmin
      ? evaluateRoundTallies(activeCandidates, ballots, activeRound.seats)
      : null);

  const sortedCandidates = [...activeCandidates].sort((a, b) => {
    const countA = liveEval ? (liveEval.countsById[a.id] ?? a.voteCount) : a.voteCount;
    const countB = liveEval ? (liveEval.countsById[b.id] ?? b.voteCount) : b.voteCount;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name, 'es');
  });

  const maxVotes = Math.max(
    1,
    ...sortedCandidates.map((c) =>
      liveEval ? (liveEval.countsById[c.id] ?? c.voteCount) : c.voteCount
    )
  );

  const isTestRound = isTestPracticeRound(activeRound);

  const hasTie = Boolean(
    activeRound &&
      !isTestRound &&
      activeRound.status === 'closed' &&
      activeRound.tiedCandidateIds.length > 0
  );

  const handleLaunchTieBreaker = async () => {
    if (!activeRound || !activeDepartment) return;
    const tiedCands = activeCandidates.filter((c) =>
      activeRound.tiedCandidateIds.includes(c.id)
    );
    if (tiedCands.length < 2) return;

    const roundsForDept = allRounds.filter((r) => r.departmentId === activeDepartment.id);
    setLaunchingTieBreaker(true);
    try {
      if (isGroupedRound) {
        const evalRes =
          groupedEval ??
          evaluateGroupedRoundTallies({
            candidates: activeCandidates,
            ballots,
            totalGroupSeats: activeRound.totalGroupSeats ?? activeRound.seats,
            groupedStage: activeRound.groupedStage ?? 'leader',
            carryoverLeaderName: activeRound.carryoverLeaderName ?? null,
            carryoverElectedNames: activeRound.carryoverElectedNames ?? [],
          });

        if (evalRes.tieStage === 'leader') {
          await startRoundForDepartment({
            session,
            dept: activeDepartment,
            roundNumber: roundsForDept.length + 1,
            seatsForRound: 1,
            carryoverElectedNames: evalRes.guaranteedOtherNamesForTie,
            carryoverLeaderName: null,
            groupedStage: 'leader',
            isTieBreaker: true,
            seedCandidates: tiedCands.map((c) => ({ name: c.name })),
          });
        } else {
          await startRoundForDepartment({
            session,
            dept: activeDepartment,
            roundNumber: roundsForDept.length + 1,
            seatsForRound: evalRes.remainingSeats,
            carryoverElectedNames: evalRes.memberNames,
            carryoverLeaderName:
              evalRes.leaderName ?? activeRound.carryoverLeaderName ?? null,
            groupedStage: 'members_tiebreaker',
            isTieBreaker: true,
            seedCandidates: tiedCands.map((c) => ({ name: c.name })),
          });
        }
      } else {
        const alreadyElectedThisRound = activeCandidates
          .filter((c) => activeRound.electedCandidateIds.includes(c.id))
          .map((c) => c.name);
        const carryover = Array.from(
          new Set([...activeRound.carryoverElectedNames, ...alreadyElectedThisRound])
        );
        const remainingSeats = Math.max(1, activeRound.seats - alreadyElectedThisRound.length);

        await startRoundForDepartment({
          session,
          dept: activeDepartment,
          roundNumber: roundsForDept.length + 1,
          seatsForRound: remainingSeats,
          carryoverElectedNames: carryover,
          isTieBreaker: true,
          seedCandidates: tiedCands.map((c) => ({ name: c.name })),
        });
      }
      onNavigateToVote();
    } finally {
      setLaunchingTieBreaker(false);
    }
  };

  const canMemberSeeResults = isAdmin || session.showResultsOnProjector;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 sm:pb-10">
      {/* PROYECTAR RESULTADOS BAR (Admin only) / Clean Header (Committee) */}
      {isAdmin ? (
        <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900">
              Proyección y Lista Final de Nombramientos
            </h1>
            <p className="text-sm text-slate-600">
              Abre la pantalla independiente para el proyector y decide cuándo mostrar los
              resultados a la comisión.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                updateSessionSettings(session.id, {
                  showResultsOnProjector: !session.showResultsOnProjector,
                })
              }
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer min-h-[44px] transition-colors ${
                session.showResultsOnProjector
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {session.showResultsOnProjector ? (
                <>
                  <Eye className="w-4 h-4" /> Resultados visibles en proyector
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" /> Mostrar resultados en proyector
                </>
              )}
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(projectorUrl);
                  } else {
                    throw new Error('Clipboard unavailable');
                  }
                } catch {
                  const ta = document.createElement('textarea');
                  ta.value = projectorUrl;
                  ta.style.position = 'fixed';
                  ta.style.opacity = '0';
                  document.body.appendChild(ta);
                  ta.focus();
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                }
                setCopiedProjector(true);
                setTimeout(() => setCopiedProjector(false), 2200);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
            >
              {copiedProjector ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700" /> Enlace copiado
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copiar enlace proyector
                </>
              )}
            </button>

            <a
              href={projectorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-bold hover:bg-blue-900 transition-colors min-h-[44px] whitespace-nowrap"
            >
              <Monitor className="w-4 h-4" />
              PROYECTAR RESULTADOS
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
          <p className="text-xs font-medium text-slate-500">
            {session.churchName} · Período {session.year}
          </p>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">
            Resultados de la Votación
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Consulta los resultados autorizados y la lista de nombramientos elegidos por la
            comisión.
          </p>
        </div>
      )}

      {/* ACTIVE / RECENT ROUND TALLY & TIE-BREAKER */}
      {activeRound && (
        <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-blue-900">{activeRound.departmentName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {isGroupedRound
                    ? `Agrupado · ${activeRound.totalGroupSeats ?? activeRound.seats} integrantes totales`
                    : `${activeRound.seats} ${activeRound.seats === 1 ? 'puesto' : 'puestos'}`}
                </span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    activeRound.status === 'closed'
                      ? 'font-bold text-emerald-700'
                      : activeRound.status === 'paused'
                        ? 'font-bold text-amber-700'
                        : 'font-bold text-blue-700'
                  }
                >
                  {activeRound.status === 'closed'
                    ? 'Votación Finalizada'
                    : activeRound.status === 'paused'
                      ? 'Votación Pausada'
                      : 'Votación Abierta'}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">{activeRound.roleTitle}</h2>
            </div>

            <div className="text-sm font-semibold text-slate-700 tabular-nums">
              Votos emitidos: {isAdmin ? receiptsCount : activeRound.votesCastCount} /{' '}
              {activeRound.expectedVotersCount}
            </div>
          </div>

          {isTestRound && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-950">
              <strong>Votación de prueba (ensayo técnico):</strong> Esta ronda sirve únicamente para
              verificar que todos los votantes y enlaces funcionen correctamente. No afecta ningún
              departamento ni la lista oficial.
            </div>
          )}

          {isGroupedRound &&
            activeRound.status === 'closed' &&
            canMemberSeeResults &&
            activeDepartment &&
            (activeDepartment.leaderElectedName ||
              (activeDepartment.memberElectedNames &&
                activeDepartment.memberElectedNames.length > 0)) && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-950 space-y-1">
                {activeDepartment.leaderElectedName && (
                  <p>
                    <strong>{activeRound.leaderRoleTitle || 'Cargo Principal'}:</strong>{' '}
                    {activeDepartment.leaderElectedName}
                  </p>
                )}
                {activeDepartment.memberElectedNames &&
                  activeDepartment.memberElectedNames.length > 0 && (
                    <p>
                      <strong>{activeRound.membersRoleTitle || 'Integrantes'}:</strong>{' '}
                      {activeDepartment.memberElectedNames.join(', ')}
                    </p>
                  )}
              </div>
            )}

          {/* Tie Warning & Tie-Breaker Action */}
          {hasTie && canMemberSeeResults && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-950 text-base">
                    Advertencia de Empate en el último puesto disponible
                  </h3>
                  <p className="text-sm text-amber-900 mt-0.5">
                    Candidatos empatados:{' '}
                    <strong>
                      {activeCandidates
                        .filter((c) => activeRound.tiedCandidateIds.includes(c.id))
                        .map((c) => c.name)
                        .join(', ')}
                    </strong>
                    . El sistema no seleccionó automáticamente a ninguno para el puesto empatado.
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={launchingTieBreaker}
                  onClick={handleLaunchTieBreaker}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-700 text-white text-sm font-bold hover:bg-amber-800 cursor-pointer whitespace-nowrap min-h-[46px]"
                >
                  <Swords className="w-4 h-4" />
                  {launchingTieBreaker
                    ? 'Iniciando desempate...'
                    : 'Iniciar votación de desempate'}
                </button>
              )}
            </div>
          )}

          {/* Results Bars */}
          {!canMemberSeeResults ? (
            <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <EyeOff className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-semibold text-slate-900">
                Resultados reservados hasta autorización del pastor
              </p>
              <p className="text-sm text-slate-600">
                La votación es secreta. Cuando el pastor active la visualización, los totales
                aparecerán aquí y en la pantalla de proyección.
              </p>
            </div>
          ) : sortedCandidates.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No hay candidatos propuestos en esta ronda.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedCandidates.map((cand) => {
                const votes = liveEval
                  ? (liveEval.countsById[cand.id] ?? cand.voteCount)
                  : cand.voteCount;
                const widthPct = Math.round((votes / maxVotes) * 100);
                const isElected =
                  !isTestRound &&
                  activeRound.status === 'closed' &&
                  activeRound.electedCandidateIds.includes(cand.id);
                const isTied =
                  !isTestRound &&
                  activeRound.status === 'closed' &&
                  activeRound.tiedCandidateIds.includes(cand.id);
                let electedBadgeText = '· Elegido(a)';
                if (isElected && isGroupedRound) {
                  const isLeaderWinner =
                    groupedEval?.leaderId === cand.id ||
                    activeDepartment?.leaderElectedName === cand.name ||
                    activeRound.carryoverLeaderName === cand.name;
                  electedBadgeText = isLeaderWinner
                    ? `· Elegido(a): ${activeRound.leaderRoleTitle || 'Cargo Principal'}`
                    : `· Elegido(a): ${activeRound.membersRoleTitle || 'Integrante'}`;
                }

                return (
                  <div
                    key={cand.id}
                    className={`p-4 rounded-xl border ${
                      isElected
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : isTied
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isElected && <Award className="w-5 h-5 text-emerald-700 shrink-0" />}
                        {isTied && <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />}
                        <span className="font-bold text-slate-900 truncate">{cand.name}</span>
                        {isElected && (
                          <span className="text-xs font-bold text-emerald-800">
                            {electedBadgeText}
                          </span>
                        )}
                        {isTied && (
                          <span className="text-xs font-bold text-amber-800">· Empate</span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-lg text-slate-900 tabular-nums shrink-0">
                        {votes} {votes === 1 ? 'voto' : 'votos'}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isElected
                            ? 'bg-emerald-600'
                            : isTied
                              ? 'bg-amber-600'
                              : 'bg-blue-800'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Admin Controls */}
          {isAdmin && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2.5">
              {activeRound.status !== 'closed' ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setRoundPauseState(session, activeRound, activeRound.status === 'open')
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                  >
                    {activeRound.status === 'open' ? (
                      <>
                        <Pause className="w-4 h-4" /> Pausar votación
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" /> Reanudar votación
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      syncRoundAndProjector({
                        session,
                        round: activeRound,
                        candidates: activeCandidates,
                        ballots,
                        receiptsCount,
                        forceClose: true,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer min-h-[44px]"
                  >
                    <Lock className="w-4 h-4" /> Cerrar votación ahora
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => reopenRound(session, activeRound, activeCandidates)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  <RotateCcw className="w-4 h-4" /> Reabrir votación
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* FINAL LIST OF NOMINATIONS */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden print:border-0 print:rounded-none">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 print:px-0 print:pt-0">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/Icono_azul_de_nombramientos_SDA_0e21f0e4.png"
              alt="Logo NOMBRAMIENTOS SDA"
              referrerPolicy="no-referrer"
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-contain shrink-0"
            />
            <div>
              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide hidden print:block">
                NOMBRAMIENTOS SDA · Iglesia Adventista del Séptimo Día
              </p>
              <p className="text-xs font-medium text-slate-500">
                {session.churchName} · Período {session.year}
              </p>
              <h2 className="text-xl font-bold text-slate-900">
                Lista Final de Nombramientos por Departamento
              </h2>
            </div>
          </div>

          {isAdmin && (
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openReportModal('pdf')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                Descargar PDF
              </button>
              <button
                type="button"
                onClick={() => openReportModal('excel')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 cursor-pointer min-h-[44px]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Descargar Excel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          )}
        </div>

        {/* Institutional Acta Metadata Strip (Visible on Screen & Print) */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:px-0 print:bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-xs text-slate-700 flex-1">
            <div>
              <span className="font-semibold text-slate-500 block">Pastor</span>
              <span className="font-bold text-slate-900 text-sm">
                {session.pastorName?.trim() || 'No especificado'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Secretaria(o)</span>
              <span className="font-bold text-slate-900 text-sm">
                {session.secretaryName?.trim() || 'No especificado'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Fecha de reunión</span>
              <span className="font-bold text-slate-900 text-sm">
                {formatMeetingDate(session.meetingDate) || 'Por definir'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 block">Hora</span>
              <span className="font-bold text-slate-900 text-sm">
                {formatMeetingTime(session.meetingTime) || 'Por definir'}
              </span>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => openReportModal('edit')}
              className="no-print inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 cursor-pointer min-h-[38px] self-start lg:self-center whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              Datos del acta
            </button>
          )}
        </div>

        {groupedFinalList.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No hay departamentos configurados aún en esta comisión.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {groupedFinalList.map((group) => (
              <div key={group.department} className="p-5 sm:px-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-blue-950">{group.department}</h3>
                  <span className="text-xs font-mono text-slate-600 tabular-nums">
                    Integrantes asignados: <strong>{group.totalAssigned}</strong> /{' '}
                    {group.totalSeats}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Cargo</th>
                        <th className="py-2 pr-4 font-semibold">Personas Elegidas</th>
                        <th className="py-2 text-right font-semibold">Asignados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2.5 pr-4 font-medium text-slate-900">
                            {row.roleTitle}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-700">
                            {row.electedNames.length > 0 ? (
                              <span className="font-semibold text-emerald-900">
                                {row.electedNames.join(', ')}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {row.status === 'tie' ? 'Empate pendiente' : 'Pendiente'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {row.electedNames.length} / {row.seats}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Print Signatures Footer */}
        <div className="hidden print:grid print:grid-cols-2 print:gap-12 print:pt-14 print:pb-4 print:px-4">
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900 min-h-[20px]">
              {session.pastorName?.trim() || ''}
            </p>
            <div className="border-t border-slate-400 pt-1.5 text-xs text-slate-600">
              Pastor / Presidente de Comisión
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-slate-900 min-h-[20px]">
              {session.secretaryName?.trim() || ''}
            </p>
            <div className="border-t border-slate-400 pt-1.5 text-xs text-slate-600">
              Secretaria(o) de Comisión
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: DATOS PARA DESCARGAR / EDITAR HOJA DE RESULTADOS */}
      {reportModalMode && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {reportModalMode === 'pdf'
                    ? 'Datos de la Hoja de Resultados (PDF)'
                    : reportModalMode === 'excel'
                      ? 'Datos de la Hoja de Resultados (Excel)'
                      : 'Datos del Acta y Hoja de Resultados'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Completa o verifica estos datos para integrarlos en la hoja oficial de resultados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalMode(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingReportMeta(true);
                try {
                  const cleanChurch = formChurchName.trim() || session.churchName;
                  const cleanPastor = formPastorName.trim();
                  const cleanSecretary = formSecretaryName.trim();
                  const cleanDate = formMeetingDate.trim();
                  const cleanTime = formMeetingTime.trim();

                  await updateSessionSettings(session.id, {
                    churchName: cleanChurch,
                    pastorName: cleanPastor,
                    secretaryName: cleanSecretary,
                    meetingDate: cleanDate,
                    meetingTime: cleanTime,
                  });

                  const meta: ReportMetadata = {
                    churchName: cleanChurch,
                    year: session.year,
                    pastorName: cleanPastor,
                    secretaryName: cleanSecretary,
                    meetingDate: cleanDate,
                    meetingTime: cleanTime,
                  };

                  if (reportModalMode === 'pdf') {
                    await exportFinalListPDF(meta, departments);
                  } else if (reportModalMode === 'excel') {
                    exportFinalListExcel(meta, departments);
                  }
                  setReportModalMode(null);
                } finally {
                  setSavingReportMeta(false);
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label
                  htmlFor="report-church"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nombre de la Iglesia
                </label>
                <input
                  id="report-church"
                  type="text"
                  required
                  maxLength={140}
                  value={formChurchName}
                  onChange={(e) => setFormChurchName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="report-pastor"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Nombre del Pastor
                  </label>
                  <input
                    id="report-pastor"
                    type="text"
                    maxLength={140}
                    value={formPastorName}
                    onChange={(e) => setFormPastorName(e.target.value)}
                    placeholder="Ej. Pr. Juan Pérez"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="report-secretary"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Nombre de la Secretaria(o)
                  </label>
                  <input
                    id="report-secretary"
                    type="text"
                    maxLength={140}
                    value={formSecretaryName}
                    onChange={(e) => setFormSecretaryName(e.target.value)}
                    placeholder="Ej. Hna. María López"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="report-date"
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1"
                  >
                    <Calendar className="w-3.5 h-3.5 text-blue-800" />
                    Fecha de la reunión
                  </label>
                  <input
                    id="report-date"
                    type="date"
                    value={formMeetingDate}
                    onChange={(e) => setFormMeetingDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="report-time"
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1"
                  >
                    <Clock className="w-3.5 h-3.5 text-blue-800" />
                    Hora de la reunión
                  </label>
                  <input
                    id="report-time"
                    type="time"
                    value={formMeetingTime}
                    onChange={(e) => setFormMeetingTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setReportModalMode(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReportMeta}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  {savingReportMeta
                    ? 'Generando...'
                    : reportModalMode === 'pdf'
                      ? 'Guardar y Descargar PDF'
                      : reportModalMode === 'excel'
                        ? 'Guardar y Descargar Excel'
                        : 'Guardar datos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
