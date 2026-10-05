# ENG PDF Toolkit – works on Hugging Face Spaces (Docker), Render, Cloud Run, Railway, any VPS
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      ghostscript tesseract-ocr tesseract-ocr-eng tesseract-ocr-ben tesseract-ocr-hin tesseract-ocr-ara \
      chromium fonts-noto-core fonts-noto-cjk fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs containers as user 1000
RUN useradd -m -u 1000 user && mkdir -p /home/user/app /data && chown -R user:user /home/user/app /data
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --user -r requirements.txt
COPY --chown=user . .
RUN mkdir -p data

ENV HOST=0.0.0.0 PORT=7860 MAX_UPLOAD_MB=50 MAX_CONCURRENT_TOOLS=1 SERVER_THREADS=4 COOKIE_SECURE=1 DATA_DIR=/data SQLITE_JOURNAL_MODE=DELETE
EXPOSE 7860
CMD ["python", "app.py"]
