/**
 * HuggingFace Inference API Client
 *
 * Replaces the local Python ML microservice for production deployment.
 * All three models are hosted publicly on HuggingFace's inference API (free tier).
 *
 * Set HF_TOKEN env var to your read-only HuggingFace API token.
 * Without a token, requests still work but are rate-limited more aggressively.
 */

const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const HF_TOKEN = process.env.HF_TOKEN || '';

const MODELS = {
    syntheticText: 'openai-community/roberta-base-openai-detector',
    ner: 'dslim/bert-base-NER',
    sentiment: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
};

function hfHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (HF_TOKEN) h['Authorization'] = `Bearer ${HF_TOKEN}`;
    return h;
}

/**
 * Call any HuggingFace inference endpoint.
 * Returns parsed JSON or null on any failure.
 * Handles 503 (model loading) with one automatic retry after 10s.
 */
async function hfInference(model, inputs, retried = false) {
    try {
        const res = await fetch(`${HF_API_BASE}/${model}`, {
            method: 'POST',
            headers: hfHeaders(),
            body: JSON.stringify({ inputs }),
            signal: AbortSignal.timeout(25000),
        });

        // Model is loading — wait and retry once
        if (res.status === 503 && !retried) {
            await new Promise(r => setTimeout(r, 10000));
            return hfInference(model, inputs, true);
        }

        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed wrappers — each returns null on failure so callers fall back gracefully
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI text detection.
 * @returns {number|null} synthetic probability 0-1, or null on failure
 */
export async function detectSynthetic(text) {
    // Truncate to model max tokens (~512 words)
    const truncated = text.split(/\s+/).slice(0, 400).join(' ');
    const result = await hfInference(MODELS.syntheticText, truncated);
    if (!Array.isArray(result)) return null;

    // Response shape: [[{label:'LABEL_1', score:0.9}, {label:'LABEL_0', score:0.1}]]
    const labels = result[0] ?? result;
    const fakeLabel = labels.find(l => l.label === 'LABEL_1' || l.label === 'Fake');
    return fakeLabel ? fakeLabel.score : null;
}

/**
 * Named Entity Recognition.
 * @returns {{ person_count, org_count, entities }|null}
 */
export async function analyzeEntities(text) {
    const truncated = text.split(/\s+/).slice(0, 400).join(' ');
    const result = await hfInference(MODELS.ner, truncated);
    if (!Array.isArray(result)) return null;

    // Aggregate B-/I-PER and B-/I-ORG tokens
    const entities = result.map(e => ({
        word: e.word,
        entity_group: e.entity_group ?? (e.entity?.replace(/^[BI]-/, '') || 'MISC'),
        score: e.score,
    }));

    const persons = entities.filter(e => e.entity_group === 'PER');
    const orgs = entities.filter(e => e.entity_group === 'ORG');

    // Deduplicate by word
    const uniquePersons = [...new Set(persons.map(e => e.word))];
    const uniqueOrgs = [...new Set(orgs.map(e => e.word))];

    return {
        person_count: uniquePersons.length,
        org_count: uniqueOrgs.length,
        entities: entities,
    };
}

/**
 * Sentiment analysis.
 * @returns {{ label, score, scores: { positive, neutral, negative } }|null}
 */
export async function analyzeSentiment(text) {
    const truncated = text.split(/\s+/).slice(0, 400).join(' ');
    const result = await hfInference(MODELS.sentiment, truncated);
    if (!Array.isArray(result)) return null;

    // Response shape: [[{label:'positive', score:0.1}, ...]]
    const labels = result[0] ?? result;
    const scores = {};
    let topLabel = labels[0];

    for (const l of labels) {
        const key = l.label.toLowerCase().replace('label_', '');
        // Normalise label names: 0=negative, 1=neutral, 2=positive (model-specific)
        const friendlyKey = key === '0' ? 'negative' : key === '1' ? 'neutral' : key === '2' ? 'positive' : key;
        scores[friendlyKey] = l.score;
        if (l.score > (topLabel?.score ?? 0)) topLabel = l;
    }

    const friendlyTop = topLabel.label === '0' ? 'negative'
        : topLabel.label === '1' ? 'neutral'
            : topLabel.label === '2' ? 'positive'
                : topLabel.label.toLowerCase();

    return { label: friendlyTop, score: topLabel.score, scores };
}
