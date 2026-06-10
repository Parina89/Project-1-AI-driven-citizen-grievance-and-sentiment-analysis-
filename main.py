
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import json
import re

# ── Load models ────────────────────────────────────────────────
dept_model = joblib.load("models/dept_classifier.pkl")
sent_model = joblib.load("models/sent_classifier.pkl")

with open("models/priority_map.json") as f:
    PRIORITY_MAP = json.load(f)

app = FastAPI(
    title="Citizen Grievance & Sentiment API",
    description="AI-powered complaint routing and urgency scoring system",
    version="1.0.0"
)

# ── Request & Response Schemas ─────────────────────────────────
class ComplaintRequest(BaseModel):
    complaint_text: str

class PredictionResponse(BaseModel):
    original_text:   str
    department:      str
    dept_confidence: float
    sentiment:       str
    sent_confidence: float
    priority_score:  float
    action:          str

# ── Preprocessing ──────────────────────────────────────────────
def preprocess(text: str) -> str:
    text = text.lower()
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"[^a-z\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def get_action(sentiment: str) -> str:
    return {
        "Critical": " IMMEDIATE escalation required — dispatch within 1 hour",
        "Negative": "  High priority — respond within 24 hours",
        "Neutral":  " Standard queue — respond within 3 working days",
        "Positive": " Acknowledgement only — log and close"
    }.get(sentiment, "Standard queue")

# ── Endpoints ──────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Citizen Grievance API is running!", "status": "healthy"}

@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": True}

@app.post("/predict", response_model=PredictionResponse)
def predict(request: ComplaintRequest):
    if not request.complaint_text.strip():
        raise HTTPException(status_code=400, detail="complaint_text cannot be empty")

    cleaned = preprocess(request.complaint_text)

    # Department prediction
    dept_probs    = dept_model.predict_proba([cleaned])[0]
    dept_label    = dept_model.classes_[dept_probs.argmax()]
    dept_conf     = round(float(dept_probs.max()), 4)

    # Sentiment prediction
    sent_probs    = sent_model.predict_proba([cleaned])[0]
    sent_label    = sent_model.classes_[sent_probs.argmax()]
    sent_conf     = round(float(sent_probs.max()), 4)

    # Priority score
    base_score    = PRIORITY_MAP.get(sent_label, 0.35)
    priority      = round(base_score * sent_conf, 4)

    return PredictionResponse(
        original_text   = request.complaint_text,
        department      = dept_label,
        dept_confidence = dept_conf,
        sentiment       = sent_label,
        sent_confidence = sent_conf,
        priority_score  = priority,
        action          = get_action(sent_label)
    )
