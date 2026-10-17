#!/usr/bin/env bash
# Restore and verify an isolated database first; only a verified copy may replace the live database.
set -Eeuo pipefail
backup="${1:?Absolute .fdb archive path required}"
[[ "$EUID" == 0 && "$backup" == /*.fdb && -f "$backup" ]] || exit 2
cd /opt/finance-duck
# Serialize restores and releases (activate-release uses the same lock).
exec 9>/var/lock/finance-duck-maintenance.lock
flock -n 9 || { echo 'Another maintenance operation is running'; exit 1; }
stamp="$(date -u +%Y%m%d%H%M%S)_${RANDOM}"
shadow="finance_restore_$stamp"
previous="finance_retained_$stamp"
failed="finance_failed_$stamp"
proof="/var/finance-duck/releases/restore_$stamp"
install -d -m 700 -o financeduck -g financeduck "$proof"
sudo -u financeduck node --env-file=.env dist-server/backupCli.js verify "$backup"
sudo -u postgres createdb -O finance_duck -T template0 "$shadow"
# Failure here leaves the application online. The failed shadow database is retained for diagnosis.
sudo -u financeduck node --env-file=.env dist-server/backupCli.js shadow-restore "$backup" "$shadow" "$proof/verified"
[[ -s "$proof/verified/verification.json" ]]
stopped=0
switched=0
rollback() {
  rc=$?
  (( rc > 0 )) || rc=1
  trap - ERR INT TERM
  if (( stopped )); then
    systemctl stop finance-duck finance-duck-worker || true
    # The SQL transaction may have committed even if its client lost the connection.
    switched=$(sudo -u postgres psql -X -At -v ON_ERROR_STOP=1 -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='$previous'") || {
      echo 'Cannot determine database state; services remain stopped.'; exit 1;
    }
    if (( switched )); then
      sudo -u postgres psql -X -d postgres -v live=finance_duck -v replacement="$previous" -v retained="$failed" -f deploy/swap-databases.sql || {
        echo 'Database rollback failed; services remain stopped. Protected databases and dumps retained.'; exit 1;
      }
    fi
    systemctl start finance-duck finance-duck-worker
  fi
  echo "Restore failed. Previous database retained; verification directory: $proof"
  exit "${rc:-1}"
}
trap rollback ERR INT TERM
stopped=1
systemctl stop finance-duck finance-duck-worker
sudo -u postgres pg_dump -Fc finance_duck > "$proof/before-switch.dump"
tar -czf "$proof/objects-before-switch.tar.gz" -C /var/finance-duck objects
chmod 600 "$proof/before-switch.dump" "$proof/objects-before-switch.tar.gz"
# Leases belonged to restored processes; no process may resume ownership of them.
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$shadow" -c "UPDATE scheduled_jobs SET lease_token=NULL, lease_until=NULL, state='idle' WHERE state='running'"
sudo -u postgres psql -X -d postgres -v live=finance_duck -v replacement="$shadow" -v retained="$previous" -f deploy/swap-databases.sql
switched=1
systemctl start finance-duck
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:5000/api/health > "$proof/health.json"; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:5000/api/health > "$proof/health.json"
systemctl is-active --quiet finance-duck
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d finance_duck -c 'SELECT count(*) AS invoices FROM invoices' > "$proof/database-health.txt"
systemctl start finance-duck-worker
systemctl is-active --quiet finance-duck-worker
trap - ERR INT TERM
printf 'Verified database active. Previous database: %s; protected evidence: %s\n' "$previous" "$proof"
