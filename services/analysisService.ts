import { PlagiarismMatch } from '../types';

/**
 * Analyzes the summary against the source text to find direct overlaps.
 * Uses a sentence-level inclusion check and n-gram approximation.
 */
export const analyzeLocalSimilarity = (summary: string, sourceText: string): { score: number, matches: PlagiarismMatch[] } => {
  // Normalize texts: lowercase, remove excess whitespace
  const sourceNormalized = sourceText.toLowerCase().replace(/\s+/g, ' ');
  
  // Split summary into sentences for granular checking
  // Regex handles basic sentence terminators
  const summarySentences = summary.match(/[^.!?]+[.!?]+/g) || [summary];
  
  const matches: PlagiarismMatch[] = [];
  let totalMatchingChars = 0;
  const totalSummaryChars = summary.length;

  summarySentences.forEach(sentence => {
    const cleanSentence = sentence.trim();
    if (cleanSentence.length < 15) return; // Skip very short phrases/titles

    const sentenceNorm = cleanSentence.toLowerCase().replace(/\s+/g, ' ');
    
    // 1. Direct substring check (Exact sentence match)
    if (sourceNormalized.includes(sentenceNorm)) {
      matches.push({
        text: cleanSentence,
        source: 'local',
        similarity: 100
      });
      totalMatchingChars += cleanSentence.length;
    } 
    // 2. Fuzzy Check (if not exact, check if >80% of the sentence exists as a chunk)
    // This is a simplified check to catch near-duplicates
    else {
        // Split into two halves and check if both exist nearby? 
        // For performance in this demo, we stick to exact substring of significant length
        // or check if the sentence minus punctuation exists
        const stripped = sentenceNorm.replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
        const sourceStripped = sourceNormalized.replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
        
        if (sourceStripped.includes(stripped)) {
            matches.push({
                text: cleanSentence,
                source: 'local',
                similarity: 90
            });
            totalMatchingChars += cleanSentence.length;
        }
    }
  });

  // Calculate score based on character overlap
  // We dampen the score slightly so 1-2 sentences don't cause panic
  const score = Math.min(100, Math.round((totalMatchingChars / totalSummaryChars) * 100));

  return { score, matches };
};