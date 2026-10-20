"""On the existing AWS host: additive assets/data, backup, then atomic SUMO switch."""
import hashlib,json,os,pathlib,shutil,sys
release=pathlib.Path(__file__).resolve().parent
client=pathlib.Path('/opt/sejongscape/2026-10-12-aws-build/client')
backup=pathlib.Path('/opt/sejongscape/2026-10-16-before-csv3d')
assert os.getuid()==0 and (client/'sumo.html').is_file()
manifest=json.loads((release/'2026-10-16-release-manifest.json').read_text())
for name,sha in manifest.items():
 p=pathlib.PurePosixPath(name)
 assert not p.is_absolute() and '..' not in p.parts
 assert hashlib.sha256((release/'client'/name).read_bytes()).hexdigest()==sha,name
 dest=client/name
 if name!='sumo.html' and dest.exists():assert hashlib.sha256(dest.read_bytes()).hexdigest()==sha,'Asset collision '+name
backup.mkdir(exist_ok=False)
shutil.copy2(client/'sumo.html',backup/'sumo.html')
created=[]
for name in manifest:
 if name=='sumo.html':continue
 dest=client/name
 if dest.exists():continue
 dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(release/'client'/name,dest);dest.chmod(0o644);created.append(str(dest))
temp=client/'2026-10-16-sumo-ready.html'
with temp.open('xb') as f:f.write((release/'client/sumo.html').read_bytes())
temp.chmod(0o644);os.replace(temp,client/'sumo.html')
(backup/'2026-10-16-created-server-files.json').write_text(json.dumps(created,indent=2))
print('CSV3D_ACTIVATED; original SUMO backed up; '+str(len(created))+' new files; no database/auth changes')
