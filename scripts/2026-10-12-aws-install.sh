#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
test ! -e /usr/local/bin/node
install -d /opt/2026-10-12-node-download
cd /opt/2026-10-12-node-download
curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o 2026-10-12-SHASUMS256.txt
node_archive=$(awk '$2 ~ /^node-v24\..*-linux-x64\.tar\.xz$/ {print $2}' 2026-10-12-SHASUMS256.txt)
test -n "$node_archive"
curl --fail --silent --show-error --location "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$node_archive"
awk -v name="$node_archive" '$2 == name' 2026-10-12-SHASUMS256.txt | sha256sum --check -
tar -xJf "$node_archive" -C /opt
ln -s "/opt/${node_archive%.tar.xz}/bin/node" /usr/local/bin/node
id sejongscape >/dev/null 2>&1 || useradd --system --home-dir /var/lib/sejongscape --shell /usr/sbin/nologin sejongscape
cd /opt/sejongscape
node scripts/2026-10-12-aws-create-config.mjs https://54.180.18.109 /etc/sejongscape
install -m 644 2026-10-12-sejongscape.service /etc/systemd/system/2026-10-12-sejongscape.service
install -d -m 755 /var/www/sejongscape-acme
python3 - <<'PY'
from pathlib import Path
s=Path('2026-10-12-sejongscape-nginx.conf.template').read_text().replace('PUBLIC_IP','54.180.18.109')
http=s.split('server {',2)[1]
with Path('/etc/nginx/conf.d/2026-10-12-sejongscape-http.conf').open('x') as f:
    f.write('server {'+http)
PY
systemctl daemon-reload
systemctl enable --now 2026-10-12-sejongscape.service
nginx -t
systemctl enable nginx
systemctl reload nginx
snap install --classic certbot
node --version
snap run certbot --version
systemctl is-active 2026-10-12-sejongscape nginx
curl --silent --output /dev/null --write-out 'Application HTTP status: %{http_code}\n' -H 'Host: 54.180.18.109' http://127.0.0.1:3000/
echo RUNTIME_READY
