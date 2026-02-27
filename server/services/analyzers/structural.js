/**
 * Structural Integrity Analyzer
 * 
 * Evaluates headline-body alignment, sensational framing, and text completeness.
 */

const CLICKBAIT_PATTERNS = [
    /you won'?t believe/i,
    /what happens next/i,
    /this (?:one|simple) trick/i,
    /doctors hate/i,
    /\d+ (?:things?|reasons?|ways?|facts?|secrets?) (?:you|that|about)/i,
    /the (?:real|shocking|surprising|disturbing) (?:truth|reason|story)/i,
    /(?:is|are) (?:actually|secretly|really)/i,
    /here'?s? (?:what|why|how)/i,
    /everything (?:you need|we know)/i,
    /this (?:changes|explains) everything/i,
];

const SENSATIONAL_WORDS = [
    'shocking', 'bombshell', 'explosive', 'devastating', 'unbelievable',
    'insane', 'mind-blowing', 'jaw-dropping', 'epic', 'ultimate',
    'incredible', 'extraordinary', 'unprecedented', 'massive', 'huge',
    'stunned', 'slammed', 'destroyed', 'obliterated', 'annihilated',
    'blasted', 'rocked', 'ripped', 'torched', 'eviscerated',
];

export async function analyzeStructural(content) {
    const text = content.body;
    const title = content.title;
    const lower = text.toLowerCase();
    const wordCount = text.split(/\s+/).length;

    if (wordCount < 10) {
        return {
            level: 'medium',
            score: 50,
            explanation: 'Text is too short to assess structural integrity.',
        };
    }

    let risk = 0;
    const details = [];

    // 1. Headline-body alignment (if title exists)
    if (title && title.length > 5) {
        const titleWords = title.toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'been', 'they', 'their', 'about', 'what', 'when', 'where', 'which'].includes(w));

        const bodyLower = lower;
        let overlap = 0;
        for (const word of titleWords) {
            if (bodyLower.includes(word)) overlap++;
        }

        const alignment = titleWords.length > 0 ? overlap / titleWords.length : 1;

        if (alignment < 0.3) {
            risk += 2;
            details.push('Headline has weak alignment with the body content — may be misleading or clickbait');
        } else if (alignment < 0.5) {
            risk += 1;
            details.push('Moderate headline-body alignment gap');
        }
    }

    // 2. Clickbait headline patterns
    const titleLower = (title || '').toLowerCase();
    let clickbaitHits = 0;
    for (const pattern of CLICKBAIT_PATTERNS) {
        if (pattern.test(titleLower) || pattern.test(lower.slice(0, 200))) {
            clickbaitHits++;
        }
    }

    if (clickbaitHits >= 2) {
        risk += 3;
        details.push('Multiple clickbait framing patterns detected');
    } else if (clickbaitHits === 1) {
        risk += 1;
        details.push('Clickbait-style framing detected');
    }

    // 3. Sensational language in headline
    let sensationalInTitle = 0;
    for (const word of SENSATIONAL_WORDS) {
        if (titleLower.includes(word)) sensationalInTitle++;
    }
    if (sensationalInTitle >= 2) {
        risk += 2;
        details.push('Headline uses highly sensational language');
    } else if (sensationalInTitle === 1) {
        risk += 1;
    }

    // 4. Question headline (engagement bait)
    if (title && title.trim().endsWith('?')) {
        risk += 1;
        details.push('Question headline — often used to imply claims without making them directly');
    }

    // 5. Truncation/incompleteness indicators
    const truncationSignals = [
        text.endsWith('...'),
        text.endsWith('…'),
        text.endsWith('Read more'),
        text.endsWith('Continue reading'),
        /\[\.{3}\]/.test(text),
        wordCount < 50 && !content.source?.includes('twitter') && !content.source?.includes('x.com'),
    ].filter(Boolean).length;

    if (truncationSignals >= 2) {
        risk += 2;
        details.push('Content appears truncated or incomplete — may be missing important context');
    } else if (truncationSignals === 1) {
        risk += 1;
    }

    // 6. ALL CAPS title
    if (title && title === title.toUpperCase() && title.length > 10) {
        risk += 1;
        details.push('Title is in ALL CAPS — common in sensational or low-credibility framing');
    }

    // Calculate
    const score = Math.max(5, Math.min(95, Math.round((risk / 10) * 100)));
    const level = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';

    let explanation;
    if (level === 'low') {
        explanation = 'Content structure appears standard. Headline aligns with body content, and no significant sensational framing detected.';
    } else if (level === 'medium') {
        explanation = details.slice(0, 2).join('. ') + '.';
    } else {
        explanation = `Structural concerns: ${details.slice(0, 3).join('. ')}.`;
    }

    return { level, score, explanation };
}
