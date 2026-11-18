import { DepartmentPosition } from '../types';

export interface SdaManualRoleTemplate {
  id: string;
  department: string;
  roleTitle: string;
  defaultSeats: number;
  description: string;
  votingMode?: 'standard' | 'grouped';
  leaderRoleTitle?: string;
  membersRoleTitle?: string;
}

export const SDA_GROUPED_DEPARTMENT_TEMPLATES: SdaManualRoleTemplate[] = [
  {
    id: 'grp_anc',
    department: 'Ancianato',
    roleTitle: 'Primer Anciano y Ancianos de Iglesia',
    defaultSeats: 5,
    votingMode: 'grouped',
    leaderRoleTitle: 'Primer Anciano',
    membersRoleTitle: 'Ancianos de Iglesia',
    description:
      'Se proponen los ancianos, se vota por el Primer Anciano y los demás propuestos quedan elegidos como Ancianos de Iglesia.',
  },
  {
    id: 'grp_dia',
    department: 'Diaconado',
    roleTitle: 'Diácono Jefe y Diáconos',
    defaultSeats: 7,
    votingMode: 'grouped',
    leaderRoleTitle: 'Diácono Jefe',
    membersRoleTitle: 'Diáconos',
    description:
      'Se proponen los diáconos, se vota por el Diácono Jefe y los demás propuestos completan el cuerpo de Diáconos.',
  },
  {
    id: 'grp_dias',
    department: 'Diaconisas',
    roleTitle: 'Diaconisa Jefe y Diaconisas',
    defaultSeats: 7,
    votingMode: 'grouped',
    leaderRoleTitle: 'Diaconisa Jefe',
    membersRoleTitle: 'Diaconisas',
    description:
      'Se proponen las diaconisas, se vota por la Diaconisa Jefe y las demás propuestas completan el cuerpo de Diaconisas.',
  },
  {
    id: 'grp_sec',
    department: 'Secretaría de Iglesia',
    roleTitle: 'Secretario(a) y Asociados',
    defaultSeats: 2,
    votingMode: 'grouped',
    leaderRoleTitle: 'Secretario(a) de Iglesia',
    membersRoleTitle: 'Secretario(a) Asociado(a)',
    description:
      'Se proponen los candidatos de secretaría, se vota por el Secretario(a) titular y el resto queda como asociado.',
  },
  {
    id: 'grp_tes',
    department: 'Tesorería de Iglesia',
    roleTitle: 'Tesorero(a) y Asociados',
    defaultSeats: 2,
    votingMode: 'grouped',
    leaderRoleTitle: 'Tesorero(a) de Iglesia',
    membersRoleTitle: 'Tesorero(a) Asociado(a)',
    description:
      'Se proponen los candidatos de tesorería, se vota por el Tesorero(a) titular y los demás quedan como asociados.',
  },
  {
    id: 'grp_es',
    department: 'Escuela Sabática',
    roleTitle: 'Director(a) y Asociados de Escuela Sabática',
    defaultSeats: 3,
    votingMode: 'grouped',
    leaderRoleTitle: 'Director(a) de Escuela Sabática',
    membersRoleTitle: 'Directores Asociados de Escuela Sabática',
    description:
      'Se proponen los integrantes del equipo, se vota por el Director(a) y los demás quedan como asociados.',
  },
  {
    id: 'grp_mp',
    department: 'Ministerio Personal',
    roleTitle: 'Director(a) y Asociados de Ministerio Personal',
    defaultSeats: 2,
    votingMode: 'grouped',
    leaderRoleTitle: 'Director(a) de Ministerio Personal',
    membersRoleTitle: 'Asociados de Ministerio Personal',
    description:
      'Se proponen los integrantes y se elige al Director(a) principal junto con sus asociados.',
  },
  {
    id: 'grp_ja',
    department: 'Jóvenes Adventistas (JA)',
    roleTitle: 'Director(a) y Asociados de Jóvenes',
    defaultSeats: 3,
    votingMode: 'grouped',
    leaderRoleTitle: 'Director(a) de Jóvenes',
    membersRoleTitle: 'Directores Asociados de Jóvenes',
    description:
      'Se proponen los líderes juveniles, se vota por el Director(a) y los demás quedan como asociados.',
  },
  {
    id: 'grp_conq',
    department: 'Conquistadores',
    roleTitle: 'Director(a) y Subdirectores de Conquistadores',
    defaultSeats: 3,
    votingMode: 'grouped',
    leaderRoleTitle: 'Director(a) del Club de Conquistadores',
    membersRoleTitle: 'Subdirectores de Conquistadores',
    description:
      'Se proponen los guías, se vota por el Director(a) del club y los demás quedan como subdirectores.',
  },
  {
    id: 'grp_ave',
    department: 'Aventureros',
    roleTitle: 'Director(a) y Subdirectores de Aventureros',
    defaultSeats: 3,
    votingMode: 'grouped',
    leaderRoleTitle: 'Director(a) del Club de Aventureros',
    membersRoleTitle: 'Subdirectores de Aventureros',
    description:
      'Se proponen los líderes, se vota por el Director(a) y los demás quedan como subdirectores.',
  },
];

export const SDA_CHURCH_MANUAL_TEMPLATES: SdaManualRoleTemplate[] = [
  {
    id: 'anc_1',
    department: 'Ancianato',
    roleTitle: 'Primer Anciano',
    defaultSeats: 1,
    description: 'Coordina la junta de ancianos y asiste al pastor en el liderazgo espiritual.',
  },
  {
    id: 'anc_2',
    department: 'Ancianato',
    roleTitle: 'Ancianos de Iglesia',
    defaultSeats: 4,
    description: 'Líderes espirituales ordenados para velar por la congregación.',
  },
  {
    id: 'sec_1',
    department: 'Secretaría de Iglesia',
    roleTitle: 'Secretario(a) de Iglesia',
    defaultSeats: 1,
    description: 'Mantiene actas de juntas y registros de feligresía.',
  },
  {
    id: 'sec_2',
    department: 'Secretaría de Iglesia',
    roleTitle: 'Secretario(a) Asociado(a)',
    defaultSeats: 1,
    description: 'Apoya en actas, cartas de traslado y registros administrativos.',
  },
  {
    id: 'tes_1',
    department: 'Tesorería de Iglesia',
    roleTitle: 'Tesorero(a) de Iglesia',
    defaultSeats: 1,
    description: 'Custodia diezmos, ofrendas y fondos locales con informes periódicos.',
  },
  {
    id: 'tes_2',
    department: 'Tesorería de Iglesia',
    roleTitle: 'Tesorero(a) Asociado(a)',
    defaultSeats: 1,
    description: 'Asiste en el conteo, registro y depósitos financieros.',
  },
  {
    id: 'dia_1',
    department: 'Diaconado',
    roleTitle: 'Diácono Jefe',
    defaultSeats: 1,
    description: 'Organiza al cuerpo de diáconos para cultos, ordenanzas y visitas.',
  },
  {
    id: 'dia_2',
    department: 'Diaconado',
    roleTitle: 'Diáconos',
    defaultSeats: 6,
    description: 'Asisten en ordenanzas, cuidado del templo y atención a necesitados.',
  },
  {
    id: 'dias_1',
    department: 'Diaconisas',
    roleTitle: 'Diaconisa Jefe',
    defaultSeats: 1,
    description: 'Coordina los preparativos de bautismos, santa cena y asistencia.',
  },
  {
    id: 'dias_2',
    department: 'Diaconisas',
    roleTitle: 'Diaconisas',
    defaultSeats: 6,
    description: 'Apoyan en ceremonias, visitación y ministerio de hospitalidad.',
  },
  {
    id: 'es_1',
    department: 'Escuela Sabática',
    roleTitle: 'Director(a) de Escuela Sabática',
    defaultSeats: 1,
    description: 'Dirige el estudio bíblico sabático y la formación de maestros.',
  },
  {
    id: 'es_2',
    department: 'Escuela Sabática',
    roleTitle: 'Secretario(a) de Escuela Sabática',
    defaultSeats: 1,
    description: 'Coordina materiales de estudio, tarjetas y estadísticas de clases.',
  },
  {
    id: 'mp_1',
    department: 'Ministerio Personal',
    roleTitle: 'Director(a) de Ministerio Personal',
    defaultSeats: 1,
    description: 'Impulsa el evangelismo local, grupos pequeños y estudios bíblicos.',
  },
  {
    id: 'mp_2',
    department: 'Ministerio Personal',
    roleTitle: 'Coordinador(a) de Interesados',
    defaultSeats: 1,
    description: 'Da seguimiento a visitas y personas que estudian la Biblia.',
  },
  {
    id: 'ja_1',
    department: 'Jóvenes Adventistas (JA)',
    roleTitle: 'Director(a) de Jóvenes',
    defaultSeats: 1,
    description: 'Coordina las actividades espirituales, misioneras y sociales juveniles.',
  },
  {
    id: 'conq_1',
    department: 'Conquistadores',
    roleTitle: 'Director(a) del Club de Conquistadores',
    defaultSeats: 1,
    description: 'Lidera el club para menores de 10 a 15 años.',
  },
  {
    id: 'ave_1',
    department: 'Aventureros',
    roleTitle: 'Director(a) del Club de Aventureros',
    defaultSeats: 1,
    description: 'Coordina el programa formativo para niños de 4 a 9 años y sus padres.',
  },
  {
    id: 'minf_1',
    department: 'Ministerio Infantil y del Adolescente',
    roleTitle: 'Coordinador(a) de Ministerio Infantil',
    defaultSeats: 1,
    description: 'Supervisa las divisiones infantiles de Escuela Sabática y programas de niños.',
  },
  {
    id: 'mm_1',
    department: 'Ministerio de la Mujer',
    roleTitle: 'Directora de Ministerio de la Mujer',
    defaultSeats: 1,
    description: 'Promueve el crecimiento espiritual y servicio entre las mujeres de la iglesia.',
  },
  {
    id: 'vf_1',
    department: 'Ministerio de la Familia',
    roleTitle: 'Director(es) de Vida Familiar',
    defaultSeats: 2,
    description: 'Fortalece matrimonios, crianza y relaciones familiares en la congregación.',
  },
  {
    id: 'may_1',
    department: 'Mayordomía Cristiana',
    roleTitle: 'Director(a) de Mayordomía',
    defaultSeats: 1,
    description: 'Educa en fidelidad integral: tiempo, talentos, templo y tesoros.',
  },
  {
    id: 'sal_1',
    department: 'Salud y Temperancia',
    roleTitle: 'Director(a) de Ministerio de la Salud',
    defaultSeats: 1,
    description: 'Promueve hábitos saludables y programas de bienestar comunitario.',
  },
  {
    id: 'asa_1',
    department: 'Dorcas / ASA (Acción Solidaria Adventista)',
    roleTitle: 'Director(a) de Dorcas / ASA',
    defaultSeats: 1,
    description: 'Organiza ayuda humanitaria, alimentos y vestuario para la comunidad.',
  },
  {
    id: 'com_1',
    department: 'Comunicación',
    roleTitle: 'Director(a) de Comunicación',
    defaultSeats: 1,
    description: 'Gestiona boletines, medios digitales, sonido y proyección.',
  },
  {
    id: 'mus_1',
    department: 'Música',
    roleTitle: 'Coordinador(a) de Música',
    defaultSeats: 1,
    description: 'Organiza coros, cantos congregacionales y música especial.',
  },
  {
    id: 'rec_1',
    department: 'Recepción y Ujieres',
    roleTitle: 'Coordinador(a) de Recepción',
    defaultSeats: 1,
    description: 'Da la bienvenida a miembros y visitas en cada servicio.',
  },
  {
    id: 'lib_1',
    department: 'Libertad Religiosa',
    roleTitle: 'Director(a) de Libertad Religiosa',
    defaultSeats: 1,
    description: 'Orienta sobre asuntos de conciencia, sábado y representación pública.',
  },
  {
    id: 'edu_1',
    department: 'Educación',
    roleTitle: 'Secretario(a) de Educación',
    defaultSeats: 1,
    description: 'Fomenta la educación adventista y apoya a estudiantes de la iglesia.',
  },
  {
    id: 'pub_1',
    department: 'Publicaciones',
    roleTitle: 'Coordinador(a) de Publicaciones',
    defaultSeats: 1,
    description: 'Promueve literatura adventista, revistas misioneras y colportaje.',
  },
];

const normalizeLabel = (value?: string): string =>
  (value ?? '').trim().toLowerCase();

export const getManualTemplateCoverageReason = (
  tpl: SdaManualRoleTemplate,
  existingDepartments: DepartmentPosition[]
): string | null => {
  const tplDept = normalizeLabel(tpl.department);
  const tplRole = normalizeLabel(tpl.roleTitle);

  if (tpl.votingMode === 'grouped') {
    const hasGrouped = existingDepartments.some(
      (d) =>
        d.votingMode === 'grouped' &&
        (normalizeLabel(d.department) === tplDept || normalizeLabel(d.roleTitle) === tplRole)
    );
    return hasGrouped ? 'Ya agregado' : null;
  }

  const coveredByGrouped = existingDepartments.some((d) => {
    if (d.votingMode !== 'grouped') return false;
    if (normalizeLabel(d.department) !== tplDept) return false;
    const groupedTitles = [d.leaderRoleTitle, d.membersRoleTitle, d.roleTitle].map(normalizeLabel);
    return groupedTitles.includes(tplRole);
  });

  if (coveredByGrouped) {
    return 'Ya incluido en departamento agrupado';
  }

  const alreadyExists = existingDepartments.some(
    (d) =>
      d.votingMode !== 'grouped' &&
      normalizeLabel(d.department) === tplDept &&
      normalizeLabel(d.roleTitle) === tplRole
  );

  return alreadyExists ? 'Ya agregado' : null;
};
