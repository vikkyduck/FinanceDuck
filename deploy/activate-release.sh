#!/usr/bin/env bash
# Versioned migrations must be backward compatible with the previous application.
# Usage ledger is additive, but the old application must not run after manual period changes.
set -Eeuo pipefail
exec 9>/var/lock/finance-duck-maintenance.lock
flock -n 9 || { echo "Another maintenance operation is running"; exit 1; }
release="${1:?Release directory required}"
commit="${2:?Commit required}"
[[ "$release" =~ ^/opt/finance-duck-releases/[a-zA-Z0-9_-]+$ && "$commit" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ -L /opt/finance-duck && -s "$release/dist-server/worker.js" && -s "$release/.env" ]]
previous=$(readlink -f /opt/finance-duck)
archive="/var/finance-duck/releases/$(basename "$release")"
mkdir -m 700 "$archive"
worker_existed=0
if systemctl cat finance-duck-worker >/dev/null 2>&1; then
  worker_existed=1
  cp /etc/systemd/system/finance-duck-worker.service "$archive/previous-worker.service"
fi
stopped=0
rollback() {
  rc=$?
  trap - ERR
  if (( stopped )); then
    systemctl stop finance-duck finance-duck-worker || true
    # A previous application derives usage from expenses. Never silently erase new manual usage.
    if [[ ! -f "$previous/dist-server/backupCli.js" ]] && sudo -u postgres psql -At -d finance_duck -c "SELECT 1 FROM service_usage WHERE source='manual' OR updated_by IS NOT NULL LIMIT 1" 2>/dev/null | grep -q 1; then
      echo 'Automatic code rollback stopped: manual service usage exists. Services remain stopped; recover forward or restore the protected pre-switch database.'
      exit "$rc"
    fi
    ln -s "$previous" /opt/finance-duck-rollback
    mv -Tf /opt/finance-duck-rollback /opt/finance-duck
    if (( worker_existed )); then
      cp "$archive/previous-worker.service" /etc/systemd/system/finance-duck-worker.service
      systemctl daemon-reload
      systemctl start finance-duck-worker
    else
      systemctl disable finance-duck-worker || true
    fi
    systemctl start finance-duck
  fi
  echo 'Release failed; previous code restored. Protected database/object backups retained.'
  exit "$rc"
}
trap rollback ERR
systemctl stop finance-duck
stopped=1
if (( worker_existed )); then systemctl stop finance-duck-worker; fi
sudo -u postgres pg_dump -Fc finance_duck > "$archive/before-switch.dump"
tar -czf "$archive/objects-before-switch.tar.gz" -C /var/finance-duck objects
chmod 600 "$archive/before-switch.dump" "$archive/objects-before-switch.tar.gz"
cd "$release"
sudo -u financeduck node --env-file=.env dist-server/migrate.js
printf '{"commit":"%s","deployedAt":"%s"}\n' "$commit" "$(date -u +%FT%TZ)" > release.json
chown financeduck:financeduck release.json
ln -s "$release" /opt/finance-duck-next
mv -Tf /opt/finance-duck-next /opt/finance-duck
install -m 644 deploy/finance-duck-worker.service /etc/systemd/system/finance-duck-worker.service
systemctl daemon-reload
systemctl enable finance-duck-worker
systemctl start finance-duck finance-duck-worker
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health > "$archive/health.json"; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:5000/api/health > "$archive/health.json"
systemctl is-active --quiet finance-duck
systemctl is-active --quiet finance-duck-worker
# The worker must have claimed the immediate jobs, not merely started Node.
for attempt in $(seq 1 20); do
  jobs=$(sudo -u postgres psql -At -d finance_duck -c "SELECT count(*) FROM scheduled_jobs WHERE key IN ('recurring-invoices','login-limit-cleanup') AND last_finished_at IS NOT NULL AND state='idle'")
  if [[ "$jobs" == 2 ]]; then break; fi
  sleep 1
done
[[ "$jobs" == 2 ]]
trap - ERR
printf 'Release active: %s; previous: %s\n' "$commit" "$previous"
