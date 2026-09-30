const KEY='wb_refurb_simple_v1';
const LEGACY='wb_legacy_backup_v1';
const CONFIG={maxActivity:80};
const STATUSES=[
  {id:'inbox',label:'Inbox / Inventory',badge:'b-inbox'},
  {id:'repair',label:'Repair',badge:'b-repair'},
  {id:'waiting',label:'Waiting',badge:'b-waiting'},
  {id:'sale',label:'For Sale',badge:'b-sale'},
  {id:'sold',label:'Sold',badge:'b-sold'}
];
let state={
  devices:[],activity:[],search:'',
  settings:{currency:'€',laborRate:0,theme:'dark'}
};
let editorId=null, draft=null, saleId=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today=()=>new Date().toISOString().slice(0,10);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=n=>`${state.settings.currency}${Math.round(num(n)).toLocaleString()}`;
const moneySigned=n=>{const x=Math.round(num(n));return `${x<0?'−':''}${state.settings.currency}${Math.abs(x).toLocaleString()}`};
const fmtDate=v=>v?new Date(v+'T12:00:00').toLocaleDateString():'—';
const nowISO=()=>new Date().toISOString();
const deviceLabel=d=>[d.brand,d.model].filter(Boolean).join(' ')||d.name||'Untitled device';
const partsCost=d=>(d.parts||[]).reduce((s,p)=>s+num(p.cost),0);
const laborCost=d=>{const rate=(d.laborRate===''||d.laborRate===null||d.laborRate===undefined)?num(state.settings.laborRate):num(d.laborRate);return num(d.laborHours)*rate;};
const investment=d=>num(d.purchaseCost)+partsCost(d)+laborCost(d)+num(d.saleFees);
const expectedProfit=d=>num(d.expectedSale)-investment(d);
const actualProfit=d=>num(d.salePrice)-investment(d);
const roi=(profit,base)=>base?profit/base*100:0;
const ageDays=d=>{
  const a=new Date((d.acquired||d.createdAt||today())+'T12:00:00');
  const b=new Date((d.status==='sold'&&d.soldAt?d.soldAt:today())+'T12:00:00');
  return Math.max(0,Math.round((b-a)/86400000));
};
const statusObj=s=>STATUSES.find(x=>x.id===s)||STATUSES[0];
const statusLabel=s=>statusObj(s).label;

function blankDevice(){
  return {id:id(),name:'',brand:'',model:'',serial:'',condition:'Good',
    purchaseCost:'',acquired:today(),status:'inbox',parts:[],expectedSale:'',
    laborHours:'',laborRate:'',saleFees:'',salePrice:'',soldAt:'',
    waitingFor:'',notes:'',checklist:[],scenarios:[],createdAt:today(),updatedAt:nowISO()};
}
function normalizeDevice(d){
  return {...blankDevice(),...d,id:d.id||id(),parts:Array.isArray(d.parts)?d.parts:[],
    checklist:Array.isArray(d.checklist)?d.checklist:[],scenarios:Array.isArray(d.scenarios)?d.scenarios:[]};
}
function normalize(){
  state.devices=(Array.isArray(state.devices)?state.devices:[]).map(normalizeDevice);
  state.activity=Array.isArray(state.activity)?state.activity:[];
  state.settings={currency:'€',laborRate:0,theme:'dark',...(state.settings||{})};
}
function save(){
  localStorage.setItem(KEY,JSON.stringify({...state,search:''}));
}
function load(){
  let migrated=false;
  try{
    const raw=localStorage.getItem(KEY);
    if(raw){state={...state,...JSON.parse(raw)}}
    else{
      const legacy=localStorage.getItem('wb_data');
      if(legacy){
        const old=JSON.parse(legacy);
        localStorage.setItem(LEGACY,legacy);
        state.devices=migrateLegacy(old);
        state.activity.unshift({text:'Imported old Workbench data into the simplified refurb board. Review device statuses.',ts:nowISO(),type:'system'});
        migrated=true;
      }
    }
  }catch(e){console.warn(e)}
  normalize();
  document.documentElement.dataset.theme=state.settings.theme;
  if(migrated)save();
}
function migrateLegacy(old){
  const out=[];
  (old?.forSale||[]).forEach(s=>{
    const parts=parseCostLines(s.upgrades);
    out.push(normalizeDevice({id:s.id||id(),name:[s.brand,s.model].filter(Boolean).join(' '),
      brand:s.brand||'',model:s.model||'',condition:s.condition||'',purchaseCost:s.purchasePrice||'',
      expectedSale:s.sellingPrice||'',parts,notes:s.notes||'',status:s.status==='Sold'?'sold':(s.status==='Listed'?'sale':'inbox'),
      acquired:s.listed||today(),salePrice:s.status==='Sold'?s.sellingPrice||'':'',soldAt:s.status==='Sold'?today():'',
      updatedAt:s.updatedAt||nowISO()}));
  });
  (old?.repairs||[]).forEach(r=>{
    const st=r.status==='Waiting Parts'?'waiting':r.status==='In Progress'?'repair':'inbox';
    out.push(normalizeDevice({id:r.id||id(),name:[r.brand,r.model].filter(Boolean).join(' ')||r.deviceType||'Repair',
      brand:r.brand||'',model:r.model||'',serial:r.serial||'',status:st,waitingFor:r.partsNeeded||'',
      notes:[r.issue,r.notes].filter(Boolean).join('\\n\\n'),acquired:r.created||today(),updatedAt:r.updatedAt||nowISO()}));
  });
  return out;
}
function parseCostLines(text){
  return String(text||'').split(/\\n|,/).map(x=>x.trim()).filter(Boolean).map(line=>{
    const m=line.match(/^(.*?)\\s*[-–—:]?\\s*([$€£]?\\s*\\d+(?:[.,]\\d{1,2})?)\\s*$/);
    if(!m)return {id:id(),name:line,cost:0};
    return {id:id(),name:m[1].trim()||'Repair',cost:m[2].replace(',','').replace(/[^0-9.]/g,'')};
  });
}
function log(text,type='system'){
  state.activity.unshift({id:id(),text,type,ts:nowISO()});
  state.activity=state.activity.slice(0,CONFIG.maxActivity);
}
function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';
  clearTimeout(window._toast);window._toast=setTimeout(()=>t.style.display='none',2200);
}
function toggleTheme(){
  state.settings.theme=state.settings.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=state.settings.theme;save();render();
}
function exportData(){
  save();
  const blob=new Blob([JSON.stringify({...state,search:''},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='workbench-refurb-backup.json';a.click();URL.revokeObjectURL(a.href);
}
function importData(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const x=JSON.parse(rd.result);
      if(!Array.isArray(x.devices))throw new Error('Invalid backup');
      if(!confirm('Replace current simplified CRM data with this backup?'))return;
      state={...state,devices:x.devices,activity:Array.isArray(x.activity)?x.activity:[],settings:{...state.settings,...(x.settings||{})}};
      normalize();save();render();toast('Backup imported');
    }catch(err){alert('Could not import this JSON backup.')}
  };rd.readAsText(file);
}

function render(){
  const q=(state.search||'').toLowerCase().trim();
  const devices=state.devices.filter(d=>!q||[deviceLabel(d),d.serial,d.condition,d.status,d.waitingFor,d.notes].some(v=>String(v||'').toLowerCase().includes(q)));
  const counts=Object.fromEntries(STATUSES.map(s=>[s.id,devices.filter(d=>d.status===s.id).length]));
  const active=state.devices.filter(d=>d.status!=='sold');
  const invested=active.reduce((s,d)=>s+investment(d),0);
  const expProfit=active.reduce((s,d)=>s+expectedProfit(d),0);
  const sold=state.devices.filter(d=>d.status==='sold');
  const soldProfit=sold.reduce((s,d)=>s+actualProfit(d),0);
  const forSaleValue=state.devices.filter(d=>d.status==='sale').reduce((s,d)=>s+num(d.expectedSale),0);
  const avgRoi=sold.length?sold.reduce((s,d)=>s+roi(actualProfit(d),investment(d)),0)/sold.length:0;
  document.getElementById('app').innerHTML=`
    <div class="dashboard">
      <div class="stats">
        ${stat('Invested',money(invested),'info')}
        ${stat('Expected Profit',moneySigned(expProfit),expProfit>=0?'ok':'warn')}
        ${stat('For Sale',counts.sale||0,'accent')}
        ${stat('In Repair',counts.repair||0,'info')}
        ${stat('Waiting',counts.waiting||0,'warn')}
        ${stat('Sold Profit',moneySigned(soldProfit),soldProfit>=0?'ok':'warn')}
      </div>
      <div class="board-wrap">
        <div class="section-head">
          <h2>Device Board</h2>
          <div class="muted">${state.devices.length} device${state.devices.length===1?'':'s'} · drag cards between columns</div>
        </div>
        <div class="board">
          ${STATUSES.map(s=>columnHTML(s,devices.filter(d=>d.status===s.id),counts[s.id]||0)).join('')}
        </div>
      </div>
      <div class="bottom-grid">
        <section class="panel">
          <h3>Business Snapshot</h3>
          <div class="report-grid">
            <div class="report-box"><div class="l">Devices</div><div class="v">${state.devices.length}</div></div>
            <div class="report-box"><div class="l">Sale Value</div><div class="v">${money(forSaleValue)}</div></div>
            <div class="report-box"><div class="l">Realized Profit</div><div class="v ${soldProfit>=0?'ok':'bad'}">${moneySigned(soldProfit)}</div></div>
            <div class="report-box"><div class="l">Avg Sold ROI</div><div class="v">${sold.length?avgRoi.toFixed(1):'0.0'}%</div></div>
          </div>
        </section>
        <section class="panel">
          <h3>Activity & Notes</h3>
          <div class="activity">
            ${(state.activity||[]).slice(0,18).map(a=>`<div class="activity-row"><div class="txt">${esc(a.text)}</div><div class="ts">${rel(a.ts)}</div></div>`).join('')||'<div class="empty">No activity yet.</div>'}
          </div>
        </section>
      </div>
    </div>`;
}
function stat(label,val,kind){return `<div class="stat ${kind}"><div class="v">${val}</div><div class="l">${label}</div></div>`}
function columnHTML(s,items,count){
  return `<section class="column" data-status="${s.id}" ondragover="allowDrop(event,this)" ondragleave="leaveDrop(this)" ondrop="dropCard(event,this)">
    <div class="col-head"><strong>${s.label}</strong><span class="count">${count}</span></div>
    <div class="cards">${items.length?items.map(deviceCardHTML).join(''):'<div class="empty">Drop devices here</div>'}</div>
  </section>`;
}
function deviceCardHTML(d){
  const p=d.status==='sold'?actualProfit(d):expectedProfit(d);
  const sale=d.status==='sold'?d.salePrice:d.expectedSale;
  const inv=investment(d);
  const age=ageDays(d);
  return `<article class="card" draggable="true" ondragstart="startDrag(event,'${d.id}')" ondragend="endDrag(this)" onclick="openDevice('${d.id}')">
    <div class="card-title"><div><strong>${esc(deviceLabel(d))}</strong><div class="meta">${esc(d.serial||d.condition||'')}</div></div><span class="badge ${statusObj(d.status).badge}">${statusLabel(d.status)}</span></div>
    <div class="money-grid">
      <div class="money-box"><span class="k">Buy</span><span class="n">${money(d.purchaseCost)}</span></div>
      <div class="money-box"><span class="k">Repairs</span><span class="n">${money(partsCost(d)+laborCost(d))}</span></div>
      <div class="money-box"><span class="k">${d.status==='sold'?'Sold':'Expected'}</span><span class="n">${money(sale)}</span></div>
    </div>
    <div class="profit"><span class="${p>=0?'ok':'bad'}">${d.status==='sold'?'Actual':'Expected'} ${p>=0?'profit':'loss'}</span><span class="${p>=0?'ok':'bad'}">${moneySigned(p)}</span></div>
    <div class="card-foot"><span>${d.status==='waiting'&&d.waitingFor?esc(d.waitingFor):`${age} day${age===1?'':'s'} in business`}</span><span>${d.status==='sold'?roi(actualProfit(d),inv).toFixed(1):roi(expectedProfit(d),inv).toFixed(1)}% ROI</span></div>
  </article>`;
}
function rel(ts){
  const s=Math.max(0,Math.floor((Date.now()-new Date(ts).getTime())/1000));
  if(s<60)return 'just now'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago';
}

function startDrag(e,id){e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';e.currentTarget.classList.add('dragging')}
function endDrag(el){el.classList.remove('dragging')}
function allowDrop(e,el){e.preventDefault();el.classList.add('over')}
function leaveDrop(el){el.classList.remove('over')}
function dropCard(e,el){
  e.preventDefault();el.classList.remove('over');
  const did=e.dataTransfer.getData('text/plain');const target=el.dataset.status;moveDevice(did,target);
}
function moveDevice(did,target){
  const d=state.devices.find(x=>x.id===did);if(!d||d.status===target)return;
  const old=d.status;
  if(target==='sold'){openSaleModal(did);return;}
  d.status=target;
  d.updatedAt=nowISO();
  log(`${deviceLabel(d)} moved: ${statusLabel(old)} → ${statusLabel(target)}`,'status');
  save();render();toast(`Moved to ${statusLabel(target)}`);
}

function openDevice(did){
  editorId=did||null;
  draft=did?normalizeDevice(JSON.parse(JSON.stringify(state.devices.find(d=>d.id===did)))):blankDevice();
  renderEditor();
}
function closeModal(){document.getElementById('overlay').style.display='none';document.getElementById('overlay').innerHTML='';editorId=null;draft=null;saleId=null}
function toggleWaitingField(status){
  const el=document.getElementById('waiting-field');
  if(el)el.style.display=status==='waiting'?'':'none';
}
function syncDraft(){
  if(!draft)return;
  draft.name=document.getElementById('e-name')?.value||'';
  draft.brand=document.getElementById('e-brand')?.value||'';
  draft.model=document.getElementById('e-model')?.value||'';
  draft.serial=document.getElementById('e-serial')?.value||'';
  draft.condition=document.getElementById('e-condition')?.value||'';
  draft.status=document.getElementById('e-status')?.value||'inbox';
  draft.purchaseCost=document.getElementById('e-purchase')?.value||'';
  draft.acquired=document.getElementById('e-acquired')?.value||today();
  draft.expectedSale=document.getElementById('e-sale')?.value||'';
  draft.laborHours=document.getElementById('e-hours')?.value||'';
  draft.laborRate=document.getElementById('e-rate')?.value||'';
  draft.saleFees=document.getElementById('e-fees')?.value||'';
  draft.waitingFor=document.getElementById('e-waiting')?.value||'';
  draft.notes=document.getElementById('e-notes')?.value||'';
  draft.updatedAt=nowISO();
}
function editorEconomics(){
  const inv=investment(draft), p=expectedProfit(draft);
  return `<div class="econ">
    <div class="box"><div class="k">Investment</div><div class="v">${money(inv)}</div></div>
    <div class="box"><div class="k">Expected Sale</div><div class="v">${money(draft.expectedSale)}</div></div>
    <div class="box"><div class="k">Expected Profit</div><div class="v ${p>=0?'ok':'bad'}">${moneySigned(p)}</div></div>
    <div class="box"><div class="k">ROI</div><div class="v">${roi(p,inv).toFixed(1)}%</div></div>
    <div class="box"><div class="k">Labor</div><div class="v">${money(laborCost(draft))}</div></div>
  </div>`;
}
function renderEditor(){
  if(!draft)return;
  const overlay=document.getElementById('overlay');
  overlay.style.display='flex';
  overlay.innerHTML=`<div class="modal" onclick="event.stopPropagation()">
    <div class="modal-head"><h2>${editorId?'Edit device':'New device'}</h2><button class="close" onclick="closeModal()">×</button></div>
    <div class="form-grid">
      <div><label>Name</label><input class="input" id="e-name" value="${esc(draft.name)}" placeholder="Phone 14 Pro"></div>
      <div><label>Status</label><select class="input" id="e-status" onchange="toggleWaitingField(this.value)">${STATUSES.map(s=>`<option value="${s.id}" ${draft.status===s.id?'selected':''}>${s.label}</option>`).join('')}</select></div>
      <div><label>Brand</label><input class="input" id="e-brand" value="${esc(draft.brand)}" placeholder="Apple"></div>
      <div><label>Model</label><input class="input" id="e-model" value="${esc(draft.model)}" placeholder="iPhone 14 Pro"></div>
      <div><label>Serial / IMEI</label><input class="input" id="e-serial" value="${esc(draft.serial)}"></div>
      <div><label>Condition</label><input class="input" id="e-condition" value="${esc(draft.condition)}" placeholder="Good"></div>
      <div><label>Purchase Cost</label><input class="input" id="e-purchase" type="number" step="0.01" value="${esc(draft.purchaseCost)}"></div>
      <div><label>Acquired</label><input class="input" id="e-acquired" type="date" value="${esc(draft.acquired)}"></div>
      <div><label>Expected Sale Price</label><input class="input" id="e-sale" type="number" step="0.01" value="${esc(draft.expectedSale)}"></div>
      <div><label>Sale Fees</label><input class="input" id="e-fees" type="number" step="0.01" value="${esc(draft.saleFees)}" placeholder="0"></div>
      <div><label>Labor Hours</label><input class="input" id="e-hours" type="number" step="0.1" min="0" value="${esc(draft.laborHours)}"></div>
      <div><label>Labor Rate / Hour</label><input class="input" id="e-rate" type="number" step="0.01" min="0" value="${esc(draft.laborRate)}" placeholder="${state.settings.laborRate}"></div>
      <div class="full" id="waiting-field" style="${draft.status==='waiting'?'':'display:none'}"><label>Waiting For</label><input class="input" id="e-waiting" value="${esc(draft.waitingFor)}" placeholder="Back glass, battery, supplier…"></div>
    </div>
    ${editorEconomics()}
    <div class="form-section">
      <h4>Repair / Part Costs</h4>
      <div class="list">${(draft.parts||[]).map((p,i)=>`<div class="row-item">
        <input class="input" value="${esc(p.name)}" oninput="syncPart(${i},'name',this.value)">
        <input class="input" type="number" step="0.01" value="${esc(p.cost)}" oninput="syncPart(${i},'cost',this.value)">
        <button class="btn small" onclick="removePart(${i})">Remove</button>
      </div>`).join('')||'<div class="empty" style="padding:10px 0">No repair costs yet.</div>'}</div>
      <div class="list-add"><input class="input" id="new-part-name" placeholder="e.g. Back glass"><input class="input" id="new-part-cost" type="number" step="0.01" placeholder="33"><button class="btn" onclick="addPart()">Add</button></div>
    </div>
    <div class="form-section">
      <h4>Repair Checklist</h4>
      <div class="list">${(draft.checklist||[]).map((c,i)=>`<div class="row-item check ${c.done?'done':''}">
        <input type="checkbox" ${c.done?'checked':''} onchange="toggleCheck(${i},this.checked)">
        <input class="input" value="${esc(c.text)}" oninput="syncCheck(${i},this.value)">
        <button class="btn small" onclick="removeCheck(${i})">Remove</button>
      </div>`).join('')||'<div class="empty" style="padding:10px 0">No checklist items yet.</div>'}</div>
      <div class="list-add" style="grid-template-columns:1fr auto"><input class="input" id="new-check" placeholder="e.g. Test cameras"><button class="btn" onclick="addCheck()">Add</button></div>
    </div>
    <div class="form-section">
      <h4>Scenarios — compare repair paths</h4>
      <div>${(draft.scenarios||[]).map((s,i)=>scenarioHTML(s,i)).join('')||'<div class="empty" style="padding:10px 0">Add a scenario such as “Back glass only”, “Back glass + bezels”, or “Full refurb”.</div>'}</div>
      <div class="scenario-add">
        <input class="input" id="sc-name" placeholder="Scenario name">
        <input class="input" id="sc-sale" type="number" step="0.01" placeholder="Expected sale">
        <select class="input" id="sc-risk"><option>Low</option><option>Medium</option><option>High</option></select>
        <input class="input" id="sc-hours" type="number" step="0.1" min="0" placeholder="Hours">
      </div>
      <textarea class="input" id="sc-items" style="margin-top:6px;min-height:66px" placeholder="One repair per line: Back glass | 33&#10;Bezels | 20&#10;Battery | 40"></textarea>
      <div class="two" style="margin-top:6px"><button class="btn small" onclick="addScenario()">Add scenario</button><span class="helper">Scenario investment = purchase + repair parts + labor. ROI = profit ÷ investment.</span></div>
    </div>
    <div class="form-section">
      <h4>Notes</h4>
      <textarea class="input" id="e-notes" placeholder="Condition notes, sourcing notes, sales notes…">${esc(draft.notes)}</textarea>
    </div>
    <div class="modal-foot">
      <div class="two">${editorId?'<button class="btn" onclick="deleteDevice()">Delete device</button>':''}<button class="btn" onclick="addDeviceNote()">Add activity note</button></div>
      <div class="two"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveDevice()">Save device</button></div>
    </div>
  </div>`;
  document.getElementById('overlay').onclick=closeModal;
}
function scenarioHTML(s,i){
  const parts=(s.items||[]).reduce((a,x)=>a+num(x.cost),0);
  const inv=num(draft.purchaseCost)+parts+num(s.hours)*(draft.laborRate===''?num(state.settings.laborRate):num(draft.laborRate));
  const p=num(s.expectedSale)-inv;
  return `<div class="scenario">
    <div class="scenario-top"><div><strong>${esc(s.name||'Scenario')}</strong><div class="meta">${(s.items||[]).map(x=>esc(x.name)+' '+money(x.cost)).join(' · ')||'No repair costs'}</div></div>
      <div class="actions"><button class="btn small" onclick="useScenario(${i})">Use plan</button><button class="btn small" onclick="removeScenario(${i})">Delete</button></div></div>
    <div class="scenario-grid">
      <div><div class="k">Sale</div><div class="v">${money(s.expectedSale)}</div></div>
      <div><div class="k">Investment</div><div class="v">${money(inv)}</div></div>
      <div><div class="k">Profit</div><div class="v ${p>=0?'ok':'bad'}">${moneySigned(p)}</div></div>
      <div><div class="k">ROI / Risk</div><div class="v">${roi(p,inv).toFixed(1)}% · ${esc(s.risk||'Medium')}</div></div>
    </div>
  </div>`;
}
function updateAndRenderEditor(){syncDraft();renderEditor()}

function syncPart(i,k,v){draft.parts[i][k]=v;draft.updatedAt=nowISO();renderEconomicsOnly()}
function renderEconomicsOnly(){
  const modal=document.querySelector('.modal'); if(!modal)return;
  const econ=modal.querySelector('.econ');
  if(econ)econ.outerHTML=editorEconomics();
}
function addPart(){
  syncDraft();
  const name=document.getElementById('new-part-name')?.value.trim();
  const cost=document.getElementById('new-part-cost')?.value;
  if(!name)return;
  draft.parts.push({id:id(),name,cost:cost||0});
  renderEditor();
}
function removePart(i){syncDraft();draft.parts.splice(i,1);renderEditor()}
function addCheck(){
  syncDraft();const v=document.getElementById('new-check')?.value.trim();if(!v)return;
  draft.checklist.push({id:id(),text:v,done:false});renderEditor();
}
function syncCheck(i,v){draft.checklist[i].text=v;draft.updatedAt=nowISO()}
function toggleCheck(i,v){syncDraft();draft.checklist[i].done=v;draft.updatedAt=nowISO();renderEditor()}
function removeCheck(i){syncDraft();draft.checklist.splice(i,1);renderEditor()}
function addScenario(){
  syncDraft();
  const name=document.getElementById('sc-name')?.value.trim()||'Scenario '+((draft.scenarios||[]).length+1);
  const sale=document.getElementById('sc-sale')?.value||0;
  const risk=document.getElementById('sc-risk')?.value||'Medium';
  const hours=document.getElementById('sc-hours')?.value||0;
  const items=parseCostLines(document.getElementById('sc-items')?.value||'');
  draft.scenarios.push({id:id(),name,expectedSale:sale,risk,hours,items});
  log(`${deviceLabel(draft)}: added scenario “${name}”`,'scenario');renderEditor();
}
function removeScenario(i){syncDraft();draft.scenarios.splice(i,1);renderEditor()}
function useScenario(i){
  syncDraft();
  const s=draft.scenarios[i];if(!s)return;
  draft.parts=(s.items||[]).map(x=>({...x,id:id()}));
  draft.expectedSale=s.expectedSale||'';
  draft.laborHours=s.hours||'';
  draft.status='repair';
  log(`${deviceLabel(draft)}: applied scenario “${s.name}”`,'scenario');
  renderEditor();
}
function addDeviceNote(){
  syncDraft();const text=prompt('Activity note');if(!text?.trim())return;
  log(`${deviceLabel(draft)} — ${text.trim()}`,'note');save();toast('Note added');
}
function addManualNote(){
  const text=prompt('Note for the activity feed');if(!text?.trim())return;
  log(text.trim(),'note');save();render();
}
function saveDevice(){
  syncDraft();
  const existing=editorId?state.devices.find(d=>d.id===editorId):null;
  const isNew=!existing;
  if(!draft.model&&!draft.name&& !draft.brand){alert('Add at least a device name or model.');return;}
  if(isNew){draft.createdAt=nowISO();draft.updatedAt=nowISO();state.devices.unshift(draft);log(`Added ${deviceLabel(draft)}`,'device')}
  else{Object.assign(existing,draft);log(`Updated ${deviceLabel(existing)}`,'device')}
  save();closeModal();render();toast(isNew?'Device added':'Device saved');
}
function deleteDevice(){
  syncDraft();
  if(!editorId)return;
  if(!confirm(`Delete ${deviceLabel(draft)}?`))return;
  const d=state.devices.find(x=>x.id===editorId);
  state.devices=state.devices.filter(x=>x.id!==editorId);
  log(`Deleted ${deviceLabel(draft)}`,'delete');
  save();closeModal();render();toast('Device deleted');
}

function openSaleModal(did){
  saleId=did;
  const d=state.devices.find(x=>x.id===did);if(!d)return;
  const ov=document.getElementById('overlay');ov.style.display='flex';
  ov.innerHTML=`<div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
    <div class="modal-head"><h2>Record sale</h2><button class="close" onclick="closeModal()">×</button></div>
    <div class="muted" style="margin-bottom:10px">${esc(deviceLabel(d))}</div>
    <div class="form-grid">
      <div><label>Actual Sale Price</label><input class="input" id="sale-amount" type="number" step="0.01" value="${esc(d.expectedSale||'')}"></div>
      <div><label>Sale Fees</label><input class="input" id="sale-fees" type="number" step="0.01" value="${esc(d.saleFees||'')}"></div>
    </div>
    <div class="econ" style="margin-top:12px">
      <div class="box"><div class="k">Investment</div><div class="v">${money(investment(d)-num(d.saleFees))}</div></div>
      <div class="box"><div class="k">Expected</div><div class="v">${money(d.expectedSale)}</div></div>
      <div class="box"><div class="k">Actual</div><div class="v" id="sale-preview">—</div></div>
      <div class="box"><div class="k">Profit</div><div class="v" id="sale-profit-preview">—</div></div>
      <div class="box"><div class="k">ROI</div><div class="v" id="sale-roi-preview">—</div></div>
    </div>
    <div class="modal-foot"><span></span><div class="two"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="confirmSale()">Mark sold</button></div></div>
  </div>`;
  const update=()=>{const price=num(document.getElementById('sale-amount')?.value),fees=num(document.getElementById('sale-fees')?.value);const base=num(d.purchaseCost)+partsCost(d)+laborCost(d)+fees;const p=price-base;document.getElementById('sale-preview').textContent=money(price);document.getElementById('sale-profit-preview').textContent=moneySigned(p);document.getElementById('sale-profit-preview').className='v '+(p>=0?'ok':'bad');document.getElementById('sale-roi-preview').textContent=base?roi(p,base).toFixed(1)+'%':'0.0%';};
  document.getElementById('sale-amount').oninput=update;document.getElementById('sale-fees').oninput=update;update();ov.onclick=closeModal;
}
function confirmSale(){
  const d=state.devices.find(x=>x.id===saleId);if(!d)return;
  const price=document.getElementById('sale-amount')?.value||'';const fees=document.getElementById('sale-fees')?.value||'';
  if(!price){alert('Enter the actual sale price.');return;}
  d.salePrice=price;d.saleFees=fees;d.status='sold';d.soldAt=today();d.updatedAt=nowISO();
  log(`Sold ${deviceLabel(d)} for ${money(price)} — profit ${moneySigned(actualProfit(d))}`,'sold');
  save();closeModal();render();toast('Sale recorded');
}

function openSettings(){
  const ov=document.getElementById('overlay');ov.style.display='flex';
  ov.innerHTML=`<div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
    <div class="modal-head"><h2>Settings</h2><button class="close" onclick="closeModal()">×</button></div>
    <div class="form-grid">
      <div><label>Currency symbol</label><input class="input" id="set-cur" value="${esc(state.settings.currency)}" placeholder="€"></div>
      <div><label>Default labor rate / hour</label><input class="input" id="set-rate" type="number" step="0.01" value="${esc(state.settings.laborRate)}"></div>
    </div>
    <div class="helper" style="margin-top:8px">These are defaults only. Each device can override labor rate when needed.</div>
    <div class="modal-foot"><div class="two"><button class="btn" onclick="clearActivity()">Clear activity</button><button class="btn" onclick="restoreLegacy()">Restore old backup</button></div><div class="two"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettings()">Save</button></div></div>
  </div>`;
  ov.onclick=closeModal;
}
function saveSettings(){
  state.settings.currency=document.getElementById('set-cur')?.value||'€';
  state.settings.laborRate=num(document.getElementById('set-rate')?.value);
  save();closeModal();render();toast('Settings saved');
}
function clearActivity(){
  if(!confirm('Clear the activity feed?'))return;
  state.activity=[];save();openSettings();render();
}
function restoreLegacy(){
  const raw=localStorage.getItem(LEGACY)||localStorage.getItem('wb_data');
  if(!raw){alert('No legacy backup found.');return}
  if(!confirm('This will replace the current simplified devices with the old Workbench repair/listing data. Continue?'))return;
  try{state.devices=migrateLegacy(JSON.parse(raw));log('Restored legacy data into the simplified board.','system');save();closeModal();render();toast('Legacy data restored')}
  catch(e){alert('Legacy backup could not be restored.')}
}

load();render();