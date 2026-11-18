import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { AlertTriangle, Award, CheckCircle2, EyeOff, Monitor } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ProjectorState } from '../types';

interface ProjectorViewProps {
  sessionId: string;
  projectorKey: string;
}

export const ProjectorView: React.FC<ProjectorViewProps> = ({ sessionId, projectorKey }) => {
  const [state, setState] = useState<ProjectorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const path = `sessions/${sessionId}/projector/${projectorKey}`;
    const unsub = onSnapshot(
      doc(db, 'sessions', sessionId, 'projector', projectorKey),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setErrorMsg('No se encontró la pantalla de proyección solicitada.');
          setState(null);
          return;
        }
        setErrorMsg(null);
        setState(snap.data() as ProjectorState);
      },
      (error) => {
        setLoading(false);
        setErrorMsg('No fue posible conectar con los resultados de proyección.');
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [sessionId, projectorKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <Monitor className="w-12 h-12 text-blue-400 mx-auto" />
          <p className="text-lg font-semibold text-slate-200">
            Conectando pantalla de proyección...
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg || !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-3 bg-slate-900 border border-slate-800 rounded-3xl p-8">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h1 className="text-2xl font-bold">Proyector no disponible</h1>
          <p className="text-slate-300 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const maxVotes = Math.max(
    1,
    ...state.candidates.map((c) => (typeof c.voteCount === 'number' ? c.voteCount : 0))
  );

  const progressPct =
    state.expectedVotersCount > 0
      ? Math.min(100, Math.round((state.votesCastCount / state.expectedVotersCount) * 100))
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 lg:p-14">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <p className="text-sm font-semibold text-blue-300 tracking-wide">
            NOMBRAMIENTOS SDA · {state.churchName}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
            Comisión de Nombramientos {state.year}
          </h1>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-xs text-slate-400">Participación de comisión</p>
          <p className="text-2xl font-mono font-bold text-white tabular-nums">
            {state.votesCastCount} / {state.expectedVotersCount} votos
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col justify-center py-8 max-w-6xl w-full mx-auto space-y-8">
        {state.roundStatus === 'idle' || !state.roleTitle ? (
          <div className="text-center space-y-4 py-16">
            <Monitor className="w-16 h-16 text-blue-400 mx-auto" />
            <h2 className="text-3xl sm:text-5xl font-bold text-white text-balance">
              Esperando siguiente cargo en consideración
            </h2>
            <p className="text-lg text-slate-300 max-w-xl mx-auto">
              Los resultados se actualizarán automáticamente en esta pantalla cuando comience la
              votación.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-base text-slate-300">
                <span className="font-semibold text-blue-300">{state.departmentName}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {state.seats ?? 1} {(state.seats ?? 1) === 1 ? 'puesto disponible' : 'puestos disponibles'}
                </span>
                {state.isTieBreaker && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-amber-300">Votación de Desempate</span>
                  </>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight text-balance">
                  {state.roleTitle}
                </h2>

                <div className="shrink-0">
                  {state.roundStatus === 'closed' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold text-lg">
                      <CheckCircle2 className="w-6 h-6" />
                      VOTACIÓN FINALIZADA
                    </div>
                  )}
                  {state.roundStatus === 'tie' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold text-lg">
                      <AlertTriangle className="w-6 h-6" />
                      EMPATE DETECTADO
                    </div>
                  )}
                  {state.roundStatus === 'open' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-500/20 border border-blue-400/40 text-blue-200 font-bold text-lg">
                      VOTACIÓN EN CURSO
                    </div>
                  )}
                  {state.roundStatus === 'paused' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-lg">
                      VOTACIÓN PAUSADA
                    </div>
                  )}
                </div>
              </div>

              {/* Participation Progress Bar */}
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {!state.showResults ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-4">
                <EyeOff className="w-12 h-12 text-slate-400 mx-auto" />
                <h3 className="text-2xl sm:text-3xl font-bold text-white">
                  Resultados ocultos durante la votación
                </h3>
                <p className="text-slate-300 text-lg max-w-2xl mx-auto">
                  Los nombres y conteos se mostrarán en esta pantalla cuando el pastor autorice su
                  proyección.
                </p>
              </div>
            ) : state.candidates.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-300 text-xl">
                Aún no hay candidatos propuestos para este cargo.
              </div>
            ) : (
              <div className="grid gap-4">
                {state.candidates.map((cand) => {
                  const votes = typeof cand.voteCount === 'number' ? cand.voteCount : 0;
                  const widthPct = Math.round((votes / maxVotes) * 100);

                  return (
                    <div
                      key={cand.id}
                      className={`rounded-2xl border p-5 sm:p-6 transition-colors ${
                        cand.elected
                          ? 'bg-emerald-950/60 border-emerald-500/60'
                          : cand.tied
                            ? 'bg-amber-950/60 border-amber-500/60'
                            : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {cand.elected && (
                            <Award className="w-8 h-8 text-emerald-400 shrink-0" />
                          )}
                          {cand.tied && (
                            <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
                          )}
                          <span className="text-2xl sm:text-3xl font-bold text-white truncate">
                            {cand.name}
                          </span>
                          {cand.elected && (
                            <span className="text-base sm:text-lg font-bold text-emerald-300 shrink-0">
                              · ELEGIDO(A)
                            </span>
                          )}
                          {cand.tied && (
                            <span className="text-base sm:text-lg font-bold text-amber-300 shrink-0">
                              · EMPATE
                            </span>
                          )}
                        </div>
                        <span className="text-3xl sm:text-4xl font-mono font-extrabold text-white tabular-nums shrink-0">
                          {votes}
                        </span>
                      </div>
                      <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            cand.elected
                              ? 'bg-emerald-400'
                              : cand.tied
                                ? 'bg-amber-400'
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs sm:text-sm text-slate-400">
        <span>Votación secreta · Sin identificación individual de votantes</span>
        <span>Iglesia Adventista del Séptimo Día</span>
      </footer>
    </div>
  );
};
