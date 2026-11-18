import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export function normalizeIdentifierToEmail(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }
  const safeUser = trimmed
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');
  return `${safeUser}@nombramientos.sda`;
}

export function mapAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'El inicio con usuario y contraseña aún no está activado en Firebase Console. Activa el proveedor "Correo electrónico/contraseña" en Authentication > Sign-in method, o ingresa con Google.';
    case 'auth/invalid-email':
      return 'El usuario o correo electrónico no tiene un formato válido.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Usuario/correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente.';
    case 'auth/email-already-in-use':
      return 'Este usuario o correo ya está registrado. Cambia a la pestaña "Iniciar sesión".';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.';
    case 'auth/popup-closed-by-user':
      return 'Se cerró la ventana de Google antes de completar el ingreso.';
    default:
      return error instanceof Error && error.message
        ? error.message
        : 'No se pudo completar la autenticación. Intenta nuevamente.';
  }
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signInWithCredentials(
  identifier: string,
  password: string
): Promise<void> {
  const email = normalizeIdentifierToEmail(identifier);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithCredentials(
  displayName: string,
  identifier: string,
  password: string
): Promise<void> {
  const email = normalizeIdentifierToEmail(identifier);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const cleanName = displayName.trim();
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName });
  }
}
