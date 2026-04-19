
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Question, Quiz, Summary, PlagiarismMatch, Flashcard, NoteType, MindMapNode, ComparisonTable, SmartNote, FileTopics, QuizConfig } from '../types';
import { jsonrepair } from 'jsonrepair';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const getAI = (): GoogleGenAI => {
    return ai;
};

const safeJsonParse = (text: string, fallback: any) => {
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            return JSON.parse(jsonrepair(text));
        } catch (repairError) {
            console.error("Failed to parse and repair JSON:", repairError);
            return fallback;
        }
    }
};

// Schema for Quiz Configuration
const quizConfigSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    showTopicsUI: { type: Type.BOOLEAN },
    detectedTopics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING },
          topics: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["fileName", "topics"]
      }
    },
    quizStructure: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING },
          type: { type: Type.STRING },
          filesIncluded: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["type"]
      }
    }
  },
  required: ["showTopicsUI", "detectedTopics", "quizStructure"]
};

// Schema for MCQ Generation
const mcqSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "The question text" },
          options: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "4 distinct options"
          },
          correctAnswer: { type: Type.STRING, description: "The exact text of the correct option" },
          explanation: { type: Type.STRING, description: "Explanation of why the answer is correct" }
        },
        required: ["text", "options", "correctAnswer", "explanation"]
      }
    }
  },
  required: ["questions"]
};

// Schema for Flashcards
const flashcardSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    cards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING, description: "The front of the card (Term or Question)" },
          back: { type: Type.STRING, description: "The back of the card (Definition or Answer)" }
        },
        required: ["front", "back"]
      }
    }
  },
  required: ["cards"]
};

// Schema for Topic Discovery
const topicsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    topics: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of chapter titles or main topic headings found in the text"
    }
  },
  required: ["topics"]
};

// Schema for Mindmap
const mindmapSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    root: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        children: {
          type: Type.ARRAY,
          items: { 
             type: Type.OBJECT, // Level 1
             properties: {
                 label: { type: Type.STRING },
                 children: { 
                    type: Type.ARRAY, 
                    items: { 
                        type: Type.OBJECT, // Level 2
                        properties: {
                            label: { type: Type.STRING },
                            children: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT, // Level 3
                                    properties: {
                                        label: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    } 
                 } 
             }
          }
        }
      },
      required: ["label", "children"]
    }
  },
  required: ["root"]
};

// Schema for Table
const tableSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        headers: { type: Type.ARRAY, items: { type: Type.STRING } },
        rows: { 
            type: Type.ARRAY, 
            items: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
            } 
        }
    },
    required: ["title", "headers", "rows"]
};

export const extractTextFromImage = async (file: File): Promise<string> => {
    const model = 'gemini-3-flash-preview';
    
    // Convert file to base64
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    let mimeType = file.type;
    if (!mimeType) {
        if (file.name.toLowerCase().endsWith('.png')) mimeType = 'image/png';
        else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
        else mimeType = 'image/jpeg';
    }

    const prompt = `
        Extract all the text from this image. 
        If there are diagrams, describe them briefly. 
        If there is no text, describe the image in detail so it can be used for studying.
    `;

    try {
        const response = await getAI().models.generateContent({
            model,
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { data: base64, mimeType } }
                ]
            }
        });
        return response.text || "No text could be extracted from the image.";
    } catch (e) {
        console.error("Image extraction failed", e);
        throw new Error("Failed to extract text from image.");
    }
};

export const discoverTopics = async (text: string): Promise<string[]> => {
  if (!text) return [];
  
  const model = 'gemini-3-flash-preview';
  const prompt = `
    Analyze the following text and identify the Table of Contents, Chapter Titles, or Main Sections.
    Return a simple list of the section titles found.
    If no clear chapters exist, identify 5-10 broad key topics covered.
    
    Text Content:
    ${text.substring(0, 2000000)}
  `;

  try {
      const response = await getAI().models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: topicsSchema
        }
      });
      
      const result = safeJsonParse(response.text || '{"topics": []}', { topics: [] });
      return result.topics || [];
  } catch (e: any) {
      console.error("Topic discovery failed", e);
      if (e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('quota') || e?.message?.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Rate limit exceeded. Please wait a moment and try again.");
      }
      throw new Error("Failed to analyze document topics. Please try again.");
  }
};

export const discoverTopicsPerFile = async (files: { fileName: string, content: string }[]): Promise<FileTopics[]> => {
  if (!files || files.length === 0) return [];
  
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Your task is to process MULTIPLE uploaded files and Detect/extract chapters/topics separately for EACH file in a strictly structured format.
    
    INPUT FORMAT:
    You will receive multiple files like:
    [
      {
        "fileName": "File1.pdf",
        "content": "..."
      }
    ]
    
    TASK:
    For EACH file independently:
    1. Analyze ONLY that file's content.
    2. Extract meaningful chapters/topics.
    3. Do NOT mix topics between files.
    4. Do NOT use external knowledge.
    5. Do NOT assume missing content.
    
    TOPIC RULES (STRICT):
    * Topics must be: Short, Clean and readable, Based ONLY on content, Unique (no duplicates inside same file), Relevant (no random words)
    - Prefer: Headings, Subheadings, Repeated important terms
    - Avoid: Full sentences, Paragraphs, Irrelevant words, Special characters
    
    ORDERING RULE:
    * Maintain the natural order of appearance in the document
    * First topic = appears first in file
    * Do NOT randomly shuffle
    
    EDGE CASE HANDLING:
    * If file has NO clear headings: Extract important concepts as topics
    
    Files to process:
    ${JSON.stringify(files.map(f => ({ fileName: f.fileName, content: f.content.substring(0, 2000000) })))}
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      detectedTopics: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            fileName: { type: Type.STRING },
            topics: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["fileName", "topics"]
        }
      }
    },
    required: ["detectedTopics"]
  };

  try {
      const response = await getAI().models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema
        }
      });
      
      const result = safeJsonParse(response.text || '{"detectedTopics": []}', { detectedTopics: [] });
      return result.detectedTopics || [];
  } catch (e) {
      console.error("Topic discovery failed", e);
      return [];
  }
};

export const analyzeDocumentsAndConfigureQuiz = async (
  files: { fileName: string, content: string }[],
  quizMode: 'sub_quizzes' | 'combined_quiz'
): Promise<QuizConfig> => {
  if (!files || files.length === 0) {
    return { showTopicsUI: false, detectedTopics: [], quizStructure: [] };
  }

  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    You are an intelligent document analyzer and quiz configuration engine.
    Your task is to process uploaded files and generate structured output for topic detection and quiz configuration.

    INPUT FORMAT:
    {
      "files": ${JSON.stringify(files.map(f => ({ fileName: f.fileName, content: f.content.substring(0, 2000000) })))},
      "quizMode": "${quizMode}"
    }

    STEP 1: FILE COUNT CHECK
    * If ONLY ONE file is provided:
      -> "showTopicsUI": false
      -> "detectedTopics": []
    * If MULTIPLE files are provided:
      -> "showTopicsUI": true
      -> Extract topics for each file

    STEP 2: TOPIC DETECTION (ONLY IF MULTIPLE FILES)
    For EACH file independently:
    * Analyze ONLY its content
    * Extract meaningful topics
    TOPIC RULES:
    * Short 
    * Clean and readable
    * Unique (no duplicates per file)
    * Based ONLY on content
    * Maintain original order of appearance

    STEP 3: QUIZ CONFIGURATION LOGIC
    If quizMode = "sub_quizzes":
    -> Create separate quiz for each file
    "quizStructure": [{"fileName": "...", "type": "individual_quiz"}]

    If quizMode = "combined_quiz":
    -> Create one quiz using all files
    "quizStructure": [{"type": "combined_quiz", "filesIncluded": ["..."]}]

    FINAL OUTPUT (STRICT JSON ONLY):
    {
      "showTopicsUI": true OR false,
      "detectedTopics": [],
      "quizStructure": []
    }

    IMPORTANT RULES:
    * Do NOT mix topics between files
    * Do NOT skip any file
    * Do NOT add explanations
    * Output MUST be valid JSON
    * Always follow input strictly
  `;

  try {
    const response = await getAI().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: quizConfigSchema
      }
    });
    
    const result = safeJsonParse(response.text || '{"showTopicsUI": false, "detectedTopics": [], "quizStructure": []}', { showTopicsUI: false, detectedTopics: [], quizStructure: [] });
    return result as QuizConfig;
  } catch (e) {
    console.error("Quiz configuration failed", e);
    throw new Error("Failed to configure quiz and detect topics.");
  }
};

export const generateQuizFromText = async (
  text: string, 
  numQuestions: number = 5,
  difficulty: string = 'Medium',
  topic?: string,
  explanationDepth: string = 'Simple',
  selectedTopics: string[] = []
): Promise<Omit<Quiz, 'id' | 'createdAt' | 'sourceFileName' | 'title'>> => {
  if (!text) throw new Error("No text provided");

  const model = 'gemini-3-flash-preview';
  
  const depthInstructions: Record<string, string> = {
    'Simple': "Provide a concise 1-2 sentence explanation focusing on the core reason.",
    'Detailed': "Provide a comprehensive 3-6 sentence explanation with context and examples.",
    'Step-by-step': "Break down the reasoning into clear, logical steps.",
    'Story': "Explain the answer using a short, memorable analogy or scenario."
  };

  const selectedInstruction = depthInstructions[explanationDepth] || depthInstructions['Simple'];
  
  let topicInstruction = '- Cover key concepts across the text.';
  if (selectedTopics.length > 0) {
      topicInstruction = `- STRICTLY FOCUS only on the following chapters/sections: ${selectedTopics.join(', ')}. Do not ask questions from other parts of the text.`;
  } else if (topic) {
      topicInstruction = `- Specific Focus Topic: ${topic}`;
  }
  
  const prompt = `
    You are an expert teacher. Create ${numQuestions} multiple-choice questions based strictly on the provided text.
    
    Configuration:
    - Difficulty Level: ${difficulty}
    - Explanation Style: ${explanationDepth} (${selectedInstruction})
    ${topicInstruction}
    
    Rules:
    1. Extract only content-relevant questions.
    2. Provide 4 options for each question.
    3. Identify the correct answer.
    4. Provide a clear explanation for the correct answer following the "${explanationDepth}" style defined above.
    5. Ensure the JSON structure matches the schema.

    Text Content:
    ${text.substring(0, 2000000)} 
  `;

  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: mcqSchema,
      systemInstruction: "You are a strict educational assistant. Only generate questions based on the source text provided."
    }
  });

  const resultText = response.text;
  if (!resultText) throw new Error("Failed to generate quiz data");

  const parsed = safeJsonParse(resultText, { questions: [] });
  if (!parsed.questions) {
    throw new Error("Failed to parse quiz data");
  }
  return { questions: parsed.questions.map((q: any, idx: number) => ({ ...q, id: `q-${idx}-${Date.now()}` })) };
};

export const generateFlashcardsFromText = async (
    text: string,
    numCards: number = 10,
    style: 'Q&A' | 'Term/Definition' = 'Term/Definition',
    selectedTopics: string[] = []
): Promise<Flashcard[]> => {
    if (!text) throw new Error("No text provided");

    const model = 'gemini-3-flash-preview';

    let topicInstruction = '';
    if (selectedTopics.length > 0) {
        topicInstruction = `- STRICTLY FOCUS only on these sections: ${selectedTopics.join(', ')}.`;
    }

    const styleInstruction = style === 'Q&A' 
        ? "Front should be a question, Back should be the answer." 
        : "Front should be a key Term or Concept, Back should be the Definition.";

    const prompt = `
        Create ${numCards} flashcards based on the provided text.
        
        Style: ${styleInstruction}
        ${topicInstruction}
        
        Rules:
        1. Ensure the content is accurate and derived from the text.
        2. Keep the "Front" concise.
        3. Keep the "Back" clear and informative.
        
        Text Content:
        ${text.substring(0, 2000000)}
    `;

    const response = await getAI().models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: flashcardSchema
        }
    });

    const parsed = safeJsonParse(response.text || '{"cards": []}', { cards: [] });
    return parsed.cards.map((c: any, idx: number) => ({ ...c, id: `fc-${idx}-${Date.now()}` }));
};

export const generateSummaryFromText = async (text: string, targetWordCount: number = 1000): Promise<string> => {
  if (!text) throw new Error("No text provided");

  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Summarize the ENTIRE provided text comprehensively. 
    The summary should be detailed and cover all sections of the document(s), not just the beginning.
    Aim for a length of approximately ${targetWordCount} words.
    
    Output Format:
    - A detailed introduction.
    - Comprehensive Key Topics as bullet points with bold headers. Each bullet point should have a detailed explanation.
    - A thorough analysis of the main arguments or findings.
    - A detailed conclusion.
    - Use Markdown formatting.

    Text Content:
    ${text.substring(0, 2000000)}
  `;

  const response = await getAI().models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "Could not generate summary.";
};

export const regenerateSummary = async (text: string, instruction: string): Promise<string> => {
    if (!text) throw new Error("No text provided");
  
    const model = 'gemini-3-flash-preview';
    
    const prompt = `
      Rewrite the following summary or generate a new one based on the source text.
      
      Instruction: ${instruction}
      
      Source Content:
      ${text.substring(0, 2000000)}
    `;
  
    const response = await getAI().models.generateContent({
      model,
      contents: prompt,
    });
  
    return response.text || "Could not regenerate summary.";
};

export const checkWebOriginality = async (text: string): Promise<{ score: number, matches: PlagiarismMatch[] }> => {
    const model = 'gemini-3-flash-preview';
    
    const prompt = `
        Analyze the following text for sentences that appear verbatim on the public web.
        Search for the content. 
        
        If you find exact matches, list them. 
        If the text seems original or only matches generic phrases, state that.
        
        Text to analyze:
        ${text.substring(0, 2000)}
    `;

    const response = await getAI().models.generateContent({
        model,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const matches: PlagiarismMatch[] = [];
    let score = 0;
    
    if (groundingChunks.length > 0) {
        score = Math.min(100, groundingChunks.length * 10); 
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                matches.push({
                    text: chunk.web.title || "Web Match",
                    source: 'web',
                    similarity: 100,
                    url: chunk.web.uri
                });
            }
        });
    }

    return { score, matches };
};

function parseMarkdownTree(markdown: string): MindMapNode {
    const lines = markdown.split('\n').filter(line => line.trim().length > 0);
    const root: MindMapNode = { label: 'Root', children: [] };
    const stack: { node: MindMapNode, level: number }[] = [{ node: root, level: 0 }];
    
    let currentHeadingLevel = 0;

    for (let line of lines) {
        if (line.trim().startsWith('\`\`\`')) continue;
        
        const listMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
        const headerMatch = line.match(/^(#+)\s+(.*)$/);
        
        let level = 0;
        let label = '';
        
        if (headerMatch) {
            level = headerMatch[1].length;
            currentHeadingLevel = level;
            label = headerMatch[2].trim();
        } else if (listMatch) {
            const spaces = listMatch[1].length;
            // Assume 2 spaces per level for lists
            const listLevel = Math.floor(spaces / 2) + 1;
            level = currentHeadingLevel + listLevel;
            label = listMatch[2].trim();
        } else {
            continue;
        }

        // Clean up bold/italic markers
        label = label.replace(/\*\*/g, '').replace(/__/g, '');

        const newNode: MindMapNode = { label, children: [] };

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(newNode);

        stack.push({ node: newNode, level });
    }

    if (root.children && root.children.length === 1 && root.label === 'Root') {
        return root.children[0];
    }

    return root;
}

export const generateSmartNotes = async (
    text: string,
    type: NoteType,
    granularity: 'Short' | 'Medium' | 'Long',
    onStreamUpdate?: (text: string) => void
): Promise<string | MindMapNode | ComparisonTable> => {
    const model = 'gemini-3-flash-preview';
    
    let prompt = "";
    let schema: Schema | undefined = undefined;

    const lengthInstruction = {
        'Short': "Concise, high-level overview.",
        'Medium': "Balanced detail covering key points.",
        'Long': "Comprehensive, detailed covering all nuances."
    }[granularity];

    if (type === 'MINDMAP') {
        prompt = `
Generate a COMPREHENSIVE mindmap strictly based on the ENTIRE provided document.
The mindmap should cover every section and major detail of the document, not just the beginning.

Rules:
1. Every branch and sub-node MUST come from the document content.
2. Do NOT invent or add external concepts.
3. Do NOT skip any important points or sections from the document.
4. Break paragraphs into smaller logical concepts.
5. Convert:
   - Definitions → sub-nodes
   - Features → sub-nodes
   - Examples → sub-nodes
   - Explanations → deeper levels
6. Ensure:
   - Levels depth should be based on the concepts present in the uploading document.
   - All major sections from start to finish are included.
   - No single-node branches.
7. If a paragraph has multiple ideas, split into multiple nodes.
8. Output in structured tree (markmap format, using Markdown headings and lists).
9. If output is too small, it means extraction is incomplete → regenerate with much more detail.
            
Text: ${text.substring(0, 2000000)}
        `;
        // No schema for MINDMAP, we parse the markdown output
    } else if (type === 'TABLE') {
        prompt = `
            Analyze the ENTIRE text and identify the main entities or concepts that can be compared.
            Create a COMPREHENSIVE comparison table covering all relevant data found in the document.
            - Title: What is being compared?
            - Headers: Feature/Attribute names (e.g., Concept, Definition, Pros, Cons, Applications, Details).
            - Rows: Detailed data for each entity found throughout the document.
            
            Detail Level: ${lengthInstruction} (Ensure it is thorough and covers all sections).
            
            Text: ${text.substring(0, 2000000)}
        `;
        schema = tableSchema;
    } else if (type === 'PODCAST') {
        prompt = `
            Turn the ENTIRE provided text into an engaging, comprehensive podcast script between two hosts (e.g., Alex and Sam).
            They should discuss ALL the main topics from the document, break down complex ideas from every section.
            
            CRITICAL FORMATTING INSTRUCTION: 
            The format of the podcast script MUST look like structured study notes or a summary!
            - Use clear Markdown headings (e.g., # Topic, ## Subtopic) to structure the different segments of the episode.
            - Insert bullet points within the dialogue when hosts are listing facts or summarizing concepts, just like a summary note.
            - Present the dialogue using speaker labels (e.g., **Alex:** and **Sam:**).
            - It should be highly readable, scannable, and exhaustive.
            
            Detail Level: ${lengthInstruction} (Must cover the entire document thoroughly).
            
            Text: ${text.substring(0, 2000000)}
        `;
    } else {
        prompt = `
            Create COMPREHENSIVE, detailed notes from the ENTIRE provided text.
            The notes must cover every section and major point of the document(s), not just the beginning.
            Format: Markdown with clear headings, subheadings, and detailed bullet points.
            Style: ${lengthInstruction} (Ensure the notes are thorough and exhaustive).
            
            Text: ${text.substring(0, 2000000)}
        `;
    }

    const commonConfig = {
        thinkingConfig: { thinkingBudget: 0 }
    };

    if (!schema && onStreamUpdate && type !== 'MINDMAP') {
         const responseStream = await getAI().models.generateContentStream({
            model,
            contents: prompt,
            config: commonConfig
         });
         
         let fullText = "";
         for await (const chunk of responseStream) {
             const textChunk = chunk.text || "";
             fullText += textChunk;
             onStreamUpdate(fullText);
         }
         return fullText;
    }

    const response = await getAI().models.generateContent({
        model,
        contents: prompt,
        config: {
            ...commonConfig,
            ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {})
        }
    });

    if (type === 'MINDMAP') {
        return parseMarkdownTree(response.text || "");
    }

    if (schema) {
        try {
            const result = safeJsonParse(response.text || "{}", {});
            return result;
        } catch (e) {
            console.error("Failed to parse JSON response:", e);
            throw new Error("Failed to parse the generated content. The response might be too large or malformed.");
        }
    }
    
    return response.text || "Failed to generate notes.";
};

export const generatePodcastAudio = async (script: string): Promise<string | null> => {
    try {
        // Split script into chunks of roughly 1000 characters, preferring to split at speaker labels
        const chunks: string[] = [];
        const lines = script.split('\n');
        let currentChunk = '';

        for (let line of lines) {
            // Clean up Markdown formats that might crash the TTS model
            line = line.replace(/^\*\*(.*?)\*\*:/, '$1:'); // **Alex:** -> Alex:
            line = line.replace(/^#+\s*/, ''); // remove headings
            line = line.replace(/^[-*]\s+/, ''); // remove bullet points
            
            const isSpeakerLabel = line.startsWith('Alex:') || line.startsWith('Sam:');
            
            if (currentChunk.length + line.length > 1000 && isSpeakerLabel) {
                chunks.push(currentChunk);
                currentChunk = line + '\n';
            } else {
                currentChunk += line + '\n';
            }
        }
        if (currentChunk.trim()) {
            chunks.push(currentChunk);
        }

        const results: string[] = [];
        const concurrency = 1; // Process 1 chunk at a time to avoid 500 errors from concurrent requests

        for (let i = 0; i < chunks.length; i += concurrency) {
            const batch = chunks.slice(i, i + concurrency);
            const batchPromises = batch.map(async (chunk) => {
                if (!chunk.trim()) return "";
                const response = await getAI().models.generateContent({
                    model: "gemini-3.1-flash-tts-preview",
                    contents: [{ parts: [{ text: chunk }] }],
                    config: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            multiSpeakerVoiceConfig: {
                                speakerVoiceConfigs: [
                                    { speaker: 'Alex', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                                    { speaker: 'Sam', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
                                ]
                            }
                        }
                    }
                });
                return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r.length > 0));
        }

        if (results.length === 0) return null;
        if (results.length === 1) return results[0];

        // Concatenate base64 PCM audio
        const arrays = results.map(b64 => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) {
                bytes[j] = binary.charCodeAt(j);
            }
            return bytes;
        });
        
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            combined.set(arr, offset);
            offset += arr.length;
        }
        
        let binary = '';
        const chunkSize = 8192;
        for (let j = 0; j < combined.length; j += chunkSize) {
            const chunk = combined.subarray(j, j + chunkSize);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
        }
        return btoa(binary);

    } catch (e) {
        console.error("Failed to generate podcast audio", e);
        return null;
    }
};
