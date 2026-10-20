#!/usr/bin/env bash
# Prepare only new domain files. Keep the running IP-address site unchanged.
set -euo pipefail
test "$(id -u)" = 0
python3 - <<'PY'
from pathlib import Path
source=Path('/opt/sejongscape/2026-10-12-sejongscape-nginx.conf.template').read_text()
rendered=source.replace('PUBLIC_IP','sejongscape.com')
http='server {'+rendered.split('server {',2)[1]
dest=Path('/etc/nginx/conf.d/2026-10-12-sejongscape-domain-http.conf')
if dest.exists():
    assert dest.read_text()==http, 'Unexpected existing domain configuration'
else:
    with dest.open('x') as f: f.write(http)
PY
nginx -t
systemctl reload nginx
echo DOMAIN_HTTP_PREPARED
