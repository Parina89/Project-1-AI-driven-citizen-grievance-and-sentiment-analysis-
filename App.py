import streamlit as st
import pandas as pd
import plotly.express as px
from textblob import TextBlob
from wordcloud import WordCloud
import matplotlib.pyplot as plt

# ----------------------------
# PAGE CONFIG
# ----------------------------
st.set_page_config(
    page_title="AI Citizen Grievance Analysis",
    page_icon="",
    layout="wide"
)

st.title(" AI-Driven Citizen Grievance & Sentiment Analysis")
st.markdown("Analyze citizen complaints and identify public sentiment trends.")

# ----------------------------
# LOAD DATA
# ----------------------------
@st.cache_data
def load_data():
    df = pd.read_csv("complaints.csv")
    df = df[['product', 'narrative']]
    df.dropna(inplace=True)
    return df

df = load_data()

# ----------------------------
# SIDEBAR
# ----------------------------
st.sidebar.header("Filters")

products = st.sidebar.multiselect(
    "Select Complaint Category",
    options=sorted(df['product'].unique()),
    default=[]
)

filtered_df = df.copy()

if products:
    filtered_df = filtered_df[
        filtered_df['product'].isin(products)
    ]

# ----------------------------
# DATA OVERVIEW
# ----------------------------
st.subheader(" Dataset Overview")

col1, col2 = st.columns(2)

with col1:
    st.metric("Total Complaints", len(filtered_df))

with col2:
    st.metric(
        "Complaint Categories",
        filtered_df['product'].nunique()
    )

st.dataframe(filtered_df.head(10))

# ----------------------------
# CATEGORY DISTRIBUTION
# ----------------------------
st.subheader(" Complaint Category Distribution")

category_count = (
    filtered_df['product']
    .value_counts()
    .reset_index()
)

category_count.columns = ['Category', 'Count']

fig = px.bar(
    category_count,
    x='Category',
    y='Count',
    color='Count',
    title='Complaint Categories'
)

st.plotly_chart(fig, use_container_width=True)

# ----------------------------
# SENTIMENT ANALYSIS
# ----------------------------
st.subheader(" Sentiment Analysis")

def get_sentiment(text):
    polarity = TextBlob(str(text)).sentiment.polarity

    if polarity > 0:
        return "Positive"
    elif polarity < 0:
        return "Negative"
    else:
        return "Neutral"

sample_size = min(5000, len(filtered_df))

sample_df = filtered_df.sample(sample_size)

sample_df['Sentiment'] = sample_df['narrative'].apply(get_sentiment)

sentiment_count = (
    sample_df['Sentiment']
    .value_counts()
    .reset_index()
)

sentiment_count.columns = ['Sentiment', 'Count']

fig2 = px.pie(
    sentiment_count,
    names='Sentiment',
    values='Count',
    title='Sentiment Distribution'
)

st.plotly_chart(fig2, use_container_width=True)

# ----------------------------
# WORD CLOUD
# ----------------------------
# st.subheader(" Common Grievance Keywords")

# text = " ".join(
#     filtered_df['narrative'].astype(str).tolist()[:10000]
# )

# wordcloud = WordCloud(
#     width=1000,
#     height=500,
#     background_color='white'
# ).generate(text)

# fig3, ax = plt.subplots(figsize=(12,6))
# ax.imshow(wordcloud, interpolation='bilinear')
# ax.axis("off")

# st.pyplot(fig3)

# ----------------------------
# COMPLAINT SEARCH
# ----------------------------
# st.subheader(" Search Complaints")

# search_text = st.text_input(
#     "Enter keyword"
# )

# if search_text:
#     result = filtered_df[
#         filtered_df['narrative']
#         .str.contains(search_text,
#                       case=False,
#                       na=False)
#     ]

#     st.write(f"Found {len(result)} complaints")
#     st.dataframe(result.head(20))

# ----------------------------
# AI COMPLAINT ANALYZER
# ----------------------------
st.subheader(" AI Complaint Analyzer")

user_text = st.text_area(
    "Enter a citizen complaint"
)

if st.button("Analyze Complaint"):

    if user_text:

        polarity = TextBlob(user_text).sentiment.polarity

        if polarity > 0:
            sentiment = "Positive"
        elif polarity < 0:
            sentiment = "Negative"
        else:
            sentiment = "Neutral"

        st.success(f"Sentiment: {sentiment}")

        # Simple category prediction
        categories = df['product'].value_counts().index.tolist()

        predicted = categories[0]

        st.info(
            f"Likely Complaint Category: {predicted}"
        )

        st.write("Complaint Text:")
        st.write(user_text)

# ----------------------------
# RAW DATA
# ----------------------------
with st.expander("View Full Dataset"):
    st.dataframe(filtered_df)