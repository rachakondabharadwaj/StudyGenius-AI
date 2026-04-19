
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { HistoryItem } from '../types';
import { jsonrepair } from 'jsonrepair';

// Default to guest storage, can be switched at runtime
let currentUserId: string | null = null;

// Helper to get key based on current user
const getStorageKey = () => {
  return currentUserId ? `studygenius_history_${currentUserId}` : 'studygenius_history_guest';
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

export const setStorageUser = (userId: string | null) => {
  currentUserId = userId;
};

export const getHistory = async (): Promise<HistoryItem[]> => {
  if (currentUserId) {
    try {
      const q = query(
        collection(db, 'history'),
        where('userId', '==', currentUserId)
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          data: safeJsonParse(data.data, {})
        } as HistoryItem;
      });
      // Sort client-side to avoid needing a composite index immediately
      return items.sort((a, b) => b.date - a.date);
    } catch (e) {
      console.error("Failed to load history from Firestore", e);
      return [];
    }
  } else {
    try {
      const stored = localStorage.getItem(getStorageKey());
      return stored ? safeJsonParse(stored, []) : [];
    } catch (e) {
      console.error("Failed to load history", e);
      return [];
    }
  }
};

export const saveHistoryItem = async (item: HistoryItem) => {
  // Deep clone data to avoid mutating original, then strip large binary payloads to respect Firestore 1MB limits
  const dataToSave: any = JSON.parse(JSON.stringify(item.data));
  if (item.type === 'note' && dataToSave.audioBase64) {
      delete dataToSave.audioBase64;
  }

  if (currentUserId) {
    try {
      const docRef = doc(db, 'history', item.id);
      await setDoc(docRef, {
        ...item,
        userId: currentUserId,
        data: JSON.stringify(dataToSave)
      });
    } catch (e) {
      console.error("Failed to save history to Firestore", e);
    }
  } else {
    const current = await getHistory();
    const filtered = current.filter(i => i.id !== item.id);
    const updated = [{...item, data: dataToSave}, ...filtered];
    
    // Also protect local storage limits (5MB)
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch(e) {
        console.error("Failed to save history locally", e);
    }
  }
};

export const updateHistoryItemTitle = async (id: string, newTitle: string) => {
  if (currentUserId) {
    try {
      const docRef = doc(db, 'history', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const itemData = docSnap.data();
        const parsedData = safeJsonParse(itemData.data, {});
        if (parsedData && parsedData.title) {
            parsedData.title = newTitle;
        }
        await setDoc(docRef, {
            ...itemData,
            title: newTitle,
            data: JSON.stringify(parsedData)
        }, { merge: true });
      }
    } catch (e) {
      console.error("Failed to update history title in Firestore", e);
    }
  } else {
    const current = await getHistory();
    const updated = current.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, title: newTitle };
        if (updatedItem.data && (updatedItem.data as any).title) {
          updatedItem.data = { ...updatedItem.data, title: newTitle };
        }
        return updatedItem;
      }
      return item;
    });
    localStorage.setItem(getStorageKey(), JSON.stringify(updated));
  }
};

export const deleteHistoryItem = async (id: string) => {
  if (currentUserId) {
    try {
      await deleteDoc(doc(db, 'history', id));
    } catch (e: any) {
      console.error("Failed to delete history item from Firestore", e);
      throw new Error(e.message || "Failed to delete from cloud database");
    }
  } else {
    const current = await getHistory();
    const updated = current.filter(item => item.id !== id);
    localStorage.setItem(getStorageKey(), JSON.stringify(updated));
  }
};

export const getStorageUsageBytes = async (): Promise<number> => {
  const current = await getHistory();
  return new Blob([JSON.stringify(current)]).size;
};

export const cleanupExpiredHistory = async () => {
    const items = await getHistory();
    const now = Date.now();
    const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;
    
    // Auto-delete any items older than 15 days
    const expired = items.filter(i => (now - i.date) >= FIFTEEN_DAYS);
    for (const item of expired) {
        await deleteHistoryItem(item.id);
    }
};

export const clearHistory = async () => {
  if (currentUserId) {
    try {
        const q = query(collection(db, 'history'), where('userId', '==', currentUserId));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(deletePromises);
    } catch (e) {
        console.error("Failed to clear history from Firestore", e);
    }
  } else {
    localStorage.removeItem(getStorageKey());
  }
};
