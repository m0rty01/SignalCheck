/**
 * NewsAPI client for cross-source corroboration checks.
 * Gracefully returns null when no API key is configured.
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const NEWS_API_BASE = 'https://newsapi.org/v2/everything';

/**
 * Extract the most meaningful keywords from text for a search query.
 */
function extractKeywords(text, maxWords = 8) {
    const STOP_WORDS = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
        'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'for', 'and', 'but', 'or', 'of', 'to',
        'in', 'on', 'at', 'by', 'with', 'from', 'into', 'through', 'about', 'against', 'between',
        'that', 'this', 'these', 'those', 'it', 'its', 'their', 'they', 'we', 'you', 'he', 'she',
        'said', 'says', 'according', 'also', 'just', 'more', 'than', 'then', 'when', 'who', 'which',
    ]);

    const words = text
        .replace(/[^a-zA-Z\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 4 && !STOP_WORDS.has(w.toLowerCase()))
        .slice(0, 40);

    // Count frequency
    const freq = {};
    for (const w of words.map(w => w.toLowerCase())) {
        freq[w] = (freq[w] || 0) + 1;
    }

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxWords)
        .map(([w]) => w)
        .join(' ');
}

/**
 * Simple cosine similarity between two texts based on word overlap.
 */
function textSimilarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? intersection / union : 0;
}

/**
 * Query NewsAPI and return corroboration analysis.
 * Returns null if NewsAPI is not configured.
 */
export async function checkCorroboration(content) {
    if (!NEWS_API_KEY) {
        return null; // graceful degradation
    }

    const query = extractKeywords(content.body);
    if (!query || query.length < 10) return null;

    try {
        const params = new URLSearchParams({
            q: query,
            sortBy: 'relevancy',
            pageSize: '10',
            language: 'en',
            apiKey: NEWS_API_KEY,
        });

        const res = await fetch(`${NEWS_API_BASE}?${params}`, {
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
            console.warn(`NewsAPI returned ${res.status}`);
            return null;
        }

        const data = await res.json();
        const articles = data.articles || [];

        if (articles.length === 0) {
            return {
                found: 0,
                sources: [],
                uniqueSourceCount: 0,
                independentPhrasing: false,
                summary: 'No related articles found in recent news.',
            };
        }

        // Measure phrasing independence: how different are the articles from each other?
        const bodyText = content.body.slice(0, 800);
        let highSimilarityCount = 0;
        const sources = [];
        const sourceDomains = new Set();

        for (const article of articles.slice(0, 8)) {
            const articleText = `${article.title || ''} ${article.description || ''}`;
            const sim = textSimilarity(bodyText, articleText);

            sources.push({
                title: article.title,
                source: article.source?.name,
                url: article.url,
                similarity: Math.round(sim * 100),
            });

            if (article.source?.name) sourceDomains.add(article.source.name);
            if (sim > 0.35) highSimilarityCount++;
        }

        const uniqueSourceCount = sourceDomains.size;
        // Independent phrasing = many sources, but not verbatim copies (low similarity)
        const independentPhrasing = uniqueSourceCount >= 3 && highSimilarityCount < 3;

        return {
            found: articles.length,
            sources: sources.slice(0, 5),
            uniqueSourceCount,
            independentPhrasing,
            query,
            summary: independentPhrasing
                ? `${uniqueSourceCount} independent sources report on this topic with different phrasing — a positive corroboration signal.`
                : uniqueSourceCount > 0
                    ? `Found ${uniqueSourceCount} source${uniqueSourceCount !== 1 ? 's' : ''} covering similar claims, but phrasing overlap is high — possible copy-paste republishing.`
                    : 'No independent corroboration found in recent news.',
        };
    } catch (err) {
        console.warn('NewsAPI error:', err.message);
        return null;
    }
}
