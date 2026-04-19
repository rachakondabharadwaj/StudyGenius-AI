
import React, { useState, useEffect, useRef } from 'react';
import { NoteType, SmartNote, MindMapNode, ComparisonTable, UploadedFile } from '../types';
import { Button, Card, Header, Modal, Input } from '../components/UI';
import { MultiFileInput } from '../components/MultiFileInput';
import { extractTextFromFile, generatePDF } from '../services/fileService';
import { generateSmartNotes, generatePodcastAudio } from '../services/geminiService';
import { saveHistoryItem } from '../services/storageService';
import { logActivity } from '../services/activityService';
import { MindMap } from '../components/MindMap';
import { Upload, FileText, Network, Table, Mic, Download, Save, ArrowRight, Eye, Loader2, Globe, Copy, Check } from 'lucide-react';

interface Props {
  onBack: () => void;
  initialData?: SmartNote | null;
}

const createWavBlobFromPcm = (base64Data: string): Blob => {
    const binary = atob(base64Data);
    const pcmData = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        pcmData[i] = binary.charCodeAt(i);
    }
    
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    const pcmArray = new Uint8Array(buffer, 44);
    pcmArray.set(pcmData);
    
    return new Blob([buffer], { type: 'audio/wav' });
};

export const NotesGenerator: React.FC<Props> = ({ onBack, initialData }) => {
  const [step, setStep] = useState<'upload' | 'generating' | 'preview'>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Config
  const [noteType, setNoteType] = useState<NoteType>('CONDENSED');
  const [granularity, setGranularity] = useState<'Short' | 'Medium' | 'Long'>('Medium');

  // Result
  const [smartNote, setSmartNote] = useState<SmartNote | null>(null);
  const [result, setResult] = useState<string | MindMapNode | ComparisonTable | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  
  const [noteMode, setNoteMode] = useState<'combined' | 'individual'>('combined');
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const mindMapRef = useRef<HTMLDivElement>(null);
  
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const resultToRender = !smartNote?.isCombined && smartNote?.individualNotes ? smartNote.individualNotes[activeFileIndex].content : result;

  useEffect(() => {
      if (initialData) {
          setSmartNote(initialData);
          setResult(initialData.content);
          setNoteType(initialData.type);
          setNoteTitle(initialData.title);
          if (initialData.audioBase64) {
              const blob = createWavBlobFromPcm(initialData.audioBase64);
              setAudioUrl(URL.createObjectURL(blob));
          }
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

  const handleGenerate = async (mode: 'combined' | 'individual') => {
    const successfulFiles = uploadedFiles.filter(f => f.status === 'success' && f.extractedText);
    if (successfulFiles.length === 0) return;
    
    setNoteMode(mode);
    setActiveFileIndex(0);
    setAudioUrl(null);
    
    const isStreamingType = noteType === 'CONDENSED' || noteType === 'PODCAST';
    
    if (isStreamingType) {
        setStep('preview');
        setResult(''); // Clear previous
    } else {
        setStep('generating');
    }

    try {
        if (mode === 'combined' || successfulFiles.length === 1) {
            const combinedText = successfulFiles.map(f => `--- ${f.file.name} ---\n${f.extractedText}`).join('\n\n');
            const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
            const title = `${successfulFiles.length === 1 ? successfulFiles[0].file.name : 'Combined'} - ${noteType}`;
            setNoteTitle(title);

            const data = await generateSmartNotes(
                combinedText, 
                noteType, 
                granularity,
                isStreamingType ? (partialText) => setResult(partialText) : undefined
            );
            
            const newNote: SmartNote = {
                id: crypto.randomUUID(),
                title: title,
                type: noteType,
                content: data,
                createdAt: Date.now(),
                sourceFileName: sourceNames,
                isCombined: true
            };
            setSmartNote(newNote);
            setResult(data);
            saveHistoryItem({
                id: newNote.id,
                type: 'note',
                title: newNote.title,
                date: newNote.createdAt,
                data: newNote
            });
            logActivity('Generated Notes', `Generated combined ${noteType} notes from ${successfulFiles.length} file(s).`);
        } else {
            const title = `Individual Notes (${successfulFiles.length} files) - ${noteType}`;
            setNoteTitle(title);
            const sourceNames = successfulFiles.map(f => f.file.name).join(', ');
            
            const individualNotes = [];
            for (const file of successfulFiles) {
                const data = await generateSmartNotes(
                    file.extractedText!, 
                    noteType, 
                    granularity,
                    undefined // Disable streaming for individual to avoid UI complexity
                );
                individualNotes.push({
                    fileName: file.file.name,
                    content: data
                });
            }
            
            const newNote: SmartNote = {
                id: crypto.randomUUID(),
                title: title,
                type: noteType,
                content: individualNotes[0].content, // Default content
                createdAt: Date.now(),
                sourceFileName: sourceNames,
                isCombined: false,
                individualNotes: individualNotes
            };
            setSmartNote(newNote);
            setResult(individualNotes[0].content);
            saveHistoryItem({
                id: newNote.id,
                type: 'note',
                title: newNote.title,
                date: newNote.createdAt,
                data: newNote
            });
            logActivity('Generated Notes', `Generated individual ${noteType} notes for ${successfulFiles.length} file(s).`);
        }
        
        if (!isStreamingType || mode === 'individual') {
            setStep('preview');
        }
    } catch (e: any) {
        console.error(e);
        setError("Generation failed: " + e.message);
        setStep('upload');
    }
  };

  const formatMindMapToText = (node: MindMapNode, depth: number = 0): string => {
      if (!node) return "";
      
      // Handle old schema format where the actual node is wrapped in a 'root' property
      if (depth === 0 && (node as any).root && typeof (node as any).root === 'object') {
          return formatMindMapToText((node as any).root, depth);
      }

      const indent = "  ".repeat(depth);
      const label = node.label || (node as any).name || 'Unknown';
      let text = `${indent}${depth === 0 ? '# ' : '- '}${label}\n`;
      if (node.children && Array.isArray(node.children)) {
          node.children.forEach(child => {
              text += formatMindMapToText(child, depth + 1);
          });
      }
      return text;
  };

  const handleGenerateAudio = async () => {
      if (!resultToRender || typeof resultToRender !== 'string') return;
      setIsGeneratingAudio(true);
      try {
          const audioBase64 = await generatePodcastAudio(resultToRender);
          if (audioBase64) {
              if (smartNote) {
                  const updatedNote = { ...smartNote, audioBase64 };
                  setSmartNote(updatedNote);
                  saveHistoryItem({
                      id: updatedNote.id,
                      type: 'note',
                      title: updatedNote.title,
                      date: updatedNote.createdAt,
                      data: updatedNote
                  });
              }
              const blob = createWavBlobFromPcm(audioBase64);
              setAudioUrl(URL.createObjectURL(blob));
          } else {
              alert("Failed to generate audio.");
          }
      } catch (e) {
          console.error(e);
          alert("Error generating audio.");
      } finally {
          setIsGeneratingAudio(false);
      }
  };

  const handleDownload = async () => {
      try {
          if (!resultToRender) {
              console.log("No resultToRender");
              return;
          }
          let contentString = "";
          
          if (noteType === 'MINDMAP') {
              const mindMapData = resultToRender as MindMapNode;
              console.log("Mindmap data:", mindMapData);
              if (typeof mindMapData === 'string') {
                  contentString = mindMapData;
              } else {
                  contentString = formatMindMapToText(mindMapData);
              }
              console.log("Formatted mindmap text:", contentString);
          } else if (noteType === 'TABLE') {
              const table = resultToRender as ComparisonTable;
              contentString = `${table.title}\n\n`;
              contentString += table.headers.join(" | ") + "\n";
              contentString += table.headers.map(() => "---").join(" | ") + "\n";
              table.rows.forEach(row => {
                  contentString += row.join(" | ") + "\n";
              });
          } else {
              contentString = resultToRender as string;
          }

          console.log("Generating PDF with title:", noteTitle);
          generatePDF(noteTitle || 'Mindmap', contentString);
          logActivity('Exported Notes', `Exported notes as PDF: ${noteTitle}`);
      } catch (err) {
          console.error("Error in handleDownload:", err);
          alert("Failed to download PDF. See console for details.");
      }
  };

  if (step === 'upload' || step === 'generating') {
      return (
          <div className="max-w-4xl mx-auto px-4 py-12">
              <Header title="Smart Notes Generator" subtitle="Create mindmaps, tables, and summaries instantly." onBack={onBack} />
              
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
                  </div>
                  
                  <div className="space-y-6">
                      <Card className="p-6">
                          <h3 className="font-bold text-slate-800  mb-4">Configuration</h3>
                          
                          <div className="space-y-4">
                              <div>
                                  <label className="block text-sm font-medium text-slate-700  mb-2">Note Type</label>
                                  <div className="grid grid-cols-2 gap-3">
                                      <button 
                                        onClick={() => setNoteType('CONDENSED')}
                                        className={`flex flex-col items-center p-3 rounded border transition-all ${noteType === 'CONDENSED' ? 'bg-blue-50  border-blue-500 text-blue-700 ' : 'bg-white  hover:bg-slate-50 :bg-slate-700  '}`}
                                      >
                                          <FileText className="h-5 w-5 mb-1" />
                                          <span className="text-xs font-medium">Condensed</span>
                                      </button>
                                      <button 
                                        onClick={() => setNoteType('MINDMAP')}
                                        className={`flex flex-col items-center p-3 rounded border transition-all ${noteType === 'MINDMAP' ? 'bg-blue-50  border-blue-500 text-blue-700 ' : 'bg-white  hover:bg-slate-50 :bg-slate-700  '}`}
                                      >
                                          <Network className="h-5 w-5 mb-1" />
                                          <span className="text-xs font-medium">Mindmap</span>
                                      </button>
                                      <button 
                                        onClick={() => setNoteType('TABLE')}
                                        className={`flex flex-col items-center p-3 rounded border transition-all ${noteType === 'TABLE' ? 'bg-blue-50  border-blue-500 text-blue-700 ' : 'bg-white  hover:bg-slate-50 :bg-slate-700  '}`}
                                      >
                                          <Table className="h-5 w-5 mb-1" />
                                          <span className="text-xs font-medium">Table</span>
                                      </button>
                                      <button 
                                        onClick={() => setNoteType('PODCAST')}
                                        className={`flex flex-col items-center p-3 rounded border transition-all ${noteType === 'PODCAST' ? 'bg-blue-50  border-blue-500 text-blue-700 ' : 'bg-white  hover:bg-slate-50 :bg-slate-700  '}`}
                                      >
                                          <Mic className="h-5 w-5 mb-1" />
                                          <span className="text-xs font-medium">Podcast</span>
                                      </button>
                                  </div>
                              </div>

                              <div>
                                  <label className="block text-sm font-medium text-slate-700  mb-2">Detail Level</label>
                                  <div className="flex rounded-md shadow-sm" role="group">
                                      {['Short', 'Medium', 'Long'].map((level) => (
                                          <button
                                            key={level}
                                            onClick={() => setGranularity(level as any)}
                                            className={`flex-1 px-4 py-2 text-sm font-medium border first:rounded-l-lg last:rounded-r-lg
                                                ${granularity === level 
                                                    ? 'z-10 bg-blue-600  text-white border-blue-600 ' 
                                                    : 'bg-white  text-slate-700  border-slate-200  hover:bg-slate-50 :bg-slate-700'
                                                }
                                            `}
                                          >
                                              {level}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                  {uploadedFiles.filter(f => f.status === 'success').length > 1 ? (
                                      <>
                                          <Button 
                                              onClick={() => handleGenerate('combined')} 
                                              isLoading={step === 'generating' && noteMode === 'combined'} 
                                              disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || step === 'generating'}
                                              className="w-full"
                                              icon={<ArrowRight className="h-4 w-4" />}
                                          >
                                              {step === 'generating' && noteMode === 'combined' ? 'Thinking...' : 'Combined Notes'}
                                          </Button>
                                          <Button 
                                              onClick={() => handleGenerate('individual')} 
                                              variant="outline"
                                              isLoading={step === 'generating' && noteMode === 'individual'} 
                                              disabled={uploadedFiles.filter(f => f.status === 'success').length === 0 || step === 'generating'}
                                              className="w-full"
                                              icon={<ArrowRight className="h-4 w-4" />}
                                          >
                                              {step === 'generating' && noteMode === 'individual' ? 'Thinking...' : 'Individual Notes'}
                                          </Button>
                                      </>
                                  ) : (
                                      <Button 
                                          onClick={() => handleGenerate('combined')} 
                                          isLoading={step === 'generating'} 
                                          disabled={uploadedFiles.filter(f => f.status === 'success').length === 0}
                                          className="w-full"
                                          icon={<ArrowRight className="h-4 w-4" />}
                                      >
                                          {step === 'generating' ? 'Thinking...' : 'Generate Notes'}
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

  // Preview Step
  const renderPreviewContent = () => {
      if (noteType === 'MINDMAP') {
          return (
              <div ref={mindMapRef} className="overflow-auto p-4 min-h-[400px] flex justify-center bg-white rounded-xl">
                  <MindMap node={resultToRender as MindMapNode} />
              </div>
          );
      } else if (noteType === 'TABLE') {
          const table = resultToRender as ComparisonTable;
          return (
              <div className="overflow-x-auto">
                  <h3 className="text-xl font-bold mb-4 text-center text-slate-800 ">{table?.title}</h3>
                  <table className="w-full border-collapse border border-slate-200  text-sm">
                      <thead>
                          <tr className="bg-slate-100 ">
                              {table?.headers?.map((h, i) => (
                                  <th key={i} className="border border-slate-300  px-4 py-2 text-left font-semibold text-slate-700 ">{h}</th>
                              ))}
                          </tr>
                      </thead>
                      <tbody>
                          {table?.rows?.map((row, i) => (
                              <tr key={i} className="even:bg-slate-50 :bg-slate-800/50 hover:bg-indigo-50 :bg-indigo-900/20">
                                  {row.map((cell, j) => (
                                      <td key={j} className="border border-slate-300  px-4 py-2 text-slate-600 ">{cell}</td>
                                  ))}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          );
      } else {
          // Text / Markdown preview
          if (!resultToRender) {
              return (
                  <div className="flex items-center justify-center h-40 text-slate-500 ">
                       <Loader2 className="h-6 w-6 animate-spin mr-3" />
                       <span>Generating notes stream...</span>
                  </div>
              );
          }
          return (
              <div className="prose prose-slate  max-w-none">
                  {noteType === 'PODCAST' && step === 'preview' && (resultToRender as string).length > 100 && (
                      <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center">
                          {audioUrl ? (
                              <audio controls src={audioUrl} className="w-full max-w-md" />
                          ) : (
                              <Button 
                                  onClick={handleGenerateAudio} 
                                  isLoading={isGeneratingAudio}
                                  icon={<Mic className="h-4 w-4" />}
                              >
                                  {isGeneratingAudio ? 'Generating Audio...' : 'Listen to Podcast'}
                              </Button>
                          )}
                      </div>
                  )}
                  {(resultToRender as string).split('\n').map((line, i) => {
                      if (!line.trim()) return <br key={i} />;
                      
                      const isHeading = line.startsWith('#');
                      const cleanLine = line.replace(/^#+\s/, '');
                      
                      // Process basic markdown: **bold** and *italic*
                      const processFormatting = (text: string) => {
                          const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
                          return parts.map((part, idx) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={idx} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
                              } else if (part.startsWith('*') && part.endsWith('*')) {
                                  return <em key={idx}>{part.slice(1, -1)}</em>;
                              }
                              return part;
                          });
                      };

                      return (
                          <p key={i} className={`${isHeading ? 'font-bold text-lg mt-4 text-slate-900 ' : 'text-slate-700 leading-relaxed'} ${line.trim().startsWith('-') || line.trim().startsWith('*') ? 'ml-6 list-item' : ''}`}>
                              {processFormatting(cleanLine)}
                          </p>
                      );
                  })}
                  <div className="h-4 w-4 bg-indigo-500  rounded-full animate-pulse mt-4 inline-block" style={{ display: (step === 'preview' && (resultToRender as string).length < 100) ? 'inline-block' : 'none' }}></div>
              </div>
          );
      }
  };

  return (
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
              <Header title={noteTitle} subtitle={`Generated ${noteType.toLowerCase()} notes`} onBack={onBack} />
              <div className="flex space-x-2">
                  <Button variant="outline" onClick={handleDownload} icon={<Download className="h-4 w-4"/>}>
                      Download PDF
                  </Button>
              </div>
          </div>

          {!smartNote?.isCombined && smartNote?.individualNotes && (
              <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">No. of files: {smartNote.individualNotes.length}</h3>
                  <div className="flex flex-wrap gap-2">
                      {smartNote.individualNotes.map((note, idx) => (
                          <button
                              key={idx}
                              onClick={() => setActiveFileIndex(idx)}
                              className={`px-3 py-1 text-sm rounded-full transition-colors ${activeFileIndex === idx ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                              {note.fileName}
                          </button>
                      ))}
                  </div>
              </div>
          )}

          <Card className="p-8 min-h-[50vh] bg-white  shadow-lg">
              {renderPreviewContent()}
          </Card>
      </div>
  );
};
