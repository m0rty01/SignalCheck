#!/usr/bin/env python3
"""
Training Data Collection — Reddit Claim Corrections
Collects Reddit threads where factual claims are corrected or debunked.
Uses PRAW (Reddit API) or pushshift.io as fallback.

Labels:
  low_credibility  — original post that was corrected
  high_credibility — correction / debunk comment
  ambiguous        — context needed

Usage:
    pip install praw
    python collect_reddit.py --out data/reddit_raw.jsonl --limit 1000
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

TARGET_SUBREDDITS = [
    'HolUp',           # posts that are often corrected in comments
    'Snopes',          # fact-checks
    'badhistory',      # corrections of historical myths
    'badscience',      # corrections of scientific claims
    'skeptic',         # critical examination of claims
    'factcheck',       # direct fact checks
    'Foodforthought',  # often manipulative or misleading
]

CORRECTION_KEYWORDS = [
    'actually', 'correction', 'that is false', 'this is false',
    'not true', 'incorrect', 'misleading', 'debunked', 'snopes',
    'factcheck', 'wrong', 'inaccurate', 'misinformation',
    'source?', '[citation needed]', 'do you have a source',
]

def collect_with_praw(subreddits, limit, out_file):
    """Collect using official Reddit API via PRAW."""
    try:
        import praw
    except ImportError:
        print("PRAW not installed. Run: pip install praw")
        print("Alternatively set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars.")
        sys.exit(1)

    reddit = praw.Reddit(
        client_id=os.environ['REDDIT_CLIENT_ID'],
        client_secret=os.environ['REDDIT_CLIENT_SECRET'],
        user_agent='SignalCheck-DataCollection/1.0',
    )

    collected = 0
    with open(out_file, 'w') as f:
        for sub_name in subreddits:
            sub = reddit.subreddit(sub_name)
            for post in sub.top(time_filter='year', limit=limit // len(subreddits)):
                # Post text
                post_text = post.selftext or post.title
                if len(post_text) < 50:
                    continue

                record = {
                    'id': post.id,
                    'subreddit': sub_name,
                    'text': post_text,
                    'label': 'low_credibility',  # to be refined by reviewer
                    'source': f'https://reddit.com{post.permalink}',
                    'collected_at': datetime.utcnow().isoformat(),
                }
                f.write(json.dumps(record) + '\n')
                collected += 1

                # Collect correction comments
                post.comments.replace_more(limit=0)
                for comment in post.comments[:20]:
                    text = comment.body or ''
                    is_correction = any(kw in text.lower() for kw in CORRECTION_KEYWORDS)
                    if is_correction and len(text) > 50:
                        rec = {
                            'id': comment.id,
                            'subreddit': sub_name,
                            'text': text,
                            'label': 'high_credibility',
                            'source': f'https://reddit.com{comment.permalink}',
                            'collected_at': datetime.utcnow().isoformat(),
                        }
                        f.write(json.dumps(rec) + '\n')
                        collected += 1

                time.sleep(0.5)  # be polite

    print(f"Collected {collected} records → {out_file}")


def main():
    parser = argparse.ArgumentParser(description='Collect Reddit training data')
    parser.add_argument('--out', default='data/reddit_raw.jsonl', help='Output JSONL file')
    parser.add_argument('--limit', type=int, default=500, help='Total posts to collect')
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    collect_with_praw(TARGET_SUBREDDITS, args.limit, args.out)


if __name__ == '__main__':
    main()
