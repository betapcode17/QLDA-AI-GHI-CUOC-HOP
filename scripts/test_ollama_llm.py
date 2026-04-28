import requests

SAMPLE_TRANSCRIPT = "Hom nay chung ta hop ve tien do backend..."

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "qwen2.5:3b"


def call_ollama(prompt: str):
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "stream": False
    }

    res = requests.post(OLLAMA_URL, json=payload)
    res.raise_for_status()
    return res.json()


def main():
    print("🤖 Calling Ollama...")

    prompt = f"""
You are an AI meeting assistant.

Summarize and extract tasks:

{SAMPLE_TRANSCRIPT}

Return JSON:
{{
  "summary": "",
  "tasks": [],
  "decisions": []
}}
"""

    response = call_ollama(prompt)

    print("\n===== RESULT =====")
    print(response["message"]["content"])


if __name__ == "__main__":
    main()