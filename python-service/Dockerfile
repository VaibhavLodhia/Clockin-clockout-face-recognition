FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# System deps for dlib + runtime libs for opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    build-essential \
    git \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first to leverage Docker cache
COPY requirements.txt /app/requirements.txt
# Prebuilt dlib wheel to avoid compiling in HF Spaces
RUN pip install --no-cache-dir dlib-bin==19.24.2.post1 \
  && pip install --no-cache-dir face-recognition==1.3.0 --no-deps \
  && pip install --no-cache-dir -r /app/requirements.txt

# Copy app
COPY . /app

RUN useradd -m -u 1000 user && chown -R user:user /app
USER user

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:7860/ || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
