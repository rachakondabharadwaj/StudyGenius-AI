
import React, { useState, useEffect } from 'react';
import { ViewState, User, HistoryItem } from './types';
import { authService } from './services/authService';
import { setStorageUser, cleanupExpiredHistory, getHistory } from './services/storageService';

import { Home } from './views/Home';
import { QuizGenerator } from './views/QuizGenerator';
import { Summarizer } from './views/Summarizer';
import { History } from './views/History';
import { FlashcardGenerator } from './views/FlashcardGenerator';
import { NotesGenerator } from './views/NotesGenerator';
import { Auth } from './views/Auth';
import { Profile } from './views/Profile';
import { SecurityAudit } from './views/SecurityAudit';
import { ActivityLog } from './views/ActivityLog';
import { logActivity, setActivityUser } from './services/activityService';
import { Lock, Bell } from 'lucide-react';
import { Modal } from './components/UI';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.HOME);
  const [user, setUser] = useState<User | null>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  
  // Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [expiringItems, setExpiringItems] = useState<HistoryItem[]>([]);

  // Check for existing session on mount
  useEffect(() => {
    const initSession = async () => {
      const currentUser = await authService.getSession();
      if (currentUser) {
        setUser(currentUser);
        setStorageUser(currentUser.id);
        setActivityUser(currentUser.id);
      } else {
        setStorageUser(null); // Guest mode
        setActivityUser(null);
      }
      
      // Cleanup expired history and check notifications
      await cleanupExpiredHistory();
      const items = await getHistory();
      const now = Date.now();
      const THIRTEEN_DAYS = 13 * 24 * 60 * 60 * 1000;
      const FIFTEEN_DAYS = 15 * 24 * 60 * 60 * 1000;
      
      const expiring = items.filter(i => {
          const age = now - i.date;
          return age >= THIRTEEN_DAYS && age < FIFTEEN_DAYS;
      });
      setExpiringItems(expiring);
    };
    initSession();
  }, [view]);

  // Log view changes (Chrome history-like functionality)
  useEffect(() => {
    const viewNames: Record<string, string> = {
      [ViewState.HOME]: 'Home',
      [ViewState.QUIZ_UPLOAD]: 'Quiz Generator',
      [ViewState.QUIZ_ACTIVE]: 'Taking Quiz',
      [ViewState.SUMMARY_UPLOAD]: 'Summarizer',
      [ViewState.SUMMARY_ACTIVE]: 'Viewing Summary',
      [ViewState.FLASHCARDS_UPLOAD]: 'Flashcard Generator',
      [ViewState.FLASHCARDS_ACTIVE]: 'Viewing Flashcards',
      [ViewState.NOTES_UPLOAD]: 'Notes Generator',
      [ViewState.NOTES_ACTIVE]: 'Viewing Notes',
      [ViewState.HISTORY]: 'History',
      [ViewState.PROFILE]: 'Profile',
      [ViewState.SECURITY_AUDIT]: 'Security Audit',
      [ViewState.ACTIVITY_LOG]: 'Activity Log'
    };

    if (view !== ViewState.AUTH && viewNames[view]) {
      logActivity(`Visited ${viewNames[view]}`, `Opened the ${viewNames[view]} page.`);
    }
  }, [view]);

  const handleLogin = (loggedInUser: User) => {
      setUser(loggedInUser);
      setStorageUser(loggedInUser.id);
      setActivityUser(loggedInUser.id);
      logActivity('Logged In', `User ${loggedInUser.email} logged in successfully.`);
      setView(ViewState.HOME);
  };

  const handleLogout = async () => {
      await logActivity('Logged Out', `User ${user?.email} logged out.`);
      await authService.logout();
      setUser(null);
      setStorageUser(null);
      setActivityUser(null);
      setView(ViewState.AUTH); // Redirect to login or home
  };
  
  const handleOpenHistoryItem = (item: HistoryItem) => {
      setHistoryData(item.data);
      switch(item.type) {
          case 'quiz': setView(ViewState.QUIZ_ACTIVE); break;
          case 'summary': setView(ViewState.SUMMARY_ACTIVE); break;
          case 'flashcards': setView(ViewState.FLASHCARDS_ACTIVE); break;
          case 'note': setView(ViewState.NOTES_ACTIVE); break;
          default: break;
      }
  };

  const clearHistoryData = () => {
      setHistoryData(null);
      setView(ViewState.HOME);
  };

  const renderView = () => {
    switch (view) {
      case ViewState.HOME:
        return <Home onChangeView={setView} isLoggedIn={!!user} />;
      
      case ViewState.AUTH:
        return <Auth onLogin={handleLogin} />;
        
      case ViewState.PROFILE:
        if (!user) return <Auth onLogin={handleLogin} />;
        return <Profile user={user} onBack={() => setView(ViewState.HOME)} onLogout={handleLogout} onUpdateUser={setUser} onManageStorage={() => setView(ViewState.HISTORY)} />;

      case ViewState.SECURITY_AUDIT:
        return <SecurityAudit onBack={() => setView(ViewState.PROFILE)} />;

      case ViewState.ACTIVITY_LOG:
        return <ActivityLog onBack={() => setView(ViewState.HOME)} />;

      case ViewState.QUIZ_UPLOAD:
      case ViewState.QUIZ_ACTIVE:
        return <QuizGenerator onBack={clearHistoryData} initialData={historyData} />;
      
      case ViewState.SUMMARY_UPLOAD:
      case ViewState.SUMMARY_ACTIVE:
        return <Summarizer onBack={clearHistoryData} initialData={historyData} />;
      
      case ViewState.FLASHCARDS_UPLOAD:
      case ViewState.FLASHCARDS_ACTIVE:
        return <FlashcardGenerator onBack={clearHistoryData} initialData={historyData} />;
      
      case ViewState.NOTES_UPLOAD:
      case ViewState.NOTES_ACTIVE:
        return <NotesGenerator onBack={clearHistoryData} initialData={historyData} />;

      case ViewState.HISTORY:
        return <History onBack={() => setView(ViewState.HOME)} onOpen={handleOpenHistoryItem} />;
      
      default:
        return <Home onChangeView={setView} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 transition-colors duration-200">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center cursor-pointer" onClick={() => setView(ViewState.HOME)}>
              <div className="flex-shrink-0 flex items-center">
                 {/* Logo Icon */}
                 <div className="h-8 w-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold mr-3 shadow-sm">
                    S
                 </div>
                 <span className="font-bold text-xl text-slate-900 tracking-tight">StudyGenius</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
                 {/* Notifications Bell */}
                 <button 
                     onClick={() => setNotificationsOpen(true)}
                     className="relative p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors"
                     title="Notifications"
                 >
                     <Bell className="h-5 w-5" />
                     {expiringItems.length > 0 && (
                         <span className="absolute top-1 right-1 flex items-center justify-center h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white">
                             {expiringItems.length}
                         </span>
                     )}
                 </button>

                 {view !== ViewState.HOME && view !== ViewState.AUTH && (
                    <button 
                        onClick={() => setView(ViewState.HOME)}
                        className="text-slate-500 hover:text-indigo-600 text-sm font-medium transition-colors"
                    >
                        Home
                    </button>
                 )}
                 
                 {user ? (
                     <div className="flex items-center ml-4">
                         <button 
                            onClick={() => setView(ViewState.PROFILE)}
                            className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold hover:ring-2 hover:ring-indigo-500 transition-all overflow-hidden"
                            title="Account Profile"
                         >
                            {user.avatar ? (
                                <img src={user.avatar} alt={user.username} className="h-full w-full object-cover" />
                            ) : (
                                (user.username || 'U')[0].toUpperCase()
                            )}
                         </button>
                     </div>
                 ) : (
                     <button 
                        onClick={() => setView(ViewState.AUTH)}
                        className="text-sm font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-md transition-colors"
                     >
                        Sign In
                     </button>
                 )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-grow">
        {renderView()}
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto transition-colors duration-200">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-slate-400 text-sm">
             <p className="mb-2">Powered by Epicron alone</p>
             <div className="flex items-center gap-2 text-xs opacity-75">
                <Lock className="h-3 w-3" />
                <span>Secure • Private • Built for Students</span>
             </div>
          </div>
        </div>
      </footer>

      {/* Notifications Modal */}
      <Modal isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Notifications">
        {expiringItems.length > 0 ? (
          <div>
            <div className="p-4 bg-amber-50 rounded-lg text-amber-800 text-sm mb-4 border border-amber-200">
              <strong>Notice:</strong> These files are deleting in 2 days. If you want you can download them. If not, you can ignore this.
            </div>
            <p className="text-sm text-slate-500 font-medium mb-2">Expiring Items:</p>
            <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
               {expiringItems.map(item => (
                   <li key={item.id} className="p-3 bg-white border border-slate-100 shadow-sm rounded-lg hover:shadow-md transition-shadow">
                       <button 
                          onClick={() => { 
                             setNotificationsOpen(false); 
                             handleOpenHistoryItem(item); 
                          }} 
                          className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors w-full text-left truncate flex items-center justify-between"
                       >
                           <span className="truncate">{item.title}</span>
                           <span className="text-xs text-slate-400 ml-2">(Expires on {new Date(item.date + 15 * 86400 * 1000).toLocaleDateString()})</span>
                       </button>
                   </li>
               ))}
            </ul>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500">
             <Bell className="h-8 w-8 text-slate-300 mx-auto mb-3" />
             <p>No new notifications.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default App;
