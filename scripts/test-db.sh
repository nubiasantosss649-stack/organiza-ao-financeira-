#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica o stub do Supabase + migrações e roda
# os testes de banco (RLS, isolamento de dados e limites de plano).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${TEST_PG_PORT:-54329}"

if [ "$(id -u)" = "0" ]; then
  echo "Executando como root: usando o usuário 'postgres' para o cluster temporário."
  chown -R postgres "$TMP"
  RUN=(su postgres -c)
else
  RUN=(bash -c)
fi

cleanup() {
  "${RUN[@]}" "'$PG_BIN/pg_ctl' -D '$TMP/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"${RUN[@]}" "'$PG_BIN/initdb' -D '$TMP/data' -U postgres -A trust >/dev/null"
"${RUN[@]}" "'$PG_BIN/pg_ctl' -D '$TMP/data' -o '-p $PORT -k $TMP -c listen_addresses=127.0.0.1' -l '$TMP/log' -w start >/dev/null"

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database controle_facil_test"
"${PSQL[@]}" -d controle_facil_test -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d controle_facil_test -f "$f"
done

export TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/controle_facil_test"
cd "$ROOT"
npx vitest run tests/db "$@"
