import React, { useState, useEffect } from 'react';
import { Header, Card } from '../components/UI';
import { getActivityLogs, ActivityLogEntry } from '../services/activityService';
import { Clock, Activity, FileText, BrainCircuit, ListChecks, BookOpen, LogIn, LogOut, Download, Share2, Save } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export const ActivityLog: React.FC<Props> = ({ onBack }) => {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const data = await getActivityLogs();
      setLogs(data);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const getIcon = (action: string) => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes('quiz')) return <ListChecks className="h-5 w-5 text-indigo-500" />;
    if (lowerAction.includes('summary')) return <FileText className="h-5 w-5 text-blue-500" />;
    if (lowerAction.includes('flashcard')) return <BrainCircuit className="h-5 w-5 text-purple-500" />;
    if (lowerAction.includes('note')) return <BookOpen className="h-5 w-5 text-emerald-500" />;
    if (lowerAction.includes('login')) return <LogIn className="h-5 w-5 text-green-500" />;
    if (lowerAction.includes('logout')) return <LogOut className="h-5 w-5 text-red-500" />;
    if (lowerAction.includes('download') || lowerAction.includes('export')) return <Download className="h-5 w-5 text-orange-500" />;
    if (lowerAction.includes('share')) return <Share2 className="h-5 w-5 text-teal-500" />;
    if (lowerAction.includes('save')) return <Save className="h-5 w-5 text-yellow-500" />;
    return <Activity className="h-5 w-5 text-slate-500" />;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Header title="Activity Log" subtitle="A record of all actions performed" onBack={onBack} />

      <Card className="p-6">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No activity recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative border-l-2 border-slate-100 ml-3 md:ml-4 space-y-8 pb-4">
              {logs.map((log) => (
                <div key={log.id} className="relative pl-6 md:pl-8">
                  <div className="absolute -left-[11px] md:-left-[11px] top-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm">
                    {getIcon(log.action)}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                      <h4 className="font-semibold text-slate-800">{log.action}</h4>
                      <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 whitespace-nowrap">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
