# SignalCheck Training Data — Label Schema

## Overview

Labels are **coarse and probabilistic**. No binary truth labels are used.
The goal is to capture structural credibility signals, not factual correctness.

## Label Definitions

| Label | Description |
|---|---|
| `high_credibility` | Content exhibiting strong sourcing, named attribution, corroborated claims, measured language |
| `low_credibility` | Content with weak or absent sourcing, emotional manipulation, uncorroborated claims |
| `synthetic-likely` | Text with patterns strongly associated with LLM generation |
| `ambiguous` | Content that cannot be reliably classified without additional context |

## Annotation Guidelines

### `high_credibility`
- Named, verifiable sources cited
- Claims linked to external evidence
- Measured, informational tone
- Publication context is clear (date, author, outlet)
- NOT: "this article is factually correct"

### `low_credibility`
- Anonymous or circular sourcing
- Emotional intensifiers without evidence
- Urgency/pressure-to-share language
- Known misinformation narrative tropes
- NOT: "this article is false"

### `synthetic-likely`
- High density of LLM transition phrases (furthermore, moreover, etc.)
- Uniform sentence length
- Generic topic coverage without specific named sources
- Low type-token ratio for the length
- Confirmed to be LLM-generated (known prompt/output pairs)

### `ambiguous`
- Insufficient length to classify
- Mixed strong and weak signals
- Topic requires domain expertise to assess
- Use liberally — forced classification harms model quality

## Data Sources

| Source | Primary Label | Notes |
|---|---|---|
| Reuters / AP archive | `high_credibility` | Professional editorial standards |
| Reddit r/badscience corrections | `high_credibility` | Community corrections of bad claims |
| Reddit r/HolUp original posts | `low_credibility` | Often misleading or false context |
| GPT-3.5/4 outputs on news topics | `synthetic-likely` | Known generation provenance |
| Human articles on same topics | `high_credibility` | Paired with synthetic for contrastive training |

## JSONL Record Format

```json
{
  "id": "unique-identifier",
  "text": "Full body text of the content",
  "label": "high_credibility | low_credibility | synthetic-likely | ambiguous",
  "source": "URL or description of origin",
  "topic": "Optional topic tag",
  "annotator": "human | auto",
  "collected_at": "ISO 8601 timestamp"
}
```
