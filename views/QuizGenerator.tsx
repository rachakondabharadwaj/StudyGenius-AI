
import React, { useState, useEffect, useRef } from 'react';
import { Quiz, UploadedFile } from '../types';
import { Button, Card, Header, Modal, Input } from '../components/UI';
import { MultiFileInput } from '../components/MultiFileInput';
import { extractTextFromFile, downloadQuizPDF } from '../services/fileService';
import { generateQuizFromText, discoverTopicsPerFile } from '../services/geminiService';
import { FileTopics } from '../types';
import { saveHistoryItem } from '../services/storageService';
import { logActivity } from '../services/activityService';
import { Upload, CheckCircle, XCircle, Download, Save, ArrowRight, Settings, AlertCircle, Mic, Volume2, Square, Loader2, ListChecks, FileText, Globe, Copy, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
  initialData?: Quiz | null;
}

export const QuizGenerator: React.FC<Props> = ({ onBack, initialData }) => {
  const [step, setStep] = useState<'upload' | 'generating' | 'taking' | 'results'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isAnalyzingTopics, setIsAnalyzingTopics] = useState(false);
  
  // Configuration State
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<string>('Medium');
  const [topic, setTopic] = useState<string>(''); // Manual override
  const [explanationDepth, setExplanationDepth] = useState<string>('Simple');
  const [quizMode, setQuizMode] = useState<'combined' | 'individual'>('combined');

  // Topic Discovery State
  const [discoveredTopics, setDiscoveredTopics] = useState<FileTopics[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const [quizData, setQuizData] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Voice Interaction State
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listeningId, setListeningId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);

  useEffect(() => {
      if (initialData) {
          setQuizData(initialData);
          if (initialData.userAnswers) {
              setUserAnswers(initialData.userAnswers);
          }
          // If score exists, assume completed
          setStep(initialData.score !== undefined ? 'results' : 'taking');
      }
  }, [initialData]);

  useEffect(() => {
    if (quizData && (step === 'taking' || step === 'results')) {
      const files = Array.from(new Set(quizData.questions.map(q => q.sourceFile).filter(Boolean) as string[]));
      if (files.length > 0 && !activeTab) {
        setActiveTab(files[0]);
      }
    }
  }, [quizData, step, activeTab]);

  useEffect(() => {
    setCurrentQuestionIndex(0);
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (step === 'taking') {
        // Prevent back navigation
        window.history.pushState(null, '', window.location.href);
        setShowExitWarning(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'taking') {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    if (step === 'taking') {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [step]);

  useEffect(() => {
    if (step === 'taking') {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
      }
    } else if (step === 'results') {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
      }
    }
  }, [step]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && step === 'taking') {
        setShowExitWarning(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [step]);

  useEffect(() => {
    // Cleanup speech synthesis on unmount
    return () => {
      window.speechSynthesis.cancel();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // --- Voice Logic ---

  const handleSpeak = (text: string, id: string) => {
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    setSpeakingId(id);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleListen = (questionId: string, options: string[]) => {
    if (listeningId === questionId) {
        if (recognitionRef.current) recognitionRef.current.stop();
        setListeningId(null);
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Your browser does not support voice recognition.");
        return;
    }

    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true; 
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListeningId(questionId);
    
    recognition.onresult = (event: any) => {
        let transcript = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i] && event.results[i][0]) {
                transcript += event.results[i][0].transcript;
                if (event.results[i].isFinal) isFinal = true;
            }
        }
        
        transcript = transcript.toLowerCase().trim();
        if (!transcript) return;

        let matchedOption: string | null = null;
        const hasWord = (text: string, word: string) => new RegExp(`\\b${word}\\b`).test(text);

        const isCommand = (trigger: string, num: string, wordNum: string) => {
             if (transcript === trigger || transcript === num) return true;
             if (hasWord(transcript, `option ${trigger}`)) return true;
             if (hasWord(transcript, `option ${num}`)) return true;
             if (hasWord(transcript, `option ${wordNum}`)) return true;
             return false;
        };

        if (isCommand('a', '1', 'one')) matchedOption = options[0];
        else if (isCommand('b', '2', 'two')) matchedOption = options[1];
        else if (isCommand('c', '3', 'three')) matchedOption = options[2];
        else if (isCommand('d', '4', 'four')) matchedOption = options[3];
        
        if (!matchedOption) {
            const found = options.find(opt => {
                 const lowerOpt = opt.toLowerCase();
                 if (transcript.includes(lowerOpt) && lowerOpt.length > 3) return true;
                 if (isFinal && lowerOpt.includes(transcript) && transcript.length > 3) return true;
                 return false;
            });
            if (found) matchedOption = found;
        }

        if (matchedOption) {
            recognition.stop(); 
            handleOptionSelect(questionId, matchedOption);
            setListeningId(null);
        }
    };

    recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.error("Speech error", event.error);
        }
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             setListeningId(null);
             alert("Microphone access denied.");
        }
    };
    
    recognition.onend = () => {
         setTimeout(() => {
             setListeningId((current) => current === questionId ? null : current);
         }, 100);
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { console.error("Failed to start recognition", e); setListeningId(null); }
  };


  // --- Step 1: Upload & Config ---
  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setUploadedFiles(newFiles);
    
    newFiles.forEach(async (f) => {
      if (f.status === 'pending') {
        setUploadedFiles(prev => prev.map(p => p.fileId === f.fileId ? { ...p, status: 'processing' } : p));
        try {
          const text = await extractTextFromFile(f.file);
          setUploadedFiles(prev => prev.map(p => p.fileId === f.fileId ? { ...p, status: 'success', extractedText: text } : p));
        } catch (err: any) {
          console.error("File processing error:", err);
          setUploadedFiles(prev => prev.map(p => p.fileId === f.fileId ? { ...p, status: 'error', error: 'Failed to read file text' } : p));
        }
      }
    });
  };

  useEffect(() => {
    const processCombinedText = async () => {
      const successfulFiles = uploadedFiles.filter(f => f.status === 'success' && f.extractedText);
      const isProcessing = uploadedFiles.some(f => f.status === 'processing' || f.status === 'pending');
      
      if (!isProcessing && successfulFiles.length > 0) {
        const combinedText = successfulFiles.map(f => `--- ${f.file.name} ---\n${f.extractedText}`).join('\n\n');
        if (combinedText !== extractedText) {
          setExtractedText(combinedText);
          setIsAnalyzingTopics(true);
          try {
            const filesData = successfulFiles.map(f => ({
              fileName: f.file.name,
              content: f.extractedText || ''
            }));
            const topicsPerFile = await discoverTopicsPerFile(filesData);
            setDiscoveredTopics(topicsPerFile);
            
            const allTopics: string[] = [];
            topicsPerFile.forEach(ft => {
              ft.topics.forEach(t => allTopics.push(`${ft.fileName}|${t}`));
            });
            setSelectedTopics(allTopics);
          } catch (err) {
            console.error("Topic discovery error:", err);
          } finally {
            setIsAnalyzingTopics(false);
          }
        }
      } else if (successfulFiles.length === 0) {
        if (extractedText !== "") setExtractedText("");
        if (discoveredTopics.length > 0) setDiscoveredTopics([]);
        if (selectedTopics.length > 0) setSelectedTopics([]);
      }
    };

    processCombinedText();
  }, [uploadedFiles, extractedText, discoveredTopics.length, selectedTopics.length]);

  const toggleTopic = (topicKey: string) => {
      setSelectedTopics(prev => {
          if (prev.includes(topicKey)) {
              return prev.filter(t => t !== topicKey);
          } else {
              return [...prev, topicKey];
          }
      });
  };

  const handleSelectAllTopics = () => {
      const allTopics: string[] = [];
      discoveredTopics.forEach(ft => {
        ft.topics.forEach(t => allTopics.push(`${ft.fileName}|${t}`));
      });
      
      if (selectedTopics.length === allTopics.length) {
          setSelectedTopics([]);
      } else {
          setSelectedTopics(allTopics);
      }
  };

  const handleGenerate = async () => {
    const successfulFiles = uploadedFiles.filter(f => f.status === 'success');
    if (successfulFiles.length === 0 || !extractedText) {
        setError("Please upload and process at least one document first.");
        return;
    }
    
    setStep('generating');
    setError(null);
    try {
      let finalQuestions: any[] = [];
      let finalTitle = '';
      let finalTopic = topic;
      let finalSelectedTopics: string[] = [];

      if (quizMode === 'individual' && successfulFiles.length > 1) {
          finalTitle = 'Individual Quizzes';
          finalTopic = 'Multiple Files';
          
          for (const file of successfulFiles) {
              const fileSelectedTopics = selectedTopics
                  .filter(t => t.startsWith(`${file.file.name}|`))
                  .map(t => t.split('|')[1]);
                  
              const generatedData = await generateQuizFromText(
                  file.extractedText || '', 
                  questionCount, 
                  difficulty, 
                  topic, 
                  explanationDepth,
                  fileSelectedTopics
              );
              
              const questionsWithSource = generatedData.questions.map(q => ({
                  ...q,
                  sourceFile: file.file.name
              }));
              
              finalQuestions.push(...questionsWithSource);
          }
      } else {
          const allTopics: string[] = [];
          discoveredTopics.forEach(ft => {
            ft.topics.forEach(t => allTopics.push(`${ft.fileName}|${t}`));
          });
          
          finalSelectedTopics = selectedTopics.length > 0 && selectedTopics.length < allTopics.length 
            ? selectedTopics.map(t => t.split('|')[1]) 
            : []; 

          const generatedData = await generateQuizFromText(
              extractedText, 
              questionCount, 
              difficulty, 
              topic, 
              explanationDepth,
              finalSelectedTopics
          ); 
          finalQuestions = generatedData.questions;
          finalTitle = `${successfulFiles.length === 1 ? successfulFiles[0].file.name : 'Combined Multi-file'} - Quiz`;
          finalTopic = finalSelectedTopics.length > 0 ? 'Selected Chapters' : topic;
      }
      
      const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
      const newQuiz: Quiz = {
        id: crypto.randomUUID(),
        title: finalTitle,
        sourceFileName: sourceNames,
        createdAt: Date.now(),
        questions: finalQuestions,
        difficulty,
        topic: finalTopic, 
        selectedTopics: finalSelectedTopics,
        explanationDepth
      };
      setQuizData(newQuiz);
      setStep('taking');
      logActivity('Generated Quiz', `Generated a quiz with ${finalQuestions.length} questions from ${successfulFiles.length} file(s).`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate quiz. Please try again.");
      setStep('upload');
    }
  };

  const handleBackClick = () => {
    if (step === 'taking') {
      setShowExitWarning(true);
    } else {
      onBack();
    }
  };

  // --- Step 2: Taking Quiz ---
  const handleOptionSelect = (questionId: string, option: string) => {
    setUserAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const handleSubmit = () => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.stop();
    setStep('results');
    if (quizData) {
      const score = calculateScore();
      saveHistoryItem({
          id: quizData.id,
          type: 'quiz',
          title: quizData.title,
          date: Date.now(),
          data: { ...quizData, score, userAnswers }
      });
      logActivity('Submitted Quiz', `Completed quiz: ${quizData.title}`);
    }
  };

  // --- Step 3: Results ---
  const calculateScore = () => {
    if (!quizData) return 0;
    let correct = 0;
    quizData.questions.forEach(q => {
      if (userAnswers[q.id] === q.correctAnswer) correct++;
    });
    return correct;
  };

  // Export Handler
  const handleExport = (type: 'student' | 'teacher' | 'result') => {
      if (!quizData) return;
      downloadQuizPDF(quizData, type, type === 'result' ? userAnswers : undefined);
      logActivity('Exported Quiz', `Exported quiz as PDF: ${quizData.title}`);
  };

  // Renderers
  if (step === 'upload' || step === 'generating') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <Header title="Create New Quiz" onBack={onBack} />
        
        <div className="grid md:grid-cols-12 gap-8">
            {/* Left Column: File Upload */}
            <div className="md:col-span-7 space-y-6">
                <Card className="p-6 border border-slate-200 bg-white">
                    <div className="mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Upload Documents</h3>
                        <p className="text-sm text-slate-500">Support for PDF, DOCX, TXT, PPTX, and Images.</p>
                    </div>
                    
                    <MultiFileInput 
                        files={uploadedFiles}
                        onFilesChange={handleFilesChange}
                        maxFiles={5}
                        maxFileSizeMB={50}
                        maxTotalSizeMB={200}
                    />
                </Card>

                {/* Detected Topics Panel */}
                {(isAnalyzingTopics || discoveredTopics.length > 0) && (
                    <Card className="p-6 border border-slate-200 bg-white animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center text-slate-900">
                                <ListChecks className="h-5 w-5 mr-2 text-indigo-600" />
                                <h3 className="font-bold">Detected Chapters/Topics</h3>
                            </div>
                            {discoveredTopics.length > 0 && (
                                <button 
                                    onClick={handleSelectAllTopics} 
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    {selectedTopics.length === discoveredTopics.reduce((acc, curr) => acc + curr.topics.length, 0) ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>

                        {isAnalyzingTopics ? (
                            <div className="flex items-center justify-center py-8 text-slate-500 text-sm">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                Analyzing document structure...
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                                {discoveredTopics.map((fileTopics, fileIdx) => (
                                    <div key={fileIdx} className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between border-b pb-1">
                                            <h4 className="text-sm font-semibold text-slate-800">{fileTopics.fileName}</h4>
                                            <label className="flex items-center cursor-pointer text-xs text-slate-600 hover:text-indigo-600">
                                                <input 
                                                    type="checkbox"
                                                    className="mr-1.5 h-3.5 w-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                    checked={fileTopics.topics.every(t => selectedTopics.includes(`${fileTopics.fileName}|${t}`))}
                                                    onChange={(e) => {
                                                        const isChecked = e.target.checked;
                                                        const fileTopicKeys = fileTopics.topics.map(t => `${fileTopics.fileName}|${t}`);
                                                        if (isChecked) {
                                                            setSelectedTopics(prev => Array.from(new Set([...prev, ...fileTopicKeys])));
                                                        } else {
                                                            setSelectedTopics(prev => prev.filter(key => !fileTopicKeys.includes(key)));
                                                        }
                                                    }}
                                                />
                                                Select All
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {fileTopics.topics.map((t, i) => {
                                                const topicKey = `${fileTopics.fileName}|${t}`;
                                                return (
                                                    <label key={i} className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${selectedTopics.includes(topicKey) ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedTopics.includes(topicKey)}
                                                            onChange={() => toggleTopic(topicKey)}
                                                            className="mt-1 h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                        />
                                                        <span className="ml-2 text-sm text-slate-700">{t}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {discoveredTopics.length === 0 && !isAnalyzingTopics && extractedText && (
                            <p className="text-sm text-slate-400 text-center py-4">
                                No specific chapters detected. The quiz will cover the entire document.
                            </p>
                        )}
                    </Card>
                )}
            </div>

            {/* Right Column: Configuration */}
            <div className="md:col-span-5">
                <Card className="p-6 h-full border border-slate-200">
                    <div className="flex items-center mb-4 text-slate-900">
                        <Settings className="h-5 w-5 mr-2 text-indigo-600" />
                        <h3 className="font-bold">Quiz Configuration</h3>
                    </div>
                    
                    <div className="space-y-5">
                        {/* Quiz Mode */}
                        {uploadedFiles.filter(f => f.status === 'success').length > 1 && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Quiz Mode
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setQuizMode('combined')}
                                        className={`text-xs font-medium py-2 rounded border transition-colors ${
                                            quizMode === 'combined' 
                                            ? 'bg-indigo-600 text-white border-indigo-600' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        Combined Quiz
                                    </button>
                                    <button
                                        onClick={() => setQuizMode('individual')}
                                        className={`text-xs font-medium py-2 rounded border transition-colors ${
                                            quizMode === 'individual' 
                                            ? 'bg-indigo-600 text-white border-indigo-600' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        Individual Quizzes
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Number of Questions */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                {quizMode === 'individual' && uploadedFiles.filter(f => f.status === 'success').length > 1 
                                    ? 'Questions per File' 
                                    : 'Number of Questions'}
                            </label>
                            <input 
                                type="number" 
                                min={1} 
                                max={20} 
                                value={questionCount}
                                onChange={(e) => setQuestionCount(Number(e.target.value))}
                                className="w-full rounded-md border-slate-300 border px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900"
                            />
                        </div>

                        {/* Difficulty */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Difficulty Level
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {['Easy', 'Medium', 'Hard'].map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setDifficulty(level)}
                                        className={`text-xs font-medium py-2 rounded border transition-colors ${
                                            difficulty === level 
                                            ? 'bg-indigo-600 text-white border-indigo-600' 
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Explanation Depth */}
                        <div>
                             <label className="block text-sm font-medium text-slate-700 mb-1">
                                 Explanation Depth
                             </label>
                             <select
                                value={explanationDepth}
                                onChange={(e) => setExplanationDepth(e.target.value)}
                                className="w-full rounded-md border-slate-300 border px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 bg-white text-sm"
                             >
                                <option value="Simple">Simple (Concise)</option>
                                <option value="Detailed">Detailed (In-depth)</option>
                                <option value="Step-by-step">Step-by-step (Logical)</option>
                                <option value="Story">Story (Mnemonic)</option>
                             </select>
                        </div>

                        {/* Specific Topic (Manual Override) */}
                        {discoveredTopics.length === 0 && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Specific Focus Topic <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Historical Dates..."
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    className="w-full rounded-md border-slate-300 border px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                />
                            </div>
                        )}
                        
                        {/* Dynamic Button Text */}
                        <div className="mt-8 pt-4 border-t border-slate-100">
                             <Button 
                                onClick={handleGenerate} 
                                isLoading={step === 'generating'}
                                className="w-full justify-center"
                                icon={!step ? <ArrowRight className="h-4 w-4" /> : undefined}
                                disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || isAnalyzingTopics}
                            >
                                {step === 'generating' ? 'Generating...' : 
                                 selectedTopics.length > 0 && selectedTopics.length < discoveredTopics.length 
                                 ? `Generate Chapter Quiz (${selectedTopics.length})` 
                                 : 'Generate Full Quiz'}
                            </Button>
                            
                            {error && (
                                 <div className="mt-3 flex items-start text-red-500 text-xs">
                                    <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                 </div>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
      </div>
    );
  }

  if (step === 'taking' || step === 'results') {
    const isResults = step === 'results';
    const score = calculateScore();
    const total = quizData?.questions.length || 0;
    const percentage = Math.round((score / total) * 100);
    const fileNames = Array.from(new Set(quizData?.questions.map(q => q.sourceFile).filter(Boolean) as string[]));

    const formatTabName = (name: string) => {
      const base = name.replace(/\.[^/.]+$/, ""); // Remove extension
      return base.length > 15 ? base.substring(0, 15) + '...' : base;
    };

    const currentFileQuestions = quizData?.questions.filter(q => !activeTab || q.sourceFile === activeTab) || [];

    return (
      <div className={step === 'taking' ? "fixed inset-0 z-[100] bg-slate-50 flex flex-col overflow-hidden pb-20" : "max-w-3xl mx-auto px-4 py-8 pb-24 relative"}>
        <div className={step === 'taking' ? "flex-none bg-white border-b border-slate-200 shadow-sm px-4 py-4 z-30" : "flex items-center justify-between mb-8 sticky top-20 z-30 bg-slate-50/90 backdrop-blur py-2"}>
            <div className={step === 'taking' ? "max-w-5xl mx-auto flex items-center justify-between w-full" : "w-full flex items-center justify-between"}>
                <div className="flex-1">
                    <Header title={quizData?.title || "Quiz"} onBack={step === 'taking' ? undefined : handleBackClick} />
                    {/* Metadata Badges */}
                    <div className={`flex flex-wrap gap-2 mb-4 ${step === 'taking' ? 'mt-[-1rem]' : 'mt-[-1.5rem]'}`}>
                        {quizData?.difficulty && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded font-medium border border-slate-200">
                                {quizData.difficulty}
                            </span>
                        )}
                        {quizData?.explanationDepth && (
                            <span className="px-2 py-1 bg-purple-50 text-purple-600 text-xs rounded font-medium border border-purple-100">
                                Explanations: {quizData.explanationDepth}
                            </span>
                        )}
                        {quizData?.topic && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded font-medium border border-blue-100">
                                Topic: {quizData.topic}
                            </span>
                        )}
                    </div>
                </div>
                {isResults && (
                    <div className="bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-100 text-right">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Score</p>
                        <p className={`text-2xl font-bold ${percentage >= 70 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                            {score}/{total}
                        </p>
                    </div>
                )}
                {step === 'taking' && (
                    <div className="flex-shrink-0 ml-4">
                        <Button onClick={handleSubmit} variant="primary">
                            Submit Quiz
                        </Button>
                    </div>
                )}
            </div>
        </div>

        {/* Tabs for Individual Quizzes */}
        {fileNames.length > 1 && (
          <div className={`flex overflow-x-auto gap-2 pb-2 custom-scrollbar ${step === 'taking' ? 'max-w-5xl mx-auto w-full px-4 mt-4 flex-none' : 'mb-6'}`}>
            {fileNames.map(fileName => {
              const fileQuestions = quizData?.questions.filter(q => q.sourceFile === fileName) || [];
              const answeredInFile = fileQuestions.filter(q => userAnswers[q.id]).length;
              
              return (
              <button
                key={fileName}
                onClick={() => setActiveTab(fileName)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                  activeTab === fileName
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
                title={fileName}
              >
                {formatTabName(fileName)}
                {!isResults && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === fileName ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {answeredInFile}/{fileQuestions.length}
                  </span>
                )}
                {isResults && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === fileName ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {fileQuestions.filter(q => userAnswers[q.id] === q.correctAnswer).length}/{fileQuestions.length}
                  </span>
                )}
              </button>
            )})}
          </div>
        )}

        <div className={step === 'taking' ? "flex-1 overflow-hidden flex flex-col max-w-5xl mx-auto w-full px-4 py-6" : "space-y-8"} id="quiz-capture-area">
          {isResults && fileNames.length > 1 && activeTab && (() => {
            const fileQuestions = quizData?.questions.filter(q => q.sourceFile === activeTab) || [];
            const fileScore = fileQuestions.filter(q => userAnswers[q.id] === q.correctAnswer).length;
            const fileTotal = fileQuestions.length;
            const filePercentage = Math.round((fileScore / fileTotal) * 100);
            
            return (
              <div className="bg-white px-5 py-3 rounded-lg shadow-sm border border-slate-200 inline-block mb-2">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                  {formatTabName(activeTab)} Score
                </p>
                <p className={`text-xl font-bold ${filePercentage >= 70 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                  {fileScore} / {fileTotal}
                </p>
              </div>
            );
          })()}
          
          {!isResults ? (() => {
             const currentFileQuestions = quizData?.questions.filter(q => !activeTab || q.sourceFile === activeTab) || [];
             const q = currentFileQuestions[currentQuestionIndex];
             if (!q) return null;
             
             const userAnswer = userAnswers[q.id];
             const isSpeaking = speakingId === q.id;
             const isListening = listeningId === q.id;
             
             return (
               <div className={`flex flex-col md:flex-row gap-6 ${step === 'taking' ? 'h-full overflow-hidden' : ''}`}>
                 {/* Main Question Area */}
                 <div className={`flex-1 ${step === 'taking' ? 'flex flex-col overflow-hidden pr-2' : ''}`}>
                   <Card className={`quiz-card relative transition-all ${isListening ? 'ring-2 ring-indigo-400 shadow-md' : ''} ${step === 'taking' ? 'flex-1 flex flex-col overflow-hidden' : 'p-6 md:p-8 overflow-visible'}`}>
                     <div className={`flex-1 ${step === 'taking' ? 'overflow-y-auto p-6 md:p-8 custom-scrollbar' : ''}`}>
                       <div className="flex items-start justify-between mb-6">
                       <div className="flex items-start gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm">
                                {currentQuestionIndex + 1}
                            </span>
                            <h3 className="text-lg font-medium text-slate-900 leading-relaxed pt-1">{q.text}</h3>
                       </div>
                       
                       <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                           {/* TTS Button */}
                           <button 
                               onClick={() => {
                                   const optionsWithLabels = q.options.map((opt, i) => `Option ${i + 1}: ${opt}`).join('. ');
                                   handleSpeak(`${q.text}. ${optionsWithLabels}`, q.id);
                               }}
                               className={`p-2 rounded-full transition-colors ${isSpeaking ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                               title="Read Aloud"
                           >
                               {isSpeaking ? <Square className="h-4 w-4 fill-current" /> : <Volume2 className="h-4 w-4" />}
                           </button>
                           
                           {/* Voice Answer Button */}
                           <button 
                               onClick={() => handleListen(q.id, q.options)}
                               className={`p-2 rounded-full transition-colors relative ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                               title="Answer with Voice"
                           >
                               {isListening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                           </button>
                       </div>
                     </div>

                     <div className="space-y-3 pl-12 flex-1">
                       {q.options.map((opt) => {
                         let optionClass = "border-slate-200 hover:bg-slate-50 hover:border-indigo-300";
                         if (userAnswer === opt) {
                             optionClass = "bg-indigo-50 border-indigo-600 ring-1 ring-indigo-600";
                         }

                         return (
                           <div 
                             key={opt}
                             onClick={() => handleOptionSelect(q.id, opt)}
                             className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${optionClass}`}
                           >
                             <div className="flex items-center">
                                 <div className={`w-4 h-4 rounded-full border mr-3 flex items-center justify-center
                                     ${userAnswer === opt ? 'border-transparent bg-current' : 'border-slate-300'}
                                 `}>
                                     <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                 </div>
                                 <span className="text-slate-800">{opt}</span>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                     
                     {/* Listening Feedback */}
                     {isListening && (
                         <div className={`mt-4 ml-12 text-xs text-indigo-600 font-medium flex items-center ${step === 'taking' ? 'px-6 md:px-8 pb-4' : ''}`}>
                             <span className="animate-pulse mr-2">●</span> Listening... Say "Option 1", "A", or the answer text.
                         </div>
                     )}
                     </div>
                   </Card>
                 </div>
                 
                 {/* Right Sidebar */}
                 <div className={`w-full md:w-72 flex-shrink-0 ${step === 'taking' ? 'overflow-y-auto custom-scrollbar max-h-48 md:max-h-none' : ''}`}>
                   <Card className={`p-5 ${step === 'taking' ? 'h-full' : 'sticky top-24'}`}>
                     <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Questions</h3>
                     <div className="grid grid-cols-5 gap-2 mb-6">
                       {currentFileQuestions.map((qItem, idx) => {
                          const isAnswered = !!userAnswers[qItem.id];
                          const isCurrent = idx === currentQuestionIndex;
                          return (
                            <button 
                               key={qItem.id}
                               onClick={() => setCurrentQuestionIndex(idx)} 
                               className={`w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center transition-all
                                 ${isCurrent ? 'ring-2 ring-indigo-600 ring-offset-1' : ''} 
                                 ${isAnswered ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                               `}
                            >
                               {idx + 1}
                            </button>
                          );
                       })}
                     </div>
                   </Card>
                 </div>
               </div>
             );
          })() : (
            quizData?.questions
              .filter(q => !activeTab || q.sourceFile === activeTab)
              .map((q, idx) => {
                const userAnswer = userAnswers[q.id];
                const isCorrect = userAnswer === q.correctAnswer;
                const isSpeaking = speakingId === q.id;
                const isListening = listeningId === q.id;

                return (
                  <Card key={q.id} className={`quiz-card p-6 md:p-8 relative overflow-visible transition-all ${isListening ? 'ring-2 ring-indigo-400 shadow-md' : ''}`}>
                    <div className="flex items-start justify-between mb-6">
                       <div className="flex items-start gap-4">
                            <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm">
                                {idx + 1}
                            </span>
                            <h3 className="text-lg font-medium text-slate-900 leading-relaxed pt-1">{q.text}</h3>
                       </div>
                    </div>

                    <div className="space-y-3 pl-12">
                      {q.options.map((opt) => {
                        let optionClass = "border-slate-200 hover:bg-slate-50 hover:border-indigo-300";
                        let icon = null;

                        if (opt === q.correctAnswer) {
                             optionClass = "bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500";
                             icon = <CheckCircle className="h-5 w-5 text-emerald-500 absolute right-4 top-3" />;
                        } else if (opt === userAnswer && userAnswer !== q.correctAnswer) {
                             optionClass = "bg-red-50 border-red-500 ring-1 ring-red-500";
                             icon = <XCircle className="h-5 w-5 text-red-500 absolute right-4 top-3" />;
                        } else {
                             optionClass = "opacity-60 grayscale border-slate-100";
                        }

                        return (
                          <div 
                            key={opt}
                            className={`relative p-4 rounded-lg border-2 transition-all duration-200 ${optionClass}`}
                          >
                            <div className="flex items-center">
                                <div className={`w-4 h-4 rounded-full border mr-3 flex items-center justify-center
                                    ${opt === q.correctAnswer ? 'border-transparent bg-current' : 'border-slate-300'}
                                `}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                </div>
                                <span className="text-slate-800">{opt}</span>
                            </div>
                            {icon}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-6 ml-12 p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-slate-700">Explanation:</p>
                          {quizData?.explanationDepth && <span className="text-xs text-slate-400 uppercase">{quizData.explanationDepth} Style</span>}
                      </div>
                      <p className="text-slate-600 leading-relaxed">{q.explanation}</p>
                    </div>
                  </Card>
                );
              })
          )}
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-50">
            <div className="max-w-5xl mx-auto flex justify-between items-center">
                {!isResults ? (
                    <>
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                className="hidden sm:flex" 
                                onClick={() => handleExport('student')}
                                icon={<FileText className="h-4 w-4" />}
                            >
                                Print Test
                            </Button>
                            <div className="text-sm text-slate-500 hidden sm:block ml-4">
                                {Object.keys(userAnswers).length} of {total} answered
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {currentQuestionIndex > 0 ? (
                                <Button 
                                    variant="outline" 
                                    onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                                >
                                    &larr; Prev
                                </Button>
                            ) : (
                                fileNames.indexOf(activeTab || '') > 0 ? (
                                    <Button 
                                        variant="outline"
                                        onClick={() => {
                                            const idx = fileNames.indexOf(activeTab || '');
                                            setActiveTab(fileNames[idx - 1]);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    >
                                        &larr; Prev
                                    </Button>
                                ) : null
                            )}
                            
                            {currentQuestionIndex < currentFileQuestions.length - 1 ? (
                                <Button 
                                    variant="outline"
                                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                                >
                                    Next &rarr;
                                </Button>
                            ) : (
                                fileNames.indexOf(activeTab || '') < fileNames.length - 1 ? (
                                    <Button 
                                        variant="outline"
                                        onClick={() => {
                                            const idx = fileNames.indexOf(activeTab || '');
                                            setActiveTab(fileNames[idx + 1]);
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                    >
                                        Next &rarr;
                                    </Button>
                                ) : null
                            )}

                            <Button 
                                onClick={handleSubmit} 
                                disabled={Object.keys(userAnswers).length !== total}
                                icon={<ArrowRight className="h-4 w-4" />}
                                className="ml-4"
                            >
                                Submit
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <Button 
                            variant="primary" 
                            onClick={() => handleExport('result')}
                            icon={<Download className="h-4 w-4" />}
                        >
                            Download PDF
                        </Button>
                    </>
                )}
            </div>
        </div>
        {/* Exit Warning Modal */}
        <Modal 
          isOpen={showExitWarning} 
          onClose={() => {
            setShowExitWarning(false);
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
              elem.requestFullscreen().catch(err => console.log(err));
            }
          }} 
          title="Warning: Auto-Submit"
        >
          <div className="space-y-4">
            <p>If you exit, your quiz will be automatically submitted and unanswered questions will be marked as wrong.</p>
            <p>Do you want to continue?</p>
            <div className="flex justify-end gap-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowExitWarning(false);
                  const elem = document.documentElement;
                  if (elem.requestFullscreen) {
                    elem.requestFullscreen().catch(err => console.log(err));
                  }
                }}
              >
                No, stay in quiz
              </Button>
              <Button 
                variant="danger" 
                onClick={() => {
                  setShowExitWarning(false);
                  handleSubmit();
                }}
              >
                Yes, exit and submit
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return null;
};
