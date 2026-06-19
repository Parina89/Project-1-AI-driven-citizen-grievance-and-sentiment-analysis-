import os
import re
import datetime
import json
import joblib
import numpy as np
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Initialize FastAPI app
app = FastAPI(
    title="Civic Sentinel AI - Grievance Command Center API",
    description="Backend service for citizen grievance classification and urgency triage.",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File Paths
DATA_FILE = "data/grievances.json"
MODEL_DIR = "models"
DEPT_MODEL_PATH = f"{MODEL_DIR}/best_department_classifier.pkl"
DEPT_LE_PATH = f"{MODEL_DIR}/label_encoder.pkl"
URG_MODEL_PATH = f"{MODEL_DIR}/urgency_classifier.pkl"
URG_LE_PATH = f"{MODEL_DIR}/urgency_label_encoder.pkl"

# Global references for models
models = {}
vader_analyzer = SentimentIntensityAnalyzer()

# Standard English Stopwords (same as train_models.py)
STOPWORDS = set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
    'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
    'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
    'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
    'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that',
    'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd',
    'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
    'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres',
    'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd',
    'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
])

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[^a-z\s]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    tokens = [w for w in text.split() if w not in STOPWORDS and len(w) > 2]
    return ' '.join(tokens)

# Load models on startup
@app.on_event("startup")
def load_models():
    print("Loading NLP models...")
    try:
        if os.path.exists(DEPT_MODEL_PATH):
            models["dept_pipeline"] = joblib.load(DEPT_MODEL_PATH)
            models["dept_le"] = joblib.load(DEPT_LE_PATH)
            print("  - Department classifier loaded.")
        else:
            print("  - WARNING: Department classifier model files missing.")

        if os.path.exists(URG_MODEL_PATH):
            models["urg_pipeline"] = joblib.load(URG_MODEL_PATH)
            models["urg_le"] = joblib.load(URG_LE_PATH)
            print("  - Urgency classifier loaded.")
        else:
            print("  - WARNING: Urgency classifier model files missing.")
    except Exception as e:
        print(f"Error loading models: {e}")

# Helper to load/save JSON database
def load_db() -> List[dict]:
    if not os.path.exists(DATA_FILE):
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w") as f:
            json.dump([], f)
        return []
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_db(data: List[dict]):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

# Request/Response Schemas
class SingleAnalysisRequest(BaseModel):
    text: str = Field(..., min_length=5, description="Raw grievance text written by the citizen.")
    save_to_db: bool = Field(True, description="Whether to save the analyzed grievance into the live dashboard queue.")

class SingleAnalysisResponse(BaseModel):
    id: Optional[str] = None
    narrative: str
    department: str
    urgency: str
    sentiment: float
    dept_confidence: float
    urg_confidence: float
    status: str

class BatchAnalysisRequest(BaseModel):
    complaints: List[str] = Field(..., min_length=1, description="List of raw grievance text narratives.")
    save_to_db: bool = Field(False, description="Whether to save the analyzed grievances into the live dashboard queue.")

class BatchAnalysisResponse(BaseModel):
    total: int
    summary: dict
    results: List[SingleAnalysisResponse]

class StatusUpdateRequest(BaseModel):
    status: str


# API Endpoints
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "models": {
            "department_classifier": "loaded" if "dept_pipeline" in models else "missing",
            "urgency_classifier": "loaded" if "urg_pipeline" in models else "missing",
            "vader_sentiment": "ready"
        }
    }

@app.post("/analyze", response_model=SingleAnalysisResponse)
def analyze_grievance(req: SingleAnalysisRequest):
    cleaned = clean_text(req.text)
    
    # 1. Department Prediction with Fallback
    if "dept_pipeline" in models and "dept_le" in models:
        pred_label = models["dept_pipeline"].predict([cleaned])[0]
        dept = models["dept_le"].inverse_transform([pred_label])[0]
        # Calculate confidence
        dec_func = models["dept_pipeline"].decision_function([cleaned])[0]
        exp_dec = np.exp(dec_func - np.max(dec_func))
        dept_conf = float(np.max(exp_dec / np.sum(exp_dec)))
    else:
        # Simple rule-based department fallback based on keywords
        dept = "Public Safety"
        text_l = req.text.lower()
        if "water" in text_l or "leak" in text_l or "pipe" in text_l:
            dept = "Water Supply"
        elif "power" in text_l or "electricity" in text_l or "light" in text_l or "wire" in text_l:
            dept = "Electricity"
        elif "road" in text_l or "pothole" in text_l or "bus" in text_l or "traffic" in text_l:
            dept = "Roads & Transport"
        elif "garbage" in text_l or "drain" in text_l or "sewage" in text_l or "waste" in text_l:
            dept = "Sanitation"
        dept_conf = 0.500

    # 2. Sentiment Score
    sentiment_val = vader_analyzer.polarity_scores(req.text)['compound']

    # 3. Urgency Prediction with Fallback
    if "urg_pipeline" in models and "urg_le" in models:
        pred_label_u = models["urg_pipeline"].predict([cleaned])[0]
        urgency = models["urg_le"].inverse_transform([pred_label_u])[0]
        prob = models["urg_pipeline"].predict_proba([cleaned])[0]
        urg_conf = float(np.max(prob))
    else:
        # Simple rule-based urgency fallback
        urgency = "Low"
        text_l = req.text.lower()
        # Check Critical Keywords
        if any(w in text_l for w in ['dangerous', 'danger', 'collapse', 'emergency', 'urgent', 'live wire', 'exposed wire', 'fire', 'sewage overflow']):
            urgency = "Critical"
        elif any(w in text_l for w in ['no water', 'no power', 'outage', 'broken', 'accident', 'theft']):
            urgency = "High"
        elif any(w in text_l for w in ['pothole', 'delay', 'slow', 'smell', 'noise', 'issue', 'problem']):
            urgency = "Medium"
        urg_conf = 0.500

    # Status mapping
    urgency_statuses = {
        'Critical': 'Investigating',
        'High': 'Investigating',
        'Medium': 'Pending',
        'Low': 'Resolved'
    }
    status = urgency_statuses.get(urgency, "Pending")

    result = {
        'id': None,
        'narrative': req.text,
        'department': dept,
        'urgency': urgency,
        'sentiment': round(sentiment_val, 3),
        'dept_confidence': round(dept_conf, 3),
        'urg_confidence': round(urg_conf, 3),
        'status': status
    }

    # Save to database if requested
    if req.save_to_db:
        db = load_db()
        new_id = f"GRV-{len(db) + 101:03d}"
        result['id'] = new_id
        
        # Add timestamp
        timestamp = datetime.datetime.now().isoformat()
        db.insert(0, {
            'id': new_id,
            'timestamp': timestamp,
            'narrative': result['narrative'],
            'department': result['department'],
            'urgency': result['urgency'],
            'sentiment': result['sentiment'],
            'dept_confidence': result['dept_confidence'],
            'urg_confidence': result['urg_confidence'],
            'status': result['status']
        })
        save_db(db)

    return result

@app.post("/batch-analyze", response_model=BatchAnalysisResponse)
def analyze_grievances_batch(req: BatchAnalysisRequest):
    results = []
    db = load_db() if req.save_to_db else []
    
    # Track stats for summary
    dept_counts = {}
    urgency_counts = {}
    total_sentiment = 0.0
    
    timestamp = datetime.datetime.now().isoformat()
    
    for text in req.complaints:
        if len(text.strip()) < 5:
            continue
            
        # Run analysis (simulate single call without saving to avoid loading DB multiple times)
        cleaned = clean_text(text)
        
        # Dept prediction
        if "dept_pipeline" in models and "dept_le" in models:
            pred_label = models["dept_pipeline"].predict([cleaned])[0]
            dept = models["dept_le"].inverse_transform([pred_label])[0]
            dec_func = models["dept_pipeline"].decision_function([cleaned])[0]
            exp_dec = np.exp(dec_func - np.max(dec_func))
            dept_conf = float(np.max(exp_dec / np.sum(exp_dec)))
        else:
            dept = "Public Safety"
            text_l = text.lower()
            if "water" in text_l or "leak" in text_l or "pipe" in text_l: dept = "Water Supply"
            elif "power" in text_l or "electricity" in text_l or "light" in text_l or "wire" in text_l: dept = "Electricity"
            elif "road" in text_l or "pothole" in text_l or "bus" in text_l or "traffic" in text_l: dept = "Roads & Transport"
            elif "garbage" in text_l or "drain" in text_l or "sewage" in text_l or "waste" in text_l: dept = "Sanitation"
            dept_conf = 0.500

        # Sentiment
        sentiment_val = vader_analyzer.polarity_scores(text)['compound']
        total_sentiment += sentiment_val

        # Urgency
        if "urg_pipeline" in models and "urg_le" in models:
            pred_label_u = models["urg_pipeline"].predict([cleaned])[0]
            urgency = models["urg_le"].inverse_transform([pred_label_u])[0]
            prob = models["urg_pipeline"].predict_proba([cleaned])[0]
            urg_conf = float(np.max(prob))
        else:
            urgency = "Low"
            text_l = text.lower()
            if any(w in text_l for w in ['dangerous', 'danger', 'collapse', 'emergency', 'urgent', 'live wire', 'exposed wire', 'fire', 'sewage overflow']):
                urgency = "Critical"
            elif any(w in text_l for w in ['no water', 'no power', 'outage', 'broken', 'accident', 'theft']):
                urgency = "High"
            elif any(w in text_l for w in ['pothole', 'delay', 'slow', 'smell', 'noise', 'issue', 'problem']):
                urgency = "Medium"
            urg_conf = 0.500

        status = "Investigating" if urgency in ["Critical", "High"] else ("Pending" if urgency == "Medium" else "Resolved")
        
        dept_counts[dept] = dept_counts.get(dept, 0) + 1
        urgency_counts[urgency] = urgency_counts.get(urgency, 0) + 1
        
        res = {
            'id': None,
            'narrative': text,
            'department': dept,
            'urgency': urgency,
            'sentiment': round(sentiment_val, 3),
            'dept_confidence': round(dept_conf, 3),
            'urg_confidence': round(urg_conf, 3),
            'status': status
        }
        
        if req.save_to_db:
            new_id = f"GRV-{len(db) + 101:03d}"
            res['id'] = new_id
            db.insert(0, {
                'id': new_id,
                'timestamp': timestamp,
                'narrative': res['narrative'],
                'department': res['department'],
                'urgency': res['urgency'],
                'sentiment': res['sentiment'],
                'dept_confidence': res['dept_confidence'],
                'urg_confidence': res['urg_confidence'],
                'status': res['status']
            })
            
        results.append(res)
        
    if req.save_to_db:
        save_db(db)
        
    avg_sentiment = (total_sentiment / len(results)) if results else 0.0
    
    return {
        "total": len(results),
        "summary": {
            "by_department": dept_counts,
            "by_urgency": urgency_counts,
            "average_sentiment": round(avg_sentiment, 3)
        },
        "results": results
    }

@app.get("/grievances")
def get_grievances(
    search: Optional[str] = None, 
    department: Optional[str] = None, 
    urgency: Optional[str] = None
):
    db = load_db()
    
    filtered = db.copy()
    if search:
        search_l = search.lower()
        filtered = [g for g in filtered if search_l in g['narrative'].lower() or search_l in g['id'].lower()]
        
    if department:
        filtered = [g for g in filtered if g['department'] == department]
        
    if urgency:
        filtered = [g for g in filtered if g['urgency'] == urgency]
        
    return filtered

@app.put("/grievances/{id}/status")
def update_grievance_status(id: str, req: StatusUpdateRequest):
    db = load_db()
    for g in db:
        if g['id'] == id:
            g['status'] = req.status
            save_db(db)
            return {"status": "success", "message": f"Updated grievance {id} to {req.status}"}
    raise HTTPException(status_code=404, detail="Grievance not found")


@app.get("/stats")
def get_dashboard_stats():
    db = load_db()
    
    total = len(db)
    if total == 0:
        return {
            "total": 0,
            "by_department": {},
            "by_urgency": {},
            "by_status": {},
            "average_sentiment": 0.0,
            "critical_alerts": 0
        }
        
    dept_counts = {}
    urgency_counts = {}
    status_counts = {}
    total_sentiment = 0.0
    critical_alerts = 0
    
    for g in db:
        dept_counts[g['department']] = dept_counts.get(g['department'], 0) + 1
        urgency_counts[g['urgency']] = urgency_counts.get(g['urgency'], 0) + 1
        status_counts[g['status']] = status_counts.get(g['status'], 0) + 1
        total_sentiment += g['sentiment']
        if g['urgency'] in ['Critical', 'High']:
            critical_alerts += 1
            
    return {
        "total": total,
        "by_department": dept_counts,
        "by_urgency": urgency_counts,
        "by_status": status_counts,
        "average_sentiment": round(total_sentiment / total, 3),
        "critical_alerts": critical_alerts
    }

# Serve Frontend static assets
# Ensure static files directory exists
os.makedirs("static", exist_ok=True)

# Mount /static route for stylesheets, JS files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_index():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
