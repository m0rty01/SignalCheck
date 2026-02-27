import SignalCard from './SignalCard';
import Summary from './Summary';
import Feedback from './Feedback';

const SIGNAL_LABELS = {
    syntheticText: { title: 'Synthetic Text', icon: '🤖' },
    sourcing: { title: 'Sourcing & Attribution', icon: '📰' },
    linguistic: { title: 'Linguistic Risk', icon: '🔤' },
    temporal: { title: 'Temporal & Context', icon: '⏱️' },
    structural: { title: 'Structural Integrity', icon: '🏗️' },
};

export default function ResultsDashboard({ results, onReset }) {
    const { signals, aggregation, meta } = results;
    const { confidenceBand, summary, uncertaintyStatement, suggestions, disagreements } = aggregation;
    const analysisId = meta?.analyzedAt || '';

    const bandLabel = {
        low: 'Low Caution — Signals appear mostly normal',
        medium: 'Moderate Caution — Some signals warrant scrutiny',
        high: 'High Caution — Multiple signals suggest careful evaluation',
    };

    const corroboration = signals?.temporal?.corroboration;

    return (
        <div className="results" id="results-dashboard">
            <div className="results-header">
                <h2 className="results-title">Credibility Signal Report</h2>
                <button className="btn-new" onClick={onReset} id="new-analysis-btn">
                    ← New Analysis
                </button>
            </div>

            {/* Confidence Band */}
            <div className="glass-card confidence-band" id="confidence-band">
                <div className="confidence-level">
                    <span className={`confidence-dot ${confidenceBand}`} />
                    <span className={`confidence-label ${confidenceBand}`}>
                        {confidenceBand.charAt(0).toUpperCase() + confidenceBand.slice(1)} Caution
                    </span>
                </div>
                <span className="confidence-desc">{bandLabel[confidenceBand]}</span>
            </div>

            {/* Signal Cards Grid */}
            <div className="signal-grid" id="signal-grid">
                {Object.entries(signals).map(([key, signal]) => (
                    <SignalCard
                        key={key}
                        title={SIGNAL_LABELS[key]?.title || key}
                        icon={SIGNAL_LABELS[key]?.icon || '📊'}
                        level={signal.level}
                        score={signal.score}
                        explanation={signal.explanation}
                        modelUsed={signal.modelUsed}
                    />
                ))}
            </div>

            {/* Corroboration block */}
            {corroboration && corroboration.found > 0 && (
                <div className={`glass-card corroboration-block ${corroboration.independentPhrasing ? 'positive' : 'neutral'}`} id="corroboration">
                    <div className="corroboration-title">
                        {corroboration.independentPhrasing ? '✅' : '⚠️'} Cross-Source Corroboration
                    </div>
                    <p className="corroboration-summary">{corroboration.summary}</p>
                    {corroboration.sources?.length > 0 && (
                        <ul className="corroboration-sources">
                            {corroboration.sources.slice(0, 3).map((s, i) => (
                                <li key={i}>
                                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                                        {s.source}: {s.title?.slice(0, 80)}{s.title?.length > 80 ? '…' : ''}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Disagreements */}
            {disagreements && disagreements.length > 0 && (
                <div className="glass-card disagreements" id="disagreements">
                    <div className="disagreements-title">
                        ⚡ Signal Disagreements
                    </div>
                    {disagreements.map((d, i) => (
                        <p key={i} className="disagreements-text">{d}</p>
                    ))}
                </div>
            )}

            {/* Summary */}
            <Summary
                summary={summary}
                uncertaintyStatement={uncertaintyStatement}
                suggestions={suggestions}
            />

            {/* Feedback */}
            <Feedback analysisId={analysisId} />
        </div>
    );
}

