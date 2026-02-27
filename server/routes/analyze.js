import { Router } from 'express';
import { extractContent } from '../services/extractor.js';
import { analyzeSyntheticText } from '../services/analyzers/syntheticText.js';
import { analyzeSourcing } from '../services/analyzers/sourcing.js';
import { analyzeLinguistic } from '../services/analyzers/linguistic.js';
import { analyzeTemporal } from '../services/analyzers/temporal.js';
import { analyzeStructural } from '../services/analyzers/structural.js';
import { aggregate } from '../services/aggregator.js';

export const analyzeRoute = Router();

analyzeRoute.post('/analyze', async (req, res) => {
    try {
        const { url, text } = req.body;

        if (!url && !text) {
            return res.status(400).json({ error: 'Please provide a URL or text to analyze.' });
        }

        // Step 1: Extract content
        let content;
        if (url) {
            content = await extractContent(url);
        } else {
            content = {
                title: '',
                body: text,
                meta: '',
                author: '',
                date: '',
                source: 'manual-paste',
            };
        }

        if (!content.body || content.body.trim().length < 10) {
            return res.status(400).json({
                error: 'Could not extract enough text to analyze. Try pasting the content directly.',
            });
        }

        // Step 2: Run all analyzers in parallel
        const [syntheticText, sourcing, linguistic, temporal, structural] = await Promise.all([
            analyzeSyntheticText(content),
            analyzeSourcing(content),
            analyzeLinguistic(content),
            analyzeTemporal(content),
            analyzeStructural(content),
        ]);

        const signals = { syntheticText, sourcing, linguistic, temporal, structural };

        // Step 3: Aggregate
        const aggregation = aggregate(signals, content);

        // Step 4: Return
        res.json({
            signals,
            aggregation,
            meta: {
                source: content.source,
                title: content.title,
                analyzedAt: new Date().toISOString(),
                charCount: content.body.length,
            },
        });
    } catch (err) {
        console.error('Analysis error:', err);
        res.status(500).json({
            error: err.message || 'Analysis failed. Please try again.',
        });
    }
});
