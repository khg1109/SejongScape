#!/usr/bin/env bash
# Run after DNS and domain registration are active, and after approval of
# the existing configuration/password-file URL changes described below.
set -euo pipefail
test "$(id -u)" = 0
snap run certbot certonly --non-interactive --webroot --webroot-path /var/www/sejongscape-acme --cert-name sejongscape.com -d sejongscape.com
python3 - <<'PY'
from pathlib import Path
import os, re
env=Path('/etc/sejongscape/2026-10-12-sejongscape.env')
info=Path('/etc/sejongscape/2026-10-12-sejongscape-passwords.txt')
ip=Path('/etc/nginx/conf.d/2026-10-12-sejongscape-https.conf')
domain=Path('/etc/nginx/conf.d/2026-10-12-sejongscape-domain-https.conf')
assert not domain.exists(), 'Domain activation already started; inspect before retrying'
old_env=env.read_text(); old_info=info.read_text(); old_ip=ip.read_text()
assert 'PUBLIC_ORIGIN=https://54.180.18.109\n' in old_env
assert 'proxy_pass http://127.0.0.1:3000;' in old_ip
template=Path('/opt/sejongscape/2026-10-12-sejongscape-nginx.conf.template').read_text()
domain_conf='server {'+template.replace('PUBLIC_IP','sejongscape.com').split('server {',2)[2]
ip_conf=re.sub(r'    location / \{.*?\n    \}', '    location / { return 301 https://sejongscape.com$request_uri; }', old_ip, count=1, flags=re.S)
assert ip_conf != old_ip
backup=Path('/etc/sejongscape/2026-10-12-before-domain')
backup.mkdir(mode=0o700)
for path,content in [(env,old_env),(info,old_info),(ip,old_ip)]:
    with (backup/path.name).open('x') as f: f.write(content)
    (backup/path.name).chmod(0o600)
with domain.open('x') as f: f.write(domain_conf)
domain.chmod(0o644)
def replace(path,content,mode):
    temp=path.parent/('2026-10-12-pending-'+path.name)
    with temp.open('x') as f: f.write(content)
    temp.chmod(mode); os.replace(temp,path)
replace(env,old_env.replace('PUBLIC_ORIGIN=https://54.180.18.109\n','PUBLIC_ORIGIN=https://sejongscape.com\n'),0o600)
replace(info,old_info.replace('https://54.180.18.109','https://sejongscape.com'),0o600)
replace(ip,ip_conf,0o644)
PY
nginx -t
systemctl restart 2026-10-12-sejongscape
systemctl reload nginx
curl --fail --silent --show-error --retry 3 --retry-connrefused https://sejongscape.com/access/login -o /dev/null
systemctl is-active 2026-10-12-sejongscape nginx
echo DOMAIN_ACTIVATED
