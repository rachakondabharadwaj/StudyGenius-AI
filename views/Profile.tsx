
import React, { useState, useEffect } from 'react';
import { User, DBOAuthAccount, UserSession, ActivityLogItem } from '../types';
import { authService } from '../services/authService';
import { clearHistory, getStorageUsageBytes, getHistory } from '../services/storageService';
import { generatePDF } from '../services/fileService';
import { Button, Card, Header, Input } from '../components/UI';
import { User as UserIcon, Shield, Key, LogOut, Trash2, CheckCircle, Settings, Chrome, Facebook, Link2, Smartphone, Laptop, Clock, Download, Activity, AlertTriangle, HardDrive, List } from 'lucide-react';

interface Props {
    user: User;
    onBack: () => void;
    onLogout: () => void;
    onUpdateUser: (user: User) => void;
    onManageStorage?: () => void;
}

export const Profile: React.FC<Props> = ({ user, onBack, onLogout, onUpdateUser, onManageStorage }) => {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'security' | 'activity'>('general');
    const [linkedAccounts, setLinkedAccounts] = useState<DBOAuthAccount[]>([]);
    const [sessions, setSessions] = useState<UserSession[]>([]);
    const [logs, setLogs] = useState<ActivityLogItem[]>([]);
    const [storageUsage, setStorageUsage] = useState<number>(0);
    const STORAGE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GB limit strictly
    
    // Change Password State
    const [msg, setMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);

    useEffect(() => {
        // Load initial data
        setLinkedAccounts(authService.getLinkedAccounts(user.id));
        loadSessions();
        loadLogs();
        loadStorageUsage();
    }, [user.id]);

    const loadStorageUsage = async () => {
        const usage = await getStorageUsageBytes();
        setStorageUsage(usage);
    };

    const loadSessions = async () => {
        const s = await authService.getUserSessions(user.id);
        setSessions(s);
    };

    const loadLogs = async () => {
        const l = await authService.getUserActivity(user.id);
        setLogs(l);
    };

    const handleResetPassword = async () => {
        setLoading(true);
        try {
            await authService.requestPasswordReset(user.email);
            setMsg({ type: 'success', text: "Password reset email sent! Please check your inbox." });
        } catch (error: any) {
            console.error("Password reset error:", error);
            setMsg({ type: 'error', text: error.message || 'Failed to send password reset email' });
        } finally {
            setLoading(false);
        }
    };

    const handleLinkAccount = async (provider: 'google') => {
        setLoading(true);
        try {
            await authService.linkSocialAccount(user.id, provider);
            setLinkedAccounts(authService.getLinkedAccounts(user.id));
            setMsg({ type: 'success', text: `Connected ${provider} account` });
            loadLogs();
        } catch (e: any) {
            setMsg({ type: 'error', text: "Failed to link account" });
        } finally {
            setLoading(false);
        }
    };

    const handleUnlinkAccount = async (provider: 'google') => {
        if(!window.confirm(`Disconnect ${provider}?`)) return;
        
        // Prevent lockout: Check if this is the only method
        if (linkedAccounts.length <= 1) {
             // We should warn in a real implementation if they have no password set
        }

        setLoading(true);
        try {
            await authService.unlinkSocialAccount(user.id, provider);
            setLinkedAccounts(authService.getLinkedAccounts(user.id));
            loadLogs();
        } catch (e: any) {
            setMsg({ type: 'error', text: "Failed to unlink account" });
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        if(!window.confirm("Log out this device?")) return;
        try {
            await authService.revokeSession(sessionId);
            await loadSessions();
            loadLogs();
        } catch (e) {
            console.error(e);
        }
    };

    const handleToggleMFA = async () => {
        setLoading(true);
        try {
            const newStatus = !user.settings?.mfaEnabled;
            const updated = await authService.updateProfile(user.id, { 
                settings: { ...user.settings, mfaEnabled: newStatus }
            });
            onUpdateUser(updated);
            loadLogs();
        } catch (e: any) {
            setMsg({ type: 'error', text: "Failed to update settings" });
        } finally {
            setLoading(false);
        }
    };

    const handleExportData = async () => {
        setLoading(true);
        try {
            // Get all activity logs and history data
            const activityLogs = await authService.getUserActivity(user.id);
            const historyItems = await getHistory();
            
            // Build a readable text document
            let content = `STUDYGENIUS DATA EXPORT\n`;
            content += `=========================\n\n`;
            content += `USER PROFILE:\n`;
            content += `Username: ${user.username}\n`;
            content += `Email: ${user.email}\n`;
            content += `Created At: ${new Date(user.createdAt).toLocaleString()}\n\n`;
            
            content += `=========================\n\n`;
            content += `GENERATED CONTENT HISTORY (${historyItems.length} items):\n\n`;
            if (historyItems.length === 0) {
                content += `No history items found.\n\n`;
            } else {
                historyItems.forEach((item, index) => {
                    content += `${index + 1}. [${item.type.toUpperCase()}] ${item.title}\n`;
                    content += `   Generated on: ${new Date(item.date).toLocaleString()}\n`;
                });
                content += `\n`;
            }
            
            content += `=========================\n\n`;
            content += `ACCOUNT ACTIVITY LOG (${activityLogs.length} events):\n\n`;
            if (activityLogs.length === 0) {
                content += `No recent activity logged.\n`;
            } else {
                activityLogs.forEach((log) => {
                    content += `- ${new Date(log.timestamp).toLocaleString()}: [${log.action}] ${log.details || ''}\n`;
                    if (log.ip || log.userAgent) {
                        content += `  (IP: ${log.ip || 'Unknown'} | Device: ${log.userAgent || 'Unknown'})\n`;
                    }
                });
            }

            // Provide it as PDF
            generatePDF(`StudyGenius_Export_${user.username}`, content);
            
            setMsg({ type: 'success', text: "Data export complete as PDF!" });
            loadLogs();
        } catch (e: any) {
            console.error("Export Error:", e);
            setMsg({ type: 'error', text: "Failed to export data to PDF" });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("Are you sure you want to delete your account? This action is irreversible.")) return;
        const input = prompt("Please type 'DELETE' to confirm account deletion:");
        if (input !== 'DELETE') return;

        setLoading(true);
        try {
            await authService.deleteAccount(user.id);
            onLogout();
        } catch (e: any) {
            setMsg({ type: 'error', text: "Failed to delete account" });
            setLoading(false);
        }
    };

    const isLinked = (provider: string) => linkedAccounts.some(a => a.provider === provider);

    // Helper for device icon
    const getDeviceIcon = (ua: string) => {
        if (ua.toLowerCase().includes('mobile')) return <Smartphone className="h-5 w-5 text-slate-500" />;
        return <Laptop className="h-5 w-5 text-slate-500" />;
    };
    
    const getLogIcon = (action: string) => {
        if (action.includes('LOGIN') || action.includes('LOGOUT')) return <Key className="h-4 w-4" />;
        if (action.includes('LOCKED')) return <AlertTriangle className="h-4 w-4 text-red-500" />;
        return <Activity className="h-4 w-4" />;
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <Header title="Account Settings" onBack={onBack} />
            
            <div className="grid md:grid-cols-3 gap-8">
                {/* Sidebar */}
                <div className="space-y-2">
                    <Card className="p-4">
                        <div className="flex flex-col items-center py-6 border-b border-slate-100  mb-4">
                            <div className="h-20 w-20 bg-indigo-100  rounded-full flex items-center justify-center mb-4 overflow-hidden">
                                {user.avatar ? (
                                    <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <UserIcon className="h-10 w-10 text-indigo-600" />
                                )}
                            </div>
                            <h3 className="font-bold text-lg text-slate-900 ">{user.username}</h3>
                            <p className="text-sm text-slate-500 ">{user.email}</p>
                            {user.isVerified ? (
                                <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="h-3 w-3 mr-1" /> Verified
                                </span>
                            ) : (
                                <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Unverified
                                </span>
                            )}
                        </div>
                        
                        <nav className="space-y-1">
                            <button 
                                onClick={() => setActiveTab('general')}
                                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${activeTab === 'general' ? 'bg-indigo-50  text-indigo-700 ' : 'text-slate-600  hover:bg-slate-50 :bg-slate-800'}`}
                            >
                                <UserIcon className="h-4 w-4 mr-3" /> General
                            </button>
                            <button 
                                onClick={() => setActiveTab('security')}
                                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${activeTab === 'security' ? 'bg-indigo-50  text-indigo-700 ' : 'text-slate-600  hover:bg-slate-50 :bg-slate-800'}`}
                            >
                                <Shield className="h-4 w-4 mr-3" /> Security
                            </button>
                             <button 
                                onClick={() => setActiveTab('activity')}
                                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${activeTab === 'activity' ? 'bg-indigo-50  text-indigo-700 ' : 'text-slate-600  hover:bg-slate-50 :bg-slate-800'}`}
                            >
                                <Activity className="h-4 w-4 mr-3" /> Activity Log
                            </button>
                        </nav>
                    </Card>
                    
                    <Button variant="outline" className="w-full justify-start text-red-600  hover:text-red-700 :text-red-300 hover:border-red-200 :border-red-800 hover:bg-red-50 :bg-red-900/20" onClick={onLogout}>
                        <LogOut className="h-4 w-4 mr-3" /> Sign Out
                    </Button>
                </div>

                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {msg && (
                        <div className={`p-4 rounded-md ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                            {msg.text}
                        </div>
                    )}

                    {activeTab === 'general' && (
                        <Card className="p-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                <Settings className="h-5 w-5 mr-2 text-slate-400 " /> Profile Details
                            </h3>
                            
                            <div className="space-y-4 max-w-md">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 ">Username</label>
                                    <div className="mt-1 p-2 block w-full rounded-md border border-slate-200  bg-slate-50  text-slate-500  sm:text-sm">
                                        {user.username}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 ">Email</label>
                                    <div className="mt-1 p-2 block w-full rounded-md border border-slate-200  bg-slate-50  text-slate-500  sm:text-sm">
                                        {user.email}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-slate-100 ">
                                <h4 className="text-sm font-medium text-slate-900  mb-4">Privacy & Data</h4>
                                <div className="space-y-3">
                                    <Button variant="outline" className="w-full justify-start" onClick={handleExportData} isLoading={loading} icon={<Download className="h-4 w-4"/>}>
                                        Export My Data
                                    </Button>
                                    <Button variant="outline" className="w-full justify-start text-red-600  border-red-200  hover:bg-red-50 :bg-red-900/20" onClick={handleDeleteAccount} isLoading={loading} icon={<Trash2 className="h-4 w-4"/>}>
                                        Delete Account
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'general' && (
                        <Card className="p-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                <HardDrive className="h-5 w-5 mr-2 text-slate-400 " /> Storage & Data
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="p-4 rounded-lg bg-slate-50  border border-slate-100 ">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-medium text-slate-700 ">Cloud Storage Usage</span>
                                        <span className="text-sm text-slate-500 font-mono">{(storageUsage / 1024 / 1024).toFixed(4)} MB / 10.00 GB</span>
                                    </div>
                                    <div className="w-full bg-slate-200  rounded-full h-2.5 mb-2 overflow-hidden">
                                        <div className="bg-indigo-600  h-2.5 rounded-full" style={{ width: `${Math.max(1, Math.min(100, (storageUsage / STORAGE_LIMIT) * 100))}%` }}></div>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2 mb-4">10 GB standard limit. Items older than 15 days are automatically removed to save space.</p>
                                    {onManageStorage && (
                                        <Button variant="outline" className="w-full bg-white justify-start" onClick={onManageStorage} icon={<List className="h-4 w-4"/>}>
                                            Manage Storage (History)
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'security' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            {/* Active Sessions */}
                            <Card className="p-6">
                                <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                    <Laptop className="h-5 w-5 mr-2 text-slate-400 " /> Active Sessions
                                </h3>
                                <div className="space-y-4">
                                    {sessions.map(session => (
                                        <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100  bg-slate-50 ">
                                            <div className="flex items-start">
                                                <div className="mt-1 mr-3">{getDeviceIcon(session.userAgent)}</div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-slate-900  truncate max-w-[200px]" title={session.userAgent}>
                                                            {session.userAgent}
                                                        </p>
                                                        {session.isCurrent && (
                                                            <span className="px-2 py-0.5 text-[10px] bg-green-100  text-green-800  rounded-full font-bold uppercase tracking-wide">
                                                                Current
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center text-xs text-slate-500  mt-1">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        Last active: {new Date(session.lastUsedAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                            {!session.isCurrent && (
                                                <button 
                                                    onClick={() => handleRevokeSession(session.id)}
                                                    className="text-xs text-red-600  hover:text-red-800 :text-red-300 hover:underline"
                                                >
                                                    Revoke
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="p-6">
                                <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                    <Link2 className="h-5 w-5 mr-2 text-slate-400 " /> Linked Accounts
                                </h3>
                                <div className="space-y-4">
                                    {/* Google */}
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100  bg-slate-50 ">
                                        <div className="flex items-center">
                                            <Chrome className="h-5 w-5 text-red-500 mr-3" />
                                            <div>
                                                <p className="text-sm font-medium text-slate-900 ">Google</p>
                                                <p className="text-xs text-slate-500 ">{isLinked('google') ? 'Connected' : 'Not connected'}</p>
                                            </div>
                                        </div>
                                        <Button 
                                            variant={isLinked('google') ? 'outline' : 'primary'} 
                                            className="text-xs px-3 py-1 h-8"
                                            onClick={() => isLinked('google') ? handleUnlinkAccount('google') : handleLinkAccount('google')}
                                            isLoading={loading}
                                        >
                                            {isLinked('google') ? 'Disconnect' : 'Connect'}
                                        </Button>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-6">
                                <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                    <Key className="h-5 w-5 mr-2 text-slate-400 " /> Change Password
                                </h3>
                                <div className="space-y-4 max-w-md">
                                    <p className="text-sm text-slate-600 mb-4">
                                        Click the button below to receive a password reset link at <strong>{user.email}</strong>.
                                    </p>
                                    <Button onClick={handleResetPassword} isLoading={loading}>
                                        Send Password Reset Email
                                    </Button>
                                </div>
                            </Card>

                            <Card className="p-6">
                                <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                    <Shield className="h-5 w-5 mr-2 text-slate-400 " /> Two-Factor Authentication
                                </h3>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-700  font-medium">Require 2FA for login</p>
                                        <p className="text-xs text-slate-500 ">Adds an extra layer of security to your account.</p>
                                    </div>
                                    <button 
                                        onClick={handleToggleMFA}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${user.settings?.mfaEnabled ? 'bg-indigo-600 ' : 'bg-slate-200 '}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${user.settings?.mfaEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <Card className="p-6 animate-in fade-in slide-in-from-right-4">
                            <h3 className="text-lg font-medium text-slate-900  mb-4 flex items-center">
                                <Activity className="h-5 w-5 mr-2 text-slate-400 " /> Recent Activity
                            </h3>
                            <div className="space-y-0 border  rounded-lg overflow-hidden">
                                {logs.length === 0 && (
                                    <div className="p-6 text-center text-slate-500 ">No activity logs found.</div>
                                )}
                                {logs.map((log, i) => (
                                    <div key={log.id} className={`p-4 flex items-center justify-between bg-white  border-b border-slate-100  last:border-0 hover:bg-slate-50 :bg-slate-700/50 transition-colors ${log.status === 'WARNING' ? 'bg-yellow-50 ' : ''}`}>
                                        <div className="flex items-start gap-3">
                                            <div className={`p-2 rounded-full ${
                                                log.status === 'SUCCESS' ? 'bg-green-100  text-green-600 ' : 
                                                log.status === 'WARNING' ? 'bg-yellow-100  text-yellow-600 ' : 
                                                'bg-red-100  text-red-600 '
                                            }`}>
                                                {getLogIcon(log.action)}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-800 ">{log.action.replace(/_/g, ' ')}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                        log.status === 'SUCCESS' ? 'bg-green-100  text-green-700 ' : 
                                                        log.status === 'WARNING' ? 'bg-yellow-100  text-yellow-700 ' : 
                                                        'bg-red-100  text-red-700 '
                                                    }`}>
                                                        {log.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500  mt-0.5">{log.details || 'No details'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-500 ">{new Date(log.timestamp).toLocaleDateString()}</div>
                                            <div className="text-xs text-slate-400 ">{new Date(log.timestamp).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};
