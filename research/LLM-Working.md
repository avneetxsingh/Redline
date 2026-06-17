# Day 1 — Understanding LLM Fundamentals

## System vs User Prompt
An LLM doesn't actually know the difference between these two. The model reads the System Prompt and the User Prompt as one continuous stream of tokens — there's no hard boundary at the architecture level, just a convention (usually special tokens or formatting) that tells the model "this part came first and should be treated as higher-priority instructions."

The hardware processes the system tokens first, establishing the initial activation state, before the user tokens are appended to that same stream. This is exactly why prompt injection works — if there's no hard enforcement boundary, just a learned convention, that convention can be broken with clever wording.

## Temperature
Think of this as a creativity dial from 0 to 1 (sometimes higher).

At the final layer of the neural network, the model outputs raw numbers called **logits** for every possible token in its vocabulary. Temperature controls how those logits get converted into actual probabilities before a token is sampled.

- **Set to 0:** The model becomes deterministic — it always picks the highest-probability token. Same input, same output, every time.
- **Set to 1 (or higher):** The model becomes a "drunk poet." Lower-probability tokens get a real chance of being selected, so output becomes more random and creative — but also less reliable.

## Prompt Injection
Modifying the model's behavior by exploiting the fact that system and user prompts are read as one continuous stream. If the attacker's wording is convincing enough, the model treats it as a new, higher-priority instruction and overrides its original directive.

**Definition:** Prompt injection is the art of clever wording that tricks an AI into ignoring its original developer instructions and obeying new, attacker-supplied instructions instead.

**Types:**

1. **Direct Prompt Injection (Jailbreaking):** The attacker directly types adversarial or persuasive framing into the prompt to trick the AI into overriding its original instructions (e.g., "ignore all previous instructions and...").

2. **Indirect Prompt Injection (via Web/RAG):** Hidden or invisible text — white-on-white font, zero-pixel text, hidden HTML — embedded in a webpage or document that the AI later retrieves and reads. The model treats the hidden text as a legitimate instruction because it has no way to distinguish "data I'm reading" from "commands I should follow."

3. **Metadata Injection:** Malicious instructions hidden inside file metadata — image EXIF data, HTML attribute cloaking, or SVG/XML blocks — that get parsed and interpreted by the model as text input.

**Note — Prompt Leakage is a related but distinct concept:** Prompt leakage is when an attacker tricks the model into *revealing* its own confidential system prompt, rather than overriding it. The goal is exfiltration of instructions, not behavior change. Worth keeping these separate as failure categories since they test different vulnerabilities.

## Hallucinations
Calling it "lying" is misleading — the model isn't lying, it's functioning exactly as designed. It predicts the statistically most probable next token based on patterns learned during training. There is no internal mechanism that checks the output against real-world truth.

Think of it as a much more sophisticated autocomplete — it suggests the most *likely* continuation, not the most *correct* one. Critically, the model's confidence (token probability) and factual correctness are not the same thing — it can be highly "confident" in a completely false statement because confidence is a measure of statistical likelihood, not truth.

## Async Basics
- **Synchronous (normal Python):** Code waits for each instruction to finish before starting the next one.
- **Asynchronous (async Python):** Code can start multiple operations and let them run concurrently, finishing more work in the same wall-clock time as a single synchronous call.

**Why this matters for Redline:** The tool needs to send adversarial prompts to multiple models (Groq, Gemini, DeepSeek, etc.) at the same time. Running this synchronously — one API call after another — would make testing painfully slow and ruin the user experience as more models are added.

**Quick syntax note:** Instead of `def` with standard `requests` calls, asynchronous functions are declared with `async def`, and network calls are handled concurrently using a library like `aiohttp` instead of `requests`.
