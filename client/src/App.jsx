import { useState } from 'react';
import Header from './components/Header';
import InputPanel from './components/InputPanel';
import ResultsDashboard from './components/ResultsDashboard';
import Disclaimer from './components/Disclaimer';

function App() {
    const [state, setState] = useState('input'); // input | loading | results | error
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const handleAnalyze = async ({ url, text }) => {
        setState('loading');
        setError(null);

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, text }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
                throw new Error(err.error || `Server error (${res.status})`);
            }

            const data = await res.json();
            setResults(data);
            setState('results');
        } catch (err) {
            setError(err.message);
            setState('error');
        }
    };

    const handleReset = () => {
        setState('input');
        setResults(null);
        setError(null);
    };

    return (
        <div className="app">
            <Header />
            <main className="app-main">
                <div className="container">
                    <InputPanel
                        onAnalyze={handleAnalyze}
                        isLoading={state === 'loading'}
                    />

                    {state === 'loading' && (
                        <div className="loading-container">
                            <div className="loading-spinner" />
                            <p className="loading-text">Analyzing content signals…</p>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="glass-card error-container">
                            <div className="error-icon">⚠️</div>
                            <p className="error-message">{error}</p>
                            <p className="error-hint">Try pasting the content as text instead, or check the URL.</p>
                        </div>
                    )}

                    {state === 'results' && results && (
                        <ResultsDashboard results={results} onReset={handleReset} />
                    )}

                    <Disclaimer />
                </div>
            </main>
        </div>
    );
}

export default App;
