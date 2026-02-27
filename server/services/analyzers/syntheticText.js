/**
 * Synthetic Text Likelihood Analyzer — ML-enhanced
 *
 * Uses `openai-community/roberta-base-openai-detector` via HuggingFace Inference API.
 * Falls back to heuristics if ML service is unavailable.
 * Final score = 70% model + 30% heuristic.
 */

import { detectSynthetic } from '../mlClient.js';

// ────────────────────────────────────────────────────────────────────────────
// Heuristic baseline (retained as fallback)
// ────────────────────────────────────────────────────────────────────────────

const LLM_PHRASES = [
    "it's important to note", "it is important to", "it's worth noting",
    "it is worth mentioning", "in conclusion", "in summary", "to summarize",
    "overall,", "in today's world", "in this day and age", "let's dive in",
    "delve into", "delve deeper", "it's crucial to", "plays a crucial role",
    "navigating the", "landscape of", "tapestry of", "multifaceted", "a myriad of",
    "furthermore,", "moreover,", "additionally,", "consequently,", "nevertheless,",
    "comprehensive guide", "whether you're a", "in the realm of",
    "shed light on", "foster a sense of", "embark on",
    "stands as a testament", "serves as a reminder", "underscores the importance",
];

function heuristicSyntheticScore(text) {
    const lower = text.toLowerCase();
    const sentences = lower.split(/[.!?]+/).filter(s => s.trim().length > 5);
    if (sentences.length < 3) return 0;

    let signals = 0;

    // LLM phrase density
    let phraseMatches = 0;
    for (const phrase of LLM_PHRASES) {
        let pos = 0;
        while ((pos = lower.indexOf(phrase, pos)) !== -1) { phraseMatches++; pos += phrase.length; }
    }
    const phraseDensity = phraseMatches / sentences.length;
    if (phraseDensity > 0.15) signals += 3;
    else if (phraseDensity > 0.05) signals += 1;

    // Sentence length uniformity
    const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
    const variance = sentLengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / sentLengths.length;
    const cv = Math.sqrt(variance) / (avg || 1);
    if (cv < 0.25 && sentences.length > 5) signals += 2;
    else if (cv < 0.35 && sentences.length > 5) signals += 1;

    // Type-token ratio
    const words = lower.match(/\b[a-z]+\b/g) || [];
    const ttr = new Set(words).size / (words.length || 1);
    if (words.length > 100 && ttr > 0.35 && ttr < 0.55) signals += 1;

    // Transitions
    const transitions = ['however', 'therefore', 'furthermore', 'moreover', 'additionally', 'consequently', 'nevertheless'];
    let transCount = 0;
    for (const t of transitions) {
        let pos = 0;
        while ((pos = lower.indexOf(t, pos)) !== -1) { transCount++; pos += t.length; }
    }
    const transDensity = transCount / (sentences.length || 1);
    if (transDensity > 0.2) signals += 2;
    else if (transDensity > 0.1) signals += 1;

    return Math.min(signals / 9, 1);
}

// ────────────────────────────────────────────────────────────────────────────
// ML call — delegates to mlClient (HuggingFace Inference API)
// ────────────────────────────────────────────────────────────────────────────

async function mlSyntheticScore(text) {
    return detectSynthetic(text); // returns 0-1 or null on failure
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

export async function analyzeSyntheticText(content) {
    const text = content.body;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

    if (sentences.length < 3) {
        return {
            level: 'low',
            score: 10,
            explanation: 'Text is too short for meaningful synthetic pattern analysis.',
            modelUsed: false,
        };
    }

    const heuristicRaw = heuristicSyntheticScore(text);
    const mlRaw = await mlSyntheticScore(text); // 0-1 probability or null
    const modelUsed = mlRaw !== null;

    // Combine: 70% model / 30% heuristic when model available
    const combined = modelUsed
        ? mlRaw * 0.7 + heuristicRaw * 0.3
        : heuristicRaw;

    const score = Math.round(combined * 100);
    const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';

    const source = modelUsed
        ? 'RoBERTa classifier (roberta-base-openai-detector)'
        : 'heuristic analysis (ML service unavailable)';

    const explanations = {
        low: `Text patterns are consistent with human writing. Assessed using ${source}.`,
        medium: `Some patterns resemble LLM-generated content (${Math.round(combined * 100)}% synthetic probability). Assessed using ${source}.`,
        high: `Strong indicators suggest this text may be AI-generated (${Math.round(combined * 100)}% synthetic probability). Assessed using ${source}.`,
    };

    return {
        level,
        score,
        explanation: explanations[level],
        modelUsed,
        syntheticProbability: Math.round(combined * 100),
    };
}
