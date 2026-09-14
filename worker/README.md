# worker — graphile-worker and the LISTEN/NOTIFY boot probe

`11-background-jobs.md` §1 · `04-architecture.md` §7.2 · DEC-018 · DEC-034

The only process that will ever hold `service_role`, and only through `SECURITY DEFINER`
functions (invariant 7). **Host-agnostic Docker image** (`worker/Dockerfile`, built from the repo root; DEC-046): it runs locally and in CI, and the production host is chosen at Launch with PR C (OQ-027).

```bash
npm run worker:build                       # tsc → worker/dist
DATABASE_URL=… npm run worker:probe        # boot probe only, exit 0 / 1
DATABASE_URL=… npm run worker:start        # probe, then run
```

`DATABASE_URL` must be a **session-mode** connection — Supabase port **5432**, never the 6543
transaction pooler. The probe refuses to start otherwise. It uses **two** connections (LISTEN on
one, NOTIFY from the other); a one-connection self-notify passes through an idle transaction
pooler and proves nothing — see `src/probe.ts`.

## Proving the probe locally

```bash
supabase start                                     # config.toml enables the local pooler (Supavisor)

# direct, session mode — must pass
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run worker:probe

# Supavisor, transaction mode (host port 54329) — must REFUSE
DATABASE_URL=postgresql://postgres.pooler-dev:postgres@127.0.0.1:54329/postgres npm run worker:probe

# Supavisor, session mode (the pooler's internal 5432, from the Docker network) — must pass
docker run --rm --network supabase_network_kareem-marefa -v "$PWD":/app -w /app \
  -e DATABASE_URL=postgresql://postgres.pooler-dev:postgres@supabase_pooler_kareem-marefa:5432/postgres \
  node:22-slim node worker/dist/index.js --probe-only
```

CI (`.github/workflows/ci.yml`, job `worker`) runs the same two outcomes against Postgres 17
directly and through pgbouncer in transaction mode.

## Enqueue a job by hand

```sql
select graphile_worker.add_job('ping', '{"hello": "world"}');
```

Tasks live in `src/tasks/`, one file per snake_case job name (`11` §2).
