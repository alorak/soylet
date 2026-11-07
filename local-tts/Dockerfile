# P1 standalone build context: ./upstream at a pinned, verified Git commit.
# Copies the complete Python package before pip install; upstream's layered Dockerfile
# currently installs before copying vendored sources/licence files.
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip libsndfile1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

WORKDIR /app
COPY pyproject.toml README.md LICENSE tts_config.json ./
COPY src/ ./src/

# CUDA 12.1 wheels. Install complete package after all source and Apache notices are in place.
RUN pip install --no-cache-dir torch==2.5.1 torchaudio==2.5.1 \
      --index-url https://download.pytorch.org/whl/cu121 \
    && pip install --no-cache-dir .

EXPOSE 8000
VOLUME ["/cache/huggingface"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health').read()"

CMD ["turkish-tts-server"]
