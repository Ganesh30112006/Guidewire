# GigGo Backend Setup (MySQL Workbench)

## 1) Bootstrap environment

### Windows (PowerShell)

```powershell
cd backend
./setup.ps1
```

### Linux/macOS

```bash
cd backend
chmod +x setup.sh
./setup.sh
```

Both scripts:
- create `venv`
- install dependencies
- generate RSA keys
- generate an AES key
- create `.env` from `.env.example` (if missing)

## 2) Prepare MySQL in Workbench

1. Open MySQL Workbench and connect as an admin user.
2. Open and run `backend/db_init_mysql.sql`.
3. Update password in that SQL file before execution.

## 3) Configure backend `.env`

Set the same values you used in Workbench:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=giggo
DB_USER=giggo_user
DB_PASSWORD=your_password
```

Also set:

```env
FIELD_ENCRYPTION_KEY=<64-hex-value>
```

## 4) Start API

```bash
uvicorn app.main:app --reload
```

## 5) Verify DB connectivity

Open:
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/health/db`

Expected DB health response:
- HTTP 200 + `{"status":"ok","database":"connected"}`

If MySQL is unreachable:
- HTTP 503 + `{"status":"error","database":"disconnected"}`
