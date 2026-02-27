import { useState } from 'react';

export default function InputPanel({ onAnalyze, isLoading }) {
    const [mode, setMode] = useState('url');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');

    const canSubmit = mode === 'url' ? url.trim().length > 0 : text.trim().length > 10;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!canSubmit || isLoading) return;

        if (mode === 'url') {
            onAnalyze({ url: url.trim(), text: '' });
        } else {
            onAnalyze({ url: '', text: text.trim() });
        }
    };

    return (
        <section className="input-panel">
            <form onSubmit={handleSubmit}>
                <div className="glass-card input-panel-card">
                    <div className="input-modes">
                        <button
                            type="button"
                            className={`input-mode-btn ${mode === 'url' ? 'active' : ''}`}
                            onClick={() => setMode('url')}
                        >
                            🔗 URL
                        </button>
                        <button
                            type="button"
                            className={`input-mode-btn ${mode === 'text' ? 'active' : ''}`}
                            onClick={() => setMode('text')}
                        >
                            📝 Paste Text
                        </button>
                    </div>

                    <div className="input-field-wrap">
                        {mode === 'url' ? (
                            <input
                                id="url-input"
                                type="url"
                                className="input-url"
                                placeholder="Paste an article or social media URL…"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                disabled={isLoading}
                            />
                        ) : (
                            <textarea
                                id="text-input"
                                className="input-textarea"
                                placeholder="Paste the content you want to analyze…&#10;&#10;This can be a news article, social media post, claim, or any text you want to check."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                disabled={isLoading}
                            />
                        )}
                    </div>

                    <div className="input-actions">
                        <button
                            id="analyze-btn"
                            type="submit"
                            className={`btn-analyze ${isLoading ? 'loading' : ''}`}
                            disabled={!canSubmit || isLoading}
                        >
                            {isLoading ? 'Analyzing…' : 'Analyze Content'}
                        </button>
                        <span className="input-hint">
                            {mode === 'url'
                                ? "We'll extract and analyze the visible text"
                                : `${text.length} characters`}
                        </span>
                    </div>
                </div>
            </form>
        </section>
    );
}
