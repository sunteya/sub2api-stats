# sub2api-stats

A small TypeScript tool for checking account first-token stats from PostgreSQL.

It reads the latest 100 requests for each active account and prints an ASCII table with the account name, request count, average first-token time, and latest request time.

It also includes a request lookup script that shows which account handled a given `request_id` and the specific error captured for that request.

## Local usage

```bash
pnpm install
pnpm tsx list-account-first-token-stats.ts
```

To inspect a single request:

```bash
pnpm request:error -- 908b32d6-1b13-44b0-9065-795d24deaec3
```

Set `DATABASE_URL` in your shell before running the script.

Using `.env` is optional and mainly helpful for deploy or local debugging. You can refer to `.env.example` if needed.

You can start PostgreSQL locally with:

```bash
docker compose up -d
```

## Deploy

If you use `scripts/deploy.sh`, prepare `.env` first. See `.env.example` for the deploy-related values.

You can publish the project with:

```bash
scripts/deploy.sh
```

On the target server, add this service to your Docker Compose file:

```yaml
stats:
  image: guergeiro/pnpm:22-10
  volumes:
    - ./stats:/app
  working_dir: /app
  user: node
  environment:
    - DATABASE_URL=postgres://sub2api:change_this_secure_password@postgres:5432/sub2api
  networks:
    - sub2api-network
  command: sleep infinity
```

Then run:

```bash
docker compose exec stats pnpm tsx list-account-first-token-stats.ts
```
