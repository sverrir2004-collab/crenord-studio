import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Custom parameters for clean account selection
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google Popup and verify owner status via GET /api/me.
 * If not the owner, signs out immediately and throws an unauthorized error.
 */
export async function signInWithGoogle(): Promise<{ user: User; email: string }> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const idToken = await user.getIdToken();

  try {
    const res = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (res.status === 403) {
      await signOut(auth);
      throw new Error('This account is not allowed.');
    }

    if (!res.ok) {
      await signOut(auth);
      throw new Error('Authentication verification failed.');
    }

    const data = await res.json();
    return { user, email: data.email };
  } catch (err: any) {
    await signOut(auth);
    throw err;
  }
}

/**
 * Signs out current user from Firebase.
 */
export async function logOut(): Promise<void> {
  await signOut(auth);
}

/**
 * Authenticated API client that injects the current Firebase ID token.
 */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User is not signed in');
  }

  const token = await currentUser.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  return fetch(url, {
    ...init,
    headers,
  });
}
