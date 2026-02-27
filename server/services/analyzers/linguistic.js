/**
 * Linguistic Risk Signal Analyzer — ML-enhanced with sentiment model
 *
 * Uses `cardiffnlp/twitter-roberta-base-sentiment-latest` via HuggingFace Inference API.
 * Blends sentiment model output with existing heuristic trope/certainty detection.
 */

import { analyzeSentiment } from '../mlClient.js';

// ── Heuristic patterns (retained always) ────────────────────────────────────

const EMOTIONAL_INTENSIFIERS = [
    'shocking', 'outrageous', 'horrifying', 'terrifying', 'unbelievable', 'incredible',
    'amazing', 'devastating', 'explosive', 'bombshell', 'disgusting', 'sickening',
    'insane', 'crazy', 'mindblowing', 'mind-blowing', 'jaw-dropping', 'earth-shattering',
    'catastrophic', 'apocalyptic', 'nightmare', 'disaster', 'crisis', 'emergency',
    'urgent', 'warning', 'danger', 'alarming',
];

const CERTAINTY_WITHOUT_EVIDENCE = [
    'undeniable', 'undeniably', 'irrefutable', 'irrefutably', 'proven beyond doubt',
    'without question', 'no doubt', 'absolutely certain', 'definitely', 'guaranteed',
    'the truth is', 'the fact is', 'the reality is', 'everyone knows', 'it\'s obvious',
    'obviously', 'clearly', 'unquestionably', 'indisputably', 'beyond any doubt',
    'without a doubt', '100%', 'impossible', 'literally impossible',
];

const MISINFO_TROPES = [
    'they don\'t want you to know', 'what they\'re not telling you',
    'the media won\'t report', 'mainstream media', 'msm', 'the government doesn\'t want',
    'big pharma', 'follow the money', 'wake up', 'sheeple', 'do your own research',
    'exposed', 'cover-up', 'cover up', 'suppressed', 'the real story', 'hidden truth',
    'secret agenda', 'conspiracy', 'deep state', 'controlled opposition', 'false flag',
    'plandemic', 'hoax', 'scam', 'psyop', 'propaganda', 'brainwashed',
    'just asking questions', 'think about it', 'open your eyes', 'connect the dots',
];

function heuristicSignals(text) {
    const lower = text.toLowerCase();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

    let emotionalHits = 0;
    for (const w of EMOTIONAL_INTENSIFIERS) {
        const m = lower.match(new RegExp(`\\b${w}\\b`, 'g'));
        if (m) emotionalHits += m.length;
    }

    const exclamations = (text.match(/!/g) || []).length;
    const capsWords = (text.match(/\b[A-Z]{3,}\b/g) || [])
        .filter(w => !['URL', 'HTML', 'API', 'USA', 'FBI', 'CIA', 'CEO', 'NASA', 'UN', 'EU', 'UK', 'WHO', 'GDP', 'DNA', 'COVID', 'NYC', 'NFL', 'NBA'].includes(w)).length;
    const emotionalIntensity = ((emotionalHits * 2) + exclamations + capsWords) / (sentences.length || 1);

    let certaintyHits = 0;
    for (const phrase of CERTAINTY_WITHOUT_EVIDENCE) {
        if (lower.includes(phrase)) certaintyHits++;
    }

    let tropeHits = 0;
    for (const trope of MISINFO_TROPES) {
        if (lower.includes(trope)) tropeHits++;
    }

    return { emotionalIntensity, certaintyHits, tropeHits, sentences: sentences.length };
}

// ── ML call — delegates to mlClient (HuggingFace Inference API) ─────────────

async function mlSentiment(text) {
    return analyzeSentiment(text); // { label, score, scores } or null
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function analyzeLinguistic(content) {
    const text = content.body;
    const wordCount = text.split(/\s+/).length;

    if (wordCount < 15) {
        return {
            level: 'low',
            score: 15,
            explanation: 'Text is too short for meaningful linguistic risk analysis.',
        };
    }

    const [sentiment, heuristics] = await Promise.all([
        mlSentiment(text),
        Promise.resolve(heuristicSignals(text)),
    ]);

    const modelUsed = sentiment !== null;
    const { emotionalIntensity, certaintyHits, tropeHits, sentences } = heuristics;

    let totalRisk = 0;

    // ── Sentiment model contribution (when available) ──
    let sentimentRisk = 0;
    if (modelUsed) {
        const negScore = sentiment.scores['negative'] || 0;
        // High negative sentiment in news/information context is a risk signal
        if (negScore > 0.7) sentimentRisk = 3;
        else if (negScore > 0.5) sentimentRisk = 2;
        else if (negScore > 0.3) sentimentRisk = 1;
        totalRisk += sentimentRisk;
    }

    // ── Heuristic contributions (always) ──
    if (emotionalIntensity > 0.5) totalRisk += 3;
    else if (emotionalIntensity > 0.2) totalRisk += 1;

    const certaintyDensity = certaintyHits / (sentences || 1);
    if (certaintyDensity > 0.15) totalRisk += 3;
    else if (certaintyDensity > 0.05) totalRisk += 1;

    if (tropeHits >= 3) totalRisk += 3;
    else if (tropeHits >= 1) totalRisk += tropeHits;

    const maxRisk = modelUsed ? 12 : 10;
    const score = Math.max(5, Math.min(95, Math.round((totalRisk / maxRisk) * 100)));
    const level = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';

    const source = modelUsed
        ? `twitter-roberta-base-sentiment (${sentiment.label}, ${Math.round(sentiment.score * 100)}% confidence)`
        : 'heuristic analysis (ML unavailable)';

    let explanation;
    if (level === 'low') {
        explanation = `Language appears measured and informational. ${modelUsed ? `Sentiment model: ${sentiment.label}. ` : ''}No significant manipulation patterns detected.`;
    } else if (level === 'medium') {
        const parts = [];
        if (emotionalIntensity > 0.2) parts.push('elevated emotional language');
        if (certaintyHits > 0) parts.push('certainty claims without cited evidence');
        if (tropeHits > 0) parts.push('some misleading content patterns');
        if (modelUsed && sentiment.scores['negative'] > 0.5) parts.push(`strongly negative sentiment (${source})`);
        explanation = `Moderate linguistic risk: ${parts.join(', ') || 'patterns warrant attention'}.`;
    } else {
        const parts = [];
        if (tropeHits >= 2) parts.push(`${tropeHits} misinformation narrative patterns`);
        if (certaintyHits > 2) parts.push('multiple unsupported certainty claims');
        if (emotionalIntensity > 0.5) parts.push('high emotional intensity');
        if (modelUsed) parts.push(`sentiment: ${sentiment.label} (${source})`);
        explanation = `Significant linguistic risk: ${parts.join('; ')}.`;
    }

    return {
        level,
        score,
        explanation,
        modelUsed,
        details: {
            emotionalIntensity: Math.round(emotionalIntensity * 100) / 100,
            certaintyWithoutEvidence: certaintyHits,
            narrativeTropes: tropeHits,
            sentiment: modelUsed ? { label: sentiment.label, scores: sentiment.scores } : null,
        },
    };
}
