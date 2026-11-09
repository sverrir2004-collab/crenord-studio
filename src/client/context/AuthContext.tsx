import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, signInWithGoogle, logOut, fetchWithAuth } from '../lib/firebase.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isOwner: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isOwner: false,
  error: null,
  login: async () => {},
  logout: async () => {},
  clearError: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch('/api/me', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (res.status === 403) {
          await logOut();
          setUser(null);
          setIsOwner(false);
          setError('This account is not allowed.');
        } else if (res.ok) {
          setUser(firebaseUser);
          setIsOwner(true);
          setError(null);
        } else {
          setUser(null);
          setIsOwner(false);
        }
      } catch (err: any) {
        setUser(null);
        setIsOwner(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setError(null);
    setLoading(true);
    try {
      const { user } = await signInWithGoogle();
      setUser(user);
      setIsOwner(true);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in.');
      setUser(null);
      setIsOwner(false);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await logOut();
    setUser(null);
    setIsOwner(false);
    setError(null);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isOwner,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  return useContext(AuthContext);
}
