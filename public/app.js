const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const API = '/api/v1';
const TOKEN_KEY = 'og_core_token';

function readStoredToken() {
  try {
    const val = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    if (!val || val === 'undefined' || val === 'null') return '';
    return val;
  } catch {
    return '';
  }
}

function writeStoredToken(val) {
  const clean = val && val !== 'undefined' && val !== 'null' ? String(val) : '';
  try {
    if (clean) localStorage.setItem(TOKEN_KEY, clean);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
  try {
    if (clean) sessionStorage.setItem(TOKEN_KEY, clean);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  return clean;
}

let token = readStoredToken();
let currentUser = null;
let allUsers = [];
let healthData = null;
const authView = $('#authView'), appView = $('#appView');

function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function notice(target,message,type=''){target.textContent=message;target.className=`notice ${type}`;target.classList.remove('hidden')}
function hideNotice(target){target.classList.add('hidden')}

async function request(path, options={}) {
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const response=await fetch(path.startsWith('/health')?path:`${API}${path}`,{...options,headers});
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){
    if(response.status===401 && token && !path.startsWith('/auth/login') && !path.startsWith('/auth/change-password')){
      logout(false);
    }
    throw new Error(data?.error?.message||'No se pudo completar la solicitud');
  }
  return data;
}

function setAuthTab(tab){
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.authTab===tab));
  ['login','register','setup'].forEach(k=>$('#'+k+'Form').classList.toggle('hidden',k!==tab));
  hideNotice($('#authMessage'));
}
$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>setAuthTab(b.dataset.authTab)));

async function authSubmit(form,endpoint){
  const data=Object.fromEntries(new FormData(form).entries());
  const box=$('#authMessage');hideNotice(box);
  const submitBtn=form.querySelector('button[type="submit"]');
  if(submitBtn) submitBtn.disabled=true;
  try{
    const result=await request('/auth/'+endpoint,{method:'POST',body:JSON.stringify(data)});
    const receivedToken=result.accessToken||result.token||'';
    if(!receivedToken) throw new Error('El servidor no devolvió un token de sesión válido');
    token=writeStoredToken(receivedToken);
    currentUser=result.user;
    form.reset();
    await showApp();
  }catch(e){notice(box,e.message,'error')}
  finally{if(submitBtn) submitBtn.disabled=false}
}
$('#loginForm').addEventListener('submit',e=>{e.preventDefault();authSubmit(e.currentTarget,'login')});
$('#registerForm').addEventListener('submit',e=>{e.preventDefault();authSubmit(e.currentTarget,'register')});
$('#setupForm').addEventListener('submit',e=>{e.preventDefault();authSubmit(e.currentTarget,'setup')});

async function showApp(){
  authView.classList.add('hidden');appView.classList.remove('hidden');
  const isAdmin=['owner','admin'].includes(currentUser.role);
  $('#adminNav').classList.toggle('hidden',!isAdmin);$('#userNav').classList.toggle('hidden',isAdmin);
  $('#roleChip').textContent=currentUser.role.toUpperCase();
  const initial=(currentUser.display_name||'Ö').slice(0,1).toUpperCase();
  $('#avatar').textContent=initial;
  $('#welcomeName').textContent=currentUser.display_name||'';
  $('#todayLabel').textContent=new Intl.DateTimeFormat('es-AR',{dateStyle:'full'}).format(new Date());
  $('#baseUrl').textContent=location.origin;
  $('#profileName').value=currentUser.display_name||'';
  $('#profileEmail').value=currentUser.email||'';
  $('#profileRole').textContent='Rol: '+currentUser.role;
  $('#profileCreated').textContent=currentUser.created_at?'Desde '+new Date(currentUser.created_at).toLocaleDateString('es-AR'):'';
  $('#profileAvatar').textContent=initial;
  $('#footerVersion').textContent='0.3.0';
  navigate(isAdmin?'overview':'profile');
  await refreshHealth();
  if(isAdmin){await Promise.all([loadUsers(),loadAudit()])}
}

function navigate(page){
  $$('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='page-'+page));
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  const names={overview:['OVERVIEW','Resumen general'],users:['USER MANAGEMENT','Usuarios'],audit:['SECURITY LOG','Auditoría'],api:['DEVELOPER','API & sistema'],profile:['ACCOUNT','Mi perfil'],security:['ACCOUNT SECURITY','Seguridad']};
  $('#pageEyebrow').textContent=names[page]?.[0]||'ÖG CORE';$('#pageTitle').textContent=names[page]?.[1]||'Ög';
}
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.goto)));

async function refreshHealth(){
  try{
    healthData=await request('/health');
    $('#serverStat').textContent='Online';$('#serverHint').textContent='Respuesta recibida correctamente';
    $('#apiHealth').textContent='Operativa';$('#apiHealth').className='status-pill good';
    $('#sideServerStatus').textContent='En línea';
    $('#versionStat').textContent=healthData.version||'0.3.0';
    if(healthData.driver) $('#dbStat').textContent=healthData.driver==='postgres'?'PostgreSQL':'SQLite';
    $('#dbHealth').textContent='Protegida';$('#dbHealth').className='status-pill good';
  }catch(e){$('#serverStat').textContent='Offline';$('#serverHint').textContent='No responde el endpoint';$('#apiHealth').textContent='Sin conexión';$('#apiHealth').className='status-pill bad';$('#sideServerStatus').textContent='Sin conexión'}
}

async function loadUsers(){
  try{
    const data=await request('/admin/users?limit=100&offset=0');
    allUsers=data.items||[];$('#usersStat').textContent=data.total??allUsers.length;$('#userCount').textContent=(data.total??allUsers.length)+' cuentas';
    renderUsers(allUsers);
  }catch(e){$('#usersTable').innerHTML=`<tr><td colspan="5" class="empty">${escapeHtml(e.message)}</td></tr>`}
}

function renderUsers(users){
  const tbody=$('#usersTable');
  if(!users.length){tbody.innerHTML='<tr><td colspan="5" class="empty">Todavía no hay cuentas para mostrar.</td></tr>';return}
  tbody.innerHTML=users.map(u=>`<tr><td><div class="user-cell"><span class="user-avatar">${escapeHtml((u.display_name||'?').slice(0,1).toUpperCase())}</span><div><b>${escapeHtml(u.display_name||'Sin nombre')}</b><small>${escapeHtml(u.email||'')}</small></div></div></td><td><span class="pill">${escapeHtml(u.role)}</span></td><td><span class="pill ${escapeHtml(u.status)}">${escapeHtml(u.status)}</span></td><td>${u.created_at?new Date(u.created_at).toLocaleDateString('es-AR'):'—'}</td><td>${u.id===currentUser.id?'<small>Tu cuenta</small>':`<select class="action-select" data-user-action="${escapeHtml(u.id)}"><option value="">Acción</option>${u.status==='active'?'<option value="suspend">Suspender</option>':'<option value="reactivate">Reactivar</option>'}${currentUser.role==='owner'?`<option value="role-user">Hacer usuario</option><option value="role-admin">Hacer admin</option>`:''}<option value="delete">Eliminar</option></select>`}</td></tr>`).join('');
}

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#userSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();renderUsers(allUsers.filter(u=>(u.display_name+' '+u.email).toLowerCase().includes(q)))});
$('#usersTable').addEventListener('change',async e=>{
  const select=e.target.closest('[data-user-action]');if(!select||!select.value)return;
  const id=select.dataset.userAction,action=select.value;select.disabled=true;
  try{
    if(action==='delete'){if(!confirm('¿Eliminar esta cuenta? La acción es irreversible.'))return;await request(`/admin/users/${id}`,{method:'DELETE'})}
    else if(action==='suspend'||action==='reactivate')await request(`/admin/users/${id}/${action}`,{method:'POST',body:'{}'});
    else if(action.startsWith('role-'))await request(`/admin/users/${id}/role`,{method:'PATCH',body:JSON.stringify({role:action.slice(5)})});
    toast('Cambios guardados');await loadUsers();
  }catch(err){toast(err.message)}finally{select.value='';select.disabled=false}
});

async function loadAudit(){
  try{
    const data=await request('/admin/audit?limit=30'),items=data.items||[];
    const markup=items.length?items.map(a=>`<div class="audit-entry"><div><b>${escapeHtml(a.action||'Evento')}</b><small>${escapeHtml(a.target_type||'sistema')} · ${escapeHtml(a.target_id||'Sin objetivo')}</small></div><span class="audit-time">${a.created_at?new Date(a.created_at).toLocaleString('es-AR'):'—'}</span></div>`).join(''):'<div class="empty">Todavía no hay eventos registrados.</div>';
    $('#auditList').innerHTML=markup;$('#recentAudit').innerHTML=items.slice(0,4).map(a=>`<div class="activity-item"><i class="activity-dot"></i><div><b>${escapeHtml(a.action||'Evento')}</b><small>${a.created_at?new Date(a.created_at).toLocaleString('es-AR'):'Evento registrado'}</small></div></div>`).join('')||'<div class="empty">Sin actividad reciente.</div>';
  }catch(e){$('#auditList').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;$('#recentAudit').innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}
}
$('#refreshUsers').addEventListener('click',loadUsers);$('#refreshAudit').addEventListener('click',loadAudit);

$('#profileForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const result=await request('/auth/me',{method:'PATCH',body:JSON.stringify({displayName:$('#profileName').value})});
    currentUser=result.user;
    const initial=(currentUser.display_name||'Ö').slice(0,1).toUpperCase();
    $('#welcomeName').textContent=currentUser.display_name;
    $('#profileAvatar').textContent=initial;
    $('#avatar').textContent=initial;
    toast('Perfil actualizado');
  }catch(err){toast(err.message)}
});

$('#changePasswordForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const payload=Object.fromEntries(new FormData(form).entries());
  try{
    await request('/auth/change-password',{method:'POST',body:JSON.stringify(payload)});
    form.reset();
    toast('Contraseña actualizada');
  }catch(err){toast(err.message)}
});

$('#logoutAll').addEventListener('click',async()=>{if(!confirm('Se cerrarán todas tus sesiones. ¿Continuar?'))return;try{await request('/auth/logout-all',{method:'POST',body:'{}'});logout(false)}catch(e){toast(e.message)}});

$('#copyUrl').addEventListener('click',async()=>{
  const text=location.origin;
  try{
    await navigator.clipboard.writeText(text);
    toast('URL copiada');
  }catch{
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');toast('URL copiada')}catch{toast(text)}
    document.body.removeChild(ta);
  }
});

async function logout(callApi=true){
  if(callApi&&token){try{await request('/auth/logout',{method:'POST',body:'{}'})}catch{}}
  token=writeStoredToken('');
  currentUser=null;
  appView.classList.add('hidden');
  authView.classList.remove('hidden');
  setAuthTab('login');
}
$('#logoutBtn').addEventListener('click',()=>logout(true));
$('#mobileLogoutBtn')?.addEventListener('click',()=>logout(true));

async function boot(){
  if(!token)return;
  try{const data=await request('/auth/me');currentUser=data.user;await showApp()}
  catch{token=writeStoredToken('')}
}
boot();
