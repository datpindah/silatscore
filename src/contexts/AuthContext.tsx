
"use client";

import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { User as FirebaseUser, AuthError } from 'firebase/auth';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  error: AuthError | null;
  setError: Dispatch<SetStateAction<AuthError | null>>;
  sendAuthLink: (email: string) => Promise<{ success: boolean; message: string }>;
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
    // Regular auth state listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Handler for completing email link sign-in
    const handleSignInWithEmailLink = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          email = window.prompt('Silakan masukkan kembali email Anda untuk konfirmasi.');
        }
        if (!email) {
            setError({ code: 'auth/cancelled-popup-request', message: 'Proses login dibatalkan karena email tidak diberikan.' } as AuthError);
            return;
        }
        
        setLoading(true);
        try {
            await signInWithEmailLink(auth, email, window.location.href);
        } catch (err) {
            const authErr = err as AuthError;
            let userMessage = `Gagal login: ${authErr.message}`;
            if(authErr.code === 'auth/invalid-action-code') {
                userMessage = "Tautan login tidak valid atau sudah kedaluwarsa. Silakan coba minta tautan baru.";
            } else if (authErr.code === 'auth/user-disabled') {
                userMessage = "Akun Anda telah dinonaktifkan.";
            }
            console.error("Error signing in with email link", authErr);
            setError({ ...authErr, message: userMessage });
        } finally {
            window.localStorage.removeItem('emailForSignIn');
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            setLoading(false);
        }
      }
    };

    handleSignInWithEmailLink();

    return () => unsubscribe();
  }, []);

  const sendAuthLink = async (email: string): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    setError(null);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length === 0) {
        return { success: false, message: "Email tidak terdaftar. Silakan hubungi admin untuk registrasi." };
      }
      const actionCodeSettings = {
        url: window.location.href, // Redirect back to the same page (Tanding login, TGR login, or Saya)
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      return { success: true, message: "Tautan login telah dikirim ke email Anda. Silakan cek kotak masuk Anda." };
    } catch (err) {
      const authErr = err as AuthError;
      setError(authErr);
      console.error("Firebase send link error:", authErr);
      let userMessage = "Gagal mengirim tautan. Silakan coba lagi.";
      if (authErr.code === 'auth/invalid-email') {
          userMessage = "Format email yang Anda masukkan tidak valid.";
      } else if (authErr.code === 'auth/network-request-failed') {
          userMessage = "Gagal terhubung ke server. Periksa koneksi internet Anda.";
      }
      return { success: false, message: userMessage };
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
    sendAuthLink,
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
