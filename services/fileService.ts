/**
 * Extracts text from a File object (PDF, TXT, JSON, etc.)
 */
import { Flashcard, Quiz, Summary, SmartNote, ComparisonTable, MindMapNode } from '../types';
import * as mammoth from 'mammoth';
import { extractTextFromImage } from './geminiService';

// Global types for libraries loaded via CDN
declare global {
    interface Window {
        JSZip: any;
        saveAs: any; // FileSaver.js
        jspdf: any;
        html2canvas: any;
    }
}

export const extractTextFromFile = async (file: File): Promise<string> => {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractPdfText(file);
  } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
    return extractDocxText(file);
  } else if (fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || fileName.endsWith('.pptx')) {
    return extractPptxText(file);
  } else if (fileType.startsWith('image/') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return extractTextFromImage(file);
  } else if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv')) {
    return await file.text();
  } else {
    throw new Error('Unsupported file type for text extraction. Please upload a PDF, DOCX, PPTX, Image, or Text file.');
  }
};

const extractPptxText = async (file: File): Promise<string> => {
  if (!window.JSZip) {
    throw new Error('JSZip library not loaded');
  }
  const zip = new window.JSZip();
  const loadedZip = await zip.loadAsync(file);
  
  let fullText = '';
  const slideFiles = Object.keys(loadedZip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
  
  // Sort slides by number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10);
    const numB = parseInt(b.replace(/\D/g, ''), 10);
    return numA - numB;
  });

  for (const slideName of slideFiles) {
    const content = await loadedZip.file(slideName).async('string');
    // Extract text from <a:t> tags
    const matches = content.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
    if (matches) {
      const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
      fullText += `\n\n--- ${slideName.split('/').pop()} ---\n\n${slideText}`;
    }
  }
  
  return fullText;
};

const extractDocxText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

const extractPdfText = async (file: File): Promise<string> => {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js library not loaded');
  }

  // Set worker source dynamically if needed, but CDN usually handles global config or we assume main thread for small files
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  
  // Process all pages
  const maxPages = pdf.numPages;

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += `\n\n--- Page ${i} ---\n\n${pageText}`;
  }

  return fullText;
};

// --- Export Generators ---

export const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    window.saveAs(blob, filename.endsWith('.txt') ? filename : `${filename}.txt`);
};

export const generatePDF = (title: string, content: string) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const maxLineWidth = pageWidth - (margin * 2);

    doc.setFontSize(16);
    doc.text(title || 'Document', margin, 20);
    
    doc.setFontSize(12);
    // Split text to ensure it wraps
    const safeContent = typeof content === 'string' ? content : String(content || '');
    const splitText = doc.splitTextToSize(safeContent, maxLineWidth);
    
    // Add text with pagination support (basic)
    let y = 30;
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 7;

    splitText.forEach((line: string) => {
        if (y + lineHeight > pageHeight - margin) {
            doc.addPage();
            y = 20;
        }
        doc.text(line, margin, y);
        y += lineHeight;
    });

    doc.save(`${(title || 'Document').replace(/\s+/g, '_')}.pdf`);
};

/**
 * Generates a PDF of the quiz by capturing the rendered HTML cards.
 * This ensures the output matches the "Total Quiz" look (visual mode) rather than text mode.
 */
export const downloadQuizPDF = async (quiz: Quiz, format: 'student' | 'teacher' | 'result', userAnswers?: Record<string, string>) => {
    if (!window.html2canvas) {
        alert("PDF generation library not ready. Please try again in a moment.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210; // A4 width mm
    const pageHeight = 297; // A4 height mm
    const margin = 10;
    
    // Add Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(quiz.title, margin, 20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated by StudyGenius AI • ${new Date().toLocaleDateString()}`, margin, 26);
    
    if (format === 'result' && quiz.score !== undefined) {
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Score: ${quiz.score} / ${quiz.questions.length}`, pageWidth - margin - 30, 20);
    }

    let currentY = 35;

    // Select all quiz cards currently rendered on screen
    const cards = document.querySelectorAll('.quiz-card');
    
    if (cards.length === 0) {
        // Fallback to text-based PDF generation if DOM elements are not present (e.g., in History view)
        let content = `Quiz: ${quiz.title}\n`;
        if (format === 'result' && quiz.score !== undefined) {
            content += `Score: ${quiz.score}/${quiz.questions.length}\n\n`;
        } else {
            content += `\n`;
        }
        
        quiz.questions.forEach((q, i) => {
             content += `${i+1}. ${q.text}\n`;
             q.options.forEach(opt => {
                 content += `   - ${opt}\n`;
             });
             if (format === 'teacher' || format === 'result') {
                 content += `\nCorrect Answer: ${q.correctAnswer}\n`;
                 content += `Explanation: ${q.explanation}\n`;
             }
             if (format === 'result' && userAnswers) {
                 content += `Your Answer: ${userAnswers[q.id] || 'Not answered'}\n`;
             }
             content += `\n`;
        });
        
        generatePDF(quiz.title, content);
        return;
    }

    // Process each card
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i] as HTMLElement;
        
        try {
            // Capture the visual card
            const canvas = await window.html2canvas(card, {
                scale: 1.5, // Better resolution
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const imgData = canvas.toDataURL('image/png');
            
            // Calculate dimensions to fit PDF width
            const imgProps = doc.getImageProperties(imgData);
            const pdfImgWidth = pageWidth - (margin * 2);
            const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;

            // Check if we need a new page
            if (currentY + pdfImgHeight > pageHeight - margin) {
                doc.addPage();
                currentY = 20;
            }

            doc.addImage(imgData, 'PNG', margin, currentY, pdfImgWidth, pdfImgHeight);
            currentY += pdfImgHeight + 5; // Add small gap between cards

        } catch (err) {
            console.error("Error capturing card:", err);
        }
    }

    doc.save(`${quiz.title.replace(/\s+/g, '_')}_${format}.pdf`);
};

export const generateFlashcardsPDF = (title: string, cards: Flashcard[]) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(title, 10, 15);
    doc.setFontSize(10);
    doc.text("Printable Flashcards", 10, 22);
    
    let y = 30;
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const cardWidth = 190;
    const textWidth = cardWidth - 10; // 5 margin on each side
    
    cards.forEach((card, index) => {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const frontLines = doc.splitTextToSize(`Q: ${card.front}`, textWidth);
        
        doc.setFont("helvetica", "normal");
        const backLines = doc.splitTextToSize(`A: ${card.back}`, textWidth);
        
        const frontHeight = frontLines.length * 5;
        const backHeight = backLines.length * 5;
        
        const cardHeight = Math.max(40, 10 + frontHeight + 5 + backHeight + 10);
        
        if (y + cardHeight > pageHeight - margin) {
            doc.addPage();
            y = 20;
        }
        
        doc.setDrawColor(200);
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(margin, y, cardWidth, cardHeight, 2, 2, 'FD');
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Card ${index + 1}`, margin + 5, y + 8);
        
        doc.setTextColor(0);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(frontLines, margin + 5, y + 18);
        
        doc.setFont("helvetica", "normal");
        doc.text(backLines, margin + 5, y + 18 + frontHeight + 5);
        
        y += cardHeight + 5;
    });

    doc.save(`${title.replace(/\s+/g, '_')}_cards.pdf`);
};

export const downloadBulkZip = async (files: { filename: string, content: string | Blob }[], zipName: string) => {
    if (!window.JSZip) {
        console.error("JSZip not loaded");
        return;
    }
    const zip = new window.JSZip();
    
    files.forEach(f => {
        zip.file(f.filename, f.content);
    });

    const content = await zip.generateAsync({ type: "blob" });
    window.saveAs(content, `${zipName}.zip`);
};