import { collection, doc, setDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { jsonrepair } from 'jsonrepair';

export interface ActivityLogEntry {
  id: string;
  userId: string | null;
  action: string;
  details: string;
  timestamp: number;
}

let currentUserId: string | null = null;

export const setActivityUser = (userId: string | null) => {
  currentUserId = userId;
};

const getStorageKey = () => {
  return currentUserId ? `studygenius_activity_${currentUserId}` : 'studygenius_activity_guest';
};

const safeJsonParse = (text: string, fallback: any) => {
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            return JSON.parse(jsonrepair(text));
        } catch (repairError) {
            console.error("Failed to parse and repair JSON:", repairError);
            return fallback;
        }
    }
};

export const logActivity = async (action: string, details: string) => {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    userId: currentUserId,
    action: action ? action.substring(0, 100) : 'Unknown Action',
    details: details ? details.substring(0, 500) : '',
    timestamp: Date.now()
  };

  if (currentUserId && auth.currentUser && auth.currentUser.uid === currentUserId) {
    try {
      const docRef = doc(db, 'activity_logs', entry.id);
      await setDoc(docRef, entry);
    } catch (e) {
      console.error("Failed to save activity to Firestore", e);
    }
  } else {
    try {
      const stored = localStorage.getItem(getStorageKey());
      const current = stored ? safeJsonParse(stored, []) : [];
      const updated = [entry, ...current].slice(0, 100); // Keep last 100
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save activity to local storage", e);
    }
  }
};

export const getActivityLogs = async (): Promise<ActivityLogEntry[]> => {
  if (currentUserId) {
    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('userId', '==', currentUserId)
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(docSnap => docSnap.data() as ActivityLogEntry);
      return items.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.error("Failed to load activity logs from Firestore", e);
      return [];
    }
  } else {
    try {
      const stored = localStorage.getItem(getStorageKey());
      return stored ? safeJsonParse(stored, []) : [];
    } catch (e) {
      console.error("Failed to load activity logs", e);
      return [];
    }
  }
};
