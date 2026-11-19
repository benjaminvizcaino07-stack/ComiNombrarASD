import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  BarChart3,
  CheckCircle2,
  CheckSquare,
  LogOut,
  Pause,
  Play,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AdminSection } from './components/AdminSection';
import { ProjectorView } from './components/ProjectorView';
import { ResultsSection } from './components/ResultsSection';
import { VoteSection } from './components/VoteSection';
import { auth, db, handleFirestoreError, OperationType, testConnection } from './firebase';
import {
  mapAuthErrorMessage,
  registerWithCredentials,
  signInWithCredentials,
  signInWithGoogle,
} from './services/authService';
import {
  setSessionLifecycleStatus,
  syncRoundAndProjector,
} from './services/nominationService';
import {
  AppSection,
  CandidateData,
  CommitteeMember,
  DepartmentPosition,
  EligibleMember,
  RoundData,
  RoundObservation,
  SecretBallot,
  SessionData,
} from './types';
import { evaluateRoundTallies } from './utils/tally';

interface UrlParamsState {
  view: string | null;
  sessionId: string | null;
  token: string | null;
  projectorKey: string | null;
}

function parseUrlParams(): UrlParamsState {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get('view'),
    sessionId: params.get('s'),
    token: params.get('t'),
    projectorKey: params.get('k'),
  };
}

export default function App() {
  const urlParams = useMemo(() => parseUrlParams(), []);

  // Independent Projector Screen Route
  if (urlParams.view === 'projector' && urlParams.sessionId && urlParams.projectorKey) {
    return (
      <ProjectorView
        sessionId={urlParams.sessionId}
        projectorKey={urlParams.projectorKey}
      />
    );
  }

  const isTokenEntry = Boolean(urlParams.sessionId && urlParams.token);

  const [activeSection, setActiveSection] = useState<AppSection>(
    isTokenEntry ? 'vote' : 'admin'
  );
  const [user, setUser] = useState<{ uid: string; email: string; displayName: string } | null>(
    null
  );
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [ownedSessions, setOwnedSessions] = useState<SessionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    urlParams.sessionId ?? localStorage.getItem('nom_sda_session_id')
  );
  const [session, setSession] = useState<SessionData | null>(null);
  const [committeeMember, setCommitteeMember] = useState<CommitteeMember | null>(null);

  const [eligibleMembers, setEligibleMembers] = useState<EligibleMember[]>([]);
  const [departments, setDepartments] = useState<DepartmentPosition[]>([]);
  const [committee, setCommittee] = useState<CommitteeMember[]>([]);
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [activeCandidates, setActiveCandidates] = useState<CandidateData[]>([]);
  const [activeObservations, setActiveObservations] = useState<RoundObservation[]>([]);
  const [ballots, setBallots] = useState<SecretBallot[]>([]);
  const [receiptsCount, setReceiptsCount] = useState(0);
  const [receiptIds, setReceiptIds] = useState<string[]>([]);
  const [hasVotedCurrentRound, setHasVotedCurrentRound] = useState(false);

  const [showExitModal, setShowExitModal] = useState(false);
  const [exitActionBusy, setExitActionBusy] = useState<'pause' | 'end' | 'signout' | null>(null);
  const [exitError, setExitError] = useState<string | null>(null);
  const [resumingSession, setResumingSession] = useState(false);

  const lastSyncedSignatureRef = useRef<string>('');

  // Startup connection check & Auth listener
  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const fallbackEmail = fbUser.email || `${fbUser.uid}@nombramientos.sda`;
        setUser({
          uid: fbUser.uid,
          email: fallbackEmail,
          displayName: fbUser.displayName || fallbackEmail,
        });
      } else {
        setUser(null);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Listen to Pastor's owned sessions
  useEffect(() => {
    if (!authReady || !user) {
      setOwnedSessions([]);
      return;
    }
    const path = 'sessions';
    const q = query(collection(db, 'sessions'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionData);
        setOwnedSessions(list);
        if (!urlParams.sessionId) {
          setSelectedSessionId((prev) => {
            if (prev && list.some((s) => s.id === prev)) return prev;
            return list[0]?.id ?? null;
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [authReady, user, urlParams.sessionId]);

  const effectiveSessionId = urlParams.sessionId ?? selectedSessionId;

  // Listen to current session document
  useEffect(() => {
    if (!effectiveSessionId) {
      setSession(null);
      return;
    }
    const path = `sessions/${effectiveSessionId}`;
    const unsub = onSnapshot(
      doc(db, 'sessions', effectiveSessionId),
      (snap) => {
        if (!snap.exists()) {
          setSession(null);
          return;
        }
        setSession({ id: snap.id, ...snap.data() } as SessionData);
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [effectiveSessionId]);

  // Listen to personal committee member document when accessing with ?s=...&t=...
  useEffect(() => {
    if (!urlParams.sessionId || !urlParams.token) {
      setCommitteeMember(null);
      return;
    }
    const path = `sessions/${urlParams.sessionId}/committee/${urlParams.token}`;
    const unsub = onSnapshot(
      doc(db, 'sessions', urlParams.sessionId, 'committee', urlParams.token),
      (snap) => {
        if (!snap.exists()) {
          setCommitteeMember(null);
          return;
        }
        setCommitteeMember({ id: snap.id, ...snap.data() } as CommitteeMember);
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [urlParams.sessionId, urlParams.token]);

  const isAdmin = Boolean(user && session && session.ownerId === user.uid);
  const isCommitteeMode = Boolean((isTokenEntry || committeeMember) && !isAdmin);

  // Listen to session subcollections (eligibleMembers, departments, rounds)
  useEffect(() => {
    if (!effectiveSessionId || !session) {
      setEligibleMembers([]);
      setDepartments([]);
      setRounds([]);
      return;
    }

    const memPath = `sessions/${effectiveSessionId}/eligibleMembers`;
    const unsubMem = onSnapshot(
      query(
        collection(db, 'sessions', effectiveSessionId, 'eligibleMembers'),
        where('sessionId', '==', effectiveSessionId)
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EligibleMember);
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setEligibleMembers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, memPath)
    );

    const deptPath = `sessions/${effectiveSessionId}/departments`;
    const unsubDept = onSnapshot(
      query(
        collection(db, 'sessions', effectiveSessionId, 'departments'),
        where('sessionId', '==', effectiveSessionId)
      ),
      (snap) => {
        setDepartments(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DepartmentPosition)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, deptPath)
    );

    const roundsPath = `sessions/${effectiveSessionId}/rounds`;
    const unsubRounds = onSnapshot(
      query(
        collection(db, 'sessions', effectiveSessionId, 'rounds'),
        where('sessionId', '==', effectiveSessionId)
      ),
      (snap) => {
        setRounds(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoundData));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, roundsPath)
    );

    return () => {
      unsubMem();
      unsubDept();
      unsubRounds();
    };
  }, [effectiveSessionId, session?.id]);

  // Admin-only committee list listener
  useEffect(() => {
    if (!effectiveSessionId || !isAdmin) {
      setCommittee([]);
      return;
    }
    const path = `sessions/${effectiveSessionId}/committee`;
    const unsub = onSnapshot(
      collection(db, 'sessions', effectiveSessionId, 'committee'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CommitteeMember);
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setCommittee(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [effectiveSessionId, isAdmin]);

  const activeRound = useMemo(() => {
    if (!session?.activeRoundId) return null;
    return rounds.find((r) => r.id === session.activeRoundId) ?? null;
  }, [session?.activeRoundId, rounds]);

  // Listen to candidates of active round
  useEffect(() => {
    if (!effectiveSessionId || !activeRound) {
      setActiveCandidates([]);
      return;
    }
    const path = `sessions/${effectiveSessionId}/rounds/${activeRound.id}/candidates`;
    const unsub = onSnapshot(
      query(
        collection(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'candidates'),
        where('sessionId', '==', effectiveSessionId),
        where('roundId', '==', activeRound.id)
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CandidateData);
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setActiveCandidates(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [effectiveSessionId, activeRound?.id]);

  // Listen to observations of active round (all for admin; revealed == true only for members)
  useEffect(() => {
    if (!effectiveSessionId || !activeRound) {
      setActiveObservations([]);
      return;
    }
    const path = `sessions/${effectiveSessionId}/rounds/${activeRound.id}/observations`;
    const obsQuery = isAdmin
      ? collection(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'observations')
      : query(
          collection(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'observations'),
          where('revealed', '==', true)
        );

    const getMillis = (val: unknown): number => {
      if (val && typeof val === 'object' && 'seconds' in val) {
        return Number((val as { seconds?: number }).seconds ?? 0);
      }
      return Number.MAX_SAFE_INTEGER;
    };

    const unsub = onSnapshot(
      obsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoundObservation);
        list.sort((a, b) => getMillis(a.createdAt) - getMillis(b.createdAt));
        setActiveObservations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [effectiveSessionId, activeRound?.id, isAdmin]);

  // Listen to own vote receipt for current voter (committee token OR pastor)
  useEffect(() => {
    if (!effectiveSessionId || !activeRound) {
      setHasVotedCurrentRound(false);
      return;
    }
    const receiptId = committeeMember?.id
      ? committeeMember.id
      : isAdmin && user
        ? `pastor_${user.uid}`
        : null;

    if (!receiptId) {
      setHasVotedCurrentRound(false);
      return;
    }

    const path = `sessions/${effectiveSessionId}/rounds/${activeRound.id}/receipts/${receiptId}`;
    const unsub = onSnapshot(
      doc(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'receipts', receiptId),
      (snap) => {
        setHasVotedCurrentRound(snap.exists());
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [effectiveSessionId, activeRound?.id, committeeMember?.id, isAdmin, user?.uid]);

  // Admin-only live listeners for receipts & anonymous ballots
  useEffect(() => {
    if (!effectiveSessionId || !activeRound || !isAdmin) {
      setBallots([]);
      setReceiptsCount(0);
      setReceiptIds([]);
      return;
    }

    const ballotsPath = `sessions/${effectiveSessionId}/rounds/${activeRound.id}/ballots`;
    const unsubBallots = onSnapshot(
      collection(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'ballots'),
      (snap) => {
        setBallots(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SecretBallot));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, ballotsPath)
    );

    const receiptsPath = `sessions/${effectiveSessionId}/rounds/${activeRound.id}/receipts`;
    const unsubReceipts = onSnapshot(
      collection(db, 'sessions', effectiveSessionId, 'rounds', activeRound.id, 'receipts'),
      (snap) => {
        setReceiptsCount(snap.size);
        setReceiptIds(snap.docs.map((d) => d.id));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, receiptsPath)
    );

    return () => {
      unsubBallots();
      unsubReceipts();
    };
  }, [effectiveSessionId, activeRound?.id, isAdmin]);

  // Real-time Pastor tally & projector synchronization engine
  useEffect(() => {
    if (!isAdmin || !session || !activeRound) return;

    const evalRes = evaluateRoundTallies(activeCandidates, ballots, activeRound.seats);
    const anyCountDiff = activeCandidates.some(
      (c) => c.voteCount !== (evalRes.countsById[c.id] ?? 0)
    );
    const shouldAutoClose =
      (session.sessionStatus ?? 'active') === 'active' &&
      activeRound.status === 'open' &&
      activeRound.votingStarted !== false &&
      activeRound.expectedVotersCount > 0 &&
      receiptsCount >= activeRound.expectedVotersCount;

    const signature = [
      activeRound.id,
      activeRound.isTestRound ? '1' : '0',
      session.sessionStatus ?? 'active',
      activeRound.status,
      activeRound.proposalsOpen ? '1' : '0',
      activeRound.votingStarted === false ? '0' : '1',
      activeRound.memberProposalsEnabled === false ? '0' : '1',
      activeRound.memberObservationsEnabled === false ? '0' : '1',
      activeRound.observation ?? '',
      activeRound.observationsRevealed ? '1' : '0',
      activeRound.maxProposals ?? '',
      activeRound.expectedVotersCount,
      receiptsCount,
      ballots.length,
      session.showResultsOnProjector ? '1' : '0',
      activeObservations.map((o) => `${o.id}:${o.revealed ? 1 : 0}`).join(','),
      activeCandidates.map((c) => `${c.id}:${evalRes.countsById[c.id] ?? 0}:${c.name}`).join(','),
    ].join('|');

    if (signature === lastSyncedSignatureRef.current && !anyCountDiff && !shouldAutoClose) {
      return;
    }

    lastSyncedSignatureRef.current = signature;
    void syncRoundAndProjector({
      session,
      round: activeRound,
      candidates: activeCandidates,
      ballots,
      receiptsCount,
      observations: activeObservations,
      forceClose: shouldAutoClose,
    });
  }, [
    isAdmin,
    session,
    activeRound,
    activeCandidates,
    activeObservations,
    ballots,
    receiptsCount,
  ]);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(mapAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCredentialsSignIn = async (identifier: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithCredentials(identifier, password);
    } catch (err) {
      setAuthError(mapAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCredentialsRegister = async (
    displayName: string,
    identifier: string,
    password: string
  ) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await registerWithCredentials(displayName, identifier, password);
    } catch (err) {
      setAuthError(mapAuthErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSelectSession = (id: string) => {
    localStorage.setItem('nom_sda_session_id', id);
    setSelectedSessionId(id);
  };

  const handleExitWithStatus = async (mode: 'pause' | 'end' | 'signout') => {
    setExitActionBusy(mode);
    setExitError(null);
    try {
      if (isAdmin && session) {
        if (mode === 'pause') {
          await setSessionLifecycleStatus(session, 'paused', activeRound);
        } else if (mode === 'end') {
          await setSessionLifecycleStatus(session, 'ended', activeRound);
        }
      }
      setShowExitModal(false);
      await signOut(auth);
    } catch {
      setExitError('No se pudo guardar el estado de la sesión. Verifica tu conexión e intenta nuevamente.');
    } finally {
      setExitActionBusy(null);
    }
  };

  const handleResumeSession = async () => {
    if (!isAdmin || !session) return;
    setResumingSession(true);
    try {
      await setSessionLifecycleStatus(session, 'active', activeRound);
    } finally {
      setResumingSession(false);
    }
  };

  const effectiveActiveSection: AppSection =
    isCommitteeMode && activeSection === 'admin' ? 'vote' : activeSection;

  const navItems: { id: AppSection; label: string; icon: React.ReactNode }[] = isCommitteeMode
    ? [
        { id: 'vote', label: 'VOTAR', icon: <CheckSquare className="w-5 h-5" /> },
        { id: 'results', label: 'RESULTADOS', icon: <BarChart3 className="w-5 h-5" /> },
      ]
    : [
        { id: 'admin', label: 'ADMINISTRAR', icon: <Settings className="w-5 h-5" /> },
        { id: 'vote', label: 'VOTAR', icon: <CheckSquare className="w-5 h-5" /> },
        { id: 'results', label: 'RESULTADOS', icon: <BarChart3 className="w-5 h-5" /> },
      ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveSection(isCommitteeMode ? 'vote' : 'admin')}
            className="flex items-center gap-2.5 text-left cursor-pointer whitespace-nowrap shrink-0"
          >
            <img
              src="/assets/aistudio/Icono_azul_de_nombramientos_SDA_0e21f0e4.png"
              alt="Logo NOMBRAMIENTOS SDA"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-lg object-contain shrink-0"
            />
            <span className="font-display font-extrabold text-base sm:text-lg tracking-tight text-slate-900">
              NOMBRAMIENTOS SDA
            </span>
          </button>

          {/* Zone 2: Main sections */}
          <nav className="hidden sm:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = effectiveActiveSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
                    isActive
                      ? 'bg-blue-800 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary contextual action */}
          <div className="flex items-center shrink-0">
            {user && !isCommitteeMode ? (
              <button
                type="button"
                onClick={() => {
                  if (isAdmin && session) {
                    setExitError(null);
                    setShowExitModal(true);
                  } else {
                    void signOut(auth);
                  }
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            ) : isCommitteeMode ? (
              <span className="text-xs font-semibold text-blue-900 whitespace-nowrap truncate max-w-[180px]">
                {committeeMember ? committeeMember.name : 'Miembro de Comisión'}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setActiveSection('admin')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <ShieldCheck className="w-4 h-4" />
                Ingresar Pastor
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Admin Session Paused / Ended Banner */}
      {isAdmin &&
        session &&
        (session.sessionStatus === 'paused' || session.sessionStatus === 'ended') && (
          <div
            className={`no-print border-b px-4 py-3 ${
              session.sessionStatus === 'paused'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-slate-100 border-slate-200 text-slate-900'
            }`}
          >
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2.5 text-sm">
                {session.sessionStatus === 'paused' ? (
                  <Pause className="w-4 h-4 text-amber-800 shrink-0 mt-0.5 sm:mt-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
                )}
                <p>
                  {session.sessionStatus === 'paused' ? (
                    <>
                      <strong>Sesión de votación en pausa.</strong> Todo el progreso, votos y
                      enlaces de los miembros siguen guardados para reanudar cuando desees.
                    </>
                  ) : (
                    <>
                      <strong>Sesión de votación finalizada.</strong> Los resultados están guardados
                      y los miembros pueden consultar la lista final.
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={resumingSession}
                onClick={handleResumeSession}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[40px] whitespace-nowrap shrink-0 self-start sm:self-auto"
              >
                <Play className="w-3.5 h-3.5" />
                {resumingSession
                  ? 'Reanudando...'
                  : session.sessionStatus === 'paused'
                    ? 'Reanudar sesión'
                    : 'Reabrir sesión'}
              </button>
            </div>
          </div>
        )}

      {/* Main Content */}
      <main className="flex-1">
        {!isCommitteeMode && effectiveActiveSection === 'admin' && (
          <AdminSection
            user={user}
            onSignInGoogle={handleGoogleSignIn}
            onSignInCredentials={handleCredentialsSignIn}
            onRegisterCredentials={handleCredentialsRegister}
            authLoading={authLoading}
            authError={authError}
            onClearAuthError={() => setAuthError(null)}
            sessions={ownedSessions}
            session={isAdmin ? session : null}
            onSelectSession={handleSelectSession}
            eligibleMembers={eligibleMembers}
            departments={departments}
            committee={committee}
            activeRound={activeRound}
            activeCandidates={activeCandidates}
            allRounds={rounds}
            onNavigateToVote={() => setActiveSection('vote')}
            onNavigateToResults={() => setActiveSection('results')}
          />
        )}

        {effectiveActiveSection === 'vote' && (
          <VoteSection
            session={session}
            isAdmin={isAdmin}
            adminUid={user?.uid ?? null}
            committeeMember={committeeMember}
            committee={committee}
            departments={departments}
            activeRound={activeRound}
            allRounds={rounds}
            candidates={activeCandidates}
            observations={activeObservations}
            eligibleMembers={eligibleMembers}
            hasVotedCurrentRound={hasVotedCurrentRound}
            receiptsCount={receiptsCount}
            receiptIds={receiptIds}
            ballots={ballots}
            onGoToResults={() => setActiveSection('results')}
          />
        )}

        {effectiveActiveSection === 'results' && (
          <ResultsSection
            session={session}
            isAdmin={isAdmin}
            departments={departments}
            activeRound={activeRound}
            activeCandidates={activeCandidates}
            allRounds={rounds}
            ballots={ballots}
            receiptsCount={receiptsCount}
            onNavigateToVote={() => setActiveSection('vote')}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className={`no-print sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid h-16 ${
          isCommitteeMode ? 'grid-cols-2' : 'grid-cols-3'
        }`}
      >
        {navItems.map((item) => {
          const isActive = effectiveActiveSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[48px] ${
                isActive ? 'text-blue-800 font-bold' : 'text-slate-500 font-medium'
              }`}
            >
              {item.icon}
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Exit Session Confirmation Modal (Pause for later vs Ended) */}
      {showExitModal && isAdmin && session && (
        <div className="no-print fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  ¿Cómo deseas salir de la sesión?
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {session.churchName} · Período {session.year}
                </p>
              </div>
              <button
                type="button"
                disabled={exitActionBusy !== null}
                onClick={() => setShowExitModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                Indica si la sesión de votación ha terminado o si la estás pausando para
                continuar en otro día. Todo lo avanzado quedará guardado en la nube.
              </p>

              {activeRound && activeRound.status === 'open' && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                  Hay una votación abierta para <strong>{activeRound.roleTitle}</strong>. Si pausas,
                  se guardarán los candidatos, votos y enlaces exactamente como están para
                  reanudar después.
                </div>
              )}

              {exitError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800"
                >
                  {exitError}
                </div>
              )}

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={exitActionBusy !== null}
                  onClick={() => handleExitWithStatus('pause')}
                  className="w-full text-left p-4 rounded-xl border-2 border-blue-800 bg-blue-50/70 hover:bg-blue-100/70 transition-colors cursor-pointer disabled:opacity-60 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-800 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Pause className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {exitActionBusy === 'pause'
                        ? 'Guardando y pausando sesión...'
                        : 'Pausar sesión para reanudar otro día'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Guarda todos los cargos, votos, observaciones y mantiene activos los enlaces
                      personales de cada miembro para continuar más adelante.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={exitActionBusy !== null}
                  onClick={() => handleExitWithStatus('end')}
                  className="w-full text-left p-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {exitActionBusy === 'end'
                        ? 'Finalizando sesión...'
                        : 'Sí, se terminó la sesión de votación'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Marca la comisión como finalizada y conserva todos los resultados listos para
                      consulta o impresión.
                    </p>
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={exitActionBusy !== null}
                  onClick={() => handleExitWithStatus('signout')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
                >
                  {exitActionBusy === 'signout'
                    ? 'Cerrando acceso...'
                    : 'Salir sin cambiar el estado actual'}
                </button>
                <button
                  type="button"
                  disabled={exitActionBusy !== null}
                  onClick={() => setShowExitModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[40px]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
