import React, { useState, useRef, useEffect } from 'react';
import { Summary, PlagiarismMatch, UploadedFile } from '../types';
import { Button, Card, Header, Modal, Input } from '../components/UI';
import { MultiFileInput } from '../components/MultiFileInput';
import { extractTextFromFile, generatePDF, downloadTextFile } from '../services/fileService';
import { generateSummaryFromText, checkWebOriginality, regenerateSummary } from '../services/geminiService';
import { analyzeLocalSimilarity } from '../services/analysisService';
import { saveHistoryItem } from '../services/storageService';
import { logActivity } from '../services/activityService';
import { Upload, FileText, Download, Save, ShieldAlert, ShieldCheck, RefreshCw, Globe, Search, ChevronDown, Copy, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
  initialData?: Summary | null;
}

export const Summarizer: React.FC<Props> = ({ onBack, initialData }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'result'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [sourceText, setSourceText] = useState<string>("");
  const [summaryData, setSummaryData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState<'combined' | 'individual'>('combined');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  
  // Plagiarism State
  const [isCheckingPlagiarism, setIsCheckingPlagiarism] = useState(false);
  const [showHighlights, setShowHighlights] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Export State
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
      if (initialData) {
          setSummaryData(initialData);
          setStep('result');
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

  const handleSummarize = async (mode: 'combined' | 'individual') => {
    const successfulFiles = uploadedFiles.filter(f => f.status === 'success' && f.extractedText);
    if (successfulFiles.length === 0) return;
    setStep('processing');
    setError(null);
    setSummaryMode(mode);
    setActiveFileIndex(0);
    try {
      if (mode === 'combined' || successfulFiles.length === 1) {
        const combinedText = successfulFiles.map(f => `--- ${f.file.name} ---\n${f.extractedText}`).join('\n\n');
        setSourceText(combinedText); // Store for local comparison
        const summaryText = await generateSummaryFromText(combinedText);
        
        // Auto-run local similarity check
        const localAnalysis = analyzeLocalSimilarity(summaryText, combinedText);

        const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
        const newSummary: Summary = {
          id: crypto.randomUUID(),
          title: `${successfulFiles.length === 1 ? successfulFiles[0].file.name : 'Combined'} - Summary`,
          sourceFileName: sourceNames,
          createdAt: Date.now(),
          content: summaryText,
          isCombined: true,
          plagiarismAnalysis: {
              score: localAnalysis.score,
              matches: localAnalysis.matches,
              checkedAt: Date.now(),
              sourceType: 'local'
          }
        };
        setSummaryData(newSummary);
        saveHistoryItem({
            id: newSummary.id,
            type: 'summary',
            title: newSummary.title,
            date: newSummary.createdAt,
            data: newSummary
        });
        logActivity('Generated Summary', `Generated combined summary from ${successfulFiles.length} file(s).`);
      } else {
        // Individual summaries
        const individualSummaries = [];
        for (const file of successfulFiles) {
          const summaryText = await generateSummaryFromText(file.extractedText!);
          individualSummaries.push({
            fileName: file.file.name,
            content: summaryText
          });
        }
        
        const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
        const newSummary: Summary = {
          id: crypto.randomUUID(),
          title: `Individual Summaries (${successfulFiles.length} files)`,
          sourceFileName: sourceNames,
          createdAt: Date.now(),
          content: individualSummaries[0].content, // Default content
          isCombined: false,
          individualSummaries: individualSummaries,
        };
        setSourceText(successfulFiles[0].extractedText || "");
        setSummaryData(newSummary);
        saveHistoryItem({
            id: newSummary.id,
            type: 'summary',
            title: newSummary.title,
            date: newSummary.createdAt,
            data: newSummary
        });
        logActivity('Generated Summary', `Generated individual summaries for ${successfulFiles.length} file(s).`);
      }
      setStep('result');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to summarize document.");
      setStep('upload');
    }
  };

  const handleCheckWebPlagiarism = async () => {
    if (!summaryData) return;
    setIsCheckingPlagiarism(true);
    try {
        const webResult = await checkWebOriginality(summaryData.content);
        
        // Merge web results with existing local results
        const currentMatches = summaryData.plagiarismAnalysis?.matches || [];
        const newMatches = [...currentMatches, ...webResult.matches];
        
        // Update score (take the higher of local vs web, or average)
        const currentScore = summaryData.plagiarismAnalysis?.score || 0;
        const newScore = Math.max(currentScore, webResult.score);

        const updatedSummary = {
            ...summaryData,
            plagiarismAnalysis: {
                score: newScore,
                matches: newMatches,
                checkedAt: Date.now(),
                sourceType: 'hybrid' as const
            }
        };
        setSummaryData(updatedSummary);
        saveHistoryItem({
            id: updatedSummary.id,
            type: 'summary',
            title: updatedSummary.title,
            date: updatedSummary.createdAt,
            data: updatedSummary
        });
        logActivity('Checked Plagiarism', `Checked web originality for summary.`);
    } catch (e) {
        console.error("Web check failed", e);
        alert("Failed to check web sources. Please try again.");
    } finally {
        setIsCheckingPlagiarism(false);
    }
  };

  const handleRegenerateLowerSimilarity = async () => {
      if (!summaryData || !sourceText) return;
      setIsRegenerating(true);
      try {
          // Ask to rewrite abstractively
          const newContent = await regenerateSummary(sourceText, "Rewrite the summary to be more abstractive and unique. Avoid using exact phrases from the source text.");
          const localAnalysis = analyzeLocalSimilarity(newContent, sourceText);
          
          const updatedSummary = {
              ...summaryData,
              content: newContent,
              plagiarismAnalysis: {
                  score: localAnalysis.score,
                  matches: localAnalysis.matches,
                  checkedAt: Date.now(),
                  sourceType: 'local' as const
              }
          };
          setSummaryData(updatedSummary);
          saveHistoryItem({
              id: updatedSummary.id,
              type: 'summary',
              title: updatedSummary.title,
              date: updatedSummary.createdAt,
              data: updatedSummary
          });
          logActivity('Regenerated Summary', `Regenerated summary for lower similarity.`);
      } catch (e) {
          console.error("Regeneration failed", e);
      } finally {
          setIsRegenerating(false);
      }
  };

  const handleDownload = (format: 'pdf' | 'txt') => {
    if (!summaryData) return;
    
    let contentToRender = summaryData.content;
    let titleToRender = summaryData.title;
    
    if (!summaryData.isCombined && summaryData.individualSummaries) {
        contentToRender = summaryData.individualSummaries[activeFileIndex].content;
        titleToRender = `${summaryData.individualSummaries[activeFileIndex].fileName} - Summary`;
    }

    if (format === 'pdf') {
        generatePDF(titleToRender, contentToRender);
        logActivity('Exported Summary', `Exported summary as PDF: ${titleToRender}`);
    } else {
        downloadTextFile(titleToRender, contentToRender);
        logActivity('Exported Summary', `Exported summary as TXT: ${titleToRender}`);
    }
    setShowExportMenu(false);
  };

  // Render content with highlights
  const renderContentWithHighlights = () => {
      if (!summaryData) return null;
      
      let contentToRender = summaryData.content;
      if (!summaryData.isCombined && summaryData.individualSummaries) {
          contentToRender = summaryData.individualSummaries[activeFileIndex].content;
      }

      const { plagiarismAnalysis } = summaryData;
      
      if (!showHighlights || !plagiarismAnalysis?.matches?.length) {
           return contentToRender.split('\n').map((line, i) => (
             <p key={i} className={line.startsWith('**') || line.startsWith('#') ? 'font-bold text-lg mt-4 mb-2 ' : 'mb-2 text-slate-700  leading-relaxed'}>
               {line.replace(/\*\*/g, '').replace(/#/g, '')}
             </p>
           ));
      }

      // Naive highlighting: Split by lines and check if line contains matched text
      // Ideally we'd map character indices, but for this demo we check inclusion
      return contentToRender.split('\n').map((line, i) => {
          const cleanLine = line.replace(/\*\*/g, '').replace(/#/g, '');
          
          // Check if this line contains any flagged segments
          let highlightedLine: React.ReactNode = cleanLine;
          const match = plagiarismAnalysis.matches.find(m => cleanLine.includes(m.text));

          if (match) {
              const colorClass = match.source === 'web' ? 'bg-blue-100  decoration-blue-400 ' : 'bg-yellow-100  decoration-yellow-400 ';
              // Simple replacement for the first occurrence to highlight
              const parts = cleanLine.split(match.text);
              if (parts.length > 1) {
                  highlightedLine = (
                      <span>
                          {parts[0]}
                          <span 
                            className={`${colorClass} underline decoration-2 cursor-help rounded px-0.5`}
                            title={`Similar to ${match.source === 'local' ? 'source document' : 'web source'}`}
                          >
                              {match.text}
                          </span>
                          {parts.slice(1).join(match.text)}
                      </span>
                  );
              }
          }

          return (
             <p key={i} className={line.startsWith('**') || line.startsWith('#') ? 'font-bold text-lg mt-4 mb-2 ' : 'mb-2 text-slate-700  leading-relaxed'}>
               {highlightedLine}
             </p>
           );
      });
  };

  if (step === 'upload' || step === 'processing') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Header title="Summarize Document" onBack={onBack} />
        <Card className="p-6 border border-slate-200 bg-white">
            <div className="mb-4 text-center">
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
            
            {uploadedFiles.length > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
                    {uploadedFiles.filter(f => f.status === 'success').length > 1 ? (
                        <>
                            <Button 
                                onClick={() => handleSummarize('combined')} 
                                variant="secondary" 
                                isLoading={step === 'processing' && summaryMode === 'combined'}
                                disabled={step === 'processing'}
                            >
                                {step === 'processing' && summaryMode === 'combined' ? 'Reading...' : 'Combined Summary'}
                            </Button>
                            <Button 
                                onClick={() => handleSummarize('individual')} 
                                variant="outline" 
                                isLoading={step === 'processing' && summaryMode === 'individual'}
                                disabled={step === 'processing'}
                            >
                                {step === 'processing' && summaryMode === 'individual' ? 'Reading...' : 'Individual Summary'}
                            </Button>
                        </>
                    ) : (
                        <Button 
                            onClick={() => handleSummarize('combined')} 
                            variant="secondary" 
                            isLoading={step === 'processing'}
                            disabled={uploadedFiles.filter(f => f.status === 'success').length === 0}
                        >
                            {step === 'processing' ? 'Reading...' : 'Summarize'}
                        </Button>
                    )}
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-sm text-center">{error}</p>}
        </Card>
      </div>
    );
  }

  const score = summaryData?.plagiarismAnalysis?.score || 0;
  const scoreColor = score < 20 ? 'text-emerald-600  bg-emerald-50  border-emerald-200 ' : score < 50 ? 'text-yellow-600  bg-yellow-50  border-yellow-200 ' : 'text-red-600  bg-red-50  border-red-200 ';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24" onClick={() => setShowExportMenu(false)}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <Header title={summaryData?.title || "Summary"} onBack={onBack} />
        <div className="flex space-x-2 relative">
            <div className="relative">
                <Button 
                    variant="secondary" 
                    onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }} 
                    icon={<Download className="h-4 w-4"/>}
                >
                    Download
                    <ChevronDown className="h-4 w-4 ml-1 opacity-80" />
                </Button>
                
                {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-40 bg-white  rounded-lg shadow-lg border border-slate-100  py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => handleDownload('pdf')}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700  hover:bg-slate-50 :bg-slate-700 hover:text-emerald-600 :text-emerald-400 flex items-center"
                        >
                            <span className="w-8 font-bold text-xs text-red-500  border  rounded px-1 mr-2">PDF</span>
                            PDF Document
                        </button>
                        <button 
                            onClick={() => handleDownload('txt')}
                            className="w-full text-left px-4 py-2 text-sm text-slate-700  hover:bg-slate-50 :bg-slate-700 hover:text-emerald-600 :text-emerald-400 flex items-center"
                        >
                            <span className="w-8 font-bold text-xs text-slate-500  border  rounded px-1 mr-2">TXT</span>
                            Text File
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      <div className="grid md:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="md:col-span-2">
             {!summaryData?.isCombined && summaryData?.individualSummaries && (
                 <div className="mb-4">
                     <h3 className="text-sm font-semibold text-slate-700 mb-2">No. of files: {summaryData.individualSummaries.length}</h3>
                     <div className="flex flex-wrap gap-2">
                         {summaryData.individualSummaries.map((summary, idx) => (
                             <button
                                 key={idx}
                                 onClick={() => setActiveFileIndex(idx)}
                                 className={`px-3 py-1 text-sm rounded-full transition-colors ${activeFileIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                             >
                                 {summary.fileName}
                             </button>
                         ))}
                     </div>
                 </div>
             )}
             <Card className="p-8 min-h-[50vh] relative">
                {/* Loading overlay for regeneration */}
                {isRegenerating && (
                    <div className="absolute inset-0 bg-white/80  flex items-center justify-center z-10 backdrop-blur-sm">
                         <div className="text-center">
                            <RefreshCw className="h-8 w-8 animate-spin text-indigo-600  mx-auto mb-2"/>
                            <p className="text-sm font-medium text-slate-600 ">Rewriting for originality...</p>
                         </div>
                    </div>
                )}
                <div className="prose prose-slate  max-w-none">
                   {renderContentWithHighlights()}
                </div>
             </Card>
          </div>

          {/* Sidebar: Plagiarism Tools */}
          <div className="md:col-span-1 space-y-4">
             <Card className="p-5">
                 <div className="flex items-center mb-4">
                    <ShieldAlert className="h-5 w-5 text-slate-400  mr-2" />
                    <h3 className="font-bold text-slate-800 ">Originality Check</h3>
                 </div>

                 {/* Score Display */}
                 <div className={`p-4 rounded-lg border text-center mb-4 ${scoreColor}`}>
                     <div className="text-3xl font-bold">{score}%</div>
                     <div className="text-xs uppercase tracking-wider font-semibold opacity-80">Similarity Score</div>
                 </div>

                 <div className="space-y-3">
                     {/* Highlights Toggle */}
                     <div className="flex items-center justify-between text-sm text-slate-600 ">
                         <span>Show Matches</span>
                         <button 
                            onClick={() => setShowHighlights(!showHighlights)}
                            className={`w-10 h-5 rounded-full transition-colors relative ${showHighlights ? 'bg-indigo-600 ' : 'bg-slate-300 '}`}
                         >
                             <span className={`absolute top-1 bottom-1 w-3 h-3 bg-white rounded-full transition-all ${showHighlights ? 'left-6' : 'left-1'}`} />
                         </button>
                     </div>
                    
                     {/* Matches List (Mini) */}
                     {summaryData?.plagiarismAnalysis?.matches && summaryData.plagiarismAnalysis.matches.length > 0 ? (
                        <div className="text-xs text-slate-500  max-h-32 overflow-y-auto border-t border-slate-100  pt-2 mt-2">
                            <p className="mb-1 font-medium">{summaryData.plagiarismAnalysis.matches.length} segments flagged:</p>
                            {summaryData.plagiarismAnalysis.matches.slice(0, 3).map((m, i) => (
                                <div key={i} className="truncate pl-2 border-l-2 border-yellow-300  mb-1" title={m.text}>
                                    "{m.text.substring(0, 40)}..."
                                </div>
                            ))}
                            {summaryData.plagiarismAnalysis.matches.length > 3 && <span>+ {summaryData.plagiarismAnalysis.matches.length - 3} more</span>}
                        </div>
                     ) : (
                         <div className="text-xs text-emerald-600  flex items-center pt-2 border-t border-slate-100 ">
                             <ShieldCheck className="h-4 w-4 mr-1" /> No local matches found.
                         </div>
                     )}

                     <div className="pt-4 border-t border-slate-100  space-y-2">
                         {/* Web Check Button */}
                         <Button 
                            variant="outline" 
                            className="w-full text-xs justify-center" 
                            onClick={handleCheckWebPlagiarism}
                            isLoading={isCheckingPlagiarism}
                            icon={<Globe className="h-3 w-3" />}
                        >
                            Check Web (Beta)
                         </Button>

                         {/* Regenerate Button */}
                         {score > 20 && (
                             <Button 
                                variant="primary" 
                                className="w-full text-xs justify-center"
                                onClick={handleRegenerateLowerSimilarity}
                                isLoading={isRegenerating}
                                icon={<RefreshCw className="h-3 w-3" />}
                             >
                                Regenerate Unique
                             </Button>
                         )}
                     </div>
                 </div>
             </Card>

             {summaryData?.plagiarismAnalysis?.sourceType === 'hybrid' && (
                 <div className="text-xs text-center text-slate-400">
                     Includes results from Document & Web Search
                 </div>
             )}
          </div>
      </div>
    </div>
  );
};