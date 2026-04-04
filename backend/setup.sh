#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# GigGo Backend — Quick start script
# ─────────────────────────────────────────────────────────────────
set -e

echo "==> [1/4] Creating virtual environment..."
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

echo "==> [2/4] Installing dependencies..."
pip install -r requirements.txt

echo "==> [3/4] Generating RSA key pair (RS256)..."
mkdir -p keys
openssl genrsa -out keys/private.pem 4096
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
chmod 600 keys/private.pem
echo "     RSA keys generated in ./keys/"

echo "==> [4/4] Generating AES-256 field encryption key..."
FIELD_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
echo "     FIELD_ENCRYPTION_KEY=$FIELD_KEY"

if [ ! -f .env ]; then
	cp .env.example .env
	echo ""
	echo "Created .env from .env.example"
fi

echo ""
echo "Next steps:"
echo "1) Open .env and set FIELD_ENCRYPTION_KEY to the value above"
echo "2) Set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
echo "3) In MySQL Workbench use the same host/port/user/password and default schema"
echo "4) Run: uvicorn app.main:app --reload"
echo "5) Verify: GET /health/db should return status=ok"
