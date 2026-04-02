# Atman Cloud Consultants — AI Voice Agent

Professional voice-based AI agent for **Atman Cloud Consultants** powered by the Google Gemini Live API. Supports real-time voice conversations in **English**, **Hindi**, and **Marathi** with automatic lead extraction and a dashboard for call analytics.

## Features

- 🎙️ **Real-time Voice Agent** — Bidirectional audio via Gemini Live API
- 🌐 **Multilingual** — English, Hindi, Marathi with language mirroring
- 📊 **Dashboard** — View call logs, extracted lead data, and conversation transcripts
- 🤖 **AI Lead Extraction** — Automatically extracts structured lead info from transcripts
- 💾 **SQLite Database** — Stores conversations and leads locally

## Tech Stack

- **Frontend**: React 19 + Vite + TailwindCSS + Framer Motion
- **Backend**: Express.js + TypeScript (tsx)
- **AI**: Google Gemini Live API (`@google/genai`)
- **Database**: SQLite via `better-sqlite3`

---

## Local Development

### Prerequisites
- **Node.js** v20+
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Start development server
npm run dev
```

The app will be available at **http://localhost:3000**

---

## 🐳 Docker

### Build

```bash
docker build \
  --build-arg GEMINI_API_KEY=your_api_key_here \
  -t atman-voice-agent .
```

### Run

```bash
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_api_key_here \
  atman-voice-agent
```

> **Note**: The API key is needed at **build time** (Vite embeds it in the frontend for the Live API WebSocket) and at **runtime** (server uses it for lead extraction).

---

## ☁️ Deploy to Google Cloud Run

### Prerequisites
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured
- A GCP project with billing enabled
- Cloud Run API and Cloud Build API enabled

### Quick Deploy (Source-based)

This is the simplest approach — Cloud Build will build the Docker image for you:

```bash
# 1. Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 3. Deploy directly from source (builds in the cloud)
gcloud run deploy atman-voice-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --set-env-vars "GEMINI_API_KEY=your_api_key_here" \
  --set-build-env-vars "GEMINI_API_KEY=your_api_key_here"
```

### Alternative: Manual Docker Deploy

```bash
# 1. Set variables
PROJECT_ID=your-project-id
REGION=us-central1
IMAGE=gcr.io/$PROJECT_ID/atman-voice-agent

# 2. Build and push image
docker build --build-arg GEMINI_API_KEY=your_key -t $IMAGE .
docker push $IMAGE

# 3. Deploy to Cloud Run
gcloud run deploy atman-voice-agent \
  --image $IMAGE \
  --region $REGION \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --set-env-vars "GEMINI_API_KEY=your_key"
```

### Using Secret Manager (Recommended for Production)

```bash
# 1. Create the secret
echo -n "your_api_key_here" | gcloud secrets create gemini-api-key --data-file=-

# 2. Deploy with the secret
gcloud run deploy atman-voice-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --set-build-env-vars "GEMINI_API_KEY=your_api_key_here"
```

> ⚠️ **Important**: For the build step, the API key is embedded in the frontend JavaScript bundle (since the browser connects directly to Gemini's WebSocket). For a more secure setup, consider implementing a backend WebSocket proxy.

---

## Project Structure

```
├── server.ts           # Express backend (API routes + production static server)
├── src/
│   ├── App.tsx          # Main React app (voice agent + dashboard tabs)
│   ├── main.tsx         # React entry point
│   ├── index.css        # Global styles + Tailwind
│   ├── components/
│   │   └── Dashboard.tsx # Lead table + call history UI
│   └── services/
│       └── liveService.ts # AudioStreamer + Gemini system instruction
├── Dockerfile           # Multi-stage Docker build
├── .dockerignore        # Docker build context exclusions
├── .env.example         # Environment variable template
├── vite.config.ts       # Vite + Tailwind configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key (build-time + runtime) |
| `NODE_ENV` | Auto | Set to `production` in Docker |
| `PORT` | Auto | Server port (default: 3000) |
