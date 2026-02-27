export default function Summary({ summary, uncertaintyStatement, suggestions }) {
    return (
        <div className="glass-card summary-section" id="summary-section">
            <h3 className="summary-title">Analysis Summary</h3>
            <p className="summary-text">{summary}</p>

            <div className="uncertainty-statement">
                {uncertaintyStatement}
            </div>

            {suggestions && suggestions.length > 0 && (
                <div className="suggestions">
                    <h4 className="suggestions-title">What would increase confidence?</h4>
                    <ul className="suggestions-list">
                        {suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
