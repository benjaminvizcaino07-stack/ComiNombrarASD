import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Monitor,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Swords,
} from 'lucide-react';
import {
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
  groupDepartmentsForReport,
} from '../utils/exportReports';
import { evaluateRoundTallies } from '../utils/tally';

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

  const groupedFinalList = useMemo(
    () => groupDepartmentsForReport(departments),
    [departments]
  );

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

  const liveEval =
    activeRound && isAdmin
      ? evaluateRoundTallies(activeCandidates, ballots, activeRound.seats)
      : null;

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

  const hasTie = Boolean(
    activeRound &&
      activeRound.status === 'closed' &&
      activeRound.tiedCandidateIds.length > 0
  );

  const handleLaunchTieBreaker = async () => {
    if (!activeRound || !activeDepartment) return;
    const tiedCands = activeCandidates.filter((c) =>
      activeRound.tiedCandidateIds.includes(c.id)
    );
    if (tiedCands.length < 2) return;

    const alreadyElectedThisRound = activeCandidates
      .filter((c) => activeRound.electedCandidateIds.includes(c.id))
      .map((c) => c.name);
    const carryover = Array.from(
      new Set([...activeRound.carryoverElectedNames, ...alreadyElectedThisRound])
    );
    const remainingSeats = Math.max(1, activeRound.seats - alreadyElectedThisRound.length);
    const roundsForDept = allRounds.filter((r) => r.departmentId === activeDepartment.id);

    setLaunchingTieBreaker(true);
    try {
      await startRoundForDepartment({
        session,
        dept: activeDepartment,
        roundNumber: roundsForDept.length + 1,
        seatsForRound: remainingSeats,
        carryoverElectedNames: carryover,
        isTieBreaker: true,
        seedCandidates: tiedCands.map((c) => ({ name: c.name })),
      });
      onNavigateToVote();
    } finally {
      setLaunchingTieBreaker(false);
    }
  };

  const canMemberSeeResults = isAdmin || session.showResultsOnProjector;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 pb-24 sm:pb-10">
      {/* PROYECTAR RESULTADOS BAR */}
      <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">
            Proyección y Lista Final de Nombramientos
          </h1>
          <p className="text-sm text-slate-600">
            Abre la pantalla independiente para el proyector y decide cuándo mostrar los resultados
            a la comisión.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
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
          )}

          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(projectorUrl);
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

      {/* ACTIVE / RECENT ROUND TALLY & TIE-BREAKER */}
      {activeRound && (
        <div className="no-print bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-blue-900">{activeRound.departmentName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeRound.seats} {activeRound.seats === 1 ? 'puesto' : 'puestos'}
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

          {/* Tie Warning & Tie-Breaker Action */}
          {hasTie && (
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
                  activeRound.status === 'closed' &&
                  activeRound.electedCandidateIds.includes(cand.id);
                const isTied =
                  activeRound.status === 'closed' &&
                  activeRound.tiedCandidateIds.includes(cand.id);

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
                          <span className="text-xs font-bold text-emerald-800">· Elegido(a)</span>
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
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {session.churchName} · Período {session.year}
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              Lista Final de Nombramientos por Departamento
            </h2>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportFinalListPDF(session.churchName, session.year, departments)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer min-h-[44px]"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={() => exportFinalListExcel(session.churchName, session.year, departments)}
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
                      {group.positions.map((pos) => (
                        <tr key={pos.id}>
                          <td className="py-2.5 pr-4 font-medium text-slate-900">
                            {pos.roleTitle}
                          </td>
                          <td className="py-2.5 pr-4 text-slate-700">
                            {pos.electedNames.length > 0 ? (
                              <span className="font-semibold text-emerald-900">
                                {pos.electedNames.join(', ')}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {pos.status === 'tie' ? 'Empate pendiente' : 'Pendiente'}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {pos.electedNames.length} / {pos.seats}
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
      </div>
    </div>
  );
};
