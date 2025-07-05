
"use client";

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { User as FirebaseUser, AuthError } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: AuthError | null;
  setError: Dispatch<SetStateAction<AuthError | null>>;
  signIn: (email: string, pass: string) => Promise<FirebaseUser | null>;
  signInWithGoogle: () => Promise<FirebaseUser | null>;
  signInWithApple: () => Promise<FirebaseUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (err) {
      setError(err as AuthError);
      console.error("Firebase sign-in error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const googleProvider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      return result.user;
    } catch (err) {
      setError(err as AuthError);
      console.error("Firebase Google sign-in error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signInWithApple = async (): Promise<FirebaseUser | null> => {
    setLoading(true);
    setError(null);
    try {
      const appleProvider = new OAuthProvider('apple.com');
      const result = await signInWithPopup(auth, appleProvider);
      setUser(result.user);
      return result.user;
    } catch (err) {
      setError(err as AuthError);
      console.error("Firebase Apple sign-in error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      router.push('/'); // Redirect to home after sign out
    } catch (err) {
      setError(err as AuthError);
      console.error("Firebase sign-out error:", err);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    error,
    setError,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
