import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Link2,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { SDA_CHURCH_MANUAL_TEMPLATES, SdaManualRoleTemplate } from '../data/sdaManualPositions';
import {
  addCommitteeMember,
  addDepartmentPosition,
  addEligibleMember,
  batchAddEligibleMembers,
  batchAddManualTemplates,
  clearAllEligibleMembers,
  createSession,
  deleteCommitteeMember,
  deleteDepartmentPosition,
  deleteEligibleMember,
  setRoundPauseState,
  startRoundForDepartment,
  toggleCommitteeMember,
  toggleEligibleMember,
  updateDepartmentPosition,
  updatePastorOverrideAndSyncRound,
  updateSessionSettings,
} from '../services/nominationService';
import {
  CandidateData,
  CommitteeMember,
  DepartmentPosition,
  EligibleMember,
  PastorVoteOverride,
  RoundData,
  SessionData,
} from '../types';
import { parseMembersExcel } from '../utils/exportReports';
import { computePastorVoteAllowed, isCommitteeCountEven } from '../utils/tally';

interface AdminSectionProps {
  user: { uid: string; email: string; displayName: string } | null;
  onSignInGoogle: () => Promise<void>;
  onSignInCredentials: (identifier: string, password: string) => Promise<void>;
  onRegisterCredentials: (
    displayName: string,
    identifier: string,
    password: string
  ) => Promise<void>;
  authLoading: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  sessions: SessionData[];
  session: SessionData | null;
  onSelectSession: (sessionId: string) => void;
  eligibleMembers: EligibleMember[];
  departments: DepartmentPosition[];
  committee: CommitteeMember[];
  activeRound: RoundData | null;
  activeCandidates: CandidateData[];
  allRounds: RoundData[];
  onNavigateToVote: () => void;
  onNavigateToResults: () => void;
}

type AdminSubTab = 'positions' | 'committee' | 'members' | 'session';

export const AdminSection: React.FC<AdminSectionProps> = ({
  user,
  onSignInGoogle,
  onSignInCredentials,
  onRegisterCredentials,
  authLoading,
  authError,
  onClearAuthError,
  sessions,
  session,
  onSelectSession,
  eligibleMembers,
  departments,
  committee,
  activeRound,
  allRounds,
  onNavigateToVote,
}) => {
  const [subTab, setSubTab] = useState<AdminSubTab>('positions');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authFullName, setAuthFullName] = useState('');
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  const [churchNameInput, setChurchNameInput] = useState('Iglesia Adventista Central');
  const [yearInput, setYearInput] = useState(String(new Date().getFullYear()));
  const [creatingSession, setCreatingSession] = useState(false);
  const [createSessionError, setCreateSessionError] = useState<string | null>(null);

  // Manual templates modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    SDA_CHURCH_MANUAL_TEMPLATES.map((t) => t.id)
  );
  const [importingTemplates, setImportingTemplates] = useState(false);

  // Add/Edit position form
  const [deptName, setDeptName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [seatsInput, setSeatsInput] = useState(1);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editRoleTitle, setEditRoleTitle] = useState('');
  const [editSeats, setEditSeats] = useState(1);

  // Committee member form
  const [commName, setCommName] = useState('');
  const [commRole, setCommRole] = useState('Miembro de Comisión');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Eligible members form
  const [memberName, setMemberName] = useState('');
  const [memberNotes, setMemberNotes] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Session edit form
  const [editChurchName, setEditChurchName] = useState('');
  const [editYear, setEditYear] = useState('');
  const [savingSessionEdit, setSavingSessionEdit] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const enabledCount = useMemo(
    () => committee.filter((m) => m.enabled).length,
    [committee]
  );
  const isEven = isCommitteeCountEven(enabledCount);
  const pastorAllowed = session
    ? computePastorVoteAllowed(enabledCount, session.pastorVoteEnabledOverride)
    : false;

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return eligibleMembers;
    return eligibleMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q))
    );
  }, [eligibleMembers, memberSearch]);

  const orderedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.order - b.order),
    [departments]
  );

  const flashNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => {
      setStatusNotice((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  if (!user) {
    const displayedError = localAuthError || authError;

    const handleCredentialsSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalAuthError(null);
      onClearAuthError();

      const cleanId = authIdentifier.trim();
      if (cleanId.length < 3) {
        setLocalAuthError('Ingresa un usuario o correo electrónico válido.');
        return;
      }
      if (authPassword.length < 6) {
        setLocalAuthError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      if (authMode === 'register') {
        if (!authFullName.trim()) {
          setLocalAuthError('Ingresa tu nombre completo (ej. Pastor o Secretario).');
          return;
        }
        if (authPassword !== authConfirmPassword) {
          setLocalAuthError('Las contraseñas no coinciden.');
          return;
        }
        await onRegisterCredentials(authFullName.trim(), cleanId, authPassword);
      } else {
        await onSignInCredentials(cleanId, authPassword);
      }
    };

    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 space-y-7">
          <div>
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2.5 text-balance">
              Acceso para Pastor o Secretario
            </h1>
            <p className="text-slate-600 text-base leading-relaxed">
              Ingresa con tu cuenta de Google o regístrate con un usuario y contraseña para
              administrar los nombramientos de tu iglesia.
            </p>
          </div>

          {/* Option 1: Google Sign-In */}
          <div>
            <button
              type="button"
              onClick={() => {
                setLocalAuthError(null);
                onClearAuthError();
                void onSignInGoogle();
              }}
              disabled={authLoading}
              className="w-full inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-blue-800 text-white font-semibold text-base hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60 min-h-[48px]"
            >
              <ShieldCheck className="w-5 h-5" />
              {authLoading ? 'Conectando...' : 'Ingresar con cuenta de Google'}
            </button>
          </div>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200" />
            <span className="shrink-0 mx-4 text-xs font-medium text-slate-500">
              o con usuario / correo y contraseña
            </span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          {/* Option 2: Username / Email & Password */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setLocalAuthError(null);
                  onClearAuthError();
                }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer min-h-[42px] ${
                  authMode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setLocalAuthError(null);
                  onClearAuthError();
                }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer min-h-[42px] ${
                  authMode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Registrarse
              </button>
            </div>

            {displayedError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800"
              >
                {displayedError}
              </div>
            )}

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Nombre completo (Pastor o Secretario)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    placeholder="Ej. Pastor Carlos Méndez"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Usuario o correo electrónico
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    maxLength={140}
                    value={authIdentifier}
                    onChange={(e) => setAuthIdentifier(e.target.value)}
                    placeholder="Ej. pastor.carlos o correo@iglesia.org"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {authMode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={authConfirmPassword}
                      onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white font-semibold text-base hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-60 min-h-[48px]"
              >
                {authLoading
                  ? 'Procesando...'
                  : authMode === 'register'
                    ? 'Crear cuenta e ingresar'
                    : 'Ingresar con usuario y contraseña'}
              </button>
            </form>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-900">
              Nota para los miembros de la comisión:
            </p>
            <p>
              Los integrantes de la comisión no necesitan crear una cuenta ni contraseña; solo
              deben abrir el enlace personal que el pastor o secretario les envíe.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
        {sessions.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-3">
              Comisiones guardadas en la nube
            </h2>
            <div className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{s.churchName}</p>
                    <p className="text-xs text-slate-500">
                      Período {s.year} · {s.enabledCommitteeCount} integrantes habilitados
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Abrir comisión
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Crear nueva Comisión de Nombramientos
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            Configura el nombre de tu iglesia y el año eclesiástico para comenzar.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!churchNameInput.trim()) return;
              setCreatingSession(true);
              setCreateSessionError(null);
              try {
                const id = await createSession(
                  user.uid,
                  user.email,
                  churchNameInput.trim(),
                  yearInput.trim() || String(new Date().getFullYear())
                );
                onSelectSession(id);
              } catch {
                setCreateSessionError(
                  'No se pudo crear la comisión en la nube. Verifica tu conexión o vuelve a iniciar sesión.'
                );
              } finally {
                setCreatingSession(false);
              }
            }}
            className="grid sm:grid-cols-3 gap-4"
          >
            {createSessionError && (
              <div className="sm:col-span-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                {createSessionError}
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nombre de la Iglesia
              </label>
              <input
                type="text"
                required
                maxLength={140}
                value={churchNameInput}
                onChange={(e) => setChurchNameInput(e.target.value)}
                placeholder="Ej. Iglesia Adventista Central"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Período / Año
              </label>
              <input
                type="text"
                required
                maxLength={20}
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
                placeholder="2027"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <div className="sm:col-span-3 pt-2">
              <button
                type="submit"
                disabled={creatingSession}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-800 text-white font-semibold hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60 min-h-[48px]"
              >
                <Plus className="w-5 h-5" />
                {creatingSession ? 'Creando comisión...' : 'Crear Comisión de Nombramientos'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !roleTitle.trim()) return;
    setBusyAction('add-pos');
    try {
      await addDepartmentPosition(
        session.id,
        deptName.trim(),
        roleTitle.trim(),
        seatsInput,
        departments.length
      );
      setDeptName('');
      setRoleTitle('');
      setSeatsInput(1);
      flashNotice('Cargo agregado correctamente.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportManualTemplates = async () => {
    const chosen: SdaManualRoleTemplate[] = SDA_CHURCH_MANUAL_TEMPLATES.filter((t) =>
      selectedTemplateIds.includes(t.id)
    );
    if (chosen.length === 0) return;
    setImportingTemplates(true);
    try {
      await batchAddManualTemplates(session.id, chosen, departments.length);
      setShowManualModal(false);
      flashNotice(`Se cargaron ${chosen.length} cargos del Manual de Iglesia.`);
    } finally {
      setImportingTemplates(false);
    }
  };

  const handleStartVoting = async (dept: DepartmentPosition) => {
    if (enabledCount === 0) {
      flashNotice('Registra y habilita al menos 1 integrante en la comisión antes de votar.');
      setSubTab('committee');
      return;
    }
    setBusyAction(`start-${dept.id}`);
    try {
      const roundsForDept = allRounds.filter((r) => r.departmentId === dept.id);
      await startRoundForDepartment({
        session,
        dept,
        roundNumber: roundsForDept.length + 1,
        seatsForRound: dept.seats,
        carryoverElectedNames: [],
        isTieBreaker: false,
      });
      onNavigateToVote();
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commName.trim()) return;
    setBusyAction('add-comm');
    try {
      await addCommitteeMember(session, commName.trim(), commRole.trim(), committee);
      setCommName('');
      flashNotice('Integrante agregado con su enlace personal.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFeedback(null);
    setBusyAction('excel');
    try {
      const parsed = await parseMembersExcel(file);
      if (parsed.length === 0) {
        setImportFeedback('No se encontraron nombres válidos en el archivo seleccionado.');
        return;
      }
      const existingNames = new Set(eligibleMembers.map((m) => m.name.toLowerCase()));
      const newRows = parsed.filter((r) => !existingNames.has(r.name.toLowerCase()));
      if (newRows.length === 0) {
        setImportFeedback('Todos los nombres del archivo ya estaban registrados.');
        return;
      }
      const added = await batchAddEligibleMembers(session.id, newRows);
      setImportFeedback(`Se importaron ${added} miembros desde Excel correctamente.`);
    } catch {
      setImportFeedback('Error al leer el archivo. Verifica que sea .xlsx, .xls o .csv.');
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBulkAddMembers = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2);
    if (lines.length === 0) return;

    setBusyAction('bulk-members');
    try {
      const existingNames = new Set(eligibleMembers.map((m) => m.name.toLowerCase()));
      const uniqueNew = Array.from(new Set(lines))
        .filter((name) => !existingNames.has(name.toLowerCase()))
        .map((name) => ({ name }));

      const added = await batchAddEligibleMembers(session.id, uniqueNew);
      setBulkText('');
      setShowBulkModal(false);
      flashNotice(`Se agregaron ${added} miembros aptos.`);
    } finally {
      setBusyAction(null);
    }
  };

  const getPersonalLink = (token: string) =>
    `${window.location.origin}/?s=${encodeURIComponent(session.id)}&t=${encodeURIComponent(token)}`;

  const copyPersonalLink = async (token: string) => {
    await navigator.clipboard.writeText(getPersonalLink(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((curr) => (curr === token ? null : curr)), 2200);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Status Toast */}
      {statusNotice && (
        <div className="bg-slate-900 text-white px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between">
          <span>{statusNotice}</span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Critical Even-Count Alert Banner */}
      {isEven && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-950"
        >
          <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm sm:text-base">
              ATENCIÓN: La comisión tiene un número par de integrantes ({enabledCount}). Se
              habilitará el voto del pastor para evitar posibles empates.
            </p>
            <p className="text-xs sm:text-sm text-amber-900">
              El voto del pastor equivale a 1 voto ordinario secreto, únicamente para equilibrar la
              cantidad de votantes habilitados.
            </p>
          </div>
        </div>
      )}

      {/* Session Context Bar & Sub-Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Comisión activa · Período {session.year}
            </p>
            <h2 className="text-xl font-bold text-slate-900">{session.churchName}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 tabular-nums">
            <span>
              <strong className="text-slate-900">{enabledCount}</strong> habilitados
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-slate-900">{departments.length}</strong> cargos
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-slate-900">
                {eligibleMembers.filter((m) => m.active).length}
              </strong>{' '}
              miembros aptos
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('positions')}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              subTab === 'positions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cargos y Departamentos
          </button>
          <button
            type="button"
            onClick={() => setSubTab('committee')}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              subTab === 'committee'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Comisión y Enlaces ({enabledCount})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('members')}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              subTab === 'members'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Miembros Aptos ({eligibleMembers.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setEditChurchName(session.churchName);
              setEditYear(session.year);
              setSubTab('session');
            }}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap min-h-[44px] ${
              subTab === 'session'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Iglesia y Sesiones
          </button>
        </div>
      </div>

      {/* SUBTAB 1: CARGOS Y DEPARTAMENTOS */}
      {subTab === 'positions' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Configuración de Cargos y Departamentos
                </h3>
                <p className="text-sm text-slate-600">
                  Define los departamentos, cargos y cuántas personas elegir en cada votación.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 font-semibold text-sm hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <BookOpen className="w-4 h-4" />
                Referencia Manual de Iglesia ASD
              </button>
            </div>

            <form onSubmit={handleAddPosition} className="grid sm:grid-cols-12 gap-3 pt-2">
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Departamento
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Ej. Escuela Sabática"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Cargo a elegir
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="Ej. Director(a) de Escuela Sabática"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Personas a elegir
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={seatsInput}
                  onChange={(e) => setSeatsInput(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={busyAction === 'add-pos'}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {orderedDepartments.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-900">No hay cargos cargados todavía</p>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Usa el botón &ldquo;Referencia Manual de Iglesia ASD&rdquo; para cargar los
                  departamentos oficiales en segundos o agrégalos manualmente arriba.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orderedDepartments.map((dept) => {
                  const isEditing = editingDeptId === dept.id;
                  const isThisActive =
                    activeRound && activeRound.departmentId === dept.id && activeRound.status !== 'closed';

                  return (
                    <div
                      key={dept.id}
                      className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      {isEditing ? (
                        <div className="flex-1 grid sm:grid-cols-12 gap-2.5">
                          <input
                            type="text"
                            value={editDeptName}
                            onChange={(e) => setEditDeptName(e.target.value)}
                            className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                          />
                          <input
                            type="text"
                            value={editRoleTitle}
                            onChange={(e) => setEditRoleTitle(e.target.value)}
                            className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                          />
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={editSeats}
                            onChange={(e) =>
                              setEditSeats(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                          />
                          <div className="sm:col-span-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await updateDepartmentPosition(session.id, dept.id, {
                                  department: editDeptName,
                                  roleTitle: editRoleTitle,
                                  seats: editSeats,
                                });
                                setEditingDeptId(null);
                                flashNotice('Cargo actualizado.');
                              }}
                              className="px-3 py-2 rounded-lg bg-blue-800 text-white text-xs font-semibold cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingDeptId(null)}
                              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-semibold text-slate-700">{dept.department}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {dept.seats} {dept.seats === 1 ? 'puesto' : 'puestos'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  dept.status === 'completed'
                                    ? 'text-emerald-700 font-semibold'
                                    : dept.status === 'tie'
                                      ? 'text-amber-700 font-semibold'
                                      : dept.status === 'voting'
                                        ? 'text-blue-700 font-semibold'
                                        : 'text-slate-500'
                                }
                              >
                                {dept.status === 'completed'
                                  ? 'Completado'
                                  : dept.status === 'tie'
                                    ? 'Empate pendiente'
                                    : dept.status === 'voting'
                                      ? 'Votación abierta'
                                      : dept.status === 'paused'
                                        ? 'Pausada'
                                        : 'Pendiente'}
                              </span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 truncate">
                              {dept.roleTitle}
                            </h4>
                            {dept.electedNames.length > 0 && (
                              <p className="text-sm text-emerald-800 font-medium">
                                Elegidos: {dept.electedNames.join(', ')}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {/* Quick seat adjustment before voting */}
                            {dept.status === 'pending' && (
                              <div className="flex items-center border border-slate-200 rounded-xl bg-white">
                                <button
                                  type="button"
                                  aria-label="Reducir puestos"
                                  onClick={() =>
                                    updateDepartmentPosition(session.id, dept.id, {
                                      seats: Math.max(1, dept.seats - 1),
                                    })
                                  }
                                  className="px-3 py-2 text-slate-600 hover:text-slate-900 cursor-pointer min-h-[40px]"
                                >
                                  -
                                </button>
                                <span className="px-2 text-xs font-mono tabular-nums text-slate-800">
                                  {dept.seats}
                                </span>
                                <button
                                  type="button"
                                  aria-label="Aumentar puestos"
                                  onClick={() =>
                                    updateDepartmentPosition(session.id, dept.id, {
                                      seats: Math.min(50, dept.seats + 1),
                                    })
                                  }
                                  className="px-3 py-2 text-slate-600 hover:text-slate-900 cursor-pointer min-h-[40px]"
                                >
                                  +
                                </button>
                              </div>
                            )}

                            {isThisActive ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRoundPauseState(
                                      session,
                                      activeRound,
                                      activeRound.status === 'open'
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                                >
                                  {activeRound.status === 'open' ? (
                                    <>
                                      <Pause className="w-4 h-4" /> Pausar
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4" /> Reanudar
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={onNavigateToVote}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer min-h-[44px]"
                                >
                                  Ir a votación
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busyAction === `start-${dept.id}`}
                                onClick={() => handleStartVoting(dept)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60 min-h-[44px]"
                              >
                                {dept.status === 'completed' ? (
                                  <>
                                    <RotateCcw className="w-4 h-4" /> Nueva votación
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4" /> Iniciar votación
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              aria-label="Editar cargo"
                              onClick={() => {
                                setEditingDeptId(dept.id);
                                setEditDeptName(dept.department);
                                setEditRoleTitle(dept.roleTitle);
                                setEditSeats(dept.seats);
                              }}
                              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Eliminar cargo"
                              onClick={() => deleteDepartmentPosition(session.id, dept.id)}
                              className="p-2.5 rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: COMISIÓN Y ENLACES */}
      {subTab === 'committee' && (
        <div className="space-y-6">
          {/* Pastor Parity & Override Control */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Control de Paridad y Voto del Pastor
                </h3>
                <p className="text-sm text-slate-600">
                  El sistema cuenta únicamente los integrantes habilitados para votar (no los
                  conectados momentáneamente).
                </p>
              </div>
              <div className="text-sm font-medium text-slate-800 bg-slate-100 px-4 py-2.5 rounded-xl tabular-nums">
                Habilitados: <strong>{enabledCount}</strong> (
                {enabledCount === 0 ? 'Sin integrantes' : isEven ? 'Número Par' : 'Número Impar'}) ·
                Voto del Pastor:{' '}
                <strong className={pastorAllowed ? 'text-blue-800' : 'text-slate-600'}>
                  {pastorAllowed ? 'Habilitado (1 voto)' : 'Deshabilitado'}
                </strong>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                Configuración de voto del pastor (modificable antes de iniciar cada votación):
              </p>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
                {(
                  [
                    { id: 'auto', label: 'Automático (Par)' },
                    { id: 'enabled', label: 'Habilitar siempre' },
                    { id: 'disabled', label: 'Deshabilitar' },
                  ] as { id: PastorVoteOverride; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      updatePastorOverrideAndSyncRound(session, opt.id, activeRound)
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      session.pastorVoteEnabledOverride === opt.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Add Committee Member */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Registrar Integrantes de la Comisión
            </h3>
            <p className="text-sm text-slate-600">
              Cada integrante recibe un enlace individual único para proponer y votar desde su
              celular sin contraseña ni cuenta.
            </p>
            <form onSubmit={handleAddCommittee} className="grid sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={commName}
                  onChange={(e) => setCommName(e.target.value)}
                  placeholder="Nombre del integrante de comisión"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  maxLength={80}
                  value={commRole}
                  onChange={(e) => setCommRole(e.target.value)}
                  placeholder="Rol (ej. Anciano, Diaconisa, Jóvenes)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={busyAction === 'add-comm'}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition-colors cursor-pointer min-h-[44px]"
                >
                  <UserPlus className="w-4 h-4" />
                  Generar enlace
                </button>
              </div>
            </form>
          </div>

          {/* Committee List */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {committee.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-900">
                  Aún no hay integrantes en la comisión
                </p>
                <p className="text-sm text-slate-600">
                  Agrega a los hermanos elegidos para la comisión y comparte sus enlaces privados.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {committee.map((member) => {
                  const link = getPersonalLink(member.id);
                  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
                    `Hola ${member.name}, este es tu enlace personal y secreto para votar en la Comisión de Nombramientos de ${session.churchName}: ${link}`
                  )}`;
                  const isCopied = copiedToken === member.id;

                  return (
                    <div
                      key={member.id}
                      className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <h4 className="font-bold text-slate-900">{member.name}</h4>
                          <span className="text-xs text-slate-500">
                            · {member.roleLabel || 'Miembro de Comisión'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 break-all flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 shrink-0" />
                          {link}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            toggleCommitteeMember(
                              session,
                              member.id,
                              !member.enabled,
                              committee,
                              activeRound
                            )
                          }
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer min-h-[44px] transition-colors ${
                            member.enabled
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                              : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          <UserCheck className="w-4 h-4" />
                          {member.enabled ? 'Habilitado' : 'Deshabilitado'}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyPersonalLink(member.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-700" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" /> Copiar enlace
                            </>
                          )}
                        </button>

                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors min-h-[44px]"
                        >
                          <Share2 className="w-4 h-4" />
                          WhatsApp
                        </a>

                        <button
                          type="button"
                          aria-label="Eliminar integrante"
                          onClick={() =>
                            deleteCommitteeMember(session, member.id, committee, activeRound)
                          }
                          className="p-2.5 rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: MIEMBROS APTOS */}
      {subTab === 'members' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Lista de Miembros Aptos para Ser Elegidos
                </h3>
                <p className="text-sm text-slate-600">
                  Importa la feligresía desde Excel (.xlsx, .xls, .csv) o agrega nombres
                  manualmente.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busyAction === 'excel'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors cursor-pointer min-h-[44px]"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {busyAction === 'excel' ? 'Importando...' : 'Cargar Excel / CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Pegar lista múltiple
                </button>
              </div>
            </div>

            {importFeedback && (
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-900">
                {importFeedback}
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!memberName.trim()) return;
                setBusyAction('add-member');
                try {
                  await addEligibleMember(session.id, memberName.trim(), memberNotes.trim());
                  setMemberName('');
                  setMemberNotes('');
                } finally {
                  setBusyAction(null);
                }
              }}
              className="grid sm:grid-cols-12 gap-3"
            >
              <div className="sm:col-span-5">
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Nombre completo del miembro"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  maxLength={240}
                  value={memberNotes}
                  onChange={(e) => setMemberNotes(e.target.value)}
                  placeholder="Observaciones o dones (opcional)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busyAction === 'add-member'}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Buscar miembro..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              {eligibleMembers.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearAllEligibleMembers(session.id, eligibleMembers.map((m) => m.id))}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer self-end sm:self-center"
                >
                  Vaciar lista ({eligibleMembers.length})
                </button>
              )}
            </div>

            {filteredMembers.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No hay miembros registrados que coincidan con tu búsqueda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          member.active ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {member.name}
                      </p>
                      {member.notes && (
                        <p className="text-xs text-slate-500 truncate">{member.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          toggleEligibleMember(session.id, member.id, !member.active)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          member.active
                            ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {member.active ? 'Apto' : 'Inactivo'}
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar miembro"
                        onClick={() => deleteEligibleMember(session.id, member.id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 4: IGLESIA Y SESIONES */}
      {subTab === 'session' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Datos de la Iglesia Actual</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingSessionEdit(true);
                try {
                  await updateSessionSettings(session.id, {
                    churchName: editChurchName,
                    year: editYear,
                  });
                  flashNotice('Datos actualizados.');
                } finally {
                  setSavingSessionEdit(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre de la Iglesia
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={editChurchName}
                  onChange={(e) => setEditChurchName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Período / Año
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={savingSessionEdit}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer min-h-[44px]"
              >
                {savingSessionEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Cambiar o Crear Nueva Comisión</h3>
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {sessions.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {s.churchName}
                    </p>
                    <p className="text-xs text-slate-500">Período {s.year}</p>
                  </div>
                  {s.id === session.id ? (
                    <span className="text-xs font-semibold text-blue-800">Activa</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectSession(s.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Seleccionar
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => {
                  const id = await createSession(
                    user.uid,
                    user.email,
                    'Nueva Iglesia ASD',
                    String(new Date().getFullYear())
                  );
                  onSelectSession(id);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Crear nueva sesión en blanco
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REFERENCIA MANUAL DE IGLESIA ASD */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Cargos del Manual de la Iglesia Adventista
                </h3>
                <p className="text-xs text-slate-600">
                  Selecciona los cargos que deseas incorporar. Luego podrás editar puestos o
                  eliminar cualquiera.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700">
                {selectedTemplateIds.length} de {SDA_CHURCH_MANUAL_TEMPLATES.length} seleccionados
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedTemplateIds(SDA_CHURCH_MANUAL_TEMPLATES.map((t) => t.id))
                  }
                  className="text-blue-800 hover:underline cursor-pointer"
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTemplateIds([])}
                  className="text-slate-600 hover:underline cursor-pointer"
                >
                  Limpiar selección
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto divide-y divide-slate-100">
              {SDA_CHURCH_MANUAL_TEMPLATES.map((tpl) => {
                const checked = selectedTemplateIds.includes(tpl.id);
                return (
                  <label
                    key={tpl.id}
                    className="py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 px-2 rounded-lg"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedTemplateIds((prev) =>
                          prev.includes(tpl.id)
                            ? prev.filter((id) => id !== tpl.id)
                            : [...prev, tpl.id]
                        )
                      }
                      className="mt-1 w-4 h-4 accent-blue-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-slate-900">{tpl.roleTitle}</span>
                        <span className="text-xs font-mono text-slate-500 shrink-0">
                          {tpl.defaultSeats} {tpl.defaultSeats === 1 ? 'puesto' : 'puestos'}
                        </span>
                      </div>
                      <p className="text-xs text-blue-800 font-medium">{tpl.department}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{tpl.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={importingTemplates || selectedTemplateIds.length === 0}
                onClick={handleImportManualTemplates}
                className="px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50"
              >
                {importingTemplates
                  ? 'Cargando cargos...'
                  : `Cargar ${selectedTemplateIds.length} cargos`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PEGAR LISTA MÚLTIPLE DE MIEMBROS */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Pegar Lista de Miembros</h3>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Escribe o pega un nombre por línea. El sistema evitará duplicados automáticamente.
            </p>
            <textarea
              rows={8}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Carlos Méndez\nAna Lucía Torres\nRoberto Gómez'}
              className="w-full p-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyAction === 'bulk-members'}
                onClick={handleBulkAddMembers}
                className="px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer"
              >
                Importar nombres
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
