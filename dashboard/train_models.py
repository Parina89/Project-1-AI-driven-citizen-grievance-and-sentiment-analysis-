import os
import re
import random
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Seed for reproducibility
random.seed(42)
np.random.seed(42)

# Ensure directories exist
os.makedirs("models", exist_ok=True)
os.makedirs("data", exist_ok=True)

print("--- Generating Synthetic Dataset ---")

templates = {
    'Water Supply': [
        'Water supply is completely cut off in our area for {n} days.',
        'The tap water has a foul smell and brown color, undrinkable.',
        'Low water pressure makes it impossible to shower or cook.',
        'No running water since {n} days. Residents are struggling.',
        'Water leakage from the main pipeline is wasting thousands of liters.',
        'Contaminated water supply is causing illness in the neighborhood.',
        'Water connection has been disconnected without prior notice.',
        'Water tanker has not arrived for {n} days despite repeated requests.',
    ],
    'Electricity': [
        'Power outage for {n} hours with no communication from the utility.',
        'Frequent voltage fluctuations are damaging home appliances.',
        'Street lights in sector {n} have not been working for weeks.',
        'Electric pole is dangerously tilted and could collapse any time.',
        'Electricity bill is extremely high despite low consumption this month.',
        'Transformer has blown in our colony. No power since {n} days.',
        'Live wire is exposed near the playground, risk to children.',
        'Power cut during exam season is affecting students badly.',
    ],
    'Roads & Transport': [
        'Massive potholes on main road have damaged several vehicles.',
        'The road has not been repaired despite {n} complaints filed.',
        'No footpath available. Pedestrians are forced to walk on the road.',
        'Bus route {n} has been cancelled without any announcement.',
        'Road digging completed but surface is not restored. Dangerous for bikes.',
        'Traffic signal at the main junction is not functioning.',
        'Overflowing drain is blocking the road and causing waterlogging.',
        'No speed breaker near the school zone. Accidents are frequent.',
    ],
    'Sanitation': [
        'Garbage has not been collected for {n} days. Stench is unbearable.',
        'Open drain next to residential area is a major health hazard.',
        'Sanitation workers are not cleaning the public toilets regularly.',
        'Waste dumped near park is attracting rats and stray animals.',
        'Sewage overflow on the main street. Urgent action required.',
        'Community dustbin is overflowing and spreading disease.',
        'Dead animals not removed from the street for {n} days.',
        'Illegal dumping of construction debris on public land.',
    ],
    'Public Safety': [
        'Street lights are not working. Area is unsafe at night.',
        'Frequent theft incidents in sector {n}. Need police patrol.',
        'Stray dogs are attacking children near the school.',
        'Loud noise and anti-social activity near residential colony.',
        'Illegal construction blocking the emergency access road.',
        'No CCTV cameras installed despite repeated demands.',
        'Drug peddling activity openly happening near the park.',
        'Speeding vehicles are a daily danger on the inner road.',
    ],
}

rows = []
for dept, phrases in templates.items():
    for _ in range(250):
        phrase = random.choice(phrases).format(n=random.randint(2, 15))
        rows.append({'narrative': phrase, 'product': dept})

df = pd.DataFrame(rows).sample(frac=1, random_state=42).reset_index(drop=True)

# Standard English Stopwords list
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
    # Remove stopwords and short words
    tokens = [w for w in text.split() if w not in STOPWORDS and len(w) > 2]
    return ' '.join(tokens)

print("Cleaning text narratives...")
df['processed_text'] = df['narrative'].apply(clean_text)

# Initialize VADER
analyzer = SentimentIntensityAnalyzer()

print("Calculating VADER sentiment scores...")
df['vader_compound'] = df['narrative'].apply(lambda t: analyzer.polarity_scores(t)['compound'])

# Urgency Keywords
CRITICAL_KEYWORDS = [
    'dangerous', 'danger', 'collapse', 'emergency', 'urgent', 'life', 'death', 'die',
    'dying', 'fatal', 'attack', 'attacking', 'injured', 'injury', 'accident',
    'electrocute', 'fire', 'flood', 'live wire', 'exposed wire', 'child', 'children',
    'school', 'hospital', 'disease', 'illness', 'contaminate', 'contaminated',
    'sewage overflow', 'poison', 'toxic', 'gas leak'
]
HIGH_KEYWORDS = [
    'no water', 'no power', 'power cut', 'outage', 'cut off', 'broken',
    'not working', 'failed', 'failure', 'damage', 'damaged', 'repeated',
    'harassment', 'theft', 'stolen', 'crime', 'illegal', 'overflow',
    'stench', 'unbearable', 'hazard', 'health hazard', 'rats', 'no response'
]
MEDIUM_KEYWORDS = [
    'pothole', 'delay', 'slow', 'inconvenient', 'not cleaned', 'smell',
    'noise', 'complaint', 'issue', 'problem', 'request', 'pending',
    'fluctuation', 'low pressure', 'no footpath', 'no signal'
]

def assign_urgency(row):
    text_l = str(row['narrative']).lower()
    compound = row['vader_compound']
    if any(kw in text_l for kw in CRITICAL_KEYWORDS):
        return 'Critical'
    if any(kw in text_l for kw in HIGH_KEYWORDS) or compound <= -0.6:
        return 'High'
    if any(kw in text_l for kw in MEDIUM_KEYWORDS) or compound <= -0.2:
        return 'Medium'
    return 'Low'

df['urgency_label'] = df.apply(assign_urgency, axis=1)

# Save processed grievances
df.to_csv("processed_grievances.csv", index=False)
print("Saved processed_grievances.csv")

# Train Department Classifier
print("\n--- Training Department Classifier (TF-IDF + Linear SVM) ---")
dept_le = LabelEncoder()
df['dept_label'] = dept_le.fit_transform(df['product'])

X_train, X_test, y_train, y_test = train_test_split(
    df['processed_text'], df['dept_label'], test_size=0.2, random_state=42, stratify=df['dept_label']
)

dept_pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=10000, sublinear_tf=True, min_df=2)),
    ('clf', LinearSVC(C=1.0, max_iter=2000, random_state=42))
])

dept_pipeline.fit(X_train, y_train)
dept_score = dept_pipeline.score(X_test, y_test)
print(f"Department Routing Model trained. Test Accuracy: {dept_score:.4f}")

# Save Department models
joblib.dump(dept_pipeline, "models/best_department_classifier.pkl")
joblib.dump(dept_le, "models/label_encoder.pkl")
print("Saved best_department_classifier.pkl and label_encoder.pkl")

# Train Urgency Classifier
print("\n--- Training Urgency Classifier (TF-IDF + Logistic Regression) ---")
urg_le = LabelEncoder()
df['urg_label'] = urg_le.fit_transform(df['urgency_label'])

X_train_u, X_test_u, y_train_u, y_test_u = train_test_split(
    df['processed_text'], df['urg_label'], test_size=0.2, random_state=42, stratify=df['urg_label']
)

urg_pipeline = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=10000, sublinear_tf=True, min_df=2)),
    ('clf', LogisticRegression(max_iter=1000, C=1.0, class_weight='balanced', random_state=42))
])

urg_pipeline.fit(X_train_u, y_train_u)
urg_score = urg_pipeline.score(X_test_u, y_test_u)
print(f"Urgency Scoring Model trained. Test Accuracy: {urg_score:.4f}")

# Save Urgency models
joblib.dump(urg_pipeline, "models/urgency_classifier.pkl")
joblib.dump(urg_le, "models/urgency_label_encoder.pkl")
print("Saved urgency_classifier.pkl and urgency_label_encoder.pkl")


# Generate seed grievances JSON database
print("\n--- Seeding grievances.json Database ---")
seed_size = 50
sample_df = df.sample(n=seed_size, random_state=42).reset_index(drop=True)
grievances = []

urgency_statuses = {
    'Critical': 'Investigating',
    'High': 'Investigating',
    'Medium': 'Pending',
    'Low': 'Resolved'
}

start_date = pd.Timestamp('2026-06-01')
for i, row in sample_df.iterrows():
    # Generate a random timestamp in the last 10 days
    rand_offset = random.randint(0, 9)
    rand_hour = random.randint(0, 23)
    rand_min = random.randint(0, 59)
    date_val = start_date + pd.Timedelta(days=rand_offset, hours=rand_hour, minutes=rand_min)
    
    # Calculate confidence (simulated for SVM using decision_function, actual for Logistic Regression)
    # Department confidence
    dec_func = dept_pipeline.decision_function([row['processed_text']])[0]
    # softmax approximation for confidence
    exp_dec = np.exp(dec_func - np.max(dec_func))
    dept_conf = float(np.max(exp_dec / np.sum(exp_dec)))
    
    # Urgency confidence
    prob = urg_pipeline.predict_proba([row['processed_text']])[0]
    urg_conf = float(np.max(prob))
    
    grievances.append({
        'id': f"GRV-{i+101:03d}",
        'timestamp': date_val.strftime("%Y-%m-%dT%H:%M:%S"),
        'narrative': row['narrative'],
        'department': row['product'],
        'urgency': row['urgency_label'],
        'sentiment': round(float(row['vader_compound']), 3),
        'dept_confidence': round(dept_conf, 3),
        'urg_confidence': round(urg_conf, 3),
        'status': urgency_statuses[row['urgency_label']]
    })

# Sort grievances by timestamp (newest first)
grievances.sort(key=lambda x: x['timestamp'], reverse=True)

with open("data/grievances.json", "w") as f:
    json.dump(grievances, f, indent=2)
print("Saved data/grievances.json with 50 seed records.")

print("\nTraining completed successfully!")
