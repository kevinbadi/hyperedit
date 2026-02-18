#!/usr/bin/env python3
"""
Local Whisper transcription script with word-level timestamps.
Usage: python3 whisper-transcribe.py <audio_file> [model_size]
Output: JSON with transcript and word timestamps
"""

import sys
import json
import io
import contextlib

# Suppress Whisper's stdout output (like "Detected language: English")
@contextlib.contextmanager
def suppress_stdout():
    """Temporarily redirect stdout to suppress Whisper's print statements."""
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        yield
    finally:
        sys.stdout = old_stdout

import whisper

def transcribe(audio_path, model_size="base"):
    """Transcribe audio file with word-level timestamps."""

    # Load model (will download on first use)
    # Models: tiny, base, small, medium, large
    # base is a good balance of speed and accuracy
    # Note: MPS (Apple GPU) doesn't work with Whisper's sparse tensors, so we use CPU
    print(f"Loading Whisper model '{model_size}'...", file=sys.stderr)
    model = whisper.load_model(model_size)

    print(f"Transcribing {audio_path}...", file=sys.stderr)

    # Suppress Whisper's "Detected language" output
    with suppress_stdout():
        result = model.transcribe(
            audio_path,
            word_timestamps=True,
            verbose=False
        )

    # Extract word-level timestamps
    words = []
    for segment in result.get("segments", []):
        for word_info in segment.get("words", []):
            words.append({
                "text": word_info["word"].strip(),
                "start": round(word_info["start"], 3),
                "end": round(word_info["end"], 3)
            })

    output = {
        "text": result.get("text", "").strip(),
        "words": words,
        "language": result.get("language", "en")
    }

    # Output JSON to stdout
    print(json.dumps(output))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 whisper-transcribe.py <audio_file> [model_size]", file=sys.stderr)
        sys.exit(1)

    audio_file = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    try:
        transcribe(audio_file, model_size)
    except Exception as e:
        error_msg = str(e)
        print(f"Error: {error_msg}", file=sys.stderr)
        print(json.dumps({"error": error_msg}))
        sys.exit(1)
