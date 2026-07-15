import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signInWithCredential, GoogleAuthProvider, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { User } from '../../types/schema';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
    user: FirebaseUser | null;
    userProfile: User | null;
    isLoading: boolean;
    promptAsync: () => Promise<any>;
    logout: () => Promise<void>;
    signUpWithEmail: (name: string, email: string, pass: string) => Promise<void>;
    loginWithEmail: (email: string, pass: string) => Promise<void>;
    devLogin: (role?: 'student' | 'teacher') => void;
    setProfileLocal: (profile: User) => void;
    refreshProfile: () => Promise<void>;
    mockPages?: any[];
    addMockPage?: (page: any) => void;
    trialBypass?: boolean;

    setTrialBypass?: (bypass: boolean) => void;
    emailBypass?: boolean;
    setEmailBypass?: (bypass: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [userProfile, setUserProfile] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Request
    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        clientId: '771495778287-m1021l9f2cva29boj865terleetkegpi.apps.googleusercontent.com',
        // Force Expo to use the Authentication Proxy (fixes both Policy Error and White Screen)
        // @ts-ignore
        redirectUri: makeRedirectUri({
            useProxy: true
        })
    });

    useEffect(() => {
        if (request) {
            console.log("Current Redirect URI:", request.redirectUri);
        }
    }, [request]);

    useEffect(() => {
        if (request) {
            console.log("Google Auth Redirect URI:", request.redirectUri);
        }
    }, [request]);

    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;
            const credential = GoogleAuthProvider.credential(id_token);
            signInWithCredential(auth, credential);
        }
    }, [response]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                // Fetch profile
                try {
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        setUserProfile(userDoc.data() as User);
                    } else {
                        setUserProfile(null); // Profile needs creation
                    }
                } catch (e) {
                    console.error("Error fetching user profile", e);
                }
            } else {
                setUserProfile(null);
                // Ensure bypass flags are reset if logged out by other means
                if (setTrialBypass) setTrialBypass(false);
                if (setEmailBypass) setEmailBypass(false);
            }
            setIsLoading(false);
        });

        return unsubscribe;
    }, []);

    const logout = async () => {
        setTrialBypass(false);
        setEmailBypass(false);
        await signOut(auth);
    };

    const signUpWithEmail = async (name: string, email: string, pass: string) => {
        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // Update Auth Profile
            await updateProfile(user, { displayName: name });

            // Send Verification Email
            await sendEmailVerification(user);

            // Create Firestore Profile (Incomplete, needs Role Selection)
            // We do NOT set the role yet. The user will be redirected to /role-selection
            // because `userProfile` will be null or have no role.

            // Actually, we should probably rely on the onAuthStateChanged to pick this up,
            // but we might want to force a "needs profile" state.
            // For now, let's just let the Auth State listener handle the user detection.
            // But we can create the initial doc here if we want.

        } catch (error: any) {
            console.error("Sign Up Error", error);
            setIsLoading(false); // Only stop loading on error. Success is handled by onAuthStateChanged.
            throw error;
        }
        // finally block removed to prevent race condition
    };

    const loginWithEmail = async (email: string, pass: string) => {
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error: any) {
            console.error("Login Error", error);
            setIsLoading(false); // Only stop loading on error.
            throw error;
        }
        // finally block removed to prevent race condition
    };

    const devLogin = (role?: 'student' | 'teacher') => {
        const mockUser = {
            uid: 'test-user-123',
            email: 'test@echolearn.com',
            displayName: 'Test Student',
            // Mocking other required properties simply
            emailVerified: true,
            isAnonymous: false,
            metadata: {},
            providerData: [],
            refreshToken: '',
            tenantId: null,
            delete: async () => { },
            getIdToken: async () => '',
            getIdTokenResult: async () => ({} as any),
            reload: async () => { },
            toJSON: () => ({}),
            phoneNumber: null,
            photoURL: null,
            providerId: 'firebase',
        } as unknown as FirebaseUser;

        setUser(mockUser);

        if (role) {
            // Auto-set profile to bypass role selection
            setUserProfile({
                uid: 'test-user-123',
                email: 'test@echolearn.com',
                displayName: 'Test User',
                role: role,
                createdAt: Date.now(),
                photoURL: ''
            });
        } else {
            setUserProfile(null); // Force Role Selection flow
        }

        setIsLoading(false);
    };

    const setProfileLocal = (profile: User) => {
        setUserProfile(profile);
    };

    const [mockPages, setMockPages] = useState<any[]>([]);

    const addMockPage = (page: any) => {
        setMockPages(prev => {
            // Update if exists, else add
            const index = prev.findIndex(p => p.id === page.id);
            if (index >= 0) {
                const newArr = [...prev];
                newArr[index] = page;
                return newArr;
            }
            return [page, ...prev];
        });
    };

    const refreshProfile = async () => {
        if (!user) return;
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                setUserProfile(userDoc.data() as User);
            }
        } catch (e) {
            console.error("Error refreshing profile", e);
        }
    };

    const [trialBypass, setTrialBypass] = useState(false);
    const [emailBypass, setEmailBypass] = useState(false);

    return (
        <AuthContext.Provider value={{
            user,
            userProfile,
            isLoading,
            promptAsync,
            logout,
            signUpWithEmail,
            loginWithEmail,
            devLogin,
            setProfileLocal,
            refreshProfile,
            mockPages,
            addMockPage,
            trialBypass,
            setTrialBypass,
            emailBypass,
            setEmailBypass
        }}>
            {children}
        </AuthContext.Provider>
    );
}
