import ollama, json

MODEL = "qwen2.5:7b-instruct"   # or "llama3.2:3b"

resp = ollama.chat(
    model=MODEL,
    format="json",              # forces valid JSON output — critical for small models
    messages=[{"role": "user", "content":
        'Return JSON: {"topic_label": "...", "one_liner": "..."} for a conversation '
        'where a student asks how to center a div and gets a flexbox answer.'}],
    options={"temperature": 0.2},
)
print(json.loads(resp["message"]["content"]))