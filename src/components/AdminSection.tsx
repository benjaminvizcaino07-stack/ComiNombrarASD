import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
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
import {
  getManualTemplateCoverageReason,
  SDA_CHURCH_MANUAL_TEMPLATES,
  SDA_GROUPED_DEPARTMENT_TEMPLATES,
  SdaManualRoleTemplate,
} from '../data/sdaManualPositions';
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
  setSessionLifecycleStatus,
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
  DepartmentVotingMode,
  EligibleMember,
  PastorVoteOverride,
  RoundData,
  SessionData,
} from '../types';
import {
  ParsedMemberRow,
  parseMembersExcel,
  parseMembersPdf,
} from '../utils/exportReports';
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
  const [templateTab, setTemplateTab] = useState<'standard' | 'grouped'>('standard');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    SDA_CHURCH_MANUAL_TEMPLATES.map((t) => t.id)
  );
  const [selectedGroupedIds, setSelectedGroupedIds] = useState<string[]>(
    SDA_GROUPED_DEPARTMENT_TEMPLATES.map((t) => t.id)
  );
  const [importingTemplates, setImportingTemplates] = useState(false);

  // Add/Edit position form
  const [posVotingMode, setPosVotingMode] = useState<DepartmentVotingMode>('standard');
  const [deptName, setDeptName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [leaderRoleInput, setLeaderRoleInput] = useState('');
  const [membersRoleInput, setMembersRoleInput] = useState('');
  const [seatsInput, setSeatsInput] = useState(1);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editVotingMode, setEditVotingMode] = useState<DepartmentVotingMode>('standard');
  const [editDeptName, setEditDeptName] = useState('');
  const [editRoleTitle, setEditRoleTitle] = useState('');
  const [editLeaderRoleTitle, setEditLeaderRoleTitle] = useState('');
  const [editMembersRoleTitle, setEditMembersRoleTitle] = useState('');
  const [editSeats, setEditSeats] = useState(1);

  // Committee member form
  const [commName, setCommName] = useState('');
  const [commRole, setCommRole] = useState('Miembro de Comisión');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [committeeError, setCommitteeError] = useState<string | null>(null);
  const [lastGeneratedLink, setLastGeneratedLink] = useState<{
    name: string;
    link: string;
    token: string;
  } | null>(null);

  // Eligible members form
  const [memberName, setMemberName] = useState('');
  const [memberNotes, setMemberNotes] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfPreviewState, setPdfPreviewState] = useState<{
    fileName: string;
    rows: ParsedMemberRow[];
    selectedIndices: Set<number>;
    alreadyRegisteredCount: number;
  } | null>(null);

  // Session edit form
  const [editChurchName, setEditChurchName] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editPastorName, setEditPastorName] = useState('');
  const [editSecretaryName, setEditSecretaryName] = useState('');
  const [savingSessionEdit, setSavingSessionEdit] = useState(false);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const coveredReasonById = useMemo(() => {
    const map = new Map<string, string>();
    [...SDA_CHURCH_MANUAL_TEMPLATES, ...SDA_GROUPED_DEPARTMENT_TEMPLATES].forEach((tpl) => {
      const reason = getManualTemplateCoverageReason(tpl, departments);
      if (reason) {
        map.set(tpl.id, reason);
      }
    });
    return map;
  }, [departments]);

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
                      {s.sessionStatus === 'paused' && (
                        <span className="font-semibold text-amber-800"> · En pausa</span>
                      )}
                      {s.sessionStatus === 'ended' && (
                        <span className="font-semibold text-emerald-700"> · Finalizada</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectSession(s.id)}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {s.sessionStatus === 'paused' ? 'Reanudar comisión' : 'Abrir comisión'}
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

  const extractUserErrorMessage = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    let inner = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        inner = parsed.error;
      }
    } catch {
      // keep raw
    }
    if (inner.includes('Missing or insufficient permissions') || inner.includes('permission-denied')) {
      return 'Permisos insuficientes en la base de datos. Cierra sesión y vuelve a ingresar como Pastor o Secretario.';
    }
    if (inner.includes('Quota exceeded')) {
      return 'Se alcanzó el límite diario gratuito de operaciones en la base de datos.';
    }
    if (inner.includes('offline') || inner.includes('unavailable')) {
      return 'Sin conexión con la nube. Verifica tu internet e intenta nuevamente.';
    }
    return inner || 'Ocurrió un error al guardar los datos. Intenta nuevamente.';
  };

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) return;

    if (posVotingMode === 'grouped') {
      const cleanLeader = leaderRoleInput.trim();
      const cleanMembers = membersRoleInput.trim();
      if (!cleanLeader || !cleanMembers) {
        setActionError(
          'En el modo agrupado debes indicar tanto el cargo principal como el cargo de los demás integrantes.'
        );
        return;
      }
      const totalSeats = Math.max(2, Math.min(50, seatsInput));
      const composedTitle = `${cleanLeader} y ${cleanMembers}`;
      setActionError(null);
      setBusyAction('add-pos');
      try {
        await addDepartmentPosition(
          session.id,
          deptName.trim(),
          composedTitle,
          totalSeats,
          departments.length,
          {
            votingMode: 'grouped',
            leaderRoleTitle: cleanLeader,
            membersRoleTitle: cleanMembers,
          }
        );
        setDeptName('');
        setLeaderRoleInput('');
        setMembersRoleInput('');
        setSeatsInput(5);
        flashNotice('Departamento agrupado agregado correctamente.');
      } catch (err) {
        setActionError(extractUserErrorMessage(err));
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (!roleTitle.trim()) return;
    setActionError(null);
    setBusyAction('add-pos');
    try {
      await addDepartmentPosition(
        session.id,
        deptName.trim(),
        roleTitle.trim(),
        seatsInput,
        departments.length,
        { votingMode: 'standard' }
      );
      setDeptName('');
      setRoleTitle('');
      setSeatsInput(1);
      flashNotice('Cargo agregado correctamente.');
    } catch (err) {
      setActionError(extractUserErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const openManualModal = () => {
    setSelectedTemplateIds(
      SDA_CHURCH_MANUAL_TEMPLATES.filter((t) => !coveredReasonById.has(t.id)).map((t) => t.id)
    );
    setSelectedGroupedIds(
      SDA_GROUPED_DEPARTMENT_TEMPLATES.filter((t) => !coveredReasonById.has(t.id)).map((t) => t.id)
    );
    setShowManualModal(true);
  };

  const handleImportManualTemplates = async () => {
    const source =
      templateTab === 'grouped' ? SDA_GROUPED_DEPARTMENT_TEMPLATES : SDA_CHURCH_MANUAL_TEMPLATES;
    const activeIds = templateTab === 'grouped' ? selectedGroupedIds : selectedTemplateIds;
    const selectedTemplates = source.filter((t) => activeIds.includes(t.id));
    const chosen: SdaManualRoleTemplate[] = selectedTemplates.filter(
      (t) => !coveredReasonById.has(t.id)
    );
    if (chosen.length === 0) {
      flashNotice(
        'Todos los cargos seleccionados ya están agregados o incluidos en departamentos agrupados.'
      );
      return;
    }
    const omittedCount = selectedTemplates.length - chosen.length;
    setActionError(null);
    setImportingTemplates(true);
    try {
      await batchAddManualTemplates(session.id, chosen, departments.length);
      setShowManualModal(false);
      const baseMsg =
        templateTab === 'grouped'
          ? `Se cargaron ${chosen.length} departamentos agrupados del Manual de Iglesia.`
          : `Se cargaron ${chosen.length} cargos del Manual de Iglesia.`;
      flashNotice(
        omittedCount > 0
          ? `${baseMsg} (${omittedCount} omitidos por estar ya cubiertos).`
          : baseMsg
      );
    } catch (err) {
      setActionError(extractUserErrorMessage(err));
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
    setActionError(null);
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
    } catch (err) {
      setActionError(extractUserErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const getPersonalLink = (token: string) =>
    `${window.location.origin}/?s=${encodeURIComponent(session.id)}&t=${encodeURIComponent(token)}`;

  const copyPersonalLink = async (token: string) => {
    const url = getPersonalLink(token);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken((curr) => (curr === token ? null : curr)), 2200);
  };

  const handleAddCommittee = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommitteeError(null);
    setActionError(null);
    const cleanName = commName.trim();
    if (!cleanName) {
      setCommitteeError('Escribe el nombre del integrante de la comisión antes de generar su enlace.');
      return;
    }
    setBusyAction('add-comm');
    try {
      const token = await addCommitteeMember(
        session,
        cleanName,
        commRole.trim(),
        committee,
        activeRound
      );
      const link = getPersonalLink(token);
      setLastGeneratedLink({ name: cleanName, link, token });
      setCommName('');
      if (!commRole.trim()) {
        setCommRole('Miembro de Comisión');
      }
      flashNotice(`Enlace personal generado para ${cleanName}.`);
    } catch (err) {
      setCommitteeError(extractUserErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleMemberFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFeedback(null);
    const isPdf =
      file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    setBusyAction(isPdf ? 'pdf' : 'excel');
    try {
      if (isPdf) {
        const parsed = await parseMembersPdf(file);
        if (parsed.length === 0) {
          setImportFeedback('No se encontraron nombres válidos en el archivo PDF seleccionado.');
          return;
        }
        const existingNames = new Set(eligibleMembers.map((m) => m.name.toLowerCase()));
        const newRows = parsed.filter((r) => !existingNames.has(r.name.toLowerCase()));
        const alreadyRegisteredCount = parsed.length - newRows.length;
        if (newRows.length === 0) {
          setImportFeedback('Todos los nombres detectados en el PDF ya estaban registrados.');
          return;
        }
        setPdfPreviewState({
          fileName: file.name,
          rows: newRows,
          selectedIndices: new Set(newRows.map((_, idx) => idx)),
          alreadyRegisteredCount,
        });
        return;
      }

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
    } catch (err) {
      if (isPdf) {
        if (err instanceof Error && err.message === 'NO_TEXT_PDF') {
          setImportFeedback(
            'El PDF no contiene texto seleccionable (parece ser una imagen escaneada). Usa un PDF con texto o un archivo Excel/CSV.'
          );
        } else {
          setImportFeedback(
            'Error al leer el archivo PDF. Verifica que no esté dañado ni protegido con contraseña.'
          );
        }
      } else {
        setImportFeedback('Error al leer el archivo. Verifica que sea .xlsx, .xls o .csv.');
      }
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleConfirmPdfImport = async () => {
    if (!pdfPreviewState) return;
    const chosen = pdfPreviewState.rows.filter((_, idx) =>
      pdfPreviewState.selectedIndices.has(idx)
    );
    if (chosen.length === 0) return;

    setActionError(null);
    setBusyAction('pdf-confirm');
    try {
      const added = await batchAddEligibleMembers(session.id, chosen);
      setPdfPreviewState(null);
      setImportFeedback(`Se importaron ${added} miembros desde PDF correctamente.`);
    } catch (err) {
      setActionError(extractUserErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleBulkAddMembers = async () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 2);
    if (lines.length === 0) return;

    setActionError(null);
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
    } catch (err) {
      setActionError(extractUserErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
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

      {actionError && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
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
            {(session.sessionStatus ?? 'active') === 'active' ? (
              <button
                type="button"
                disabled={busyAction === 'session-lifecycle'}
                onClick={async () => {
                  setActionError(null);
                  setBusyAction('session-lifecycle');
                  try {
                    await setSessionLifecycleStatus(session, 'paused', activeRound);
                    flashNotice(
                      'Sesión pausada. Todo quedó guardado y los enlaces de los miembros siguen activos para reanudar otro día.'
                    );
                  } catch (err) {
                    setActionError(extractUserErrorMessage(err));
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold hover:bg-amber-100 cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                <Pause className="w-3.5 h-3.5" />
                Pausar sesión (otro día)
              </button>
            ) : (
              <button
                type="button"
                disabled={busyAction === 'session-lifecycle'}
                onClick={async () => {
                  setActionError(null);
                  setBusyAction('session-lifecycle');
                  try {
                    await setSessionLifecycleStatus(session, 'active', activeRound);
                    flashNotice('Sesión reanudada. Los enlaces de los miembros ya están activos.');
                  } catch (err) {
                    setActionError(extractUserErrorMessage(err));
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                <Play className="w-3.5 h-3.5" />
                {session.sessionStatus === 'paused' ? 'Reanudar sesión' : 'Reabrir sesión'}
              </button>
            )}
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
              setEditPastorName(session.pastorName ?? '');
              setEditSecretaryName(session.secretaryName ?? '');
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
                onClick={openManualModal}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 font-semibold text-sm hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                <BookOpen className="w-4 h-4" />
                Referencia Manual de Iglesia ASD
              </button>
            </div>

            <div className="pt-2 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">
                  Modo de votación para el nuevo registro:
                </span>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPosVotingMode('standard');
                      if (seatsInput > 1 && !deptName) setSeatsInput(1);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      posVotingMode === 'standard'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cargo individual
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPosVotingMode('grouped');
                      if (seatsInput < 2) setSeatsInput(5);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      posVotingMode === 'grouped'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Agrupado por departamento (Principal + Integrantes)
                  </button>
                </div>
              </div>

              {posVotingMode === 'grouped' && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                  <p className="text-xs text-blue-950 leading-relaxed">
                    <strong>Modo agrupado:</strong> La comisión propone los integrantes del
                    departamento y vota por <strong>1 persona</strong> para el cargo principal (ej.{' '}
                    <em>Primer Anciano</em>). El candidato más votado ocupa el cargo principal y los
                    demás propuestos quedan elegidos automáticamente para el resto de puestos (ej.{' '}
                    <em>Ancianos de Iglesia</em>).
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-blue-900 mr-1">
                      Plantillas rápidas:
                    </span>
                    {SDA_GROUPED_DEPARTMENT_TEMPLATES.slice(0, 6).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setDeptName(preset.department);
                          setLeaderRoleInput(preset.leaderRoleTitle || '');
                          setMembersRoleInput(preset.membersRoleTitle || '');
                          setSeatsInput(preset.defaultSeats);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 text-xs font-semibold text-blue-900 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        {preset.department} ({preset.defaultSeats})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleAddPosition} className="grid sm:grid-cols-12 gap-3">
                <div className={posVotingMode === 'grouped' ? 'sm:col-span-3' : 'sm:col-span-4'}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Departamento
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder={
                      posVotingMode === 'grouped' ? 'Ej. Ancianato' : 'Ej. Escuela Sabática'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                {posVotingMode === 'grouped' ? (
                  <>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Cargo principal (#1 votado)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={140}
                        value={leaderRoleInput}
                        onChange={(e) => setLeaderRoleInput(e.target.value)}
                        placeholder="Ej. Primer Anciano"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Cargo demás propuestos
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={140}
                        value={membersRoleInput}
                        onChange={(e) => setMembersRoleInput(e.target.value)}
                        placeholder="Ej. Ancianos de Iglesia"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                  </>
                ) : (
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
                )}

                <div className={posVotingMode === 'grouped' ? 'sm:col-span-1' : 'sm:col-span-2'}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {posVotingMode === 'grouped' ? 'Total' : 'Personas a elegir'}
                  </label>
                  <input
                    type="number"
                    min={posVotingMode === 'grouped' ? 2 : 1}
                    max={50}
                    required
                    value={seatsInput}
                    onChange={(e) =>
                      setSeatsInput(
                        Math.max(
                          posVotingMode === 'grouped' ? 2 : 1,
                          Number(e.target.value) || (posVotingMode === 'grouped' ? 2 : 1)
                        )
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700"
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
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {orderedDepartments.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="font-semibold text-slate-900">No hay cargos cargados todavía</p>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Usa el botón &ldquo;Referencia Manual de Iglesia ASD&rdquo; para cargar los
                  departamentos oficiales (individuales o agrupados) o agrégalos manualmente arriba.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orderedDepartments.map((dept) => {
                  const isEditing = editingDeptId === dept.id;
                  const isGroupedDept = dept.votingMode === 'grouped' && dept.seats >= 2;
                  const isThisActive =
                    activeRound && activeRound.departmentId === dept.id && activeRound.status !== 'closed';

                  return (
                    <div
                      key={dept.id}
                      className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      {isEditing ? (
                        <div className="flex-1 space-y-3">
                          {dept.status === 'pending' && (
                            <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
                              <button
                                type="button"
                                onClick={() => setEditVotingMode('standard')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                  editVotingMode === 'standard'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Cargo individual
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditVotingMode('grouped');
                                  if (editSeats < 2) setEditSeats(2);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                  editVotingMode === 'grouped'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Agrupado por departamento
                              </button>
                            </div>
                          )}

                          <div className="grid sm:grid-cols-12 gap-2.5">
                            <input
                              type="text"
                              value={editDeptName}
                              onChange={(e) => setEditDeptName(e.target.value)}
                              placeholder="Departamento"
                              className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                            {editVotingMode === 'grouped' ? (
                              <>
                                <input
                                  type="text"
                                  value={editLeaderRoleTitle}
                                  onChange={(e) => setEditLeaderRoleTitle(e.target.value)}
                                  placeholder="Cargo principal (#1)"
                                  className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                                <input
                                  type="text"
                                  value={editMembersRoleTitle}
                                  onChange={(e) => setEditMembersRoleTitle(e.target.value)}
                                  placeholder="Cargo demás integrantes"
                                  className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                              </>
                            ) : (
                              <input
                                type="text"
                                value={editRoleTitle}
                                onChange={(e) => setEditRoleTitle(e.target.value)}
                                placeholder="Cargo"
                                className="sm:col-span-6 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                              />
                            )}
                            <input
                              type="number"
                              min={editVotingMode === 'grouped' ? 2 : 1}
                              max={50}
                              value={editSeats}
                              onChange={(e) =>
                                setEditSeats(
                                  Math.max(
                                    editVotingMode === 'grouped' ? 2 : 1,
                                    Number(e.target.value) || (editVotingMode === 'grouped' ? 2 : 1)
                                  )
                                )
                              }
                              className="sm:col-span-1 px-2.5 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                            />
                            <div className="sm:col-span-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (editVotingMode === 'grouped') {
                                    const cleanLeader = editLeaderRoleTitle.trim() || 'Cargo Principal';
                                    const cleanMembers = editMembersRoleTitle.trim() || 'Integrantes';
                                    await updateDepartmentPosition(session.id, dept.id, {
                                      department: editDeptName,
                                      roleTitle: `${cleanLeader} y ${cleanMembers}`,
                                      votingMode: 'grouped',
                                      leaderRoleTitle: cleanLeader,
                                      membersRoleTitle: cleanMembers,
                                      seats: Math.max(2, editSeats),
                                    });
                                  } else {
                                    await updateDepartmentPosition(session.id, dept.id, {
                                      department: editDeptName,
                                      roleTitle: editRoleTitle,
                                      votingMode: 'standard',
                                      seats: editSeats,
                                    });
                                  }
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
                              {isGroupedDept && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-semibold text-blue-800">
                                    Agrupado: 1 {dept.leaderRoleTitle || 'Principal'} +{' '}
                                    {Math.max(1, dept.seats - 1)}{' '}
                                    {dept.membersRoleTitle || 'Integrantes'}
                                  </span>
                                </>
                              )}
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
                            {isGroupedDept &&
                            (dept.leaderElectedName ||
                              (dept.memberElectedNames && dept.memberElectedNames.length > 0)) ? (
                              <div className="text-sm text-emerald-800 font-medium space-y-0.5">
                                {dept.leaderElectedName && (
                                  <p>
                                    {dept.leaderRoleTitle || 'Cargo Principal'}:{' '}
                                    <strong>{dept.leaderElectedName}</strong>
                                  </p>
                                )}
                                {dept.memberElectedNames && dept.memberElectedNames.length > 0 && (
                                  <p>
                                    {dept.membersRoleTitle || 'Integrantes'}:{' '}
                                    {dept.memberElectedNames.join(', ')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              dept.electedNames.length > 0 && (
                                <p className="text-sm text-emerald-800 font-medium">
                                  Elegidos: {dept.electedNames.join(', ')}
                                </p>
                              )
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
                                      votingMode: dept.votingMode ?? 'standard',
                                      seats: Math.max(
                                        isGroupedDept ? 2 : 1,
                                        dept.seats - 1
                                      ),
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
                                      votingMode: dept.votingMode ?? 'standard',
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
                                setEditVotingMode(
                                  dept.votingMode === 'grouped' ? 'grouped' : 'standard'
                                );
                                setEditDeptName(dept.department);
                                setEditRoleTitle(dept.roleTitle);
                                setEditLeaderRoleTitle(dept.leaderRoleTitle || '');
                                setEditMembersRoleTitle(dept.membersRoleTitle || '');
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

            {committeeError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between gap-2"
              >
                <span>{committeeError}</span>
                <button
                  type="button"
                  onClick={() => setCommitteeError(null)}
                  className="text-rose-700 hover:text-rose-900 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <form onSubmit={handleAddCommittee} className="grid sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={commName}
                  onChange={(e) => {
                    setCommName(e.target.value);
                    if (committeeError) setCommitteeError(null);
                  }}
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
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition-colors cursor-pointer disabled:opacity-60 min-h-[44px]"
                >
                  <UserPlus className="w-4 h-4" />
                  {busyAction === 'add-comm' ? 'Generando enlace...' : 'Generar enlace'}
                </button>
              </div>
            </form>

            {lastGeneratedLink && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-emerald-950">
                    Enlace generado para {lastGeneratedLink.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLastGeneratedLink(null)}
                    className="text-emerald-800 hover:text-emerald-950 cursor-pointer"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs font-mono text-emerald-900 break-all bg-white/80 px-3 py-2 rounded-lg border border-emerald-200">
                  {lastGeneratedLink.link}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyPersonalLink(lastGeneratedLink.token)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-950 text-xs font-semibold hover:bg-emerald-100 cursor-pointer min-h-[40px]"
                  >
                    {copiedToken === lastGeneratedLink.token ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-700" /> Enlace copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copiar enlace
                      </>
                    )}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Hola ${lastGeneratedLink.name}, este es tu enlace personal y secreto para votar en la Comisión de Nombramientos de ${session.churchName}: ${lastGeneratedLink.link}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors min-h-[40px]"
                  >
                    <Share2 className="w-4 h-4" />
                    Enviar por WhatsApp
                  </a>
                </div>
              </div>
            )}
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
                          onClick={async () => {
                            setCommitteeError(null);
                            try {
                              await toggleCommitteeMember(
                                session,
                                member.id,
                                !member.enabled,
                                committee,
                                activeRound
                              );
                            } catch (err) {
                              setCommitteeError(extractUserErrorMessage(err));
                            }
                          }}
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
                          onClick={async () => {
                            setCommitteeError(null);
                            try {
                              await deleteCommitteeMember(
                                session,
                                member.id,
                                committee,
                                activeRound
                              );
                              if (lastGeneratedLink?.token === member.id) {
                                setLastGeneratedLink(null);
                              }
                            } catch (err) {
                              setCommitteeError(extractUserErrorMessage(err));
                            }
                          }}
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
                  Importa la feligresía desde Excel (.xlsx, .xls, .csv), PDF (.pdf) o agrega
                  nombres manualmente.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={handleMemberFileUpload}
                  className="hidden"
                />
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleMemberFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busyAction === 'excel' || busyAction === 'pdf'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors cursor-pointer min-h-[44px] disabled:opacity-60"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {busyAction === 'excel' ? 'Importando...' : 'Cargar Excel / CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={busyAction === 'excel' || busyAction === 'pdf'}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 transition-colors cursor-pointer min-h-[44px] disabled:opacity-60"
                >
                  <FileText className="w-4 h-4" />
                  {busyAction === 'pdf' ? 'Leyendo PDF...' : 'Cargar PDF'}
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
                setActionError(null);
                setBusyAction('add-member');
                try {
                  await addEligibleMember(session.id, memberName.trim(), memberNotes.trim());
                  setMemberName('');
                  setMemberNotes('');
                } catch (err) {
                  setActionError(extractUserErrorMessage(err));
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
                    pastorName: editPastorName,
                    secretaryName: editSecretaryName,
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Pastor
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={editPastorName}
                  onChange={(e) => setEditPastorName(e.target.value)}
                  placeholder="Ej. Pr. Juan Pérez"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre de la Secretaria(o)
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={editSecretaryName}
                  onChange={(e) => setEditSecretaryName(e.target.value)}
                  placeholder="Ej. Hna. María López"
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
                    <p className="text-xs text-slate-500">
                      Período {s.year}
                      {s.sessionStatus === 'paused' && (
                        <span className="font-semibold text-amber-800"> · En pausa</span>
                      )}
                      {s.sessionStatus === 'ended' && (
                        <span className="font-semibold text-emerald-700"> · Finalizada</span>
                      )}
                    </p>
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
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Cargos del Manual de la Iglesia Adventista
                </h3>
                <p className="text-xs text-slate-600">
                  Elige si deseas cargar cargos individuales o departamentos agrupados (cargo
                  principal + integrantes).
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

            <div className="px-5 pt-3 pb-2 border-b border-slate-200 bg-white">
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setTemplateTab('standard')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    templateTab === 'standard'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cargos individuales ({SDA_CHURCH_MANUAL_TEMPLATES.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateTab('grouped')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    templateTab === 'grouped'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Agrupados por departamento ({SDA_GROUPED_DEPARTMENT_TEMPLATES.length})
                </button>
              </div>
            </div>

            {(() => {
              const activeList =
                templateTab === 'grouped'
                  ? SDA_GROUPED_DEPARTMENT_TEMPLATES
                  : SDA_CHURCH_MANUAL_TEMPLATES;
              const rawSelected =
                templateTab === 'grouped' ? selectedGroupedIds : selectedTemplateIds;
              const activeSelected = rawSelected.filter((id) => !coveredReasonById.has(id));
              const availableTemplates = activeList.filter((t) => !coveredReasonById.has(t.id));
              const coveredCount = activeList.length - availableTemplates.length;
              const setActiveSelected =
                templateTab === 'grouped' ? setSelectedGroupedIds : setSelectedTemplateIds;

              return (
                <>
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                    <span className="text-slate-700 tabular-nums">
                      {activeSelected.length} de {availableTemplates.length} disponibles seleccionados
                      {coveredCount > 0 && (
                        <span className="text-amber-800 font-medium">
                          {' '}
                          · {coveredCount} omitidos (ya agregados o agrupados)
                        </span>
                      )}
                    </span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={availableTemplates.length === 0}
                        onClick={() => setActiveSelected(availableTemplates.map((t) => t.id))}
                        className="text-blue-800 hover:underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Seleccionar todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSelected([])}
                        className="text-slate-600 hover:underline cursor-pointer"
                      >
                        Limpiar selección
                      </button>
                    </div>
                  </div>

                  <div className="p-5 overflow-y-auto divide-y divide-slate-100">
                    {activeList.map((tpl) => {
                      const coveredReason = coveredReasonById.get(tpl.id);
                      const isCovered = Boolean(coveredReason);
                      const checked = !isCovered && activeSelected.includes(tpl.id);
                      return (
                        <label
                          key={tpl.id}
                          className={`py-3 flex items-start gap-3 px-2 rounded-lg ${
                            isCovered
                              ? 'opacity-65 cursor-not-allowed bg-slate-50/60'
                              : 'cursor-pointer hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isCovered}
                            checked={checked}
                            onChange={() => {
                              if (isCovered) return;
                              setActiveSelected((prev) => {
                                const cleaned = prev.filter((id) => !coveredReasonById.has(id));
                                return cleaned.includes(tpl.id)
                                  ? cleaned.filter((id) => id !== tpl.id)
                                  : [...cleaned, tpl.id];
                              });
                            }}
                            className="mt-1 w-4 h-4 accent-blue-800 disabled:cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                {tpl.roleTitle}
                              </span>
                              <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                                {tpl.votingMode === 'grouped'
                                  ? `1 + ${Math.max(1, tpl.defaultSeats - 1)} (${tpl.defaultSeats} total)`
                                  : `${tpl.defaultSeats} ${
                                      tpl.defaultSeats === 1 ? 'puesto' : 'puestos'
                                    }`}
                              </span>
                            </div>
                            <p className="text-xs text-blue-800 font-medium">
                              {tpl.department}
                              {tpl.votingMode === 'grouped' &&
                                tpl.leaderRoleTitle &&
                                tpl.membersRoleTitle &&
                                ` · Vota: ${tpl.leaderRoleTitle} · Demás: ${tpl.membersRoleTitle}`}
                              {coveredReason && (
                                <span className="text-amber-800 font-semibold">
                                  {' '}
                                  · {coveredReason}
                                </span>
                              )}
                            </p>
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
                      disabled={importingTemplates || activeSelected.length === 0}
                      onClick={handleImportManualTemplates}
                      className="px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50"
                    >
                      {importingTemplates
                        ? 'Cargando...'
                        : templateTab === 'grouped'
                          ? `Cargar ${activeSelected.length} agrupados`
                          : `Cargar ${activeSelected.length} cargos`}
                    </button>
                  </div>
                </>
              );
            })()}
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

      {/* MODAL: VISTA PREVIA DE NOMBRES DETECTADOS EN PDF */}
      {pdfPreviewState && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">
                  Nombres detectados en el PDF
                </h3>
                <p className="text-xs text-slate-600 truncate">
                  Archivo: {pdfPreviewState.fileName} · Revisa la lista y desmarca cualquier línea
                  que no corresponda a un miembro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPdfPreviewState(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
              <span className="text-slate-700 tabular-nums">
                {pdfPreviewState.selectedIndices.size} de {pdfPreviewState.rows.length} seleccionados
                {pdfPreviewState.alreadyRegisteredCount > 0 && (
                  <span className="text-slate-500 font-medium">
                    {' '}
                    · {pdfPreviewState.alreadyRegisteredCount} ya registrados omitidos
                  </span>
                )}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setPdfPreviewState((prev) =>
                      prev
                        ? {
                            ...prev,
                            selectedIndices: new Set(prev.rows.map((_, idx) => idx)),
                          }
                        : null
                    )
                  }
                  className="text-blue-800 hover:underline cursor-pointer"
                >
                  Seleccionar todos
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPdfPreviewState((prev) =>
                      prev ? { ...prev, selectedIndices: new Set() } : null
                    )
                  }
                  className="text-slate-600 hover:underline cursor-pointer"
                >
                  Limpiar selección
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto divide-y divide-slate-100">
              {pdfPreviewState.rows.map((row, idx) => {
                const checked = pdfPreviewState.selectedIndices.has(idx);
                return (
                  <label
                    key={`${row.name}-${idx}`}
                    className="py-2.5 px-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg min-h-[44px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setPdfPreviewState((prev) => {
                          if (!prev) return null;
                          const next = new Set(prev.selectedIndices);
                          if (next.has(idx)) {
                            next.delete(idx);
                          } else {
                            next.add(idx);
                          }
                          return { ...prev, selectedIndices: next };
                        })
                      }
                      className="w-4 h-4 accent-blue-800 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
                      {row.notes && (
                        <p className="text-xs text-slate-500 truncate">{row.notes}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
              <button
                type="button"
                onClick={() => setPdfPreviewState(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold cursor-pointer min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  busyAction === 'pdf-confirm' || pdfPreviewState.selectedIndices.size === 0
                }
                onClick={handleConfirmPdfImport}
                className="px-5 py-2.5 rounded-xl bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {busyAction === 'pdf-confirm'
                  ? 'Importando...'
                  : `Importar ${pdfPreviewState.selectedIndices.size} miembros`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
