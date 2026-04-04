$ErrorActionPreference = "Stop"

Write-Host "==> [1/5] Creating virtual environment..."
python -m venv venv

Write-Host "==> [2/5] Activating virtual environment..."
.\venv\Scripts\Activate.ps1

Write-Host "==> [3/5] Installing dependencies..."
pip install -r requirements.txt

Write-Host "==> [4/5] Generating RSA key pair (RS256)..."
New-Item -ItemType Directory -Path keys -Force | Out-Null
$keygenScript = @"
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

private_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
public_key = private_key.public_key()

with open("keys/private.pem", "wb") as f:
    f.write(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )

with open("keys/public.pem", "wb") as f:
    f.write(
        public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

print("RSA keys generated in ./keys")
"@
$tempScriptPath = Join-Path $PWD "_gen_keys.py"
Set-Content -Path $tempScriptPath -Value $keygenScript -NoNewline
python $tempScriptPath
Remove-Item $tempScriptPath -Force

Write-Host "==> [5/5] Generating AES-256 field encryption key..."
$fieldKey = python -c "import secrets; print(secrets.token_hex(32))"
Write-Host "FIELD_ENCRYPTION_KEY=$fieldKey"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example"
}

Write-Host ""
Write-Host "Next steps:"
Write-Host "1) Open .env and set FIELD_ENCRYPTION_KEY to the value above"
Write-Host "2) Set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
Write-Host "3) In MySQL Workbench use same host/port/user/password and default schema"
Write-Host "4) Run: uvicorn app.main:app --reload"
Write-Host "5) Verify: GET /health/db should return status=ok"
