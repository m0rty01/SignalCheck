"""
SignalCheck ML Microservice
FastAPI service providing HuggingFace transformer inference endpoints.
Models are loaded once at startup and cached.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("signalcheck-ml")

# ---------------------------------------------------------------------------
# Global model holders
# ---------------------------------------------------------------------------
models = {}

# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all models once at startup."""
    logger.info("Loading HuggingFace models — this may take a minute on first run…")

    # 1. AI-text detector  (RoBERTa fine-tuned on GPT-2 outputs)
    try:
        logger.info("  → Loading roberta-base-openai-detector …")
        models["synthetic"] = pipeline(
            "text-classification",
            model="openai-community/roberta-base-openai-detector",
            tokenizer="openai-community/roberta-base-openai-detector",
            device=-1,          # CPU
            truncation=True,
            max_length=512,
        )
        logger.info("  ✓ Synthetic text detector loaded")
    except Exception as e:
        logger.error(f"  ✗ Could not load synthetic detector: {e}")
        models["synthetic"] = None

    # 2. Named-entity recognition
    try:
        logger.info("  → Loading dslim/bert-base-NER …")
        models["ner"] = pipeline(
            "ner",
            model="dslim/bert-base-NER",
            tokenizer="dslim/bert-base-NER",
            device=-1,
            aggregation_strategy="simple",
        )
        logger.info("  ✓ NER model loaded")
    except Exception as e:
        logger.error(f"  ✗ Could not load NER model: {e}")
        models["ner"] = None

    # 3. Sentiment analysis
    try:
        logger.info("  → Loading cardiffnlp/twitter-roberta-base-sentiment-latest …")
        models["sentiment"] = pipeline(
            "sentiment-analysis",
            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
            tokenizer="cardiffnlp/twitter-roberta-base-sentiment-latest",
            device=-1,
            truncation=True,
            max_length=512,
        )
        logger.info("  ✓ Sentiment model loaded")
    except Exception as e:
        logger.error(f"  ✗ Could not load sentiment model: {e}")
        models["sentiment"] = None

    logger.info("All models ready.")
    yield
    logger.info("Shutting down ML service.")


app = FastAPI(title="SignalCheck ML Service", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TextInput(BaseModel):
    text: str
    max_length: int | None = 512


class SyntheticResult(BaseModel):
    label: str          # "Real" or "Fake"
    score: float        # confidence 0-1
    synthetic_probability: float  # probability text is AI-generated


class Entity(BaseModel):
    entity_group: str
    word: str
    score: float
    start: int
    end: int


class NERResult(BaseModel):
    entities: list[Entity]
    person_count: int
    org_count: int
    location_count: int


class SentimentResult(BaseModel):
    label: str          # "positive", "negative", "neutral"
    score: float
    scores: dict[str, float]  # all label scores


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models": {
            "synthetic": models.get("synthetic") is not None,
            "ner": models.get("ner") is not None,
            "sentiment": models.get("sentiment") is not None,
        },
    }


@app.post("/detect-synthetic", response_model=SyntheticResult)
async def detect_synthetic(input: TextInput):
    """Detect likelihood that text is AI-generated."""
    if models.get("synthetic") is None:
        raise HTTPException(503, "Synthetic text detector not loaded")

    text = input.text[:5000]  # limit input length

    # The model may need chunking for long texts
    chunks = _chunk_text(text, max_tokens=400)
    fake_scores = []

    for chunk in chunks:
        try:
            results = models["synthetic"](chunk)
            for r in results:
                if r["label"] == "LABEL_0":  # "Real"
                    fake_scores.append(1.0 - r["score"])
                else:  # "LABEL_1" = "Fake" (AI-generated)
                    fake_scores.append(r["score"])
        except Exception as e:
            logger.warning(f"Chunk inference error: {e}")
            continue

    if not fake_scores:
        raise HTTPException(500, "Inference failed on all chunks")

    # Average across chunks
    avg_synthetic = sum(fake_scores) / len(fake_scores)

    return SyntheticResult(
        label="Fake" if avg_synthetic > 0.5 else "Real",
        score=max(avg_synthetic, 1.0 - avg_synthetic),
        synthetic_probability=round(avg_synthetic, 4),
    )


@app.post("/analyze-entities", response_model=NERResult)
async def analyze_entities(input: TextInput):
    """Extract named entities from text."""
    if models.get("ner") is None:
        raise HTTPException(503, "NER model not loaded")

    text = input.text[:5000]

    try:
        raw_entities = models["ner"](text)
    except Exception as e:
        logger.error(f"NER error: {e}")
        raise HTTPException(500, f"NER inference failed: {str(e)}")

    entities = []
    seen = set()
    for ent in raw_entities:
        key = (ent["entity_group"], ent["word"].strip())
        if key not in seen and ent["score"] > 0.7:
            seen.add(key)
            entities.append(Entity(
                entity_group=ent["entity_group"],
                word=ent["word"].strip(),
                score=round(ent["score"], 4),
                start=ent["start"],
                end=ent["end"],
            ))

    return NERResult(
        entities=entities,
        person_count=sum(1 for e in entities if e.entity_group == "PER"),
        org_count=sum(1 for e in entities if e.entity_group == "ORG"),
        location_count=sum(1 for e in entities if e.entity_group == "LOC"),
    )


@app.post("/analyze-sentiment", response_model=SentimentResult)
async def analyze_sentiment(input: TextInput):
    """Analyze sentiment of text."""
    if models.get("sentiment") is None:
        raise HTTPException(503, "Sentiment model not loaded")

    text = input.text[:5000]
    chunks = _chunk_text(text, max_tokens=400)

    all_scores = {"positive": [], "negative": [], "neutral": []}

    for chunk in chunks:
        try:
            results = models["sentiment"](chunk, top_k=3)
            for r in results:
                label = r["label"].lower()
                if label in all_scores:
                    all_scores[label].append(r["score"])
        except Exception as e:
            logger.warning(f"Sentiment chunk error: {e}")
            continue

    if not any(all_scores.values()):
        raise HTTPException(500, "Sentiment inference failed")

    avg_scores = {}
    for label, scores in all_scores.items():
        avg_scores[label] = round(sum(scores) / len(scores), 4) if scores else 0.0

    top_label = max(avg_scores, key=avg_scores.get)

    return SentimentResult(
        label=top_label,
        score=avg_scores[top_label],
        scores=avg_scores,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _chunk_text(text: str, max_tokens: int = 400) -> list[str]:
    """Split text into chunks that fit within model's token limit.
    Uses a rough word-based approximation (1 token ≈ 0.75 words).
    """
    words = text.split()
    max_words = int(max_tokens * 0.75)

    if len(words) <= max_words:
        return [text]

    chunks = []
    for i in range(0, len(words), max_words):
        chunk = " ".join(words[i:i + max_words])
        if len(chunk.strip()) > 20:
            chunks.append(chunk)

    return chunks if chunks else [text[:2000]]


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 3002))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
