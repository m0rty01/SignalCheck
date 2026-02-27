import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── JSONL fallback (local dev / no Supabase) ──────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');

let supabase = null;
let supabaseInitAttempted = false;

// Lazy-init Supabase on first feedback request (avoids top-level async import)
async function getSupabase() {
    if (supabaseInitAttempted) return supabase;
    supabaseInitAttempted = true;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
        );
        console.log('Feedback: Supabase connected');
    } catch {
        console.warn('Feedback: could not connect to Supabase — falling back to JSONL');
    }
    return supabase;
}

if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ok */ }
}

// ── Route ─────────────────────────────────────────────────────────────────────
export const feedbackRoute = Router();

feedbackRoute.post('/feedback', async (req, res) => {
    try {
        const { helpful, comment, reportInaccurate, analysisId } = req.body;

        if (typeof helpful !== 'boolean' && !reportInaccurate) {
            return res.status(400).json({ error: 'Invalid feedback payload' });
        }

        const record = {
            helpful: helpful ?? null,
            report_inaccurate: !!reportInaccurate,
            comment: comment ? String(comment).slice(0, 500) : null,
            analysis_id: analysisId ? String(analysisId).slice(0, 64) : null,
            created_at: new Date().toISOString(),
        };

        const db = await getSupabase();
        if (db) {
            // Production path — persist to Supabase
            const { error } = await db.from('feedback').insert(record);
            if (error) throw error;
        } else {
            // Dev fallback — append to local JSONL
            fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(record) + '\n', 'utf-8');
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Feedback write error:', err.message);
        res.json({ ok: true }); // non-critical, don't surface to client
    }
});
