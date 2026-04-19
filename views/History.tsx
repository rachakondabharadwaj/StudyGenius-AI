import React, { useState, useEffect } from 'react';
import { ViewState, HistoryItem, FlashcardSet, SmartNote, MindMapNode, ComparisonTable } from '../types';
import { getHistory, deleteHistoryItem, updateHistoryItemTitle } from '../services/storageService';
import { generatePDF, generateFlashcardsPDF, downloadBulkZip, downloadQuizPDF } from '../services/fileService';
import { Button, Card, Header } from '../components/UI';
import { Trash2, Download, FileQuestion, FileText, Edit2, Check, X, Layers, BrainCircuit, Eye, Archive } from 'lucide-react';

interface Props {
  onBack: () => void;
  onOpen: (item: HistoryItem) => void;
}

export const History: React.FC<Props> = ({ onBack, onOpen }) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'quiz' | 'summary' | 'flashcards' | 'note'>('all');
  
  // Rename State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");

  // Selection State (for Bulk Export)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const loadHistory = async () => {
    const data = await getHistory();
    setItems(data);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      try {
          await deleteHistoryItem(id);
          await loadHistory();
          setSelectedIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
          });
      } catch (e: any) {
          alert("Error: " + e.message);
      }
    }
  };

  const formatMindMapToText = (node: any, depth: number = 0): string => {
      if (!node) return "";
      
      // Handle old schema format where the actual node is wrapped in a 'root' property
      if (depth === 0 && node.root && typeof node.root === 'object') {
          return formatMindMapToText(node.root, depth);
      }

      const indent = "  ".repeat(depth);
      const label = node.label || node.name || 'Unknown';
      let text = `${indent}${depth === 0 ? '# ' : '- '}${label}\n`;
      if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child: any) => {
              text += formatMindMapToText(child, depth + 1);
          });
      }
      return text;
  };

  const handleDownload = (item: HistoryItem) => {
    if (item.type === 'summary') {
        const data = item.data as any;
        let contentToRender = data.content;
        if (!data.isCombined && data.individualSummaries) {
            contentToRender = data.individualSummaries.map((s: any) => `--- ${s.fileName} ---\n${s.content}`).join('\n\n');
        }
        generatePDF(item.title, contentToRender);
    } else if (item.type === 'flashcards') {
        const data = item.data as FlashcardSet;
        let cardsToRender = data.cards;
        if (!data.isCombined && data.individualSets) {
            cardsToRender = data.individualSets.flatMap(s => s.cards);
        }
        generateFlashcardsPDF(item.title, cardsToRender);
    } else if (item.type === 'note') {
        const data = item.data as SmartNote;
        let contentString = "";
        
        if (!data.isCombined && data.individualNotes) {
            contentString = data.individualNotes.map(n => {
                let noteContent = "";
                if (data.type === 'MINDMAP') {
                    noteContent = typeof n.content === 'string' ? n.content : formatMindMapToText(n.content as MindMapNode);
                } else if (data.type === 'TABLE') {
                    const table = n.content as ComparisonTable;
                    noteContent = `${table.title}\n\n`;
                    noteContent += table.headers.join(" | ") + "\n";
                    noteContent += table.headers.map(() => "---").join(" | ") + "\n";
                    table.rows.forEach(row => noteContent += row.join(" | ") + "\n");
                } else {
                    noteContent = n.content as string;
                }
                return `--- ${n.fileName} ---\n${noteContent}`;
            }).join('\n\n');
        } else {
            if (data.type === 'MINDMAP') {
                if (typeof data.content === 'string') {
                    contentString = data.content;
                } else {
                    contentString = formatMindMapToText(data.content as MindMapNode);
                }
            } else if (data.type === 'TABLE') {
                 const table = data.content as ComparisonTable;
                 contentString = `${table.title}\n\n`;
                 contentString += table.headers.join(" | ") + "\n";
                 contentString += table.headers.map(() => "---").join(" | ") + "\n";
                 table.rows.forEach(row => contentString += row.join(" | ") + "\n");
            } else {
                contentString = data.content as string;
            }
        }
        generatePDF(item.title, contentString);
    } else {
        const data = item.data as any;
        downloadQuizPDF(data, 'result', data.userAnswers);
    }
  };

  const handleDownloadAudio = (item: HistoryItem) => {
      const data = item.data as SmartNote;
      if (!data.audioBase64) return;
      
      const binary = atob(data.audioBase64);
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
      
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/\s+/g, '_')}_Audio.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleBulkExport = async () => {
      if (selectedIds.size === 0) return;
      setIsExporting(true);
      
      const filesToZip: { filename: string, content: string }[] = [];
      
      const selectedItems = items.filter(i => selectedIds.has(i.id));
      
      // For simplicity in this demo, we export everything as text-based representations 
      // since generating multiple binary PDFs in a browser loop and zipping them requires more complex handling 
      // (converting jsPDF output to blob/buffer). 
      // We will store "Text Reports" in the ZIP.
      
      selectedItems.forEach(item => {
          let content = "";
          let ext = ".txt";
          
          if (item.type === 'quiz') {
              const q = item.data as any;
              content = `QUIZ: ${item.title}\n\n`;
              q.questions.forEach((qs: any, i: number) => {
                  content += `${i+1}. ${qs.text}\n   Answer: ${qs.correctAnswer}\n   Explanation: ${qs.explanation}\n\n`;
              });
          } else if (item.type === 'summary') {
              content = (item.data as any).content;
          } else if (item.type === 'flashcards') {
              const f = item.data as FlashcardSet;
              content = f.cards.map(c => `Q: ${c.front}\nA: ${c.back}`).join('\n\n');
          } else if (item.type === 'note') {
              const n = item.data as SmartNote;
              if (n.type === 'MINDMAP') {
                  if (typeof n.content === 'string') {
                      content = n.content;
                  } else {
                      content = formatMindMapToText(n.content);
                  }
              } else if (n.type === 'TABLE') {
                  const table = n.content as ComparisonTable;
                  content = `${table.title}\n\n`;
                  content += table.headers.join(" | ") + "\n";
                  table.rows.forEach(row => content += row.join(" | ") + "\n");
              } else if (typeof n.content === 'string') {
                  content = n.content;
              } else {
                  content = JSON.stringify(n.content, null, 2); // Fallback for structured
              }
          }
          
          filesToZip.push({
              filename: `${item.title.replace(/[^a-z0-9]/gi, '_')}${ext}`,
              content: content
          });
      });

      await downloadBulkZip(filesToZip, `StudyGenius_Export_${new Date().toISOString().split('T')[0]}`);
      setIsExporting(false);
      setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} selected items?`)) {
      try {
          for (const id of Array.from(selectedIds)) {
            await deleteHistoryItem(id);
          }
          await loadHistory();
          setSelectedIds(new Set());
      } catch (e: any) {
          alert("Error: " + e.message);
      }
    }
  };

  // Rename Handlers
  const handleStartEdit = (item: HistoryItem) => {
    setEditingId(item.id);
    setTempTitle(item.title);
  };

  const handleSaveEdit = async (id: string) => {
    if (tempTitle.trim()) {
        await updateHistoryItemTitle(id, tempTitle.trim());
        await loadHistory();
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTempTitle("");
  };

  // Selection Handlers
  const toggleSelection = (id: string) => {
      setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const filteredItems = items.filter(i => filter === 'all' || i.type === filter);

  const getTypeIcon = (type: string) => {
      switch(type) {
          case 'quiz': return <FileQuestion className="h-6 w-6" />;
          case 'summary': return <FileText className="h-6 w-6" />;
          case 'flashcards': return <Layers className="h-6 w-6" />;
          case 'note': return <BrainCircuit className="h-6 w-6" />;
          default: return <FileText className="h-6 w-6" />;
      }
  };

  const getTypeColor = (type: string) => {
      switch(type) {
          case 'quiz': return 'bg-indigo-100  text-indigo-600 ';
          case 'summary': return 'bg-emerald-100  text-emerald-600 ';
          case 'flashcards': return 'bg-purple-100  text-purple-600 ';
          case 'note': return 'bg-blue-100  text-blue-600 ';
          default: return 'bg-slate-100  text-slate-600 ';
      }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
          <Header title="History" onBack={onBack} />
          {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleBulkExport} 
                    isLoading={isExporting}
                    icon={<Archive className="h-4 w-4" />}
                  >
                      Export Selected ({selectedIds.size})
                  </Button>
                  <Button 
                    variant="danger"
                    onClick={handleBulkDelete} 
                    icon={<Trash2 className="h-4 w-4" />}
                  >
                      Delete Selected
                  </Button>
              </div>
          )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-8 bg-slate-100  p-1 rounded-lg inline-flex flex-wrap gap-1">
        {(['all', 'quiz', 'summary', 'flashcards', 'note'] as const).map((t) => (
            <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-all ${
                    filter === t ? 'bg-white  text-indigo-600  shadow-sm' : 'text-slate-500  hover:text-slate-700 :text-slate-300'
                }`}
            >
                {t === 'all' ? 'All Items' : t === 'note' ? 'Smart Notes' : t}
            </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400 ">
                <p>No items found in history.</p>
            </div>
        ) : (
            filteredItems.map((item) => (
                <Card key={item.id} className={`p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow ${selectedIds.has(item.id) ? 'ring-2 ring-indigo-500  bg-indigo-50/50 ' : ''}`}>
                    <div className="flex items-start gap-4 flex-grow min-w-0">
                        {/* Selection Checkbox */}
                        <div className="pt-3">
                            <input 
                                type="checkbox" 
                                checked={selectedIds.has(item.id)}
                                onChange={() => toggleSelection(item.id)}
                                className="h-5 w-5 rounded border-slate-300  bg-white  text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                        </div>

                        <div className={`p-3 rounded-lg flex-shrink-0 cursor-pointer ${getTypeColor(item.type)}`} onClick={() => onOpen(item)}>
                            {getTypeIcon(item.type)}
                        </div>
                        <div className="flex-grow min-w-0 cursor-pointer" onClick={() => onOpen(item)}>
                            {editingId === item.id ? (
                                <div className="flex items-center gap-2 mb-1" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        type="text" 
                                        value={tempTitle}
                                        onChange={(e) => setTempTitle(e.target.value)}
                                        className="border border-indigo-300  bg-white  rounded px-2 py-1 text-slate-900  font-bold w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveEdit(item.id);
                                            if (e.key === 'Escape') handleCancelEdit();
                                        }}
                                    />
                                </div>
                            ) : (
                                <h3 className="font-bold text-slate-900  truncate pr-4 hover:text-indigo-600 :text-indigo-400 transition-colors" title={item.title}>{item.title}</h3>
                            )}
                            <p className="text-sm text-slate-500 ">
                                {new Date(item.date).toLocaleDateString()} at {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {
                                    item.type === 'quiz' ? `${(item.data as any).questions?.length} Questions` : 
                                    item.type === 'flashcards' ? `${(item.data as any).cards?.length} Cards` :
                                    item.type === 'note' ? (item.data as SmartNote).type :
                                    'Summary'
                                }
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 self-end md:self-auto flex-shrink-0">
                        {editingId === item.id ? (
                            <>
                                <button 
                                    onClick={() => handleSaveEdit(item.id)} 
                                    className="p-2 text-emerald-600  hover:bg-emerald-50 :bg-emerald-900/20 rounded-md transition-colors" 
                                    title="Save Name"
                                >
                                    <Check className="h-5 w-5"/>
                                </button>
                                <button 
                                    onClick={() => handleCancelEdit()} 
                                    className="p-2 text-slate-400  hover:bg-slate-100 :bg-slate-800 rounded-md transition-colors" 
                                    title="Cancel"
                                >
                                    <X className="h-5 w-5"/>
                                </button>
                            </>
                        ) : (
                            <>
                                <Button 
                                    variant="primary" 
                                    className="text-sm py-1 px-3 h-9" 
                                    onClick={() => onOpen(item)} 
                                    icon={<Eye className="h-3 w-3"/>}
                                >
                                    Open
                                </Button>
                                <button 
                                    onClick={() => handleStartEdit(item)} 
                                    className="p-2 text-slate-400  hover:text-indigo-600 :text-indigo-400 hover:bg-indigo-50 :bg-indigo-900/20 rounded-md transition-colors" 
                                    title="Rename"
                                >
                                    <Edit2 className="h-4 w-4"/>
                                </button>
                                <Button 
                                    variant="outline" 
                                    className="text-sm py-1 px-3 h-9" 
                                    onClick={() => handleDownload(item)} 
                                    icon={<Download className="h-3 w-3"/>}
                                >
                                    PDF
                                </Button>
                                {item.type === 'note' && (item.data as SmartNote).audioBase64 && (
                                    <Button 
                                        variant="outline" 
                                        className="text-sm py-1 px-3 h-9" 
                                        onClick={() => handleDownloadAudio(item)} 
                                        icon={<Download className="h-3 w-3"/>}
                                    >
                                        Audio
                                    </Button>
                                )}
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(item.id);
                                    }}
                                    className="text-slate-400  hover:text-red-500 :text-red-400 p-2 rounded-md hover:bg-red-50 :bg-red-900/20 transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </>
                        )}
                    </div>
                </Card>
            ))
        )}
      </div>
    </div>
  );
};