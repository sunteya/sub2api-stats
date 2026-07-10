# sub2api-stats

A Nuxt administration site for Sub2API user management, account statistics, and request-error lookup.

## Web page

Start the Nuxt web server locally with:

```bash
pnpm dev
```

Then open `http://localhost:3000` to access the user list, account statistics, and request lookup pages.

Daily top-up settings are read from `settings.yml` in the project root. The `daily_balance_top_up.users` map uses email addresses as keys and target balances as values:

```yaml
daily_balance_top_up:
  last_run_date: ''
  users:
    zhunm@ll100.com: 180
    zhuyl@ll100.com: 120
```

The user list displays amounts as `balance / daily amount`, such as `18 / 180`. Use the per-user `设置每日金额` button in the user list to edit one user's daily amount. Use `重置每日额度` to manually top up only that user when their balance is below the configured daily amount; balances at or above the daily amount are left unchanged.

The server runs a daily balance top-up task at `00:00`. On startup, it also runs once if `daily_balance_top_up.last_run_date` is not today's `Asia/Shanghai` date. For each listed user whose balance is below the configured target, it adds `Math.ceil(target - balance)` through the sub2api admin balance API. Users already at or above the target are skipped.

Set `TZ=Asia/Shanghai` in the deployment environment so the scheduled task fires at China midnight.

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
    - TZ=Asia/Shanghai
  networks:
    - sub2api-network
  command: sleep infinity
```
