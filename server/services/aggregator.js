/**
 * Aggregation Layer
 * 
 * Combines all module outputs into a credibility profile.
 * No single score — preserves multi-dimensional view.
 * Highlights disagreements between signals.
 */

export function aggregate(signals, content) {
    const { syntheticText, sourcing, linguistic, temporal, structural } = signals;
    const allSignals = [syntheticText, sourcing, linguistic, temporal, structural];
    const scores = allSignals.map(s => s.score);
    const levels = allSignals.map(s => s.level);

    // --- Confidence Band ---
    const highCount = levels.filter(l => l === 'high').length;
    const mediumCount = levels.filter(l => l === 'medium').length;
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    let confidenceBand;
    if (highCount >= 3 || avgScore >= 65) {
        confidenceBand = 'high';
    } else if (highCount >= 1 || mediumCount >= 3 || avgScore >= 35) {
        confidenceBand = 'medium';
    } else {
        confidenceBand = 'low';
    }

    // --- Disagreements ---
    const disagreements = [];
    if (levels.includes('high') && levels.includes('low')) {
        const highSignals = [];
        const lowSignals = [];
        const names = ['Synthetic Text', 'Sourcing', 'Linguistic Risk', 'Temporal', 'Structural'];

        levels.forEach((level, i) => {
            if (level === 'high') highSignals.push(names[i]);
            if (level === 'low') lowSignals.push(names[i]);
        });

        if (highSignals.length > 0 && lowSignals.length > 0) {
            disagreements.push(
                `${highSignals.join(' and ')} signal${highSignals.length > 1 ? 's' : ''} high risk, while ${lowSignals.join(' and ')} appear${lowSignals.length === 1 ? 's' : ''} normal. This mixed picture means some aspects warrant scrutiny even though others look fine.`
            );
        }
    }

    // --- Summary ---
    let summary;
    if (confidenceBand === 'low') {
        summary = `This content's signal profile appears mostly normal across the dimensions we analyze. Sourcing, language patterns, structural framing, and other indicators don't raise significant flags. This doesn't mean the content is true — only that its surface characteristics are consistent with standard reporting or communication.`;
    } else if (confidenceBand === 'medium') {
        const concerns = [];
        if (syntheticText.level !== 'low') concerns.push('some patterns resembling generated text');
        if (sourcing.level !== 'low') concerns.push('limited source attribution');
        if (linguistic.level !== 'low') concerns.push('elevated emotional or certainty language');
        if (temporal.level !== 'low') concerns.push('weak temporal context or corroboration');
        if (structural.level !== 'low') concerns.push('structural framing concerns');

        summary = `This content shows some signals that suggest caution: ${concerns.join(', ')}. These patterns don't prove anything is wrong, but they appear in content that sometimes turns out to be misleading, incomplete, or decontextualized. Additional verification would be worthwhile before acting on or sharing this content.`;
    } else {
        const topConcerns = allSignals
            .filter(s => s.level === 'high')
            .map(s => s.explanation)
            .slice(0, 2);

        summary = `Multiple credibility signals flag this content for careful evaluation. ${topConcerns.join(' ')} These patterns frequently appear in content that is misleading, manipulative, or synthetic. This does not mean the claims are false — but the way they are presented warrants significant caution.`;
    }

    // --- Uncertainty Statement ---
    const uncertaintyStatement = `This analysis examines content characteristics and surface-level patterns only. It cannot determine whether claims are true or false, nor can it assess the intent of the author. Signals are probabilistic estimates based on textual heuristics. Content that appears normal by these measures could still be misleading, and content that triggers warnings could be entirely accurate. Always apply your own judgment.`;

    // --- Suggestions ---
    const suggestions = [];

    if (sourcing.level !== 'low') {
        suggestions.push('Look for the same story reported by multiple independent news organizations with their own sourcing');
    }
    if (syntheticText.level !== 'low') {
        suggestions.push('Check whether a named human author is associated with this content and has a verifiable track record');
    }
    if (linguistic.level !== 'low') {
        suggestions.push('Compare this content to coverage of the same topic that uses more measured language');
    }
    if (temporal.level !== 'low') {
        suggestions.push('Wait for the story to develop — initial reports are often incomplete or inaccurate');
    }
    if (structural.level !== 'low') {
        suggestions.push('Read beyond the headline — check if the body actually supports the framing');
    }
    if (!content.source || content.source === 'manual-paste') {
        suggestions.push('Try to identify the original source of this content for better context');
    }
    if (suggestions.length === 0) {
        suggestions.push('Cross-reference claims with other reputable sources before sharing');
        suggestions.push('Consider the broader context and whether this content is complete');
    }

    return {
        confidenceBand,
        summary,
        uncertaintyStatement,
        suggestions,
        disagreements,
    };
}
