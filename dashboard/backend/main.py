import os
import sys
import json
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Allow importing from project root (generator, runner, classifier)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from generator.prompt_generator import generate_prompts
from runner.model_runner import probe_models

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FAILURE_CATEGORIES = [
    "prompt_injection",
    "hallucination_trigger",
    "jailbreak",
    "context_confusion",
    "over_refusal_bait",
]


# ── HTTP: Generate system prompt + attacks ────────────────────────────────────

class GenerateRequest(BaseModel):
    use_case: str


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """
    Calls the generator and returns:
      { use_case, system_prompt, attacks: { category: opening_message } }
    """
    result = await asyncio.to_thread(generate_prompts, req.use_case)
    return result


# ── WebSocket: Run all probes and stream live events ─────────────────────────

@app.websocket("/ws/run")
async def run_probes(websocket: WebSocket):
    """
    Expects a JSON payload on connect:
      { system_prompt: str, attacks: { category: opening_message } }

    Streams events back as JSON:
      { type: "attempt",  category, model, attempt, attacker_msg }
      { type: "response", category, model, attempt, model_response, verdict, reason }
      { type: "category_done", category, results: { model: { verdict, attempt, reason } } }
      { type: "complete",  results: { category: { model: { verdict, attempt, reason, conversation } } } }
      { type: "error", message }
    """
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        payload = json.loads(raw)
        system_prompt: str = payload["system_prompt"]
        attacks: dict = payload["attacks"]
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Invalid payload: {e}"})
        await websocket.close()
        return

    all_results: dict = {}

    async def on_event(event: dict):
        await websocket.send_json(event)

    # Run each failure category sequentially so the frontend can track per-category progress.
    # Each category's probe_models call is itself concurrent across models.
    for category in FAILURE_CATEGORIES:
        if category not in attacks:
            continue

        try:
            results = await probe_models(
                victim_system_prompt=system_prompt,
                kill_chain=attacks[category],
                failure_category=category,
                on_event=on_event,
            )
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"{category} failed: {e}"})
            continue

        # Strip full conversation from the category_done event to keep it lightweight
        slim_results = {
            model: {
                "verdict": data["verdict"],
                "attempt": data["attempt"],
                "reason": data["reason"],
            }
            for model, data in results.items()
        }
        await websocket.send_json({
            "type": "category_done",
            "category": category,
            "results": slim_results,
        })

        all_results[category] = results

    # Final complete event — includes full conversations for the results page
    await websocket.send_json({"type": "complete", "results": all_results})
    await websocket.close()
