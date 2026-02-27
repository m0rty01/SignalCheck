/**
 * Temporal & Contextual Signal Analyzer — upgraded with corroboration
 *
 * Now performs live cross-source corroboration via NewsAPI.
 */

import { checkCorroboration } from '../newsApi.js';

const URGENCY_PHRASES = [
    'breaking:', 'breaking news', 'just in:', 'just now', 'developing story',
    'developing:', 'this just happened', 'happening now', 'right now',
    'urgent:', 'urgent update', 'live update', 'live:', 'act now', 'act fast',
    'before it\'s too late', 'limited time', 'share before', 'going viral',
    'share this', 'spread the word', 'must read', 'you need to see this',
    'you won\'t believe',
];

const CORROBORATION_SIGNALS = [
    /according to (?:multiple|several|various) (?:sources|reports|outlets)/gi,
    /(?:reuters|associated press|ap news|afp|bbc|npr|pbs)\s+(?:reports?|confirmed)/gi,
    /independently (?:verified|confirmed|reported)/gi,
    /(?:peer[- ]reviewed|published in|journal of)/gi,
    /(?:official statement|press release|public record)/gi,
    /(?:data from|statistics from|figures from)/gi,
    /https?:\/\/[^\s]+/g,
];

export async function analyzeTemporal(content) {
    const text = content.body;
    const lower = text.toLowerCase();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

    if (sentences.length < 2) {
        return {
            level: 'medium',
            score: 50,
            explanation: 'Text is too short to assess temporal and contextual patterns.',
        };
    }

    let risk = 0;
    const details = [];

    // 1. Urgency language
    let urgencyHits = 0;
    for (const phrase of URGENCY_PHRASES) {
        if (lower.includes(phrase)) urgencyHits++;
    }
    if (urgencyHits >= 3) { risk += 3; details.push(`Heavy urgency language (${urgencyHits} phrases)`); }
    else if (urgencyHits >= 1) { risk += 1; details.push('Some urgency language'); }

    // 2. Date/timestamp presence
    const hasDateMeta = !!content.date;
    const hasDateInText =
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(text) ||
        /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(text) ||
        /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
        /\b(?:yesterday|today|last week|last month|this morning|this afternoon)\b/i.test(text);

    if (!hasDateMeta && !hasDateInText) {
        risk += 1;
        details.push('No dates or timestamps found');
    }

    // 3. Internal corroboration signals (links, multi-source phrasing)
    let internalCorroboration = 0;
    for (const pattern of CORROBORATION_SIGNALS) {
        const m = text.matchAll(new RegExp(pattern.source, pattern.flags));
        for (const _ of m) internalCorroboration++;
    }
    if (internalCorroboration === 0) {
        risk += 2;
        details.push('No corroboration signals in text');
    } else if (internalCorroboration >= 3) {
        risk -= 1;
    }

    // 4. Share pressure
    if (lower.includes('before it gets deleted') || lower.includes('before they take it down') ||
        lower.includes('screenshot this') || lower.includes('save this post')) {
        risk += 2;
        details.push('Pressure to share/save content urgently');
    }

    // 5. External corroboration (NewsAPI) — runs in parallel with internal checks above
    const corroboration = await checkCorroboration(content);
    let corroborationNote = '';

    if (corroboration === null) {
        corroborationNote = 'External corroboration check unavailable (no NewsAPI key configured).';
    } else if (corroboration.found === 0) {
        risk += 2;
        details.push('No matching articles found in recent news');
        corroborationNote = corroboration.summary;
    } else if (corroboration.independentPhrasing) {
        risk -= 2; // strong positive signal
        corroborationNote = corroboration.summary;
    } else {
        risk += 1;
        corroborationNote = corroboration.summary;
    }

    risk = Math.max(0, risk);
    const score = Math.max(5, Math.min(95, Math.round((risk / 10) * 100)));
    const level = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';

    let explanation;
    if (level === 'low') {
        explanation = `Content has temporal context and corroboration signals. ${corroborationNote}`;
    } else if (level === 'medium') {
        explanation = `${details.slice(0, 2).join('. ')}. ${corroborationNote}`;
    } else {
        explanation = `Elevated temporal risk: ${details.slice(0, 3).join('. ')}. ${corroborationNote}`;
    }

    return {
        level,
        score,
        explanation,
        corroboration,
    };
}
