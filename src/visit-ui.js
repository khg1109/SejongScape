fetch('/api/me',{cache:'no-store'})
 .then(response=>response.ok?response.json():null)
 .then(user=>{
  if(!user?.isOwner)return;
  const adminLink=document.createElement('a');
  adminLink.href='/admin';
  adminLink.textContent='관리자 · 접속 기록';
  adminLink.setAttribute('aria-label','관리자 접속 기록 보기');
  adminLink.style='position:fixed;bottom:30px;right:16px;padding:8px 13px;border:1px solid #8aad9c;border-radius:7px;background:#173038;color:#ddf3e6;z-index:20;font:600 13px system-ui;text-decoration:none;box-shadow:0 4px 18px #07141566';
  document.body.append(adminLink);
 })
 .catch(()=>{});

// Static map documents can bypass the Worker; record through an authenticated API.
async function recordVisit(){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch('/api/visits',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:location.pathname.startsWith('/traffic')?'/traffic':location.pathname.startsWith('/sumo')?'/sumo':location.pathname.startsWith('/real')?'/real':'/'}),cache:'no-store'});
   if(!response.ok)throw Error('record failed');
   return;
  }catch{if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));}
 }
}
recordVisit();
window.addEventListener('pageshow',event=>{if(event.persisted)recordVisit();});
