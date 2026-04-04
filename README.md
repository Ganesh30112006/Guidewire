# GigGo

AI-powered parametric insurance for gig delivery workers. Protect your income from weather disruptions with instant claims, transparent pricing, and real-time alerts.

## Features

- **Dashboard** — Real-time risk score, trust score, AI income estimation, zone risk, and transparent premium calculation
- **Insurance Plans** — Choose from Basic, Standard, or Premium plans with multi-risk coverage (Rain, Flood, Extreme Heat, Pollution)
- **Smart Claims** — Automatic claim filing when a disruption event is detected; search, filter & paginate claims
- **Alerts & Warnings** — AI-powered disruption predictions with probability bars and community detection
- **Risk Analytics** — Zone risk scores, trend charts, and recent weather events
- **Admin Dashboard** — System-wide metrics, claim volume prediction, and high-risk zone monitoring
- **Auth & Route Protection** — Login/register with validation; protected routes; role-based admin access
- **Dark Mode** — Toggle between light and dark themes

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router v6
- TanStack React Query
- Recharts
- next-themes (dark mode)
- Lucide Icons

## Getting Started

```sh
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Backend Setup (FastAPI + MySQL)

1. Move into the backend folder.
2. Create and activate a virtual environment.
3. Install dependencies.
4. Configure `.env` from `backend/.env.example`.
5. Start the API server.

### Linux/macOS

```sh
cd backend
chmod +x setup.sh
./setup.sh
cp .env.example .env
uvicorn app.main:app --reload
```

### Windows (PowerShell)

```powershell
cd backend
./setup.ps1
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

## MySQL Workbench Connection

Use the same values in MySQL Workbench and in `backend/.env`:

- Hostname: `DB_HOST`
- Port: `DB_PORT`
- Username: `DB_USER`
- Password: `DB_PASSWORD`
- Default schema: `DB_NAME`

Example `.env` values:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=giggo
DB_USER=giggo_user
DB_PASSWORD=your_password
```

If your password contains special characters, backend URL encoding is handled automatically.

### Verify Backend-DB Connectivity

After starting the backend, open:

- `GET /health` for API status
- `GET /health/db` for MySQL connectivity

`/health/db` returns:

- `200` when MySQL is connected
- `503` when MySQL is not reachable

## Demo Credentials

| Role   | Email                | Password   |
| ------ | -------------------- | ---------- |
| Worker | rahul@email.com      | password   |
| Admin  | admin@giggo.ai   | admin123   |

Any other email/password combination will create a worker account.

## Adversarial Defense & Anti-Spoofing Strategy (Phase 1: Market Crash)

Scenario: A coordinated fraud ring uses fake GPS traces and synchronized claims to drain payouts. Our defense assumes GPS can be forged and therefore never treats location as a single source of truth.

Requirement mapping for Phase 1:

- Differentiation: Explain how AI/ML separates genuinely stranded workers from spoofers.
- Data: List specific non-GPS signals used to detect coordinated fraud.
- UX Balance: Describe how flagged claims are handled without unfairly punishing honest workers.

### 1) Threat Model

- Adversary profile: Individual spoofers and colluding groups (hundreds of accounts), some with valid-looking histories.
- Primary attack paths: GPS spoofing apps, emulator/device farms, account takeover, synthetic route replay, claim timing coordination.
- Goal of attacker: Maximize approved payouts before controls react.

### 2) Core Defense Principle: Multi-Signal Trust, Not GPS-Only

Every claim is evaluated with independent signals from four layers:

- Identity and account integrity
- Device and session integrity
- Mobility and route plausibility
- Network and graph-level coordination patterns

We approve quickly only when signals are mutually consistent. We slow down or challenge when they conflict.

AI/ML architecture logic:

- Claim-level risk model: scores per-claim spoof probability from mobility, device, and account features.
- Ring-level graph model: scores cluster-level collusion risk using shared infrastructure and synchronized behavior.
- Final decision policy: combines claim risk, ring risk, disruption severity, and worker reputation into one action tier (fast approve, conditional approve, challenge, hold, reject).

### 3) How We Spot a Faker vs. a Genuinely Stranded Worker

High-confidence faker indicators (single strong or multiple moderate indicators):

- Impossible mobility: sudden long jumps, unrealistic acceleration, repeated teleport patterns.
- Synthetic location traces: perfectly smooth or repeated coordinate shapes across different users/devices.
- Device anomalies: emulator fingerprints, unstable device identifiers, impossible sensor combinations.
- Session inconsistency: mismatch between recent operating behavior and claim-time behavior.

Genuine stranded worker indicators:

- Trajectory is physically plausible but disrupted by external conditions (weather, congestion, event spikes).
- Historical behavior consistency: prior delivery rhythm, route familiarity, and account stability align with claim context.
- Corroboration from nearby independent workers and external event signals.
- No evidence of coordinated timing or shared spoofing infrastructure.

Decision logic:

- High trust + high disruption evidence -> instant/fast approval.
- Mixed trust + strong disruption evidence -> conditional approval with post-audit.
- Low trust + spoof/collusion evidence -> hold, challenge, or reject.

This directly addresses Differentiation by requiring both physical plausibility and independent corroboration, not location alone.

### 3A) Data Beyond Basic GPS (Ring-Fraud Detection Inputs)

Specific data points analyzed beyond coordinates:

- Device integrity: emulator/root/jailbreak indicators, sensor availability consistency, app attestation outcomes.
- Session telemetry: login velocity, token churn, unusual session resets, sudden client fingerprint changes.
- Network signals: IP ASN type, proxy/VPN likelihood, shared IP/device neighborhoods across accounts.
- Mobility physics: speed/acceleration realism, heading jitter patterns, stop-start cadence, map-matching confidence.
- Route semantics: pickup/dropoff feasibility, ETA deviation behavior, repeated synthetic route templates.
- Temporal behavior: claim-time bunching, payout-window bursts, repeated cadence signatures.
- Social/graph links: account co-movement, shared infrastructure edges, ring expansion from newly activated accounts.
- External corroboration: weather severity feeds, traffic disruptions, nearby independent-worker consistency.

These features are fused to detect both individual spoofing and coordinated fraud rings.

### 4) Ring Detection: What Catches Coordinated Fraud

We model fraud as a graph problem, not only an account problem.

- Shared infrastructure links: common device signatures, IP clusters, network fingerprints.
- Temporal coordination: bursts of near-simultaneous claims around payout windows.
- Geospatial coordination: many users claiming the same micro-zone with statistically improbable trace similarity.
- Behavioral cloning: repeated playbooks (same claim sequence, same evidence style, same timing cadence).
- Ring expansion signals: newly created or dormant accounts suddenly linked to known suspicious clusters.

When cluster risk exceeds threshold, we rate-limit approvals at cluster level and escalate all linked claims for enhanced verification.

### 5) False Positive Control (Do Not Punish Honest Workers)

Fairness is a hard requirement. We separate friction from denial:

- Step-up verification before rejection: lightweight challenge, additional proof request, delayed payout window.
- Grace policies for high-reputation workers when disruption context is strong.
- Human-in-the-loop review for borderline cases and high-impact outcomes.
- Reversible decisions: temporary holds first, permanent sanctions only after repeated high-confidence abuse.
- Transparent appeal path with SLA-driven resolution.

### 5A) UX Balance for Flagged Claims

Workflow for a flagged claim is progressive, not punitive:

- Stage 1: Soft flag -> payout timer extension + unobtrusive in-app notice.
- Stage 2: Step-up check -> minimal extra proof only when risk remains ambiguous.
- Stage 3: Manual review lane -> priority review for high-reputation workers or severe-weather contexts.
- Stage 4: Final action -> release, partial hold with reason, or reject with appeal path and clear evidence summary.

Worker trust protections:

- No immediate account bans on first suspicious event.
- Reputation-aware friction: lower friction for historically reliable workers.
- Time-bound holds with automatic re-evaluation when new corroborating evidence arrives.

### 6) Response Playbook During a Live Attack

- Detect: Monitor anomaly spikes in claim volume, cluster density, and payout velocity.
- Contain: Apply dynamic throttles to suspicious cohorts and regions.
- Triage: Prioritize high-confidence honest claims for service continuity.
- Investigate: Run cluster-level forensic checks and evidence enrichment.
- Recover: Release valid held claims, sanction confirmed bad actors, and update detection thresholds.

### 7) Success Metrics

- Fraud loss prevented (absolute and percentage of attempted drain).
- Precision/recall on confirmed fraud cohorts.
- False-positive rate and appeal overturn rate.
- Median payout time for legitimate disrupted workers.
- Mean time to detect and contain ring attacks.

### 8) Why This Survives Market Crash Conditions

- It is adversary-aware: assumes attackers adapt and rotate tactics.
- It is ring-aware: catches coordinated behavior, not just isolated anomalies.
- It is worker-safe: protects liquidity without blanket denial.
- It is operationally realistic: supports 24-hour rapid response with progressive controls.

Submission note: This section is the no-code architecture logic for Phase 1 (Market Crash) and is intended to be included in the repository README before the deadline.
