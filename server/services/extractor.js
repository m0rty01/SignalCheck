import * as cheerio from 'cheerio';

/**
 * Extracts content from a URL with platform-specific handling.
 */
export async function extractContent(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL provided.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are supported.');
    }

    const hostname = parsed.hostname.replace(/^www\./, '');

    // Platform-specific extractors
    if (hostname === 'twitter.com' || hostname === 'x.com') {
        return extractTwitter(parsed);
    }
    if (hostname === 'reddit.com' || hostname === 'old.reddit.com') {
        return extractReddit(parsed);
    }

    // Generic HTML extractor
    return extractGeneric(url, parsed);
}

// ── Twitter / X ───────────────────────────────────────────────────────────────

async function extractTwitter(parsed) {
    // Twitter aggressively blocks server-side scraping.
    // Fetch via oEmbed (no auth needed) to get basic metadata.
    try {
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(parsed.href)}&omit_script=true`;
        const res = await fetch(oembedUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
            const data = await res.json();
            // Strip HTML tags from oembed html to get plain text
            const body = (data.html || '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (body.length > 10) {
                return {
                    title: `Post by @${data.author_name}`,
                    body,
                    meta: '',
                    author: data.author_name || '',
                    date: '',
                    source: 'twitter.com',
                    platform: 'twitter',
                };
            }
        }
    } catch { /* fall through */ }

    throw new Error(
        'Twitter/X does not allow server-side text extraction. Please copy the post text and paste it directly.'
    );
}

// ── Reddit ────────────────────────────────────────────────────────────────────

async function extractReddit(parsed) {
    // Reddit provides a public JSON endpoint for posts
    let jsonUrl = parsed.href;
    // Ensure .json suffix
    jsonUrl = jsonUrl.replace(/\/$/, '') + '.json';
    // Prefer old.reddit for more reliable JSON
    jsonUrl = jsonUrl.replace('www.reddit.com', 'old.reddit.com').replace('reddit.com', 'old.reddit.com');

    try {
        const res = await fetch(jsonUrl, {
            headers: {
                'User-Agent': 'SignalCheck/1.0 (content-analysis)',
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) throw new Error(`Reddit returned ${res.status}`);

        const data = await res.json();
        const post = data?.[0]?.data?.children?.[0]?.data;

        if (!post) throw new Error('Could not parse Reddit post data');

        const title = post.title || '';
        const selftext = post.selftext || '';
        const body = selftext.length > 0
            ? `${title}\n\n${selftext}`
            : title;

        if (body.length < 10) {
            throw new Error('Reddit post appears to be a link post with no text body. Please paste the linked article instead.');
        }

        return {
            title,
            body,
            meta: post.url || '',
            author: post.author || '',
            date: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
            source: 'reddit.com',
            platform: 'reddit',
        };
    } catch (err) {
        if (err.message.includes('paste')) throw err;
        throw new Error(
            'Could not extract Reddit post. Try pasting the text directly.'
        );
    }
}

// ── Generic HTML ──────────────────────────────────────────────────────────────

async function extractGeneric(url, parsed) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
        response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SignalCheck/1.0; content-analysis)',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });
    } catch (err) {
        throw new Error(
            err.name === 'AbortError'
                ? 'URL took too long to respond. Try pasting the text instead.'
                : `Could not fetch URL: ${err.message}`
        );
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(`URL returned status ${response.status}. Try pasting the text instead.`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        throw new Error('URL does not appear to contain readable text content.');
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $('script, style, nav, footer, aside, iframe, noscript, .ad, .advertisement, [role="navigation"]').remove();

    const title =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        $('h1').first().text().trim() || '';

    const meta =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') || '';

    const author =
        $('meta[name="author"]').attr('content') ||
        $('[rel="author"]').text().trim() ||
        $('[class*="author"]').first().text().trim() || '';

    const date =
        $('meta[property="article:published_time"]').attr('content') ||
        $('time').attr('datetime') ||
        $('time').text().trim() || '';

    let body = '';
    const articleEl = $('article, [role="main"], .post-content, .article-content, .entry-content, main');

    if (articleEl.length) {
        body = articleEl.first().text();
    } else {
        const paragraphs = [];
        $('p').each((_i, el) => {
            const t = $(el).text().trim();
            if (t.length > 30) paragraphs.push(t);
        });
        body = paragraphs.join('\n\n');
    }

    body = body.replace(/\s+/g, ' ').trim();

    if (!body || body.length < 20) {
        throw new Error('Could not extract meaningful text from this URL. Try pasting the content directly.');
    }

    return { title, body, meta, author, date, source: parsed.hostname };
}
