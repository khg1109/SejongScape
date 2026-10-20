#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
snap run certbot certonly --non-interactive --agree-tos --register-unsafely-without-email --preferred-profile shortlived --webroot --webroot-path /var/www/sejongscape-acme --ip-address 54.180.18.109 --cert-name 54.180.18.109
cd /opt/sejongscape
python3 - <<'PY'
from pathlib import Path
s=Path('2026-10-12-sejongscape-nginx.conf.template').read_text().replace('PUBLIC_IP','54.180.18.109')
https=s.split('server {',2)[2]
with Path('/etc/nginx/conf.d/2026-10-12-sejongscape-https.conf').open('x') as f:
    f.write('server {'+https)
hook=Path('/etc/letsencrypt/renewal-hooks/deploy/2026-10-12-reload-nginx.sh')
with hook.open('x') as f:
    f.write('#!/bin/sh\n/usr/sbin/nginx -t && /bin/systemctl reload nginx\n')
hook.chmod(0o755)
PY
nginx -t
systemctl reload nginx
curl --fail --silent --show-error https://54.180.18.109/access/login -o /dev/null
snap run certbot renew --dry-run
systemctl list-timers --all --no-pager | grep certbot
echo HTTPS_READY
