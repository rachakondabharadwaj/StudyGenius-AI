
import React, { useState, useEffect } from 'react';
import { Flashcard, FlashcardSet, UploadedFile } from '../types';
import { Button, Card, Header, Modal, Input } from '../components/UI';
import { MultiFileInput } from '../components/MultiFileInput';
import { extractTextFromFile, generateFlashcardsPDF } from '../services/fileService';
import { generateFlashcardsFromText, discoverTopicsPerFile } from '../services/geminiService';
import { FileTopics } from '../types';
import { saveHistoryItem } from '../services/storageService';
import { logActivity } from '../services/activityService';
import { Upload, Layers, Download, Save, ArrowRight, Loader2, RotateCw, FileDown, Globe, Copy, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
  initialData?: FlashcardSet | null;
}

export const FlashcardGenerator: React.FC<Props> = ({ onBack, initialData }) => {
  const [step, setStep] = useState<'upload' | 'generating' | 'preview'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [extractedText, setExtractedText] = useState<string>("");
  
  // Config
  const [numCards, setNumCards] = useState<number>(10);
  const [cardStyle, setCardStyle] = useState<'Q&A' | 'Term/Definition'>('Term/Definition');
  const [discoveredTopics, setDiscoveredTopics] = useState<FileTopics[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [isAnalyzingTopics, setIsAnalyzingTopics] = useState(false);

  const [flashcardSet, setFlashcardSet] = useState<FlashcardSet | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  
  const [flashcardMode, setFlashcardMode] = useState<'combined' | 'individual'>('combined');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);

  useEffect(() => {
      if (initialData) {
          setFlashcardSet(initialData);
          setFlashcards(initialData.cards);
          setStep('preview');
      }
  }, [initialData]);

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
      if (selectedTopics.includes(topicKey)) {
          setSelectedTopics(selectedTopics.filter(t => t !== topicKey));
      } else {
          setSelectedTopics([...selectedTopics, topicKey]);
      }
  };

  const handleGenerate = async (mode: 'combined' | 'individual') => {
    const successfulFiles = uploadedFiles.filter(f => f.status === 'success' && f.extractedText);
    if (successfulFiles.length === 0 || !extractedText) return;
    setStep('generating');
    setFlashcardMode(mode);
    setActiveFileIndex(0);
    try {
        if (mode === 'combined' || successfulFiles.length === 1) {
            const finalTopics = selectedTopics.map(t => t.split('|')[1]);
            const cards = await generateFlashcardsFromText(extractedText, numCards, cardStyle, finalTopics);
            
            const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
            const newSet: FlashcardSet = {
                id: crypto.randomUUID(),
                title: `${successfulFiles.length === 1 ? successfulFiles[0].file.name : 'Combined'} - Flashcards`,
                sourceFileName: sourceNames,
                createdAt: Date.now(),
                cards: cards,
                isCombined: true
            };
            setFlashcardSet(newSet);
            setFlashcards(cards);
            saveHistoryItem({
                id: newSet.id,
                type: 'flashcards',
                title: newSet.title,
                date: newSet.createdAt,
                data: newSet
            });
            logActivity('Generated Flashcards', `Generated ${cards.length} flashcards from ${successfulFiles.length} file(s).`);
        } else {
            const individualSets = [];
            for (const file of successfulFiles) {
                const fileTopics = selectedTopics.filter(t => t.startsWith(`${file.file.name}|`)).map(t => t.split('|')[1]);
                const cards = await generateFlashcardsFromText(file.extractedText!, numCards, cardStyle, fileTopics);
                individualSets.push({
                    fileName: file.file.name,
                    cards: cards
                });
            }
            const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
            const newSet: FlashcardSet = {
                id: crypto.randomUUID(),
                title: `Individual Flashcards (${successfulFiles.length} files)`,
                sourceFileName: sourceNames,
                createdAt: Date.now(),
                cards: individualSets[0].cards,
                isCombined: false,
                individualSets: individualSets
            };
            setFlashcardSet(newSet);
            setFlashcards(individualSets[0].cards);
            saveHistoryItem({
                id: newSet.id,
                type: 'flashcards',
                title: newSet.title,
                date: newSet.createdAt,
                data: newSet
            });
            logActivity('Generated Flashcards', `Generated individual flashcards for ${successfulFiles.length} file(s).`);
        }
        setStep('preview');
    } catch (e: any) {
        setError("Generation failed: " + e.message);
        setStep('upload');
    }
  };

  const handleFlip = (id: string) => {
      const newFlipped = new Set(flippedCards);
      if (newFlipped.has(id)) newFlipped.delete(id);
      else newFlipped.add(id);
      setFlippedCards(newFlipped);
  };

  const handleExportPDF = () => {
      const cardsToExport = !flashcardSet?.isCombined && flashcardSet?.individualSets ? flashcardSet.individualSets[activeFileIndex].cards : flashcards;
      const titleToExport = !flashcardSet?.isCombined && flashcardSet?.individualSets ? `${flashcardSet.individualSets[activeFileIndex].fileName} Flashcards` : `${initialData?.title || flashcardSet?.title || 'Multi-file'} Flashcards`;
      generateFlashcardsPDF(titleToExport, cardsToExport);
      logActivity('Exported Flashcards', `Exported flashcards as PDF: ${titleToExport}`);
  };

  // Render Upload Step
  if (step === 'upload' || step === 'generating') {
      return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <Header title="Generate Flashcards" onBack={onBack} />
            
            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
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

                    {discoveredTopics.length > 0 && (
                        <Card className="p-4 max-h-60 overflow-y-auto">
                            <h4 className="font-semibold mb-2 text-slate-700 ">Focus on Chapters:</h4>
                            <div className="flex flex-col gap-4">
                                {discoveredTopics.map((fileTopics, fileIdx) => (
                                    <div key={fileIdx} className="flex flex-col gap-2">
                                        <h5 className="text-sm font-semibold text-slate-800 border-b pb-1">{fileTopics.fileName}</h5>
                                        <div className="space-y-2">
                                            {fileTopics.topics.map(t => {
                                                const topicKey = `${fileTopics.fileName}|${t}`;
                                                return (
                                                    <label key={topicKey} className="flex items-start space-x-2 cursor-pointer p-2 hover:bg-slate-50 :bg-slate-800/50 rounded transition-colors">
                                                        <input type="checkbox" checked={selectedTopics.includes(topicKey)} onChange={() => toggleTopic(topicKey)} className="mt-1" />
                                                        <span className="text-sm text-slate-600 ">{t}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="p-6">
                        <h3 className="font-bold text-slate-800  mb-4">Configuration</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700  mb-1">Card Count</label>
                                <div className="flex space-x-2">
                                    {[5, 10, 20, 30].map(num => (
                                        <button 
                                            key={num}
                                            onClick={() => setNumCards(num)}
                                            className={`px-3 py-1 rounded border  text-sm transition-colors ${numCards === num ? 'bg-purple-600  text-white border-purple-600 ' : 'bg-white  text-slate-600  hover:bg-slate-50 :bg-slate-700'}`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700  mb-1">Style</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setCardStyle('Term/Definition')}
                                        className={`p-2 rounded border  text-sm transition-colors ${cardStyle === 'Term/Definition' ? 'bg-purple-50  border-purple-500  text-purple-700 ' : 'bg-white  text-slate-700  hover:bg-slate-50 :bg-slate-700'}`}
                                    >
                                        Term / Definition
                                    </button>
                                    <button 
                                        onClick={() => setCardStyle('Q&A')}
                                        className={`p-2 rounded border  text-sm transition-colors ${cardStyle === 'Q&A' ? 'bg-purple-50  border-purple-500  text-purple-700 ' : 'bg-white  text-slate-700  hover:bg-slate-50 :bg-slate-700'}`}
                                    >
                                        Question / Answer
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                {uploadedFiles.filter(f => f.status === 'success').length > 1 ? (
                                    <>
                                        <Button 
                                            onClick={() => handleGenerate('combined')} 
                                            isLoading={step === 'generating' && flashcardMode === 'combined'} 
                                            disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || isAnalyzingTopics || step === 'generating'}
                                            className="w-full"
                                        >
                                            {step === 'generating' && flashcardMode === 'combined' ? 'Generating...' : 'Combined Cards'}
                                        </Button>
                                        <Button 
                                            onClick={() => handleGenerate('individual')} 
                                            variant="outline"
                                            isLoading={step === 'generating' && flashcardMode === 'individual'} 
                                            disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || isAnalyzingTopics || step === 'generating'}
                                            className="w-full"
                                        >
                                            {step === 'generating' && flashcardMode === 'individual' ? 'Generating...' : 'Individual Cards'}
                                        </Button>
                                    </>
                                ) : (
                                    <Button 
                                        onClick={() => handleGenerate('combined')} 
                                        isLoading={step === 'generating'} 
                                        disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || isAnalyzingTopics}
                                        className="w-full"
                                    >
                                        {step === 'generating' ? 'Generating...' : 'Generate Cards'}
                                    </Button>
                                )}
                            </div>
                            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
      );
  }

  // Render Preview
  const cardsToRender = !flashcardSet?.isCombined && flashcardSet?.individualSets ? flashcardSet.individualSets[activeFileIndex].cards : flashcards;

  return (
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <div className="flex justify-between items-center mb-6">
              <Header title={initialData?.title || flashcardSet?.title || "Flashcards Preview"} onBack={onBack} />
              <div className="flex space-x-2">
                  <Button variant="outline" onClick={handleExportPDF} icon={<Download className="h-4 w-4"/>}>PDF</Button>
              </div>
          </div>

          {!flashcardSet?.isCombined && flashcardSet?.individualSets && (
              <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">No. of files: {flashcardSet.individualSets.length}</h3>
                  <div className="flex flex-wrap gap-2">
                      {flashcardSet.individualSets.map((set, idx) => (
                          <button
                              key={idx}
                              onClick={() => setActiveFileIndex(idx)}
                              className={`px-3 py-1 text-sm rounded-full transition-colors ${activeFileIndex === idx ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                              {set.fileName}
                          </button>
                      ))}
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cardsToRender.map((card, i) => {
                  const isFlipped = flippedCards.has(card.id);
                  return (
                      <div key={card.id} className="min-h-[16rem] h-auto perspective-1000 cursor-pointer group" onClick={() => handleFlip(card.id)}>
                          <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d grid ${isFlipped ? 'rotate-y-180' : ''}`}>
                              {/* Front */}
                              <div className="relative [grid-area:1/1] w-full h-auto min-h-full bg-white rounded-xl shadow border-2 border-slate-100 p-6 flex flex-col items-center justify-center backface-hidden break-words whitespace-normal overflow-hidden" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                                  <span className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-4 shrink-0">
                                      {cardStyle === 'Q&A' ? 'Question' : 'Term'}
                                  </span>
                                  <p className="text-lg text-center font-medium text-slate-800 w-full break-words whitespace-normal">{card.front}</p>
                                  <RotateCw className="h-4 w-4 text-slate-300 absolute bottom-4 right-4 group-hover:text-purple-400 transition-colors shrink-0" />
                              </div>
                              
                              {/* Back */}
                              <div className="relative [grid-area:1/1] w-full h-auto min-h-full bg-purple-50 rounded-xl shadow border-2 border-purple-100 p-6 flex flex-col items-center justify-center rotate-y-180 backface-hidden break-words whitespace-normal overflow-hidden" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                                  <span className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-4 shrink-0">
                                      {cardStyle === 'Q&A' ? 'Answer' : 'Definition'}
                                  </span>
                                  <p className="text-base text-center text-slate-700 w-full break-words whitespace-normal">{card.back}</p>
                              </div>
                          </div>
                      </div>
                  );
              })}
          </div>
          
           <style>{`
            .perspective-1000 { perspective: 1000px; }
            .transform-style-3d { transform-style: preserve-3d; }
            .backface-hidden { backface-visibility: hidden; }
            .rotate-y-180 { transform: rotateY(180deg); }
          `}</style>
      </div>
  );
};
