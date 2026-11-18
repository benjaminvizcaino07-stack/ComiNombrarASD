import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { BarChart3, CheckSquare, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { AdminSection } from './components/AdminSection';
import { ProjectorView } from './components/ProjectorView';
import { ResultsSection } from './components/ResultsSection';
import { VoteSection } from './components/VoteSection';
import { auth, db, googleProvider, handleFirestoreError, OperationType, testConnection } from './firebase';
import { syncRoundAndProjector } from './services/nominationService';
import {
  AppSection,
  CandidateData,
  CommitteeMember,
  DepartmentPosition,
  EligibleMember,
  RoundData,
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
  const [ballots, setBallots] = useState<SecretBallot[]>([]);
  const [receiptsCount, setReceiptsCount] = useState(0);
  const [hasVotedCurrentRound, setHasVotedCurrentRound] = useState(false);

  const lastSyncedSignatureRef = useRef<string>('');

  // Startup connection check & Auth listener
  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser && fbUser.email) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email,
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
      activeRound.status === 'open' &&
      activeRound.expectedVotersCount > 0 &&
      receiptsCount >= activeRound.expectedVotersCount;

    const signature = [
      activeRound.id,
      activeRound.status,
      activeRound.expectedVotersCount,
      receiptsCount,
      ballots.length,
      session.showResultsOnProjector ? '1' : '0',
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
      forceClose: shouldAutoClose,
    });
  }, [
    isAdmin,
    session,
    activeRound,
    activeCandidates,
    ballots,
    receiptsCount,
  ]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSelectSession = (id: string) => {
    localStorage.setItem('nom_sda_session_id', id);
    setSelectedSessionId(id);
  };

  const navItems: { id: AppSection; label: string; icon: React.ReactNode }[] = [
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
            onClick={() => setActiveSection(isTokenEntry && !isAdmin ? 'vote' : 'admin')}
            className="flex items-center gap-2.5 text-left cursor-pointer whitespace-nowrap shrink-0"
          >
            <svg
              className="w-7 h-7 text-blue-900 shrink-0"
              viewBox="0 0 32 32"
              fill="none"
              aria-hidden="true"
            >
              <rect width="32" height="32" rx="8" fill="currentColor" />
              <path
                d="M16 7V25M10 13H22"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="font-display font-extrabold text-base sm:text-lg tracking-tight text-slate-900">
              NOMBRAMIENTOS SDA
            </span>
          </button>

          {/* Zone 2: Exactly 3 main sections */}
          <nav className="hidden sm:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
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
            {user ? (
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <LogOut className="w-4 h-4" />
                Salir
              </button>
            ) : committeeMember ? (
              <span className="text-xs font-semibold text-blue-900 whitespace-nowrap truncate max-w-[160px]">
                {committeeMember.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={authLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <ShieldCheck className="w-4 h-4" />
                Ingresar Pastor
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {activeSection === 'admin' && (
          <AdminSection
            user={user}
            onSignIn={handleSignIn}
            authLoading={authLoading}
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

        {activeSection === 'vote' && (
          <VoteSection
            session={session}
            isAdmin={isAdmin}
            adminUid={user?.uid ?? null}
            committeeMember={committeeMember}
            activeRound={activeRound}
            candidates={activeCandidates}
            eligibleMembers={eligibleMembers}
            hasVotedCurrentRound={hasVotedCurrentRound}
            receiptsCount={receiptsCount}
            ballots={ballots}
            onGoToResults={() => setActiveSection('results')}
          />
        )}

        {activeSection === 'results' && (
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

      {/* Mobile Bottom Navigation (3 Main Sections only, <= 15% mobile height) */}
      <nav className="no-print sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-3 h-16">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
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
    </div>
  );
}
