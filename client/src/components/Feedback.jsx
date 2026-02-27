import { useState } from 'react';

/**
 * Feedback widget — displayed below analysis results.
 * Collects helpful/not-helpful rating, optional comment, and inaccuracy reports.
 */
export default function Feedback({ analysisId }) {
    const [stage, setStage] = useState('initial'); // initial | rated | reported | done
    const [helpful, setHelpful] = useState(null);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function submitFeedback(payload) {
        try {
            setSubmitting(true);
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, analysisId }),
            });
        } catch {
            // Silently fail — feedback is non-critical
        } finally {
            setSubmitting(false);
        }
    }

    async function handleThumb(value) {
        setHelpful(value);
        if (value) {
            await submitFeedback({ helpful: true });
            setStage('done');
        } else {
            setStage('rated');
        }
    }

    async function handleSubmitComment() {
        await submitFeedback({ helpful, comment, reportInaccurate: false });
        setStage('done');
    }

    async function handleReport() {
        await submitFeedback({ helpful: false, comment, reportInaccurate: true });
        setStage('done');
    }

    return (
        <div className="feedback-panel" id="feedback-section">
            {stage === 'initial' && (
                <div className="feedback-row">
                    <span className="feedback-prompt">Was this analysis helpful?</span>
                    <div className="feedback-thumbs">
                        <button
                            className="thumb-btn"
                            onClick={() => handleThumb(true)}
                            disabled={submitting}
                            aria-label="Helpful"
                            title="Helpful"
                        >
                            👍
                        </button>
                        <button
                            className="thumb-btn"
                            onClick={() => handleThumb(false)}
                            disabled={submitting}
                            aria-label="Not helpful"
                            title="Not helpful"
                        >
                            👎
                        </button>
                    </div>
                </div>
            )}

            {stage === 'rated' && (
                <div className="feedback-expanded">
                    <p className="feedback-prompt">What could be improved?</p>
                    <textarea
                        className="feedback-textarea"
                        placeholder="Optional — describe the issue (max 500 chars)"
                        value={comment}
                        onChange={e => setComment(e.target.value.slice(0, 500))}
                        rows={3}
                        id="feedback-comment"
                    />
                    <div className="feedback-actions">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleSubmitComment}
                            disabled={submitting}
                        >
                            Send feedback
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={handleReport}
                            disabled={submitting}
                        >
                            Report inaccurate analysis
                        </button>
                    </div>
                </div>
            )}

            {stage === 'done' && (
                <p className="feedback-done">
                    ✓ Thanks for your feedback — it helps us improve SignalCheck.
                </p>
            )}
        </div>
    );
}
