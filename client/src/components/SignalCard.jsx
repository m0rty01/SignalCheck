import { useEffect, useState } from 'react';

export default function SignalCard({ title, icon, level, score, explanation, modelUsed }) {
    const [animatedWidth, setAnimatedWidth] = useState(0);

    useEffect(() => {
        const timeout = setTimeout(() => setAnimatedWidth(score), 100);
        return () => clearTimeout(timeout);
    }, [score]);

    return (
        <div className="glass-card signal-card">
            <div className="signal-card-header">
                <span className="signal-card-title">{icon} {title}</span>
                <span className={`signal-badge ${level}`}>{level}</span>
            </div>

            <div className="score-bar-container">
                <div className="score-bar-track">
                    <div
                        className={`score-bar-fill ${level}`}
                        style={{ width: `${animatedWidth}%` }}
                    />
                </div>
                <div className="score-value">{score}/100</div>
            </div>

            <p className="signal-explanation">{explanation}</p>

            {modelUsed && (
                <div className="ml-badge" title="Score enhanced by HuggingFace transformer model">
                    🤗 ML model
                </div>
            )}
        </div>
    );
}

