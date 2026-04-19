
import React from 'react';
import { ViewState } from '../types';
import { Card, Button } from '../components/UI';
import { BookOpen, FileText, History, Layers, BrainCircuit, LogIn, Activity } from 'lucide-react';

interface HomeProps {
  onChangeView: (view: ViewState) => void;
  isLoggedIn?: boolean;
}

export const Home: React.FC<HomeProps> = ({ onChangeView, isLoggedIn }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900  mb-6 tracking-tight">
          Study<span className="text-indigo-600 ">Genius</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600  max-w-2xl mx-auto">
          Transform your documents into interactive quizzes, concise summaries, and smart study aids instantly using AI.
        </p>
        {!isLoggedIn && (
            <div className="mt-8">
                <Button onClick={() => onChangeView(ViewState.AUTH)} icon={<LogIn className="h-4 w-4" />}>
                    Sign In to Sync Progress
                </Button>
            </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-indigo-100 :border-indigo-900 group bg-white " >
            <div className="h-12 w-12 bg-indigo-100  rounded-xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 transition-colors">
                <BookOpen className="h-6 w-6 text-indigo-600  group-hover:text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900  mb-2">Generate Quiz</h2>
            <p className="text-sm text-slate-500  mb-6">Upload a PDF and let AI create a custom multiple-choice test to check your knowledge.</p>
            <Button onClick={() => onChangeView(ViewState.QUIZ_UPLOAD)} className="w-full">Start Quiz</Button>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-emerald-100 :border-emerald-900 group bg-white ">
             <div className="h-12 w-12 bg-emerald-100  rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-500 transition-colors">
                <FileText className="h-6 w-6 text-emerald-600  group-hover:text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900  mb-2">Summarize</h2>
            <p className="text-sm text-slate-500  mb-6">Get key points from long docs. Perfect for quick review and understanding complex topics.</p>
            <Button variant="secondary" onClick={() => onChangeView(ViewState.SUMMARY_UPLOAD)} className="w-full">Summarize</Button>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-100 :border-purple-900 group bg-white ">
             <div className="h-12 w-12 bg-purple-100  rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-500 transition-colors">
                <Layers className="h-6 w-6 text-purple-600  group-hover:text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900  mb-2">Flashcards</h2>
            <p className="text-sm text-slate-500  mb-6">Create study decks from your notes. Export to Anki or PDF for revision.</p>
            <Button onClick={() => onChangeView(ViewState.FLASHCARDS_UPLOAD)} className="w-full bg-purple-600 hover:bg-purple-700  :bg-purple-600">Create Deck</Button>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-100 :border-blue-900 group bg-white ">
             <div className="h-12 w-12 bg-blue-100  rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500 transition-colors">
                <BrainCircuit className="h-6 w-6 text-blue-600  group-hover:text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900  mb-2">Smart Notes</h2>
            <p className="text-sm text-slate-500  mb-6">Generate Mindmaps, Comparison Tables, and Formula sheets automatically.</p>
            <Button onClick={() => onChangeView(ViewState.NOTES_UPLOAD)} className="w-full bg-blue-600 hover:bg-blue-700  :bg-blue-600">Create Notes</Button>
        </Card>
      </div>

      <div className="flex justify-center gap-4">
        <button 
            onClick={() => onChangeView(ViewState.HISTORY)}
            className="flex items-center text-slate-500 hover:text-slate-800  :text-slate-200 font-medium px-6 py-3 rounded-full hover:bg-white :bg-slate-800 transition-colors"
        >
            <History className="h-5 w-5 mr-2" />
            History
        </button>
        <button 
            onClick={() => onChangeView(ViewState.ACTIVITY_LOG)}
            className="flex items-center text-slate-500 hover:text-slate-800  :text-slate-200 font-medium px-6 py-3 rounded-full hover:bg-white :bg-slate-800 transition-colors"
        >
            <Activity className="h-5 w-5 mr-2" />
            Activity Log
        </button>
      </div>
    </div>
  );
};
