#!/usr/bin/env python3
"""Run interactively as root. Credentials are entered by the owner, never echoed."""
import getpass,hashlib,http.client,os,pathlib,re,secrets,shutil,subprocess,time,urllib.parse
assert os.getuid()==0,'Run with sudo'
config=pathlib.Path('/etc/sejongscape/2026-10-12-sejongscape.env')
info=pathlib.Path('/etc/sejongscape/2026-10-12-sejongscape-passwords.txt')
original=config.read_text();original_info=info.read_text()
values=dict(line.split('=',1) for line in original.splitlines() if '=' in line and not line.startswith('#'))
password=getpass.getpass('New administrator password: ')
confirm=getpass.getpass('Confirm new administrator password: ')
if password!=confirm or not password or len(password)>128 or '\n' in password or '\r' in password:
 raise SystemExit('Passwords must match and contain 1-128 characters. No changes made.')
salt=secrets.token_hex(16)
hash_value=hashlib.pbkdf2_hmac('sha256',password.encode(),salt.encode(),100000,32).hex()
assert hash_value!=values['ADMIN_PASSWORD_HASH']
updated=original
for key,value in [('ADMIN_PASSWORD_HASH',hash_value),('ADMIN_PASSWORD_SALT',salt)]:
 updated,count=re.subn(r'^'+key+r'=.*$',key+'='+value,updated,flags=re.M);assert count==1,key
updated_info,count=re.subn(r'^Admin password: .*$',lambda m:'Admin password: '+password,original_info,flags=re.M);assert count==1
updated_info,count=re.subn(r'^Admin URL: .*$','Admin URL: https://sejongscape.com/OSM',updated_info,flags=re.M);assert count==1
backup=pathlib.Path('/etc/sejongscape/2026-10-16-before-admin-password-'+time.strftime('%H%M%S'))
backup.mkdir(mode=0o700)
for p in [config,info]:shutil.copy2(p,backup/p.name);(backup/p.name).chmod(0o600)
def atomic(path,text):
 tmp=path.parent/('2026-10-16-'+secrets.token_hex(5)+'-'+path.name)
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:f.write(text)
 os.replace(tmp,path)
def request(path,body=None,cookie=None):
 c=http.client.HTTPConnection('127.0.0.1',3000,timeout=15)
 headers={'Host':'sejongscape.com','Origin':'https://sejongscape.com'}
 if cookie:headers['Cookie']=cookie
 if body is not None:headers['Content-Type']='application/x-www-form-urlencoded'
 c.request('POST' if body is not None else 'GET',path,body,headers)
 r=c.getresponse();result=(r.status,dict(r.getheaders()),r.read());c.close();return result
def login(path,pwd):return request(path,urllib.parse.urlencode({'password':pwd}))
try:
 assert config.read_text()==original and info.read_text()==original_info,'Settings changed concurrently'
 atomic(config,updated);atomic(info,updated_info)
 subprocess.run(['systemctl','restart','2026-10-12-sejongscape'],check=True)
 for attempt in range(30):
  try:
   if request('/OSM/login')[0]==200:break
  except OSError:pass
  time.sleep(.2)
 else:raise RuntimeError('Server did not become ready')
 status,headers,_=login('/OSM/login',password)
 assert status==303 and headers.get('location')=='/OSM','New login failed'
 cookie=headers['set-cookie'].split(';')[0]
 assert request('/OSM',cookie=cookie)[0]==200
 old_password=re.search(r'^Admin password: (.+)$',original_info,re.M)[1]
 if old_password!=password:assert login('/OSM/login',old_password)[1].get('location')=='/OSM/login?error=wrong'
 viewer=re.search(r'^Visitor password: (.+)$',original_info,re.M)[1]
 status,headers,_=login('/access/login',viewer);assert status==303
 viewer_cookie=headers['set-cookie'].split(';')[0]
 assert request('/sumo',cookie=viewer_cookie)[0]==200
 assert request('/api/admin/visits',cookie=viewer_cookie)[0]==401
 assert request('/OSM',cookie=viewer_cookie)[1].get('location')=='/OSM/login'
 print('ADMIN_PASSWORD_UPDATED_AND_VERIFIED')
 print('Administrator URL: https://sejongscape.com/OSM')
 print('Visitor password preserved. Old administrator password rejected.')
 print('Private backup: '+str(backup))
except Exception:
 atomic(config,original);atomic(info,original_info)
 subprocess.run(['systemctl','restart','2026-10-12-sejongscape'],check=False)
 raise SystemExit('Verification failed; previous password settings restored.')
