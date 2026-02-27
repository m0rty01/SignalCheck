import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { analyzeRoute } from './routes/analyze.js';
import { feedbackRoute } from './routes/feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load .env manually (no dotenv dependency) ─────────────────────────────────
(function loadEnv() {
    const envPath = join(__dirname, '../.env');
    if (!existsSync(envPath)) return;
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        const value = rest.join('=').trim();
        if (key && value && !process.env[key]) process.env[key] = value;
    }
})();

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// In production Render handles HTTPS termination; allow all origins for the API.
app.use(cors());
app.use(express.json({ limit: '500kb' }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', analyzeRoute);
app.use('/api', feedbackRoute);

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: isProd ? 'production' : 'development',
        features: {
            newsApi: !!process.env.NEWS_API_KEY,
            mlClient: !!process.env.HF_TOKEN ? 'huggingface (token set)' : 'huggingface (anonymous)',
            feedback: process.env.SUPABASE_URL ? 'supabase' : 'jsonl-file',
        },
    });
});

// ── Serve built React frontend in production ──────────────────────────────────
if (isProd) {
    const distPath = join(__dirname, '../client/dist');
    app.use(express.static(distPath));
    // React Router: send index.html for any non-API path
    app.get('*', (_req, res) => {
        res.sendFile(join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`SignalCheck API running on http://localhost:${PORT}`);
    console.log(`  Mode:     ${isProd ? 'production' : 'development'}`);
    console.log(`  NewsAPI:  ${process.env.NEWS_API_KEY ? '✓ configured' : '✗ not configured'}`);
    console.log(`  HF token: ${process.env.HF_TOKEN ? '✓ set' : '✗ not set (anonymous rate limit)'}`);
    console.log(`  Feedback: ${process.env.SUPABASE_URL ? '✓ supabase' : '○ jsonl file (dev)'}`);
});
