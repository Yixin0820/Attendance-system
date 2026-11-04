# 生产镜像：只放后端 API。前端是纯静态文件，交给 nginx（见 deploy/nginx）。
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai

WORKDIR /app

# 依赖单独一层，改代码时不需要重装依赖
# psycopg 是 PostgreSQL 驱动，只在生产镜像里装（本地 SQLite 开发不需要）
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt && pip install "psycopg[binary]"

COPY . .

# 不用 root 跑服务；uploads 需要可写
RUN useradd --create-home --shell /bin/bash appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

# workers 按 CPU 核数给；学院自用 2~4 个足够
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2} --proxy-headers --forwarded-allow-ips '*'"]
