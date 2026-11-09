import { getApps as getAdminApps, initializeApp as initAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import {
  getApps as getWebApps,
  initializeApp as initWebApp,
} from 'firebase/app';
import {
  getAuth as getWebAuth,
  signInWithEmailAndPassword,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  getFirestore as getWebFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  orderBy as webOrderBy,
  getDocs,
  writeBatch,
  DocumentReference,
  QueryConstraint,
  WhereFilterOp,
  OrderByDirection,
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

// Initialize Firebase Admin for verifying user Google OAuth tokens
if (!getAdminApps().length) {
  initAdminApp({
    projectId: firebaseConfig.projectId,
  });
}
export const adminAuth = getAdminAuth();

// Initialize Firebase Web SDK for dedicated server database connection
const webApp = getWebApps().length > 0 ? getWebApps()[0] : initWebApp(firebaseConfig);
const rawWebDb = getWebFirestore(webApp, firebaseConfig.firestoreDatabaseId);
const webAuth = getWebAuth(webApp);

// Configure in-memory session persistence
setPersistence(webAuth, inMemoryPersistence).catch(() => {});

let isSigningIn = false;
let lastSignInProblem = '';
let hasLoggedMissingEnv = false;

/**
 * Reads a server environment variable. Tolerates stray spaces or different letter case in the
 * secret NAME (for example "SERVER_DB_EMAIL " typed into the Secrets panel) and a few aliases.
 */
const SERVER_ENV_ALIASES: Record<string, string[]> = {
  SERVER_DB_EMAIL: ['SERVER_DB_EMAIL', 'SERVER_DB_USER', 'FIREBASE_SERVER_EMAIL', 'SERVER_EMAIL'],
  SERVER_DB_PASSWORD: ['SERVER_DB_PASSWORD', 'SERVER_DB_PASS', 'FIREBASE_SERVER_PASSWORD', 'SERVER_PASSWORD'],
};

export function getServerEnv(name: 'SERVER_DB_EMAIL' | 'SERVER_DB_PASSWORD'): string | undefined {
  const wanted = SERVER_ENV_ALIASES[name].map((n) => n.toUpperCase());
  for (const [key, value] of Object.entries(process.env)) {
    if (value && wanted.includes(key.trim().toUpperCase().replace(/[\s-]+/g, '_'))) {
      return name === 'SERVER_DB_EMAIL' ? value.trim() : value;
    }
  }
  return undefined;
}

/**
 * Safe diagnostic: says which secrets the running server can see. Names only, never values.
 */
export function describeServerEnv(): string {
  const has = (n: string) => (process.env[n] ? 'yes' : 'no');
  const related = Object.keys(process.env)
    .filter((k) => /SERVER|FIREBASE|DB_|OWNER|FAL|GEMINI/i.test(k))
    .filter((k) => !/^(npm_|NODE_|PATH|PWD|HOME|SHELL|LANG)/i.test(k))
    .slice(0, 12);
  return (
    `Server sees: SERVER_DB_EMAIL=${getServerEnv('SERVER_DB_EMAIL') ? 'yes' : 'no'}, ` +
    `SERVER_DB_PASSWORD=${getServerEnv('SERVER_DB_PASSWORD') ? 'yes' : 'no'}, ` +
    `FAL_KEY=${has('FAL_KEY')}, OWNER_EMAIL=${has('OWNER_EMAIL')}. ` +
    `Secret names it can see: ${related.length ? related.join(', ') : 'none'}. ` +
    'Secrets are only loaded when the server starts: restart the app after adding them.'
  );
}

/**
 * Signs in as the dedicated server account with Firebase Auth.
 * Automatically re-authenticates if expired.
 */
export async function ensureServerAuthenticated(forceRefresh = false): Promise<boolean> {
  const email = getServerEnv('SERVER_DB_EMAIL');
  const password = getServerEnv('SERVER_DB_PASSWORD');

  if (!email || !password) {
    if (!hasLoggedMissingEnv) {
      console.error('SERVER_DB_EMAIL / SERVER_DB_PASSWORD missing');
      hasLoggedMissingEnv = true;
    }
    return false;
  }

  if (!forceRefresh && webAuth.currentUser) {
    return true;
  }

  if (isSigningIn) {
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (!isSigningIn && webAuth.currentUser) return true;
    }
  }

  isSigningIn = true;
  try {
    await setPersistence(webAuth, inMemoryPersistence);
    await signInWithEmailAndPassword(webAuth, email, password);
    return Boolean(webAuth.currentUser);
  } catch (err: any) {
    const code = getFirestoreErrorCode(err);
    const cleanMsg = sanitizeFirestoreErrorMessage(err?.message || String(err));
    console.warn(`[Server DB Auth] Failed to sign in (${code}): ${cleanMsg}`);
    lastSignInProblem = `Sign-in to Firebase failed (${code}). Check that the user exists under Authentication > Users, that Email/Password sign-in is enabled, and that SERVER_DB_EMAIL and SERVER_DB_PASSWORD match exactly.`;
    return false;
  } finally {
    isSigningIn = false;
  }
}

/**
 * Executes a Firestore operation with server account authentication.
 * Automatically attempts a re-login if the token expires or session becomes unauthenticated.
 */
async function withServerAuth<T>(operation: () => Promise<T>): Promise<T> {
  const authed = await ensureServerAuthenticated();
  if (!authed && (!getServerEnv('SERVER_DB_EMAIL') || !getServerEnv('SERVER_DB_PASSWORD'))) {
    const err: any = new Error('SERVER_DB_EMAIL / SERVER_DB_PASSWORD missing');
    err.code = 'SERVER_LOGIN_MISSING';
    throw err;
  }

  try {
    return await operation();
  } catch (err: any) {
    const code = getFirestoreErrorCode(err);
    if (code === 'UNAUTHENTICATED' || code === 'PERMISSION_DENIED') {
      const reAuthed = await ensureServerAuthenticated(true);
      if (reAuthed) {
        return await operation();
      }
    }
    throw err;
  }
}

export interface FirestoreDocSnapshot<T = any> {
  id: string;
  exists: boolean;
  data: () => T;
}

export interface FirestoreQuerySnapshot<T = any> {
  docs: FirestoreDocSnapshot<T>[];
  empty: boolean;
  size: number;
  forEach: (callback: (result: FirestoreDocSnapshot<T>) => void) => void;
}

export interface FirestoreDocRef {
  id: string;
  path: string;
  _webRef: DocumentReference;
  set: (data: any, options?: { merge?: boolean }) => Promise<void>;
  get: () => Promise<FirestoreDocSnapshot>;
  update: (data: any) => Promise<void>;
  delete: () => Promise<void>;
}

export interface FirestoreQuery {
  where: (field: string, op: WhereFilterOp, value: any) => FirestoreQuery;
  orderBy: (field: string, direction?: OrderByDirection) => FirestoreQuery;
  limit: (limitCount: number) => FirestoreQuery;
  get: () => Promise<FirestoreQuerySnapshot>;
}

export interface FirestoreCollection extends FirestoreQuery {
  doc: (id?: string) => FirestoreDocRef;
}

export interface FirestoreBatch {
  set: (docRef: FirestoreDocRef, data: any, options?: { merge?: boolean }) => FirestoreBatch;
  update: (docRef: FirestoreDocRef, data: any) => FirestoreBatch;
  delete: (docRef: FirestoreDocRef) => FirestoreBatch;
  commit: () => Promise<void>;
}

function createDocRef(colName: string, id: string): FirestoreDocRef {
  const dRef = doc(rawWebDb, colName, id);
  return {
    id,
    path: `${colName}/${id}`,
    _webRef: dRef,
    async set(data: any, options?: { merge?: boolean }) {
      return withServerAuth(async () => {
        if (options?.merge) {
          await setDoc(dRef, data, { merge: true });
        } else {
          await setDoc(dRef, data);
        }
      });
    },
    async get() {
      return withServerAuth(async () => {
        const snap = await getDoc(dRef);
        return {
          id: snap.id,
          exists: snap.exists(),
          data: () => snap.data() as any,
        };
      });
    },
    async update(data: any) {
      return withServerAuth(async () => {
        await updateDoc(dRef, data);
      });
    },
    async delete() {
      return withServerAuth(async () => {
        await deleteDoc(dRef);
      });
    },
  };
}

function createQuery(colName: string, constraints: QueryConstraint[] = []): FirestoreQuery {
  return {
    where(field: string, op: WhereFilterOp, value: any) {
      return createQuery(colName, [...constraints, where(field, op, value)]);
    },
    orderBy(field: string, direction: OrderByDirection = 'asc') {
      return createQuery(colName, [...constraints, webOrderBy(field, direction)]);
    },
    limit(limitCount: number) {
      return createQuery(colName, [...constraints, limit(limitCount)]);
    },
    async get(): Promise<FirestoreQuerySnapshot> {
      return withServerAuth(async () => {
        const q = constraints.length > 0
          ? query(collection(rawWebDb, colName), ...constraints)
          : collection(rawWebDb, colName);
        const snap = await getDocs(q);
        const docs: FirestoreDocSnapshot[] = snap.docs.map((d) => ({
          id: d.id,
          exists: d.exists(),
          data: () => d.data() as any,
        }));
        return {
          docs,
          empty: snap.empty,
          size: snap.size,
          forEach(cb) {
            docs.forEach(cb);
          },
        };
      });
    },
  };
}

/**
 * Server database client authenticated with the dedicated server account.
 */
export const adminDb = {
  collection(colName: string): FirestoreCollection {
    const baseQuery = createQuery(colName);
    return {
      ...baseQuery,
      doc(id?: string) {
        const resolvedId = id || Math.random().toString(36).substring(2, 10);
        return createDocRef(colName, resolvedId);
      },
    };
  },
  batch(): FirestoreBatch {
    const b = writeBatch(rawWebDb);
    return {
      set(docRef: FirestoreDocRef, data: any, options?: { merge?: boolean }) {
        const target = docRef._webRef || doc(rawWebDb, docRef.path);
        if (options?.merge) {
          b.set(target, data, { merge: true });
        } else {
          b.set(target, data);
        }
        return this;
      },
      update(docRef: FirestoreDocRef, data: any) {
        const target = docRef._webRef || doc(rawWebDb, docRef.path);
        b.update(target, data);
        return this;
      },
      delete(docRef: FirestoreDocRef) {
        const target = docRef._webRef || doc(rawWebDb, docRef.path);
        b.delete(target);
        return this;
      },
      async commit() {
        return withServerAuth(async () => {
          await b.commit();
        });
      },
    };
  },
};

const GRPC_CODE_NAMES: Record<number, string> = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

export function getFirestoreErrorCode(err: any): string {
  if (err?.code === 'SERVER_LOGIN_MISSING') {
    return 'SERVER_LOGIN_MISSING';
  }
  if (typeof err?.code === 'number' && GRPC_CODE_NAMES[err.code]) {
    return GRPC_CODE_NAMES[err.code];
  }
  if (typeof err?.code === 'string' && err.code) {
    return err.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  if (err?.status && typeof err.status === 'string') {
    return err.status.toUpperCase();
  }
  if (typeof err?.message === 'string') {
    const match = err.message.match(
      /\b(SERVER_LOGIN_MISSING|PERMISSION_DENIED|NOT_FOUND|UNAUTHENTICATED|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|FAILED_PRECONDITION|INVALID_ARGUMENT|INTERNAL)\b/i
    );
    if (match) return match[1].toUpperCase();
  }
  return 'UNKNOWN';
}

export function sanitizeFirestoreErrorMessage(msg: string): string {
  return msg
    .replace(/(?:\/[a-zA-Z0-9_\-.]+)+/g, '[path]')
    .replace(/AIza[a-zA-Z0-9_\-]+/g, '[key]')
    .slice(0, 200);
}

export interface FirestoreCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/**
 * Checks Firestore read and write connectivity.
 * Returns { ok: true } on success or { ok: false, code, message } on failure.
 */
export async function checkFirestore(): Promise<FirestoreCheckResult> {
  const email = getServerEnv('SERVER_DB_EMAIL');
  const password = getServerEnv('SERVER_DB_PASSWORD');

  if (!email || !password) {
    if (!hasLoggedMissingEnv) {
      console.error('SERVER_DB_EMAIL / SERVER_DB_PASSWORD missing');
      hasLoggedMissingEnv = true;
    }
    return {
      ok: false,
      code: 'SERVER_LOGIN_MISSING',
      message: describeServerEnv(),
    };
  }

  try {
    const authed = await ensureServerAuthenticated();
    if (!authed) {
      return {
        ok: false,
        code: 'SERVER_LOGIN_FAILED',
        message: lastSignInProblem || 'Failed to sign in as server account with SERVER_DB_EMAIL and SERVER_DB_PASSWORD.',
      };
    }

    // (a) Read check
    await adminDb.collection('jobs').limit(1).get();
    // (b) Write check
    await adminDb.collection('_health').doc('ping').set({ at: new Date().toISOString() });
    return { ok: true };
  } catch (err: any) {
    const code = getFirestoreErrorCode(err);
    const rawMessage = err?.message || String(err);
    const message = sanitizeFirestoreErrorMessage(rawMessage);
    return {
      ok: false,
      code,
      message,
    };
  }
}

// Track last fallback log time per route to limit logging to at most once per minute
const lastFallbackLogTimes: Record<string, number> = {};

export function logFirestoreFallback(route: string, err?: any): void {
  const now = Date.now();
  const lastTime = lastFallbackLogTimes[route] || 0;
  if (now - lastTime >= 60_000) {
    lastFallbackLogTimes[route] = now;
    const code = getFirestoreErrorCode(err);
    console.warn(`[Firestore Fallback - ${route}] Using in-memory storage due to error code: ${code}`);
  }
}
