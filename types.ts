
export enum ViewState {
  HOME = 'HOME',
  QUIZ_UPLOAD = 'QUIZ_UPLOAD',
  QUIZ_ACTIVE = 'QUIZ_ACTIVE',
  SUMMARY_UPLOAD = 'SUMMARY_UPLOAD',
  SUMMARY_ACTIVE = 'SUMMARY_ACTIVE',
  FLASHCARDS_UPLOAD = 'FLASHCARDS_UPLOAD',
  FLASHCARDS_ACTIVE = 'FLASHCARDS_ACTIVE',
  NOTES_UPLOAD = 'NOTES_UPLOAD',
  NOTES_ACTIVE = 'NOTES_ACTIVE',
  MINDMAP_UPLOAD = 'MINDMAP_UPLOAD',
  MINDMAP_ACTIVE = 'MINDMAP_ACTIVE',
  HISTORY = 'HISTORY',
  AUTH = 'AUTH',
  PROFILE = 'PROFILE',
  SECURITY_AUDIT = 'SECURITY_AUDIT',
  ACTIVITY_LOG = 'ACTIVITY_LOG'
}

// --- Frontend Types ---

export interface User {
  id: string;
  username: string;
  email: string;
  isVerified: boolean;
  avatar?: string;
  createdAt: number;
  settings?: {
    mfaEnabled: boolean;
  };
  // Security status
  failedLoginAttempts?: number;
  lockoutUntil?: number;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}

export interface UserSession {
  id: string;
  userAgent: string;
  lastUsedAt: number;
  createdAt: number;
  isCurrent: boolean;
}

export interface LoginResult {
    user?: User;
    mfaRequired?: boolean;
    tempToken?: string; // Used to verify MFA
}

export interface ActivityLogItem {
  id: string;
  userId: string;
  action: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'SIGNUP' | 'LOGOUT' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE' | 'MFA_VERIFY' | 'ACCOUNT_LINK' | 'ACCOUNT_UNLINK' | 'ACCOUNT_LOCKED' | 'DATA_EXPORT';
  details?: string;
  ip?: string;
  userAgent?: string;
  timestamp: number;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
}

// --- Database Schema Simulation (Relational) ---

export interface DBUser {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  password_hash?: string; // Null if only social
  password_salt?: string;
  created_at: number;
  updated_at: number;
  is_disabled: boolean;
  failed_login_attempts: number;
  lockout_until?: number;
  settings_json: string; // Stored as string in DB
  avatar_url?: string;
}

export interface DBOAuthAccount {
  id: string;
  user_id: string;
  provider: 'google' | 'facebook';
  provider_user_id: string;
  provider_email: string;
  created_at: number;
}

export interface DBResetToken {
  token_hash: string;
  user_id: string;
  expires_at: number;
  used: boolean;
  created_at: number;
}

export interface DBVerificationToken {
  token_hash: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

export interface DBSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_used_at: number;
  user_agent?: string;
}

// --- Content Types ---

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string; 
  explanation: string;
  sourceFile?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  createdAt: number;
  sourceFileName: string;
  score?: number; 
  totalQuestions?: number;
  difficulty?: string;
  topic?: string; 
  selectedTopics?: string[]; 
  explanationDepth?: string;
  userAnswers?: Record<string, string>;
}

export interface DiscoveredTopic {
  id: string;
  title: string;
}

export interface FileTopics {
  fileName: string;
  topics: string[];
}

export interface QuizConfig {
  showTopicsUI: boolean;
  detectedTopics: FileTopics[];
  quizStructure: any[];
}

export interface PlagiarismMatch {
  text: string; 
  source: 'local' | 'web';
  similarity: number; 
  url?: string; 
}

export interface Summary {
  id: string;
  title: string;
  content: string; 
  createdAt: number;
  sourceFileName: string;
  plagiarismAnalysis?: {
    score: number; 
    matches: PlagiarismMatch[];
    checkedAt: number;
    sourceType: 'local' | 'web' | 'hybrid';
  };
  isCombined?: boolean;
  individualSummaries?: { fileName: string, content: string }[];
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface FlashcardSet {
  id: string;
  title: string;
  cards: Flashcard[];
  createdAt: number;
  sourceFileName: string;
  isCombined?: boolean;
  individualSets?: { fileName: string, cards: Flashcard[] }[];
}

export type NoteType = 'CONDENSED' | 'MINDMAP' | 'TABLE' | 'PODCAST';

export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

export interface ComparisonTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface SmartNote {
  id: string;
  title: string;
  type: NoteType;
  content: string | MindMapNode | ComparisonTable; 
  createdAt: number;
  sourceFileName: string;
  isCombined?: boolean;
  individualNotes?: { fileName: string, content: string | MindMapNode | ComparisonTable }[];
  audioBase64?: string;
}

export interface UploadedFile {
  fileId: string;
  file: File;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress?: number;
  error?: string;
  extractedText?: string;
}

export interface HistoryItem {
  id: string;
  type: 'quiz' | 'summary' | 'flashcards' | 'note';
  title: string;
  date: number;
  data: Quiz | Summary | FlashcardSet | SmartNote;
}

// Type augmentation for window globals loaded via CDN
declare global {
  interface Window {
    pdfjsLib: any;
    jspdf: any;
    lucide: any;
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
