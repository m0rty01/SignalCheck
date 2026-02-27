#!/usr/bin/env python3
"""
Training Data Generator — Human-Written vs LLM-Generated Pairs
Creates matched pairs of human-written and LLM-generated text on identical topics.
Uses the OpenAI or OpenRouter API to generate the LLM half.

Usage:
    pip install openai
    OPENAI_API_KEY=... python generate_synthetic.py --out data/synthetic_pairs.jsonl
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

# Seed topics — matched pairs will be generated for each
SEED_TOPICS = [
    "The effects of social media on teenage mental health",
    "How vaccines work and why herd immunity matters",
    "The causes and consequences of inflation",
    "Climate change and its effects on coastal cities",
    "The history and impact of the civil rights movement",
    "How misinformation spreads on social media",
    "The ethics of artificial intelligence in hiring decisions",
    "The role of nutrition in preventing chronic disease",
]

GENERATION_PROMPT = """Write a short news-style article (3-4 paragraphs, ~200 words) about: {topic}

Write it to sound informative and neutral. Do not use headers."""


def generate_with_openai(topic, client):
    """Generate one LLM article for a topic."""
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "You are a news writer."},
            {"role": "user", "content": GENERATION_PROMPT.format(topic=topic)},
        ],
        max_tokens=400,
        temperature=0.8,
    )
    return response.choices[0].message.content.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='data/synthetic_pairs.jsonl')
    parser.add_argument('--human-dir', default='data/human_articles',
                        help='Directory containing human-written articles (one .txt per file)')
    args = parser.parse_args()

    api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        print("Set OPENAI_API_KEY or OPENROUTER_API_KEY environment variable")
        sys.exit(1)

    try:
        import openai
    except ImportError:
        print("Run: pip install openai")
        sys.exit(1)

    base_url = None
    if os.environ.get('OPENROUTER_API_KEY'):
        base_url = "https://openrouter.ai/api/v1"

    client = openai.OpenAI(api_key=api_key, base_url=base_url)

    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)

    with open(args.out, 'w') as f:
        for topic in SEED_TOPICS:
            print(f"Generating: {topic[:50]}...")
            try:
                llm_text = generate_with_openai(topic, client)
                record = {
                    'topic': topic,
                    'text': llm_text,
                    'label': 'synthetic-likely',
                    'generated_at': datetime.utcnow().isoformat(),
                }
                f.write(json.dumps(record) + '\n')
                time.sleep(1)
            except Exception as e:
                print(f"  Error: {e}")

        # Also label any human-written articles in the human-dir
        if os.path.isdir(args.human_dir):
            for fname in os.listdir(args.human_dir):
                if fname.endswith('.txt'):
                    with open(os.path.join(args.human_dir, fname)) as hf:
                        text = hf.read().strip()
                    if len(text) > 100:
                        record = {
                            'topic': fname.replace('.txt', ''),
                            'text': text,
                            'label': 'high_credibility',
                            'generated_at': datetime.utcnow().isoformat(),
                        }
                        f.write(json.dumps(record) + '\n')

    print(f"Done → {args.out}")


if __name__ == '__main__':
    main()
