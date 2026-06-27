import os
import sys
import json
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Allow importing from project root (generator, runner, classifier)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from generator.prompt_generator import generate_prompts, generate_attacks_for_target
from runner.model_runner import probe_models

app = FastAPI()

# ALLOWED_ORIGINS env var: comma-separated list of allowed frontend origins.
# Defaults to localhost for development. Set it in production to your Vercel URL.
_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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

DEFAULT_MODELS = ["groq", "gemini"]


# ── HTTP: Generate system prompt + attacks ─────────────────────────────────────

class GenerateRequest(BaseModel):
    use_case: str
    groq_api_key: str | None = None


class GenerateAttacksRequest(BaseModel):
    behavior_description: str
    groq_api_key: str | None = None


@app.post("/api/generate-attacks")
async def generate_attacks_endpoint(req: GenerateAttacksRequest):
    """
    External Target Mode — generates attack kill chains from a behavior description.
    Returns: { behavior_description, attacks: { category: [step1, step2, step3] } }
    """
    result = await asyncio.to_thread(
        generate_attacks_for_target,
        req.behavior_description,
        req.groq_api_key,
    )
    return result


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    """
    Internal Target Mode — generates victim system prompt + attack kill chains.
    Returns: { use_case, system_prompt, attacks: { category: [step1, step2, step3] } }
    """
    result = await asyncio.to_thread(generate_prompts, req.use_case, req.groq_api_key)
    return result


# ── WebSocket: Run all probes and stream live events ──────────────────────────

@app.websocket("/ws/run")
async def run_probes(websocket: WebSocket):
    """
    Overview mode — runs all 5 attack categories sequentially.

    Expected JSON payload on connect:
      {
        system_prompt: str,
        attacks: { category: [step1, step2, step3] },
        selected_models?: str[],          // default: ["groq", "gemini"]
        max_attempts?: int,               // default: 10
        groq_api_key?: str,
        gemini_api_key?: str,
        openai_api_key?: str,
        anthropic_api_key?: str,
        deepseek_api_key?: str,
      }

    Streamed event types:
      { type: "attempt",       category, model, attempt, attacker_msg }
      { type: "response",      category, model, attempt, model_response, verdict, reason, confidence }
      { type: "category_done", category, results: { model: { verdict, attempt, reason } } }
      { type: "complete",      results: { category: { model: { verdict, attempt, reason, conversation } } } }
      { type: "error",         message }
    """
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        payload = json.loads(raw)
        system_prompt:      str        = payload["system_prompt"]
        attacks:            dict       = payload["attacks"]
        max_attempts:       int        = int(payload.get("max_attempts", 10))
        selected_models:    list[str]  = payload.get("selected_models") or DEFAULT_MODELS
        groq_api_key:       str | None = payload.get("groq_api_key")     or None
        gemini_api_key:     str | None = payload.get("gemini_api_key")   or None
        openai_api_key:     str | None = payload.get("openai_api_key")   or None
        anthropic_api_key:  str | None = payload.get("anthropic_api_key") or None
        deepseek_api_key:   str | None = payload.get("deepseek_api_key") or None
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Invalid payload: {e}"})
        await websocket.close()
        return

    all_results: dict = {}

    async def on_event(event: dict):
        await websocket.send_json(event)

    for category in FAILURE_CATEGORIES:
        if category not in attacks:
            continue

        try:
            results = await probe_models(
                victim_system_prompt=system_prompt,
                kill_chain=attacks[category],
                failure_category=category,
                max_attempts=max_attempts,
                on_event=on_event,
                models=selected_models,
                groq_api_key=groq_api_key,
                gemini_api_key=gemini_api_key,
                openai_api_key=openai_api_key,
                anthropic_api_key=anthropic_api_key,
                deepseek_api_key=deepseek_api_key,
            )
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"{category} failed: {e}"})
            continue

        slim_results = {
            model: {
                "verdict":    data["verdict"],
                "attempt":    data["attempt"],
                "reason":     data["reason"],
                "confidence": data.get("confidence"),
            }
            for model, data in results.items()
        }
        await websocket.send_json({
            "type":     "category_done",
            "category": category,
            "results":  slim_results,
        })

        all_results[category] = results

    await websocket.send_json({"type": "complete", "results": all_results})
    await websocket.close()


# ── WebSocket: Single-category deep probe ─────────────────────────────────────

@app.websocket("/ws/probe")
async def run_single_probe(websocket: WebSocket):
    """
    Deep Probe mode — drills one category with a configurable attempt limit.

    Expected JSON payload on connect:
      {
        system_prompt: str,
        attack_opener: str,
        failure_category: str,
        max_attempts?: int,               // default: 15
        kill_chain?: str[],               // overrides attack_opener if provided
        selected_models?: str[],          // default: ["groq", "gemini"]
        external_config?: { endpoint_url, api_key, model_name },
        groq_api_key?: str,
        gemini_api_key?: str,
        openai_api_key?: str,
        anthropic_api_key?: str,
        deepseek_api_key?: str,
      }
    """
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        payload = json.loads(raw)
        system_prompt:     str           = payload["system_prompt"]
        attack_opener:     str           = payload["attack_opener"]
        failure_category:  str           = payload["failure_category"]
        max_attempts:      int           = int(payload.get("max_attempts", 15))
        kill_chain:        list[str]     = payload.get("kill_chain") or [attack_opener]
        selected_models:   list[str]     = payload.get("selected_models") or DEFAULT_MODELS
        groq_api_key:      str | None    = payload.get("groq_api_key")      or None
        gemini_api_key:    str | None    = payload.get("gemini_api_key")    or None
        openai_api_key:    str | None    = payload.get("openai_api_key")    or None
        anthropic_api_key: str | None    = payload.get("anthropic_api_key") or None
        deepseek_api_key:  str | None    = payload.get("deepseek_api_key")  or None

        # External Target Mode
        external_config_raw: dict | None = payload.get("external_config", None)
        external_config: dict | None = None
        models: list[str] | None = selected_models

        if external_config_raw:
            if not external_config_raw.get("endpoint_url") or not external_config_raw.get("api_key"):
                raise ValueError("external_config requires endpoint_url and api_key")
            external_config = {
                "endpoint_url": external_config_raw["endpoint_url"],
                "api_key":      external_config_raw["api_key"],
                "model_name":   external_config_raw.get("model_name", "gpt-3.5-turbo"),
            }
            models = None  # probe_models forces ["external"] when external_config is set
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Invalid payload: {e}"})
        await websocket.close()
        return

    async def on_event(event: dict):
        await websocket.send_json(event)

    try:
        results = await probe_models(
            victim_system_prompt=system_prompt,
            kill_chain=kill_chain,
            failure_category=failure_category,
            max_attempts=max_attempts,
            on_event=on_event,
            models=models,
            external_config=external_config,
            groq_api_key=groq_api_key,
            gemini_api_key=gemini_api_key,
            openai_api_key=openai_api_key,
            anthropic_api_key=anthropic_api_key,
            deepseek_api_key=deepseek_api_key,
        )
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close()
        return

    await websocket.send_json({"type": "complete", "results": results})
    await websocket.close()
