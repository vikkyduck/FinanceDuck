#!/usr/bin/env bash
# Operator restore for large archives: no HTTP timeout and no concurrent background work.
set -Eeuo pipefail
backup="${1:?Absolute archive path required}"
[[ "$EUID" == 0 && "$backup" == /* && -f "$backup" ]] || exit 2
cd /opt/finance-duck
# Authenticate the entire file before stopping services.
sudo -u financeduck node --env-file=.env dist-server/backupCli.js verify "$backup"
stopped=0
restart() {
  if (( stopped )); then systemctl start finance-duck finance-duck-worker; fi
}
trap restart EXIT
systemctl stop finance-duck finance-duck-worker
stopped=1
sudo -u financeduck env FINANCE_RESTORE_MAINTENANCE=1 node --env-file=.env dist-server/backupCli.js restore "$backup"
# Leases belonged to processes that have been stopped. Do not revive those owners.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d finance_duck -c "UPDATE scheduled_jobs SET lease_token=NULL, lease_until=NULL, state='idle' WHERE state='running'"
restart
stopped=0
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health; then exit 0; fi
  sleep 1
done
exit 1
