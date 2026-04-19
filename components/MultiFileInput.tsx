import React, { useState, useCallback } from 'react';
import { UploadedFile } from '../types';
import { Upload, X, File as FileIcon, FileText, Image as ImageIcon, FileArchive, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './UI';

interface Props {
  onFilesChange: (files: UploadedFile[]) => void;
  files: UploadedFile[];
  maxFiles?: number;
  maxFileSizeMB?: number;
  maxTotalSizeMB?: number;
}

export const MultiFileInput: React.FC<Props> = ({ 
  onFilesChange, 
  files,
  maxFiles = 5,
  maxFileSizeMB = 50,
  maxTotalSizeMB = 200
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFiles = (newFiles: File[]): File[] => {
    setError(null);
    const validFiles: File[] = [];
    let currentTotalSize = files.reduce((acc, f) => acc + f.file.size, 0);

    if (files.length + newFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed.`);
      return validFiles;
    }

    for (const file of newFiles) {
      const fileSizeMB = file.size / (1024 * 1024);
      
      if (fileSizeMB > maxFileSizeMB) {
        setError(`File ${file.name} exceeds ${maxFileSizeMB}MB limit.`);
        continue;
      }

      if ((currentTotalSize + file.size) / (1024 * 1024) > maxTotalSizeMB) {
        setError(`Total size exceeds ${maxTotalSizeMB}MB limit.`);
        break;
      }

      // Allowed types
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/webp'
      ];

      if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md') && !file.name.endsWith('.csv') && !file.name.endsWith('.txt') && !file.name.endsWith('.docx') && !file.name.endsWith('.pdf') && !file.name.endsWith('.pptx') && !file.name.endsWith('.png') && !file.name.endsWith('.jpg') && !file.name.endsWith('.jpeg')) {
        setError(`File type not supported for ${file.name}.`);
        continue;
      }

      validFiles.push(file);
      currentTotalSize += file.size;
    }

    return validFiles;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files) as File[];
      addFiles(newFiles);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const newFiles = Array.from(e.target.files) as File[];
      addFiles(newFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = validateFiles(newFiles);
    if (validFiles.length > 0) {
      const uploadedFiles: UploadedFile[] = validFiles.map(file => ({
        fileId: crypto.randomUUID(),
        file,
        status: 'pending'
      }));
      onFilesChange([...files, ...uploadedFiles]);
    }
  };

  const removeFile = (fileId: string) => {
    onFilesChange(files.filter(f => f.fileId !== fileId));
  };

  const getFileIcon = (type: string, name: string) => {
    if (type === 'application/pdf') return <FileText className="h-6 w-6 text-red-500" />;
    if (type.includes('wordprocessingml')) return <FileText className="h-6 w-6 text-blue-500" />;
    if (type.includes('presentationml')) return <FileArchive className="h-6 w-6 text-orange-500" />;
    if (type.startsWith('image/')) return <ImageIcon className="h-6 w-6 text-green-500" />;
    return <FileIcon className="h-6 w-6 text-slate-500" />;
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        container.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [files.length]);

  return (
    <div className="w-full">
      <div 
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors flex flex-col h-[380px] ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className={`relative w-full transition-all duration-300 ${files.length > 0 ? 'py-2 flex-shrink-0' : 'flex-1 flex items-center justify-center'}`}>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.txt,.md,.csv,image/png,image/jpeg"
            onChange={handleChange}
            className={`absolute inset-0 w-full h-full opacity-0 z-10 ${files.length >= maxFiles ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            disabled={files.length >= maxFiles}
          />
          <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none w-full">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <Upload className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-700">
                Drag & drop files or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supports PDF, DOCX, PPTX, TXT, Images (Max {maxFiles} files, {maxFileSizeMB}MB each)
              </p>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-2 text-left w-full border-t border-slate-200 pt-3 relative z-20 flex-1 flex flex-col overflow-hidden">
            <h4 className="text-sm font-medium text-slate-700 mb-2 flex-shrink-0">Selected Files ({files.length}/{maxFiles})</h4>
            <div 
              ref={scrollContainerRef}
              className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 box-border custom-scrollbar flex-1 items-start w-full"
            >
              {files.map((f) => (
                <div key={f.fileId} className="flex-shrink-0 w-[260px] flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {getFileIcon(f.file.type, f.file.name)}
                    <div className="truncate">
                      <p className="text-sm font-medium text-slate-700 truncate">{f.file.name}</p>
                      <p className="text-xs text-slate-500">{(f.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                    {f.status === 'processing' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                    {f.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {f.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    
                    <button 
                      onClick={() => removeFile(f.fileId)}
                      className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                      disabled={f.status === 'processing'}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center text-sm">
          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
};
