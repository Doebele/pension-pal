#!/usr/bin/env bash
# PostgreSQL-Dump der Produktion nach backups/, Dumps aelter als 14 Tage werden geloescht.
#   scripts/backup-db.sh [bezeichnung]
# Nachts per Cron auf dem Server (root-crontab):
#   15 3 * * * <deploy-path>/scripts/backup-db.sh nightly >> /var/log/pensionpal-backup.log 2>&1
# Wiederherstellen (ueberschreibt Daten!):
#   gunzip -c backups/<datei>.sql.gz | docker exec -i pension_pal_db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
# ponytail: Dumps liegen auf demselben Server. Faellt die Platte aus, sind sie
# mit weg — fuer eine Kopie ausser Haus per scp/rsync abholen.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups

out="backups/pensionpal_$(date +%F_%H%M)_${1:-manual}.sql.gz"
trap 'rm -f "$out.tmp"' EXIT
# Benutzer und Datenbank aus dem Container selbst — die Env-Datei muss nicht geparst werden
docker exec pension_pal_db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$out.tmp"
# Nur ein vollstaendiger Dump wird behalten; ein abgebrochener darf nie wie ein Backup aussehen
gunzip -c "$out.tmp" | tail -n 5 | grep -q 'PostgreSQL database dump complete'
mv "$out.tmp" "$out"
find backups -name 'pensionpal_*.sql.gz' -mtime +14 -delete
echo "$(date -Is) $out $(du -h "$out" | cut -f1)"
