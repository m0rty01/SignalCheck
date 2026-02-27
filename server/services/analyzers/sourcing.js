/**
 * Sourcing & Attribution Analyzer — ML-enhanced with NER
 *
 * Uses `dslim/bert-base-NER` via HuggingFace Inference API to find real named entities.
 * Falls back to regex patterns if ML unavailable.
 */

import { analyzeEntities } from '../mlClient.js';

// ── Regex fallback patterns ──────────────────────────────────────────────────

const ATTRIBUTION_PATTERNS = [
    /according to ([A-Z][a-zA-Z\s]+)/g,
    /(?:said|stated|reported|confirmed|announced|disclosed|revealed) (?:by )?([A-Z][a-zA-Z\s]+)/g,
    /(?:study|report|analysis|investigation|research) (?:by|from|conducted by) ([A-Z][a-zA-Z\s]+)/g,
    /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)+),?\s+(?:a |the )?(?:professor|researcher|analyst|expert|director|spokesperson|official)/g,
];

const ANONYMOUS_PATTERNS = [
    /sources?\s+(?:say|said|claim|report|indicate|suggest|familiar with)/gi,
    /(?:unnamed|anonymous|undisclosed)\s+sources?/gi,
    /people?\s+(?:close to|familiar with|with knowledge of|briefed on)/gi,
    /(?:experts?|officials?|insiders?|analysts?)\s+(?:say|said|believe|warn|predict|suggest)/gi,
    /(?:it is|it's)\s+(?:believed|thought|rumored|said|reported)\s+that/gi,
    /(?:many|some|several)\s+(?:people|experts|analysts|observers)\s+(?:say|believe|think)/gi,
];

const CLAIM_INDICATORS = [
    /(?:will|would|could|should|might)\s+(?:cause|lead to|result in|create|destroy|change)/gi,
    /(?:always|never|every|all|none)\s+/gi,
    /(?:proven|confirmed|debunked|exposed|revealed)\s+(?:that|to)/gi,
    /(?:studies show|research shows|science says|data shows|evidence shows)/gi,
];

function regexSourceCount(text) {
    let named = 0;
    for (const p of ATTRIBUTION_PATTERNS) {
        const matches = text.matchAll(new RegExp(p.source, p.flags));
        for (const _ of matches) named++;
    }
    return named;
}

function regexAnonCount(text) {
    let anon = 0;
    for (const p of ANONYMOUS_PATTERNS) {
        const matches = text.matchAll(new RegExp(p.source, p.flags));
        for (const _ of matches) anon++;
    }
    return anon;
}

function claimCount(text) {
    let claims = 0;
    for (const p of CLAIM_INDICATORS) {
        const matches = text.matchAll(new RegExp(p.source, p.flags));
        for (const _ of matches) claims++;
    }
    return claims;
}

// ── ML call — delegates to mlClient (HuggingFace Inference API) ─────────────

async function mlEntityData(text) {
    return analyzeEntities(text); // { person_count, org_count, entities } or null
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeSourcing(content) {
    const text = content.body;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    if (sentences.length < 2) {
        return {
            level: 'medium',
            score: 50,
            explanation: 'Text is too short to meaningfully assess sourcing patterns.',
        };
    }

    const [mlEntities, anonClaims, unattributed, links] = await Promise.all([
        mlEntityData(text),
        Promise.resolve(regexAnonCount(text)),
        Promise.resolve(claimCount(text)),
        Promise.resolve((text.match(/https?:\/\/[^\s)>]+/g) || []).length),
    ]);

    const modelUsed = mlEntities !== null;

    // Named sources: NER persons + orgs (ML) or regex fallback
    const namedSources = modelUsed
        ? mlEntities.person_count + mlEntities.org_count
        : regexSourceCount(text);

    // Unique named entities for explanation
    const uniqueNames = modelUsed
        ? [...new Set(mlEntities.entities
            .filter(e => e.entity_group === 'PER' || e.entity_group === 'ORG')
            .map(e => e.word))]
        : [];

    // Score calculation
    let score = 50;
    score -= Math.min(namedSources * 8, 30);
    score += Math.min(anonClaims * 5, 15);
    score += Math.min(unattributed * 3, 20);
    score -= Math.min(links * 3, 10);
    if (content.author) score -= 5;
    score = Math.max(5, Math.min(95, score));

    const level = score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
    const source = modelUsed ? 'bert-base-NER' : 'pattern matching (ML unavailable)';

    let explanation;
    if (level === 'low') {
        explanation = `Strong sourcing: ${namedSources} named entity${namedSources !== 1 ? 'ies' : 'y'} identified${uniqueNames.length ? ` (${uniqueNames.slice(0, 3).join(', ')})` : ''} with ${links} external link${links !== 1 ? 's' : ''}. Assessed via ${source}.`;
    } else if (level === 'medium') {
        explanation = `Limited sourcing: ${namedSources} named source${namedSources !== 1 ? 's' : ''} vs ${anonClaims + unattributed} unsupported or anonymous claim${(anonClaims + unattributed) !== 1 ? 's' : ''}. Assessed via ${source}.`;
    } else {
        explanation = `Weak sourcing: ${anonClaims > 0 ? `${anonClaims} anonymous reference${anonClaims !== 1 ? 's' : ''}. ` : ''}Claims lack clear attribution to named, verifiable sources. Assessed via ${source}.`;
    }

    return {
        level,
        score,
        explanation,
        modelUsed,
        details: {
            namedSources,
            anonymousClaims: anonClaims,
            externalLinks: links,
            namedEntities: uniqueNames.slice(0, 6),
        },
    };
}
