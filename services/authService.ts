
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile as updateFirebaseAuthProfile,
  deleteUser,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User, LoginResult, ActivityLogItem, UserSession, DBOAuthAccount } from '../types';

// Helper to map Firebase user to our User type
const mapFirebaseUser = async (firebaseUser: any): Promise<User> => {
  const userDocRef = doc(db, 'users', firebaseUser.uid);
  try {
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        id: data.id,
        username: data.username,
        email: data.email,
        isVerified: firebaseUser.emailVerified,
        avatar: data.avatar || firebaseUser.photoURL || '',
        createdAt: data.createdAt,
        settings: data.settings || { mfaEnabled: false }
      };
    } else {
      // Create default user doc if it doesn't exist
      const baseUsername = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
      const newUser: User = {
        id: firebaseUser.uid,
        username: baseUsername.substring(0, 50),
        email: firebaseUser.email || 'no-email@example.com',
        isVerified: firebaseUser.emailVerified || false,
        avatar: firebaseUser.photoURL || '',
        createdAt: Date.now(),
        settings: { mfaEnabled: false }
      };
      
      try {
        await setDoc(userDocRef, newUser);
      } catch (err) {
        console.error("Error setting user doc during mapFirebaseUser", newUser, err);
        throw err;
      }
      return newUser;
    }
  } catch (err) {
    console.error("Error in getDoc inside mapFirebaseUser", err);
    throw err;
  }
};

export const authService = {
  getSession: async (): Promise<User | null> => {
    return new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        unsubscribe();
        if (firebaseUser) {
          try {
            const user = await mapFirebaseUser(firebaseUser);
            resolve(user);
          } catch (e) {
            console.error("Error mapping user", e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  },

  getUserSessions: async (userId: string): Promise<UserSession[]> => {
    // Firebase Auth handles sessions internally. We return a mock current session.
    return [{
      id: 'current-session',
      userAgent: navigator.userAgent,
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
      isCurrent: true
    }];
  },

  revokeSession: async (sessionId: string): Promise<void> => {
    // Not directly supported by client SDK without custom tokens/backend
    console.log("Session revocation not supported on client side");
  },

  login: async (emailOrUsername: string, password: string): Promise<LoginResult> => {
    try {
      // Assuming email for Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, emailOrUsername, password);
      const user = await mapFirebaseUser(userCredential.user);
      return { user };
    } catch (error: any) {
      console.error("Login error", error);
      throw new Error(error.message || "Invalid credentials");
    }
  },

  verifyMfa: async (tempToken: string, code: string, userId: string): Promise<User> => {
    throw new Error("MFA not implemented in Firebase client auth mock");
  },

  signup: async (username: string, email: string, password: string): Promise<string> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateFirebaseAuthProfile(userCredential.user, { displayName: username });
      
      const newUser: User = {
        id: userCredential.user.uid,
        username,
        email,
        isVerified: false,
        avatar: '',
        createdAt: Date.now(),
        settings: { mfaEnabled: false }
      };
      
      await setDoc(doc(db, 'users', userCredential.user.uid), newUser);
      await sendEmailVerification(userCredential.user);
      
      // Sign out immediately after creation so they have to log in manually
      await auth.signOut();
      
      return "verification-sent";
    } catch (error: any) {
      console.error("Signup error", error);
      if (error.code === 'auth/operation-not-allowed') {
        throw new Error("Email/Password sign-in is not enabled in your Firebase project. Please enable it in the Firebase Console under Authentication > Sign-in method.");
      }
      throw new Error(error.message || "Error creating account");
    }
  },

  verifyEmail: async (token: string): Promise<void> => {
    // In Firebase, email verification is handled by the action URL sent to the user.
    // We just reload the user to check status.
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (!auth.currentUser.emailVerified) {
        throw new Error("Email not verified yet.");
      }
    }
  },

  socialLogin: async (providerName: 'google', emailOverride?: string): Promise<User> => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = await mapFirebaseUser(userCredential.user);
      return user;
    } catch (error: any) {
      console.error("Social login error", error);
      throw new Error(error.message || "Error during social login");
    }
  },

  createSession: async (userId: string): Promise<User> => {
    if (!auth.currentUser) throw new Error("No authenticated user");
    return await mapFirebaseUser(auth.currentUser);
  },

  logout: async () => {
    await signOut(auth);
  },

  requestPasswordReset: async (email: string): Promise<string> => {
    try {
      await sendPasswordResetEmail(auth, email);
      return "reset-sent";
    } catch (error: any) {
      console.error("Password reset error", error);
      throw new Error(error.message || "Error sending password reset");
    }
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    // Handled by Firebase action URL
    throw new Error("Password reset is handled via the link sent to your email.");
  },

  updateProfile: async (userId: string, updates: Partial<any>): Promise<User> => {
    if (!auth.currentUser || auth.currentUser.uid !== userId) {
      throw new Error("Unauthorized");
    }
    
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) throw new Error("User not found");
    
    const currentData = userDoc.data();
    const newData = { ...currentData };
    
    if (updates.settings) {
      newData.settings = { ...currentData.settings, ...updates.settings };
    }
    if (updates.username) {
      newData.username = updates.username;
      await updateFirebaseAuthProfile(auth.currentUser, { displayName: updates.username });
    }
    if (updates.avatar) {
      newData.avatar = updates.avatar;
      await updateFirebaseAuthProfile(auth.currentUser, { photoURL: updates.avatar });
    }
    
    await updateDoc(userDocRef, newData);
    return await mapFirebaseUser(auth.currentUser);
  },

  getLinkedAccounts: (userId: string): DBOAuthAccount[] => {
    if (!auth.currentUser) return [];
    return auth.currentUser.providerData.map(p => ({
      id: p.uid,
      user_id: userId,
      provider: 'google',
      provider_user_id: p.uid,
      provider_email: p.email || '',
      created_at: Date.now()
    }));
  },

  linkSocialAccount: async (userId: string, provider: 'google'): Promise<void> => {
    // To link accounts in Firebase, you need to use linkWithPopup on the currentUser.
    // This is a simplified mock.
    console.log("Linking social account requires linkWithPopup");
  },

  unlinkSocialAccount: async (userId: string, provider: 'google'): Promise<void> => {
    console.log("Unlinking social account requires unlink on currentUser");
  },

  getUserActivity: async (userId: string): Promise<ActivityLogItem[]> => {
    return [];
  },

  exportUserData: async (userId: string): Promise<string> => {
    if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error("Unauthorized");
    
    const userDoc = await getDoc(doc(db, 'users', userId));
    const historyQuery = query(collection(db, 'history'), where('userId', '==', userId));
    const historyDocs = await getDocs(historyQuery);
    
    const exportData = {
      userProfile: userDoc.data(),
      activityHistory: historyDocs.docs.map(d => d.data()),
      exportDate: new Date().toISOString(),
    };
    
    return JSON.stringify(exportData, null, 2);
  },

  deleteAccount: async (userId: string): Promise<void> => {
    if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error("Unauthorized");
    
    // Delete user document
    await deleteDoc(doc(db, 'users', userId));
    
    // Delete history
    const historyQuery = query(collection(db, 'history'), where('userId', '==', userId));
    const historyDocs = await getDocs(historyQuery);
    const deletePromises = historyDocs.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    
    // Delete Firebase Auth user
    await deleteUser(auth.currentUser);
  }
};
