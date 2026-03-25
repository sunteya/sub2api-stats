SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"

[ -f "$REPO_ROOT/.env" ] || {
    printf '%s\n' "Missing $REPO_ROOT/.env" >&2
    exit 1
}

source "$REPO_ROOT/.env"
cd "$REPO_ROOT" || exit 1

: "${DEPLOY_PORT:?DEPLOY_PORT is required}"
: "${DEPLOY_SERVER:?DEPLOY_SERVER is required}"
: "${DEPLOY_DIR:?DEPLOY_DIR is required}"
: "${DEPLOY_PROXY:=}"

set -x

install_cmd="docker compose run --rm stats pnpm install"

if [ -n "$DEPLOY_PROXY" ]; then
    install_cmd="http_proxy=\"$DEPLOY_PROXY\" https_proxy=\"$DEPLOY_PROXY\" $install_cmd"
fi

server_exec() {
    ssh -p "$DEPLOY_PORT" "$DEPLOY_SERVER" "cd $DEPLOY_DIR && bash -l -c '$1'"
}

git ls-files -z | rsync -e "ssh -p $DEPLOY_PORT" -r -v --files-from=- -0 . "$DEPLOY_SERVER:$DEPLOY_DIR/stats/"
server_exec "chown -R 1000:1000 ./stats"
server_exec "docker compose stop stats"
server_exec "$install_cmd"
server_exec "docker compose up -d"
