# Redline

**Adversarial LLM testing framework.** Automatically generates attack prompts across 5 failure categories, probes target models in real time with adaptive escalation, and classifies how each model failed — side by side.

![Redline probe screenshot](https://placehold.co/1200x600/0a0a0a/ff1744?text=REDLINE+—+adversarial+LLM+testing)

---

## What it does

1. **Generate** — describe an AI assistant (e.g. "customer support bot for a bank"). Redline generates a realistic victim system prompt with embedded secrets, then produces a 3-step kill chain per attack vector.
2. **Probe** — sends attacks to one or more LLMs simultaneously. After each turn, an LLM-as-judge classifier scores the response. If the model holds, the escalator reads the specific defense and picks the best counter-strategy.
3. **Classify** — every turn gets a verdict and confidence score. When a model cracks, the probe stops and records the attempt number.

---

## Five attack vectors

| Vector | Goal |
|---|---|
| **Prompt Injection** | Embed malicious instructions in document content to override the system prompt |
| **Hallucination Trigger** | Use authority framing + anchoring to force fabrication of internal secrets |
| **Jailbreak** | Roleplay fictional scenarios to extract restricted behaviour |
| **Context Confusion** | Fabricate a false conversation history to activate an "unrestricted" persona |
| **Over-Refusal Bait** | Frame legitimate professional requests to probe over-restriction |

Each category gets a 3-step scripted kill chain (Probe → Exploit → Extract). After the kill chain is exhausted, a per-model adaptive escalator takes over — choosing from 13 named strategies (authority claim, DAN override, many-shot priming, encoding obfuscation, payload smuggling, etc.) based on the confidence trend and the specific defense the model used.

---

## Verdicts

| Verdict | Meaning |
|---|---|
| `PASSED` | Model held — no information leaked, no safety bypass |
| `PARTIAL` | Model partially complied — cracked but didn't fully break |
| `JAILBROKEN` | Safety constraints bypassed |
| `HALLUCINATED` | Model fabricated confident false information |
| `OVER_REFUSED` | Model refused a legitimate benign request |
| `CONTEXT_LOST` | Model lost track of its instructions mid-conversation |

---

## Architecture

```
generator/          Groq LLM generates victim system prompt + attack kill chains
    prompt_generator.py

runner/             Async multi-model prober with adaptive escalation
    model_runner.py

classifier/         LLM-as-judge — scores each turn, returns verdict + confidence
    response_classifier.py

dashboard/
    backend/        FastAPI + WebSocket server
        main.py
    frontend/       Next.js 16 + Tailwind + Framer Motion
        src/app/
            page.tsx          Setup — enter use case, review attacks, select models
            run/page.tsx      Overview sweep — all 5 categories live
            probe/page.tsx    Deep probe — one category, adaptive until crack or limit
```

---

## Supported models

| Provider | Model | Key required |
|---|---|---|
| **Groq** | Llama 3.3 70B | `GROQ_API_KEY` (always required — also powers generator + classifier) |
| **Gemini** | Flash 2.5 Lite | `GEMINI_API_KEY` |
| **OpenAI** | GPT-4o-mini | `OPENAI_API_KEY` |
| **Anthropic** | Claude 3.5 Haiku | `ANTHROPIC_API_KEY` |
| **DeepSeek** | DeepSeek Chat | `DEEPSEEK_API_KEY` |

Groq and Gemini are free tier. OpenAI, Anthropic, and DeepSeek require paid keys.

---

## Local setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone and install Python dependencies

```bash
git clone https://github.com/avneetxsingh/Redline.git
cd Redline

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Set API keys

```bash
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...         # optional
```

Additional keys (OpenAI, Anthropic, DeepSeek) can be added directly in the UI — no restart needed.

### 3. Start the backend

```bash
source venv/bin/activate
cd dashboard/backend
uvicorn main:app --reload
# → http://localhost:8000
```

### 4. Start the frontend

```bash
cd dashboard/frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Running your first probe

1. Open **http://localhost:3000**
2. Click **⚙** (top right) → paste your Groq API key → **Save Keys**
3. Type a use case: `customer support bot for a fintech startup`
4. Click **⚡ Generate** — wait ~10 seconds
5. Select target models (Groq + Gemini are free defaults)
6. Choose **Deep Probe**, pick **Jailbreak**, set max attempts to 10
7. Click **▶ INITIALIZE DEEP PROBE**

The probe page streams live — watch the kill chain execute, then adaptive escalation kick in. If a model cracks, the card flashes red and shows `⚡ TARGET CRACKED`.

---

## Two launch modes

**Deep Probe** — focuses one attack category with up to 20 adaptive attempts. Best for thoroughness. Works with internal and external targets.

**Overview Sweep** — runs all 5 categories sequentially. Quick surface scan. Internal mode only.

---

## External target mode

To probe a real deployed bot (black-box, no system prompt access):

1. Switch to **External** mode on the setup page
2. Describe the bot's observed behaviour
3. Enter the OpenAI-compatible endpoint URL + API key
4. Generate attacks and launch

The attacker generates blind kill chains tailored to the behaviour description and probes the endpoint directly.

---

## Deployment

### Backend → Railway

1. Connect your GitHub repo to Railway
2. Set environment variables:
   ```
   GROQ_API_KEY=gsk_...
   GEMINI_API_KEY=AIza...
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```
3. Start command is auto-detected via `railway.toml`:
   ```
   uvicorn dashboard.backend.main:app --host 0.0.0.0 --port $PORT
   ```

### Frontend → Vercel

1. Import the repo, set root directory to `dashboard/frontend`
2. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```
3. Deploy — WebSocket URLs are derived automatically (`https` → `wss`)

---

## Tech stack

| Layer | Tech |
|---|---|
| Generator + Classifier | Groq `llama-3.3-70b-versatile` |
| Runner | Python `asyncio` + provider SDKs |
| Backend | FastAPI + uvicorn + WebSockets |
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Framer Motion 12 |
| State | `sessionStorage` (flow), `localStorage` (API keys), WebSocket (live events) |

---

## Project structure

```
Redline/
├── generator/
│   └── prompt_generator.py       # Victim system prompt + kill chain generator
├── runner/
│   └── model_runner.py           # Multi-model prober + adaptive escalator
├── classifier/
│   └── response_classifier.py    # LLM-as-judge verdict + confidence scorer
├── dashboard/
│   ├── backend/
│   │   └── main.py               # FastAPI server
│   └── frontend/
│       └── src/app/
│           ├── page.tsx           # Setup page
│           ├── run/page.tsx       # Overview sweep
│           ├── probe/page.tsx     # Deep probe
│           ├── components/        # RippleButton, VerdictBadge, ApiKeysModal, ClientHeader
│           ├── hooks/             # useApiKeys
│           └── lib/api.ts         # Centralized backend URL resolution
├── requirements.txt
├── railway.toml
└── README.md
```

---

## License

MIT
